import assert from "node:assert/strict";
import {after, before, beforeEach, test} from "node:test";
import http from "node:http";

let registrationResult={status:"first_access_held",weekendLabel:"Weekend 01 · 30 Oct to 2 Nov 2026",seats:3,remaining:3};
let emailRequests=0;
let rateAllowed=true;
let registrationError="";
let rateBodies=[];
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
      if(request.url==="/rest/v1/rpc/check_tavern_request_limit"){rateBodies.push(JSON.parse(body));return response.end(JSON.stringify(rateAllowed));}
      if(request.url==="/rest/v1/rpc/register_tavern_interest"){
        if(registrationError){response.statusCode=400;return response.end(JSON.stringify({code:"P0001",message:registrationError}));}
        return response.end(JSON.stringify(registrationResult));
      }
      if(request.url==="/emails"){emailRequests+=1;return response.end(JSON.stringify({id:"email-1"}));}
      response.statusCode=404;response.end("{}");
    });
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  base=`http://127.0.0.1:${server.address().port}`;
  globalThis.fetch=(input,options)=>nativeFetch(String(input).startsWith("https://api.resend.com/")?`${base}/emails`:input,options);
  process.env.SUPABASE_URL=base;
  process.env.SUPABASE_SERVICE_ROLE_KEY="test-service-key";
  process.env.RESEND_API_KEY="test-resend-key";
  process.env.TAVERN_FROM_EMAIL="The Lewos Tavern <tavern@example.com>";
  process.env.RATE_LIMIT_SECRET="a-long-random-test-secret";
});

beforeEach(()=>{emailRequests=0;rateAllowed=true;registrationError="";rateBodies=[];delete process.env.TAVERN_PAYMENTS_ENABLED;delete process.env.PUBLIC_BOOKING_OPENS_AT;delete process.env.BOOKING_TERMS_VERSION;delete process.env.BOOKING_TERMS_DOCUMENT_URL;delete process.env.TRAVEL_INFORMATION_DOCUMENT_URL;delete process.env.NODE_ENV;registrationResult={status:"first_access_held",weekendLabel:"Weekend 01 · 30 Oct to 2 Nov 2026",seats:3,remaining:3};});
beforeEach(()=>{process.env.URL=base;});
after(()=>{globalThis.fetch=nativeFetch;server.close();});

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
});

test("does not send a second email for a duplicate",async()=>{
  registrationResult={...registrationResult,duplicate:true};
  const {handler}=await import("../netlify/functions/first-access.mjs");
  const response=await handler(post(valid));
  assert.equal(JSON.parse(response.body).emailSent,false);
  assert.equal(emailRequests,0);
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
