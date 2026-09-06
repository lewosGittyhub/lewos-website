// De betaaltermijn van een groepsboeking, als één berekening.
//
// Vastgelegd door Robert op 5 september 2026. Alle termijnen lopen vanaf het moment dat de
// reservering is aangemaakt — **nooit vanaf het versturen van een mail**. Dat is geen
// detail: het is precies waarom opnieuw versturen de deadline niet verschuift. Er is geen
// veld "laatst herinnerd" dat de klok kan verzetten, want die bestaat hier niet.
//
//   0 → 30 min    iedereen betaalt binnen dertig minuten
//   30 min        niemand betaald  → de reservering vervalt (na controle bij Stripe)
//                 ≥ 1 betaald      → de onbetaalden krijgen eenmalig 60 minuten extra
//   90 min        nog onbetaald    → laatste 30 minuten, plus een melding aan Robert en
//                                    Nadine zodat zij contact kunnen opnemen
//   120 min       nog onbetaald    → "Actie nodig". Geen automatische verlenging meer,
//                                    geen automatische vrijgave, geen terugbetaling.
//
// Twee regels die alles eromheen bepalen:
//
//   1. **Bevestiging geldt per deelnemer.** Twee betaald is twee bevestigde plaatsen. Een
//      onbetaalde deelnemer blokkeert de bevestiging van de anderen niet.
//   2. **Bij gedeeltelijke betaling komt er nooit iets automatisch vrij**, ook niet na de
//      laatste deadline. De stoelen blijven geblokkeerd tot Robert ze vrijgeeft.
//
// Deze module rekent alleen. Hij verstuurt niets, wijzigt niets en geeft niets vrij — hij
// zegt in welke fase een groep zit. Wie daarop handelt, doet dat elders en bewust.

export const GROUP_WINDOW_MINUTES=30;
export const FIRST_EXTENSION_MINUTES=60;
export const FINAL_EXTENSION_MINUTES=30;
export const MAX_AUTOMATIC_MINUTES=GROUP_WINDOW_MINUTES+FIRST_EXTENSION_MINUTES+FINAL_EXTENSION_MINUTES; // 120

export const PHASES={
  complete:"complete",                 // iedereen die iets verschuldigd was, heeft betaald
  open:"open",                         // binnen de eerste dertig minuten
  lapsed:"lapsed",                     // dertig minuten om, niemand betaald
  extended:"extended",                 // gedeeltelijk betaald, eenmalige verlenging loopt
  final_extension:"final_extension",   // laatste dertig minuten, operators zijn gewaarschuwd
  action_required:"action_required"    // twee uur om; Robert beslist
};

// Labels voor de beheeromgeving. Engels, zoals de rest van de interface.
export const PHASE_LABELS={
  complete:"Fully confirmed",
  open:"Awaiting payment",
  lapsed:"Lapsed — no payment received",
  extended:"Partly paid — extension running",
  final_extension:"Partly paid — final extension",
  action_required:"Action needed"
};

const minuten=(vanaf,aantal)=>new Date(vanaf.getTime()+aantal*60000);

export const groupPaymentState=({createdAt,participants=[],now=new Date(Date.now())})=>{
  const begin=createdAt instanceof Date?createdAt:new Date(createdAt);
  if(Number.isNaN(begin.getTime()))throw new Error("group_payment_created_at_invalid");
  const nu=now instanceof Date?now:new Date(now);

  const verschuldigd=participants.filter(p=>p.status!=="cancelled");
  const betaald=verschuldigd.filter(p=>p.status==="paid");
  const onbetaald=verschuldigd.filter(p=>p.status!=="paid");

  const eerste=minuten(begin,GROUP_WINDOW_MINUTES);
  const tweede=minuten(begin,GROUP_WINDOW_MINUTES+FIRST_EXTENSION_MINUTES);
  const laatste=minuten(begin,MAX_AUTOMATIC_MINUTES);

  const basis={
    participantsTotal:participants.length,
    participantsDue:verschuldigd.length,
    // "Bevestigd" is hier hetzelfde als betaald, en dat is met opzet: er is geen tweede
    // administratie die kan afwijken van wie er daadwerkelijk geld heeft overgemaakt.
    confirmed:betaald.length,
    awaiting:onbetaald.length,
    unpaidParticipants:onbetaald.map(p=>({name:p.full_name??p.name,email:p.email})),
    firstDeadline:eerste.toISOString(),
    extendedDeadline:tweede.toISOString(),
    finalDeadline:laatste.toISOString(),
    notifyOperators:false,
    releaseSeats:false,
    requiresPaymentCheckBeforeRelease:false
  };

  if(!verschuldigd.length)
    return {...basis,phase:PHASES.open,deadline:eerste.toISOString(),minutesRemaining:Math.max(0,Math.ceil((eerste-nu)/60000))};

  if(!onbetaald.length)
    return {...basis,phase:PHASES.complete,deadline:null,minutesRemaining:null};

  if(nu<eerste)
    return {...basis,phase:PHASES.open,deadline:eerste.toISOString(),minutesRemaining:Math.ceil((eerste-nu)/60000)};

  // Dertig minuten om en er is nog niets binnen. De reservering vervalt — maar niet
  // blindelings: een betaalmelding van Stripe kan onderweg zijn, en een plaats die
  // betaald is mag nooit vervallen omdat onze klok sneller was dan hun webhook.
  if(!betaald.length)
    return {...basis,phase:PHASES.lapsed,deadline:eerste.toISOString(),minutesRemaining:0,
      releaseSeats:true,requiresPaymentCheckBeforeRelease:true};

  if(nu<tweede)
    return {...basis,phase:PHASES.extended,deadline:tweede.toISOString(),minutesRemaining:Math.ceil((tweede-nu)/60000)};

  if(nu<laatste)
    return {...basis,phase:PHASES.final_extension,deadline:laatste.toISOString(),
      minutesRemaining:Math.ceil((laatste-nu)/60000),notifyOperators:true};

  // Twee uur om. Geen verlenging meer, en niets komt vrij: dat is een beslissing van
  // Robert, niet van een timer.
  return {...basis,phase:PHASES.action_required,deadline:laatste.toISOString(),minutesRemaining:0};
};

// Wat er in de beheeromgeving komt te staan, in één zin. "3 confirmed, 1 awaiting payment"
// — de voortgang van de groep, zonder te suggereren dat de betaalde plaatsen ergens op
// wachten.
export const groupProgressLabel=stand=>{
  if(!stand.participantsDue)return "No payment due";
  if(stand.awaiting===0)return `${stand.confirmed} confirmed`;
  return `${stand.confirmed} confirmed, ${stand.awaiting} awaiting payment`;
};
