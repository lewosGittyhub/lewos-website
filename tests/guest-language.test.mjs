// Geen Nederlands waar een gast het kan lezen.
//
// Robert, 10 september 2026: "nooit iets dat met de site heeft te maken in het Nederlands."
// De aanleiding was een Nederlandse tussenpagina van Gmail bij het openen van een testlink.
// Die is niet van ons -- Gmail zet hem in de taal van zijn eigen gebruiker, en een gast met
// een Engelse Gmail ziet hem in het Engels -- maar de regel eronder geldt wel voor alles wat
// we zélf sturen en tonen.
//
// Deze test kijkt naar wat een gast leest: de zichtbare tekst van de pagina's en de
// uitgaande betaalmails. Commentaar in de bronbestanden is Nederlands en hoort dat te
// blijven; dat is voor ons en niet voor een gast, dus dat wordt eerst weggehaald.
//
// De woordenlijst bevat alleen woorden die niet ook Engels of Spaans kunnen zijn. "de" staat
// er niet in: dat zit in "Complejo Rural de Fontecha". "want" staat er niet in: dat is
// Engels in "Want to stay longer?". Een lijst die vals alarm geeft wordt uitgezet, en dan
// bewaakt hij niets meer.
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {test} from "node:test";

const root=path.resolve(import.meta.dirname,"..");
const lees=bestand=>readFile(path.join(root,bestand),"utf8");

const NEDERLANDS=/\b(niet|wordt|worden|moet|moeten|gasten|betaling|betalen|betaald|bevestiging|bevestigen|voorwaarden|deelnemer|deelnemers|aanvraag|nachten|knop|zodat|omdat|geen|dus|terug|uw|wij|jij|hier|daar|ook|nog|maar|alleen|elke|iedere|zonder|tegen|volgens|vanaf)\b/gi;

const gevonden=tekst=>[...new Set((tekst.match(NEDERLANDS)||[]).map(w=>w.toLowerCase()))];

// Wat een bezoeker van de pagina daadwerkelijk ziet: geen script, geen stijl, geen
// commentaar, geen tags. Het commentaar gaat er als eerste uit, want daar staat Nederlands
// in en dat mag daar.
const zichtbareTekst=html=>html
  .replace(/<script[\s\S]*?<\/script>/gi," ")
  .replace(/<style[\s\S]*?<\/style>/gi," ")
  .replace(/<!--[\s\S]*?-->/g," ")
  .replace(/<[^>]+>/g," ")
  .replace(/&[a-z]+;|&#\d+;/gi," ")
  .replace(/\s+/g," ");

const GASTPAGINAS=["tavern/index.html","tavern/pay/index.html","tavern/book/index.html",
  "tavern/checkout/index.html","tavern/private/index.html","tavern/filming-agreement/index.html",
  "index.html","privacy/index.html","legal/index.html"];

for(const pagina of GASTPAGINAS){
  test(`geen Nederlands op ${pagina}`,async()=>{
    let bron;
    try{bron=await lees(pagina);}
    catch(fout){
      // Bestaat de pagina niet meer, dan hoort deze lijst mee te veranderen en niet
      // stilzwijgend een test over te houden die niets meer controleert.
      assert.fail(`${pagina} bestaat niet meer: haal hem uit GASTPAGINAS of herstel het pad`);
    }
    const woorden=gevonden(zichtbareTekst(bron));
    assert.deepEqual(woorden,[],`Nederlands in de zichtbare tekst: ${woorden.join(", ")}`);
  });
}

test("geen Nederlands in het betaalverzoek en de herinnering",async()=>{
  const {buildPaymentRequestEmail}=await import("../netlify/functions/_payment-request.mjs");
  const maak=reminder=>buildPaymentRequestEmail({
    participant:{full_name:"Sam Carter",email:"sam@example.invalid",amount_cents:202500},
    booking:{name:"Alex Reed",weekendLabel:"The Halloween Table · 30 Oct to 2 Nov 2026",seats:4},
    deadline:"2026-09-10T13:02:00.000Z",
    paymentUrl:"https://lewos.co/tavern/pay/?ref=tav_voorbeeld",reminder});
  for(const reminder of [false,true]){
    const mail=maak(reminder);
    for(const [waar,tekst] of [["subject",mail.subject],["text",mail.text],
                               ["html",zichtbareTekst(mail.html)]]){
      const woorden=gevonden(tekst);
      assert.deepEqual(woorden,[],
        `Nederlands in ${waar} van ${reminder?"de herinnering":"het betaalverzoek"}: ${woorden.join(", ")}`);
    }
  }
});

test("geen Nederlands in de melding aan de accommodatie",async()=>{
  // Die mail is Engels én Spaans, op verzoek van Robert. Nederlands hoort er niet in: de
  // Nederlandse vertaling staat in operations/mailroutering.md, niet in de mail zelf.
  const bron=await lees("netlify/functions/stripe-webhook.mjs");
  const zonderCommentaar=bron.split("\n").filter(r=>!r.trim().startsWith("//")).join("\n");
  const teksten=[...zonderCommentaar.matchAll(/"([^"\\\n]{12,})"/g)].map(m=>m[1]);
  for(const tekst of teksten){
    const woorden=gevonden(tekst);
    assert.deepEqual(woorden,[],`Nederlands in een uitgaande tekst: "${tekst}"`);
  }
});
