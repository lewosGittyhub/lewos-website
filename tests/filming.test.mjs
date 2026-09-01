import assert from "node:assert/strict";
import {readdir,readFile} from "node:fs/promises";
import path from "node:path";
import {test} from "node:test";

const root=path.resolve(import.meta.dirname,"..");
const walk=async dir=>(await Promise.all((await readdir(dir,{withFileTypes:true})).filter(entry=>entry.name!==".git").map(async entry=>entry.isDirectory()?walk(path.join(dir,entry.name)):path.join(dir,entry.name)))).flat();
const files=await walk(root);
const htmlFiles=files.filter(file=>file.endsWith(".html"));
const read=file=>readFile(file,"utf8");
const where=file=>path.relative(root,file);

test("Weekend 01 is presented as the filmed First Edition before anyone books",async()=>{
  const tavern=await read(path.join(root,"tavern/index.html"));
  // Een gast die €2.025 uitgeeft moet vóór het betaalmoment weten dat hij gefilmd wordt,
  // waar dat beeld terechtkomt, en dat hij zelf nog moet tekenen.
  assert.match(tavern,/The Filmed First Edition/);
  assert.match(tavern,/professionally filmed/i,"the page must say the weekend is professionally filmed");
  for(const channel of ["StoryForgers","organic social-media","newsletters","promotional films"]){
    assert.ok(tavern.includes(channel),`the Tavern page must name where the material may appear: ${channel}`);
  }
  assert.match(tavern,/Filming &amp; Media Agreement/,"the individual agreement must be named on the public page");
  assert.match(tavern,/paid advertising needs a separate, optional permission/i);
});

test("Weekend 02 is described as not professionally filmed and keeps consent specific",async()=>{
  const tavern=await read(path.join(root,"tavern/index.html"));
  assert.match(tavern,/Weekend 02 is not planned as a professionally filmed edition/i);
  assert.match(tavern,/Saying no has no effect on participation/i);
  assert.match(tavern,/recognisable promotional use requires separate, specific permission beforehand/i);
  assert.match(tavern,/paid advertising remains optional/i);
});

test("no checkbox anywhere on the site arrives pre-ticked",async()=>{
  // Een aangevinkt vakje is geen keuze. Voor toestemming is dat ook juridisch waardeloos.
  for(const file of htmlFiles){
    const html=await read(file);
    for(const [tag] of html.matchAll(/<input\b[^>]*>/g)){
      if(!/type=["']checkbox["']/.test(tag))continue;
      assert.doesNotMatch(tag,/\bchecked\b/,`${where(file)} ships a checkbox that is already ticked: ${tag}`);
    }
  }
});

test("the booker confirms the filmed edition, and confirms nothing on anyone's behalf",async()=>{
  const page=await read(path.join(root,"tavern/book/index.html"));
  const script=await read(path.join(root,"tavern/book/booking.js"));
  const handler=await read(path.join(root,"netlify/functions/create-checkout-session.mjs"));
  // Het is een bevestiging, geen toestemming. Dat verschil moet in de tekst staan.
  assert.match(page,/name="filmingAcknowledged"/);
  assert.match(page,/I understand that Weekend 01 is The Lewos Tavern's professionally filmed First Edition/);
  assert.match(page,/not media or privacy permission/i);
  assert.doesNotMatch(page,/name="filmingConsent"/,"the checkout may not collect filming consent at all");
  // Verplicht, maar alleen bij Weekend 01, en nooit verplicht terwijl het verborgen is.
  assert.match(script,/filmingInput\.required=opening/);
  assert.match(handler,/weekend==="weekend-01"&&!filmingAcknowledged/,"the server must check it too");
  // De database mag nooit een toestemming van dit scherm krijgen.
  assert.match(handler,/FILMING_CONSENT_NEVER_FROM_CHECKOUT=false/);
  assert.doesNotMatch(handler,/p_filming_consent:filmingConsent/);
});

test("the Filming & Media Agreement is a draft that cannot collect anything yet",async()=>{
  const page=await read(path.join(root,"tavern/filming-agreement/index.html"));
  assert.match(page,/noindex/);
  assert.match(page,/This is a draft. It cannot be completed yet/);
  // Twee gescheiden onderwerpen in één document: de toestemming, en de AVG-informatie.
  assert.match(page,/Permission to record and publish/);
  assert.match(page,/How your personal data is handled/);
  // Betaalde advertenties zijn een eigen, losse keuze.
  assert.match(page,/Paid advertising \(optional\)/);
  assert.match(page,/paid digital advertising for The Lewos Tavern, including advertising on platforms such as Meta, Google and TikTok/);
  // Versie en bewijs horen bij elke ingevulde overeenkomst.
  assert.match(page,/filming-media-agreement-draft-2026-09-01/);
  // De pagina mag uit zichzelf nergens naartoe posten. Er staat nu wel een script op dat
  // de velden kan aanzetten, maar alleen nadat de server heeft gezegd dat de poort open is.
  assert.doesNotMatch(page,/<form[^>]*\baction=/,"a draft agreement may not post anywhere by itself");
  assert.doesNotMatch(page,/<form[^>]*\bmethod=/,"a draft agreement may not carry a submit method");
  const fieldsets=[...page.matchAll(/<fieldset\b[^>]*>/g)].map(match=>match[0]);
  assert.ok(fieldsets.length>=2,"the choices must sit inside fieldsets that can be switched off");
  for(const fieldset of fieldsets)assert.match(fieldset,/\bdisabled\b/,`a fieldset ships enabled: ${fieldset}`);
  assert.match(page,/<button type="submit" hidden/,"the submit button must start hidden");
  // Het script zet niets aan zolang de server 503 antwoordt.
  const script=await read(path.join(root,"tavern/filming-agreement/media-agreement.js"));
  assert.match(script,/response\.status===503/,"the page must handle a closed gate explicitly");
  assert.match(script,/keepClosed/,"a closed gate must leave every field switched off");
  assert.match(script,/event\.preventDefault\(\)/,"the form may never submit itself");
  // De ontbrekende juridische gegevens moeten zichtbaar ontbreken, niet ingevuld zijn.
  for(const missing of ["Tax identification number","Full postal address","retention period","supervisory authority"]){
    assert.ok(page.includes(missing),`the agreement must show ${missing} as still missing`);
  }
  assert.ok(page.split("to be inserted").length-1>=6,"every unconfirmed field must be marked as missing");
});

test("no page promises a permission that can never be taken back",async()=>{
  // Spaans portretrecht laat toestemming intrekken en de AVG ook. Een tekst die het
  // tegenovergestelde belooft is niet sterker, alleen minder houdbaar.
  const banned=[/\birrevocabl/i,/in perpetuity/i,/\bwaive/i,/\bforever\b/i];
  for(const file of htmlFiles){
    const html=await read(file);
    for(const phrase of banned)assert.doesNotMatch(html,phrase,`${where(file)} promises a permanent permission: ${phrase}`);
  }
});

test("the legal notice says what the filming permission never covers",async()=>{
  const legal=await read(path.join(root,"legal/index.html"));
  for(const limit of ["bedrooms, bathrooms or changing areas","unrelated companies","private conversations","sensitive personal details"]){
    assert.ok(legal.includes(limit),`the legal notice must exclude: ${limit}`);
  }
  // Intrekken moet er staan, en zonder dreigement.
  assert.match(legal,/Withdrawing carries no fee or cancellation cost/);
  assert.match(legal,/outside Lewos's control/,"Lewos may not promise deletions it cannot perform");
  assert.match(legal,/href="\/tavern\/filming-agreement\/"/,"the draft agreement must be reachable for review");
});

test("internal working documents are never served from the site",async()=>{
  const redirects=await read(path.join(root,"_redirects"));
  const robots=await read(path.join(root,"robots.txt"));
  // .internal bevat conceptteksten en juridische aantekeningen. Die horen niet op het web.
  for(const guarded of ["/operations/*","/.internal/*"]){
    assert.ok(redirects.includes(guarded),`_redirects must block ${guarded}`);
  }
  assert.ok(robots.includes("Disallow: /.internal/"),"robots.txt must disallow the internal folder");
});

test("the filming work leaves the payment gate exactly as it was",async()=>{
  const config=await read(path.join(root,"netlify/functions/_booking-config.mjs"));
  // Niets in deze ronde mag een weg naar betalen openen.
  assert.match(config,/export const PUBLISHED_TERMS_VERSION="";/);
  assert.match(config,/export const PUBLISHED_TERMS_DOCUMENT="";/);
  assert.match(config,/export const PUBLISHED_TRAVEL_DOCUMENT="";/);
  const agreement=await read(path.join(root,"tavern/filming-agreement/index.html"));
  for(const route of ["/api/checkout","/tavern/book/","/tavern/checkout/"]){
    assert.ok(!agreement.includes(route),`the agreement page may not lead to ${route}`);
  }
});
