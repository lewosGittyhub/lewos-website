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

// Heeft deze toestand ergens opmaak die op hem slaat? Kijkt naar de selector, niet naar de
// vorm — vijf toestanden mogen prima één regel delen, en dat doen ze sinds 6 september 2026.
const heeftOpmaak=(html,klasse)=>
  [...html.matchAll(/([^{}]+)\{[^}]*\}/g)].some(m=>new RegExp(`\\.calday\\.${klasse}(?![a-z-])`).test(m[1]));

const {nightsOf,busyNights,weekendBlockEvent,weekendBlockIdFor,LEWOS_MARKER,bookingEvent,
  classifyEvent,accommodationAddresses,unrecognisedEvents,ACCOMMODATION_MARKER,TAVERN_TIMEZONE}
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
    assert.ok(heeftOpmaak(html,"is-busy"),`${pagina} geeft een bezette nacht geen opmaak`);
    assert.ok(heeftOpmaak(html,"is-taken"),`${pagina} geeft een weggeboekt weekend geen opmaak`);
  }
});

// ── Wat ik zelf verkeerd had ────────────────────────────────────────────────
// Gevonden op 6 september 2026 bij het nalopen van mijn eigen beweringen.

test("de cache geldt alleen voor het beeld, niet voor de grens",async()=>{
  // Het publieke eindpunt onthoudt vijf minuten. Zou de controle bij het opslaan diezelfde
  // cache gebruiken, dan kon een boeking van Nadine vijf minuten lang genegeerd worden —
  // precies in het venster waarin je een nacht dubbel verkoopt.
  const publiek=await lees("netlify/functions/house-availability.mjs");
  assert.match(publiek,/CACHE_MS/);
  const grens=await lees("netlify/functions/_stay.mjs");
  assert.doesNotMatch(grens,/cache/i,"de servercontrole leest niet rechtstreeks");
  assert.match(grens,/await listEvents\(config,\{from:van,to:tot\}\)/,
    "de servercontrole gaat niet zelf naar de agenda");
});

test("de cache groeit niet onbeperkt",async()=>{
  const bron=await lees("netlify/functions/house-availability.mjs");
  assert.match(bron,/CACHE_MAX/,"elk nieuw datumbereik laat een regel achter in een langlevend proces");
  assert.match(bron,/while\(cache\.size>CACHE_MAX\)/);
});

test("boekingen zonder datums leveren geen aanroep met undefined op",async()=>{
  const bron=await lees("netlify/functions/admin-bookings.mjs");
  const blok=bron.slice(bron.indexOf("const agendaBotsingen"),bron.indexOf("export const handler"));
  assert.match(blok,/if\(!datums\.length\)return \[\];/,
    "een leeg bereik zou met undefined naar Google bellen");
});

test("dit-kan-niet heeft één beeld, geen vijf",async()=>{
  // Er waren vijf uiterlijken voor vijf redenen die voor een gast hetzelfde betekenen.
  // Niemand ziet het verschil tussen 30% en 32% doorzichtig; dat was ruis die ik zelf had
  // ingebouwd. De reden blijft in het voorleeslabel staan, dus er gaat niets verloren.
  const redenen=["is-past","is-outside","is-busy","is-full","is-taken"];
  for(const pagina of ["tavern/index.html","tavern/book/index.html"]){
    const html=await lees(pagina);
    const regels=[...html.matchAll(/([^{}]+)\{([^}]*)\}/g)];
    const uiterlijken=new Set();
    for(const klasse of redenen){
      const raak=regels.filter(m=>new RegExp(`\\.calday\\.${klasse}(?![a-z-])`).test(m[1])
        &&!/calday__n/.test(m[1]));
      assert.ok(raak.length,`${pagina}: ${klasse} heeft geen opmaak`);
      uiterlijken.add(raak.map(m=>m[2].replace(/\s+/g,"")).join("|"));
    }
    assert.equal(uiterlijken.size,1,
      `${pagina}: de vijf redenen om niet te kunnen boeken zien er nog ${uiterlijken.size} verschillende manieren uit`);
  }
});

test("de dode hover-klasse van de oude kalender is opgeruimd",async()=>{
  // `is-hot` kwam uit de kalender van vóór het gedeelde onderdeel en werd nergens meer
  // gezet — alleen de CSS stond er nog.
  const component=await lees("assets/weekend-calendar.js");
  assert.doesNotMatch(component,/is-hot/);
  for(const pagina of ["tavern/index.html","tavern/book/index.html"])
    assert.doesNotMatch(await lees(pagina),/is-hot/,`${pagina} draagt nog dode opmaak`);
});


// ── Wie blokkeert er voorraad? ──────────────────────────────────────────────
//
// Robert, 6 september 2026: de koppeling staat op een eigen agenda, en daarin mag ook een
// privéafspraak staan. Die mag geen nacht meer van de site halen.

// Een verzonnen accommodatieadres. Het echte staat in `LEWOS_ACCOMMODATION_EMAILS`, niet
// hier — het is een persoonsgegeven en dat hoort niet in de repo.
const HUIS=["huis@voorbeeld.test"];
const nacht=["2026-11-20"];

test("een privéafspraak in de gedeelde agenda blokkeert niets",()=>{
  const prive={summary:"Tandarts",creator:"robert@voorbeeld.test",nights:nacht};
  assert.equal(classifyEvent(prive,HUIS).blocks,false);
  assert.equal(classifyEvent(prive,HUIS).reason,"niet_herkend");
  assert.equal(busyNights([prive],{accommodationEmails:HUIS}).size,0);
});

test("een boeking van de accommodatie blokkeert wel",()=>{
  const vanNadine={summary:"Familie de Vries",creator:"huis@voorbeeld.test",nights:nacht};
  assert.equal(classifyEvent(vanNadine,HUIS).reason,"accommodatie_adres");
  assert.deepEqual([...busyNights([vanNadine],{accommodationEmails:HUIS})],nacht);
});

test("het organisatoradres telt net zo goed als de maker",()=>{
  // Wie een afspraak van een andere agenda kopieert, blijft maker maar niet organisator.
  const gekopieerd={creator:"iemand@voorbeeld.test",organizer:"HUIS@Voorbeeld.TEST",nights:nacht};
  assert.equal(classifyEvent(gekopieerd,HUIS).blocks,true,"hoofdletters mogen niets uitmaken");
});

test("zonder ingestelde herkenning blokkeert alles wat niet van ons is",()=>{
  // De gevaarlijkste stand: iemand vergeet `LEWOS_ACCOMMODATION_EMAILS` te zetten. Dan valt
  // de koppeling terug op het oude, strenge gedrag in plaats van stilzwijgend alles door te
  // laten. Een gemiste verkoop bel je recht; twee groepen voor hetzelfde bed niet.
  const onbekend={summary:"?",creator:"wie-dan-ook@voorbeeld.test",nights:nacht};
  assert.equal(classifyEvent(onbekend,[]).reason,"herkenning_niet_ingesteld");
  assert.equal(classifyEvent(onbekend,[]).blocks,true);
  assert.equal(accommodationAddresses("").length,0);
});

test("de expliciete markering blokkeert ook zonder bekend adres",()=>{
  // Voor een boeking die Robert zelf telefonisch aanneemt en in de agenda zet.
  const handmatig={summary:"Telefonisch",creator:"robert@voorbeeld.test",
    source:ACCOMMODATION_MARKER,nights:nacht};
  assert.equal(classifyEvent(handmatig,HUIS).reason,"gemarkeerd_als_accommodatie");
});

test("onze eigen boeking wordt niet dubbel afgetrokken",()=>{
  const eigen={summary:"Tavern",ours:true,source:LEWOS_MARKER,
    creator:"serviceaccount@voorbeeld.test",nights:nacht};
  assert.equal(classifyEvent(eigen,HUIS).reason,"eigen_afspraak");
  assert.equal(busyNights([eigen],{accommodationEmails:HUIS}).size,0);
});

test("een niet-herkende afspraak verdwijnt niet uit het zicht",()=>{
  const prive={summary:"Tandarts",creator:"robert@voorbeeld.test",nights:nacht};
  const vanNadine={summary:"Gasten",creator:"huis@voorbeeld.test",nights:nacht};
  const eigen={ours:true,nights:nacht};
  const over=unrecognisedEvents([prive,vanNadine,eigen],{accommodationEmails:HUIS});
  assert.equal(over.length,1);
  assert.equal(over[0].summary,"Tandarts");
});

test("een lege of afgezegde afspraak telt nergens mee",()=>{
  assert.equal(classifyEvent(null,HUIS).blocks,false);
  assert.equal(classifyEvent({creator:"huis@voorbeeld.test",nights:[]},HUIS).reason,"geen_nachten");
});

test("de site leest wie de afspraak maakte",async()=>{
  // Zonder deze velden kan `classifyEvent` niets herkennen en blokkeert alles.
  const bron=await lees("netlify/functions/_calendar.mjs");
  assert.match(bron,/creator:item\.creator\?\.email/);
  assert.match(bron,/organizer:item\.organizer\?\.email/);
});

test("de tijdzone van de agenda blijft Europe/Madrid",()=>{
  assert.equal(TAVERN_TIMEZONE,"Europe/Madrid");
});

test("het agenda-id en Nadine's adres staan niet in de repo",async()=>{
  // Harde grens 4 uit CLAUDE.md: geen persoonsgegevens in de repo. Roberts eigen
  // inlogadres mag wel in zijn eigen handleiding staan — zonder dat is die onbruikbaar.
  // Het gaat om het adres van een ander en om het agenda-id: allebei instellingen.
  for(const pad of ["netlify/functions/_calendar.mjs","netlify/functions/house-availability.mjs",
    "operations/google-agenda-koppeling.md","operations/werkafspraak-gedeelde-agenda.md"]){
    const inhoud=await lees(pad);
    assert.doesNotMatch(inhoud,/[0-9a-f]{32,}@group\.calendar\.google\.com/,`${pad} bevat een agenda-id`);
    // De naam van het huis mag; het e-mailadres van de accommodatie niet.
    assert.doesNotMatch(inhoud,/[a-z0-9._%+-]*fontecha[a-z0-9._%+-]*@/i,
      `${pad} bevat het e-mailadres van de accommodatie`);
  }
});
