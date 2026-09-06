// De betaaltermijn van een groepsboeking, zoals Robert hem op 5 september 2026 heeft
// vastgelegd. Elke regel hieronder is een zin uit zijn opdracht.
import assert from "node:assert/strict";
import {test} from "node:test";
import {GROUP_WINDOW_MINUTES,MAX_AUTOMATIC_MINUTES,PHASES,groupPaymentState,groupProgressLabel} from "../netlify/functions/_group-payment.mjs";

const T0=new Date("2026-11-01T10:00:00Z");
const op=minuten=>new Date(T0.getTime()+minuten*60000);
const groep=(...statussen)=>statussen.map((status,i)=>({full_name:`TEST – Deelnemer ${i+1}`,email:`test${i+1}@example.invalid`,status}));
const stand=(deelnemers,minuten)=>groupPaymentState({createdAt:T0,participants:deelnemers,now:op(minuten)});

test("de termijnen zijn 30, 90 en 120 minuten vanaf de reservering",()=>{
  assert.equal(GROUP_WINDOW_MINUTES,30);
  assert.equal(MAX_AUTOMATIC_MINUTES,120);
  const s=stand(groep("awaiting_payment","awaiting_payment"),0);
  assert.equal(s.firstDeadline,op(30).toISOString());
  assert.equal(s.extendedDeadline,op(90).toISOString());
  assert.equal(s.finalDeadline,op(120).toISOString());
});

test("binnen dertig minuten loopt de gewone termijn",()=>{
  const s=stand(groep("awaiting_payment","awaiting_payment","awaiting_payment","awaiting_payment"),29);
  assert.equal(s.phase,PHASES.open);
  assert.equal(s.deadline,op(30).toISOString());
  assert.equal(s.minutesRemaining,1);
  assert.equal(s.releaseSeats,false);
});

test("niemand betaald na dertig minuten: de reservering vervalt, maar niet zonder controle",()=>{
  const s=stand(groep("awaiting_payment","awaiting_payment"),31);
  assert.equal(s.phase,PHASES.lapsed);
  assert.equal(s.releaseSeats,true);
  // Een betaalmelding kan onderweg zijn. Een betaalde plaats mag nooit vervallen omdat
  // onze klok sneller was dan de webhook van Stripe.
  assert.equal(s.requiresPaymentCheckBeforeRelease,true);
});

test("één van de vier betaald: de onbetaalden krijgen eenmalig zestig minuten extra",()=>{
  const s=stand(groep("paid","awaiting_payment","awaiting_payment","awaiting_payment"),31);
  assert.equal(s.phase,PHASES.extended);
  assert.equal(s.deadline,op(90).toISOString());
  assert.equal(s.releaseSeats,false,"er mag bij gedeeltelijke betaling niets vrijkomen");
  assert.equal(s.confirmed,1);
  assert.equal(s.awaiting,3);
});

test("na negentig minuten volgt de laatste dertig, met een melding aan Robert en Nadine",()=>{
  const s=stand(groep("paid","paid","awaiting_payment","awaiting_payment"),91);
  assert.equal(s.phase,PHASES.final_extension);
  assert.equal(s.deadline,op(120).toISOString());
  assert.equal(s.notifyOperators,true,"de operators worden niet gewaarschuwd");
  assert.deepEqual(s.unpaidParticipants.map(p=>p.email),["test3@example.invalid","test4@example.invalid"]);
});

test("na twee uur is het Actie nodig, en verder niets automatisch",()=>{
  const s=stand(groep("paid","awaiting_payment"),121);
  assert.equal(s.phase,PHASES.action_required);
  assert.equal(s.releaseSeats,false,"stoelen komen automatisch vrij bij gedeeltelijke betaling");
  assert.equal(s.notifyOperators,false,"de melding hoort eenmalig te zijn, bij de laatste verlenging");
  // Geen enkele verdere verlenging: de deadline blijft staan waar hij stond.
  assert.equal(stand(groep("paid","awaiting_payment"),600).deadline,op(120).toISOString());
});

test("een betaalde plaats blijft bevestigd, hoe laat het ook is",()=>{
  for(const minuut of [10,31,91,121,10000]){
    const s=stand(groep("paid","awaiting_payment","awaiting_payment"),minuut);
    assert.equal(s.confirmed,1,`op minuut ${minuut} was de betaalde plaats niet meer bevestigd`);
  }
});

test("iedereen betaald is volledig bevestigd, ook na de laatste deadline",()=>{
  for(const minuut of [5,121]){
    const s=stand(groep("paid","paid","paid","paid"),minuut);
    assert.equal(s.phase,PHASES.complete);
    assert.equal(s.deadline,null);
    assert.equal(s.awaiting,0);
  }
});

test("een geannuleerde deelnemer telt niet meer mee als verschuldigd",()=>{
  // Valt er één van vier af, dan blijven de andere drie bevestigd en is de groep compleet.
  const s=stand(groep("paid","paid","paid","cancelled"),121);
  assert.equal(s.phase,PHASES.complete);
  assert.equal(s.participantsTotal,4);
  assert.equal(s.participantsDue,3);
  assert.equal(s.confirmed,3);
});

test("opnieuw versturen kan de deadline niet verschuiven",()=>{
  // De termijn hangt uitsluitend aan het aanmaakmoment. Er is geen veld dat een
  // herinnering kan meegeven, dus er is ook geen manier om er tijd bij te krijgen.
  const deelnemers=groep("paid","awaiting_payment");
  const eerst=stand(deelnemers,40);
  const naEenHerinnering=groupPaymentState({createdAt:T0,participants:deelnemers.map(p=>({...p,payment_link_sent_at:op(39).toISOString()})),now:op(40)});
  assert.equal(naEenHerinnering.deadline,eerst.deadline);
  assert.equal(naEenHerinnering.finalDeadline,eerst.finalDeadline);
});

test("de voortgang leest als een zin en verzwijgt niets",()=>{
  assert.equal(groupProgressLabel(stand(groep("paid","paid","paid","awaiting_payment"),40)),"3 confirmed, 1 awaiting payment");
  assert.equal(groupProgressLabel(stand(groep("paid","paid"),40)),"2 confirmed");
  assert.equal(groupProgressLabel(stand([],10)),"No payment due");
});

test("een onbruikbaar aanmaakmoment levert een fout op, geen gegokte deadline",()=>{
  assert.throws(()=>groupPaymentState({createdAt:"geen datum",participants:groep("paid")}),/group_payment_created_at_invalid/);
});
