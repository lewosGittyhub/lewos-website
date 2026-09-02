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
