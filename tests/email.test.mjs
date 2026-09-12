import assert from "node:assert/strict";
import {test} from "node:test";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {escapeHtml,escapeLines,labelledBlock,resendPayload} from "../netlify/functions/_email.mjs";

// Deze test roept echte functies aan. Sinds 7 september 2026 weigert elke omgeving die
// niet verklaart wat hij is — zie netlify/functions/_deploy-context.mjs. Een testrun is
// een omgeving met eigen instellingen, dus die verklaart zich hier als zodanig.
process.env.LEWOS_PREVIEW_SAFE="true";

// Robert, 2 september 2026: geen enkele payload zonder `text`, regeleindes blijven staan,
// gastinvoer wordt getoond en nooit uitgevoerd. Tot die dag was elke mail HTML-only.
const root=path.resolve(import.meta.dirname,"..");
const lees=p=>readFile(path.join(root,p),"utf8");

// **Eén verzendpad, sinds 6 september 2026.** Het versturen zelf stond in
// `stripe-webhook.mjs`, waardoor de beheeromgeving geen mail kón versturen: de knop
// "Herinneren" legde iets vast en stuurde niets. `sendEmail` staat nu in `_email.mjs` en
// iedereen gebruikt hem. Dat maakt de garantie strenger in plaats van losser: er is nog
// maar één plek die Resend belt, en die gaat door `resendPayload`.
const VERZENDPAD="netlify/functions/_email.mjs";

// Elk bestand dat een mail opbouwt en aanbiedt. Komt er een bij, dan valt de eerste test om.
const mailpaden=[
  ["First Access-ontvangstbevestiging","netlify/functions/first-access.mjs"],
  ["Stripe-betaalbevestiging","netlify/functions/stripe-webhook.mjs"],
  ["uitnodiging betaalvenster","scripts/issue-first-access.mjs"],
  ["media-uitnodiging","scripts/issue-media-agreements.mjs"],
  ["vraag van het contactformulier","netlify/functions/contact.mjs"]
];

// Bestanden die de naam van Resend noemen zónder er iets heen te sturen. Vandaag is dat
// er één: de lokale testserver vangt uitgaande post juist áf en schrijft hem naar de
// postbus op schijf, zodat een lokale proef nooit een echt bericht verstuurt. Zo'n bestand
// hoort niet in de lijst met verzendpaden — maar het moet wél bewezen worden dat hij
// alleen onderschept.
const onderscheppers=["scripts/local-admin-server.mjs"];

test("een onderschepper stuurt zelf niets naar Resend",async()=>{
  for(const pad of onderscheppers){
    const bron=await lees(pad);
    assert.match(bron,/api\.resend\.com/,`${pad} onderschept niets meer — hoort hij hier nog?`);
    assert.doesNotMatch(bron,/fetch\(\s*["'`]https:\/\/api\.resend\.com/,
      `${pad} belt Resend zelf; dan is het geen onderschepper maar een verzendpad`);
    assert.match(bron,/inPostbus\(/,`${pad} schrijft de onderschepte post nergens naartoe`);
  }
});

// Nog niet samengevoegd: contact, First Access en de twee losse scripts bellen Resend zelf.
// Ze gaan wél alle vier door `resendPayload`, dus de garantie over `text`/`html` en de
// gescheiden postvakken geldt overal. Samenvoegen is voorgesteld, niet gedaan — het raakt
// werkende paden en viel buiten de opdracht van 6 september 2026.
const eigenVerzenders=[
  "netlify/functions/contact.mjs",
  "netlify/functions/first-access.mjs"
];

test("elke plek die Resend belt is bekend en gaat door resendPayload",async()=>{
  const {readdir}=await import("node:fs/promises");
  const belt=[];
  for(const map of ["netlify/functions","scripts"]){
    for(const naam of await readdir(path.join(root,map))){
      if(!naam.endsWith(".mjs"))continue;
      const pad=`${map}/${naam}`;
      if(onderscheppers.includes(pad))continue;
      if(/fetch\(\s*["'`]https:\/\/api\.resend\.com/.test(await lees(pad)))belt.push(pad);
    }
  }
  assert.deepEqual(belt.sort(),[VERZENDPAD,...eigenVerzenders].sort(),
    "er belt een onbekend bestand Resend, of een bekend bestand doet het niet meer");
  for(const pad of belt)
    assert.match(await lees(pad),/body:JSON\.stringify\(resendPayload\(/,
      `${pad} bouwt zijn payload buiten resendPayload om`);
});

test("dat ene verzendpad gaat door resendPayload",async()=>{
  const bron=await lees(VERZENDPAD);
  assert.match(bron,/body:JSON\.stringify\(resendPayload\(/,
    "het verzendpad bouwt zijn payload buiten resendPayload om");
  // Niets versturen is toegestaan; "verstuurd" beweren zonder verzending niet.
  assert.match(bron,/const ontbreekt=\["RESEND_API_KEY","TAVERN_FROM_EMAIL"\]/,
    "het verzendpad controleert de twee instellingen niet");
  assert.match(bron,/console\.error\(`Email not sent: missing/,
    "het verzendpad zwijgt als een instelling ontbreekt, en dan is een stille storing onvindbaar");
  assert.doesNotMatch(bron,/console\.error\(`Email not sent[^`]*\$\{process\.env/,
    "het verzendpad zet een instellingswaarde in het log");
});

// De boekingsflow zelf — betaalbevestiging en herinnering — deelt wél één weg. Dat is de
// hele reden dat `sendEmail` bestaat: zonder dat kon de beheeromgeving geen mail versturen.
const boekingsflow=["netlify/functions/stripe-webhook.mjs","netlify/functions/admin-actions.mjs"];

test("de boekingsflow verstuurt via het gedeelde verzendpad",async()=>{
  for(const pad of boekingsflow){
    const bron=await lees(pad);
    assert.match(bron,/sendEmail/,`${pad} gebruikt het gedeelde verzendpad niet`);
    assert.doesNotMatch(bron,/fetch\(\s*["'`]https:\/\/api\.resend\.com/,
      `${pad} belt Resend zelf in plaats van via ${VERZENDPAD}`);
  }
});

for(const [naam,pad] of mailpaden){
  test(`${naam}: de payload gaat door resendPayload en draagt text én html`,async()=>{
    const bron=await lees(pad);
    assert.match(bron,/import \{[^}]*(sendEmail|resendPayload)[^}]*\} from ".*_email\.mjs";/,
      `${pad} haalt zijn verzending niet uit _email.mjs`);
    // `html` en `text` mogen als verkorte eigenschap worden meegegeven (`{...,html}`),
    // dus accepteer beide schrijfwijzen.
    assert.match(bron,/[,{]\s*text\s*[,:}]/,`${pad} geeft geen tekstversie mee`);
    assert.match(bron,/[,{]\s*html\s*[,:}]/,`${pad} geeft geen HTML mee`);
  });

  test(`${naam}: geen eigen escapeHtml meer, en niets ongefilterd in de HTML`,async()=>{
    const bron=await lees(pad);
    assert.doesNotMatch(bron,/const escapeHtml=value=>String\(value\)/,`${pad} heeft nog een eigen kopie van escapeHtml`);
    // Elke interpolatie in een HTML-sjabloon moet door escapeHtml of escapeLines, of een
    // waarde zijn die wij zelf maken (een URL, een getal, een vaste tekst).
    for(const html of bron.match(/html:`[\s\S]*?`(?=[,)\s}])/g)||[]){
      for(const stuk of html.match(/\$\{[^}]*\}/g)||[]){
        const veilig=/escapeHtml\(|escapeLines\(|\.html\b|checkoutUrl|link|gasten|booking\.seats|claim\.seats|===1\?/.test(stuk);
        assert.ok(veilig,`${pad}: ${stuk} gaat ongefilterd de HTML in`);
      }
    }
  });
}

// ── escapeLines: de volgorde is wat het veilig houdt ─────────────────────────
test("escapeLines ontsnapt eerst en zet daarna pas de regeleindes om",()=>{
  assert.equal(escapeLines("a\nb"),"a<br>b");
  assert.equal(escapeLines("<br>"),"&lt;br&gt;","een <br> uit de invoer blijft zichtbaar als tekst");
  assert.equal(escapeLines("<script>alert(1)</script>"),"&lt;script&gt;alert(1)&lt;/script&gt;");
  assert.equal(escapeLines("a\r\nb"),"a<br>b","een Windows-regeleinde wordt niet omgezet");
  assert.equal(escapeHtml('& < > " \''),"&amp; &lt; &gt; &quot; &#039;");
});

// ── labelledBlock: meerdere regels, lege regels, lege velden ─────────────────
const blok=(velden)=>labelledBlock(velden,"We have noted the following.");

test("meerdere regels blijven in beide formaten afzonderlijk leesbaar",()=>{
  const {html,text}=blok([["Allergies","Peanuts - severe\nShellfish - moderate"]]);
  assert.match(html,/Peanuts - severe<br>Shellfish - moderate/);
  assert.doesNotMatch(html,/severe\s+Shellfish/,"twee regels zijn samengevloeid");
  assert.match(text,/Allergies:\n {2}Peanuts - severe\n {2}Shellfish - moderate/);
});

test("een lege regel blijft, maar zonder losse inspringing",()=>{
  const {html,text}=blok([["Allergies","Peanuts\n\nShellfish"]]);
  assert.match(html,/Peanuts<br><br>Shellfish/);
  assert.match(text,/Peanuts\n\n {2}Shellfish/);
  assert.doesNotMatch(text,/\n {2}\n/,"er staat een regel met alleen spaties");
});

test("lege en ontbrekende velden krijgen geen kopje en geen lege regel",()=>{
  const {html,text}=blok([["Allergies","Peanuts"],["Dietary requirements","  "],["Anything else",null],["Nog een",undefined]]);
  assert.doesNotMatch(html,/Dietary|Anything else|Nog een/);
  assert.doesNotMatch(text,/Dietary|Anything else|Nog een/);
  assert.doesNotMatch(text,/\n\n\n/,"onduidelijke lege regels in de tekstversie");
  const leeg=blok([["Allergies",""],["Dietary requirements",null]]);
  assert.equal(leeg.html,"","een leeg blok levert toch HTML op");
  assert.equal(leeg.text,"","een leeg blok levert toch tekst op");
});

test("speciale tekens en HTML-achtige invoer worden getoond, niet uitgevoerd",()=>{
  const gemeen='Sesame & mustard <mild>; "quotes"; O\'Brien; <script>alert(1)</script>';
  const {html,text}=blok([["Allergies",gemeen]]);
  assert.doesNotMatch(html,/<script>/);
  assert.match(html,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html,/Sesame &amp; mustard &lt;mild&gt;/);
  assert.ok(text.includes(gemeen),"de tekstversie heeft de invoer veranderd");
});

test("geen tekst gaat verloren, hoe lang de invoer ook is",()=>{
  const regels=Array.from({length:40},(_,i)=>`Line ${i+1} — a & b <c> "d"`);
  const {html,text}=blok([["Allergies",regels.join("\n")]]);
  for(const regel of regels){
    assert.ok(text.includes(regel),`"${regel}" ontbreekt in de tekstversie`);
    assert.ok(html.includes(escapeHtml(regel)),`"${regel}" ontbreekt in de HTML`);
  }
  // Eén <br> scheidt het kopje van de eerste regel, daarna één per regelovergang.
  const naHetKopje=html.slice(html.indexOf("</strong><br>")+"</strong><br>".length);
  assert.equal((naHetKopje.match(/<br>/g)||[]).length,regels.length-1,"niet elke regelovergang kreeg een <br>");
});

// ── resendPayload: de poortwachter ───────────────────────────────────────────
test("resendPayload weigert een mail zonder tekstversie of zonder HTML",()=>{
  const basis={from:"T <t@e.invalid>",to:["g@e.invalid"],subject:"Onderwerp",html:"<p>hoi</p>",text:"hoi"};
  assert.doesNotThrow(()=>resendPayload(basis));
  assert.throws(()=>resendPayload({...basis,text:""}),/email_text_missing/);
  assert.throws(()=>resendPayload({...basis,text:"   "}),/email_text_missing/);
  assert.throws(()=>resendPayload({...basis,html:""}),/email_html_missing/);
});

test("resendPayload weigert een regeleinde in de onderwerpregel",()=>{
  const basis={from:"T <t@e.invalid>",to:["g@e.invalid"],html:"<p>hoi</p>",text:"hoi"};
  assert.throws(()=>resendPayload({...basis,subject:"Onderwerp\nBcc: iemand@elders.invalid"}),/email_subject_newline/);
  assert.throws(()=>resendPayload({...basis,subject:"Onderwerp\r\nBcc: x"}),/email_subject_newline/);
});

test("resendPayload laat onderwerp, ontvanger en bijlagen ongewijzigd door",()=>{
  const payload=resendPayload({from:"T <t@e.invalid>",to:["g@e.invalid"],subject:"Vast onderwerp",html:"<p>h</p>",text:"t",attachments:[{filename:"a.pdf"}]});
  assert.equal(payload.subject,"Vast onderwerp");
  assert.deepEqual(payload.to,["g@e.invalid"]);
  assert.equal(payload.reply_to,"lewos.co@gmail.com");
  assert.deepEqual(payload.attachments,[{filename:"a.pdf"}]);
  // Zonder bijlagen komt het veld er niet in, zodat Resend geen lege lijst krijgt.
  assert.ok(!("attachments" in resendPayload({from:"f",to:["t"],subject:"s",html:"<p>h</p>",text:"t"})));
});

// ── Retry en idempotentie ────────────────────────────────────────────────────
test("elk e-mailpad stuurt een idempotentiesleutel mee die aan één ding hangt",async()=>{
  const verwacht={
    "netlify/functions/first-access.mjs":/first-access-receipt-\$\{result\.claimId\}/,
    "netlify/functions/stripe-webhook.mjs":/booking-confirmation-\$\{booking\.claimId\}/,
    "scripts/issue-first-access.mjs":/first-access-\$\{claim\.claimId\}-\$\{tokenHash\.slice\(0,16\)\}/,
    "scripts/issue-media-agreements.mjs":/media-agreement-\$\{participant\.participantId\}-\$\{agreement\.version\}/
  };
  for(const [pad,patroon] of Object.entries(verwacht)){
    const bron=await lees(pad);
    assert.match(bron,/"idempotency-key":|idempotencyKey:/,`${pad} stuurt geen idempotentiesleutel mee`);
    assert.match(bron,patroon,`${pad} heeft een andere idempotentiesleutel dan verwacht`);
  }
});

test("een tweede poging op dezelfde claim gebruikt dezelfde sleutel",async()=>{
  // De sleutel hangt aan de claim, niet aan het moment. Twee pogingen na een netwerkfout
  // leveren daarom bij Resend één bericht op, geen twee.
  const bron=await lees("netlify/functions/first-access.mjs");
  assert.doesNotMatch(bron,/idempotency-key[^}]*Date\.now\(\)|idempotency-key[^}]*randomUUID/,"de sleutel verandert per poging");
  assert.match(bron,/let emailSent=result\.receiptEmailSent===true;/,"een al verstuurde bevestiging wordt niet overgeslagen");
});

// ── De betaalbevestiging is de laatste mail vóór aankomst ────────────────────
// Gevonden 2 september 2026: wie zijn allergie pas op /tavern/checkout/ toevoegde, kreeg
// daar nergens een bevestiging van — de ontvangstbevestiging ging al bij de aanmelding weg.

test("de betaalbevestiging herhaalt allergie, dieet en opmerkingen",async()=>{
  const bron=await lees("netlify/functions/stripe-webhook.mjs");
  assert.match(bron,/labelledBlock\(/,"de bevestiging bouwt geen gelabeld blok");
  for(const veld of ["booking.dietaryNotes","booking.notes"]){
    assert.ok(bron.includes(veld),`${veld} komt niet in de bevestiging`);
  }
  assert.match(bron,/\$\{genoteerd\.html\}/,"het blok staat niet in de HTML-versie");
  assert.match(bron,/\$\{genoteerd\.text\}/,"het blok staat niet in de tekstversie");
});

test("confirm_tavern_payment geeft het gecombineerde veld en de opmerkingen terug",async()=>{
  const migratie=await readFile(new URL("../database/first-access.sql",import.meta.url),"utf8");
  const functie=migratie.slice(migratie.indexOf("function public.confirm_tavern_payment"),migratie.indexOf("revoke all on function public.confirm_tavern_payment"));
  // Twee returns: de gewone en die voor een tweede webhook op dezelfde betaling.
  const returns=functie.match(/jsonb_build_object\('status','paid'[^;]*/g)||[];
  assert.equal(returns.length,2,"het aantal 'paid'-returns is veranderd");
  for(const r of returns){
    // Eén veld, met terugval op de twee oude kolommen voor boekingen van vóór de
    // samenvoeging. Nooit allebei: dan staat een allergie er twee keer.
    assert.match(r,/'dietaryNotes',coalesce\(nullif\(trim\(coalesce\(claim\.dietary_notes,''\)\),''\),private\.merged_dietary_text\(claim\.allergies,claim\.dietary_requirements\)\)/,"een return laat het dieetveld weg of valt niet terug op de oude kolommen");
    assert.doesNotMatch(r,/'allergies',claim\.allergies/,"de oude velden staan er nog los naast — dan staat een allergie twee keer in de mail");
    assert.match(r,/'notes',claim\.message/);
  }
});
