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

test("the Filming & Media Agreement collects nothing until the gate is open",async()=>{
  const page=await read(path.join(root,"tavern/filming-agreement/index.html"));
  // De pagina blijft uit de zoekresultaten: hij hoort bij een persoonlijke link, niet bij
  // een zoekopdracht. Dat is geen conceptmelding maar een eigenschap van de route.
  assert.match(page,/noindex/);
  // Twee gescheiden onderwerpen in één document: de toestemming, en de AVG-informatie.
  assert.match(page,/Permission to record and publish/);
  assert.match(page,/How your personal data is handled/);
  // Betaalde advertenties zijn een eigen, losse keuze.
  assert.match(page,/Paid advertising \(optional\)/);
  assert.match(page,/paid digital advertising for The Lewos Tavern, including advertising on platforms such as Meta, Google and TikTok/);
  // Versie en bewijs horen bij elke ingevulde overeenkomst.
  // De versie komt van de server mee, niet uit de pagina: zo kan er nooit een andere versie
  // op het scherm staan dan de versie die wordt vastgelegd.
  assert.match(page,/data-media-version/);
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
  // Niets van onze eigen voorbereiding staat er nog in.
  assert.ok(!page.includes("to be inserted"),"no placeholder may reach a guest");
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

// ---------------------------------------------------------------- wat de klant leest

// Wat een bezoeker werkelijk ziet: de titel, de omschrijving die in een zoekresultaat komt,
// en de tekst op de pagina. Stijlblokken en klassenamen tellen niet mee — `class="callout"`
// is geen zin die iemand leest.
const decodeEntities=value=>value
  .replace(/&(?:mdash|ndash);/g,"-").replace(/&middot;/g,"·").replace(/&nbsp;/g," ")
  .replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"')
  .replace(/&ntilde;/g,"ñ").replace(/&oacute;/g,"ó").replace(/&eacute;/g,"é").replace(/&copy;/g,"©")
  .replace(/&larr;/g,"←").replace(/&rarr;/g,"→")
  .replace(/&#(\d+);/g,(all,code)=>String.fromCharCode(Number(code)));

const visibleText=html=>{
  const stripped=decodeEntities(html.replace(/<style[\s\S]*?<\/style>/gi,"").replace(/<script[\s\S]*?<\/script>/gi,""));
  const title=[...stripped.matchAll(/<title>([\s\S]*?)<\/title>/gi)].map(match=>match[1]).join(" ");
  const description=[...stripped.matchAll(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)/gi)].map(match=>match[1]).join(" ");
  return `${title} ${description} ${stripped.replace(/<[^>]+>/g," ")}`;
};

// De drie wettelijke verkoopdocumenten zijn bewust nog niet af: ze missen gegevens die
// niemand mag verzinnen — fiscaal nummer, adres, telefoon, toeristische registratie en de
// insolventiegarantie. Ze zeggen daarom op hun gezicht dat ze niet gelden, en ze liggen
// binnen de gesloten verkoopweg. De test daaronder bewaakt dat die weg ook echt dicht is.
const salesDocuments=["standard-information","terms","travel-information"];
const inSalesPath=file=>salesDocuments.some(name=>where(file).startsWith(`${name}${path.sep}`))
  ||where(file).startsWith(`tavern${path.sep}book`)||where(file).startsWith(`tavern${path.sep}checkout`);

test("no page a guest reads carries a word from our own preparation",async()=>{
  // Robert, 1 september 2026: de klant ziet nooit interne opmerkingen. Geen conceptmelding,
  // geen invulhaakje, geen aankondiging dat er nog een jurist naar kijkt.
  const banned=[/\bdrafts?\b/i,/\bdrafted\b/i,/\bconcept\b/i,/to be reviewed/i,/lawyer review/i,/to be inserted/i,/must still be inserted/i,/pending confirmation/i,/\bTODO\b/,/not yet checked/i,/not yet in force/i,/for legal review/i,/legally checked/i,/nog te controleren/i];
  for(const file of htmlFiles){
    if(inSalesPath(file))continue;
    const text=visibleText(await read(file));
    for(const phrase of banned){
      assert.doesNotMatch(text,phrase,`${where(file)} shows our own preparation to the guest: ${phrase}`);
    }
  }
});

test("the unfinished sales documents are not served at all",async()=>{
  // Robert, 1 september 2026: deze drie mogen voorlopig helemaal niet online leesbaar zijn.
  // Ze missen de ANBEN-gegevens en zeggen op hun gezicht dat ze niet gelden. De inhoud
  // blijft in de repo bewaard; alleen de route is dicht.
  const redirects=await read(path.join(root,"_redirects"));
  const robots=await read(path.join(root,"robots.txt"));
  const sitemap=await read(path.join(root,"sitemap.xml"));
  // Netlify serveert een bestaand bestand vóór een gewone redirect. Zonder het uitroepteken
  // krijgt de bezoeker de pagina alsnog te zien; dat ging op 29 augustus 2026 al een keer mis.
  const forced=redirects.split("\n").map(line=>line.trim().split(/\s+/)).filter(parts=>parts[2]==="404!").map(parts=>parts[0]);
  for(const name of salesDocuments){
    assert.ok(forced.includes(`/${name}`),`/${name} needs a forced 404 rule (404!) in _redirects`);
    assert.ok(forced.includes(`/${name}/*`),`/${name}/* needs a forced 404 rule (404!) in _redirects`);
    assert.ok(robots.includes(`Disallow: /${name}/`),`robots.txt must disallow /${name}/`);
    assert.ok(!sitemap.includes(`/${name}`),`/${name} may not appear in the sitemap`);
  }
});

test("nothing on the site links to a blocked sales document",async()=>{
  // Een link naar een route die 404 geeft is erger dan geen link. De drie documenten mogen
  // onderling naar elkaar verwijzen — die bestanden worden immers niet uitgeleverd — maar
  // geen enkele pagina die wél online staat mag ernaartoe wijzen.
  const served=htmlFiles.filter(file=>!salesDocuments.some(name=>where(file).startsWith(`${name}${path.sep}`)));
  for(const file of served){
    const html=await read(file);
    for(const name of salesDocuments){
      assert.ok(!html.includes(`href="/${name}/"`)&&!html.includes(`href="../${name}/"`),
        `${where(file)} links to /${name}/, which is not served while it is unfinished`);
    }
  }
});

test("a guest is never asked to confirm they read a document we do not serve",async()=>{
  // De twee vinkjes verwezen naar /terms/. Zolang die route dicht is, kan die bevestiging
  // niet waargemaakt worden en hoort ze er niet te staan.
  for(const page of ["tavern/book/index.html","tavern/checkout/index.html"]){
    const html=await read(path.join(root,page));
    assert.doesNotMatch(html,/booking terms<\/a>/,`${page} still points a confirmation at the closed booking terms`);
    assert.match(html,/full booking terms are provided before any payment is requested/,`${page} must say when the terms do arrive`);
  }
});

test("the blocked documents are kept in the repository for later",async()=>{
  // Blokkeren is niet weggooien. De teksten moeten er nog staan als de gegevens er zijn.
  for(const name of salesDocuments){
    const html=await read(path.join(root,name,"index.html"));
    assert.ok(html.length>1000,`${name}/index.html must still hold its content`);
    assert.match(html,/noindex/,`/${name}/ keeps its noindex as well`);
  }
});

test("the Filming & Media Agreement reads as a finished document",async()=>{
  const page=await read(path.join(root,"tavern/filming-agreement/index.html"));
  const text=visibleText(page);
  // Toezichthouder, privacycontact en de volledige platformlijst staan er voluit in.
  assert.match(text,/Agencia Española de Protección de Datos \(AEPD\)/);
  assert.match(text,/lewos\.co@gmail\.com/);
  for(const platform of ["Lewos website","StoryForgers website","organic social-media channels","newsletters","PR and editorial publications","promotional films and trailers"]){
    assert.ok(text.includes(platform),`the agreement must name where material may appear: ${platform}`);
  }
  assert.match(text,/paid advertising on Meta, Google and TikTok/i);
  // De bewaartermijn staat er in de vastgestelde bewoording.
  assert.ok(text.includes("Filming preferences and consent records are kept for as long as needed to demonstrate and respect your choice."));
  assert.ok(text.includes("Recordings approved for use are kept while that use remains relevant, unless consent is withdrawn for future use."));
  assert.ok(text.includes("Booking, payment and invoice records are retained for the periods required by applicable accounting, tax and consumer law."));
  // Geen invulhaakjes en geen restanten van de conceptopmaak.
  assert.doesNotMatch(page,/class="fill"/);
  assert.doesNotMatch(page,/class="draft"/);
  // En nog steeds geen belofte die niet ingetrokken kan worden.
  for(const phrase of [/\birrevocabl/i,/in perpetuity/i,/\bwaive/i,/\bforever\b/i])assert.doesNotMatch(text,phrase);
});

test("a guest never sees the form until the server says the link is good",async()=>{
  const page=await read(path.join(root,"tavern/filming-agreement/index.html"));
  const script=await read(path.join(root,"tavern/filming-agreement/media-agreement.js"));
  // Zonder geldige link is de pagina alleen de tekst van de overeenkomst.
  assert.match(page,/<div class="preview" data-media-panel hidden>/,"the form panel must start hidden");
  assert.match(script,/if\(panel\)panel\.hidden=false;/,"only a ready state may reveal the form");
  // En een dichte poort noemt nooit een reden.
  const closed=script.match(/const NOT_AVAILABLE="([^"]+)"/);
  assert.ok(closed,"there must be one neutral message for a closed gate");
  for(const phrase of [/\bdraft\b/i,/review/i,/lawyer/i,/not yet/i,/config/i,/setting/i])assert.doesNotMatch(closed[1],phrase);
});

test("every class the agreement page uses actually has a style",async()=>{
  // Een wees-klasse valt niet op tot een gast hem tegenkomt. Dit ging mis met
  // `class="review"`: bij het opschonen heette de CSS-regel al `.note`, dus de bevestiging
  // die iemand ná het invullen ziet — het belangrijkste moment van de pagina — kwam
  // ongestyled binnen. Zonder deze test zou dat pas op een screenshot opvallen.
  const page=await read(path.join(root,"tavern/filming-agreement/index.html"));
  const style=(page.match(/<style>([\s\S]*?)<\/style>/)||[])[1]||"";
  assert.ok(style.length>200,"the page must carry its own styles");
  const defined=new Set([...style.matchAll(/\.([a-z][\w-]*)/g)].map(match=>match[1]));
  const used=new Set();
  for(const [,value] of page.matchAll(/class="([^"]+)"/g))for(const name of value.trim().split(/\s+/))used.add(name);
  const orphans=[...used].filter(name=>!defined.has(name));
  assert.deepEqual(orphans,[],`class used with no style rule: ${orphans.join(", ")}`);
});

test("a guest who says no is told what that means for them",async()=>{
  // Dit is de vraag die iedereen stelt en die er eerst niet in stond. Het antwoord is een
  // beperking die Lewos zichzelf oplegt, vastgelegd in `.internal/filming-consent-v1.1.md`:
  // wie geen toestemming geeft, mag in gepubliceerd materiaal niet herkenbaar zijn.
  const text=visibleText(await read(path.join(root,"tavern/filming-agreement/index.html")));
  assert.match(text,/And if you would rather not\?/);
  assert.match(text,/not by face, not by voice, not by name/);
  assert.match(text,/nothing changes about your booking/i);
});

test("the agreement points only at things that exist",async()=>{
  const page=await read(path.join(root,"tavern/filming-agreement/index.html"));
  const text=visibleText(page);
  // Verwees eerst naar "the full media and privacy terms" — een document dat niet bestaat.
  assert.doesNotMatch(text,/full media and privacy terms/i,"no reference to a document that does not exist");
  // Verwees eerst naar een vinkje "below" dat er hoger staat, en dat zonder geldige link
  // helemaal niet op de pagina staat. Positieverwijzingen horen hier niet.
  assert.doesNotMatch(text,/permission below/i,"a position reference breaks when the form is hidden");
  // De toezichthouder-link is de link die Robert opgaf.
  assert.match(page,/href="https:\/\/www\.aepd\.es\/"/);
});

test("the agreement text comes from the page, never from configuration",async()=>{
  // De bewaartekst, het privacycontact en de documentreferentie staan vast in de
  // overeenkomst en worden gedekt door de teksthash. Zou de pagina ze uit de configuratie
  // halen, dan kan er iets anders op het scherm staan dan wat is vastgelegd.
  const handler=await read(path.join(root,"netlify/functions/media-consent.mjs"));
  const ready=handler.slice(handler.indexOf('status:"ready"'),handler.indexOf("recordedAt:state.recordedAt"));
  for(const field of ["retention","privacyContact","agreementDocument"]){
    assert.ok(!ready.includes(`${field}:`),`${field} may not be sent to the page; the agreement text is fixed`);
  }
  // De poort blijft die instelling wél eisen: er moet een termijn bepaald zijn.
  const config=await read(path.join(root,"netlify/functions/_media-config.mjs"));
  assert.match(config,/MEDIA_RETENTION_PERIOD/);
  assert.match(config,/no confirmed retention period is published/);
});
