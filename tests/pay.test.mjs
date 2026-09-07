// De persoonlijke betaalpagina. Wat hier bewaakt wordt: dat een betaalkenmerk toegang geeft
// tot precies één deelnemer, tot zijn eigen bedrag, en tot niets anders.
import assert from "node:assert/strict";
import {after, before, beforeEach, test} from "node:test";
import http from "node:http";
import {listenOnTestPort,stopTestServer} from "./_test-server.mjs";

// Deze test roept echte functies aan. Sinds 7 september 2026 weigert elke omgeving die
// niet verklaart wat hij is — zie netlify/functions/_deploy-context.mjs. Een testrun is
// een omgeving met eigen instellingen, dus die verklaart zich hier als zodanig.
process.env.LEWOS_PREVIEW_SAFE="true";

let server, base, rpcAanroepen=[], stripeAanroepen=[];
const nativeFetch=globalThis.fetch;

const EEN="tav_1111111111111111111111111111aaaa";
const TWEE="tav_2222222222222222222222222222bbbb";
const BETAALD="tav_3333333333333333333333333333cccc";
const VERLOPEN="tav_4444444444444444444444444444dddd";
const GEANNULEERD="tav_5555555555555555555555555555eeee";

// Wat de database zou teruggeven. Let op: per kenmerk één deelnemer, en nergens een
// groepstotaal of een tweede naam.
const DEELNEMERS={
  [EEN]:{status:"ok",participantId:"p-1",fullName:"TEST – Een",amountCents:202500,
    deadline:"2026-11-01T12:30:00.000Z",bookingName:"TEST – Boeker",
    weekendLabel:"Weekend 01 · 30 Oct to 2 Nov 2026",checkoutSessionId:null,checkoutSessionUrl:null},
  [TWEE]:{status:"ok",participantId:"p-2",fullName:"TEST – Twee",amountCents:202500,
    deadline:"2026-11-01T12:30:00.000Z",bookingName:"TEST – Boeker",
    weekendLabel:"Weekend 01 · 30 Oct to 2 Nov 2026",checkoutSessionId:null,checkoutSessionUrl:null},
  [BETAALD]:{status:"already_paid",fullName:"TEST – Al betaald",amountCents:202500},
  [VERLOPEN]:{status:"expired",fullName:"TEST – Te laat"},
  [GEANNULEERD]:{status:"cancelled"}
};
let gekoppeld={};   // kenmerk → sessie, zoals de database die vasthoudt

before(async()=>{
  server=http.createServer((request,response)=>{
    let body="";request.on("data",c=>body+=c);request.on("end",()=>{
      const invoer=JSON.parse(body||"{}");
      rpcAanroepen.push({url:request.url,invoer});
      response.setHeader("content-type","application/json");
      if(request.url.endsWith("/tavern_payment_request")){
        const ref=invoer.p_reference;
        const gevonden=DEELNEMERS[ref];
        if(!gevonden)return response.end(JSON.stringify({status:"not_found"}));
        const sessie=gekoppeld[ref];
        return response.end(JSON.stringify(sessie?{...gevonden,...sessie}:gevonden));
      }
      if(request.url.endsWith("/attach_participant_checkout_session")){
        const ref=invoer.p_reference;
        if(gekoppeld[ref])return response.end(JSON.stringify({status:"already_attached",...gekoppeld[ref]}));
        gekoppeld[ref]={checkoutSessionId:invoer.p_session_id,checkoutSessionUrl:invoer.p_session_url};
        return response.end(JSON.stringify({status:"attached",...gekoppeld[ref]}));
      }
      response.statusCode=404;response.end("{}");
    });
  });
  await listenOnTestPort(server);
  base=`http://127.0.0.1:${server.address().port}`;
  globalThis.fetch=(input,options)=>{
    const url=String(input);
    if(url.startsWith(base))return nativeFetch(input,options);
    if(url.startsWith("https://api.stripe.com/")){
      const sleutel=String(options?.headers?.["idempotency-key"]||"");
      stripeAanroepen.push({sleutel,body:String(options?.body||"")});
      return Promise.resolve(new Response(JSON.stringify(
        {id:`cs_test_${sleutel}`,url:`https://checkout.stripe.test/${sleutel}`}),
        {status:200,headers:{"content-type":"application/json"}}));
    }
    return Promise.reject(new Error(`test_reached_the_network: ${url}`));
  };
  process.env.SUPABASE_URL=base;
  process.env.SUPABASE_SERVICE_ROLE_KEY="test-service-key";
  process.env.STRIPE_SECRET_KEY="sk_test_nooit_echt";
  process.env.NODE_ENV="test";
  process.env.URL="http://127.0.0.1";
  process.env.BOOKING_TERMS_VERSION="test-voorwaarden-1";
  process.env.BOOKING_TERMS_DOCUMENT_URL="http://127.0.0.1/voorwaarden.pdf";
  process.env.TRAVEL_INFORMATION_DOCUMENT_URL="http://127.0.0.1/reisinformatie.pdf";
});
after(async()=>{globalThis.fetch=nativeFetch;await stopTestServer(server);});
beforeEach(()=>{rpcAanroepen=[];stripeAanroepen=[];gekoppeld={};process.env.TAVERN_PAYMENTS_ENABLED="true";});

const vraag=async(methode,ref)=>{
  const {handler}=await import("../netlify/functions/pay.mjs");
  return handler({httpMethod:methode,path:"/api/pay",headers:{},queryStringParameters:{ref}});
};

test("een kenmerk toont precies één deelnemer",async()=>{
  const uit=await vraag("GET",EEN);
  assert.equal(uit.statusCode,200);
  const b=JSON.parse(uit.body);
  assert.equal(b.fullName,"TEST – Een");
  assert.equal(b.amountCents,202500);
  // Niets over de andere deelnemer.
  assert.doesNotMatch(uit.body,/Twee/,"de gegevens van een andere deelnemer lekken mee");
});

test("het groepstotaal komt er nooit in voor",async()=>{
  const uit=await vraag("GET",EEN);
  assert.doesNotMatch(uit.body,/607500|6075/,"het groepstotaal staat in het antwoord");
  assert.equal(JSON.parse(uit.body).amountCents,202500);
});

test("er lekt niets over allergieën, e-mailadressen of andere boekingen",async()=>{
  const uit=await vraag("GET",EEN);
  assert.doesNotMatch(uit.body,/peanut|allerg|vegetarian|dietary/i);
  assert.doesNotMatch(uit.body,/@/,"er staat een e-mailadres in het antwoord");
  assert.doesNotMatch(uit.body,/participantId|claimId/,"een intern kenmerk lekt naar de browser");
});

test("een onbekend of misvormd kenmerk komt niet bij de database",async()=>{
  for(const rommel of ["","x","../../etc/passwd","tav_kort","<script>",
    "tav_"+"z".repeat(40),"tav_0000000000000000000000000000dead"]){
    const uit=await vraag("GET",rommel);
    assert.equal(uit.statusCode,404,`"${rommel}" gaf ${uit.statusCode}`);
  }
  // Alleen het laatste, goed gevormde kenmerk mocht de database halen.
  assert.equal(rpcAanroepen.length,1,"een misvormd kenmerk werd toch opgezocht");
});

test("je kunt niet met het kenmerk van een ander betalen",async()=>{
  // Twee deelnemers, twee kenmerken, twee losse antwoorden. Er is geen weg van het ene
  // kenmerk naar de gegevens van de ander.
  const een=JSON.parse((await vraag("GET",EEN)).body);
  const twee=JSON.parse((await vraag("GET",TWEE)).body);
  assert.equal(een.fullName,"TEST – Een");
  assert.equal(twee.fullName,"TEST – Twee");
  assert.notDeepEqual(een,twee);
});

test("een verlopen kenmerk weigert, en zegt dat er niets is afgeschreven",async()=>{
  const uit=await vraag("GET",VERLOPEN);
  assert.equal(uit.statusCode,410);
  const b=JSON.parse(uit.body);
  assert.equal(b.error,"expired");
  assert.match(b.message,/nothing has been charged/i);
});

test("een vrijgegeven boeking weigert",async()=>{
  const uit=await vraag("GET",GEANNULEERD);
  assert.equal(uit.statusCode,410);
  assert.equal(JSON.parse(uit.body).error,"cancelled");
});

test("een al betaald aandeel wordt niet nog eens aangeboden",async()=>{
  const uit=await vraag("GET",BETAALD);
  assert.equal(uit.statusCode,200);
  assert.match(JSON.parse(uit.body).message,/already been paid/i);
  const post=await vraag("POST",BETAALD);
  assert.equal(stripeAanroepen.length,0,"er werd een betaalsessie gemaakt voor een betaald aandeel");
  assert.match(JSON.parse(post.body).message,/already been paid/i);
});

test("de betaalsessie is idempotent",async()=>{
  const eerste=JSON.parse((await vraag("POST",EEN)).body);
  const tweede=JSON.parse((await vraag("POST",EEN)).body);
  assert.equal(eerste.checkoutUrl,tweede.checkoutUrl,"tweede klik gaf een andere betaalsessie");
  assert.equal(stripeAanroepen.length,1,"Stripe werd twee keer aangeroepen");
  assert.equal(stripeAanroepen[0].sleutel,EEN,"de idempotentiesleutel is niet het betaalkenmerk");
});

test("de sessie draagt het eigen bedrag, niet het groepstotaal",async()=>{
  await vraag("POST",EEN);
  // Stripe krijgt de velden URL-gecodeerd; decoderen maakt de controle leesbaar.
  const body=decodeURIComponent(stripeAanroepen[0].body);
  assert.match(body,/\[unit_amount\]=202500/,"het eigen bedrag staat niet in de sessie");
  assert.doesNotMatch(body,/607500/,"het groepstotaal reist mee naar Stripe");
});

test("staat de betaalpoort dicht, dan wordt er niets bij Stripe aangemaakt",async()=>{
  process.env.TAVERN_PAYMENTS_ENABLED="false";
  const uit=await vraag("POST",EEN);
  assert.equal(uit.statusCode,503);
  const b=JSON.parse(uit.body);
  assert.equal(b.error,"payments_not_open");
  assert.match(b.message,/nothing has been charged/i);
  assert.equal(stripeAanroepen.length,0,"Stripe werd aangeroepen terwijl de poort dicht staat");
});

test("met de poort dicht is de boeking wel gewoon te zien",async()=>{
  // De gast hoort te lezen dat zijn plek er is en betalen nog niet kan — niet een foutpagina.
  process.env.TAVERN_PAYMENTS_ENABLED="false";
  const uit=await vraag("GET",EEN);
  assert.equal(uit.statusCode,200);
  const b=JSON.parse(uit.body);
  assert.equal(b.paymentsOpen,false);
  assert.equal(b.fullName,"TEST – Een");
});

test("de pagina rekent zelf niets uit",async()=>{
  const {readFile}=await import("node:fs/promises");
  const bron=await readFile(new URL("../tavern/pay/pay.js",import.meta.url),"utf8");
  // Geen bedrag, geen prijs en geen aantal deelnemers in de pagina zelf: alles komt van de
  // server, anders bepaalt een bewerkte link het bedrag.
  assert.doesNotMatch(bron,/202500|2025|price_cents/,"de pagina kent zelf een bedrag");
  assert.match(bron,/fetch\(`\/api\/pay/,"de pagina haalt de gegevens niet bij de server op");
});
