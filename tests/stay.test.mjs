// Het verblijf: wat is geboekt, en wat is gevraagd.
//
// Deze testset bewaakt één ding boven alles. **Een aangevraagde nacht mag nergens als
// bevestigd verblijf opduiken** — niet in de prijs, niet in de agenda, niet in de mail
// aan de accommodatie, niet in de beheeromgeving. Wij hebben geen beschikbaarheidsagenda
// van Fontecha; een nacht die de gast aanklikt is een vraag en blijft dat tot iemand daar
// antwoord op geeft.

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

const {describeStay,confirmedStay,staySentence,stayRequestText,nightsBetween,parseDay,STAY_STATUS}
  =await import("../assets/stay.js");
const {readStayRequest,stayLines}=await import("../netlify/functions/_stay.mjs");

const WEEKEND={weekendStart:"2026-11-06",weekendEnd:"2026-11-09"};

// ── Het tellen zelf ─────────────────────────────────────────────────────────

test("vrijdag tot maandag is drie nachten, en dat is wat er verkocht wordt",()=>{
  const stand=describeStay(WEEKEND);
  assert.equal(stand.weekendNights,3);
  assert.equal(stand.extraNights,0);
  assert.equal(stand.status,STAY_STATUS.none);
  assert.equal(stand.arrival,"2026-11-06");
  assert.equal(stand.departure,"2026-11-09");
});

test("nachten ervoor en erna worden apart geteld",()=>{
  const stand=describeStay({...WEEKEND,arrival:"2026-11-04",departure:"2026-11-10"});
  assert.equal(stand.nightsBefore,2);
  assert.equal(stand.nightsAfter,1);
  assert.equal(stand.extraNights,3);
  assert.equal(stand.totalNights,6);
  assert.equal(stand.status,STAY_STATUS.requested);
});

test("de weekendnachten kun je niet weg klikken",()=>{
  // Aankomen ná het begin of vertrekken vóór het einde zou betekenen dat iemand een
  // deel van het weekend niet koopt. Dat product bestaat niet.
  assert.equal(describeStay({...WEEKEND,arrival:"2026-11-07"}).error,"arrival_after_weekend_start");
  assert.equal(describeStay({...WEEKEND,departure:"2026-11-08"}).error,"departure_before_weekend_end");
});

test("een zomertijdsprong eet geen nacht op",()=>{
  // In Europe/Madrid gaat de klok in de nacht van 24 op 25 oktober 2026 een uur terug.
  // Rekenen in lokale tijd maakte daar 0,96 dag van, en dat rondde naar de verkeerde kant.
  assert.equal(nightsBetween("2026-10-24","2026-10-26"),2);
  assert.equal(nightsBetween("2026-03-28","2026-03-30"),2);
});

test("een datum die niet bestaat wordt niet stilzwijgend een andere datum",()=>{
  assert.equal(parseDay("2026-02-31"),null);
  assert.equal(parseDay("2026-13-01"),null);
  assert.equal(parseDay("niet een datum"),null);
});

// Het rekenwerk zelf kent geen bovengrens: het telt wat het krijgt. De grens zit in de
// kalender, en die komt uit een afspraak die op /tavern/ staat — niet uit een getal dat
// hier bedacht is.
test("het rekenwerk telt wat het krijgt, zonder een verzonnen maximum",async()=>{
  const stand=describeStay({...WEEKEND,arrival:"2026-10-23",departure:"2026-11-23"});
  assert.equal(stand.valid,true);
  assert.equal(stand.nightsBefore,14);
  assert.equal(stand.nightsAfter,14);
  for(const bestand of ["assets/stay.js","netlify/functions/_stay.mjs"]){
    const tekst=await lees(bestand);
    assert.doesNotMatch(tekst,/MAX_EXTRA_NIGHTS|maxExtraNights|nightsBefore>\d/,
      `${bestand} voert een maximum in; die grens hoort in de kalender, niet in het rekenwerk`);
  }
});

test("de kalender laat alleen kiezen wat de pagina belooft",async()=>{
  // Gevonden op 5 september 2026: één klik ver vooruit maakte een aanvraag van 54 nachten
  // en kleurde een hele maand oranje. Een datumkiezer bij een hotel laat dagen die je niet
  // kunt krijgen grijs; die grens ontbrak hier.
  //
  // De grens is niet verzonnen. Hij staat op /tavern/, en deze test houdt de code en die
  // zin aan elkaar vast: gaat de een veranderen, dan valt de ander om.
  const pagina=await lees("tavern/index.html");
  assert.match(pagina,/extend your stay from the Monday before your Tavern weekend, or remain until Friday morning after it/,
    "de afspraak waar de kalender op leunt staat niet meer op de pagina");
  const component=await lees("assets/weekend-calendar.js");
  // Het rekenwerk staat in stay.js, zodat de browser en de database hetzelfde venster
  // uitrekenen. De kalender mag er geen eigen tweede versie van hebben.
  assert.match(component,/stayWindow/,"de kalender gebruikt het gedeelde venster niet");
  assert.doesNotMatch(component,/const vorigeMaandag=|const volgendeVrijdag=/,
    "de kalender rekent het venster zelf uit naast stay.js");
  const rekenwerk=await lees("assets/stay.js");
  assert.match(rekenwerk,/export const previousMonday=/);
  assert.match(rekenwerk,/export const nextFriday=/);
  assert.match(rekenwerk,/export const stayWindow=/);
  // Buiten het venster is het geen knop, en de klik wordt ook aan de andere kant geweigerd:
  // opmaak alleen is geen grens.
  assert.match(component,/is-outside/,"dagen buiten het venster zijn niet als zodanig gemarkeerd");
  assert.match(component,/if\(grens&&\(dag<grens\.from\|\|dag>grens\.to\)\)return;/,
    "de klik zelf wordt niet begrensd");
  // En het loopt nooit de nachten van een ánder Tavern-weekend in: twee weekenden aaneen
  // is op de pagina expliciet een gesprek, geen klik. De wisseldag zelf mag wél.
  assert.match(rekenwerk,/if\(aEind<=start&&aEind>van\)van=aEind;/,
    "het venster wordt niet afgeknipt op het vorige weekend");
  assert.match(rekenwerk,/if\(aStart>=eind&&aStart<tot\)tot=aStart;/,
    "het venster wordt niet afgeknipt op het volgende weekend");
  // Wie langer wil, loopt niet dood. **Die uitnodiging hoort bij de pagina, niet bij de
  // kalender**: onder de kalender was hij op /tavern/ de derde kopie, en op /tavern/book/
  // een uitnodiging om weg te klikken op het moment van beslissen. De garantie blijft: op
  // elke pagina met de kalender staat een weg naar Robert.
  // Kijk naar wat hij tékent, niet naar wat er in het commentaar staat: de kop van het
  // bestand citeert de afspraak van /tavern/ en dat hoort daar juist.
  assert.doesNotMatch(component,/<a href="\/contact\//,"de kalender tekent de uitnodiging weer zelf");
  for(const paginaPad of ["tavern/index.html","tavern/book/index.html"]){
    const html=await lees(paginaPad);
    assert.match(html,/href="\/contact\/"/,`${paginaPad} heeft geen weg naar Robert`);
  }
  for(const paginaPad of ["tavern/index.html","tavern/book/index.html"]){
    const html=await lees(paginaPad);
    assert.match(html,/\.calday\.is-outside(?![a-z-])/,`${paginaPad} geeft een dag buiten het venster geen opmaak`);
    // De link naar Robert moet leesbaar zijn. Zonder eigen regel wordt hij standaard
    // browserblauw op een donkergroene achtergrond — gevonden op 5 september 2026.
    // Elke link in een hint op deze pagina moet een eigen kleur hebben, niet alleen die
    // onder de kalender: zonder regel wordt hij browserblauw op donkergroen.
    for(const m of html.matchAll(/<p class="(?:calendar__hint|field-hint)"[^>]*>[\s\S]*?<\/p>/g)){
      if(!/<a /.test(m[0]))continue;
      assert.match(html,/(?:calendar__hint|field-hint)[^{]*a[^{]*\{[^}]*color/,
        `${paginaPad}: een link in een hint krijgt geen eigen kleur`);
    }
  }
});

// ── Aangevraagd is niet bevestigd ───────────────────────────────────────────

test("zolang niemand ja heeft gezegd is het bevestigde verblijf het weekend zelf",()=>{
  const bevestigd=confirmedStay({...WEEKEND,status:STAY_STATUS.requested});
  assert.equal(bevestigd.arrival,"2026-11-06");
  assert.equal(bevestigd.departure,"2026-11-09");
  assert.equal(bevestigd.extraNights,0);
  assert.equal(bevestigd.includesExtraNights,false);
});

test("een afgewezen aanvraag rekt het verblijf ook niet op",()=>{
  const bevestigd=confirmedStay({...WEEKEND,status:STAY_STATUS.declined,
    confirmedArrival:"2026-11-04",confirmedDeparture:"2026-11-10"});
  assert.equal(bevestigd.arrival,"2026-11-06","een afgewezen nacht telde mee als verblijf");
  assert.equal(bevestigd.departure,"2026-11-09");
});

test("de accommodatie mag minder bevestigen dan er gevraagd is",()=>{
  // Eén van de twee nachten kan vrij zijn en de andere niet. Dan is het bevestigde
  // verblijf precies die ene nacht, en niet de hele aanvraag.
  const bevestigd=confirmedStay({...WEEKEND,status:STAY_STATUS.confirmed,
    confirmedArrival:"2026-11-05",confirmedDeparture:"2026-11-09"});
  assert.equal(bevestigd.nightsBefore,1);
  assert.equal(bevestigd.nightsAfter,0);
  assert.equal(bevestigd.includesExtraNights,true);
});

// ── De teksten worden afgeleid, niet ingetypt ───────────────────────────────

test("de zin onder de kalender noemt inbegrepen en apart betaalde extra nachten",()=>{
  const zin=staySentence(describeStay({...WEEKEND,arrival:"2026-11-04",departure:"2026-11-10"}));
  assert.match(zin,/3 nights included in the weekend/);
  assert.match(zin,/2 nights before and 1 night after booked with your stay/);
  assert.match(zin,/paid separately upon arrival/);
  assert.doesNotMatch(zin,/6 nights included/,"de aangevraagde nachten zijn bij het weekend opgeteld");
});

test("zonder aanvraag belooft de zin niets over extra nachten",()=>{
  const zin=staySentence(describeStay(WEEKEND));
  assert.match(zin,/all included in the weekend/);
  assert.doesNotMatch(zin,/request/i);
});

test("de regel voor de accommodatie zegt zelf dat er nog niets vastligt",()=>{
  const regel=stayRequestText(describeStay({...WEEKEND,arrival:"2026-11-05"}));
  assert.match(regel,/^Requested: 1 night before the weekend\./);
  assert.match(regel,/Not confirmed — subject to accommodation availability\./);
});

test("geen aanvraag levert geen regel op, niet het woord 'geen'",()=>{
  assert.equal(stayRequestText(describeStay(WEEKEND)),"");
});

// ── Wat er van een formulier binnenkomt is een bewering ─────────────────────

test("lege velden betekenen: alleen het weekend",()=>{
  assert.deepEqual(readStayRequest({}),{arrival:null,departure:null});
  assert.deepEqual(readStayRequest({requestedArrival:"",requestedDeparture:" "}),{arrival:null,departure:null});
});

test("onleesbare of omgekeerde datums komen er niet langs",()=>{
  assert.throws(()=>readStayRequest({requestedArrival:"04-11-2026"}),/stay_arrival_invalid/);
  assert.throws(()=>readStayRequest({requestedDeparture:"morgen"}),/stay_departure_invalid/);
  assert.throws(()=>readStayRequest({requestedArrival:"2026-11-10",requestedDeparture:"2026-11-04"}),/stay_dates_reversed/);
});

test("stayLines houdt bevestigd en aangevraagd uit elkaar",()=>{
  const regels=stayLines({...WEEKEND,requestedArrival:"2026-11-04",requestedDeparture:"2026-11-10",
    status:STAY_STATUS.requested,confirmedArrival:"2026-11-06",confirmedDeparture:"2026-11-09"});
  assert.equal(regels.confirmedArrival,"2026-11-06");
  assert.equal(regels.confirmedDeparture,"2026-11-09");
  assert.equal(regels.confirmedIncludesExtraNights,false);
  assert.match(regels.extraNightsRequest,/2 nights before the weekend and 1 night after/);
  assert.equal(regels.extraNightsStatus,"requested");
});

test("een oude boeking met vrije tekst verliest zijn aanvraag niet",()=>{
  // Boekingen van vóór de kalender hebben geen datums maar wel de woorden van de gast.
  // Die gaan mee als wat ze zijn, en niet als een datum die wij hebben verzonnen.
  const regels=stayLines({...WEEKEND,status:STAY_STATUS.none,legacyText:"Two nights before, one after."});
  assert.match(regels.extraNightsRequest,/^Requested \(as written by the guest\): Two nights before, one after\.$/);
  assert.equal(regels.confirmedArrival,"2026-11-06");
});

// ── De kalender in de browser ───────────────────────────────────────────────

// Robert, 6 september 2026: **vrijdagochtend mag.** Het beginnen van het volgende
// Tavern-weekend is op zichzelf geen reden om de donderdag als grens te nemen — jij vertrekt
// om 09:30, de volgende gasten komen om 16:00, en jullie nachten botsen dus niet. Het gaat
// om nachten, niet om dagen.
test("de wisseldag telt mee: vertrekken kan op de ochtend dat de volgende groep komt",async()=>{
  const {stayWindow}=await import("../assets/stay.js");
  const weekends=[
    {slug:"weekend-01",startsOn:"2026-10-30",endsOn:"2026-11-02"},
    {slug:"weekend-02",startsOn:"2026-11-06",endsOn:"2026-11-09"},
    {slug:"weekend-03",startsOn:"2026-11-13",endsOn:"2026-11-16"}
  ];
  const w1=stayWindow({weekendStart:"2026-10-30",weekendEnd:"2026-11-02",weekends});
  assert.equal(w1.to,"2026-11-06","vrijdagochtend 6 november moet als vertrekdag kunnen");
  assert.equal(w1.from,"2026-10-26","aankomen kan vanaf de maandag ervóór");

  // En andersom: aankomen op de ochtend dat de vorige groep vertrekt.
  const w2=stayWindow({weekendStart:"2026-11-06",weekendEnd:"2026-11-09",weekends});
  assert.equal(w2.from,"2026-11-02","aankomen op de vertrekdag van het vorige weekend moet kunnen");
  assert.equal(w2.to,"2026-11-13","vertrekken op de aankomstdag van het volgende weekend moet kunnen");

  // Wat níét mag: een nacht die van iemand anders is.
  assert.ok(w1.to<="2026-11-06","het venster loopt voorbij de eerste nacht van het volgende weekend");
  assert.ok(w2.from>="2026-11-02","het venster loopt vóór de laatste nacht van het vorige weekend");

  // De kalender biedt zo'n dag aan als eindpunt, met uitleg — niet als gewone weekenddag.
  const component=await lees("assets/weekend-calendar.js");
  assert.match(component,/is-turnover/);
  assert.match(component,/the previous Tavern group leaves in the morning/);
  assert.match(component,/the next Tavern group arrives in the afternoon/);
});

test("een extra nacht is zichtbaar als onderdeel van de boeking",async()=>{
  // Robert, 5 september 2026: de aangevraagde nachten moeten mee oranje kleuren met het
  // weekend, zodat het verblijf als één reeks leest. Dat mag — als het verschil maar
  // blijft bestaan. Ze zijn aangevraagd en niet geboekt, en dat mag de kalender niet
  // wegpoetsen. Het verschil zit nu in de tint, niet meer in een streepjesrand.
  const component=await lees("assets/weekend-calendar.js");
  assert.match(component,/is-requested/);
  // Kleur alleen is geen mededeling: het voorleeslabel zegt de nieuwe betaalwijze ook.
  assert.match(component,/booked with your stay, paid on arrival/i,"de legenda noemt de betaalwijze niet");
  for(const pagina of ["tavern/index.html","tavern/book/index.html"]){
    const html=await lees(pagina);
    const regel=naam=>{
      const m=html.match(new RegExp(`\\.calday\\.${naam}\\s*\\{([^}]*)\\}`));
      assert.ok(m,`${pagina} geeft .${naam} geen opmaak`);
      return m[1].replace(/\s+/g,"");
    };
    const gekozen=regel("is-chosen"),aangevraagd=regel("is-requested");
    assert.notEqual(aangevraagd,gekozen,
      `${pagina}: een aangevraagde nacht is niet te onderscheiden van een geboekte`);
    // Wel dezelfde kleurfamilie: het verblijf hoort als één reeks te lezen.
    const oranje=/229,100,58|239,101,59|var\(--orange\)/;
    assert.match(aangevraagd,oranje,`${pagina}: een aangevraagde nacht kleurt niet mee met het weekend`);
    // En geen streepjes meer: die stonden ook op de dagen die niemand had aangeklikt.
    assert.doesNotMatch(html,/\.calday\.is-open\s*\{[^}]*dashed/,
      `${pagina}: een nog niet gekozen dag draagt weer een streepjesrand`);
  }
});

test("de weekendnachten van het gekozen weekend zijn niet uit te zetten",async()=>{
  const component=await lees("assets/weekend-calendar.js");
  // Klikken op je eigen weekend doet niets: alleen een ánder weekend kiezen verandert iets.
  assert.match(component,/if\(knop\.dataset\.slug!==gekozen\)/);
});

test("de kalender kan niet naar het verleden",async()=>{
  const component=await lees("assets/weekend-calendar.js");
  assert.match(component,/laagsteMaand/);
  assert.match(component,/is-past/);
});

test("beide boekingspagina's gebruiken dezelfde kalender",async()=>{
  for(const script of ["tavern/first-access.js","tavern/book/booking.js"]){
    const bron=await lees(script);
    assert.match(bron,/from "\/assets\/weekend-calendar\.js"|from '\/assets\/weekend-calendar\.js'/,
      `${script} laadt de gedeelde kalender niet`);
    assert.doesNotMatch(bron,/calmonth__grid/,`${script} tekent zijn eigen kalender naast de gedeelde`);
  }
});
