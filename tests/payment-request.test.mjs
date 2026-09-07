// Het eerste betaalverzoek. Wat hier bewaakt wordt is niet of de mail mooi is, maar of een
// gast ooit een bevestiging kan krijgen voor een betaallink die nooit is verstuurd.
//
// Robert, 7 september 2026: tot die dag werd het betaalverzoek nergens in productie
// verstuurd — `_payment-request.mjs` werd alleen door de lokale testserver gebruikt. De
// boeking ging wél meteen in de betaalfase, en de browser zei "Payment links were sent".
import assert from "node:assert/strict";
import {after, before, beforeEach, test} from "node:test";
import http from "node:http";
import {listenOnTestPort,stopTestServer} from "./_test-server.mjs";

let server, base;
let rpcAanroepen=[];      // wat de functie naar de database stuurde
let verstuurd=[];         // wat er naar Resend zou gaan
let mailFaaltVanaf=null;  // laat de n-de mail mislukken
const nativeFetch=globalThis.fetch;

const CLAIM="11111111-1111-4111-8111-111111111111";
const DEELNEMERS=[
  {id:"aaaaaaaa-0000-4000-8000-000000000001",fullName:"TEST – Een",email:"een@example.invalid",
   amountCents:202500,paymentReference:"tav_een"},
  {id:"aaaaaaaa-0000-4000-8000-000000000002",fullName:"TEST – Twee",email:"twee@example.invalid",
   amountCents:202500,paymentReference:"tav_twee"},
  {id:"aaaaaaaa-0000-4000-8000-000000000003",fullName:"TEST – Drie",email:"drie@example.invalid",
   amountCents:202500,paymentReference:"tav_drie"}
];
const DEADLINE="2026-11-01T12:30:00.000Z";

before(async()=>{
  server=http.createServer((request,response)=>{
    let body="";request.on("data",c=>body+=c);request.on("end",()=>{
      const invoer=JSON.parse(body||"{}");
      rpcAanroepen.push({url:request.url,invoer});
      response.setHeader("content-type","application/json");
      if(request.url.endsWith("/begin_seat_hold"))
        return response.end(JSON.stringify({status:"holding",claimId:CLAIM,seats:3,remaining:3,phase:"filling"}));
      if(request.url.endsWith("/prepare_seat_hold_payment"))
        return response.end(JSON.stringify({status:"ready",claimId:CLAIM,seats:3,deadline:DEADLINE,
          weekendLabel:"Weekend 01 · 30 Oct to 2 Nov 2026",name:"TEST – Boeker",participants:DEELNEMERS}));
      if(request.url.endsWith("/confirm_seat_hold_payment"))
        return response.end(JSON.stringify({status:"in_payment",claimId:CLAIM,seats:3,
          deadline:DEADLINE,participants:3}));
      if(request.url.endsWith("/abandon_seat_hold_payment"))
        return response.end(JSON.stringify({status:"abandoned",claimId:CLAIM}));
      if(request.url.endsWith("/check_tavern_request_limit"))
        return response.end(JSON.stringify({status:"ok",allowed:true}));
      if(request.url.endsWith("/set_tavern_stay_request"))
        return response.end(JSON.stringify({status:"ok"}));
      response.statusCode=404;response.end("{}");
    });
  });
  await listenOnTestPort(server);
  base=`http://127.0.0.1:${server.address().port}`;
  globalThis.fetch=(input,options)=>{
    const url=String(input);
    if(url.startsWith(base))return nativeFetch(input,options);
    if(url.startsWith("https://api.resend.com/emails")){
      const nr=verstuurd.length+1;
      verstuurd.push({...JSON.parse(options?.body||"{}"),
        idempotencyKey:options?.headers?.["idempotency-key"]||null});
      if(mailFaaltVanaf&&nr>=mailFaaltVanaf)
        return Promise.resolve(new Response("mislukt",{status:500}));
      return Promise.resolve(new Response(JSON.stringify({id:`bericht-${nr}`}),
        {status:200,headers:{"content-type":"application/json"}}));
    }
    return Promise.reject(new Error(`test_reached_the_network: ${url}`));
  };
  process.env.SUPABASE_URL=base;
  process.env.SUPABASE_SERVICE_ROLE_KEY="test-service-key";
  process.env.RESEND_API_KEY="test-sleutel";
  process.env.TAVERN_FROM_EMAIL="tavern@example.invalid";
  process.env.URL="https://lewos.co";
  process.env.RATE_LIMIT_SECRET="test-limiet-geheim";
});
after(async()=>{globalThis.fetch=nativeFetch;await stopTestServer(server);});
beforeEach(()=>{rpcAanroepen=[];verstuurd=[];mailFaaltVanaf=null;});

const boek=async()=>{
  const {handler}=await import("../netlify/functions/seat-hold.mjs");
  return handler({httpMethod:"POST",path:"/api/hold/promote",
    headers:{"content-type":"application/json","x-forwarded-for":"127.0.0.1"},
    body:JSON.stringify({sessionToken:"t".repeat(40),name:"TEST – Boeker",
      email:"boeker@example.invalid",adultConfirmed:true,privacyAccepted:true,
      filmingAcknowledged:true,dietaryNotes:"Ana: severe peanut allergy.",
      participants:DEELNEMERS.map(d=>({name:d.fullName,email:d.email}))})});
};

test("iedere deelnemer krijgt zijn eigen betaalverzoek",async()=>{
  const uit=await boek();
  assert.equal(uit.statusCode,200);
  assert.equal(verstuurd.length,3,"niet iedereen kreeg een verzoek");
  assert.deepEqual(verstuurd.map(m=>m.to[0]).sort(),
    ["drie@example.invalid","een@example.invalid","twee@example.invalid"]);
  for(const m of verstuurd)assert.equal(m.to.length,1,"een betaalverzoek gaat naar één persoon");
});

test("iedereen krijgt alleen de eigen link en het eigen bedrag",async()=>{
  await boek();
  for(const [i,m] of verstuurd.entries()){
    const eigen=DEELNEMERS.find(d=>d.email===m.to[0]);
    const alles=JSON.stringify(m);
    assert.match(alles,new RegExp(`ref=${eigen.paymentReference}`),`${m.to[0]} kreeg niet zijn eigen link`);
    for(const ander of DEELNEMERS.filter(d=>d.email!==eigen.email))
      assert.doesNotMatch(alles,new RegExp(ander.paymentReference),
        `${m.to[0]} kreeg ook de link van ${ander.email}`);
    assert.match(alles,/2,025\.00/,`bedrag ontbreekt in bericht ${i+1}`);
  }
});

test("het groepstotaal staat niet in de betaalmail",async()=>{
  await boek();
  const totaal=(202500*3/100).toLocaleString("en-IE",{minimumFractionDigits:2}); // 6,075.00
  for(const m of verstuurd){
    assert.doesNotMatch(JSON.stringify(m),new RegExp(totaal.replace(".","\\.")),
      "het groepstotaal reist mee in een betaalverzoek");
    assert.match(JSON.stringify(m),/not the group total/,"de mail zegt niet dat dit het eigen aandeel is");
  }
});

test("allergieën en dieetwensen komen niet in een betaalverzoek",async()=>{
  await boek();
  for(const m of verstuurd)
    assert.doesNotMatch(JSON.stringify(m),/peanut|allerg|vegetarian|epipen|dietary/i,
      "een dieetgegeven reist mee in een betaalverzoek");
});

test("iedereen krijgt dezelfde betaaltermijn",async()=>{
  await boek();
  const termijnen=new Set(verstuurd.map(m=>(String(m.text).match(/Payment deadline:\s*\n\s*(.+)/)||[])[1]));
  assert.equal(termijnen.size,1,`${termijnen.size} verschillende termijnen in de mails`);
});

test("de betaalfase wordt pas vastgelegd nadat alle verzoeken eruit zijn",async()=>{
  await boek();
  const volgorde=rpcAanroepen.map(a=>a.url.split("/").pop());
  const voorbereid=volgorde.indexOf("prepare_seat_hold_payment");
  const bevestigd=volgorde.indexOf("confirm_seat_hold_payment");
  assert.ok(voorbereid>=0&&bevestigd>voorbereid,"bevestigen kwam niet ná voorbereiden");
  const bevestiging=rpcAanroepen.find(a=>a.url.endsWith("/confirm_seat_hold_payment"));
  assert.equal(bevestiging.invoer.p_sent.length,3,"niet alle drie de verzendingen werden gemeld");
});

test("mislukt één verzending, dan komt er geen bevestiging",async()=>{
  mailFaaltVanaf=3;   // de derde mail gaat mis
  const uit=await boek();
  assert.equal(uit.statusCode,502);
  const body=JSON.parse(uit.body);
  assert.equal(body.error,"payment_requests_not_sent");
  assert.match(body.message,/nothing has been confirmed/i);
  assert.equal(rpcAanroepen.some(a=>a.url.endsWith("/confirm_seat_hold_payment")),false,
    "de boeking werd toch in de betaalfase gezet");
  assert.equal(rpcAanroepen.some(a=>a.url.endsWith("/abandon_seat_hold_payment")),true,
    "de half afgemaakte boeking werd niet teruggedraaid");
});

test("de idempotentiesleutel hangt aan de deelnemer, niet aan het moment",async()=>{
  await boek();
  const sleutels=verstuurd.map(m=>m.idempotencyKey);
  assert.deepEqual(sleutels,DEELNEMERS.map(d=>`payment-request-${d.id}`));
  for(const s of sleutels)assert.doesNotMatch(s,/\d{13}/,"de sleutel bevat een tijdstempel");
  // Een tweede poging levert dezelfde sleutels op, dus bij de provider één bericht.
  const eerste=[...sleutels];
  verstuurd=[];
  await boek();
  assert.deepEqual(verstuurd.map(m=>m.idempotencyKey),eerste);
});

test("een boeking die al in de betaalfase staat stuurt niets opnieuw",async()=>{
  const {handler}=await import("../netlify/functions/seat-hold.mjs");
  // De database meldt `already_in_payment`; dan hoort er geen mail meer uit te gaan.
  const echteServer=server;
  const uit=await (async()=>{
    const oudeFetch=globalThis.fetch;
    globalThis.fetch=(input,options)=>{
      const url=String(input);
      if(url.endsWith("/prepare_seat_hold_payment"))
        return Promise.resolve(new Response(JSON.stringify({status:"already_in_payment",claimId:CLAIM,seats:3}),
          {status:200,headers:{"content-type":"application/json"}}));
      return oudeFetch(input,options);
    };
    try{return await handler({httpMethod:"POST",path:"/api/hold/promote",
      headers:{"content-type":"application/json","x-forwarded-for":"127.0.0.1"},
      body:JSON.stringify({sessionToken:"t".repeat(40),name:"TEST – Boeker",
        email:"boeker@example.invalid",adultConfirmed:true,privacyAccepted:true,
        filmingAcknowledged:true,participants:DEELNEMERS.map(d=>({name:d.fullName,email:d.email}))})});}
    finally{globalThis.fetch=oudeFetch;}
  })();
  assert.equal(uit.statusCode,200);
  assert.equal(verstuurd.length,0,"er ging een tweede ronde betaalverzoeken uit");
  assert.ok(echteServer);
});
