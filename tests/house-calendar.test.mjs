// De gedeelde agenda: wie boekt wat, en wat mag de site daarmee doen.
//
// Afgesproken met Robert op 6 september 2026. Eén agenda, eigendom van Lewos, gedeeld met
// Nadine. Zij zet haar eigen verhuur er rechtstreeks in. **Wie het eerst boekt, heeft het.**
//
// Wat deze testset bewaakt zijn de drie manieren waarop dit stuk stuk kan gaan:
//
//   1. **Een nacht verkeerd tellen.** Een wisseldag is geen nacht: wie om 09:30 vertrekt en
//      wie om 16:00 aankomt delen een datum maar geen bed. Eén dag ernaast en je verkoopt
//      een nacht die bezet is, of je weigert er een die vrij is.
//   2. **Onze eigen afspraken voor die van Nadine aanzien.** Dan blokkeert een weekend
//      zichzelf tegen zijn eigen boeking.
//   3. **Een storing als "vrij" lezen.** Onbekend is niet vrij. Kan de agenda niet gelezen
//      worden, dan blokkeren we niets én beloven we niets.

import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const lees=p=>readFile(path.join(root,p),"utf8");

const {nightsOf,busyNights,weekendBlockEvent,weekendBlockIdFor,LEWOS_MARKER,bookingEvent}
  =await import("../netlify/functions/_calendar.mjs");

// ── Nachten tellen ──────────────────────────────────────────────────────────

test("een hele-dagafspraak eindigt op de dag die er niet bij hoort",()=>{
  // Google geeft bij een hele-dagafspraak een einddatum die exclusief is. Wie dat mist,
  // blokkeert er standaard één nacht te veel.
  assert.deepEqual(nightsOf({start:{date:"2026-11-10"},end:{date:"2026-11-13"}}),
    ["2026-11-10","2026-11-11","2026-11-12"]);
  assert.deepEqual(nightsOf({start:{date:"2026-11-10"},end:{date:"2026-11-11"}}),["2026-11-10"]);
});

test("een afspraak met tijden telt de nachten die er echt in liggen",()=>{
  // Een Tavern-weekend: vrijdag 16:00 tot maandag 09:30. Drie nachten.
  assert.deepEqual(nightsOf({start:{dateTime:"2026-10-30T16:00:00+01:00"},end:{dateTime:"2026-11-02T09:30:00+01:00"}}),
    ["2026-10-30","2026-10-31","2026-11-01"]);
});

test("de wisseldag is geen nacht",()=>{
  // Nadine's gast vertrekt vrijdag 09:30; de Tavern komt vrijdag 16:00. Dezelfde datum,
  // maar niemand slaapt er twee keer. Dit is precies de dag waar Robert op stond.
  const vertrekt=nightsOf({start:{dateTime:"2026-11-02T16:00:00+01:00"},end:{dateTime:"2026-11-06T09:30:00+01:00"}});
  assert.equal(vertrekt.includes("2026-11-06"),false,"de vertrekdag telt als nacht mee");
  assert.equal(vertrekt.at(-1),"2026-11-05");
  const komt=nightsOf({start:{dateTime:"2026-11-06T16:00:00+01:00"},end:{dateTime:"2026-11-09T09:30:00+01:00"}});
  assert.equal(komt[0],"2026-11-06","de aankomstdag telt niet als nacht mee");
});

test("een afgezegde of als vrij gemarkeerde afspraak blokkeert niets",()=>{
  assert.deepEqual(nightsOf({status:"cancelled",start:{date:"2026-11-10"},end:{date:"2026-11-12"}}),[]);
  // Zo kan Nadine een notitie in de agenda zetten zonder dat de site denkt dat het huis vol zit.
  assert.deepEqual(nightsOf({transparency:"transparent",start:{date:"2026-11-10"},end:{date:"2026-11-12"}}),[]);
});

// ── Wie is van wie ──────────────────────────────────────────────────────────

test("onze eigen afspraken tellen niet als bezet",()=>{
  const bezet=busyNights([
    {ours:true,nights:["2026-10-30","2026-10-31"]},
    {ours:false,nights:["2026-11-10","2026-11-11"]}
  ]);
  assert.equal(bezet.has("2026-11-10"),true);
  assert.equal(bezet.has("2026-10-30"),false,"een weekend blokkeert zichzelf tegen zijn eigen boeking");
});

test("het merkteken is wat ons van Nadine onderscheidt",async()=>{
  const bron=await lees("netlify/functions/_calendar.mjs");
  assert.equal(LEWOS_MARKER,"tavern-booking");
  assert.match(bron,/lewosSource:LEWOS_MARKER/,"de weekendblokkade draagt het merkteken niet");
  assert.match(bron,/lewosSource:"tavern-booking"/,"de boekingsafspraak draagt het merkteken niet");
  assert.match(bron,/item\.extendedProperties\?\.private\?\.lewosSource===LEWOS_MARKER/,
    "bij het lezen wordt het merkteken niet gecontroleerd");
});

// ── De weekendblokkade ──────────────────────────────────────────────────────

test("een weekend krijgt één blokkade, ook bij herhaald draaien",()=>{
  // Het id is afgeleid van de slug, dus een tweede run levert dezelfde afspraak op in
  // plaats van een tweede blokkade in de agenda.
  assert.equal(weekendBlockIdFor("weekend-01"),weekendBlockIdFor("weekend-01"));
  assert.notEqual(weekendBlockIdFor("weekend-01"),weekendBlockIdFor("weekend-02"));
  assert.match(weekendBlockIdFor("weekend-01"),/^[0-9a-f]{64}$/,"Google eist base32hex; een sha256 in hex past daarbinnen");
});

test("de blokkade zegt wat hij is en waarom hij er staat",()=>{
  const blok=weekendBlockEvent({slug:"weekend-01",label:"Weekend 01",
    startsOn:"2026-10-30",endsOn:"2026-11-02",seatsBooked:2,capacity:6});
  assert.match(blok.summary,/house reserved/);
  assert.match(blok.description,/Seats booked: 2 of 6/);
  assert.match(blok.description,/Do not delete/,"zonder waarschuwing wordt hij een keer weggegooid");
  assert.match(blok.startDateTime,/^2026-10-30T16:00/);
  assert.match(blok.endDateTime,/^2026-11-02T09:30/);
});

test("een blokkade zonder datums wordt niet verzonnen",()=>{
  assert.throws(()=>weekendBlockEvent({slug:"x",label:"X"}),/calendar_weekend_dates_missing/);
});

// ── Gezondheidsgegevens blijven waar ze horen ───────────────────────────────

test("de agenda-afspraak neemt nog steeds geen dieetgegevens aan",()=>{
  const afspraak=bookingEvent({claimId:"claim-0001",name:"Robert",seats:2,weekendLabel:"Weekend 01",
    arrivalDate:"2026-10-30",departureDate:"2026-11-02",
    dietaryNotes:"Peanuts",allergies:"Peanuts",dietary:"Vegetarian"});
  const alles=JSON.stringify(afspraak);
  for(const geheim of ["Peanuts","Vegetarian"])
    assert.equal(alles.includes(geheim),false,`"${geheim}" staat in de afspraak`);
});

// ── Storing is niet hetzelfde als vrij ──────────────────────────────────────

test("zonder agenda blokkeren we niets en beloven we niets",async()=>{
  const {houseNightsFree}=await import("../netlify/functions/_stay.mjs");
  const eerder=process.env.LEWOS_CALENDAR_ID;
  delete process.env.LEWOS_CALENDAR_ID;
  const uitkomst=await houseNightsFree({arrival:"2026-11-10",departure:"2026-11-13"});
  if(eerder!==undefined)process.env.LEWOS_CALENDAR_ID=eerder;
  assert.equal(uitkomst.known,false,"onbekend werd als bekend gelezen");
  assert.deepEqual(uitkomst.conflicts,[]);
});

test("het publieke eindpunt geeft datums, nooit namen van gasten",async()=>{
  const bron=await lees("netlify/functions/house-availability.mjs");
  // Nadine's afspraken dragen de namen van háár gasten. Die horen niet in een antwoord
  // dat iedere bezoeker kan opvragen.
  assert.match(bron,/busyNights:/);
  assert.doesNotMatch(bron,/summary/,"het publieke antwoord draagt de titels van afspraken mee");
  assert.match(bron,/configured:false/,"er is geen veilige terugval bij een storing");
  assert.match(bron,/range_too_wide/,"een onbegrensd venster maakt hier een uitleespoging van");
});

test("de beheeromgeving mag de titels wél zien, achter de controle",async()=>{
  const bron=await lees("netlify/functions/admin-bookings.mjs");
  assert.match(bron,/calendarConflicts/);
  assert.match(bron,/summary:afspraak\.summary/,"zonder de titel kan niemand uitzoeken wat er speelt");
  // En de botsing verandert nooit iets uit zichzelf.
  assert.doesNotMatch(bron,/agendaBotsingen[\s\S]{0,400}(update|delete|release)/i,
    "een botsing mag geen boeking aanpassen");
});

test("de site laat een weekend los dat Nadine heeft geboekt",async()=>{
  const component=await lees("assets/weekend-calendar.js");
  assert.match(component,/weekendBezet/);
  assert.match(component,/is-taken/);
  assert.match(component,/ask us about other possibilities/i,"een weggeboekt weekend wordt een dichte deur");
  for(const pagina of ["tavern/index.html","tavern/book/index.html"]){
    const html=await lees(pagina);
    assert.match(html,/\.calday\.is-busy\s*\{/,`${pagina} geeft een bezette nacht geen eigen opmaak`);
    assert.match(html,/\.calday\.is-taken\s*\{/,`${pagina} geeft een weggeboekt weekend geen eigen opmaak`);
  }
});
