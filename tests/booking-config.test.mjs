import assert from "node:assert/strict";
import {afterEach,test} from "node:test";
import {readFile} from "node:fs/promises";
import {paymentsAreEnabled,publicBookingIsOpen} from "../netlify/functions/_booking-config.mjs";

const original={...process.env};
afterEach(()=>{
  for(const key of Object.keys(process.env))if(!(key in original))delete process.env[key];
  Object.assign(process.env,original);
});

const configureTestDocuments=()=>{
  process.env.NODE_ENV="test";
  process.env.TAVERN_PAYMENTS_ENABLED="true";
  process.env.BOOKING_TERMS_VERSION="booking-test-v1";
  process.env.BOOKING_TERMS_DOCUMENT_URL="/documents/terms.pdf";
  process.env.TRAVEL_INFORMATION_DOCUMENT_URL="/documents/travel.pdf";
};

test("local test servers can exercise payment flows with fixture documents",()=>{
  configureTestDocuments();
  process.env.URL="http://127.0.0.1:4177";
  assert.equal(paymentsAreEnabled(),true);
});

test("NODE_ENV test can never bypass reviewed documents on a public deployment",()=>{
  configureTestDocuments();
  process.env.URL="https://lewos.co";
  assert.equal(paymentsAreEnabled(),false);
});

// Robert, 2 september 2026: PUBLIC_BOOKING_OPENS_AT blijft staan tot er een
// definitieve verkoopdatum is, maar die datum mag de betaalpoort nooit openen
// zolang de zes ANBEN-gegevens en de definitieve teksten ontbreken. De volgorde
// in publicBookingIsOpen regelt dat — de datum wordt pas gelezen nadat de poort
// al open staat. Deze test houdt die volgorde vast, ook als iemand de functie
// later herschrijft.
test("geen enkele datum opent de betaalpoort zolang de documenten leeg zijn",()=>{
  process.env.NODE_ENV="production";
  process.env.URL="https://lewos.co";
  process.env.TAVERN_PAYMENTS_ENABLED="true";
  process.env.BOOKING_TERMS_VERSION="booking-test-v1";
  process.env.BOOKING_TERMS_DOCUMENT_URL="/documents/terms.pdf";
  process.env.TRAVEL_INFORMATION_DOCUMENT_URL="/documents/travel.pdf";
  for(const moment of ["1970-01-01T00:00:00Z","2026-09-09T09:00:00Z",new Date(Date.now()-1000).toISOString(),new Date().toISOString(),"not-a-date",""]){
    process.env.PUBLIC_BOOKING_OPENS_AT=moment;
    assert.equal(publicBookingIsOpen(),false,`de betaalpoort ging open op ${moment||"een lege datum"}`);
    assert.equal(paymentsAreEnabled(),false,`betalingen stonden aan op ${moment||"een lege datum"}`);
  }
  delete process.env.PUBLIC_BOOKING_OPENS_AT;
  assert.equal(publicBookingIsOpen(),false,"de betaalpoort ging open zonder datum");
});

// De drie constanten zijn de sleutel: termsArePublished is een EN van alle drie,
// dus één lege constante houdt de hele poort dicht. Deze test bewaakt alleen dat
// ze leeg blijven — het openzetten van de poort hoort een bewuste codewijziging
// te zijn, niet een omgevingsvariabele in Netlify.
test("de drie constanten in _booking-config staan nog steeds leeg",async()=>{
  const config=await readFile(new URL("../netlify/functions/_booking-config.mjs",import.meta.url),"utf8");
  for(const constant of ["PUBLISHED_TERMS_VERSION","PUBLISHED_TERMS_DOCUMENT","PUBLISHED_TRAVEL_DOCUMENT"]){
    assert.match(config,new RegExp(`export const ${constant}="";`),`${constant} is niet meer leeg`);
  }
});

// ── Voorverkoopfase, 4 september 2026 ─────────────────────────────────────────
// Robert: de site staat tijdelijk in voorverkoop. Er wordt niets verkocht, er gaat geen
// Stripe open, en er worden geen stoelen definitief vastgelegd. Deze vier controles leggen
// die toestand vast, en koppelen haar aan de betaalpoort zodat ze niet uit de pas kan lopen.

test("de aankooppagina en de betaalpoort gaan samen open en samen dicht",async()=>{
  // /tavern/book/ zegt op haar gezicht dat er nu betaald wordt. Met een gesloten poort is
  // dat onwaar: de bezoeker vult alles in en loopt dan op een 503 die hij niet kan plaatsen.
  const config=await readFile(new URL("../netlify/functions/_booking-config.mjs",import.meta.url),"utf8");
  const redirects=await readFile(new URL("../_redirects",import.meta.url),"utf8");
  const forced=redirects.split("\n").map(line=>line.trim().split(/\s+/)).filter(parts=>parts[2]==="404!").map(parts=>parts[0]);
  const poortDicht=/export const PUBLISHED_TERMS_VERSION="";/.test(config);
  const routeDicht=forced.includes("/tavern/book")&&forced.includes("/tavern/book/*");
  assert.equal(routeDicht,poortDicht,
    poortDicht
      ? "de betaalpoort is dicht, dus /tavern/book/ moet ook op 404 staan"
      : "de betaalpoort is open, dus /tavern/book/ moet weer uitgeleverd worden");
});

test("het interesseformulier zegt dat er niet betaald wordt en wanneer de voorwaarden komen",async()=>{
  const html=await readFile(new URL("../tavern/index.html",import.meta.url),"utf8");
  assert.match(html,/No payment is taken here/,"het formulier moet zeggen dat er hier niet betaald wordt");
  assert.match(html,/Final terms are provided before any payment is requested/,"de melding over de definitieve voorwaarden is verplicht in deze fase");
  // De melding staat vóór de knop, niet erna: wie hem pas na het versturen leest heeft niets aan hem.
  assert.ok(html.indexOf("Final terms are provided before any payment is requested")<html.indexOf("Hold my seats"),
    "de melding hoort vóór de verstuurknop te staan");
});

test("het interesseformulier start geen betaling",async()=>{
  const script=await readFile(new URL("../tavern/first-access.js",import.meta.url),"utf8");
  const functie=await readFile(new URL("../netlify/functions/first-access.mjs",import.meta.url),"utf8");
  for(const [naam,bron] of [["tavern/first-access.js",script],["netlify/functions/first-access.mjs",functie]]){
    assert.doesNotMatch(bron,/api\/checkout/,`${naam} mag geen checkout aanroepen in de voorverkoopfase`);
    assert.doesNotMatch(bron,/stripe/i,`${naam} mag Stripe nergens aanraken`);
    assert.doesNotMatch(bron,/begin_tavern_checkout/,`${naam} mag geen betaalhold aanmaken`);
  }
  // Het formulier legt interesse vast, geen betaalde stoel.
  assert.match(functie,/register_tavern_interest/,"de aanmelding hoort via register_tavern_interest te lopen");
});

test("geen enkele zichtbare pagina meldt een bevestigde boeking of betaling",async()=>{
  // De Stripe-retourpagina's blijven staan voor als de verkoop opengaat, maar zijn zonder
  // Stripe niet te bereiken. Wat een bezoeker nu wél kan zien, mag niets bevestigen.
  const zichtbaar=["tavern/index.html","index.html","thanks/index.html"];
  for(const pagina of zichtbaar){
    const html=await readFile(new URL(`../${pagina}`,import.meta.url),"utf8");
    for(const belofte of ["Your payment has been received","booking is confirmed","payment has been confirmed"]){
      assert.ok(!html.includes(belofte),`${pagina} mag geen betaling of boeking bevestigen in de voorverkoopfase`);
    }
  }
});
