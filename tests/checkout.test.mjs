import assert from "node:assert/strict";
import {after,before,beforeEach,test} from "node:test";
import {createHmac} from "node:crypto";
import http from "node:http";
import {listenOnTestPort,stopTestServer} from "./_test-server.mjs";

// Deze test roept echte functies aan. Sinds 7 september 2026 weigert elke omgeving die
// niet verklaart wat hij is — zie netlify/functions/_deploy-context.mjs. Een testrun is
// een omgeving met eigen instellingen, dus die verklaart zich hier als zodanig.
process.env.LEWOS_PREVIEW_SAFE="true";

let calls=[];let holdResult;let confirmationResult;let stripeFails=false;let attachFails=false;let attachResult;let emailFails=false;let markFails=false;let emailRequests=0;let server;const nativeFetch=globalThis.fetch;
before(async()=>{
  server=http.createServer((request,response)=>{let body="";request.on("data",chunk=>body+=chunk);request.on("end",()=>{calls.push({url:request.url,body,headers:request.headers});response.setHeader("content-type","application/json");
    if(request.url==="/rest/v1/rpc/begin_tavern_first_access_checkout"||request.url==="/rest/v1/rpc/begin_tavern_checkout")return response.end(JSON.stringify(holdResult));
    if(request.url==="/rest/v1/rpc/check_tavern_request_limit")return response.end("true");
    if(request.url==="/rest/v1/rpc/tavern_public_booking_ready")return response.end("true");
    if(request.url==="/rest/v1/rpc/attach_tavern_checkout_session"){if(attachFails){response.statusCode=500;return response.end(JSON.stringify({message:"attach_failed"}));}return response.end(JSON.stringify(attachResult));}
    if(request.url==="/rest/v1/rpc/release_tavern_checkout")return response.end(JSON.stringify({status:"released"}));
    if(request.url==="/rest/v1/rpc/confirm_tavern_payment")return response.end(JSON.stringify(confirmationResult));
    if(request.url==="/rest/v1/rpc/mark_tavern_confirmation_email_sent"){if(markFails){response.statusCode=500;return response.end(JSON.stringify({message:"mark_failed"}));}return response.end(JSON.stringify({status:"marked"}));}
    if(request.url==="/v1/checkout/sessions"){if(stripeFails){response.statusCode=500;return response.end(JSON.stringify({error:"failed"}));}return response.end(JSON.stringify({id:"cs_test_1",url:"https://checkout.stripe.test/session"}));}
    if(request.url==="/v1/checkout/sessions/cs_test_1/expire")return response.end(JSON.stringify({id:"cs_test_1",status:"expired"}));
    if(request.url==="/documents/terms.pdf"||request.url==="/documents/travel.pdf"){response.setHeader("content-type","application/pdf");return response.end(`%PDF-1.4\n${"test-document".repeat(20)}\n%%EOF`);}
    if(request.url==="/emails"){emailRequests+=1;if(emailFails){response.statusCode=500;return response.end(JSON.stringify({message:"email_failed"}));}return response.end(JSON.stringify({id:"email-1"}));}
    response.statusCode=404;response.end("{}");});});
  await listenOnTestPort(server);
  const base=`http://127.0.0.1:${server.address().port}`;
  // Een test mag nooit het echte netwerk op. Alles wat we niet zelf omleiden faalt hier
  // hard: in een afgeschermde omgeving zou zo'n verzoek anders blijven hangen tot een
  // time-out, en dan lijkt de suite vast te lopen zonder te zeggen waarop.
  globalThis.fetch=(input,options)=>{
    const url=String(input);
    if(url==="https://api.stripe.com/v1/checkout/sessions")return nativeFetch(`${base}/v1/checkout/sessions`,options);
    if(url.startsWith("https://api.stripe.com/v1/checkout/sessions/"))return nativeFetch(`${base}${new URL(url).pathname}`,options);
    if(url.startsWith("https://api.resend.com/"))return nativeFetch(`${base}/emails`,options);
    if(url.startsWith(base))return nativeFetch(input,options);
    return Promise.reject(new Error(`test_reached_the_network: ${url}`));
  };
  process.env.SUPABASE_URL=base;process.env.SUPABASE_SERVICE_ROLE_KEY="service";process.env.STRIPE_SECRET_KEY="sk_test_fake";process.env.STRIPE_WEBHOOK_SECRET="whsec_test";process.env.RESEND_API_KEY="re_test";process.env.TAVERN_FROM_EMAIL="Tavern <test@example.com>";process.env.RATE_LIMIT_SECRET="rate-test-secret";process.env.URL=base;
  process.env.PUBLIC_BOOKING_OPENS_AT="2026-01-01T00:00:00Z";
  process.env.TAVERN_PAYMENTS_ENABLED="true";
  process.env.BOOKING_TERMS_VERSION="booking-test-v1";
  process.env.BOOKING_TERMS_DOCUMENT_URL="/documents/terms.pdf";
  process.env.TRAVEL_INFORMATION_DOCUMENT_URL="/documents/travel.pdf";
  process.env.NODE_ENV="test";
  process.env.LEWOS_GENERAL_EMAIL="lewos.co@gmail.com";
  process.env.FONTECHA_ACCOMMODATION_EMAIL="accommodation@example.invalid";
});

// De payloads die daadwerkelijk naar Resend gingen, op ontvanger. Niet de broncode:
// welk postvak welke mail krijgt is precies wat hier fout kan gaan.
const mailsAan=adres=>calls.filter(call=>call.url==="/emails").map(call=>JSON.parse(call.body)).filter(mail=>[].concat(mail.to).includes(adres));
beforeEach(()=>{calls=[];stripeFails=false;attachFails=false;emailFails=false;markFails=false;emailRequests=0;process.env.TAVERN_PAYMENTS_ENABLED="true";process.env.BOOKING_TERMS_VERSION="booking-test-v1";process.env.BOOKING_TERMS_DOCUMENT_URL="/documents/terms.pdf";process.env.TRAVEL_INFORMATION_DOCUMENT_URL="/documents/travel.pdf";process.env.PUBLIC_BOOKING_OPENS_AT="2026-01-01T00:00:00Z";holdResult={status:"payment_pending",claimId:"claim-1",name:"Robert",email:"robert@example.com",seats:3,priceCents:202500,weekendLabel:"Weekend 01 · 30 Oct to 2 Nov 2026",holdExpiresAt:"2026-08-27T18:00:00Z"};confirmationResult={status:"paid",claimId:"claim-1",name:"Robert",email:"robert@example.com",seats:3,weekendLabel:"Weekend 01",arrivalDate:"2026-10-30",departureDate:"2026-11-02",termsVersion:"booking-test-v1",confirmationEmailSent:false};});
beforeEach(()=>{attachResult={status:"attached"};});
// Sluit de mockserver echt af. Zonder de open verbindingen te verbreken blijft het
// proces na de laatste test wachten en lijkt de suite te hangen.
after(async()=>{globalThis.fetch=nativeFetch;await stopTestServer(server);server=null;});

test("First Access invitation creates a Stripe session only after a seat hold",async()=>{
  const {handler}=await import("../netlify/functions/create-checkout-session.mjs");
  const result=await handler({httpMethod:"POST",body:JSON.stringify({mode:"first_access",token:"abcdefghijklmnopqrstuvwxyzABCDEF123456",adultConfirmed:true,privacyAccepted:true,filmingAcknowledged:true})});
  assert.equal(result.statusCode,200);assert.equal(JSON.parse(result.body).checkoutUrl,"https://checkout.stripe.test/session");
  assert.equal(calls.filter(call=>call.url==="/rest/v1/rpc/check_tavern_request_limit").length,2);assert.equal(calls[2].url,"/rest/v1/rpc/begin_tavern_first_access_checkout");assert.equal(calls[3].url,"/v1/checkout/sessions");assert.equal(calls[4].url,"/rest/v1/rpc/attach_tavern_checkout_session");
});

test("public checkout holds the complete group before contacting Stripe",async()=>{
  const {handler}=await import("../netlify/functions/create-checkout-session.mjs");
  const result=await handler({httpMethod:"POST",body:JSON.stringify({mode:"public",name:"Robert",email:"robert@example.com",weekend:"weekend-02",people:3,adultConfirmed:true,privacyAccepted:true})});
  assert.equal(result.statusCode,200);assert.equal(calls[0].url,"/rest/v1/rpc/tavern_public_booking_ready");assert.equal(calls[3].url,"/rest/v1/rpc/begin_tavern_checkout");
  const beginBody=JSON.parse(calls[3].body);assert.equal(beginBody.p_public_booking_opens_at,"2026-01-01T00:00:00Z");
});

test("the atomic database gate can still stop public checkout after the readiness check",async()=>{
  holdResult={status:"first_access_windows_active"};
  const {handler}=await import("../netlify/functions/create-checkout-session.mjs");
  const result=await handler({httpMethod:"POST",body:JSON.stringify({mode:"public",name:"Robert",email:"robert@example.com",weekend:"weekend-02",people:1,adultConfirmed:true,privacyAccepted:true})});
  assert.equal(result.statusCode,409);assert.equal(JSON.parse(result.body).error,"first_access_windows_active");assert.equal(calls.some(call=>call.url==="/v1/checkout/sessions"),false);
});

test("an existing First Access checkout resumes without creating another Stripe session",async()=>{
  holdResult={...holdResult,checkoutUrl:"https://checkout.stripe.test/existing"};
  const {handler}=await import("../netlify/functions/create-checkout-session.mjs");
  const result=await handler({httpMethod:"POST",body:JSON.stringify({mode:"first_access",token:"abcdefghijklmnopqrstuvwxyzABCDEF123456",adultConfirmed:true,privacyAccepted:true,filmingAcknowledged:true})});
  assert.equal(result.statusCode,200);assert.equal(JSON.parse(result.body).resumed,true);assert.equal(calls.some(call=>call.url==="/v1/checkout/sessions"),false);
  const beginBody=JSON.parse(calls.find(call=>call.url==="/rest/v1/rpc/begin_tavern_first_access_checkout").body);assert.equal(beginBody.p_adult_confirmed,true);assert.equal(beginBody.p_privacy_accepted,true);
});

// Directe verkoop, 4 september 2026. Twee keer op betalen klikken mag geen tweede
// stoelhold en geen tweede Stripe-sessie opleveren. Zonder de hervat-tak in
// begin_tavern_checkout hield een bezoeker met drie kliks een heel weekend bezet.
test("a second public checkout attempt resumes the same payment instead of taking more seats",async()=>{
  holdResult={...holdResult,checkoutUrl:"https://checkout.stripe.test/existing",paymentReference:"ref-al-bezig"};
  const {handler}=await import("../netlify/functions/create-checkout-session.mjs");
  const invoer={mode:"public",name:"Robert",email:"robert@example.com",weekend:"weekend-01",people:3,adultConfirmed:true,privacyAccepted:true,filmingAcknowledged:true,allergies:"Peanuts",dietary:"",message:""};
  const result=await handler({httpMethod:"POST",body:JSON.stringify(invoer)});
  const body=JSON.parse(result.body);
  assert.equal(result.statusCode,200);
  assert.equal(body.resumed,true,"a repeated attempt must be reported as a resume");
  assert.equal(body.checkoutUrl,"https://checkout.stripe.test/existing","it must return the payment that is already open");
  assert.equal(calls.some(call=>call.url==="/v1/checkout/sessions"),false,"a second Stripe session may never be created");
  // De allergie die de bezoeker de tweede keer intikt gaat wél mee naar de database.
  const beginBody=JSON.parse(calls.find(call=>call.url==="/rest/v1/rpc/begin_tavern_checkout").body);
  assert.equal(beginBody.p_allergies,"Peanuts");
});

test("a public checkout that the database refuses over an open invitation never reaches Stripe",async()=>{
  // Een uitgegeven uitnodiging houdt zijn venster. De verkoop wordt dan geweigerd, en er
  // mag geen betaalscherm openen dat daarna nergens heen kan.
  holdResult={status:"first_access_windows_active"};
  const {handler}=await import("../netlify/functions/create-checkout-session.mjs");
  const result=await handler({httpMethod:"POST",body:JSON.stringify({mode:"public",name:"Robert",email:"robert@example.com",weekend:"weekend-01",people:2,adultConfirmed:true,privacyAccepted:true,filmingAcknowledged:true})});
  assert.equal(result.statusCode,409);
  assert.equal(JSON.parse(result.body).error,"first_access_windows_active");
  assert.equal(calls.some(call=>call.url==="/v1/checkout/sessions"),false);
});

test("a full weekend never creates a Stripe session",async()=>{
  holdResult={status:"not_available",remaining:2};
  const {handler}=await import("../netlify/functions/create-checkout-session.mjs");
  const result=await handler({httpMethod:"POST",body:JSON.stringify({mode:"public",name:"Robert",email:"robert@example.com",weekend:"weekend-01",people:3,adultConfirmed:true,privacyAccepted:true,filmingAcknowledged:true})});
  assert.equal(result.statusCode,409);assert.equal(calls.some(call=>call.url==="/v1/checkout/sessions"),false);
});

test("a Stripe failure releases the temporary hold",async()=>{
  stripeFails=true;const {handler}=await import("../netlify/functions/create-checkout-session.mjs");
  const result=await handler({httpMethod:"POST",body:JSON.stringify({mode:"public",name:"Robert",email:"robert@example.com",weekend:"weekend-01",people:1,adultConfirmed:true,privacyAccepted:true,filmingAcknowledged:true})});
  assert.equal(result.statusCode,503);assert.equal(calls.at(-1).url,"/rest/v1/rpc/release_tavern_checkout");
});

test("an attachment failure never returns a payable Stripe link and releases the hold",async()=>{
  attachFails=true;const {handler}=await import("../netlify/functions/create-checkout-session.mjs");
  const result=await handler({httpMethod:"POST",body:JSON.stringify({mode:"first_access",token:"abcdefghijklmnopqrstuvwxyzABCDEF123456",adultConfirmed:true,privacyAccepted:true,filmingAcknowledged:true})});
  assert.equal(result.statusCode,503);assert.equal(calls.some(call=>call.url==="/v1/checkout/sessions/cs_test_1/expire"),true);assert.equal(calls.at(-1).url,"/rest/v1/rpc/release_tavern_checkout");assert.equal(JSON.parse(result.body).checkoutUrl,undefined);
});

test("a rejected attachment response never returns a payable Stripe link",async()=>{
  attachResult={status:"unknown_payment"};
  const {handler}=await import("../netlify/functions/create-checkout-session.mjs");
  const result=await handler({httpMethod:"POST",body:JSON.stringify({mode:"first_access",token:"abcdefghijklmnopqrstuvwxyzABCDEF123456",adultConfirmed:true,privacyAccepted:true,filmingAcknowledged:true})});
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
  const result=await handler({httpMethod:"POST",body:JSON.stringify({mode:"first_access",token:"abcdefghijklmnopqrstuvwxyzABCDEF123456",adultConfirmed:true,privacyAccepted:true,filmingAcknowledged:true})});
  assert.equal(result.statusCode,503);assert.equal(calls.length,0);
});

test("payments remain closed until a final terms version is configured",async()=>{
  delete process.env.BOOKING_TERMS_VERSION;
  const {handler}=await import("../netlify/functions/create-checkout-session.mjs");
  const result=await handler({httpMethod:"POST",body:JSON.stringify({mode:"first_access",token:"abcdefghijklmnopqrstuvwxyzABCDEF123456",adultConfirmed:true,privacyAccepted:true,filmingAcknowledged:true})});
  assert.equal(result.statusCode,503);assert.equal(calls.length,0);
});

test("payments remain closed until immutable booking documents are configured",async()=>{
  delete process.env.BOOKING_TERMS_DOCUMENT_URL;
  const {handler}=await import("../netlify/functions/create-checkout-session.mjs");
  const result=await handler({httpMethod:"POST",body:JSON.stringify({mode:"first_access",token:"abcdefghijklmnopqrstuvwxyzABCDEF123456",adultConfirmed:true,privacyAccepted:true,filmingAcknowledged:true})});
  assert.equal(result.statusCode,503);assert.equal(calls.length,0);
});

test("an invalid public opening timestamp keeps public booking closed",async()=>{
  process.env.PUBLIC_BOOKING_OPENS_AT="not-a-date";
  const {handler}=await import("../netlify/functions/create-checkout-session.mjs");
  const result=await handler({httpMethod:"POST",body:JSON.stringify({mode:"public",name:"Robert",email:"robert@example.com",weekend:"weekend-02",people:1,adultConfirmed:true,privacyAccepted:true})});
  assert.equal(result.statusCode,403);assert.equal(calls.length,0);
});

test("Weekend 01 goes through on the acknowledgement alone, and never records consent",async()=>{
  const {handler}=await import("../netlify/functions/create-checkout-session.mjs");
  const result=await handler({httpMethod:"POST",body:JSON.stringify({mode:"public",name:"Robert",email:"robert@example.com",weekend:"weekend-01",people:1,adultConfirmed:true,privacyAccepted:true,filmingAcknowledged:true})});
  assert.equal(result.statusCode,200);
  const begin=calls.find(call=>call.url==="/rest/v1/rpc/begin_tavern_checkout");
  assert.ok(begin,"the seat hold must be attempted");
  // Toestemming om iemand herkenbaar te publiceren hoort bij de persoonlijke overeenkomst,
  // met een versienummer en bewijs eronder. Nooit bij een betaalscherm.
  assert.equal(JSON.parse(begin.body).p_filming_consent,false);
});

test("Weekend 01 refuses a checkout that skips the filming acknowledgement",async()=>{
  const {handler}=await import("../netlify/functions/create-checkout-session.mjs");
  const result=await handler({httpMethod:"POST",body:JSON.stringify({mode:"public",name:"Robert",email:"robert@example.com",weekend:"weekend-01",people:1,adultConfirmed:true,privacyAccepted:true})});
  assert.equal(result.statusCode,400);
  assert.equal(JSON.parse(result.body).error,"confirmations_required");
  assert.equal(calls.some(call=>call.url==="/rest/v1/rpc/begin_tavern_checkout"),false);
});

test("Weekend 02 is not asked for a Weekend 01 acknowledgement",async()=>{
  const {handler}=await import("../netlify/functions/create-checkout-session.mjs");
  const result=await handler({httpMethod:"POST",body:JSON.stringify({mode:"public",name:"Robert",email:"robert@example.com",weekend:"weekend-02",people:1,adultConfirmed:true,privacyAccepted:true})});
  assert.equal(result.statusCode,200);
});

test("a client that claims filming consent by itself is not believed",async()=>{
  const {handler}=await import("../netlify/functions/create-checkout-session.mjs");
  const result=await handler({httpMethod:"POST",body:JSON.stringify({mode:"public",name:"Robert",email:"robert@example.com",weekend:"weekend-01",people:1,adultConfirmed:true,privacyAccepted:true,filmingAcknowledged:true,filmingConsent:true})});
  assert.equal(result.statusCode,200);
  assert.equal(JSON.parse(calls.find(call=>call.url==="/rest/v1/rpc/begin_tavern_checkout").body).p_filming_consent,false);
});

test("an invited checkout also has to confirm it read the filming notice",async()=>{
  const {handler}=await import("../netlify/functions/create-checkout-session.mjs");
  const result=await handler({httpMethod:"POST",body:JSON.stringify({mode:"first_access",token:"abcdefghijklmnopqrstuvwxyzABCDEF123456",adultConfirmed:true,privacyAccepted:true})});
  assert.equal(result.statusCode,400);
  assert.equal(JSON.parse(result.body).error,"confirmations_required");
  assert.equal(calls.some(call=>call.url==="/rest/v1/rpc/begin_tavern_first_access_checkout"),false);
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
  assert.equal(result.statusCode,200);assert.equal(JSON.parse(result.body).result.status,"paid");assert.equal(calls.some(call=>call.url==="/rest/v1/rpc/mark_tavern_confirmation_email_sent"),true);
  // De gast krijgt zijn bevestiging met de twee PDF's; de accommodatie krijgt haar eigen
  // melding. Zonder bijzonderheden gaat er niets naar Lewos: dat scheelt een leeg bericht.
  const aanGast=mailsAan("robert@example.com");
  assert.equal(aanGast.length,1);assert.equal(aanGast[0].attachments.length,2);assert.match(aanGast[0].attachments[0].content,/^[A-Za-z0-9+/]+=*$/);
  assert.equal(mailsAan("accommodation@example.invalid").length,1);
  assert.equal(mailsAan("lewos.co@gmail.com").length,0);
  assert.equal(emailRequests,2);
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
  assert.equal(retry.statusCode,200);assert.equal(mailsAan("robert@example.com").length,1);
  confirmationResult={...confirmationResult,confirmationEmailSent:true};
  const done=await handler({httpMethod:"POST",headers:{"stripe-signature":`t=${timestamp},v1=${signature}`},body});
  // Tweede poging: de gast krijgt niets nieuws. De melding aan de accommodatie gaat wél
  // opnieuw de deur uit; Resend houdt hem tegen op de `idempotency-key`, die per boeking
  // vastligt. Zie HANDOVER: een eigen kolom in de database zou dat harder maken.
  assert.equal(done.statusCode,200);assert.equal(mailsAan("robert@example.com").length,1);
  const naarAccommodatie=mailsAan("accommodation@example.invalid");
  assert.equal(naarAccommodatie.length,2);
  assert.equal(new Set(calls.filter(call=>call.url==="/emails"&&[].concat(JSON.parse(call.body).to).includes("accommodation@example.invalid")).map(call=>call.headers["idempotency-key"])).size,1,"twee meldingen over dezelfde boeking dragen niet dezelfde idempotency-key");
});

test("paid Stripe checkout that cannot be confirmed is retried and never emails a false confirmation",async()=>{
  confirmationResult={status:"expired",claimId:"claim-1"};
  const {handler}=await import("../netlify/functions/stripe-webhook.mjs");
  const body=JSON.stringify({type:"checkout.session.completed",created:Math.floor(Date.now()/1000),data:{object:{payment_status:"paid",metadata:{payment_reference:"payment-1"}}}});
  const timestamp=Math.floor(Date.now()/1000);const signature=createHmac("sha256","whsec_test").update(`${timestamp}.${body}`).digest("hex");
  const result=await handler({httpMethod:"POST",headers:{"stripe-signature":`t=${timestamp},v1=${signature}`},body});
  assert.equal(result.statusCode,500);assert.equal(emailRequests,0);
});

// ── De mailroutering, gevraagd door Robert op 5 september 2026 ───────────────
// Vier controles, letterlijk de vier die hij noemde: een gewone boeking gaat naar
// Fontecha, een bijzondere vraag gaat naar Lewos, de twee lopen nooit door elkaar, en
// de gast houdt zijn eigen bevestiging.

const betaaldeWebhook=async()=>{
  const {handler}=await import("../netlify/functions/stripe-webhook.mjs");
  const body=JSON.stringify({type:"checkout.session.completed",created:Math.floor(Date.now()/1000),data:{object:{payment_status:"paid",metadata:{payment_reference:"payment-1"}}}});
  const timestamp=Math.floor(Date.now()/1000);const signature=createHmac("sha256","whsec_test").update(`${timestamp}.${body}`).digest("hex");
  return handler({httpMethod:"POST",headers:{"stripe-signature":`t=${timestamp},v1=${signature}`},body});
};

test("a normal Tavern booking reaches Fontecha with what a room needs and nothing more",async()=>{
  const result=await betaaldeWebhook();
  assert.equal(result.statusCode,200);
  const naarFontecha=mailsAan("accommodation@example.invalid");
  assert.equal(naarFontecha.length,1,"de accommodatie kreeg geen melding van een betaalde boeking");
  const mail=naarFontecha[0];
  assert.deepEqual(mail.to,["accommodation@example.invalid"],"de melding heeft meer dan één ontvanger");
  for(const [kop,waarde] of [["Guest name / Nombre del huésped","Robert"],["Number of guests / Número de huéspedes","3"],["Weekend / Fin de semana","Weekend 01"],["Arrival / Llegada","2026-10-30"],["Departure / Salida","2026-11-02"]]){
    assert.ok(mail.text.includes(`${kop}:\n  ${waarde}`),`${kop} ontbreekt in de melding aan de accommodatie`);
  }
  // Engels én Spaans, op verzoek van Robert. Elk gegeven staat maar één keer, met het
  // kopje in beide talen: twee losse blokken zouden uit elkaar kunnen lopen.
  assert.match(mail.text,/A Lewos Tavern booking is confirmed and paid\./);
  assert.match(mail.text,/Una reserva de The Lewos Tavern está confirmada y pagada\./);
  assert.match(mail.text,/Se necesita alojamiento para 3 huéspedes\./);
});

// Bijgewerkt op 5 september 2026. De aanvraag reist als datums en de zin wordt daaruit
// afgeleid. Het belangrijkste dat deze test bewaakt is niet dát hij meekomt, maar dat hij
// in een ander blok staat dan het bevestigde verblijf — een aanvraag onder dezelfde kop
// als de aankomstdatum leest als een afspraak.
test("an extra-night request travels as dates, in its own block, marked not confirmed",async()=>{
  confirmationResult={...confirmationResult,
    weekendStart:"2026-10-30",weekendEnd:"2026-11-02",
    requestedArrival:"2026-10-28",requestedDeparture:"2026-11-03",
    extraNightsStatus:"requested"};
  const result=await betaaldeWebhook();
  assert.equal(result.statusCode,200);
  const mail=mailsAan("accommodation@example.invalid")[0];

  // Het bevestigde verblijf blijft het weekend zelf.
  assert.match(mail.text,/Confirmed booking \/ Reserva confirmada:/);
  assert.match(mail.text,/Arrival \/ Llegada:\n {2}2026-10-30/);
  assert.match(mail.text,/Departure \/ Salida:\n {2}2026-11-02/);
  assert.equal(mail.text.includes("2026-10-28\n"),false,"de aangevraagde aankomst staat tussen de bevestigde gegevens");

  // En de aanvraag staat eronder, als aanvraag, met de vraag om te antwoorden.
  assert.match(mail.text,/NOT YET CONFIRMED — extra nights requested/);
  assert.match(mail.text,/2 nights before the weekend and 1 night after the weekend/);
  assert.match(mail.text,/Not confirmed — subject to accommodation availability\./);
  assert.match(mail.text,/Please reply to Robert to confirm or decline these extra nights\./);
});

test("an older booking keeps the guest's own words when there are no dates",async()=>{
  // Boekingen van vóór de kalender hebben hun aanvraag als vrije tekst. Die mag niet
  // stilzwijgend uit de mail verdwijnen omdat het formaat veranderd is.
  confirmationResult={...confirmationResult,extraNights:"Two nights before, one after."};
  const result=await betaaldeWebhook();
  assert.equal(result.statusCode,200);
  const mail=mailsAan("accommodation@example.invalid")[0];
  assert.match(mail.text,/NOT YET CONFIRMED — extra nights requested/);
  assert.match(mail.text,/Requested \(as written by the guest\): Two nights before, one after\./);
});

test("a calendar entry never covers a night nobody confirmed",async()=>{
  // De agenda-afspraak hangt aan het bevestigde verblijf. Staat er een aanvraag open,
  // dan blijft de afspraak op de weekenddatums en wordt de aanvraag alleen genoemd.
  const {bookingEvent}=await import("../netlify/functions/_calendar.mjs");
  const afspraak=bookingEvent({claimId:"claim-0001",name:"Robert",seats:3,
    weekendLabel:"Weekend 01",arrivalDate:"2026-10-30",departureDate:"2026-11-02",
    extraNights:"Requested: 2 nights before the weekend. Not confirmed — subject to accommodation availability."});
  assert.match(afspraak.startDateTime,/^2026-10-30T/,"de afspraak begint op een aangevraagde nacht");
  assert.match(afspraak.endDateTime,/^2026-11-02T/);
  assert.match(afspraak.description,/NOT part of this entry — extra nights still to be confirmed/);
});

test("a booking without extra nights leaves the block out instead of writing 'none'",async()=>{
  const result=await betaaldeWebhook();
  assert.equal(result.statusCode,200);
  const mail=mailsAan("accommodation@example.invalid")[0];
  assert.equal(mail.text.includes("extra nights requested"),false);
  assert.equal(mail.text.includes("Please reply to Robert"),false,"er valt niets te beantwoorden, dus die vraag hoort er niet te staan");
});

test("Fontecha never receives what belongs to Lewos",async()=>{
  confirmationResult={...confirmationResult,allergies:"Peanuts - severe",dietary:"Vegetarian",notes:"Wheelchair user, ground floor please."};
  const result=await betaaldeWebhook();
  assert.equal(result.statusCode,200);
  const naarFontecha=mailsAan("accommodation@example.invalid")[0];
  for(const geheim of ["Peanuts","Vegetarian","Wheelchair","robert@example.com"]){
    assert.equal(naarFontecha.text.includes(geheim),false,`"${geheim}" hoort niet in de melding aan de accommodatie`);
    assert.equal(naarFontecha.html.includes(geheim),false,`"${geheim}" hoort niet in de HTML aan de accommodatie`);
  }
});

test("a special requirement on a confirmed booking goes to Lewos, not to the accommodation",async()=>{
  // Eén veld sinds 5 september 2026, en het blijft los van het algemene berichtveld
  // staan: een allergie moet terug te vinden zijn zonder een vrije tekst door te lezen.
  confirmationResult={...confirmationResult,dietaryNotes:"Peanuts - severe. Vegetarian.",notes:"Wheelchair user, ground floor please."};
  const result=await betaaldeWebhook();
  assert.equal(result.statusCode,200);
  const naarLewos=mailsAan("lewos.co@gmail.com");
  assert.equal(naarLewos.length,1,"Lewos kreeg geen melding van de allergie");
  assert.deepEqual(naarLewos[0].to,["lewos.co@gmail.com"]);
  assert.match(naarLewos[0].text,/Allergies & dietary requirements:\n {2}Peanuts - severe\. Vegetarian\./);
  assert.match(naarLewos[0].text,/Anything else:\n {2}Wheelchair user/);
});

test("the guest still receives the confirmation, whoever else is notified",async()=>{
  confirmationResult={...confirmationResult,dietaryNotes:"Peanuts - severe"};
  const result=await betaaldeWebhook();
  assert.equal(result.statusCode,200);
  const aanGast=mailsAan("robert@example.com");
  assert.equal(aanGast.length,1);
  assert.deepEqual(aanGast[0].to,["robert@example.com"],"de bevestiging van de gast draagt een tweede ontvanger");
  assert.match(aanGast[0].subject,/booking is confirmed/);
  assert.equal(aanGast[0].attachments.length,2);
});

test("no email ever carries both mailboxes at once",async()=>{
  confirmationResult={...confirmationResult,allergies:"Peanuts - severe"};
  await betaaldeWebhook();
  for(const mail of calls.filter(call=>call.url==="/emails").map(call=>JSON.parse(call.body))){
    const ontvangers=[].concat(mail.to);
    assert.equal(ontvangers.length,1,`een mail heeft ${ontvangers.length} ontvangers: ${ontvangers.join(", ")}`);
    assert.equal(ontvangers.includes("lewos.co@gmail.com")&&ontvangers.includes("accommodation@example.invalid"),false);
  }
});

test("an extra-night request before payment reaches nobody at the accommodation",async()=>{
  // Regel 1 van Robert: een verzoek om extra nachten vóór de betaling is een vraag aan
  // Lewos, geen boeking. De accommodatie hoort pas iets bij een bevestigde, betaalde
  // boeking — deze functie opent alleen een betaling en verstuurt zelf geen mail.
  const {handler}=await import("../netlify/functions/create-checkout-session.mjs");
  const result=await handler({httpMethod:"POST",body:JSON.stringify({mode:"public",name:"Robert",email:"robert@example.com",weekend:"weekend-02",people:3,adultConfirmed:true,privacyAccepted:true,extraNights:"Two nights before."})});
  assert.equal(result.statusCode,200);
  const begin=JSON.parse(calls.find(call=>call.url==="/rest/v1/rpc/begin_tavern_checkout").body);
  assert.equal(begin.p_extra_nights,"Two nights before.","de extra nachten komen niet in de database");
  assert.equal(calls.some(call=>call.url==="/emails"),false,"er ging een mail uit vóór de betaling");
});

test("without a configured accommodation address nothing is sent quietly",async()=>{
  delete process.env.FONTECHA_ACCOMMODATION_EMAIL;
  const result=await betaaldeWebhook();
  // Stripe probeert het opnieuw en Robert ziet de fout. Een betaalde boeking waarvan de
  // accommodatie niets weet, is een gast zonder bed; die mag niet stil weglopen.
  assert.equal(result.statusCode,500);
  assert.equal(JSON.parse(result.body).error,"accommodation_recipient_not_configured");
  assert.equal(mailsAan("robert@example.com").length,1,"de gast hoort zijn bevestiging wél te krijgen");
  process.env.FONTECHA_ACCOMMODATION_EMAIL="accommodation@example.invalid";
});

test("one address for both mailboxes stops the notification instead of mixing them",async()=>{
  process.env.FONTECHA_ACCOMMODATION_EMAIL="lewos.co@gmail.com";
  const result=await betaaldeWebhook();
  assert.equal(result.statusCode,500);
  assert.equal(JSON.parse(result.body).error,"recipient_configuration_invalid");
  assert.equal(mailsAan("lewos.co@gmail.com").length,0);
  process.env.FONTECHA_ACCOMMODATION_EMAIL="accommodation@example.invalid";
});

test("an expired Stripe session releases its seats",async()=>{
  const {handler}=await import("../netlify/functions/stripe-webhook.mjs");
  const body=JSON.stringify({type:"checkout.session.expired",created:Math.floor(Date.now()/1000),data:{object:{metadata:{payment_reference:"payment-1"}}}});
  const timestamp=Math.floor(Date.now()/1000);const signature=createHmac("sha256","whsec_test").update(`${timestamp}.${body}`).digest("hex");
  const result=await handler({httpMethod:"POST",headers:{"stripe-signature":`t=${timestamp},v1=${signature}`},body});
  assert.equal(result.statusCode,200);assert.equal(calls.at(-1).url,"/rest/v1/rpc/release_tavern_checkout");
});

test("the amount charged comes from the seat hold and never from a number in the code",async()=>{
  const {readFile}=await import("node:fs/promises");
  const source=await readFile(new URL("../netlify/functions/create-checkout-session.mjs",import.meta.url),"utf8");
  assert.doesNotMatch(source,/unit_amount\]","\d/,"the charged amount must not be hardcoded");
  assert.match(source,/unit_amount\]",String\(unitAmount\)\)/);
  const {handler}=await import("../netlify/functions/create-checkout-session.mjs");
  const result=await handler({httpMethod:"POST",body:JSON.stringify({mode:"first_access",token:"abcdefghijklmnopqrstuvwxyzABCDEF123456",adultConfirmed:true,privacyAccepted:true,filmingAcknowledged:true})});
  assert.equal(result.statusCode,200);
  const sent=new URLSearchParams(calls.find(call=>call.url==="/v1/checkout/sessions").body);
  assert.equal(sent.get("line_items[0][price_data][unit_amount]"),"202500");
  assert.equal(sent.get("line_items[0][quantity]"),"3");
});

test("an impossible price stops the checkout instead of charging it",async()=>{
  const {handler}=await import("../netlify/functions/create-checkout-session.mjs");
  const original=holdResult;
  for(const priceCents of [undefined,null,0,-100,1,99999999,"202500x",202500.5]){
    calls=[];
    holdResult={...original,priceCents};
    const result=await handler({httpMethod:"POST",body:JSON.stringify({mode:"first_access",token:"abcdefghijklmnopqrstuvwxyzABCDEF123456",adultConfirmed:true,privacyAccepted:true,filmingAcknowledged:true})});
    assert.equal(result.statusCode,503,`price ${priceCents} should never reach Stripe`);
    assert.equal(JSON.parse(result.body).error,"checkout_unavailable");
    assert.equal(calls.some(call=>call.url==="/v1/checkout/sessions"),false,`price ${priceCents} reached Stripe`);
    assert.equal(calls.some(call=>call.url==="/rest/v1/rpc/release_tavern_checkout"),true,"the seats must be released again");
  }
});

// ── De drie informatievelden op het boekingspad ──────────────────────────────
// Robert, 2 september 2026: allergieën en dieetwensen mogen niet opnieuw in één algemeen
// berichtveld belanden. De publieke checkout maakt een nieuwe claim en is daarmee het
// tweede pad waarop een gast ze kan doorgeven.

test("the public checkout sends allergies, dietary needs and notes as separate fields",async()=>{
  const {handler}=await import("../netlify/functions/create-checkout-session.mjs");
  await handler({httpMethod:"POST",body:JSON.stringify({mode:"public",name:"Robert",email:"robert@example.com",weekend:"weekend-01",people:3,adultConfirmed:true,privacyAccepted:true,filmingAcknowledged:true,
    allergies:"Peanuts - severe\nShellfish",dietary:"Vegetarian",message:"We arrive late."})});
  const body=JSON.parse(calls.find(call=>call.url==="/rest/v1/rpc/begin_tavern_checkout").body);
  assert.equal(body.p_allergies,"Peanuts - severe\nShellfish","the allergy did not survive as its own field");
  assert.equal(body.p_dietary,"Vegetarian");
  assert.equal(body.p_message,"We arrive late.","the note is polluted with the other fields");
});

test("both checkout paths store the combined field as its own parameter",async()=>{
  const {handler}=await import("../netlify/functions/create-checkout-session.mjs");
  const tekst="Ana: severe peanut allergy, carries an EpiPen.\nBram: vegetarian.";
  await handler({httpMethod:"POST",body:JSON.stringify({mode:"public",name:"Robert",email:"robert@example.com",
    weekend:"weekend-01",people:3,adultConfirmed:true,privacyAccepted:true,filmingAcknowledged:true,
    dietaryNotes:tekst,message:"We arrive late."})});
  const publiek=JSON.parse(calls.find(call=>call.url==="/rest/v1/rpc/begin_tavern_checkout").body);
  assert.equal(publiek.p_dietary_notes,tekst);
  assert.equal(publiek.p_message,"We arrive late.","the note is polluted with the dietary field");

  calls.length=0;
  await handler({httpMethod:"POST",body:JSON.stringify({mode:"first_access",token:"a".repeat(43),
    adultConfirmed:true,privacyAccepted:true,filmingAcknowledged:true,dietaryNotes:tekst})});
  const uitnodiging=JSON.parse(calls.find(call=>call.url==="/rest/v1/rpc/begin_tavern_first_access_checkout").body);
  assert.equal(uitnodiging.p_dietary_notes,tekst);
});

test("an older checkout page sending two fields is merged on the way in",async()=>{
  const {handler}=await import("../netlify/functions/create-checkout-session.mjs");
  await handler({httpMethod:"POST",body:JSON.stringify({mode:"first_access",token:"a".repeat(43),
    adultConfirmed:true,privacyAccepted:true,filmingAcknowledged:true,
    allergies:"Peanuts - severe",dietary:"Vegetarian"})});
  const body=JSON.parse(calls.find(call=>call.url==="/rest/v1/rpc/begin_tavern_first_access_checkout").body);
  assert.equal(body.p_dietary_notes,"Allergies: Peanuts - severe\nDietary requirements: Vegetarian");
});

test("the public checkout refuses an over-long field instead of trimming it",async()=>{
  const {handler}=await import("../netlify/functions/create-checkout-session.mjs");
  const result=await handler({httpMethod:"POST",body:JSON.stringify({mode:"public",name:"Robert",email:"robert@example.com",weekend:"weekend-01",people:3,adultConfirmed:true,privacyAccepted:true,filmingAcknowledged:true,
    dietaryNotes:"p".repeat(1001)})});
  assert.equal(result.statusCode,400);
  assert.equal(JSON.parse(result.body).error,"field_too_long");
  assert.equal(calls.some(call=>call.url==="/rest/v1/rpc/begin_tavern_checkout"),false,"an over-long allergy reached the database");
});

test("a booking without the three fields still works and sends empty values",async()=>{
  const {handler}=await import("../netlify/functions/create-checkout-session.mjs");
  const result=await handler({httpMethod:"POST",body:JSON.stringify({mode:"public",name:"Robert",email:"robert@example.com",weekend:"weekend-01",people:3,adultConfirmed:true,privacyAccepted:true,filmingAcknowledged:true})});
  assert.equal(result.statusCode,200);
  const body=JSON.parse(calls.find(call=>call.url==="/rest/v1/rpc/begin_tavern_checkout").body);
  assert.equal(body.p_allergies,"");
  assert.equal(body.p_dietary,"");
});

test("the First Access checkout forwards added allergies without erasing anything",async()=>{
  const {handler}=await import("../netlify/functions/create-checkout-session.mjs");
  await handler({httpMethod:"POST",body:JSON.stringify({mode:"first_access",token:"a".repeat(43),adultConfirmed:true,privacyAccepted:true,filmingAcknowledged:true,
    allergies:"Peanuts - severe\nShellfish",dietary:"",message:"Remembered this at the last minute."})});
  const body=JSON.parse(calls.find(call=>call.url==="/rest/v1/rpc/begin_tavern_first_access_checkout").body);
  assert.equal(body.p_allergies,"Peanuts - severe\nShellfish","the added allergy never reached the database");
  assert.equal(body.p_dietary,"","an empty field must stay empty so the database keeps what is there");
  assert.equal(body.p_message,"Remembered this at the last minute.");
});

test("the First Access checkout refuses an over-long field instead of trimming it",async()=>{
  const {handler}=await import("../netlify/functions/create-checkout-session.mjs");
  const result=await handler({httpMethod:"POST",body:JSON.stringify({mode:"first_access",token:"a".repeat(43),adultConfirmed:true,privacyAccepted:true,filmingAcknowledged:true,
    dietaryNotes:"p".repeat(1001)})});
  assert.equal(result.statusCode,400);
  assert.equal(JSON.parse(result.body).error,"field_too_long");
  assert.equal(calls.some(call=>call.url==="/rest/v1/rpc/begin_tavern_first_access_checkout"),false,"an over-long allergy reached the database");
});
