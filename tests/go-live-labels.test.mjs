// Wat een bezoeker leest op het moment dat de verkoop opengaat.
//
// Robert, 11 september 2026, bij een schermafbeelding van de homepage: "hier staan nog first
// access!" De omslag naar definitieve documenten had de knoppen die naar First Access verwijzen
// niet meegenomen. Die wisselen niet vanzelf: het zijn vaste teksten. Deze test koppelt ze aan
// dezelfde stand als de betaalpoort, net als tests/booking-config.test.mjs dat doet voor
// /tavern/book/.
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {test} from "node:test";

const root=path.resolve(import.meta.dirname,"..");
const lees=p=>readFile(path.join(root,p),"utf8");
const poortOpen=async()=>!/export const PUBLISHED_TERMS_VERSION="";/.test(await lees("netlify/functions/_booking-config.mjs"));

test("het blok dat bij een open verkoop verschijnt, zegt niet dat de verkoop nog komt",async()=>{
  // first-access.js toont [data-public-booking-open] alleen als de server publicBookingOpen
  // meldt. Een knop "booking opens soon" in dat blok spreekt zichzelf dus altijd tegen.
  const html=await lees("tavern/index.html");
  const m=html.match(/<div class="signup-form" data-public-booking-open hidden>([\s\S]*?)<\/div>/);
  assert.ok(m,"het blok voor de publieke verkoop hoort op /tavern/ te staan");
  // Alleen wat een bezoeker ziet. Het commentaar in dat blok citeert de oude knoptekst juist
  // om uit te leggen waarom hij weg is, en dat mag de test niet voor de knop zelf aanzien.
  const zichtbaar=m[1].replace(/<!--[\s\S]*?-->/g,"");
  assert.doesNotMatch(zichtbaar,/opens soon/i,"dit blok verschijnt pas als de verkoop open is");
  assert.match(zichtbaar,/href="\/tavern\/book\/"/,"de knop hoort naar de boekingspagina te gaan");
});

test("met een open poort nodigt geen vaste knop meer uit voor First Access",async()=>{
  if(!(await poortOpen()))return;   // in de conceptstand is First Access juist de waarheid
  const home=await lees("index.html");
  const tavern=await lees("tavern/index.html");
  assert.doesNotMatch(home,/Join First Access/,"de Tavern-kaart op de homepage");
  assert.doesNotMatch(tavern,/Get first access/i,"de navigatie op /tavern/");
  assert.doesNotMatch(tavern,/Join First Access to hold your seats/,"de aanloop boven het formulier");
});
