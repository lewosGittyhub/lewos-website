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

// Deze test roept echte functies aan. Sinds 7 september 2026 weigert elke omgeving die
// niet verklaart wat hij is — zie netlify/functions/_deploy-context.mjs. Een testrun is
// een omgeving met eigen instellingen, dus die verklaart zich hier als zodanig.
process.env.LEWOS_PREVIEW_SAFE="true";

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
  process.env.RATE_LIMIT_SECRET="test-limiet-geheim";
  // De betaalpoort. `paymentsAreEnabled()` laat een testomgeving alleen door als NODE_ENV
  // op "test" staat én URL naar localhost wijst — daarom staan ze hier allebei. In
  // productie kan deze combinatie niet ontstaan.
  process.env.NODE_ENV="test";
  process.env.URL="http://127.0.0.1";
  process.env.TAVERN_PAYMENTS_ENABLED="true";
  process.env.BOOKING_TERMS_VERSION="test-voorwaarden-1";
  process.env.PUBLIC_BOOKING_OPENS_AT="2026-01-01T00:00:00Z";
  process.env.BOOKING_TERMS_DOCUMENT_URL="http://127.0.0.1/voorwaarden.pdf";
  process.env.TRAVEL_INFORMATION_DOCUMENT_URL="http://127.0.0.1/reisinformatie.pdf";
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


test("staat de betaalpoort dicht, dan wordt er niets geboekt en niets verstuurd",async()=>{
  // Harde grens 1: geen definitieve boekingen zolang de reisbureauregistratie niet rond is.
  // Tot 7 september 2026 kende deze functie die grens niet.
  const eerder=process.env.TAVERN_PAYMENTS_ENABLED;
  process.env.TAVERN_PAYMENTS_ENABLED="false";
  rpcAanroepen=[];verstuurd=[];
  const uit=await boek();
  process.env.TAVERN_PAYMENTS_ENABLED=eerder;
  assert.equal(uit.statusCode,503);
  assert.equal(JSON.parse(uit.body).error,"booking_not_open");
  assert.equal(verstuurd.length,0,"er ging een betaalverzoek uit terwijl de poort dicht staat");
  assert.equal(rpcAanroepen.some(a=>a.url.endsWith("/prepare_seat_hold_payment")),false,
    "er werd een boeking voorbereid terwijl de poort dicht staat");
});

test("de melding zegt dat er niets is afgeschreven",async()=>{
  const eerder=process.env.TAVERN_PAYMENTS_ENABLED;
  process.env.TAVERN_PAYMENTS_ENABLED="false";
  const {message}=JSON.parse((await boek()).body);
  process.env.TAVERN_PAYMENTS_ENABLED=eerder;
  assert.match(message,/not charged/i);
  assert.match(message,/nothing has been confirmed/i);
});

test("vóór het openingsmoment wordt er niets geboekt, ook als de betaalvariabelen staan",async()=>{
  // 11 september 2026: seat-hold keek alleen naar de betaalvariabelen, niet naar
  // PUBLIC_BOOKING_OPENS_AT. Een eigen verzoek kon dan vóór de opening boeken.
  const eerder=process.env.PUBLIC_BOOKING_OPENS_AT;
  process.env.PUBLIC_BOOKING_OPENS_AT="2099-01-01T00:00:00Z";
  rpcAanroepen=[];verstuurd=[];
  const uit=await boek();
  process.env.PUBLIC_BOOKING_OPENS_AT=eerder;
  assert.equal(uit.statusCode,503);
  assert.equal(JSON.parse(uit.body).error,"booking_not_open");
  assert.equal(verstuurd.length,0);
  assert.equal(rpcAanroepen.some(a=>a.url.endsWith("/prepare_seat_hold_payment")),false);
});

// ── De knop ──────────────────────────────────────────────────────────────────
// Robert, 10 september 2026: hij las de proefmail en moest vragen hóe hij betaalde. De
// knop stond onder vijf feiten die hij al wist. Deze tests houden de ordening vast.
import {buildPaymentRequestEmail} from "../netlify/functions/_payment-request.mjs";

const proefmail=(overschrijf={})=>buildPaymentRequestEmail({
  participant:{full_name:"TEST – Bram",email:"bram@example.invalid",amount_cents:202500},
  booking:{name:"TEST – Anna",weekendLabel:"The Halloween Table · 30 Oct to 2 Nov 2026",seats:4},
  deadline:"2026-11-01T12:30:00.000Z",
  paymentUrl:"https://lewos.co/tavern/pay/?ref=tav_test",
  ...overschrijf});

test("de betaalknop staat vóór de feiten, niet erna",()=>{
  const {html}=proefmail();
  const knop=html.indexOf("Pay your share —");
  const feiten=html.indexOf("Your payment:");
  assert.ok(knop>-1,"er hoort een knop te zijn");
  assert.ok(feiten>-1,"de feiten horen er ook te staan");
  assert.ok(knop<feiten,"de knop hoort boven de feiten te staan: daar komt de gast voor");
});

test("het is een echte knop en niet een linkje",()=>{
  const {html}=proefmail();
  // display:block met padding maakt de hele cel klikbaar. Een inline-block van 14px padding
  // is geen knop maar een tekstlink met kleur.
  assert.match(html,/display:block/);
  assert.match(html,/padding:22px/);
  assert.match(html,/text-align:center/);
  assert.match(html,/font-size:20px/);
  assert.match(html,/font-weight:bold/);
});

test("de knop overleeft een mailprogramma dat CSS opschoont",()=>{
  // Robert, 10 september 2026: in Gmail was de knop leeg -- de ruimte stond er, de kleur
  // niet. De opmaak gebruikte de CSS-verkortingen `background:` en `font:`, en de opschoner
  // van Gmail haalt die eruit. De witte tekstkleur bleef, de oranje achtergrond verdween,
  // en dan is een knop wit op wit.
  //
  // Twee eisen houden dat tegen. Ten eerste het HTML-attribuut `bgcolor`: dat is geen CSS
  // en wordt door geen enkele opschoner weggegooid, dus valt de CSS weg dan blijft de kleur.
  // Ten tweede: geen verkortingen meer, alles los uitgeschreven.
  const {html}=proefmail();
  assert.match(html,/<td bgcolor="#E5643A"/,
    "de knop hoort in een cel met bgcolor te staan, want dat attribuut overleeft alles");
  assert.match(html,/background-color:#E5643A/,"en met background-color in de CSS ernaast");
  assert.ok(!/background:#/.test(html),
    "geen `background:`-verkorting: Gmail gooit die eruit en dan verdwijnt de knop");
  assert.ok(!/font:\s*\d/.test(html),
    "geen `font:`-verkorting: los uitschrijven, anders valt de hele opmaak weg");
});

test("het bedrag staat op de knop, zodat niemand blind klikt",()=>{
  const {html,subject}=proefmail();
  assert.match(html,/Pay your share — €2,025\.00/);
  assert.match(subject,/€2,025\.00/,"en ook in de onderwerpregel");
});

test("een leesbare link eronder, voor een mailprogramma dat de opmaak wegstript",()=>{
  const {html}=proefmail();
  assert.match(html,/If the button does not work/);
  // De link moet twee keer voorkomen: op de knop en als leesbare tekst.
  assert.equal((html.match(/tav_test/g)||[]).length,3,
    "de link hoort op de knop, in de fallback-href en als leesbare tekst te staan");
});

test("ook in de kale tekstversie staat de link vóór de feiten",()=>{
  const {text}=proefmail();
  const link=text.indexOf("Pay your share here:");
  const feiten=text.indexOf("Your payment:");
  assert.ok(link>-1&&feiten>-1);
  assert.ok(link<feiten,"wie geen opmaak ziet, hoort de link ook eerst te lezen");
});

test("een herinnering draagt dezelfde knop en hetzelfde bedrag",()=>{
  const eerste=proefmail();
  const herinnering=proefmail({reminder:true});
  assert.notEqual(eerste.subject,herinnering.subject,"de toon mag verschillen");
  for(const stuk of ["Pay your share — €2,025.00","display:block","tav_test"]){
    assert.ok(herinnering.html.includes(stuk),`${stuk} hoort ook in de herinnering te staan`);
  }
});

// ── De termijn voor iemand die niet in Spanje zit ────────────────────────────────
// Robert, 10 september 2026: "hoe doen we dit als iemand uit Amerika boekt?" Dezelfde 15:02
// in Madrid is 09:02 in New York, 06:02 in Los Angeles en 03:02 op Hawaii. Wie alleen een
// Spaanse tijd te zien krijgt moet zelf gaan rekenen terwijl er een termijn loopt.
//
// De verdeling: de mail weet niet waar hij gelezen wordt, dus zet hij Spaanse tijd én UTC.
// De betaalpagina weet het wel -- die staat in de browser -- en zet de eigen klok van de
// bezoeker bovenaan.

test("de betaalmail zet de termijn ook in UTC, want een mail kent geen tijdzone",()=>{
  const {html,text}=proefmail({deadline:"2026-09-10T13:02:00.000Z"});
  for(const inhoud of [html,text]){
    assert.match(inhoud,/15:02 in Spain/,"de Spaanse tijd blijft de tijd van de groep");
    assert.match(inhoud,/13:02 UTC/,"met UTC ernaast is het van elke tijdzone af te leiden");
  }
  // Nooit een tijd zonder te zeggen welke klok het is: "15:02" alleen is voor een Amerikaan
  // geen informatie maar een valstrik.
  assert.ok(!/\b15:02(?![^<]*(?:in Spain|Europe\/Madrid))/.test(text.replace(/\n/g," ")),
    "elke Spaanse tijd hoort als Spaanse tijd benoemd te staan");
});

test("de mail wijst naar de pagina voor de eigen tijdzone",()=>{
  const {html,text}=proefmail();
  for(const inhoud of [html,text]){
    assert.match(inhoud,/shows it in your own time zone/,
      "de gast hoort te weten waar hij zijn eigen tijd kan zien");
  }
});

test("de betaalpagina zet de eigen klok van de bezoeker boven de Spaanse",async()=>{
  const {deadlineLines:termijnRegels}=await import("../assets/deadline.js");
  const iso="2026-09-10T13:02:00.000Z";

  // Iemand in New York: eigen tijd eerst, Spaanse tijd eronder als het gezamenlijke moment.
  const newYork=termijnRegels(iso,"America/New_York");
  assert.equal(newYork.length,2);
  assert.match(newYork[0],/09:02/,"de eigen klok hoort bovenaan te staan");
  assert.match(newYork[0],/your time \(America\/New York\)/,"met de zone erbij, zonder underscore");
  assert.match(newYork[1],/15:02 in Spain/);
  assert.match(newYork[1],/same moment for everyone in your group/,
    "en de reden dat die tweede regel er staat");

  // Hawaii is de scherpste: dezelfde termijn valt daar midden in de nacht.
  assert.match(termijnRegels(iso,"Pacific/Honolulu")[0],/03:02/);

  // Wie zelf in Spanje zit krijgt één regel. Twee keer dezelfde tijd is geen informatie.
  const madrid=termijnRegels(iso,"Europe/Madrid");
  assert.equal(madrid.length,1);
  assert.match(madrid[0],/15:02 \(Europe\/Madrid\)/);

  // Een andere zonenaam met dezelfde klok ook niet: het gaat om de tijd die iemand ziet.
  assert.deepEqual(termijnRegels(iso,"Europe/Amsterdam"),madrid);

  // Geen tijdzone bekend, of een onbruikbare: terugvallen op de Spaanse tijd is nooit fout.
  assert.deepEqual(termijnRegels(iso,""),madrid);
  assert.deepEqual(termijnRegels(iso,"Niet/EenZone"),madrid);

  // Een onleesbare termijn levert geen regel op, in plaats van "Invalid Date".
  assert.deepEqual(termijnRegels("morgen","America/New_York"),[]);
});
