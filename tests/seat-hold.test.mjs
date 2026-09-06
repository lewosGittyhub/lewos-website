// De twee fasen van een blokkering, en de grens tussen wat een bezoeker mag zien en wat
// alleen Robert en Nadine mogen zien. Vastgelegd door Robert op 5 september 2026.
import assert from "node:assert/strict";
import {test} from "node:test";
import {FILLING_WINDOW_MINUTES,HOLD_PHASES,adminAvailability,holdState,publicAvailability} from "../netlify/functions/_seat-hold.mjs";

const T0=new Date("2026-11-01T10:00:00Z");
const op=m=>new Date(T0.getTime()+m*60000);
const deelnemers=(...st)=>st.map((status,i)=>({full_name:`TEST – ${i+1}`,email:`t${i+1}@example.invalid`,status}));

const invul=(m,seats=4)=>holdState({phase:HOLD_PHASES.filling,holdStartedAt:T0,seats,now:op(m)});
const betaal=(m,st,seats=4)=>holdState({phase:HOLD_PHASES.payment,paymentStartedAt:T0,participants:deelnemers(...st),seats,now:op(m)});

// ── Invulfase ───────────────────────────────────────────────────────────────

test("de invulfase duurt zestig minuten vanaf het blokkeren",()=>{
  assert.equal(FILLING_WINDOW_MINUTES,60);
  const s=invul(0);
  assert.equal(s.phase,HOLD_PHASES.filling);
  assert.equal(s.deadline,op(60).toISOString());
  assert.equal(s.minutesRemaining,60);
  assert.equal(s.seatsHeld,4);
  assert.equal(s.seatsConfirmed,0,"in de invulfase is nog niets bevestigd");
});

test("de afteller loopt in seconden, zodat de bezoeker hem kan zien tikken",()=>{
  assert.equal(invul(59.5).secondsRemaining,30);
  assert.equal(invul(60).secondsRemaining,0);
});

test("verversen verlengt niets: de deadline hangt alleen aan het startmoment",()=>{
  // Er is geen veld voor activiteit of laatst gezien, dus er valt niets te verlengen.
  // Dezelfde blokkering, tien keer bekeken, houdt dezelfde deadline.
  const deadlines=new Set([0,5,20,45,59].map(m=>invul(m).deadline));
  assert.equal(deadlines.size,1);
  assert.equal([...deadlines][0],op(60).toISOString());
});

test("na zestig minuten vervalt de invulfase en moet er opnieuw geteld worden",()=>{
  const s=invul(61);
  assert.equal(s.expired,true);
  assert.equal(s.releaseSeats,true,"onbetaalde invulplaatsen horen vrij te vallen");
  assert.equal(s.requiresAvailabilityRecheck,true,"er mag niemand verder zonder nieuwe telling");
  // Niemand heeft betaald, dus dit hoeft niet langs Robert.
  assert.equal(s.requiresPaymentCheckBeforeRelease,false);
});

// ── Betaalfase ──────────────────────────────────────────────────────────────

test("de overgang naar de betaalfase laat geen stoel los en telt niets dubbel",()=>{
  const vier=invul(30);
  const na=betaal(0,["awaiting_payment","awaiting_payment","awaiting_payment","awaiting_payment"]);
  assert.equal(vier.seatsHeld+vier.seatsConfirmed,4);
  assert.equal(na.seatsHeld+na.seatsConfirmed,4,"na de overgang zijn het niet meer of minder stoelen");
});

test("in de betaalfase gelden de dertig minuten en de verlengingen",()=>{
  const s=betaal(10,["paid","awaiting_payment","awaiting_payment","awaiting_payment"]);
  assert.equal(s.deadline,op(30).toISOString());
  assert.equal(betaal(31,["paid","awaiting_payment"]).deadline,op(90).toISOString());
  assert.equal(betaal(91,["paid","awaiting_payment"]).deadline,op(120).toISOString());
});

test("betaalde en vastgehouden plaatsen worden apart geteld",()=>{
  const s=betaal(10,["paid","paid","awaiting_payment","awaiting_payment"]);
  assert.equal(s.seatsConfirmed,2);
  assert.equal(s.seatsHeld,2);
});

test("zodra iemand betaald heeft, geeft niets meer automatisch vrij",()=>{
  for(const minuut of [31,91,121,10000]){
    const s=betaal(minuut,["paid","awaiting_payment","awaiting_payment","awaiting_payment"]);
    assert.equal(s.releaseSeats,false,`op minuut ${minuut} kwamen er stoelen vrij`);
    assert.equal(s.requiresRobertToRelease,true,"vrijgeven hoort een beslissing van Robert te zijn");
    assert.equal(s.seatsConfirmed,1,"de betaalde plaats bleef niet bevestigd");
  }
});

test("heeft niemand betaald, dan vervalt de reservering — na controle bij Stripe",()=>{
  const s=betaal(31,["awaiting_payment","awaiting_payment"]);
  assert.equal(s.releaseSeats,true);
  assert.equal(s.requiresPaymentCheckBeforeRelease,true);
  assert.equal(s.requiresRobertToRelease,false);
});

test("alles betaald is bevestigd, en blijft dat",()=>{
  const s=betaal(500,["paid","paid","paid","paid"]);
  assert.equal(s.phase,HOLD_PHASES.confirmed);
  assert.equal(s.seatsConfirmed,4);
  assert.equal(s.seatsHeld,0);
});

// ── Wat een bezoeker mag zien ───────────────────────────────────────────────

test("publiek telt een vastgehouden stoel gewoon als bezet",()=>{
  const beeld=publicAvailability({capacity:6,holds:[{seats:4},{seats:1}]});
  assert.deepEqual(beeld,{capacity:6,remaining:1});
});

test("het publieke antwoord bevat geen enkele interne toestand",()=>{
  const beeld=publicAvailability({capacity:6,holds:[
    {seats:2,phase:"payment",paymentStartedAt:T0,participants:deelnemers("paid","awaiting_payment")},
    {seats:3,phase:"filling",holdStartedAt:T0}]});
  assert.deepEqual(Object.keys(beeld).sort(),["capacity","remaining"]);
  const ruw=JSON.stringify(beeld).toLowerCase();
  for(const woord of ["paid","awaiting","deadline","filling","payment","hold","example.invalid","test"])
    assert.equal(ruw.includes(woord),false,`"${woord}" lekt naar de openbare kant`);
});

// ── Wat Robert en Nadine wél zien ───────────────────────────────────────────

test("het beheer ziet de verdeling tussen betaald en vastgehouden",()=>{
  const beeld=adminAvailability({capacity:6,holds:[
    {phase:HOLD_PHASES.payment,paymentStartedAt:T0,seats:4,participants:deelnemers("paid","paid","awaiting_payment","awaiting_payment")},
    {phase:HOLD_PHASES.filling,holdStartedAt:T0,seats:1}],now:op(10)});
  assert.equal(beeld.seatsConfirmed,2);
  assert.equal(beeld.seatsHeld,3);
  assert.equal(beeld.remaining,1);
  // Publiek is dat één getal: zes min vijf.
  assert.equal(publicAvailability({capacity:6,holds:[{seats:4},{seats:1}]}).remaining,beeld.remaining);
});

test("het minimum van vier betaalde gasten is een eigen status, los van de bevestiging",()=>{
  const onder=adminAvailability({capacity:6,holds:[
    {phase:HOLD_PHASES.payment,paymentStartedAt:T0,seats:4,participants:deelnemers("paid","paid","awaiting_payment","awaiting_payment")}],now:op(10)});
  assert.equal(onder.weekendStatus,"below_minimum");
  assert.equal(onder.belowMinimumBy,2);
  // Twee gasten zijn wél bevestigd. Dat het weekend nog niet doorgaat, verandert daar niets aan.
  assert.equal(onder.seatsConfirmed,2);

  const gehaald=adminAvailability({capacity:6,holds:[
    {phase:HOLD_PHASES.payment,paymentStartedAt:T0,seats:4,participants:deelnemers("paid","paid","paid","paid")}],now:op(10)});
  assert.equal(gehaald.weekendStatus,"going_ahead");
  assert.equal(gehaald.belowMinimumBy,0);
});

test("een vrijgegeven blokkering telt nergens meer mee",()=>{
  const s=holdState({phase:HOLD_PHASES.released,seats:4,now:op(10)});
  assert.equal(s.seatsHeld,0);
  assert.equal(s.seatsConfirmed,0);
});

test("een onbruikbaar starttijdstip levert een fout op, geen gegokte deadline",()=>{
  assert.throws(()=>holdState({phase:HOLD_PHASES.filling,holdStartedAt:"ooit"}),/seat_hold_hold_started_at_invalid/);
  assert.throws(()=>holdState({phase:"iets anders"}),/seat_hold_phase_unknown/);
});
