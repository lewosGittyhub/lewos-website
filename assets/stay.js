// Het verblijf van een gast, als rekenwerk. Geen DOM, geen netwerk, geen database.
//
// Dit bestand is met opzet de énige plek waar nachten geteld worden. De kalender in de
// browser en de Netlify-functies importeren allebei hiervandaan, want een gast die drie
// extra nachten aanklikt en een mail waarin twee nachten staan is erger dan geen kalender.
//
// De kern is één onderscheid, en dat loopt door alles heen:
//
//   **Het weekend en vrije extra nachten worden samen geboekt.**
//
// Wij hebben geen beschikbaarheidsagenda van de accommodatie. Een aangeklikte nacht is
// De site controleert de gedeelde accommodatieagenda voordat de boeking wordt afgerond.
// Zijn de extra nachten vrij, dan worden ze meteen bevestigd en in de agenda opgenomen.
// Ze blijven wel een aparte accommodatiebetaling die de gast bij aankomst voldoet; ze
// worden niet aan de Tavern-prijs of online Stripe-betaling toegevoegd.

export const STAY_STATUS={
  none:"none",           // alleen het weekend, niets aangevraagd
  requested:"requested", // oudere/open aanvraag die nog door de accommodatie moet worden beslist
  confirmed:"confirmed", // accommodatie heeft ze bevestigd
  declined:"declined"    // accommodatie kan ze niet leveren
};

const DAY=86400000;
const ISO=/^(\d{4})-(\d{2})-(\d{2})$/;

// Alles gaat door UTC-middag. Een datum is hier een dag, geen tijdstip: rekenen in
// lokale tijd laat een zomertijdsprong een nacht opeten of verzinnen.
export const parseDay=value=>{
  if(value instanceof Date)return Number.isNaN(value.getTime())?null:new Date(Date.UTC(value.getUTCFullYear(),value.getUTCMonth(),value.getUTCDate(),12));
  const parts=ISO.exec(String(value??"").trim());
  if(!parts)return null;
  const jaar=Number(parts[1]),maand=Number(parts[2]),dag=Number(parts[3]);
  if(maand<1||maand>12||dag<1||dag>31)return null;
  const datum=new Date(Date.UTC(jaar,maand-1,dag,12));
  // 31 februari bestaat niet en mag hier niet stilzwijgend 3 maart worden.
  if(datum.getUTCMonth()!==maand-1||datum.getUTCDate()!==dag)return null;
  return datum;
};

export const formatDay=date=>{
  const d=parseDay(date);
  if(!d)return "";
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`;
};

export const addDays=(date,aantal)=>{
  const d=parseDay(date);
  return d?new Date(d.getTime()+aantal*DAY):null;
};

export const nightsBetween=(van,tot)=>{
  const a=parseDay(van),b=parseDay(tot);
  if(!a||!b)return null;
  return Math.round((b.getTime()-a.getTime())/DAY);
};

// Vrijdag → maandag is drie nachten, en dat is precies wat er verkocht wordt. De aankomst
// telt mee, de vertrekdag niet.
export const describeStay=({weekendStart,weekendEnd,arrival,departure}={})=>{
  const start=parseDay(weekendStart),eind=parseDay(weekendEnd);
  if(!start||!eind)return {valid:false,error:"weekend_dates_missing"};
  if(eind<=start)return {valid:false,error:"weekend_dates_reversed"};

  // Niets aangeklikt is hetzelfde als het weekend zelf. Dat is de veilige terugval:
  // een leeg veld mag nooit per ongeluk een extra nacht worden.
  const aankomst=parseDay(arrival)||start;
  const vertrek=parseDay(departure)||eind;

  if(aankomst>start)return {valid:false,error:"arrival_after_weekend_start"};
  if(vertrek<eind)return {valid:false,error:"departure_before_weekend_end"};

  const voor=nightsBetween(aankomst,start);
  const na=nightsBetween(eind,vertrek);
  const weekendNachten=nightsBetween(start,eind);

  return {
    valid:true,
    arrival:formatDay(aankomst),
    departure:formatDay(vertrek),
    weekendStart:formatDay(start),
    weekendEnd:formatDay(eind),
    weekendNights:weekendNachten,
    nightsBefore:voor,
    nightsAfter:na,
    extraNights:voor+na,
    totalNights:weekendNachten+voor+na,
    status:voor+na>0?STAY_STATUS.requested:STAY_STATUS.none
  };
};

// Het bevestigde verblijf. Zolang de accommodatie niets heeft laten weten is dat het
// weekend en niets meer — ook al staan er extra nachten aangevraagd. Hier hangt de
// agenda-afspraak aan, dus deze functie mag nooit een aanvraag doorlaten als verblijf.
export const confirmedStay=({weekendStart,weekendEnd,status,confirmedArrival,confirmedDeparture}={})=>{
  const start=parseDay(weekendStart),eind=parseDay(weekendEnd);
  if(!start||!eind)return {valid:false,error:"weekend_dates_missing"};
  if(status!==STAY_STATUS.confirmed)
    return {valid:true,arrival:formatDay(start),departure:formatDay(eind),
      extraNights:0,nightsBefore:0,nightsAfter:0,includesExtraNights:false};
  // Bevestigd mag minder zijn dan aangevraagd: de accommodatie kan één van de twee
  // nachten wél hebben. Daarom worden de bevestigde datums apart bewaard.
  const aankomst=parseDay(confirmedArrival)||start;
  const vertrek=parseDay(confirmedDeparture)||eind;
  const voor=Math.max(0,nightsBetween(aankomst,start));
  const na=Math.max(0,nightsBetween(eind,vertrek));
  return {valid:true,arrival:formatDay(aankomst),departure:formatDay(vertrek),
    extraNights:voor+na,nightsBefore:voor,nightsAfter:na,includesExtraNights:voor+na>0};
};

// ── Het venster waarin je mag kiezen ────────────────────────────────────────
//
// Van /tavern/: *"you can extend your stay from the Monday before your Tavern weekend, or
// remain until Friday morning after it."* Die zin is de regel; dit is de rekensom erbij.
//
// **De wissel valt op één dag.** Je vertrekt om 09:30 en de volgende gasten komen om 16:00.
// De vrijdag waarop het volgende Tavern-weekend begint mag dus gewoon je vertrekdag zijn:
// jouw laatste nacht is de donderdag, hun eerste nacht is die vrijdag. Andersom net zo — de
// dag waarop het vorige weekend vertrekt mag jouw aankomstdag zijn.
//
// Het gaat om nachten, niet om dagen. Een vertrekdatum is de ochtend waarop je weggaat en
// telt zelf niet als nacht; daarom botsen die twee niet.

export const previousMonday=waarde=>{
  const d=parseDay(waarde);
  if(!d)return null;
  const isodow=d.getUTCDay()===0?7:d.getUTCDay();
  return addDays(d,-(((isodow-1+6)%7)+1));
};

export const nextFriday=waarde=>{
  const d=parseDay(waarde);
  if(!d)return null;
  const isodow=d.getUTCDay()===0?7:d.getUTCDay();
  return addDays(d,((5-isodow+6)%7)+1);
};

// `weekends` zijn de andere Tavern-weekenden, elk met `startsOn` en `endsOn`. Het venster
// loopt nooit voorbij het begin van het volgende weekend of vóór het einde van het vorige
// — maar tot en met die dag wél, want dat is de wisseldag.
export const stayWindow=({weekendStart,weekendEnd,weekends=[],notBefore=null}={})=>{
  const start=parseDay(weekendStart),eind=parseDay(weekendEnd);
  if(!start||!eind)return null;
  let van=previousMonday(start),tot=nextFriday(eind);

  for(const ander of weekends){
    const aStart=parseDay(ander?.startsOn),aEind=parseDay(ander?.endsOn);
    if(!aStart||!aEind)continue;
    if(formatDay(aStart)===formatDay(start)&&formatDay(aEind)===formatDay(eind))continue;
    if(aEind<=start&&aEind>van)van=aEind;
    if(aStart>=eind&&aStart<tot)tot=aStart;
  }

  const ondergrens=parseDay(notBefore);
  if(ondergrens&&ondergrens>van)van=ondergrens;
  if(van>start)van=start;   // je kunt altijd op de weekenddag zelf aankomen
  if(tot<eind)tot=eind;
  return {from:formatDay(van),to:formatDay(tot)};
};

const LANG="en-GB";
export const longDate=(waarde,locale=LANG)=>{
  const d=parseDay(waarde);
  return d?d.toLocaleDateString(locale,{weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:"UTC"}):"";
};
export const shortDate=(waarde,locale=LANG)=>{
  const d=parseDay(waarde);
  return d?d.toLocaleDateString(locale,{weekday:"short",day:"numeric",month:"short",timeZone:"UTC"}):"";
};

const nachten=n=>`${n} night${n===1?"":"s"}`;

// De zin die de gast onder de kalender leest. Extra nachten zijn onderdeel van de
// boekingskeuze, maar hun accommodatiebetaling staat los van de Tavern-prijs.
export const staySentence=stay=>{
  if(!stay?.valid)return "";
  const kern=`Arrival ${longDate(stay.arrival)} · Departure ${longDate(stay.departure)}`;
  if(!stay.extraNights)return `${kern} — ${nachten(stay.weekendNights)}, all included in the weekend.`;
  const delen=[];
  if(stay.nightsBefore)delen.push(`${nachten(stay.nightsBefore)} before`);
  if(stay.nightsAfter)delen.push(`${nachten(stay.nightsAfter)} after`);
  return `${kern} — ${nachten(stay.weekendNights)} included in the weekend, plus ${delen.join(" and ")} booked with your stay. Extra nights are paid separately upon arrival.`;
};

// De tekst die in `extra_nights` terechtkomt en die de accommodatie te lezen krijgt.
// **Afgeleid, nooit ingetypt**: de datums zijn de bron, deze regel is de weergave.
export const stayRequestText=stay=>{
  if(!stay?.valid||!stay.extraNights)return "";
  const delen=[];
  if(stay.nightsBefore)delen.push(`${nachten(stay.nightsBefore)} before the weekend`);
  if(stay.nightsAfter)delen.push(`${nachten(stay.nightsAfter)} after the weekend`);
  return `Requested: ${delen.join(" and ")}. `
    +`Arrival ${longDate(stay.arrival)}, departure ${longDate(stay.departure)}. `
    +`Not confirmed — subject to accommodation availability.`;
};
