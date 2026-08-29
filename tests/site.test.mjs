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
  assert.match(sql,/invitation_expires_at>clock_timestamp\(\)/);
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
  assert.match(sql,/checkout_session_id is null[\s\S]{0,180}hold_expires_at<=clock_timestamp\(\)/);
  assert.match(sql,/status in\('first_access_held','payment_pending','paid'\)/);
  assert.doesNotMatch(sql,/status in\('payment_pending','expired'\)/);
  assert.match(sql,/status='first_access_held'[\s\S]{0,200}invitation_expires_at<=clock_timestamp\(\)/);
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
  assert.match(dates,/booked separately/i,"the card must say the weekends are booked separately");
  assert.doesNotMatch(dates,/not both/i,"booking both weekends is allowed on request, so the card must not rule it out");
  assert.doesNotMatch(dates,/^30 Oct to 2 Nov<br>6 to 9 Nov$/,"two bare dates stacked read as one package");
});

test("a hidden element is never left visible by a competing display rule",async()=>{
  // The hidden attribute only wins while nothing else sets display on the element.
  // A class like .signup-form{display:grid} silently overrides it, which once put all
  // three states of the First Access section on the page at the same time.
  for(const file of htmlFiles){
    const html=await read(file);
    if(!/\shidden(\s|>|=)/.test(html))continue;
    assert.match(html,/\[hidden\]\s*\{\s*display:\s*none\s*!important/,`${path.relative(root,file)} uses the hidden attribute without a [hidden] display rule to protect it`);
  }
});

test("the weekend calendar is driven by real dates and degrades to the menu",async()=>{
  const html=await read(path.join(root,"tavern/index.html"));
  const script=await read(path.join(root,"tavern/first-access.js"));
  const sql=await read(path.join(root,"database/first-access.sql"));
  // Real dates, not the display label, decide where a weekend sits in a month.
  assert.match(sql,/add column if not exists starts_on date/);
  assert.match(sql,/add column if not exists ends_on date/);
  assert.match(sql,/'startsOn',w\.starts_on/);
  assert.match(sql,/'endsOn',w\.ends_on/);
  assert.match(html,/data-weekend-calendar/);
  assert.match(html,/data-calendar-months/);
  // The select stays the submitted field, so the form still works without a calendar.
  assert.match(html,/<select id=["']weekend["'] name=["']weekend["'] required>/);
  assert.match(script,/item\.startsOn/);
  assert.match(script,/removeAttribute\('data-ready'\)/,"without dated weekends the calendar must hide itself");
  assert.match(html,/\.calendar \{ display: none; \}/,"the calendar stays hidden until the script marks it ready");
  // A private Tavern is not a dated weekend and must remain reachable in the menu.
  assert.match(html,/value=["']private["']/);
});

test("the weekend menu becomes a read-out and a private Tavern has its own route",async()=>{
  const html=await read(path.join(root,"tavern/index.html"));
  const script=await read(path.join(root,"tavern/first-access.js"));
  const priv=await read(path.join(root,"tavern/private/index.html"));
  const privScript=await read(path.join(root,"tavern/private/private.js"));
  // One route for a private Tavern: its own page, reached from both entry points.
  assert.equal(html.match(/href=["']\/tavern\/private\/["']/g)?.length,2,"both the section button and the form link must point at the private page");
  assert.doesNotMatch(html,/data-private-toggle/,"the in-form toggle was replaced by the page");
  assert.match(priv,/name=["']people["'][^>]*min=["']4["'][^>]*max=["']12["']/);
  assert.match(privScript,/weekend:'private'/,"the private page reuses the existing enquiry route");
  assert.match(html,/data-weekend-field/);
  // Hiding with display:none would make the required select unfocusable and break
  // form validation, so the field is clipped instead.
  assert.match(html,/\.is-visually-hidden \{[^}]*clip-path/);
  assert.doesNotMatch(html,/\.is-visually-hidden \{[^}]*display: none/);
  assert.match(script,/is-visually-hidden/);
  // A private Tavern runs 4 to 12 players; a featured weekend has six seats.
  assert.match(script,/people\.min=on\?'4':'1'/);
  assert.match(script,/people\.max=on\?'12':'6'/);
  // The submit label must survive a failed attempt instead of turning into other wording.
  assert.match(script,/submit\.textContent=submitLabel\(\)/);
  assert.doesNotMatch(script,/submit\.textContent='Claim my seats/);
});

test("a day cell shows only its date, and the seat count is read out below",async()=>{
  const html=await read(path.join(root,"tavern/index.html"));
  const script=await read(path.join(root,"tavern/first-access.js"));
  // A number or a row of shapes inside a 38 pixel cell could not be read; the count
  // belongs in the line under the calendar and in the button's own label.
  assert.doesNotMatch(html,/calday__gauge|calday__seats/);
  assert.doesNotMatch(script,/calday__gauge|calday__seats/);
  assert.match(script,/<span class="calday__n">\$\{day\}<\/span><\/button>/);
  assert.match(script,/aria-label="\$\{label\}" title="\$\{label\}"/);
  assert.match(script,/seats free/);
  assert.match(script,/of \$\{item\.capacity\} seats free/);
  assert.match(html,/\.calendar__chosen \{[^}]*font: 700/,"the read-out carries the count, so it is set larger and bold");
});
test("the price shown with a weekend comes from the database and follows the party size",async()=>{
  const script=await read(path.join(root,"tavern/first-access.js"));
  const sql=await read(path.join(root,"database/first-access.sql"));
  // One source for the price. A copy in the front-end is how an old price survives.
  assert.match(sql,/add column if not exists price_cents integer not null default 202500/);
  assert.match(sql,/'priceCents',w\.price_cents/);
  assert.match(script,/item\.priceCents/);
  assert.doesNotMatch(script,/2025|202500/,"the price must not be repeated in the script");
  // The seed re-runs on every migration, so it must not reset a price set by hand.
  const seed=sql.match(/on conflict \(slug\) do update set[^;]*/)?.[0]??"";
  assert.doesNotMatch(seed,/price_cents/,"re-running the migration must not overwrite a changed price");
  assert.match(script,/including taxes/);
  assert.match(script,/guests<=Math\.min\(item\.capacity,item\.remaining\)/,"no total for a party that cannot fit");
});

test("the party size sits next to a total that follows it",async()=>{
  const html=await read(path.join(root,"tavern/index.html"));
  const script=await read(path.join(root,"tavern/first-access.js"));
  // An output element is the right home for a calculated figure: screen readers
  // announce it when it changes, and it is never submitted as a form value.
  assert.match(html,/<output class="party__price"[^>]*data-party-price/);
  assert.doesNotMatch(html,/<output[^>]*name=/,"the total is a read-out, not a submitted field");
  assert.match(html,/\.party \{[^}]*grid-template-columns: 112px 1fr/);
  assert.match(script,/partyPrice\.textContent=money\(cents\*guests\)/);
  assert.match(script,/setAttribute\('data-empty',''\)/,"an unusable total must fall back to a neutral state");
});

test("a deadline is judged on the clock, not on when the transaction started",async()=>{
  const sql=await read(path.join(root,"database/first-access.sql"));
  // Postgres freezes now() at the start of a transaction. A request that arrives just
  // before a deadline and then waits on the advisory lock would still be judged with
  // that stale time, so every deadline comparison reads the clock instead.
  for(const check of [
    /now\(\)>=p_first_access_closes_at/,
    /now\(\)<p_public_booking_opens_at/,
    /invitation_expires_at<=now\(\)/,
    /invitation_expires_at>now\(\)/,
    /hold_expires_at<=now\(\)/,
    /hold_expires_at>now\(\)/
  ])assert.doesNotMatch(sql,check,`a deadline is still compared against the transaction time: ${check}`);
  assert.match(sql,/clock_timestamp\(\)>=p_first_access_closes_at/);
  assert.match(sql,/clock_timestamp\(\)<p_public_booking_opens_at/);
  assert.match(sql,/expires_at:=clock_timestamp\(\)\+make_interval/);
});

test("the calendar refuses a weekend that cannot hold the whole party",async()=>{
  const script=await read(path.join(root,"tavern/first-access.js"));
  // The group is never split, so a weekend with two seats left is unavailable to three.
  assert.match(script,/const full=item\.remaining<wanted/);
  assert.doesNotMatch(script,/const full=item\.remaining<=0/);
  assert.match(script,/items\.find\(item=>item\.remaining>=wantedSeats\(\)\)/);
  assert.match(script,/current\.remaining<wantedSeats\(\)/,"a chosen weekend must be let go when the party grows");
  assert.match(script,/not enough for \$\{wanted\}/,"the reason belongs in the accessible label");
});

test("the surroundings are real photographs, credited and described",async()=>{
  const html=await read(path.join(root,"tavern/index.html"));
  const block=html.match(/<section class="around"[\s\S]*?<\/section>/)?.[0]??"";
  assert.ok(block,"the surroundings section must exist");
  // Three photographs, each with words for a reader who cannot see them.
  const images=[...block.matchAll(/<img[^>]*>/g)].map(match=>match[0]);
  assert.ok(images.length>=3,"the section needs at least three photographs to be worth its space");
  assert.equal(images.length,[...block.matchAll(/<figcaption>/g)].length,"every photograph carries its own caption");
  for(const image of images){
    assert.match(image,/alt="[^"]{40,}"/,"every photograph needs a description that stands on its own");
    assert.match(image,/loading="lazy"/);
    assert.match(image,/width="\d+" height="\d+"/,"give the browser the size so the page does not jump while loading");
  }
  // The images clause in the terms promises real photographs exist. This section is
  // where they are, and it must not let a visitor read them as pictures of the Tavern.
  assert.match(block,/photographs of the region, not of the Tavern itself/);
});

test("the photograph slider can be steered and does not move under the reader",async()=>{
  const script=await read(path.join(root,"tavern/surroundings.js"));
  const html=await read(path.join(root,"tavern/index.html"));
  // Swiping must work from the CSS alone, so a failed script cannot strand the images.
  assert.match(html,/\.around__track \{[^}]*overflow-x: auto/);
  assert.match(html,/\.around__track \{[^}]*scroll-snap-type: x mandatory/);
  assert.match(html,/data-prev/);
  assert.match(html,/data-next/);
  // Auto-advancing content needs a way out: reduced motion, taking over, and leaving.
  assert.match(script,/prefers-reduced-motion: reduce/);
  assert.match(script,/overgenomen=true/,"any steer by the visitor must end the automatic advance");
  assert.match(script,/visibilitychange/);
  assert.match(script,/ArrowLeft/);
  assert.match(script,/aria-roledescription="carousel"/.source?new RegExp("."):/./);
  assert.match(html,/aria-roledescription="carousel"/);
});
