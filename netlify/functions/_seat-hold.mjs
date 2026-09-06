// Een stoel is op drie manieren bezet, en dat zijn drie verschillende dingen.
//
//   1. **Invulfase** — iemand heeft bewust op boeken geklikt en vult zijn gegevens in.
//      Zestig minuten, vanaf dát moment. Alleen een weekend bekíjken blokkeert niets.
//   2. **Betaalfase** — de boeking is ingediend en er wordt betaald. Dertig minuten, met
//      de verlengingen uit `_group-payment.mjs`.
//   3. **Betaald** — bevestigd, en die plaats gaat nergens meer heen.
//
// De overgang van 1 naar 2 laat geen stoel los en telt er geen dubbel: het is dezelfde
// blokkering die van fase wisselt. Daarom staat de hele levensloop hier bij elkaar en niet
// verspreid over twee functies die elk hun eigen telling maken.
//
// **Verversen verlengt niets.** Elke deadline hangt aan een tijdstip dat één keer is
// gezet: `holdStartedAt` voor de invulfase, `paymentStartedAt` voor de betaalfase. Er is
// geen "laatst gezien" en geen "laatste activiteit" — die velden bestaan hier niet, dus er
// is ook geen manier om er tijd bij te krijgen. Een open tabblad is geen aanspraak.
//
// Voor de openbare kant geldt één regel, en die staat in `publicAvailability()`: een
// vastgehouden stoel is niet beschikbaar, en verder komt er niets naar buiten. Geen
// verdeling tussen betaald en vastgehouden, geen deadlines, geen namen.

import {groupPaymentState,PHASE_LABELS as PAYMENT_LABELS} from "./_group-payment.mjs";

export const FILLING_WINDOW_MINUTES=60;

export const HOLD_PHASES={
  filling:"filling",     // gegevens invullen, zestig minuten
  payment:"payment",     // betalen, dertig minuten plus verlengingen
  confirmed:"confirmed", // alles betaald
  released:"released"    // vervallen of vrijgegeven
};

export const HOLD_LABELS={
  filling:"Filling in details",
  payment:"Awaiting payment",
  confirmed:"Fully confirmed",
  released:"Released"
};

const minuten=(vanaf,aantal)=>new Date(vanaf.getTime()+aantal*60000);
const alsDatum=(waarde,naam)=>{
  const d=waarde instanceof Date?waarde:new Date(waarde);
  if(Number.isNaN(d.getTime()))throw new Error(`seat_hold_${naam}_invalid`);
  return d;
};

// De stand van één blokkering. Rekent alleen; geeft niets vrij en verstuurt niets.
export const holdState=({phase,holdStartedAt,paymentStartedAt,participants=[],seats=0,now=new Date(Date.now())})=>{
  const nu=now instanceof Date?now:new Date(now);

  if(phase===HOLD_PHASES.released)
    return {phase:HOLD_PHASES.released,label:HOLD_LABELS.released,seatsHeld:0,seatsConfirmed:0,
      deadline:null,minutesRemaining:null,expired:true,releaseSeats:false,requiresPaymentCheckBeforeRelease:false};

  if(phase===HOLD_PHASES.filling){
    const begin=alsDatum(holdStartedAt,"hold_started_at");
    const deadline=minuten(begin,FILLING_WINDOW_MINUTES);
    const verlopen=nu>=deadline;
    return {
      phase:HOLD_PHASES.filling,label:HOLD_LABELS.filling,
      seatsHeld:seats,seatsConfirmed:0,
      deadline:deadline.toISOString(),
      minutesRemaining:Math.max(0,Math.ceil((deadline-nu)/60000)),
      secondsRemaining:Math.max(0,Math.ceil((deadline-nu)/1000)),
      expired:verlopen,
      // Niemand heeft betaald in deze fase, dus vrijgeven is veilig en hoeft niet langs
      // Robert. Wél altijd de beschikbaarheid opnieuw vaststellen voordat er iets verder
      // gaat — daar dient `requiresAvailabilityRecheck` voor.
      releaseSeats:verlopen,requiresAvailabilityRecheck:verlopen,requiresPaymentCheckBeforeRelease:false};
  }

  if(phase===HOLD_PHASES.payment){
    const betaling=groupPaymentState({createdAt:alsDatum(paymentStartedAt,"payment_started_at"),participants,now:nu});
    const betaald=betaling.confirmed;
    return {
      phase:betaling.phase==="complete"?HOLD_PHASES.confirmed:HOLD_PHASES.payment,
      label:PAYMENT_LABELS[betaling.phase]||HOLD_LABELS.payment,
      paymentPhase:betaling.phase,
      // De verdeling. Alleen voor de beheeromgeving; `publicAvailability()` telt ze samen.
      seatsConfirmed:betaald,
      seatsHeld:Math.max(0,(seats||betaling.participantsDue)-betaald),
      deadline:betaling.deadline,minutesRemaining:betaling.minutesRemaining,
      expired:betaling.phase==="lapsed",
      // Zodra er één betaald heeft, komt er niets meer automatisch vrij. Dat blijft een
      // beslissing van Robert, ook na de laatste deadline.
      releaseSeats:betaling.releaseSeats,
      requiresPaymentCheckBeforeRelease:betaling.requiresPaymentCheckBeforeRelease,
      requiresRobertToRelease:betaald>0,
      notifyOperators:betaling.notifyOperators,
      unpaidParticipants:betaling.unpaidParticipants,
      progress:betaling};
  }
  throw new Error("seat_hold_phase_unknown");
};

// Wat een bezoeker mag zien. Eén getal, en verder niets: geen verdeling tussen betaald en
// vastgehouden, geen deadlines, geen gegevens van anderen. Een vastgehouden stoel is
// gewoon niet beschikbaar — dat is de enige waarheid die naar buiten hoort.
export const publicAvailability=({capacity,holds=[]})=>{
  const bezet=holds.reduce((n,h)=>n+Number(h.seats||0),0);
  return {capacity:Number(capacity)||0,remaining:Math.max(0,(Number(capacity)||0)-bezet)};
};

// Wat Robert en Nadine mogen zien: dezelfde stoelen, maar uitgesplitst.
export const adminAvailability=({capacity,minimumPaidGuests=4,holds=[],now=new Date(Date.now())})=>{
  let vastgehouden=0,bevestigd=0;
  for(const h of holds){
    const stand=holdState({...h,now});
    vastgehouden+=stand.seatsHeld;
    bevestigd+=stand.seatsConfirmed;
  }
  const totaal=Number(capacity)||0;
  return {
    capacity:totaal,
    seatsConfirmed:bevestigd,
    seatsHeld:vastgehouden,
    remaining:Math.max(0,totaal-vastgehouden-bevestigd),
    minimumPaidGuests,
    // Bewust een eigen status, los van de bevestiging per deelnemer: een gast kan
    // bevestigd zijn terwijl het weekend nog niet doorgaat, en andersom verandert er aan
    // een betaalde plaats niets als het minimum alsnog gehaald wordt.
    weekendStatus:bevestigd>=minimumPaidGuests?"going_ahead":"below_minimum",
    belowMinimumBy:Math.max(0,minimumPaidGuests-bevestigd)
  };
};
