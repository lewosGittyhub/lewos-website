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

test("the Stripe session and the database hold expire together",async()=>{
  const config=await read(path.join(root,"netlify/functions/_booking-config.mjs"));
  const checkout=await read(path.join(root,"netlify/functions/create-checkout-session.mjs"));
  const sql=await read(path.join(root,"database/first-access.sql"));
  const bookingHtml=await read(path.join(root,"tavern/book/index.html"));
  const terms=await read(path.join(root,"terms/index.html"));
  const holdMinutes=Number(config.match(/CHECKOUT_HOLD_MINUTES\s*=\s*(\d+)/)?.[1]);
  assert.ok(Number.isInteger(holdMinutes)&&holdMinutes>=30&&holdMinutes<=60,"the hold length must be a Stripe-legal number of minutes");
  assert.match(checkout,/expires_at["'],String\(Math\.floor\(Date\.now\(\)\/1000\)\+CHECKOUT_HOLD_MINUTES\*60\)\)/);
  assert.doesNotMatch(checkout,/p_hold_minutes:\d+/,"the database hold must come from CHECKOUT_HOLD_MINUTES, never a separate literal");
  assert.equal(checkout.match(/p_hold_minutes:CHECKOUT_HOLD_MINUTES/g)?.length,2);
  assert.match(sql,/p_paid_at>claim\.hold_expires_at\+interval '5 minutes'/);
  for(const page of [bookingHtml,terms])assert.match(page,new RegExp(`${holdMinutes} minutes`),"the published hold promise must match the configured hold");
});

test("internal working documents are never served from the public site",async()=>{
  const redirects=await read(path.join(root,"_redirects"));
  const robots=await read(path.join(root,"robots.txt"));
  const blocked=redirects.split("\n").map(line=>line.trim().split(/\s+/)).filter(parts=>parts[2]==="404").map(parts=>parts[0]);
  const covers=route=>blocked.some(rule=>rule.endsWith("/*")?route.startsWith(rule.slice(0,-1)):rule===route);
  const internal=files
    .map(file=>path.relative(root,file))
    .filter(file=>file.endsWith(".md")&&!file.split(path.sep).some(part=>part.startsWith(".")));
  assert.ok(internal.length>0,"the handover documents must exist");
  for(const file of internal){
    const route=`/${file.split(path.sep).join("/")}`;
    assert.ok(covers(route),`${route} is published but has no 404 rule in _redirects`);
    assert.match(robots,/Disallow: \/(HANDOVER\.md|operations\/)/);
  }
});

test("every public price is presented as a total including taxes",async()=>{
  const pages=htmlFiles.filter(file=>!file.includes(`${path.sep}terms${path.sep}`)&&!file.includes(`${path.sep}travel-information${path.sep}`));
  for(const file of pages){
    const html=await read(file);
    if(!/€\s*2[.,]025/.test(html))continue;
    assert.match(html,/[Tt]otal price including taxes/,`${path.relative(root,file)} shows the price without saying it is the total including taxes`);
    assert.match(html,/[Tt]ravel to Asturias is not included/,`${path.relative(root,file)} shows the price without naming the main exclusion`);
  }
});

test("the legal notice stays one click away and carries the provider identification",async()=>{
  // Spanish LSSI-CE art. 10 asks for permanent, easy and direct access to the
  // provider's details. A footer link on every service page satisfies that; the
  // notice itself and the error page are exempt.
  const exempt=[path.join(root,"legal","index.html"),path.join(root,"404.html")];
  for(const file of htmlFiles){
    if(exempt.includes(file))continue;
    const html=await read(file);
    assert.match(html,/href=["'](?:\/|\.\.\/|)legal\/["']/,`${path.relative(root,file)} has no link to the legal notice`);
  }
  const legal=await read(path.join(root,"legal","index.html"));
  assert.match(legal,/id=["']provider["']/);
  assert.match(legal,/Robert Neugebauer/);
  assert.match(legal,/Parres, Asturias, Spain/);
  const sections=[...legal.matchAll(/<h2[^>]*>([^<]+)<\/h2>/g)].map(match=>match[1]);
  assert.equal(sections.at(-1),"Provider identification","the identification belongs at the foot of the notice, not at its head");
});

test("the two opening weekends never read as one booking",async()=>{
  const html=await read(path.join(root,"tavern/index.html"));
  const dates=html.match(/<dt>Dates<\/dt><dd>([\s\S]*?)<\/dd>/)?.[1]??"";
  assert.match(dates,/Weekend 01/);
  assert.match(dates,/Weekend 02/);
  assert.match(dates,/you book one, not both/i,"the card must say the weekends are an either-or choice");
  assert.doesNotMatch(dates,/^30 Oct to 2 Nov<br>6 to 9 Nov$/,"two bare dates stacked read as one package");
});
