import assert from "node:assert/strict";
import {after,before,beforeEach,test} from "node:test";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import http from "node:http";
import path from "node:path";

const run=promisify(execFile);
const root=path.resolve(import.meta.dirname,"..");
let calls=[];let emailFails=false;let markFails=false;let server;

before(async()=>{
  server=http.createServer((request,response)=>{let body="";request.on("data",chunk=>body+=chunk);request.on("end",()=>{
    calls.push({url:request.url,body});response.setHeader("content-type","application/json");
    if(request.method==="GET"&&request.url.startsWith("/rest/v1/tavern_seat_claims?"))return response.end(JSON.stringify([{id:"00000000-0000-4000-8000-000000000001",status:"first_access_held",assigned_weekend_id:"00000000-0000-4000-8000-000000000010"}]));
    if(request.url==="/rest/v1/rpc/issue_tavern_checkout_invitation")return response.end(JSON.stringify({status:"invited",claimId:"00000000-0000-4000-8000-000000000001",name:"Robert",email:"robert@example.com",seats:3,weekendLabel:"Weekend 01 · 30 Oct to 2 Nov 2026",expiresAt:new Date(Date.now()+24*60*60*1000).toISOString()}));
    if(request.url==="/rest/v1/rpc/mark_tavern_invitation_sent"){if(markFails){response.statusCode=500;return response.end(JSON.stringify({error:"mark_failed"}));}return response.end(JSON.stringify({status:"marked"}));}
    if(request.url==="/rest/v1/rpc/revoke_tavern_checkout_invitation")return response.end(JSON.stringify({status:"revoked"}));
    if(request.url==="/emails"){if(emailFails){response.statusCode=500;return response.end(JSON.stringify({error:"failed"}));}return response.end(JSON.stringify({id:"email-1"}));}
    response.statusCode=404;response.end("{}");
  });});
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
});
beforeEach(()=>{calls=[];emailFails=false;markFails=false;});
after(()=>server.close());

const env=()=>({...process.env,SUPABASE_URL:`http://127.0.0.1:${server.address().port}`,SUPABASE_SERVICE_ROLE_KEY:"service",RESEND_API_KEY:"resend",RESEND_API_URL:`http://127.0.0.1:${server.address().port}/emails`,TAVERN_FROM_EMAIL:"Tavern <test@example.com>",URL:`http://127.0.0.1:${server.address().port}`,TAVERN_PAYMENTS_ENABLED:"true",BOOKING_TERMS_VERSION:"booking-test-v1",BOOKING_TERMS_DOCUMENT_URL:"/documents/terms.pdf",TRAVEL_INFORMATION_DOCUMENT_URL:"/documents/travel.pdf",PUBLIC_BOOKING_OPENS_AT:new Date(Date.now()+48*60*60*1000).toISOString(),NODE_ENV:"test"});

test("dry run reports candidates without issuing or emailing",async()=>{
  const result=await run(process.execPath,["scripts/issue-first-access.mjs"],{cwd:root,env:env()});
  assert.match(result.stdout,/Dry run: 1 First Access invitation eligible/);
  assert.equal(calls.some(call=>call.url.includes("issue_tavern_checkout_invitation")),false);
  assert.equal(calls.some(call=>call.url==="/emails"),false);
});

test("send mode issues a private token, emails it and records delivery",async()=>{
  const result=await run(process.execPath,["scripts/issue-first-access.mjs","--send"],{cwd:root,env:{...env(),FIRST_ACCESS_SEND_CONFIRM:"SEND_FIRST_ACCESS_NOW"}});
  assert.match(result.stdout,/Sent 1 First Access invitation/);
  assert.equal(calls.some(call=>call.url==="/rest/v1/rpc/issue_tavern_checkout_invitation"),true);
  assert.equal(calls.some(call=>call.url==="/emails"),true);
  assert.equal(calls.some(call=>call.url==="/rest/v1/rpc/mark_tavern_invitation_sent"),true);
  const email=JSON.parse(calls.find(call=>call.url==="/emails").body);
  assert.match(email.html,/\/tavern\/checkout\/\?token=/);
});

test("an email failure revokes the unusable invitation",async()=>{
  emailFails=true;
  await assert.rejects(run(process.execPath,["scripts/issue-first-access.mjs","--send"],{cwd:root,env:{...env(),FIRST_ACCESS_SEND_CONFIRM:"SEND_FIRST_ACCESS_NOW"}}));
  assert.equal(calls.some(call=>call.url==="/rest/v1/rpc/revoke_tavern_checkout_invitation"),true);
  assert.equal(calls.some(call=>call.url==="/rest/v1/rpc/mark_tavern_invitation_sent"),false);
});

test("a delivery-record failure never revokes the link already emailed to the guest",async()=>{
  markFails=true;
  await assert.rejects(run(process.execPath,["scripts/issue-first-access.mjs","--send"],{cwd:root,env:{...env(),FIRST_ACCESS_SEND_CONFIRM:"SEND_FIRST_ACCESS_NOW"}}));
  assert.equal(calls.some(call=>call.url==="/emails"),true);
  assert.equal(calls.some(call=>call.url==="/rest/v1/rpc/mark_tavern_invitation_sent"),true);
  assert.equal(calls.some(call=>call.url==="/rest/v1/rpc/revoke_tavern_checkout_invitation"),false);
});

test("invitations cannot extend beyond the public opening time",async()=>{
  await assert.rejects(run(process.execPath,["scripts/issue-first-access.mjs","--send"],{cwd:root,env:{...env(),FIRST_ACCESS_SEND_CONFIRM:"SEND_FIRST_ACCESS_NOW",PUBLIC_BOOKING_OPENS_AT:new Date(Date.now()+12*60*60*1000).toISOString()}}));
  assert.equal(calls.some(call=>call.url==="/emails"),false);
  assert.equal(calls.some(call=>call.url==="/rest/v1/rpc/revoke_tavern_checkout_invitation"),true);
});
