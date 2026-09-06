// De blokkering in twee fasen, lokaal doorgespeeld met een klok die we vooruit kunnen
// zetten en met sessies die tegelijk aankloppen.
//
//     node scripts/local-hold-sim.mjs
//
// Waarom een simulatie naast de tests: de unittests controleren de rekenregels, dit
// controleert het gedrág — twee bezoekers die op dezelfde seconde op boeken klikken, een
// blokkering die verloopt terwijl er een tabblad open staat, een overgang naar betalen die
// geen stoel mag laten vallen. Er is hier geen database, geen netwerk en geen browser;
// alleen de regels, met de tijd in de hand.
//
// De nagebootste database volgt `database/seat-holds.sql`. Het advisory lock is hier een
// wachtrij van één: elke bewerking op de beschikbaarheid gaat er achter elkaar doorheen,
// precies zoals `pg_advisory_xact_lock(hashtext('tavern-weekends'))` dat in Postgres doet.
// Loopt dit uiteen van de SQL, dan bewijst deze proef niets.

import {createHash} from "node:crypto";
import {FILLING_WINDOW_MINUTES,HOLD_PHASES,adminAvailability,holdState,publicAvailability} from "../netlify/functions/_seat-hold.mjs";

// ── Een klok die we vooruit kunnen zetten ────────────────────────────────────
const klok={nu:new Date("2026-09-05T09:00:00Z")};
const now=()=>new Date(klok.nu);
const vooruit=minuten=>{klok.nu=new Date(klok.nu.getTime()+minuten*60000);return `⏩ ${minuten} min → ${klok.nu.toISOString().slice(11,16)}`;};

// ── De nagebootste database ──────────────────────────────────────────────────
const WEEKEND={slug:"weekend-02",capacity:6,minimumPaidGuests:4};
let claims=[];
const hash=waarde=>createHash("sha256").update(String(waarde)).digest("hex");

// Het slot. Eén bewerking tegelijk, net als in Postgres.
let wachtrij=Promise.resolve();
const onderSlot=taak=>{
  const resultaat=wachtrij.then(taak);
  wachtrij=resultaat.catch(()=>{});
  return resultaat;
};

const verlopenOpruimen=()=>{
  for(const c of claims){
    if(c.hold_phase!=="filling")continue;
    if(new Date(c.hold_expires_at)>now())continue;
    if((c.participants||[]).some(p=>p.status==="paid"))continue;   // nooit een betaalde plaats
    c.hold_phase="released";c.status="expired";c.release_reason="filling_window_expired";
  }
};

const bezetteStoelen=()=>claims
  .filter(c=>["filling","first_access_held","payment_pending","paid"].includes(c.status))
  .reduce((n,c)=>n+c.party_size,0);

const beginSeatHold=(sessie,stoelen)=>onderSlot(async()=>{
  verlopenOpruimen();
  const bestaand=claims.find(c=>c.booking_session_hash===hash(sessie)&&["filling","payment"].includes(c.hold_phase));
  if(bestaand)return {status:"resumed",claimId:bestaand.id,seats:bestaand.party_size,
    holdExpiresAt:bestaand.hold_expires_at,phase:bestaand.hold_phase};
  const vrij=WEEKEND.capacity-bezetteStoelen();
  if(vrij<stoelen)return {status:"not_available",remaining:Math.max(0,vrij)};
  const claim={id:`claim-${claims.length+1}`,party_size:stoelen,status:"filling",hold_phase:"filling",
    hold_started_at:now().toISOString(),
    hold_expires_at:new Date(now().getTime()+FILLING_WINDOW_MINUTES*60000).toISOString(),
    booking_session_hash:hash(sessie),participants:[]};
  claims.push(claim);
  return {status:"held",claimId:claim.id,seats:stoelen,holdExpiresAt:claim.hold_expires_at};
});

const releaseSeatHold=sessie=>onderSlot(async()=>{
  const c=claims.find(x=>x.booking_session_hash===hash(sessie)&&["filling","payment"].includes(x.hold_phase));
  if(!c)return {status:"no_hold"};
  if((c.participants||[]).some(p=>p.status==="paid"))
    return {status:"requires_operator",claimId:c.id};
  c.hold_phase="released";c.status="cancelled";c.release_reason="cancelled_by_guest";
  return {status:"released",claimId:c.id,seats:c.party_size};
});

const promoteToPayment=(sessie,deelnemers)=>onderSlot(async()=>{
  verlopenOpruimen();
  const c=claims.find(x=>x.booking_session_hash===hash(sessie));
  if(!c)return {status:"no_hold"};
  if(c.hold_phase==="payment")return {status:"already_in_payment",paymentStartedAt:c.payment_started_at};
  if(c.hold_phase!=="filling")return {status:"hold_not_open",phase:c.hold_phase};
  if(new Date(c.hold_expires_at)<=now())return {status:"hold_expired"};
  c.hold_phase="payment";c.status="payment_pending";c.payment_started_at=now().toISOString();
  c.participants=deelnemers.map((d,i)=>({full_name:d,email:`t${i+1}@example.invalid`,status:"awaiting_payment"}));
  return {status:"in_payment",claimId:c.id,seats:c.party_size,paymentStartedAt:c.payment_started_at};
});

const betaal=(sessie,index)=>onderSlot(async()=>{
  const c=claims.find(x=>x.booking_session_hash===hash(sessie));
  c.participants[index].status="paid";
  return {status:"paid",participant:c.participants[index].full_name};
});

const levendeHolds=()=>{verlopenOpruimen();return claims
  .filter(c=>["filling","payment"].includes(c.hold_phase)||c.status==="paid")
  .map(c=>({phase:c.hold_phase===("payment")?HOLD_PHASES.payment:HOLD_PHASES.filling,
    holdStartedAt:c.hold_started_at,paymentStartedAt:c.payment_started_at,
    participants:c.participants,seats:c.party_size}));};

// ── De proef ────────────────────────────────────────────────────────────────
const kop=t=>console.log(`\n\x1b[1m${t}\x1b[0m\n${"─".repeat(t.length)}`);
const regel=(label,waarde)=>console.log(`  ${String(label).padEnd(46)}${waarde}`);
let fouten=0;
const eis=(omschrijving,voorwaarde,gezien="")=>{
  console.log(`  ${voorwaarde?"\x1b[32m✓\x1b[0m":"\x1b[31m✗\x1b[0m"} ${omschrijving}${gezien?`  → ${gezien}`:""}`);
  if(!voorwaarde)fouten++;
};
const publiek=()=>publicAvailability({capacity:WEEKEND.capacity,holds:levendeHolds()});
const beheer=()=>adminAvailability({capacity:WEEKEND.capacity,minimumPaidGuests:WEEKEND.minimumPaidGuests,holds:levendeHolds(),now:now()});

const run=async()=>{
console.log(`\x1b[1mLewos — blokkering in twee fasen, lokale proef\x1b[0m`);
console.log(`Weekend ${WEEKEND.slug} · ${WEEKEND.capacity} stoelen · klok start ${klok.nu.toISOString()}\n`);

kop("1. Alleen kijken blokkeert niets");
eis("zes stoelen vrij zonder dat er iets gebeurd is",publiek().remaining===6,`${publiek().remaining} vrij`);

kop("2. Twee sessies klikken tegelijk op boeken, samen meer dan er is");
const [a,b]=await Promise.all([beginSeatHold("sessie-A",4),beginSeatHold("sessie-B",4)]);
regel("sessie A vraagt 4",a.status);
regel("sessie B vraagt 4",b.status);
eis("precies één van de twee krijgt de stoelen",
  [a.status,b.status].filter(s=>s==="held").length===1,`${a.status} / ${b.status}`);
eis("de ander krijgt te horen dat het niet kan",[a.status,b.status].includes("not_available"));
eis("er zijn nooit meer stoelen uitgegeven dan er zijn",publiek().remaining>=0,`${publiek().remaining} vrij`);
const winnaar=a.status==="held"?"sessie-A":"sessie-B";
const verliezer=winnaar==="sessie-A"?"sessie-B":"sessie-A";

kop("3. Verversen en een open tabblad verlengen niets");
const eersteDeadline=(a.status==="held"?a:b).holdExpiresAt;
regel(vooruit(20),"");
const opnieuw=await beginSeatHold(winnaar,4);
eis("dezelfde sessie krijgt zijn bestaande blokkering terug",opnieuw.status==="resumed");
eis("met exact dezelfde deadline",opnieuw.holdExpiresAt===eersteDeadline,opnieuw.holdExpiresAt);
const stand=holdState({phase:HOLD_PHASES.filling,holdStartedAt:(a.status==="held"?a:b).holdExpiresAt,seats:4,now:now()});
regel("resterend volgens de afteller",`${holdState({phase:HOLD_PHASES.filling,holdStartedAt:new Date(new Date(eersteDeadline).getTime()-FILLING_WINDOW_MINUTES*60000),seats:4,now:now()}).minutesRemaining} min`);

kop("4. De verliezer probeert het opnieuw zolang de blokkering loopt");
eis("nog steeds niet beschikbaar",(await beginSeatHold(verliezer,4)).status==="not_available");
eis("publiek zijn er 2 stoelen vrij, niet 6",publiek().remaining===2,`${publiek().remaining} vrij`);

kop("5. Na zestig minuten vervalt de invulblokkering");
regel(vooruit(41),"");
eis("de stoelen zijn weer vrij",publiek().remaining===6,`${publiek().remaining} vrij`);
eis("en nu kan de ander wél",(await beginSeatHold(verliezer,4)).status==="held");

kop("6. Van invullen naar betalen — zonder een stoel los te laten");
const voor=publiek().remaining;
const promo=await promoteToPayment(verliezer,["TEST – Een","TEST – Twee","TEST – Drie","TEST – Vier"]);
regel("overgang",promo.status);
eis("de telling verandert niet door de overgang",publiek().remaining===voor,`${voor} → ${publiek().remaining}`);
eis("er wordt niets dubbel geteld",beheer().seatsHeld+beheer().seatsConfirmed===4,
  `${beheer().seatsHeld} vastgehouden + ${beheer().seatsConfirmed} bevestigd`);

kop("7. Eén betaalt. Vanaf dan geeft niets meer automatisch vrij");
await betaal(verliezer,0);
regel("beheer ziet",`${beheer().seatsConfirmed} bevestigd, ${beheer().seatsHeld} vastgehouden`);
eis("publiek blijft het één getal, zonder verdeling",Object.keys(publiek()).join()==="capacity,remaining");
regel(vooruit(121),"ruim na de laatste deadline");
eis("er is niets vrijgekomen",publiek().remaining===2,`${publiek().remaining} vrij`);
const s=holdState({phase:HOLD_PHASES.payment,paymentStartedAt:promo.paymentStartedAt,
  participants:claims.find(c=>c.booking_session_hash===hash(verliezer)).participants,seats:4,now:now()});
eis("de fase is 'Actie nodig'",s.paymentPhase==="action_required",s.label);
eis("vrijgeven vereist Robert",s.requiresRobertToRelease===true);
eis("afbreken door de gast wordt geweigerd",(await releaseSeatHold(verliezer)).status==="requires_operator");

kop("8. Het minimum van vier betaalde gasten is een eigen status");
regel("weekendstatus",`${beheer().weekendStatus} (nog ${beheer().belowMinimumBy} betaalde gasten nodig)`);
eis("het weekend gaat nog niet door",beheer().weekendStatus==="below_minimum");
eis("maar de betaalde gast is wél bevestigd",beheer().seatsConfirmed===1);
for(const i of [1,2,3])await betaal(verliezer,i);
regel("na drie betalingen erbij",`${beheer().weekendStatus} · ${beheer().seatsConfirmed} bevestigd`);
eis("nu gaat het weekend door",beheer().weekendStatus==="going_ahead");

kop("9. Expliciet afbreken in de invulfase geeft meteen terug");
claims=[];
await beginSeatHold("sessie-C",2);
eis("twee stoelen vastgehouden",publiek().remaining===4,`${publiek().remaining} vrij`);
eis("afbreken lukt",(await releaseSeatHold("sessie-C")).status==="released");
eis("en ze zijn meteen weer vrij",publiek().remaining===6,`${publiek().remaining} vrij`);

console.log(`\n${fouten?`\x1b[31m${fouten} controle(s) mislukt\x1b[0m`:"\x1b[32mAlle controles geslaagd\x1b[0m"}\n`);
process.exit(fouten?1:0);
};

run().catch(e=>{console.error(e);process.exit(1);});
