// Allergieën en dieetwensen als één veld.
//
// Robert heeft ze op 5 september 2026 samengevoegd. Wat deze testset bewaakt is niet dat
// het veld bestaat, maar de twee dingen die bij een samenvoeging misgaan:
//
//   1. **Verlies.** Er staan boekingen in de database met twee gevulde kolommen. Die tekst
//      moet gewoon blijven verschijnen, ook nu het formulier er nog maar één heeft.
//   2. **Dubbel.** Als het nieuwe veld én de twee oude naast elkaar getoond worden, leest
//      iemand dezelfde allergie twee keer en weet niet welke de geldige is.
//
// En de grens die niet verschuift: deze tekst gaat naar Lewos. Niet naar Google Agenda,
// niet naar de accommodatie, niet naar het maandoverzicht.

import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

// Deze test roept echte functies aan. Sinds 7 september 2026 weigert elke omgeving die
// niet verklaart wat hij is — zie netlify/functions/_deploy-context.mjs. Een testrun is
// een omgeving met eigen instellingen, dus die verklaart zich hier als zodanig.
process.env.LEWOS_PREVIEW_SAFE="true";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const lees=p=>readFile(path.join(root,p),"utf8");

const {mergeLegacyDietary,dietaryText,DIETARY_LABEL}=await import("../netlify/functions/_dietary.mjs");
const {FIELD_LIMITS}=await import("../netlify/functions/_field-limits.mjs");

// ── Samenvoegen ─────────────────────────────────────────────────────────────

test("twee oude velden worden één tekst, met hun kopjes erbij",()=>{
  assert.equal(mergeLegacyDietary("Peanuts - severe","Vegetarian"),
    "Allergies: Peanuts - severe\nDietary requirements: Vegetarian");
});

test("één gevuld veld levert één regel op, zonder leeg kopje",()=>{
  assert.equal(mergeLegacyDietary("Peanuts",""),"Allergies: Peanuts");
  assert.equal(mergeLegacyDietary("","Vegan"),"Dietary requirements: Vegan");
});

test("twee lege velden leveren niets op, niet het woord 'geen'",()=>{
  assert.equal(mergeLegacyDietary("",""),"");
  assert.equal(mergeLegacyDietary(null,undefined),"");
  assert.equal(mergeLegacyDietary("   ","\n"),"");
});

test("het nieuwe veld wint, en de oude staan er dan niet meer naast",()=>{
  // Dit is de kern. Zou de terugval erbij komen in plaats van eronder, dan las een gast
  // zijn allergie twee keer en wist niemand welke van de twee de geldige was.
  const tekst=dietaryText({dietaryNotes:"Peanuts, and one vegetarian.",
    allergies:"Peanuts - severe",dietary:"Vegetarian"});
  assert.equal(tekst,"Peanuts, and one vegetarian.");
  assert.equal(tekst.includes("Allergies:"),false,"de oude velden zijn er alsnog bij geplakt");
});

test("zonder nieuw veld valt hij terug op de twee oude",()=>{
  assert.equal(dietaryText({allergies:"Peanuts",dietary:"Vegan"}),
    "Allergies: Peanuts\nDietary requirements: Vegan");
  assert.equal(dietaryText({}),"");
});

test("de grens is duizend tekens, in de browser en op de server",async()=>{
  assert.equal(FIELD_LIMITS.dietaryNotes,1000);
  const browser=await lees("assets/field-limits.js");
  assert.match(browser,/dietaryNotes:1000/);
  const migratie=await lees("database/first-access.sql");
  assert.match(migratie,/tavern_seat_claims_dietary_notes_length check \(dietary_notes is null or char_length\(dietary_notes\)<=1000\)/);
  assert.match(migratie,/char_length\(coalesce\(p_dietary_notes,''\)\) > 1000 then raise exception 'invalid_dietary_notes'/);
});

// ── De database ─────────────────────────────────────────────────────────────

test("de kolom komt erbij zonder bestaande rijen te breken",async()=>{
  const migratie=await lees("database/first-access.sql");
  assert.match(migratie,/add column if not exists dietary_notes text;/);
  assert.doesNotMatch(migratie,/add column if not exists dietary_notes text not null/,
    "een not null-kolom zou de migratie op bestaande rijen laten stuklopen");
  // En de twee oude kolommen blijven bestaan. Ze worden gelezen, niet gewist.
  assert.doesNotMatch(migratie,/drop column .*(allergies|dietary_requirements)/,
    "een oude kolom wordt weggegooid — daar staan bestaande boekingen in");
});

test("de samenvoeging in de database heeft dezelfde vorm als die in de functies",async()=>{
  const migratie=await lees("database/first-access.sql");
  const functie=migratie.slice(migratie.indexOf("function private.merged_dietary_text"),
                               migratie.indexOf("-- Eenmalig samenvoegen"));
  assert.match(functie,/'Allergies: '\|\|trim\(p_allergies\)/);
  assert.match(functie,/'Dietary requirements: '\|\|trim\(p_dietary\)/);
  // Dezelfde kopjes als `mergeLegacyDietary`, anders ziet een oude rij er anders uit dan
  // een oude client — en dan is niet meer te zien welke van de twee je voor je hebt.
  const uitJs=mergeLegacyDietary("X","Y");
  assert.ok(uitJs.startsWith("Allergies: ")&&uitJs.includes("\nDietary requirements: "));
});

test("de eenmalige samenvoeging overschrijft nooit en verdubbelt nooit",async()=>{
  const migratie=await lees("database/first-access.sql");
  const update=migratie.slice(migratie.indexOf("update public.tavern_seat_claims\n   set dietary_notes"));
  const eerste=update.slice(0,update.indexOf(";")+1);
  // Alleen waar het veld nog leeg is: twee keer draaien mag niets veranderen.
  assert.match(eerste,/where nullif\(trim\(coalesce\(dietary_notes,''\)\),''\) is null/,
    "de samenvoeging kan een al ingevuld veld overschrijven");
  assert.match(eerste,/and private\.merged_dietary_text\(allergies, dietary_requirements\) is not null/,
    "rijen zonder gegevens krijgen een lege tekst in plaats van null");
});

// ── Waar het wél en niet terechtkomt ────────────────────────────────────────

test("het veld staat los van het algemene berichtveld",async()=>{
  // De reden dat dit een eigen veld blijft: een allergie moet terug te vinden zijn zonder
  // dat iemand een vrije tekst hoeft door te lezen.
  for(const bron of ["netlify/functions/first-access.mjs","netlify/functions/stripe-webhook.mjs"]){
    const tekst=await lees(bron);
    assert.ok(tekst.includes(DIETARY_LABEL),`${bron} noemt het veld niet onder zijn eigen kopje`);
    assert.doesNotMatch(tekst,/message:[^,\n]*dietaryNotes|dietaryNotes[^,\n]*\+[^,\n]*message/,
      `${bron} plakt het dieetveld in het berichtveld`);
  }
});

test("de agenda neemt het veld niet eens aan",async()=>{
  const tekst=await lees("netlify/functions/_calendar.mjs");
  const handtekening=tekst.slice(tekst.indexOf("export const bookingEvent="),tekst.indexOf("=>{",tekst.indexOf("export const bookingEvent=")));
  for(const veld of ["dietaryNotes","allergies","dietary"])
    assert.equal(handtekening.includes(veld),false,`bookingEvent neemt ${veld} aan — dan kan het per ongeluk in de agenda komen`);
});

test("het maandoverzicht van de beheeromgeving draagt het niet",async()=>{
  const migratie=await lees("database/stay-dates.sql");
  const overzicht=migratie.slice(migratie.indexOf("function public.admin_bookings_in_range"),
                                 migratie.indexOf("function public.admin_booking_detail"));
  for(const veld of ["dietary_notes","allergies","dietary_requirements"])
    assert.equal(overzicht.includes(veld),false,`het maandoverzicht draagt ${veld} mee`);
  // In het detail hoort hij juist wél te staan: dat is de beveiligde plek.
  const detail=migratie.slice(migratie.indexOf("function public.admin_booking_detail"));
  assert.match(detail,/'dietaryNotes', coalesce\(nullif\(trim\(coalesce\(c\.dietary_notes,''\)\),''\),/);
  assert.match(detail,/private\.merged_dietary_text\(c\.allergies, c\.dietary_requirements\)\)/);
});

test("de beheerpagina toont één blok, niet twee",async()=>{
  const bron=await lees("admin/admin.js");
  assert.match(bron,/Allergies & dietary requirements/);
  assert.doesNotMatch(bron,/paar\("Allergies"/,"er staat nog een los blok voor allergieën");
  assert.doesNotMatch(bron,/paar\("Dietary"/,"er staat nog een los blok voor dieetwensen");
  assert.match(bron,/Never written to Google Calendar or to any shared overview/,
    "de waarschuwing bij het blok is verdwenen");
});

test("de voorbeeldtekst past in het vak, ook op een telefoon",async()=>{
  // Gevonden op 5 september 2026 bij 375 pixels breed: de laatste regel van de
  // voorbeeldtekst — "Leave empty if none." — viel onder de rand van het vak. Juist die
  // regel zegt dat het veld optioneel is.
  for(const pagina of ["tavern/index.html","tavern/private/index.html",
                       "tavern/book/index.html","tavern/checkout/index.html"]){
    const html=await lees(pagina);
    const regel=html.match(/textarea\[data-limit="dietaryNotes"\]\s*\{[^}]*\}/);
    assert.ok(regel,`${pagina} geeft het gecombineerde veld geen eigen hoogte`);
    const hoogte=Number((regel[0].match(/min-height:\s*(\d+)px/)||[])[1]);
    assert.ok(hoogte>=170,`${pagina}: ${hoogte}px is te laag voor vijf regels voorbeeldtekst`);
  }
});
