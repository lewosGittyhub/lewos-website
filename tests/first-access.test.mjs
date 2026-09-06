import assert from "node:assert/strict";
import {after, before, beforeEach, test} from "node:test";
import http from "node:http";
import {listenOnTestPort,stopTestServer} from "./_test-server.mjs";

let registrationResult={status:"first_access_held",weekendLabel:"Weekend 01 · 30 Oct to 2 Nov 2026",seats:3,remaining:3};
let emailRequests=0;
let mailBodies=[];
let markRequests=0;
let markStatus="marked";
let publicReady=true;
let rateAllowed=true;
let registrationError="";
let rateBodies=[];
let registerBodies=[];
let server;
let base;
const nativeFetch=globalThis.fetch;

before(async()=>{
  server=http.createServer((request,response)=>{
    let body="";
    request.on("data",chunk=>body+=chunk);
    request.on("end",()=>{
      response.setHeader("content-type","application/json");
      if(request.url==="/rest/v1/rpc/get_tavern_availability") return response.end(JSON.stringify([{slug:"weekend-01",label:"Weekend 01",dateLabel:"30 Oct to 2 Nov 2026",capacity:6,remaining:2}]));
      if(request.url==="/rest/v1/rpc/tavern_public_booking_ready") return response.end(JSON.stringify(publicReady));
      if(request.url==="/rest/v1/rpc/check_tavern_request_limit"){rateBodies.push(JSON.parse(body));return response.end(JSON.stringify(rateAllowed));}
      if(request.url==="/rest/v1/rpc/register_tavern_interest"){
        registerBodies.push(JSON.parse(body));
        if(registrationError){response.statusCode=400;return response.end(JSON.stringify({code:"P0001",message:registrationError}));}
        return response.end(JSON.stringify(registrationResult));
      }
      if(request.url==="/rest/v1/rpc/mark_tavern_receipt_email_sent"){markRequests+=1;return response.end(JSON.stringify({status:markStatus}));}
      if(request.url==="/emails"){emailRequests+=1;mailBodies.push(JSON.parse(body));return response.end(JSON.stringify({id:"email-1"}));}
      response.statusCode=404;response.end("{}");
    });
  });
  await listenOnTestPort(server);
  base=`http://127.0.0.1:${server.address().port}`;
  globalThis.fetch=(input,options)=>{
    const url=String(input);
    if(url.startsWith("https://api.resend.com/"))return nativeFetch(`${base}/emails`,options);
    if(url.startsWith(base))return nativeFetch(input,options);
    return Promise.reject(new Error(`test_reached_the_network: ${url}`));
  };
  process.env.SUPABASE_URL=base;
  process.env.SUPABASE_SERVICE_ROLE_KEY="test-service-key";
  process.env.RESEND_API_KEY="test-resend-key";
  process.env.TAVERN_FROM_EMAIL="The Lewos Tavern <tavern@example.com>";
  process.env.RATE_LIMIT_SECRET="a-long-random-test-secret";
  process.env.LEWOS_GENERAL_EMAIL="lewos.co@gmail.com";
  process.env.FONTECHA_ACCOMMODATION_EMAIL="accommodation@example.invalid";
});

const mailsAan=adres=>mailBodies.filter(mail=>[].concat(mail.to).includes(adres));

beforeEach(()=>{emailRequests=0;mailBodies=[];rateAllowed=true;registrationError="";rateBodies=[];registerBodies=[];delete process.env.TAVERN_PAYMENTS_ENABLED;delete process.env.PUBLIC_BOOKING_OPENS_AT;delete process.env.BOOKING_TERMS_VERSION;delete process.env.BOOKING_TERMS_DOCUMENT_URL;delete process.env.TRAVEL_INFORMATION_DOCUMENT_URL;delete process.env.NODE_ENV;registrationResult={status:"first_access_held",claimId:"00000000-0000-4000-8000-000000000001",weekendLabel:"Weekend 01 · 30 Oct to 2 Nov 2026",seats:3,remaining:3};});
beforeEach(()=>{markRequests=0;markStatus="marked";publicReady=true;process.env.PUBLIC_BOOKING_OPENS_AT="2099-01-01T00:00:00Z";});
beforeEach(()=>{process.env.URL=base;});
after(async()=>{globalThis.fetch=nativeFetch;await stopTestServer(server);server=null;});

const post=(body,headers={"content-type":"application/json",accept:"application/json"})=>({httpMethod:"POST",headers,body:JSON.stringify(body)});
const valid={name:"Robert",email:"robert@example.com",weekend:"weekend-01",people:3,consent:"agreed","bot-field":""};

test("returns live remaining capacity",async()=>{
  const {handler}=await import("../netlify/functions/first-access.mjs");
  const response=await handler({httpMethod:"GET",headers:{}});
  assert.equal(response.statusCode,200);
  assert.equal(JSON.parse(response.body).weekends[0].remaining,2);
  assert.equal(JSON.parse(response.body).publicBookingOpen,false);
});

test("switches featured weekends from First Access to public booking at opening time",async()=>{
  process.env.TAVERN_PAYMENTS_ENABLED="true";
  process.env.PUBLIC_BOOKING_OPENS_AT="2026-01-01T00:00:00Z";
  process.env.BOOKING_TERMS_VERSION="booking-test-v1";
  process.env.BOOKING_TERMS_DOCUMENT_URL="/documents/terms.pdf";
  process.env.TRAVEL_INFORMATION_DOCUMENT_URL="/documents/travel.pdf";
  process.env.NODE_ENV="test";
  const {handler}=await import("../netlify/functions/first-access.mjs");
  const status=JSON.parse((await handler({httpMethod:"GET",headers:{}})).body);
  assert.equal(status.publicBookingOpen,true);
  const response=await handler(post(valid));
  assert.equal(response.statusCode,409);
  assert.deepEqual(JSON.parse(response.body),{error:"public_booking_open",bookingUrl:"/tavern/book/"});
  assert.equal(rateBodies.length,0);
  assert.equal(emailRequests,0);
});

test("closes First Access at the scheduled time while private windows finish",async()=>{
  process.env.TAVERN_PAYMENTS_ENABLED="true";
  process.env.PUBLIC_BOOKING_OPENS_AT="2026-01-01T00:00:00Z";
  process.env.BOOKING_TERMS_VERSION="booking-test-v1";
  process.env.BOOKING_TERMS_DOCUMENT_URL="/documents/terms.pdf";
  process.env.TRAVEL_INFORMATION_DOCUMENT_URL="/documents/travel.pdf";
  process.env.NODE_ENV="test";
  publicReady=false;
  const {handler}=await import("../netlify/functions/first-access.mjs");
  const status=JSON.parse((await handler({httpMethod:"GET",headers:{}})).body);
  assert.equal(status.publicBookingOpen,false);
  assert.equal(status.firstAccessClosed,true);
  const response=await handler(post(valid));
  assert.equal(response.statusCode,409);
  assert.equal(JSON.parse(response.body).error,"first_access_closed");
  assert.equal(rateBodies.length,0);
});

test("private enquiries remain available after public booking opens",async()=>{
  process.env.TAVERN_PAYMENTS_ENABLED="true";
  process.env.PUBLIC_BOOKING_OPENS_AT="2026-01-01T00:00:00Z";
  process.env.BOOKING_TERMS_VERSION="booking-test-v1";
  process.env.BOOKING_TERMS_DOCUMENT_URL="/documents/terms.pdf";
  process.env.TRAVEL_INFORMATION_DOCUMENT_URL="/documents/travel.pdf";
  process.env.NODE_ENV="test";
  registrationResult={status:"private_inquiry"};
  const {handler}=await import("../netlify/functions/first-access.mjs");
  const response=await handler(post({...valid,weekend:"private",people:4}));
  assert.equal(response.statusCode,200);
  assert.equal(JSON.parse(response.body).status,"private_inquiry");
});

test("holds an entire fitting party",async()=>{
  const {handler}=await import("../netlify/functions/first-access.mjs");
  const response=await handler(post(valid));
  const body=JSON.parse(response.body);
  assert.equal(response.statusCode,200);
  assert.equal(body.status,"first_access_held");
  assert.equal(body.seats,3);
  assert.equal(body.emailSent,true);
  assert.equal(emailRequests,1);
  assert.equal(markRequests,1);
});

test("does not send a second email for a duplicate",async()=>{
  registrationResult={...registrationResult,duplicate:true,receiptEmailSent:true};
  const {handler}=await import("../netlify/functions/first-access.mjs");
  const response=await handler(post(valid));
  assert.equal(JSON.parse(response.body).emailSent,true);
  assert.equal(emailRequests,0);
});

test("retries an unrecorded receipt safely without claiming another seat",async()=>{
  registrationResult={...registrationResult,duplicate:true,receiptEmailSent:false};
  const {handler}=await import("../netlify/functions/first-access.mjs");
  const response=await handler(post(valid));
  assert.equal(JSON.parse(response.body).emailSent,true);
  assert.equal(emailRequests,1);
  assert.equal(markRequests,1);
});

test("an unknown delivery mark remains retryable",async()=>{
  markStatus="unknown_claim";
  const {handler}=await import("../netlify/functions/first-access.mjs");
  const first=await handler(post(valid));
  assert.equal(JSON.parse(first.body).emailSent,true);
  registrationResult={...registrationResult,duplicate:true,receiptEmailSent:false};
  const retry=await handler(post(valid));
  assert.equal(JSON.parse(retry.body).emailSent,true);
  assert.equal(emailRequests,2);
  assert.equal(markRequests,2);
});

test("preserves a group and offers the next fitting weekend",async()=>{
  registrationResult={status:"alternative_offered",requestedWeekend:"Weekend 01",offeredWeekend:"weekend-02",offeredWeekendLabel:"Weekend 02 · 6 to 9 Nov 2026",seats:3};
  const {handler}=await import("../netlify/functions/first-access.mjs");
  const body=JSON.parse((await handler(post(valid))).body);
  assert.equal(body.status,"alternative_offered");
  assert.equal(body.offeredWeekend,"weekend-02");
  assert.equal(body.seats,3);
});

test("rejects more than six people for a featured weekend",async()=>{
  const {handler}=await import("../netlify/functions/first-access.mjs");
  const response=await handler(post({...valid,people:7}));
  assert.equal(response.statusCode,400);
  assert.equal(JSON.parse(response.body).error,"featured_party_too_large");
});

test("rejects private groups smaller than four",async()=>{
  const {handler}=await import("../netlify/functions/first-access.mjs");
  const response=await handler(post({...valid,weekend:"private",people:3}));
  assert.equal(response.statusCode,400);
  assert.equal(JSON.parse(response.body).error,"private_party_too_small");
});

test("accepts Netlify-style capitalised headers",async()=>{
  const {handler}=await import("../netlify/functions/first-access.mjs");
  const response=await handler(post(valid,{"Content-Type":"application/json","Accept":"application/json"}));
  assert.equal(response.statusCode,200);
});

test("uses separate rate limits for IP address and email address",async()=>{
  const {handler}=await import("../netlify/functions/first-access.mjs");
  await handler(post(valid));
  assert.equal(rateBodies.length,2);
  assert.equal(rateBodies[0].p_limit,12);
  assert.equal(rateBodies[1].p_limit,5);
  assert.notEqual(rateBodies[0].p_key_hash,rateBodies[1].p_key_hash);
});

test("returns a customer input error instead of a service outage",async()=>{
  registrationError="email_claim_limit";
  const {handler}=await import("../netlify/functions/first-access.mjs");
  const response=await handler(post(valid));
  assert.equal(response.statusCode,422);
  assert.equal(JSON.parse(response.body).error,"email_claim_limit");
});

test("stops rapid automated requests before claiming seats",async()=>{
  rateAllowed=false;
  const {handler}=await import("../netlify/functions/first-access.mjs");
  const response=await handler(post(valid));
  assert.equal(response.statusCode,429);
  assert.equal(JSON.parse(response.body).error,"too_many_requests");
  assert.equal(emailRequests,0);
});

// ── De mailroutering, gevraagd door Robert op 5 september 2026 ───────────────
// Dit formulier levert geen bevestigde boeking op — het houdt stoelen vast of
// registreert een aanvraag. De accommodatie hoort hier dus niets te ontvangen; wat hier
// binnenkomt is precies het soort bericht dat op het adres van Lewos hoort.

test("a private Tavern request goes to Lewos and never to the accommodation",async()=>{
  registrationResult={status:"private_inquiry",claimId:"00000000-0000-4000-8000-000000000009"};
  const {handler}=await import("../netlify/functions/first-access.mjs");
  const result=await handler(post({...valid,weekend:"private",people:5,message:"Six of us, a long weekend in spring."}));
  assert.equal(result.statusCode,200);
  assert.equal(JSON.parse(result.body).operatorNotified,true);
  const naarLewos=mailsAan("lewos.co@gmail.com");
  assert.equal(naarLewos.length,1,"Lewos kreeg geen melding van de private aanvraag");
  assert.deepEqual(naarLewos[0].to,["lewos.co@gmail.com"]);
  assert.match(naarLewos[0].subject,/A private Tavern request/);
  assert.match(naarLewos[0].text,/Requested weekend:\n {2}private/);
  assert.equal(mailsAan("accommodation@example.invalid").length,0,"de accommodatie kreeg een aanvraag die niet voor haar was");
});

test("a dietary requirement or accessibility note reaches Lewos",async()=>{
  const {handler}=await import("../netlify/functions/first-access.mjs");
  const result=await handler(post({...valid,dietaryNotes:"Peanuts - severe. Vegetarian.",message:"Wheelchair user, ground floor please."}));
  assert.equal(result.statusCode,200);
  const naarLewos=mailsAan("lewos.co@gmail.com");
  assert.equal(naarLewos.length,1);
  assert.match(naarLewos[0].text,/Allergies & dietary requirements:\n {2}Peanuts - severe\. Vegetarian\./);
  assert.match(naarLewos[0].text,/Anything else:\n {2}Wheelchair user, ground floor please\./);
  assert.equal(mailsAan("accommodation@example.invalid").length,0);
});

test("a registration with nothing special does not produce an empty notification",async()=>{
  const {handler}=await import("../netlify/functions/first-access.mjs");
  const result=await handler(post(valid));
  assert.equal(result.statusCode,200);
  assert.equal(mailsAan("lewos.co@gmail.com").length,0,"er ging een melding uit zonder dat er iets te melden was");
  assert.equal(mailsAan(valid.email).length,1,"de gast kreeg geen ontvangstbevestiging");
});

test("the guest still gets a receipt when the notification to Lewos fails",async()=>{
  // Het eigen postvak van Lewos mag nooit tussen de gast en zijn bevestiging staan: de
  // stoelen zijn vastgehouden, dus een foutmelding zou onwaar zijn.
  process.env.LEWOS_GENERAL_EMAIL="not-an-address";
  const {handler}=await import("../netlify/functions/first-access.mjs");
  const result=await handler(post({...valid,allergies:"Peanuts"}));
  assert.equal(result.statusCode,200);
  const body=JSON.parse(result.body);
  assert.equal(body.emailSent,true);
  assert.equal(body.operatorNotified,false);
  assert.equal(mailsAan(valid.email).length,1);
  process.env.LEWOS_GENERAL_EMAIL="lewos.co@gmail.com";
});

// ── Extra nachten, gevraagd door Robert op 5 september 2026 ──────────────────
// Het enige veld op dit formulier dat over de accommodatie gaat en niet over de tafel.
// Op /tavern/ staat al dat extra nachten "on request" zijn; nu is er ook een veld.

test("an extra-night request reaches the database as its own column",async()=>{
  const {handler}=await import("../netlify/functions/first-access.mjs");
  const result=await handler(post({...valid,extraNights:"Two nights before, one after."}));
  assert.equal(result.statusCode,200);
  assert.equal(registerBodies.length,1);
  assert.equal(registerBodies[0].p_extra_nights,"Two nights before, one after.");
});

test("an extra-night request is something Lewos hears about", async()=>{
  const {handler}=await import("../netlify/functions/first-access.mjs");
  await handler(post({...valid,extraNights:"One night after."}));
  const naarLewos=mailsAan("lewos.co@gmail.com");
  assert.equal(naarLewos.length,1,"Lewos hoorde niets over een verzoek om extra nachten");
  assert.match(naarLewos[0].text,/Extra nights requested:\n {2}One night after\./);
  // Fontecha hoort het pas bij een bevestigde boeking, niet bij een aanmelding.
  assert.equal(mailsAan("accommodation@example.invalid").length,0);
});

test("an extra-night request over the limit is refused, not truncated",async()=>{
  const {handler}=await import("../netlify/functions/first-access.mjs");
  const result=await handler(post({...valid,extraNights:"n".repeat(501)}));
  assert.equal(result.statusCode,400);
  const body=JSON.parse(result.body);
  assert.equal(body.error,"field_too_long");
  assert.deepEqual(body.fields,[{field:"extraNights",limit:500,length:501}]);
});
