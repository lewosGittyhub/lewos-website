// De koppeling met de gedeelde Lewos-agenda. Google zelf wordt hier niet aangeroepen: de
// token- en Calendar-endpoints lopen naar een mockserver, zodat de JWT-ondertekening, de
// ontdubbeling en de vorm van de afspraak te controleren zijn zonder een echte sleutel.
import assert from "node:assert/strict";
import {after, before, beforeEach, test} from "node:test";
import {generateKeyPairSync} from "node:crypto";
import http from "node:http";
import {listenOnTestPort,stopTestServer} from "./_test-server.mjs";
import {ARRIVAL_TIME,DEPARTURE_TIME,bookingEvent,calendarConfig,describeCalendar,eventIdFor,readEvent,upsertBookingEvent} from "../netlify/functions/_calendar.mjs";

// Deze test roept echte functies aan. Sinds 7 september 2026 weigert elke omgeving die
// niet verklaart wat hij is — zie netlify/functions/_deploy-context.mjs. Een testrun is
// een omgeving met eigen instellingen, dus die verklaart zich hier als zodanig.
process.env.LEWOS_PREVIEW_SAFE="true";

const {privateKey}=generateKeyPairSync("rsa",{modulusLength:2048,privateKeyEncoding:{type:"pkcs8",format:"pem"},publicKeyEncoding:{type:"spki",format:"pem"}});

let verzoeken=[];let bestaatAl=false;let server;let base;
const nativeFetch=globalThis.fetch;

before(async()=>{
  server=http.createServer((request,response)=>{
    let body="";
    request.on("data",chunk=>body+=chunk);
    request.on("end",()=>{
      verzoeken.push({url:request.url,method:request.method,body});
      response.setHeader("content-type","application/json");
      if(request.url==="/token")return response.end(JSON.stringify({access_token:"test-token",expires_in:3600}));
      if(request.method==="POST"&&request.url.includes("/events?")){
        if(bestaatAl){response.statusCode=409;return response.end(JSON.stringify({error:{message:"The requested identifier already exists."}}));}
        return response.end(JSON.stringify({id:JSON.parse(body).id,htmlLink:"https://calendar.google.com/event?eid=test",...JSON.parse(body)}));
      }
      if(request.method==="PUT")return response.end(JSON.stringify({...JSON.parse(body),htmlLink:"https://calendar.google.com/event?eid=test",updated:true}));
      if(request.method==="GET"&&request.url.includes("/events?"))
        return response.end(JSON.stringify({summary:"Lewos",timeZone:"Europe/Madrid",accessRole:"writer",items:[]}));
      if(request.method==="GET")return response.end(JSON.stringify({id:"bestaand",summary:"TEST – Lewos boeking – donderdag t/m dinsdag"}));
      response.statusCode=404;response.end("{}");
    });
  });
  await listenOnTestPort(server);
  base=`http://127.0.0.1:${server.address().port}`;
  globalThis.fetch=(input,options)=>{
    const url=String(input);
    if(url==="https://oauth2.googleapis.com/token")return nativeFetch(`${base}/token`,options);
    if(url.startsWith("https://www.googleapis.com/calendar/v3"))return nativeFetch(base+url.replace("https://www.googleapis.com/calendar/v3",""),options);
    return Promise.reject(new Error(`test_reached_the_network: ${url}`));
  };
});
beforeEach(()=>{
  verzoeken=[];bestaatAl=false;
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL="lewos-agenda@voorbeeld.iam.gserviceaccount.com";
  process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=privateKey;
  process.env.LEWOS_CALENDAR_ID="lewos@group.calendar.google.com";
});
after(async()=>{
  globalThis.fetch=nativeFetch;
  delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;delete process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;delete process.env.LEWOS_CALENDAR_ID;
  await stopTestServer(server);server=null;
});

const boeking={claimId:"claim-1",name:"TEST – Lewos boeking",seats:2,weekendLabel:"Weekend 02 · 6 to 9 Nov 2026",
  arrivalDate:"2026-11-05",departureDate:"2026-11-10",extraNights:"One night before and one after."};

test("zonder ingestelde sleutel is er geen koppeling, en dat is geen fout",()=>{
  delete process.env.LEWOS_CALENDAR_ID;
  assert.equal(calendarConfig(),null);
});

test("een sleutel die geen sleutel is wordt geweigerd in plaats van gebruikt",()=>{
  process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="dit-is-geen-pem";
  assert.throws(()=>calendarConfig(),/calendar_private_key_malformed/);
});

test("de \\n uit een shell-variabele wordt weer een echt regeleinde",()=>{
  process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=privateKey.replace(/\n/g,"\\n");
  assert.ok(calendarConfig().privateKey.includes("\n"),"de sleutel is onbruikbaar zonder echte regeleindes");
});

test("de doelagenda wordt gecontroleerd vóór er iets wordt geschreven",async()=>{
  const agenda=await describeCalendar(calendarConfig());
  assert.deepEqual(agenda,{calendarId:"lewos@group.calendar.google.com",summary:"Lewos",timeZone:"Europe/Madrid",accessRole:"writer"});
  // De eerste aanroep is het ophalen van een token met een ondertekende JWT.
  assert.equal(verzoeken[0].url,"/token");
  const assertion=new URLSearchParams(verzoeken[0].body).get("assertion");
  const claims=JSON.parse(Buffer.from(assertion.split(".")[1],"base64url"));
  assert.equal(claims.scope,"https://www.googleapis.com/auth/calendar.events","de scope is ruimer dan nodig");
  assert.equal(claims.iss,"lewos-agenda@voorbeeld.iam.gserviceaccount.com");
  assert.equal(assertion.split(".").length,3,"de JWT is niet ondertekend");
});

test("de afspraak draagt de datums, de tijden en de tijdzone",async()=>{
  const velden=bookingEvent({...boeking,summary:"TEST – Lewos boeking – donderdag t/m dinsdag"});
  assert.equal(velden.summary,"TEST – Lewos boeking – donderdag t/m dinsdag");
  assert.equal(velden.startDateTime,`2026-11-05T${ARRIVAL_TIME}:00`);
  assert.equal(velden.endDateTime,`2026-11-10T${DEPARTURE_TIME}:00`);
  await upsertBookingEvent(calendarConfig(),velden);
  const verstuurd=JSON.parse(verzoeken.find(v=>v.method==="POST"&&v.url.includes("/events?")).body);
  assert.equal(verstuurd.start.timeZone,"Europe/Madrid");
  assert.equal(verstuurd.end.timeZone,"Europe/Madrid");
  assert.equal(verstuurd.extendedProperties.private.lewosClaimId,"claim-1");
});

test("een boeking zonder datums levert geen afspraak op, en zeker geen verzonnen datum",()=>{
  assert.throws(()=>bookingEvent({...boeking,arrivalDate:null}),/calendar_dates_missing/);
  assert.throws(()=>bookingEvent({...boeking,departureDate:""}),/calendar_dates_missing/);
});

test("er worden geen gasten uitgenodigd en er gaat geen uitnodiging de deur uit",async()=>{
  await upsertBookingEvent(calendarConfig(),bookingEvent(boeking));
  const post=verzoeken.find(v=>v.method==="POST"&&v.url.includes("/events?"));
  // Nadine kijkt mee via de gedeelde agenda. Haar als deelnemer toevoegen zou haar een
  // uitnodigingsmail sturen die niemand heeft gevraagd.
  assert.equal("attendees" in JSON.parse(post.body),false,"er staan deelnemers op de afspraak");
  assert.match(post.url,/sendUpdates=none/,"Google mag uitnodigingen versturen");
});

test("opnieuw draaien maakt geen tweede afspraak maar werkt de bestaande bij",async()=>{
  bestaatAl=true;
  const resultaat=await upsertBookingEvent(calendarConfig(),bookingEvent(boeking));
  assert.equal(resultaat.status,"updated");
  const puts=verzoeken.filter(v=>v.method==="PUT");
  assert.equal(puts.length,1,"er is niet bijgewerkt maar iets anders gebeurd");
  assert.match(puts[0].url,new RegExp(eventIdFor("claim-1")),"de bijwerking raakt een ander afspraak-id");
  assert.equal(verzoeken.filter(v=>v.method==="POST"&&v.url.includes("/events?")).length,1,"er is een tweede afspraak aangemaakt");
});

test("hetzelfde boekingskenmerk levert altijd hetzelfde afspraak-id op",()=>{
  assert.equal(eventIdFor("claim-1"),eventIdFor("claim-1"));
  assert.notEqual(eventIdFor("claim-1"),eventIdFor("claim-2"));
  // Google eist base32hex: alleen 0-9 en a-v. Een sha256 in hex valt daarbinnen.
  assert.match(eventIdFor("claim-1"),/^[0-9a-v]{5,1024}$/);
});

test("de afspraak is terug te lezen uit de agenda",async()=>{
  const terug=await readEvent(calendarConfig(),eventIdFor("claim-1"));
  assert.equal(terug.found,true);
  assert.equal(terug.event.summary,"TEST – Lewos boeking – donderdag t/m dinsdag");
});

test("een allergie of dieetwens komt nooit in de agenda terecht",async()=>{
  // Robert, 5 september 2026: geen medische of allergiedetails in de agenda. Een agenda is
  // gedeeld en ligt open op een telefoon; dat is geen plek voor gezondheidsgegevens. Ze
  // gaan naar Lewos per mail en verder nergens heen.
  // `dietaryNotes` is sinds 5 september 2026 het gecombineerde veld; de twee oude namen
  // worden hier meegestuurd omdat een oudere aanroep die nog kan gebruiken. Geen van de
  // drie mag de agenda halen.
  const velden=bookingEvent({...boeking,
    dietaryNotes:"Peanuts - severe. Vegetarian.",
    allergies:"Peanuts - severe",dietary:"Vegetarian",notes:"Wheelchair user",message:"Diabetic"});
  const alles=JSON.stringify(velden);
  for(const geheim of ["Peanuts","severe","Vegetarian","Wheelchair","Diabetic"])
    assert.equal(alles.includes(geheim),false,`"${geheim}" staat in de afspraak`);
  await upsertBookingEvent(calendarConfig(),velden);
  const verstuurd=verzoeken.find(v=>v.method==="POST"&&v.url.includes("/events?")).body;
  for(const geheim of ["Peanuts","Vegetarian","Wheelchair","Diabetic"])
    assert.equal(verstuurd.includes(geheim),false,`"${geheim}" is naar Google gestuurd`);
  // Het aantal personen hoort er juist wél in te staan.
  assert.match(verstuurd,/Number of guests: 2/);
});
