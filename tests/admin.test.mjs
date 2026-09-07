// De beheeromgeving. Wat hier bewaakt wordt is niet of de kalender mooi is, maar of er
// niemand binnenkomt die er niet hoort — en of het maandoverzicht geen gezondheidsgegevens
// meedraagt.
import assert from "node:assert/strict";
import {after, before, beforeEach, test} from "node:test";
import {createHmac} from "node:crypto";
import http from "node:http";
import {listenOnTestPort,stopTestServer} from "./_test-server.mjs";

const GEHEIM="een-lang-genoeg-testgeheim-voor-hs256";
const b64=v=>Buffer.from(v).toString("base64url");
const token=(claims,geheim=GEHEIM,alg="HS256")=>{
  const kop=b64(JSON.stringify({alg,typ:"JWT"}));
  const inhoud=b64(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600,email_verified:true,...claims}));
  if(alg==="none")return `${kop}.${inhoud}.`;
  return `${kop}.${inhoud}.${createHmac("sha256",geheim).update(`${kop}.${inhoud}`).digest("base64url")}`;
};

let rpcAanroepen=[];let server;let base;
const nativeFetch=globalThis.fetch;

const ADMIN="lewos.co@gmail.com";
const NADINE="accommodatie@example.invalid";
const DB_ADMINS=[ADMIN,NADINE];

const ZONDER_TERMIJN="00000000-0000-4000-8000-00000000dead";
const ZONDER_LINK="00000000-0000-4000-8000-00000000face";
const GEWOON="00000000-0000-4000-8000-00000000beef";

// Wat er naar Resend zou gaan. De verzending zelf wordt onderschept; er gaat niets weg.
let verstuurdeMail=[];

before(async()=>{
  server=http.createServer((request,response)=>{
    let body="";request.on("data",c=>body+=c);request.on("end",()=>{
      const invoer=JSON.parse(body||"{}");
      rpcAanroepen.push({url:request.url,invoer});
      response.setHeader("content-type","application/json");
      // De database controleert het adres zelf, los van de functie.
      if(!DB_ADMINS.includes(String(invoer.p_email||"").toLowerCase())){
        response.statusCode=400;return response.end(JSON.stringify({message:"not_an_administrator"}));
      }
      if(request.url.endsWith("/admin_bookings_in_range"))return response.end(JSON.stringify({
        from:invoer.p_from,to:invoer.p_to,
        bookings:[{claimId:"claim-0001",name:"TEST – Group",seats:4,status:"payment_pending",
          arrival:"2026-10-30",departure:"2026-11-02",weekendSlug:"weekend-01",
          weekendLabel:"Weekend 01 · 30 Oct to 2 Nov 2026",hasExtraNights:true,
          extraNightsStatus:"requested",requestedArrival:"2026-10-28",requestedDeparture:"2026-11-03",
          payment:{state:"partially_paid",participantsTotal:4,participantsPaid:2,participantsDue:4}}]}));
      if(request.url.endsWith("/admin_booking_detail"))return response.end(JSON.stringify(
        invoer.p_claim_id==="claim-0001"
          ?{claimId:"claim-0001",name:"TEST – Group",seats:4,
            dietaryNotes:"Peanuts - severe, carries an EpiPen. One vegetarian.",
            arrival:"2026-10-30",departure:"2026-11-02",weekendStart:"2026-10-30",weekendEnd:"2026-11-02",
            extraNightsStatus:"requested",requestedArrival:"2026-10-28",requestedDeparture:"2026-11-03",
            payment:{state:"partially_paid",participantsTotal:4,participantsPaid:2,participantsDue:4},
            participants:[{name:"A",email:"a@example.invalid",amountCents:202500,status:"paid"}],
            messages:[{kind:"confirmation",label:"Booking confirmation (guest)",sentAt:null,state:"example"}]}
          :{status:"not_found"}));
      if(request.url.endsWith("/admin_decide_extra_nights")){
        if(invoer.p_claim_id!=="claim-0001")return response.end(JSON.stringify({status:"not_found"}));
        if(invoer.p_decision==="confirmed"&&invoer.p_arrival==="2026-10-20")
          {response.statusCode=400;return response.end(JSON.stringify({message:"stay_more_than_requested"}));}
        return response.end(JSON.stringify({status:"ok",claimId:invoer.p_claim_id,decision:invoer.p_decision,
          confirmedArrival:invoer.p_arrival,confirmedDeparture:invoer.p_departure}));
      }
      if(request.url.endsWith("/admin_reminder_payload")){
        if(invoer.p_participant_id===ZONDER_TERMIJN)
          return response.end(JSON.stringify({status:"no_deadline",participantId:invoer.p_participant_id}));
        if(invoer.p_participant_id===ZONDER_LINK)
          return response.end(JSON.stringify({status:"no_payment_link",participantId:invoer.p_participant_id}));
        return response.end(JSON.stringify({status:"ready",participantId:invoer.p_participant_id,
          participant:{full_name:"TEST – Gast",email:"gast@example.invalid",amount_cents:202500},
          booking:{name:"TEST – Group",seats:4,weekendLabel:"Weekend 01 · 30 Oct to 2 Nov 2026"},
          deadline:"2026-11-01T12:00:00.000Z",
          paymentUrl:"https://example.invalid/pay/test",
          lastSentAt:null}));
      }
      if(request.url.endsWith("/admin_remind_participant")){
        // Een deelnemer zonder betaaltermijn. De database meldt dat als eigen uitkomst en
        // legt géén herinnering vast — er is er ook geen verstuurd.
        if(invoer.p_participant_id==="00000000-0000-4000-8000-00000000dead")
          return response.end(JSON.stringify({status:"no_deadline",participantId:invoer.p_participant_id}));
        return response.end(JSON.stringify({status:"reminded",participantId:invoer.p_participant_id}));
      }
      response.statusCode=404;response.end("{}");
    });
  });
  await listenOnTestPort(server);
  base=`http://127.0.0.1:${server.address().port}`;
  globalThis.fetch=(input,options)=>{
    const url=String(input);
    if(url.startsWith(base))return nativeFetch(input,options);
    // Resend wordt onderschept, niet gebeld. Zo loopt de hele keten — opbouwen, payload,
    // verzenden, vastleggen — zonder dat er ooit een bericht de deur uit gaat.
    if(url.startsWith("https://api.resend.com/emails")){
      verstuurdeMail.push({...JSON.parse(options?.body||"{}"),
        idempotencyKey:options?.headers?.["idempotency-key"]||null});
      return Promise.resolve(new Response(JSON.stringify({id:"test-bericht-1"}),
        {status:200,headers:{"content-type":"application/json"}}));
    }
    return Promise.reject(new Error(`test_reached_the_network: ${url}`));
  };
  process.env.RESEND_API_KEY="test-sleutel";
  process.env.TAVERN_FROM_EMAIL="tavern@example.invalid";
  process.env.SUPABASE_URL=base;
  process.env.SUPABASE_SERVICE_ROLE_KEY="test-service-key";
  process.env.SUPABASE_JWT_SECRET=GEHEIM;
  process.env.LEWOS_ADMIN_EMAILS=`${ADMIN},${NADINE}`;
});
beforeEach(()=>{rpcAanroepen=[];process.env.LEWOS_ADMIN_EMAILS=`${ADMIN},${NADINE}`;process.env.SUPABASE_JWT_SECRET=GEHEIM;});
after(async()=>{globalThis.fetch=nativeFetch;await stopTestServer(server);server=null;});

const vraag=async(headers={},pad="/api/admin/bookings",query={from:"2026-10-01",to:"2026-11-30"})=>{
  const {handler}=await import("../netlify/functions/admin-bookings.mjs");
  return handler({httpMethod:"GET",path:pad,headers,queryStringParameters:query});
};
const alsAdmin=email=>({authorization:`Bearer ${token({email})}`});

// ── Wie er niet in mag ──────────────────────────────────────────────────────

test("zonder token komt er niets naar buiten",async()=>{
  const r=await vraag();
  assert.equal(r.statusCode,401);
  assert.equal(JSON.parse(r.body).error,"no_token");
  assert.equal(rpcAanroepen.length,0,"er is toch met de database gepraat");
});

test("een zelfgemaakt token met alg:none wordt geweigerd",async()=>{
  const r=await vraag({authorization:`Bearer ${token({email:ADMIN},null,"none")}`});
  assert.equal(r.statusCode,401);
  assert.equal(rpcAanroepen.length,0);
});

test("een token met een verkeerde handtekening wordt geweigerd",async()=>{
  const r=await vraag({authorization:`Bearer ${token({email:ADMIN},"een-ander-geheim")}`});
  assert.equal(r.statusCode,401);
  assert.equal(JSON.parse(r.body).error,"invalid_token");
  assert.equal(rpcAanroepen.length,0);
});

test("een verlopen token wordt geweigerd",async()=>{
  const r=await vraag({authorization:`Bearer ${token({email:ADMIN,exp:Math.floor(Date.now()/1000)-10})}`});
  assert.equal(r.statusCode,401);
  assert.equal(JSON.parse(r.body).error,"token_expired");
});

test("ingelogd zijn is niet genoeg: een adres buiten de lijst krijgt 403",async()=>{
  const r=await vraag(alsAdmin("someone.else@gmail.com"));
  assert.equal(r.statusCode,403);
  assert.equal(JSON.parse(r.body).error,"not_an_administrator");
  assert.equal(rpcAanroepen.length,0,"de functie had de database niet mogen bevragen");
});

test("een niet-bevestigd adres telt niet als identiteit",async()=>{
  const r=await vraag({authorization:`Bearer ${token({email:ADMIN,email_verified:false})}`});
  assert.equal(r.statusCode,403);
});

test("het detail is net zo dicht als het overzicht",async()=>{
  for(const headers of [{},alsAdmin("someone.else@gmail.com")]){
    const r=await vraag(headers,"/api/admin/bookings/claim-0001",{});
    assert.ok([401,403].includes(r.statusCode),`detail gaf ${r.statusCode}`);
  }
  assert.equal(rpcAanroepen.length,0);
});

test("de database weigert zelfstandig, ook als de functielijst te ruim staat",async()=>{
  // Twee onafhankelijke sloten. Zou de omgevingsvariabele ooit verkeerd staan, dan geeft
  // de database nog steeds niets prijs.
  process.env.LEWOS_ADMIN_EMAILS="iemand.anders@example.invalid";
  const r=await vraag(alsAdmin("iemand.anders@example.invalid"));
  assert.equal(r.statusCode,403);
  assert.equal(JSON.parse(r.body).error,"not_an_administrator");
  assert.equal(rpcAanroepen.length,1,"de database is niet geraadpleegd");
});

test("zonder ingestelde lijst gaat de deur op slot, niet open",async()=>{
  delete process.env.LEWOS_ADMIN_EMAILS;
  const r=await vraag(alsAdmin(ADMIN));
  assert.equal(r.statusCode,503);
  assert.equal(JSON.parse(r.body).error,"admin_not_configured");
});

// ── Wie er wel in mag ───────────────────────────────────────────────────────

test("beide toegestane adressen komen binnen",async()=>{
  for(const email of [ADMIN,NADINE]){
    const r=await vraag(alsAdmin(email));
    assert.equal(r.statusCode,200,`${email} kwam er niet in`);
    assert.equal(JSON.parse(r.body).bookings.length,1);
  }
  // Het adres uit het token gaat mee naar de database, niet iets uit de aanvraag.
  assert.deepEqual(rpcAanroepen.map(a=>a.invoer.p_email),[ADMIN,NADINE]);
});

test("het maandoverzicht draagt geen allergieën of dieetwensen",async()=>{
  const r=await vraag(alsAdmin(ADMIN));
  const ruw=r.body.toLowerCase();
  for(const woord of ["peanut","vegetarian","epipen","allergie","allergies","dietary"])
    assert.equal(ruw.includes(woord),false,`"${woord}" staat in het maandoverzicht`);
});

test("het detail draagt ze wél, want dat is de beveiligde plek",async()=>{
  const r=await vraag(alsAdmin(ADMIN),"/api/admin/bookings/claim-0001",{});
  const d=JSON.parse(r.body);
  // Eén veld sinds 5 september 2026, en dit blijft de enige plek waar het uit de
  // database komt: achter de beheercontrole, nooit in het maandoverzicht.
  assert.equal(d.dietaryNotes,"Peanuts - severe, carries an EpiPen. One vegetarian.");
  assert.equal(d.allergies,undefined,"het oude losse veld komt er nog naast — dan staat een allergie twee keer");
  assert.equal(d.payment.participantsPaid,2);
  assert.equal(d.payment.participantsTotal,4);
});

test("een onbekende boeking geeft 404 en geen gegevens",async()=>{
  const r=await vraag(alsAdmin(ADMIN),"/api/admin/bookings/onbekend",{});
  assert.equal(r.statusCode,404);
});

test("een onzinnig bereik wordt geweigerd voordat de database iets doet",async()=>{
  for(const query of [{from:"gisteren",to:"morgen"},{from:"2026-12-01",to:"2026-11-01"},{}]){
    const r=await vraag(alsAdmin(ADMIN),"/api/admin/bookings",query);
    assert.equal(r.statusCode,400);
  }
  assert.equal(rpcAanroepen.length,0);
});

// Sinds 5 september 2026 is er één schrijfhandeling: het oordeel van de accommodatie over
// aangevraagde extra nachten. Alles daarbuiten blijft dicht — een leesfunctie die zomaar
// van alles kan schrijven is precies wat je hier niet wilt.
test("schrijven kan alleen voor het oordeel over extra nachten",async()=>{
  const {handler}=await import("../netlify/functions/admin-bookings.mjs");
  for(const methode of ["PUT","PATCH","DELETE"]){
    const r=await handler({httpMethod:methode,path:"/api/admin/bookings",headers:alsAdmin(ADMIN)});
    assert.equal(r.statusCode,405,`${methode} werd geaccepteerd`);
  }
  // POST zonder boeking, POST op een onbekende handeling: allebei geweigerd.
  const zonder=await handler({httpMethod:"POST",path:"/api/admin/bookings",headers:alsAdmin(ADMIN),body:"{}"});
  assert.equal(zonder.statusCode,400,"POST zonder boekingskenmerk werd geaccepteerd");
  const onbekend=await handler({httpMethod:"POST",path:"/api/admin/bookings/claim-0001/verwijderen",
    headers:alsAdmin(ADMIN),body:"{}"});
  assert.equal(onbekend.statusCode,404,"een onbekende handeling werd geaccepteerd");
  // En een oordeel dat geen oordeel is, komt er ook niet langs.
  const onzin=await handler({httpMethod:"POST",path:"/api/admin/bookings/claim-0001/extra-nights",
    headers:alsAdmin(ADMIN),body:JSON.stringify({decision:"misschien"})});
  assert.equal(onzin.statusCode,400,"een onbekend besluit werd geaccepteerd");
});

// ── Wat er in de browser terechtkomt ────────────────────────────────────────

test("de configuratie voor de browser bevat geen enkel geheim",async()=>{
  process.env.SUPABASE_ANON_KEY="publiceerbare-anon-sleutel";
  const {handler}=await import("../netlify/functions/admin-config.mjs");
  const body=(await handler({httpMethod:"GET"})).body;
  assert.match(body,/publiceerbare-anon-sleutel/,"de anon-sleutel hoort er juist wel in");
  for(const geheim of ["test-service-key",GEHEIM,"SERVICE_ROLE","JWT_SECRET"])
    assert.equal(body.includes(geheim),false,`"${geheim}" lekt naar de browser`);
});

test("de beheerpagina draagt zelf geen sleutel en geen boekingsgegevens",async()=>{
  const {readFile}=await import("node:fs/promises");
  for(const pad of ["../admin/index.html","../admin/admin.js"]){
    const bron=await readFile(new URL(pad,import.meta.url),"utf8");
    for(const patroon of [/service_role/i,/SUPABASE_SERVICE/i,/JWT_SECRET/i,/eyJ[A-Za-z0-9_-]{20,}/])
      assert.doesNotMatch(bron,patroon,`${pad} draagt iets dat op een sleutel lijkt`);
  }
});

test("er zijn precies drie beheeracties, en geen ervan raakt geld of een boeking",async()=>{
  const {readFile}=await import("node:fs/promises");
  const bron=await readFile(new URL("../admin/admin.js",import.meta.url),"utf8");
  // Tot 5 september 2026 was de beheeromgeving alleen-lezen. Robert heeft daarna om drie
  // acties per deelnemer gevraagd. Dit is de nieuwe grens: die drie, en niets erbij.
  const paden=[...bron.matchAll(/\$\{p\.id\}\/(remind|extend|release)/g)].map(m=>m[1]);
  assert.deepEqual([...new Set(paden)].sort(),["extend","release","remind"]);
  // Geen terugbetaling, geen annulering van de hele boeking, geen bedrag dat de browser
  // bepaalt. Let op: het wóórd "refund" mag er wel staan — de bevestigingstekst zegt
  // juist dat er niets wordt terugbetaald. Het gaat om aanroepen, niet om woorden.
  for(const verboden of [/\/refund/,/action:\s*["']refund["']/,/cancelBooking/,/deleteBooking/,/api\/checkout/])
    assert.doesNotMatch(bron,verboden,`${verboden} hoort hier niet`);
  assert.match(bron,/Nothing is refunded here/,"de bevestiging hoort te zeggen dat er niets wordt terugbetaald");
  // Het boekingseindpunt blijft alleen-lezen.
  assert.doesNotMatch(bron,/api\/admin\/bookings[^)]*method:\s*"(POST|PUT|PATCH|DELETE)"/);
});

test("alleen vrijgeven staat achter de rol; herinneren en verlengen niet",async()=>{
  const {readFile}=await import("node:fs/promises");
  const bron=await readFile(new URL("../admin/admin.js",import.meta.url),"utf8");
  const blok=bron.slice(bron.indexOf('viewerRole==="admin"'),bron.indexOf("lijst.append"));
  assert.match(blok,/release/,"vrijgeven hoort achter de rolcontrole");
  assert.equal(blok.includes("/remind"),false,"herinneren mag Nadine ook");
  // Robert, 6 september 2026: verlengen mag de accommodatie voortaan ook.
  assert.equal(blok.includes("/extend"),false,"verlengen mag Nadine ook");
  // En de server gelooft de browser niet.
  const functie=await readFile(new URL("../netlify/functions/admin-actions.mjs",import.meta.url),"utf8");
  assert.match(functie,/requires_owner/,"de functie kent de rolweigering niet");
  assert.match(functie,/reason_required/,"een vrijgave zonder reden hoort geweigerd te worden");
});


// ── Aangevraagd verblijf tegenover bevestigd verblijf ───────────────────────
//
// De hele reden dat dit onderscheid bestaat: Robert en Nadine moeten in één oogopslag
// kunnen zien wat vaststaat en wat nog een vraag is. Een maandkalender die alvast twee
// dagen langer kleurt omdat iemand ze heeft aangeklikt, is een kamer die op de verkeerde
// dag klaarstaat.

test("het overzicht rekt een boeking niet op met nachten die niemand heeft toegezegd",async()=>{
  const {handler}=await import("../netlify/functions/admin-bookings.mjs");
  const r=await handler({httpMethod:"GET",path:"/api/admin/bookings",headers:alsAdmin(ADMIN),
    queryStringParameters:{from:"2026-10-01",to:"2026-11-30"}});
  assert.equal(r.statusCode,200);
  const boeking=JSON.parse(r.body).bookings[0];
  // De datums zijn het bevestigde verblijf, niet de aanvraag.
  assert.equal(boeking.arrival,"2026-10-30");
  assert.equal(boeking.departure,"2026-11-02");
  // Maar de vraag is wel zichtbaar, anders blijft hij liggen.
  assert.equal(boeking.extraNightsStatus,"requested");
  assert.equal(boeking.requestedArrival,"2026-10-28");
});

test("het detail toont de aanvraag apart van het bevestigde verblijf",async()=>{
  const {handler}=await import("../netlify/functions/admin-bookings.mjs");
  const r=await handler({httpMethod:"GET",path:"/api/admin/bookings/claim-0001",headers:alsAdmin(ADMIN)});
  assert.equal(r.statusCode,200);
  const detail=JSON.parse(r.body);
  assert.equal(detail.arrival,"2026-10-30","het bevestigde verblijf is opgerekt");
  assert.equal(detail.requestedArrival,"2026-10-28");
  assert.equal(detail.extraNightsStatus,"requested");
  // En de pagina zet ze ook echt in twee blokken, met de woorden erbij.
  const {readFile}=await import("node:fs/promises");
  const bron=await readFile(new URL("../admin/admin.js",import.meta.url),"utf8");
  assert.match(bron,/Arrival \(confirmed\)/);
  assert.match(bron,/Requested arrival/);
  assert.match(bron,/Requested — not confirmed/);
});

test("Nadine mag ook over extra nachten beslissen, een vreemde niet",async()=>{
  const {handler}=await import("../netlify/functions/admin-bookings.mjs");
  // De accommodatie is degene die weet of een kamer vrij is. Dit is geen commerciële
  // beslissing over geld of voorraad, dus hij staat niet alleen voor Robert open.
  for(const wie of [ADMIN,NADINE]){
    const r=await handler({httpMethod:"POST",path:"/api/admin/bookings/claim-0001/extra-nights",
      headers:alsAdmin(wie),body:JSON.stringify({decision:"confirmed"})});
    assert.equal(r.statusCode,200,`${wie} werd geweigerd`);
  }
  const vreemde=await handler({httpMethod:"POST",path:"/api/admin/bookings/claim-0001/extra-nights",
    headers:alsAdmin("iemand.anders@example.invalid"),body:JSON.stringify({decision:"confirmed"})});
  assert.equal(vreemde.statusCode,403);
});

test("meer bevestigen dan er gevraagd is, kan niet",async()=>{
  const {handler}=await import("../netlify/functions/admin-bookings.mjs");
  const r=await handler({httpMethod:"POST",path:"/api/admin/bookings/claim-0001/extra-nights",
    headers:alsAdmin(ADMIN),body:JSON.stringify({decision:"confirmed",
      confirmedArrival:"2026-10-20",confirmedDeparture:"2026-11-03"})});
  assert.equal(r.statusCode,409);
  assert.match(JSON.parse(r.body).message,/cannot confirm more nights than the guest asked for/);
});

test("een onleesbare datum in een bevestiging komt de database niet in",async()=>{
  const {handler}=await import("../netlify/functions/admin-bookings.mjs");
  const r=await handler({httpMethod:"POST",path:"/api/admin/bookings/claim-0001/extra-nights",
    headers:alsAdmin(ADMIN),body:JSON.stringify({decision:"confirmed",confirmedArrival:"28-10-2026"})});
  assert.equal(r.statusCode,422);
});


// ── Herinneren zonder betaaltermijn ─────────────────────────────────────────
//
// Robert, 6 september 2026: dit gaf een 503 "admin_unavailable". Dan denkt de beheerder dat
// het systeem stuk is en probeert het opnieuw, terwijl er alleen een termijn ontbreekt.

const herinner=async(deelnemerId,email=ADMIN)=>{
  const {handler}=await import("../netlify/functions/admin-actions.mjs");
  return handler({httpMethod:"POST",path:`/api/admin/participants/${deelnemerId}/remind`,
    headers:{authorization:`Bearer ${token({email})}`},body:"{}"});
};

test("herinneren zonder betaaltermijn is geen storing",async()=>{
  const uit=await herinner(ZONDER_TERMIJN);
  assert.equal(uit.statusCode,409,"een ontbrekende termijn is geen 503");
  const body=JSON.parse(uit.body);
  assert.equal(body.error,"no_payment_deadline");
  assert.match(body.message,/no payment deadline/i);
});

test("de melding zegt wat de beheerder nu moet doen",async()=>{
  // Zonder herstelactie is een nette foutmelding nog steeds een doodlopende weg.
  const {message}=JSON.parse((await herinner(ZONDER_TERMIJN)).body);
  assert.match(message,/payment request/i,"noemt het betaalverzoek niet");
  assert.match(message,/Extend/,"noemt de handeling niet die wél een termijn zet");
  assert.doesNotMatch(message,/unavailable/i);
});

test("een gewone herinnering wordt echt verstuurd en dan pas vastgelegd",async()=>{
  verstuurdeMail=[];
  const uit=await herinner(GEWOON);
  assert.equal(uit.statusCode,200);
  const body=JSON.parse(uit.body);
  assert.equal(body.status,"reminded");
  assert.equal(body.emailSent,true,"de knop meldt verstuurd zonder verzending");
  assert.equal(verstuurdeMail.length,1,"er ging geen mail uit, of er gingen er twee");
});

test("zonder betaallink komt er geen mail met een knop die nergens heen gaat",async()=>{
  verstuurdeMail=[];
  const uit=await herinner(ZONDER_LINK);
  assert.equal(uit.statusCode,409);
  assert.equal(JSON.parse(uit.body).error,"no_payment_link");
  assert.equal(verstuurdeMail.length,0);
});

test("mislukt de verzending, dan wordt er niets vastgelegd",async()=>{
  // Geen sleutel ingesteld: `sendEmail` verstuurt niets en geeft null terug. Dan mag de
  // beheeromgeving geen "verstuurd" melden en mag er geen herinnering in het logboek staan.
  const sleutel=process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  rpcAanroepen=[];
  const uit=await herinner(GEWOON);
  process.env.RESEND_API_KEY=sleutel;
  assert.equal(uit.statusCode,502);
  assert.equal(JSON.parse(uit.body).error,"reminder_not_sent");
  assert.equal(rpcAanroepen.filter(a=>a.url.endsWith("/admin_remind_participant")).length,0,
    "er is een herinnering vastgelegd die nooit is verstuurd");
});

test("de herinnering draagt alleen wat nodig is",async()=>{
  verstuurdeMail=[];
  await herinner(GEWOON);
  const mail=verstuurdeMail[0];
  const alles=JSON.stringify(mail);
  // Wat er wél in hoort: wie, hoeveel, welk weekend, tot wanneer, en de betaallink.
  assert.match(alles,/TEST – Gast/);
  assert.match(alles,/2,025\.00/,"het eigen bedrag ontbreekt");
  assert.match(alles,/example\.invalid\/pay\/test/,"de betaallink ontbreekt");
  // Wat er nooit in hoort.
  assert.doesNotMatch(alles,/peanut|allergy|allerg|vegetarian|dietary/i,
    "een allergie of dieetwens reist mee in een betaalherinnering");
  assert.equal(mail.to.length,1,"een betaalverzoek gaat over één persoon");
  assert.ok(mail.text&&mail.html,"elke mail gaat als tekst én HTML de deur uit");
});

test("twee pogingen op dezelfde herinnering gebruiken dezelfde sleutel",async()=>{
  // Anders levert een netwerkfout twee berichten op bij de gast.
  verstuurdeMail=[];
  await herinner(GEWOON);
  await herinner(GEWOON);
  assert.equal(verstuurdeMail[0].idempotencyKey,verstuurdeMail[1].idempotencyKey);
  assert.match(verstuurdeMail[0].idempotencyKey,/^reminder-/);
  assert.doesNotMatch(verstuurdeMail[0].idempotencyKey,/\d{13}/,"de sleutel hangt aan het moment");
});

test("de database verzint geen termijn en legt niets vast zonder termijn",async()=>{
  const {readFile}=await import("node:fs/promises");
  const sql=await readFile(new URL("../database/admin.sql",import.meta.url),"utf8");
  const functie=sql.split("create or replace function public.admin_remind_participant")[1]
    .split("$$;")[0];
  assert.match(functie,/'no_deadline'/,"de functie kent de uitkomst niet");
  // De controle moet vóór het vastleggen staan, anders staat er een herinnering in het
  // logboek die nooit is verstuurd.
  assert.ok(functie.indexOf("no_deadline")<functie.indexOf("insert into public.lewos_admin_actions"),
    "de controle staat na het vastleggen van de herinnering");
  assert.doesNotMatch(functie,/hold_expires_at\s*=/,"de functie zet zelf een termijn");
});
