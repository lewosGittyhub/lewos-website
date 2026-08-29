import assert from "node:assert/strict";
import {after,before,beforeEach,test} from "node:test";
import {createHmac} from "node:crypto";
import http from "node:http";

let calls=[];let holdResult;let confirmationResult;let stripeFails=false;let attachFails=false;let attachResult;let emailFails=false;let markFails=false;let emailRequests=0;let server;const nativeFetch=globalThis.fetch;
before(async()=>{
  server=http.createServer((request,response)=>{let body="";request.on("data",chunk=>body+=chunk);request.on("end",()=>{calls.push({url:request.url,body,headers:request.headers});response.setHeader("content-type","application/json");
    if(request.url==="/rest/v1/rpc/begin_tavern_first_access_checkout"||request.url==="/rest/v1/rpc/begin_tavern_checkout")return response.end(JSON.stringify(holdResult));
    if(request.url==="/rest/v1/rpc/check_tavern_request_limit")return response.end("true");
    if(request.url==="/rest/v1/rpc/attach_tavern_checkout_session"){if(attachFails){response.statusCode=500;return response.end(JSON.stringify({message:"attach_failed"}));}return response.end(JSON.stringify(attachResult));}
    if(request.url==="/rest/v1/rpc/release_tavern_checkout")return response.end(JSON.stringify({status:"released"}));
    if(request.url==="/rest/v1/rpc/confirm_tavern_payment")return response.end(JSON.stringify(confirmationResult));
    if(request.url==="/rest/v1/rpc/mark_tavern_confirmation_email_sent"){if(markFails){response.statusCode=500;return response.end(JSON.stringify({message:"mark_failed"}));}return response.end(JSON.stringify({status:"marked"}));}
    if(request.url==="/v1/checkout/sessions"){if(stripeFails){response.statusCode=500;return response.end(JSON.stringify({error:"failed"}));}return response.end(JSON.stringify({id:"cs_test_1",url:"https://checkout.stripe.test/session"}));}
    if(request.url==="/v1/checkout/sessions/cs_test_1/expire")return response.end(JSON.stringify({id:"cs_test_1",status:"expired"}));
    if(request.url==="/documents/terms.pdf"||request.url==="/documents/travel.pdf"){response.setHeader("content-type","application/pdf");return response.end(`%PDF-1.4\n${"test-document".repeat(20)}\n%%EOF`);}
    if(request.url==="/emails"){emailRequests+=1;if(emailFails){response.statusCode=500;return response.end(JSON.stringify({message:"email_failed"}));}return response.end(JSON.stringify({id:"email-1"}));}
    response.statusCode=404;response.end("{}");});});
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  globalThis.fetch=(input,options)=>{const url=String(input);if(url==="https://api.stripe.com/v1/checkout/sessions")return nativeFetch(`${base}/v1/checkout/sessions`,options);if(url.startsWith("https://api.stripe.com/v1/checkout/sessions/"))return nativeFetch(`${base}${new URL(url).pathname}`,options);if(url.startsWith("https://api.resend.com/"))return nativeFetch(`${base}/emails`,options);return nativeFetch(input,options);};
  process.env.SUPABASE_URL=base;process.env.SUPABASE_SERVICE_ROLE_KEY="service";process.env.STRIPE_SECRET_KEY="sk_test_fake";process.env.STRIPE_WEBHOOK_SECRET="whsec_test";process.env.RESEND_API_KEY="re_test";process.env.TAVERN_FROM_EMAIL="Tavern <test@example.com>";process.env.RATE_LIMIT_SECRET="rate-test-secret";process.env.URL=base;
  process.env.PUBLIC_BOOKING_OPENS_AT="2026-01-01T00:00:00Z";
  process.env.TAVERN_PAYMENTS_ENABLED="true";
  process.env.BOOKING_TERMS_VERSION="booking-test-v1";
  process.env.BOOKING_TERMS_DOCUMENT_URL="/documents/terms.pdf";
  process.env.TRAVEL_INFORMATION_DOCUMENT_URL="/documents/travel.pdf";
  process.env.NODE_ENV="test";
});
beforeEach(()=>{calls=[];stripeFails=false;attachFails=false;emailFails=false;markFails=false;emailRequests=0;process.env.TAVERN_PAYMENTS_ENABLED="true";process.env.BOOKING_TERMS_VERSION="booking-test-v1";process.env.BOOKING_TERMS_DOCUMENT_URL="/documents/terms.pdf";process.env.TRAVEL_INFORMATION_DOCUMENT_URL="/documents/travel.pdf";process.env.PUBLIC_BOOKING_OPENS_AT="2026-01-01T00:00:00Z";holdResult={status:"payment_pending",claimId:"claim-1",name:"Robert",email:"robert@example.com",seats:3,weekendLabel:"Weekend 01 · 30 Oct to 2 Nov 2026",holdExpiresAt:"2026-08-27T18:00:00Z"};confirmationResult={status:"paid",claimId:"claim-1",name:"Robert",email:"robert@example.com",seats:3,weekendLabel:"Weekend 01",termsVersion:"booking-test-v1",confirmationEmailSent:false};});
beforeEach(()=>{attachResult={status:"attached"};});
after(()=>{globalThis.fetch=nativeFetch;server.close();});

test("First Access invitation creates a Stripe session only after a seat hold",async()=>{
  const {handler}=await import("../netlify/functions/create-checkout-session.mjs");
  const result=await handler({httpMethod:"POST",body:JSON.stringify({mode:"first_access",token:"abcdefghijklmnopqrstuvwxyzABCDEF123456",adultConfirmed:true,privacyAccepted:true})});
  assert.equal(result.statusCode,200);assert.equal(JSON.parse(result.body).checkoutUrl,"https://checkout.stripe.test/session");
  assert.equal(calls.filter(call=>call.url==="/rest/v1/rpc/check_tavern_request_limit").length,2);assert.equal(calls[2].url,"/rest/v1/rpc/begin_tavern_first_access_checkout");assert.equal(calls[3].url,"/v1/checkout/sessions");assert.equal(calls[4].url,"/rest/v1/rpc/attach_tavern_checkout_session");
});

test("public checkout holds the complete group before contacting Stripe",async()=>{
  const {handler}=await import("../netlify/functions/create-checkout-session.mjs");
  const result=await handler({httpMethod:"POST",body:JSON.stringify({mode:"public",name:"Robert",email:"robert@example.com",weekend:"weekend-02",people:3,adultConfirmed:true,privacyAccepted:true})});
  assert.equal(result.statusCode,200);assert.equal(calls[2].url,"/rest/v1/rpc/begin_tavern_checkout");
});

test("an existing First Access checkout resumes without creating another Stripe session",async()=>{
  holdResult={...holdResult,checkoutUrl:"https://checkout.stripe.test/existing"};
  const {handler}=await import("../netlify/functions/create-checkout-session.mjs");
  const result=await handler({httpMethod:"POST",body:JSON.stringify({mode:"first_access",token:"abcdefghijklmnopqrstuvwxyzABCDEF123456",adultConfirmed:true,privacyAccepted:true})});
  assert.equal(result.statusCode,200);assert.equal(JSON.parse(result.body).resumed,true);assert.equal(calls.some(call=>call.url==="/v1/checkout/sessions"),false);
  const beginBody=JSON.parse(calls.find(call=>call.url==="/rest/v1/rpc/begin_tavern_first_access_checkout").body);assert.equal(beginBody.p_adult_confirmed,true);assert.equal(beginBody.p_privacy_accepted,true);
});

test("a full weekend never creates a Stripe session",async()=>{
  holdResult={status:"not_available",remaining:2};
  const {handler}=await import("../netlify/functions/create-checkout-session.mjs");
  const result=await handler({httpMethod:"POST",body:JSON.stringify({mode:"public",name:"Robert",email:"robert@example.com",weekend:"weekend-01",people:3,adultConfirmed:true,privacyAccepted:true,filmingConsent:true})});
  assert.equal(result.statusCode,409);assert.equal(calls.some(call=>call.url==="/v1/checkout/sessions"),false);
});

test("a Stripe failure releases the temporary hold",async()=>{
  stripeFails=true;const {handler}=await import("../netlify/functions/create-checkout-session.mjs");
  const result=await handler({httpMethod:"POST",body:JSON.stringify({mode:"public",name:"Robert",email:"robert@example.com",weekend:"weekend-01",people:1,adultConfirmed:true,privacyAccepted:true,filmingConsent:true})});
  assert.equal(result.statusCode,503);assert.equal(calls.at(-1).url,"/rest/v1/rpc/release_tavern_checkout");
});

test("an attachment failure never returns a payable Stripe link and releases the hold",async()=>{
  attachFails=true;const {handler}=await import("../netlify/functions/create-checkout-session.mjs");
  const result=await handler({httpMethod:"POST",body:JSON.stringify({mode:"first_access",token:"abcdefghijklmnopqrstuvwxyzABCDEF123456",adultConfirmed:true,privacyAccepted:true})});
  assert.equal(result.statusCode,503);assert.equal(calls.some(call=>call.url==="/v1/checkout/sessions/cs_test_1/expire"),true);assert.equal(calls.at(-1).url,"/rest/v1/rpc/release_tavern_checkout");assert.equal(JSON.parse(result.body).checkoutUrl,undefined);
});

test("a rejected attachment response never returns a payable Stripe link",async()=>{
  attachResult={status:"unknown_payment"};
  const {handler}=await import("../netlify/functions/create-checkout-session.mjs");
  const result=await handler({httpMethod:"POST",body:JSON.stringify({mode:"first_access",token:"abcdefghijklmnopqrstuvwxyzABCDEF123456",adultConfirmed:true,privacyAccepted:true})});
  assert.equal(result.statusCode,503);assert.equal(calls.some(call=>call.url==="/v1/checkout/sessions/cs_test_1/expire"),true);assert.equal(calls.at(-1).url,"/rest/v1/rpc/release_tavern_checkout");assert.equal(JSON.parse(result.body).checkoutUrl,undefined);
});

test("public checkout requires adult and privacy confirmations",async()=>{
  const {handler}=await import("../netlify/functions/create-checkout-session.mjs");
  const result=await handler({httpMethod:"POST",body:JSON.stringify({mode:"public",name:"Robert",email:"robert@example.com",weekend:"weekend-02",people:1})});
  assert.equal(result.statusCode,400);assert.equal(calls.some(call=>call.url==="/rest/v1/rpc/begin_tavern_checkout"),false);
});

test("First Access checkout requires adult and privacy confirmations",async()=>{
  const {handler}=await import("../netlify/functions/create-checkout-session.mjs");
  const result=await handler({httpMethod:"POST",body:JSON.stringify({mode:"first_access",token:"abcdefghijklmnopqrstuvwxyzABCDEF123456"})});
  assert.equal(result.statusCode,400);assert.equal(calls.some(call=>call.url==="/rest/v1/rpc/begin_tavern_first_access_checkout"),false);
});

test("public checkout remains closed before its configured opening",async()=>{
  process.env.PUBLIC_BOOKING_OPENS_AT="2099-01-01T00:00:00Z";
  const {handler}=await import("../netlify/functions/create-checkout-session.mjs");
  const result=await handler({httpMethod:"POST",body:JSON.stringify({mode:"public",name:"Robert",email:"robert@example.com",weekend:"weekend-02",people:1,adultConfirmed:true,privacyAccepted:true})});
  assert.equal(result.statusCode,403);assert.equal(JSON.parse(result.body).error,"booking_not_open");assert.equal(calls.length,0);
  process.env.PUBLIC_BOOKING_OPENS_AT="2026-01-01T00:00:00Z";
});

test("all payment routes remain closed while the global payment gate is off",async()=>{
  process.env.TAVERN_PAYMENTS_ENABLED="false";
  const {handler}=await import("../netlify/functions/create-checkout-session.mjs");
  const result=await handler({httpMethod:"POST",body:JSON.stringify({mode:"first_access",token:"abcdefghijklmnopqrstuvwxyzABCDEF123456",adultConfirmed:true,privacyAccepted:true})});
  assert.equal(result.statusCode,503);assert.equal(calls.length,0);
});

test("payments remain closed until a final terms version is configured",async()=>{
  delete process.env.BOOKING_TERMS_VERSION;
  const {handler}=await import("../netlify/functions/create-checkout-session.mjs");
  const result=await handler({httpMethod:"POST",body:JSON.stringify({mode:"first_access",token:"abcdefghijklmnopqrstuvwxyzABCDEF123456",adultConfirmed:true,privacyAccepted:true})});
  assert.equal(result.statusCode,503);assert.equal(calls.length,0);
});

test("payments remain closed until immutable booking documents are configured",async()=>{
  delete process.env.BOOKING_TERMS_DOCUMENT_URL;
  const {handler}=await import("../netlify/functions/create-checkout-session.mjs");
  const result=await handler({httpMethod:"POST",body:JSON.stringify({mode:"first_access",token:"abcdefghijklmnopqrstuvwxyzABCDEF123456",adultConfirmed:true,privacyAccepted:true})});
  assert.equal(result.statusCode,503);assert.equal(calls.length,0);
});

test("an invalid public opening timestamp keeps public booking closed",async()=>{
  process.env.PUBLIC_BOOKING_OPENS_AT="not-a-date";
  const {handler}=await import("../netlify/functions/create-checkout-session.mjs");
  const result=await handler({httpMethod:"POST",body:JSON.stringify({mode:"public",name:"Robert",email:"robert@example.com",weekend:"weekend-02",people:1,adultConfirmed:true,privacyAccepted:true})});
  assert.equal(result.statusCode,403);assert.equal(calls.length,0);
});

test("Weekend 01 can be booked when optional filming consent is declined",async()=>{
  const {handler}=await import("../netlify/functions/create-checkout-session.mjs");
  const result=await handler({httpMethod:"POST",body:JSON.stringify({mode:"public",name:"Robert",email:"robert@example.com",weekend:"weekend-01",people:1,adultConfirmed:true,privacyAccepted:true})});
  assert.equal(result.statusCode,200);assert.equal(calls.some(call=>call.url==="/rest/v1/rpc/begin_tavern_checkout"),true);
});

test("webhook rejects an invalid signature",async()=>{
  const {handler}=await import("../netlify/functions/stripe-webhook.mjs");
  const result=await handler({httpMethod:"POST",headers:{"stripe-signature":"t=1,v1=no"},body:"{}"});assert.equal(result.statusCode,400);
});

test("paid Stripe webhook confirms the matching claim",async()=>{
  const {handler}=await import("../netlify/functions/stripe-webhook.mjs");
  const body=JSON.stringify({type:"checkout.session.completed",created:Math.floor(Date.now()/1000),data:{object:{payment_status:"paid",metadata:{payment_reference:"payment-1"}}}});
  const timestamp=Math.floor(Date.now()/1000);const signature=createHmac("sha256","whsec_test").update(`${timestamp}.${body}`).digest("hex");
  const result=await handler({httpMethod:"POST",headers:{"Stripe-Signature":`t=${timestamp},v1=${signature}`},body});
  assert.equal(result.statusCode,200);assert.equal(JSON.parse(result.body).result.status,"paid");assert.equal(emailRequests,1);assert.equal(calls.some(call=>call.url==="/rest/v1/rpc/mark_tavern_confirmation_email_sent"),true);
  const email=JSON.parse(calls.find(call=>call.url==="/emails").body);assert.equal(email.attachments.length,2);assert.match(email.attachments[0].content,/^[A-Za-z0-9+/]+=*$/);
});

test("a confirmation email failure makes Stripe retry the webhook",async()=>{
  emailFails=true;
  const {handler}=await import("../netlify/functions/stripe-webhook.mjs");
  const body=JSON.stringify({type:"checkout.session.completed",created:Math.floor(Date.now()/1000),data:{object:{payment_status:"paid",metadata:{payment_reference:"payment-1"}}}});
  const timestamp=Math.floor(Date.now()/1000);const signature=createHmac("sha256","whsec_test").update(`${timestamp}.${body}`).digest("hex");
  const result=await handler({httpMethod:"POST",headers:{"stripe-signature":`t=${timestamp},v1=${signature}`},body});
  assert.equal(result.statusCode,500);assert.equal(JSON.parse(result.body).error,"confirmation_email_pending");
});

test("a duplicate paid webhook retries an unsent confirmation without duplicating a sent one",async()=>{
  confirmationResult={...confirmationResult,duplicate:true,confirmationEmailSent:false};
  const {handler}=await import("../netlify/functions/stripe-webhook.mjs");
  const body=JSON.stringify({type:"checkout.session.completed",created:Math.floor(Date.now()/1000),data:{object:{payment_status:"paid",metadata:{payment_reference:"payment-1"}}}});
  const timestamp=Math.floor(Date.now()/1000);const signature=createHmac("sha256","whsec_test").update(`${timestamp}.${body}`).digest("hex");
  const retry=await handler({httpMethod:"POST",headers:{"stripe-signature":`t=${timestamp},v1=bad,v1=${signature}`},body});
  assert.equal(retry.statusCode,200);assert.equal(emailRequests,1);
  confirmationResult={...confirmationResult,confirmationEmailSent:true};
  const done=await handler({httpMethod:"POST",headers:{"stripe-signature":`t=${timestamp},v1=${signature}`},body});
  assert.equal(done.statusCode,200);assert.equal(emailRequests,1);
});

test("paid Stripe checkout that cannot be confirmed is retried and never emails a false confirmation",async()=>{
  confirmationResult={status:"expired",claimId:"claim-1"};
  const {handler}=await import("../netlify/functions/stripe-webhook.mjs");
  const body=JSON.stringify({type:"checkout.session.completed",created:Math.floor(Date.now()/1000),data:{object:{payment_status:"paid",metadata:{payment_reference:"payment-1"}}}});
  const timestamp=Math.floor(Date.now()/1000);const signature=createHmac("sha256","whsec_test").update(`${timestamp}.${body}`).digest("hex");
  const result=await handler({httpMethod:"POST",headers:{"stripe-signature":`t=${timestamp},v1=${signature}`},body});
  assert.equal(result.statusCode,500);assert.equal(emailRequests,0);
});

test("an expired Stripe session releases its seats",async()=>{
  const {handler}=await import("../netlify/functions/stripe-webhook.mjs");
  const body=JSON.stringify({type:"checkout.session.expired",created:Math.floor(Date.now()/1000),data:{object:{metadata:{payment_reference:"payment-1"}}}});
  const timestamp=Math.floor(Date.now()/1000);const signature=createHmac("sha256","whsec_test").update(`${timestamp}.${body}`).digest("hex");
  const result=await handler({httpMethod:"POST",headers:{"stripe-signature":`t=${timestamp},v1=${signature}`},body});
  assert.equal(result.statusCode,200);assert.equal(calls.at(-1).url,"/rest/v1/rpc/release_tavern_checkout");
});
