// Het verblijf aan de serverkant.
//
// Het rekenwerk zelf staat in `assets/stay.js` en wordt hier alleen doorgegeven: de
// browser en de server tellen zo gegarandeerd dezelfde nachten. Wat hier bij komt is de
// wantrouwige laag — wat er uit een formulier komt is een bewering, geen datum.
//
// Wat deze module **niet** doet is de datums toetsen aan het weekend. Dat kan hier niet
// eerlijk: welke dagen een weekend beslaat staat in de database, niet in een verzoek van
// de browser. Die toets staat daarom in de RPC, waar `starts_on` en `ends_on` staan. Hier
// wordt alleen de vorm gecontroleerd en wordt onzin tegengehouden voordat hij de database
// haalt.

export {STAY_STATUS,describeStay,confirmedStay,stayRequestText,staySentence,longDate,formatDay,parseDay,nightsBetween,stayWindow,previousMonday,nextFriday} from "../../assets/stay.js";
import {parseDay,formatDay,addDays,describeStay,stayRequestText,confirmedStay,STAY_STATUS,longDate} from "../../assets/stay.js";

// Een leeg veld is geen fout: dat betekent gewoon "alleen het weekend".
export const readStayRequest=(input={})=>{
  const ruwAankomst=String(input.requestedArrival??"").trim();
  const ruwVertrek=String(input.requestedDeparture??"").trim();
  if(!ruwAankomst&&!ruwVertrek)return {arrival:null,departure:null};

  const aankomst=ruwAankomst?parseDay(ruwAankomst):null;
  const vertrek=ruwVertrek?parseDay(ruwVertrek):null;
  if(ruwAankomst&&!aankomst)throw new Error("stay_arrival_invalid");
  if(ruwVertrek&&!vertrek)throw new Error("stay_departure_invalid");
  if(aankomst&&vertrek&&vertrek<=aankomst)throw new Error("stay_dates_reversed");

  return {arrival:aankomst?formatDay(aankomst):null,departure:vertrek?formatDay(vertrek):null};
};

// De regel die de accommodatie te lezen krijgt, opgebouwd uit de opgeslagen datums.
// Staat er niets opgeslagen, dan valt hij terug op de vrije tekst uit oudere boekingen —
// die bestaan al en mogen niet stilzwijgend verdwijnen uit een mail.
export const stayLines=({weekendStart,weekendEnd,requestedArrival,requestedDeparture,
  status,confirmedArrival,confirmedDeparture,legacyText=""}={})=>{
  const bevestigd=confirmedStay({weekendStart,weekendEnd,status,confirmedArrival,confirmedDeparture});
  const aangevraagd=describeStay({weekendStart,weekendEnd,arrival:requestedArrival,departure:requestedDeparture});

  const verblijf=bevestigd.valid
    ?`${longDate(bevestigd.arrival)} to ${longDate(bevestigd.departure)}`
    :"";

  let aanvraag=aangevraagd.valid?stayRequestText(aangevraagd):"";
  if(!aanvraag&&legacyText)aanvraag=`Requested (as written by the guest): ${legacyText}`;

  return {
    // Wat vaststaat. Hier hangt de agenda-afspraak aan.
    confirmedStay:verblijf,
    confirmedArrival:bevestigd.valid?bevestigd.arrival:"",
    confirmedDeparture:bevestigd.valid?bevestigd.departure:"",
    confirmedIncludesExtraNights:Boolean(bevestigd.includesExtraNights),
    // Wat gevraagd is. Nooit als verblijf gepresenteerd.
    extraNightsRequest:aanvraag,
    extraNightsStatus:status||(aangevraagd.valid&&aangevraagd.extraNights?STAY_STATUS.requested:STAY_STATUS.none),
    extraNightsCount:aangevraagd.valid?aangevraagd.extraNights:0
  };
};

export const STAY_ERRORS={
  stay_arrival_invalid:"The arrival date is not a date we can read.",
  stay_departure_invalid:"The departure date is not a date we can read.",
  stay_dates_reversed:"The departure date has to come after the arrival date.",
  stay_arrival_after_weekend:"Your arrival cannot be later than the first day of the weekend.",
  stay_departure_before_weekend:"Your departure cannot be earlier than the last day of the weekend.",
  // Het venster uit /tavern/: van de maandag ervóór tot de vrijdag erna, en nooit een nacht
  // die van een ander Tavern-weekend is.
  stay_arrival_too_early:"You can arrive from the Monday before your Tavern weekend. For an earlier arrival, please write to us.",
  stay_departure_too_late:"You can stay until the Friday morning after your Tavern weekend. For a longer stay, please write to us.",
  stay_nights_taken:"The house is already booked for one or more of those nights. Please choose other nights, or write to us."
};

// ── Is het huis die nachten nog vrij? ───────────────────────────────────────
//
// De kalender in de browser kleurt bezette nachten grijs, maar dat is opmaak. Dit is de
// grens. Een verzoek dat de pagina omzeilt komt hier alsnog tegen.
//
// **Onbekend is niet vrij.** Kan de agenda niet gelezen worden, dan geeft dit `known:false`
// terug en gaat de aanvraag door als aanvraag — precies zoals vóór de koppeling, met
// Nadine die bevestigt. Wat het nooit doet, is een nacht vrij verklaren die bezet is.
// De volledige reeks nachten van een verblijf, ook als de gast maar één kant heeft
// aangeklikt. Zonder de weekenddatums is die reeks niet te bepalen — een aankomst op
// woensdag zegt niets over hoeveel nachten dat zijn. Vandaar dat deze controle draait
// nádat de database de aanvraag heeft teruggegeven, mét `weekendStart` en `weekendEnd`.
export const houseNightsFree=async({arrival,departure,weekendStart,weekendEnd})=>{
  const van=arrival||weekendStart,tot=departure||weekendEnd;
  if(!van||!tot)return {known:false,conflicts:[]};
  let config;
  try{
    const {calendarConfig}=await import("./_calendar.mjs");
    config=calendarConfig();
  }catch(error){console.error("Calendar configuration error",error);return {known:false,conflicts:[]};}
  if(!config)return {known:false,conflicts:[]};

  try{
    const {listEvents,busyNights}=await import("./_calendar.mjs");
    const bezet=busyNights(await listEvents(config,{from:van,to:tot}));
    const conflicts=[];
    // Alleen de nachten die je écht slaapt: de vertrekdag telt niet mee.
    for(let d=parseDay(van);formatDay(d)<tot;d=addDays(d,1)){
      const nacht=formatDay(d);
      if(bezet.has(nacht))conflicts.push(nacht);
    }
    return {known:true,conflicts};
  }catch(error){
    console.error("Calendar availability error",error);
    return {known:false,conflicts:[]};
  }
};
