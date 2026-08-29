import assert from "node:assert/strict";
import {readdir,readFile,stat} from "node:fs/promises";
import path from "node:path";
import {test} from "node:test";

const root=path.resolve(import.meta.dirname,"..");
const walk=async dir=>(await Promise.all((await readdir(dir,{withFileTypes:true})).filter(entry=>entry.name!==".git").map(async entry=>entry.isDirectory()?walk(path.join(dir,entry.name)):path.join(dir,entry.name)))).flat();
const files=await walk(root);
const htmlFiles=files.filter(file=>file.endsWith(".html"));
const read=file=>readFile(file,"utf8");

const localTarget=(source,value)=>{
  const clean=value.split("#")[0].split("?")[0];
  if(!clean||clean.startsWith("mailto:")||clean.startsWith("tel:")||clean.startsWith("http://")||clean.startsWith("https://")||clean.startsWith("data:")||clean.startsWith("javascript:")||clean.startsWith("/.netlify/")||clean.startsWith("/api/"))return null;
  const absolute=clean.startsWith("/")?path.join(root,clean):path.resolve(path.dirname(source),clean);
  return path.extname(absolute)?absolute:path.join(absolute,"index.html");
};

test("all local HTML links and media targets exist",async()=>{
  const missing=[];
  for(const file of htmlFiles){
    const html=await read(file);
    for(const match of html.matchAll(/(?:href|src)=["']([^"']+)["']/gi)){
      const target=localTarget(file,match[1]);
      if(target)try{await stat(target);}catch{missing.push(`${path.relative(root,file)} -> ${match[1]}`);}
    }
    for(const match of html.matchAll(/url\(["']?([^"')]+)["']?\)/gi)){
      const target=localTarget(file,match[1]);
      if(target)try{await stat(target);}catch{missing.push(`${path.relative(root,file)} -> ${match[1]}`);}
    }
  }
  assert.deepEqual(missing,[]);
});

test("First Access form keeps its privacy and anti-spam safeguards",async()=>{
  const html=await read(path.join(root,"tavern/index.html"));
  const handler=await read(path.join(root,"netlify/functions/first-access.mjs"));
  assert.match(html,/name=["']form-name["']/);
  assert.match(html,/name=["']bot-field["']/);
  assert.match(html,/aria-hidden=["']true["']/);
  assert.match(html,/href=["'](?:\.\.\/|\/)privacy\//);
  assert.match(html,/action=["']\/api\/first-access["']/);
  assert.match(handler,/redirect\(`\/thanks\/\?status=held/);
});

test("contact form is separate and limited to 500 characters",async()=>{
  const html=await read(path.join(root,"contact/index.html"));
  assert.match(html,/name=["']form-name["'][^>]*value=["']tavern-question["']/);
  assert.match(html,/name=["']question["'][^>]*maxlength=["']500["']/);
  assert.match(html,/action=["']\/contact-thanks\/["']/);
});

test("consumer price remains consistent and banned sales wording is absent",async()=>{
  const publicHtml=(await Promise.all(htmlFiles.filter(file=>!file.includes(`${path.sep}terms${path.sep}`)&&!file.includes(`${path.sep}travel-information${path.sep}`)).map(read))).join("\n");
  assert.match(publicHtml,/€2[.,]025/);
  for(const banned of ["excl","VAT","Book now","Buy"])assert.doesNotMatch(publicHtml,new RegExp(`\\b${banned}\\b`,"i"));
  const displayedPrices=[...publicHtml.matchAll(/€\s*([0-9][0-9.,]*)/g)].map(match=>match[1].replace(/[.,]/g,""));
  assert.deepEqual([...new Set(displayedPrices)],["2025"]);
});

test("sitemap includes privacy but excludes transactional and draft pages",async()=>{
  const sitemap=await read(path.join(root,"sitemap.xml"));
  assert.match(sitemap,/https:\/\/lewos\.co\/privacy\//);
  for(const hidden of ["thanks","contact-thanks","booking-success","booking-cancelled","terms","travel-information","tavern/book","tavern/checkout"])assert.doesNotMatch(sitemap,new RegExp(`lewos\\.co/${hidden.replace("/","\\/")}`));
});

test("metadata and structured data are present without Event schema",async()=>{
  const home=await read(path.join(root,"index.html"));
  const tavern=await read(path.join(root,"tavern/index.html"));
  const contact=await read(path.join(root,"contact/index.html"));
  assert.match(home,/"@type":"Organization"/);
  assert.match(tavern,/"@type":"FAQPage"/);
  assert.match(contact,/property=["']og:title["']/);
  assert.match(contact,/name=["']twitter:card["']/);
  assert.doesNotMatch(`${home}\n${tavern}`,/"@type"\s*:\s*"Event"/);
});

test("payments remain gated on explicit configuration and a reviewed code version",async()=>{
  const source=await read(path.join(root,"netlify/functions/create-checkout-session.mjs"));
  const config=await read(path.join(root,"netlify/functions/_booking-config.mjs"));
  assert.match(config,/TAVERN_PAYMENTS_ENABLED/);
  assert.match(config,/PUBLIC_BOOKING_OPENS_AT/);
  assert.match(config,/PUBLISHED_TERMS_VERSION=""/);
  assert.match(config,/PUBLISHED_TERMS_DOCUMENT=""/);
  assert.match(config,/PUBLISHED_TRAVEL_DOCUMENT=""/);
  assert.match(config,/BOOKING_TERMS_VERSION/);
});

test("First Access and paid-booking wording describe the same legal moment",async()=>{
  const legal=await read(path.join(root,"legal/index.html"));
  const travel=await read(path.join(root,"travel-information/index.html"));
  const terms=await read(path.join(root,"terms/index.html"));
  assert.match(legal,/First Access can temporarily set aside the requested seats/);
  assert.match(legal,/paid booking becomes binding only after successful payment/);
  assert.match(travel,/group booking becomes binding after successful payment/);
  assert.match(terms,/booking becomes binding when payment is successfully accepted/);
  assert.doesNotMatch(legal,/expression of interest only/i);
});

test("the Tavern can switch automatically from First Access to public booking",async()=>{
  const html=await read(path.join(root,"tavern/index.html"));
  const script=await read(path.join(root,"tavern/first-access.js"));
  const handler=await read(path.join(root,"netlify/functions/first-access.mjs"));
  assert.match(html,/data-public-booking-open/);
  assert.match(html,/href=["']\/tavern\/book\/["']/);
  assert.match(script,/data\.publicBookingOpen/);
  assert.match(handler,/public_booking_open/);
});

test("active private invitation windows block an accidentally early public opening",async()=>{
  const sql=await read(path.join(root,"database/first-access.sql"));
  const checkout=await read(path.join(root,"netlify/functions/create-checkout-session.mjs"));
  const html=await read(path.join(root,"tavern/index.html"));
  assert.match(sql,/tavern_public_booking_ready/);
  assert.match(sql,/invitation_expires_at>now\(\)/);
  assert.match(sql,/checkout_token_hash is null/);
  assert.match(sql,/status in\('first_access_held','payment_pending'\)/);
  assert.match(checkout,/first_access_windows_active/);
  assert.match(sql,/p_public_booking_opens_at/);
  assert.match(sql,/tavern_seat_claims_active_invite_idx/);
  assert.match(sql,/tavern_seat_claims_uninvited_hold_idx/);
  assert.match(html,/data-first-access-closed/);
});

test("operators have a fail-safe payment reconciliation audit and runbook",async()=>{
  const audit=await read(path.join(root,"scripts/audit-payment-reconciliation.mjs"));
  const runbook=await read(path.join(root,"operations/booking-runbook.md"));
  assert.match(audit,/paid_webhook_missing/);
  assert.match(audit,/expiry_webhook_missing/);
  assert.match(audit,/process\.exitCode=2/);
  assert.match(runbook,/do not release the seats/i);
  assert.match(runbook,/Never free an attached checkout/i);
});

test("seat accounting never frees an attached Stripe checkout on a local timer",async()=>{
  const sql=await read(path.join(root,"database/first-access.sql"));
  assert.match(sql,/checkout_session_id is null[\s\S]{0,160}hold_expires_at<=now\(\)/);
  assert.match(sql,/status in\('first_access_held','payment_pending','paid'\)/);
  assert.doesNotMatch(sql,/status in\('payment_pending','expired'\)/);
  assert.match(sql,/status='first_access_held'[\s\S]{0,180}invitation_expires_at<=now\(\)/);
  assert.match(sql,/payment_reconciliation_pending/);
});

test("paid confirmation email is retried and marked durably",async()=>{
  const webhook=await read(path.join(root,"netlify/functions/stripe-webhook.mjs"));
  const sql=await read(path.join(root,"database/first-access.sql"));
  assert.match(webhook,/idempotency-key/);
  assert.match(webhook,/confirmation_email_pending/);
  assert.match(webhook,/mark_tavern_confirmation_email_sent/);
  assert.match(sql,/confirmation_email_sent_at/);
});

test("First Access invitations have a guarded, retry-safe sender",async()=>{
  const sender=await read(path.join(root,"scripts/issue-first-access.mjs"));
  const sql=await read(path.join(root,"database/first-access.sql"));
  assert.match(sender,/FIRST_ACCESS_SEND_CONFIRM/);
  assert.match(sender,/paymentsAreEnabled\(\)/);
  assert.match(sender,/randomBytes\(32\)/);
  assert.match(sender,/revoke_tavern_checkout_invitation/);
  assert.match(sql,/invitation_sent_at/);
  assert.match(sql,/already_invited/);
});

test("First Access receipt delivery is durable and retry-safe",async()=>{
  const handler=await read(path.join(root,"netlify/functions/first-access.mjs"));
  const sql=await read(path.join(root,"database/first-access.sql"));
  assert.match(handler,/first-access-receipt-/);
  assert.match(handler,/mark_tavern_receipt_email_sent/);
  assert.match(sql,/receipt_email_sent_at/);
  assert.match(sql,/receiptEmailSent/);
  assert.match(sql,/status='alternative_offered'/);
  assert.match(sql,/status='future_weekend_interest'/);
});
