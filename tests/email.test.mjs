import assert from "node:assert/strict";
import {test} from "node:test";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {escapeHtml,escapeLines,labelledBlock,resendPayload} from "../netlify/functions/_email.mjs";

// Robert, 2 september 2026: geen enkele payload zonder `text`, regeleindes blijven staan,
// gastinvoer wordt getoond en nooit uitgevoerd. Tot die dag was elke mail HTML-only.
const root=path.resolve(import.meta.dirname,"..");
const lees=p=>readFile(path.join(root,p),"utf8");

// Elk bestand dat een mail verstuurt. Komt er een vijfde bij, dan valt de eerste test om.
const mailpaden=[
  ["First Access-ontvangstbevestiging","netlify/functions/first-access.mjs"],
  ["Stripe-betaalbevestiging","netlify/functions/stripe-webhook.mjs"],
  ["uitnodiging betaalvenster","scripts/issue-first-access.mjs"],
  ["media-uitnodiging","scripts/issue-media-agreements.mjs"]
];

test("elk e-mailpad in de repo is bekend en loopt via resendPayload",async()=>{
  const bestanden=["netlify/functions","scripts"];
  const gevonden=[];
  for(const map of bestanden){
    const {readdir}=await import("node:fs/promises");
    for(const naam of await readdir(path.join(root,map))){
      if(!naam.endsWith(".mjs"))continue;
      const bron=await lees(`${map}/${naam}`);
      if(/api\.resend\.com|RESEND_API_URL/.test(bron)&&/body:JSON\.stringify\(/.test(bron)&&/from[,:]/.test(bron))gevonden.push(`${map}/${naam}`);
    }
  }
  const bekend=mailpaden.map(([,p])=>p);
  for(const pad of gevonden)assert.ok(bekend.includes(pad),`onbekend e-mailpad: ${pad} — voeg het toe aan deze test`);
  for(const pad of bekend)assert.ok(gevonden.includes(pad),`${pad} verstuurt geen mail meer`);
});

for(const [naam,pad] of mailpaden){
  test(`${naam}: de payload gaat door resendPayload en draagt text én html`,async()=>{
    const bron=await lees(pad);
    assert.match(bron,/import \{[^}]*resendPayload[^}]*\} from ".*_email\.mjs";/,`${pad} importeert resendPayload niet`);
    assert.match(bron,/body:JSON\.stringify\(resendPayload\(/,`${pad} bouwt zijn payload buiten resendPayload om`);
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
    assert.match(bron,/"idempotency-key":/,`${pad} stuurt geen idempotentiesleutel mee`);
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
  for(const veld of ["booking.allergies","booking.dietary","booking.notes"]){
    assert.ok(bron.includes(veld),`${veld} komt niet in de bevestiging`);
  }
  assert.match(bron,/\$\{genoteerd\.html\}/,"het blok staat niet in de HTML-versie");
  assert.match(bron,/\$\{genoteerd\.text\}/,"het blok staat niet in de tekstversie");
});

test("confirm_tavern_payment geeft de drie velden terug",async()=>{
  const migratie=await readFile(new URL("../database/first-access.sql",import.meta.url),"utf8");
  const functie=migratie.slice(migratie.indexOf("function public.confirm_tavern_payment"),migratie.indexOf("revoke all on function public.confirm_tavern_payment"));
  // Twee returns: de gewone en die voor een tweede webhook op dezelfde betaling.
  const returns=functie.match(/jsonb_build_object\('status','paid'[^;]*/g)||[];
  assert.equal(returns.length,2,"het aantal 'paid'-returns is veranderd");
  for(const r of returns){
    assert.match(r,/'allergies',claim\.allergies/,"een return laat de allergie weg");
    assert.match(r,/'dietary',claim\.dietary_requirements/);
    assert.match(r,/'notes',claim\.message/);
  }
});
