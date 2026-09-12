// De twee documenten die aan elke bevestigingsmail hangen.
//
// Gevonden op 10 september 2026: `loadAttachment` in stripe-webhook.mjs haalt de
// boekingsvoorwaarden en de reisinformatie als PDF van het eigen domein en gooit een fout als
// het bestand ontbreekt, geen PDF is, of te klein of te groot is. Die PDF's bestonden niet. Was
// de poort open gegaan met paden die geen PDF opleveren, dan was dat pas bij de eerste betaling
// gebleken: de mail faalt, de webhook geeft 500, Stripe blijft het proberen, en de gast heeft
// betaald zonder bevestiging.
//
// Deze test legt dezelfde eisen op als loadAttachment, zodat de suite omvalt en niet de eerste
// betaling.
import assert from "node:assert/strict";
import {readFile,stat} from "node:fs/promises";
import path from "node:path";
import {test} from "node:test";
import {PUBLISHED_TERMS_VERSION,PUBLISHED_TERMS_DOCUMENT,PUBLISHED_TRAVEL_DOCUMENT}
  from "../netlify/functions/_booking-config.mjs";

const root=path.resolve(import.meta.dirname,"..");
const lees=p=>readFile(path.join(root,p),"utf8");

for(const [wat,pad] of [["voorwaarden",PUBLISHED_TERMS_DOCUMENT],["reisinformatie",PUBLISHED_TRAVEL_DOCUMENT]]){
  test(`de ${wat} die aan de bevestigingsmail hangen zijn een echte PDF`,async()=>{
    assert.ok(pad.startsWith("/documents/"),`${pad} hoort onder /documents/ te staan`);
    const bestand=path.join(root,pad);
    const info=await stat(bestand).catch(()=>null);
    assert.ok(info,`${pad} bestaat niet in de repo -- de eerste bevestigingsmail zou falen`);
    // Dezelfde grenzen als loadAttachment: tussen 100 bytes en 5 MB, en begint met %PDF.
    assert.ok(info.size>=100&&info.size<=5_000_000,`${pad} is ${info.size} bytes`);
    const kop=(await readFile(bestand)).subarray(0,4).toString();
    assert.equal(kop,"%PDF",`${pad} begint niet met %PDF`);
    assert.ok(pad.includes(PUBLISHED_TERMS_VERSION),`${pad} hoort de versie ${PUBLISHED_TERMS_VERSION} in de naam te dragen`);
  });
}

test("het standaardinformatieformulier staat er ook als PDF",async()=>{
  const pad=`documents/lewos-tavern-standard-information-${PUBLISHED_TERMS_VERSION}.pdf`;
  const kop=(await readFile(path.join(root,pad))).subarray(0,4).toString();
  assert.equal(kop,"%PDF");
});

test("de PDF's blijven uit zoekmachines, net als de pagina's",async()=>{
  assert.match(await lees("robots.txt"),/Disallow: \/documents\//);
  assert.match(await lees("_headers"),/\/documents\/\*\s*\n\s*X-Robots-Tag: noindex/);
});

// Robert, 12 september 2026: de Adventurer's Guide gaat als derde bijlage mee met de
// bevestigingsmail, pas ná betaling. Hij is géén verkoopdocument: de betaalpoort hangt er
// niet aan, en ontbreekt hij, dan hoort de bevestiging gewoon door te gaan.
test("de Adventurer's Guide is een echte PDF en past als bijlage",async()=>{
  const {PUBLISHED_GUIDE_DOCUMENT}=await import("../netlify/functions/_booking-config.mjs");
  assert.match(PUBLISHED_GUIDE_DOCUMENT,/^\/documents\/.+\.pdf$/,"de gids hoort in /documents/ te staan");
  const pad=path.join(root,PUBLISHED_GUIDE_DOCUMENT.replace(/^\//,""));
  const bytes=await readFile(pad);
  assert.equal(bytes.subarray(0,4).toString(),"%PDF","de gids is geen PDF");
  assert.ok(bytes.length<5_000_000,
    `de gids is ${(bytes.length/1e6).toFixed(1)} MB; loadAttachment weigert alles boven 5 MB`);
});

test("de bevestigingsmails sturen de gids mee, maar vallen er niet over",async()=>{
  const bron=await readFile(path.join(root,"netlify/functions/stripe-webhook.mjs"),"utf8");
  assert.match(bron,/const laadGids=async/,"er is geen aparte laadstap voor de gids");
  assert.match(bron,/catch\(error\)\{console\.error\("Guide attachment error",error\);return null;\}/,
    "een kapotte gids mag de bevestiging niet tegenhouden");
  assert.equal((bron.match(/const gids=await laadGids\(origin\)/g)||[]).length,2,
    "beide bevestigingsmails horen de gids mee te sturen");
});

test("de gids is een echt document en geen rasterkopie",async()=>{
  // Robert, 12 september 2026, na de eerste testboeking: "de pdf van de tavern adventure guid
  // is niet orgineel hij is gekropt." Het bestand dat toen meeging had nul lettertypen en
  // dertien afbeeldingen op dertien pagina's — elke pagina platgeslagen tot één JPEG door het
  // macOS-filter *Reduce File Size*, dat rastert. Zacht beeld, geen selecteerbare tekst, en de
  // MediaBox acht punten verschoven zonder dat de inhoud meeging, dus een afgesneden bovenrand.
  //
  // Een gids van 16,8 MB kan niet als bijlage: met base64 wordt de mail ~23 MB en die draagt
  // ook de wettelijk verplichte boekingsvoorwaarden. De uitweg is een export uit Canva als
  // *PDF Standard* — die houdt tekst tekst en blijft klein. Deze test houdt vast dat er weer
  // een rastercopie ingeslopen kan zijn.
  const {PUBLISHED_GUIDE_DOCUMENT}=await import("../netlify/functions/_booking-config.mjs");
  const bytes=await readFile(path.join(root,PUBLISHED_GUIDE_DOCUMENT.replace(/^\//,"")));
  const fonts=(bytes.toString("latin1").match(/\/Type\s*\/Font/g)||[]).length;
  assert.ok(fonts>0,
    `de gids bevat ${fonts} lettertypen: dit is een afbeelding per pagina, geen document. `+
    "Exporteer opnieuw uit Canva als PDF Standard (niet PDF Print, geen snijtekens).");
});
