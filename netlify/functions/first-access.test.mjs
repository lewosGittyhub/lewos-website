import assert from "node:assert/strict";
import {after, before, beforeEach, test} from "node:test";
import http from "node:http";

let registrationResult={status:"first_access_held",weekendLabel:"Weekend 01 · 30 Oct to 2 Nov 2026",seats:3,remaining:3};
let emailRequests=0;
let rateAllowed=true;
let server;
const nativeFetch=globalThis.fetch;

before(async()=>{
  server=http.createServer((request,response)=>{
    let body="";
    request.on("data",chunk=>body+=chunk);
    request.on("end",()=>{
      response.setHeader("content-type","application/json");
      if(request.url==="/rest/v1/rpc/get_tavern_availability") return response.end(JSON.stringify([{slug:"weekend-01",label:"Weekend 01",dateLabel:"30 Oct to 2 Nov 2026",capacity:6,remaining:2}]));
      if(request.url==="/rest/v1/rpc/check_tavern_request_limit") return response.end(JSON.stringify(rateAllowed));
      if(request.url==="/rest/v1/rpc/register_tavern_interest") return response.end(JSON.stringify(registrationResult));
      if(request.url==="/emails"){emailRequests+=1;return response.end(JSON.stringify({id:"email-1"}));}
      response.statusCode=404;response.end("{}");
    });
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  globalThis.fetch=(input,options)=>nativeFetch(String(input).startsWith("https://api.resend.com/")?`${base}/emails`:input,options);
  process.env.SUPABASE_URL=base;
  process.env.SUPABASE_SERVICE_ROLE_KEY="test-service-key";
  process.env.RESEND_API_KEY="test-resend-key";
  process.env.TAVERN_FROM_EMAIL="The Lewos Tavern <tavern@example.com>";
  process.env.RATE_LIMIT_SECRET="a-long-random-test-secret";
});

beforeEach(()=>{emailRequests=0;rateAllowed=true;registrationResult={status:"first_access_held",weekendLabel:"Weekend 01 · 30 Oct to 2 Nov 2026",seats:3,remaining:3};});
after(()=>{globalThis.fetch=nativeFetch;server.close();});

const post=(body,headers={"content-type":"application/json",accept:"application/json"})=>({httpMethod:"POST",headers,body:JSON.stringify(body)});
const valid={name:"Robert",email:"robert@example.com",weekend:"weekend-01",people:3,consent:"agreed","bot-field":""};

test("returns live remaining capacity",async()=>{
  const {handler}=await import("./first-access.mjs");
  const response=await handler({httpMethod:"GET",headers:{}});
  assert.equal(response.statusCode,200);
  assert.equal(JSON.parse(response.body).weekends[0].remaining,2);
});

test("holds an entire fitting party",async()=>{
  const {handler}=await import("./first-access.mjs");
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
  const {handler}=await import("./first-access.mjs");
  const response=await handler(post(valid));
  assert.equal(JSON.parse(response.body).emailSent,false);
  assert.equal(emailRequests,0);
});

test("preserves a group and offers the next fitting weekend",async()=>{
  registrationResult={status:"alternative_offered",requestedWeekend:"Weekend 01",offeredWeekend:"weekend-02",offeredWeekendLabel:"Weekend 02 · 6 to 9 Nov 2026",seats:3};
  const {handler}=await import("./first-access.mjs");
  const body=JSON.parse((await handler(post(valid))).body);
  assert.equal(body.status,"alternative_offered");
  assert.equal(body.offeredWeekend,"weekend-02");
  assert.equal(body.seats,3);
});

test("rejects more than six people for a featured weekend",async()=>{
  const {handler}=await import("./first-access.mjs");
  const response=await handler(post({...valid,people:7}));
  assert.equal(response.statusCode,400);
  assert.equal(JSON.parse(response.body).error,"featured_party_too_large");
});

test("rejects private groups smaller than four",async()=>{
  const {handler}=await import("./first-access.mjs");
  const response=await handler(post({...valid,weekend:"private",people:3}));
  assert.equal(response.statusCode,400);
  assert.equal(JSON.parse(response.body).error,"private_party_too_small");
});

test("accepts Netlify-style capitalised headers",async()=>{
  const {handler}=await import("./first-access.mjs");
  const response=await handler(post(valid,{"Content-Type":"application/json","Accept":"application/json"}));
  assert.equal(response.statusCode,200);
});

test("stops rapid automated requests before claiming seats",async()=>{
  rateAllowed=false;
  const {handler}=await import("./first-access.mjs");
  const response=await handler(post(valid));
  assert.equal(response.statusCode,429);
  assert.equal(JSON.parse(response.body).error,"too_many_requests");
  assert.equal(emailRequests,0);
});
