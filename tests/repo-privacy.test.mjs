// Wat er nooit in deze repo mag staan.
//
// Robert, 7 september 2026: het adres van de accommodatie stond op negen plekken, waaronder
// als seed in een migratie. Het is eruit gehaald vóór de eerste push, want een adres dat
// eenmaal in de Git-geschiedenis staat krijg je er niet meer uit zonder die te herschrijven.
// Deze test bewaakt dat het niet terugsluipt — en meteen de andere dingen die niet in een
// publieke repository horen.
import assert from "node:assert/strict";
import {test} from "node:test";
import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import path from "node:path";

const root=path.resolve(import.meta.dirname,"..");
// Alleen wat git volgt. Wat genegeerd is gaat toch niet mee naar GitHub.
const bestanden=execFileSync("git",["ls-files"],{cwd:root,encoding:"utf8"})
  .split("\n").filter(Boolean);
const lees=p=>{try{return readFileSync(path.join(root,p),"utf8");}catch{return "";}};

// Adressen die er wél mogen staan, met de reden erbij.
const TOEGESTAAN=[
  // Roberts eigen zakelijke adres. Staat al openbaar in de voorwaarden, de juridische
  // kennisgeving en op de contactpagina; het weglaten zou die pagina's onbruikbaar maken.
  /^lewos\.co@gmail\.com$/i,
  /@lewos\.co$/i,
  // De verzekeraar op de standaardinformatiepagina. Dat is een wettelijk verplichte
  // vermelding van de insolventiedekking — die hoort er juist wél te staan.
  /^aperturas\.empresas@axa\.es$/i,
  // Het serviceaccount van Google. Geen persoon, en de handleiding is zonder dit adres
  // niet uit te voeren.
  /@[a-z0-9-]+\.iam\.gserviceaccount\.com$/i,
  // Alles wat zichtbaar verzonnen is.
  /@([a-z0-9-]+\.)*invalid$/i,
  /@([a-z0-9-]+\.)*example\.(com|org|net)$/i,
  /@voorbeeld\.test$/i,
  /@hold\.invalid$/i,
  /@group\.calendar\.google\.com$/i,
  /@example\.invalid$/i
];

const ADRES=/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

test("er staat geen e-mailadres van een derde in de repo",()=>{
  const gevonden=new Map();
  for(const pad of bestanden){
    for(const adres of lees(pad).match(ADRES)||[]){
      if(TOEGESTAAN.some(r=>r.test(adres)))continue;
      if(!gevonden.has(adres))gevonden.set(adres,pad);
    }
  }
  assert.deepEqual([...gevonden.entries()],[],
    "onbekend adres in de repo — verzonnen adressen horen op .invalid te eindigen");
});

test("het adres van de accommodatie staat nergens",()=>{
  // Los benoemd, want dit is de fout die op 7 september 2026 hersteld is.
  for(const pad of bestanden)
    assert.doesNotMatch(lees(pad),/[a-z0-9._%+-]*fontecha[a-z0-9._%+-]*@/i,
      `${pad} draagt het adres van de accommodatie`);
});

test("de migratie zaait geen adres van een derde",()=>{
  // Zonder commentaar kijken: de uitleg boven de seed bevat zelf een voorbeeld-insert.
  const sql=lees("database/admin.sql").split("\n").map(r=>r.replace(/--.*$/,"")).join("\n");
  const seed=sql.slice(sql.indexOf("insert into public.lewos_admins"));
  const adressen=(seed.slice(0,seed.indexOf(";")).match(ADRES)||[]);
  assert.deepEqual(adressen,["lewos.co@gmail.com"],
    "de seed hoort alleen het eigen adres van Lewos te bevatten");
});

test("er staan geen sleutels, tokens of connection strings in de repo",()=>{
  const patronen=[
    [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]{0,40}[A-Za-z0-9+/]{40}/,"een privésleutel"],
    [/\bsk_live_[A-Za-z0-9]{10,}/,"een Stripe live-sleutel"],
    [/\bsk_test_[A-Za-z0-9]{20,}/,"een Stripe testsleutel"],
    [/\bre_[A-Za-z0-9]{20,}/,"een Resend-sleutel"],
    [/\bwhsec_[A-Za-z0-9]{24,}/,"een Stripe webhook-geheim"],
    [/\bAIza[0-9A-Za-z_-]{30,}/,"een Google API-sleutel"],
    [/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./,"een JWT"],
    [/postgres(ql)?:\/\/[^\s"'`]*:[^\s"'`]*@/,"een connection string met wachtwoord"]
  ];
  for(const pad of bestanden){
    const inhoud=lees(pad);
    for(const [patroon,wat] of patronen){
      // De documentatie mag `-----BEGIN PRIVATE KEY-----` noemen om uit te leggen wáár je
      // de sleutel vandaan haalt. Wat niet mag is de sleutel zelf, en die herken je aan de
      // base64 die erachter staat — daar zoekt het patroon op.
      assert.doesNotMatch(inhoud,patroon,`${pad} bevat ${wat}`);
    }
  }
});

test("er staat geen echt agenda-id en geen NIE of IBAN van Robert in de repo",()=>{
  for(const pad of bestanden){
    const inhoud=lees(pad);
    assert.doesNotMatch(inhoud,/[0-9a-f]{32,}@group\.calendar\.google\.com/,
      `${pad} bevat een echt agenda-id`);
    // Een Spaans NIE: X, Y of Z, zeven cijfers, een letter. Robert-specifiek, dus nooit.
    assert.doesNotMatch(inhoud,/\b[XYZ]-?\d{7}-?[A-Z]\b/,`${pad} lijkt een NIE te bevatten`);
    // Een IBAN van 20 tekens of meer. De NIF van de verzekeraar is geen IBAN.
    assert.doesNotMatch(inhoud,/\b[A-Z]{2}\d{2}[ ]?(?:[A-Z0-9]{4}[ ]?){4,}\b/,
      `${pad} lijkt een IBAN te bevatten`);
  }
});
