// De gedeelde Lewos-agenda. Eén bevestigde boeking wordt één afspraak.
//
// Waarom een serviceaccount en geen OAuth: een serviceaccount heeft geen mens nodig die
// elke keer opnieuw toestemming geeft, en zijn sleutel verloopt niet na zeven dagen zoals
// een refresh token van een niet-geverifieerde app. Robert deelt de agenda `Lewos` met het
// e-mailadres van het serviceaccount, precies zoals hij hem met Nadine deelt. Meer rechten
// dan dat krijgt het account niet: het kan niet bij zijn mail, niet bij zijn andere
// agenda's, en het kan geen agenda's aanmaken of verwijderen.
//
// Waarom hier geen enkele dependency staat: deze repo heeft geen `package.json` en geen
// bouwstap, en dat blijft zo. Een JWT ondertekenen is met `node:crypto` twintig regels, en
// de Calendar API is gewoon HTTPS. `googleapis` zou honderden pakketten meebrengen voor
// één POST.
//
// **Scope: alleen `calendar.events`.** Daarmee kan dit account afspraken lezen en schrijven
// op de agenda's die met hem gedeeld zijn, en verder niets. Bewust niet `calendar`, want
// dat mag ook agenda's aanmaken en verwijderen.

import {createHash,createSign} from "node:crypto";
import {parseDay,formatDay,addDays} from "../../assets/stay.js";
import {environmentIsSafe,deployContext} from "./_deploy-context.mjs";

const TOKEN_URL="https://oauth2.googleapis.com/token";
const API="https://www.googleapis.com/calendar/v3";
const SCOPE="https://www.googleapis.com/auth/calendar.events";

export const TAVERN_TIMEZONE="Europe/Madrid";

// De tijden die op de site staan: aankomst vanaf 16:00, vertrek na het ontbijt dat tot
// 09:30 loopt (zie `travel-information/index.html`). Ze staan hier als constante en niet
// als los getal in de code, zodat er maar één plek is die ze bepaalt.
export const ARRIVAL_TIME="16:00";
export const DEPARTURE_TIME="09:30";

const base64url=value=>Buffer.from(value).toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");

// De sleutel komt uit een omgevingsvariabele en staat nooit in de repo. Netlify bewaart
// meerregelige waarden prima, maar wie hem via een shell zet houdt vaak `\n` als twee
// tekens over; daarom worden die hier teruggezet naar echte regeleindes.
export const calendarConfig=()=>{
  // Dezelfde reden als bij de mail: een preview met het productie-agenda-id zou echte
  // afspraken in de gedeelde agenda zetten. Geen configuratie betekent hier: geen agenda,
  // en de site meldt dan `configured:false` — onbekend is niet vrij.
  if(!environmentIsSafe()){
    console.warn(`Calendar skipped: deploy context "${deployContext()}" is not marked preview-safe`);
    return null;
  }
  const clientEmail=String(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL||"").trim();
  const privateKey=String(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY||"").replace(/\\n/g,"\n").trim();
  const calendarId=String(process.env.LEWOS_CALENDAR_ID||"").trim();
  if(!clientEmail||!privateKey||!calendarId)return null;
  if(!privateKey.includes("BEGIN"))throw new Error("calendar_private_key_malformed");
  return {clientEmail,privateKey,calendarId,
    timeZone:String(process.env.TAVERN_TIMEZONE||TAVERN_TIMEZONE),
    accommodationEmails:accommodationAddresses()};
};

const accessToken=async({clientEmail,privateKey})=>{
  const nu=Math.floor(Date.now()/1000);
  const header=base64url(JSON.stringify({alg:"RS256",typ:"JWT"}));
  const claims=base64url(JSON.stringify({iss:clientEmail,scope:SCOPE,aud:TOKEN_URL,iat:nu,exp:nu+3600}));
  const signature=createSign("RSA-SHA256").update(`${header}.${claims}`).end()
    .sign(privateKey).toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
  const response=await fetch(TOKEN_URL,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:`${header}.${claims}.${signature}`})});
  if(!response.ok)throw new Error(`calendar_token:${response.status}:${await response.text()}`);
  const {access_token}=await response.json();
  if(!access_token)throw new Error("calendar_token_missing");
  return access_token;
};

const call=async(token,pad,options={})=>{
  const response=await fetch(`${API}${pad}`,{...options,headers:{authorization:`Bearer ${token}`,"content-type":"application/json",...options.headers}});
  const tekst=await response.text();
  let body={};
  try{body=tekst?JSON.parse(tekst):{};}catch{}
  return {ok:response.ok,status:response.status,body};
};

// Eén afspraak per boeking, ook als de webhook of het testscript opnieuw draait. Google
// accepteert een zelfgekozen id, en dat id is hier afgeleid van het boekingskenmerk: een
// tweede poging levert dan een 409 op in plaats van een tweede afspraak in de agenda.
// Het id moet base32hex zijn (0-9 en a-v); een sha256 in hex valt daar volledig binnen.
export const eventIdFor=claimId=>createHash("sha256").update(`lewos-tavern-booking|${claimId}`).digest("hex");

// Controleer wáár we schrijven vóórdat we schrijven. `events.list` met `maxResults=1` is de
// goedkoopste aanroep die binnen de `calendar.events`-scope past en die de naam, de
// tijdzone en de toegangsrol van de agenda teruggeeft. Zonder deze stap zou een verkeerd
// geplakt agenda-id pas zichtbaar worden als de afspraak al ergens anders stond.
export const describeCalendar=async config=>{
  const token=await accessToken(config);
  const {ok,status,body}=await call(token,`/calendars/${encodeURIComponent(config.calendarId)}/events?maxResults=1`);
  if(!ok)throw new Error(`calendar_access:${status}:${JSON.stringify(body).slice(0,300)}`);
  return {calendarId:config.calendarId,summary:body.summary,timeZone:body.timeZone,accessRole:body.accessRole};
};

export const readEvent=async(config,eventId)=>{
  const token=await accessToken(config);
  const {ok,status,body}=await call(token,`/calendars/${encodeURIComponent(config.calendarId)}/events/${eventId}`);
  if(!ok)return {found:false,status};
  return {found:true,event:body};
};

// De afspraak zelf. Geen gasten: Nadine ziet hem via de gedeelde agenda, en haar als
// deelnemer toevoegen zou haar een uitnodigingsmail sturen die niemand heeft gevraagd.
// Om dezelfde reden staat `sendUpdates=none` in de aanroep.
export const upsertBookingEvent=async(config,{claimId,summary,description,startDateTime,endDateTime,location})=>{
  const token=await accessToken(config);
  const eventId=eventIdFor(claimId);
  const event={
    id:eventId,summary,description,
    start:{dateTime:startDateTime,timeZone:config.timeZone},
    end:{dateTime:endDateTime,timeZone:config.timeZone},
    ...(location?{location}:{}),
    transparency:"opaque",
    extendedProperties:{private:{lewosClaimId:String(claimId),lewosSource:"tavern-booking"}}
  };
  const aangemaakt=await call(token,`/calendars/${encodeURIComponent(config.calendarId)}/events?sendUpdates=none`,{method:"POST",body:JSON.stringify(event)});
  if(aangemaakt.ok)return {status:"created",event:aangemaakt.body};
  // 409: dit boekingskenmerk heeft al een afspraak. Bijwerken in plaats van verdubbelen —
  // dan corrigeert een tweede run wél een gewijzigde datum, maar maakt hij niets nieuws.
  if(aangemaakt.status===409){
    const bijgewerkt=await call(token,`/calendars/${encodeURIComponent(config.calendarId)}/events/${eventId}?sendUpdates=none`,{method:"PUT",body:JSON.stringify(event)});
    if(!bijgewerkt.ok)throw new Error(`calendar_update:${bijgewerkt.status}:${JSON.stringify(bijgewerkt.body).slice(0,300)}`);
    return {status:"updated",event:bijgewerkt.body};
  }
  throw new Error(`calendar_insert:${aangemaakt.status}:${JSON.stringify(aangemaakt.body).slice(0,300)}`);
};

// Van een bevestigde boeking naar de velden van één afspraak. De webhook en het lokale
// testscript lopen allebei hierlangs, zodat een test niet per ongeluk een ándere afspraak
// oplevert dan de echte flow zou maken.
//
// `arrivalDate` en `departureDate` zijn kale datums (`2026-11-05`) uit `starts_on` en
// `ends_on` van het weekend. Er wordt hier niets uitgerekend: zonder die twee is er geen
// afspraak, want een datum gokken is precies wat niet mag.
// Wat hier bewust NIET in kan: `dietaryNotes` (allergieën en dieetwensen, sinds
// 5 september 2026 één veld), de twee oude velden `allergies` en `dietary`, en het vrije
// tekstveld van de gast.
// Een agenda is een ander soort plek dan een postvak — hij staat open op een telefoon die op
// tafel ligt, en hij is gedeeld. Gezondheidsgegevens horen daar niet in rond te slingeren;
// die gaan naar Lewos per mail en verder nergens heen. De functie neemt die velden daarom
// niet eens aan, zodat een latere aanroep ze er niet per ongeluk in kan schuiven.
export const bookingEvent=({claimId,name,seats,weekendLabel,arrivalDate,departureDate,extraNights,summary,titlePrefix="",descriptionPrefix=""})=>{
  if(!arrivalDate||!departureDate)throw new Error("calendar_dates_missing");
  const gasten=`${seats} guest${Number(seats)===1?"":"s"}`;
  const regels=[
    descriptionPrefix,
    `Guest: ${name}`,
    `Number of guests: ${seats}`,
    `Weekend: ${weekendLabel||"—"}`,
    // **Deze twee datums zijn het bevestigde verblijf.** De aanroeper geeft ze door;
    // een aangevraagde nacht hoort er niet in te zitten en de afspraak duurt dus nooit
    // langer dan wat de accommodatie heeft toegezegd. Een agenda die een nacht toont die
    // niemand heeft toegezegd, is een kamer die op de verkeerde dag klaarstaat.
    `Arrival: ${arrivalDate} ${ARRIVAL_TIME}`,
    `Departure: ${departureDate} ${DEPARTURE_TIME}`,
    // De aanvraag mag er wél als tekst bij staan — als aanvraag, onder een eigen kopje,
    // zodat Nadine weet dat er een vraag ligt zonder dat de dagen alvast meetellen.
    extraNights?`NOT part of this entry — extra nights still to be confirmed: ${extraNights}`:"",
    `Booking reference: ${claimId}`
  ].filter(Boolean);
  return {
    claimId,
    // Een expliciete titel wint. Het testscript legt er zijn eigen op, zodat een
    // TEST-afspraak in de agenda ook echt als test te herkennen is.
    summary:summary||`${titlePrefix}${name} — ${gasten}`,
    description:regels.join("\n"),
    startDateTime:`${arrivalDate}T${ARRIVAL_TIME}:00`,
    endDateTime:`${departureDate}T${DEPARTURE_TIME}:00`
  };
};

// ═══════════════════════════════════════════════════════════════════════════
//  De agenda lezen: wat is er bezet, en door wie?
// ═══════════════════════════════════════════════════════════════════════════
//
//  Afgesproken met Robert op 6 september 2026. Er is **één agenda**, eigendom van Lewos en
//  gedeeld met Nadine. Zij zet haar eigen verhuur er rechtstreeks in; hij ziet dat in zijn
//  eigen Google Calendar, en de site leest dezelfde lijst. Geen synchronisatie tussen twee
//  agenda's — die loopt vroeg of laat uit de pas, en juist op dat moment verkoop je een
//  weekend twee keer.
//
//  Alles wat wij schrijven draagt `extendedProperties.private.lewosSource =
//  "tavern-booking"` en telt daarom nooit tegen onszelf mee. Welke van de overige afspraken
//  wél voorraad blokkeren, staat bij `classifyEvent` verderop — sinds 6 september 2026 is
//  dat niet meer "alles".
//
//  Wie het eerst boekt, heeft het. Boekt Nadine een weekend vol, dan gaat dat weekend van
//  de site af. Boekt er een gast, dan blokkeert de site het hele weekend — zie
//  `weekendBlockEvent` verderop.

export const LEWOS_MARKER="tavern-booking";

// Een afspraak wordt uitgedrukt in **nachten**, niet in dagen. Dat is het enige dat telt:
// een gast slaapt er of niet. Het maakt de wisseldag vanzelf goed — wie om 09:30 vertrekt
// en wie om 16:00 aankomt, delen een datum maar geen nacht.
//
// Een nacht N is bezet als de afspraak het moment `N om 23:00` overlapt.
export const nightsOf=event=>{
  if(!event||event.status==="cancelled")return [];
  // Een afspraak die als "vrij" in de agenda staat, blokkeert niets. Zo kan Nadine er een
  // notitie in zetten zonder dat de site denkt dat het huis vol zit.
  if(event.transparency==="transparent")return [];

  const heleDag=Boolean(event.start?.date);
  const nachten=[];
  if(heleDag){
    // Google geeft bij een hele-dagafspraak een einddatum die er níét bij hoort.
    const van=parseDay(event.start.date),tot=parseDay(event.end?.date);
    if(!van||!tot)return [];
    for(let d=van;d<tot;d=addDays(d,1))nachten.push(formatDay(d));
    return nachten;
  }
  const van=new Date(event.start?.dateTime||""),tot=new Date(event.end?.dateTime||"");
  if(Number.isNaN(van.getTime())||Number.isNaN(tot.getTime()))return [];
  // Loop de datums langs en kijk of 23:00 van die dag binnen de afspraak valt.
  const eersteDag=parseDay(String(event.start.dateTime).slice(0,10));
  const laatsteDag=parseDay(String(event.end.dateTime).slice(0,10));
  if(!eersteDag||!laatsteDag)return [];
  for(let d=eersteDag;d<=laatsteDag;d=addDays(d,1)){
    const nacht=new Date(`${formatDay(d)}T23:00:00`);
    if(nacht>=van&&nacht<tot)nachten.push(formatDay(d));
  }
  return nachten;
};

// De afspraken in een periode. `singleEvents` zet herhalingen om in losse afspraken, zodat
// een wekelijkse blokkade van Nadine ook echt elke week telt.
export const listEvents=async(config,{from,to})=>{
  const token=await accessToken(config);
  const parameters=new URLSearchParams({
    timeMin:`${from}T00:00:00Z`,timeMax:`${to}T23:59:59Z`,
    singleEvents:"true",orderBy:"startTime",maxResults:"2500",showDeleted:"false"
  });
  const {ok,status,body}=await call(token,`/calendars/${encodeURIComponent(config.calendarId)}/events?${parameters}`);
  if(!ok)throw new Error(`calendar_list:${status}:${JSON.stringify(body).slice(0,300)}`);
  return (body.items||[]).map(item=>({
    id:item.id,
    summary:item.summary||"",
    ours:item.extendedProperties?.private?.lewosSource===LEWOS_MARKER,
    // Wie de afspraak maakte bepaalt of hij voorraad blokkeert; zie `classifyEvent`.
    creator:item.creator?.email||"",
    organizer:item.organizer?.email||"",
    source:item.extendedProperties?.private?.lewosSource||"",
    claimId:item.extendedProperties?.private?.lewosClaimId||null,
    weekendSlug:item.extendedProperties?.private?.lewosWeekendSlug||null,
    nights:nightsOf(item)
  }));
};

// ── Wat telt als bezet? ────────────────────────────────────────────────────
//
// Robert, 6 september 2026: de koppeling staat sindsdien op een eigen agenda
// (*Lewos — Tavern & huis*) in plaats van op zijn persoonlijke. Daarmee verandert de regel:
// **gewone privéafspraken en niet-herkenbare afspraken blokkeren geen voorraad meer.**
// Alleen wat herkenbaar over het huis gaat, haalt nachten van de site.
//
// Herkenbaar is: aangemaakt door een adres van de accommodatie, of expliciet gemarkeerd met
// `lewosSource = "accommodation"`. Die adressen staan in `LEWOS_ACCOMMODATION_EMAILS` en
// bewust niet in deze repo — het zijn persoonsgegevens.
//
// **Is die variabele niet ingesteld, dan blokkeert alles wat niet van ons is.** Dat is met
// opzet. Een lege instelling zou anders stilzwijgend elke bescherming uitzetten, en precies
// dan verkoop je een nacht die allang vergeven is. Een gemiste verkoop herstel je met een
// telefoontje; twee groepen voor hetzelfde bed niet.
export const ACCOMMODATION_MARKER="accommodation";

export const accommodationAddresses=value=>
  String(value??process.env.LEWOS_ACCOMMODATION_EMAILS??"")
    .split(/[,;\s]+/).map(deel=>deel.trim().toLowerCase()).filter(Boolean);

export const classifyEvent=(event,addresses=[])=>{
  if(!event)return {blocks:false,reason:"leeg"};
  // Onze eigen boekingen en weekendblokkades staan al in onze administratie. Ze hier
  // meetellen zou een weekend blokkeren tegen zijn eigen boeking.
  if(event.ours)return {blocks:false,reason:"eigen_afspraak"};
  // Afgezegd, op "vrij" gezet of zonder nachten: er slaapt niemand.
  if(!(event.nights||[]).length)return {blocks:false,reason:"geen_nachten"};
  if(event.source===ACCOMMODATION_MARKER)return {blocks:true,reason:"gemarkeerd_als_accommodatie"};
  if(!addresses.length)return {blocks:true,reason:"herkenning_niet_ingesteld"};
  const wie=[event.creator,event.organizer].map(a=>String(a||"").trim().toLowerCase()).filter(Boolean);
  if(wie.some(adres=>addresses.includes(adres)))return {blocks:true,reason:"accommodatie_adres"};
  return {blocks:false,reason:"niet_herkend"};
};

export const busyNights=(events,options={})=>{
  const adressen=options.accommodationEmails??accommodationAddresses();
  const bezet=new Set();
  for(const e of events||[]){
    if(!classifyEvent(e,adressen).blocks)continue;
    for(const nacht of e.nights||[])bezet.add(nacht);
  }
  return bezet;
};

// Afspraken die wél nachten beslaan maar niet zijn meegeteld. Ze blokkeren niets — dat is
// de afspraak — maar ze verdwijnen ook niet uit het zicht: de beheeromgeving toont ze, zodat
// een boeking die vanaf een onbekend adres is ingevoerd opvalt vóórdat er twee groepen voor
// hetzelfde bed staan.
export const unrecognisedEvents=(events,options={})=>{
  const adressen=options.accommodationEmails??accommodationAddresses();
  return (events||[]).filter(e=>classifyEvent(e,adressen).reason==="niet_herkend");
};

// ── De weekendblokkade ─────────────────────────────────────────────────────
//
// Zodra er één stoel geboekt is, is dat weekend uit Nadine's markt. Dat moet ze kúnnen
// zien, anders verhuurt ze het huis eroverheen en staan er zes gasten zonder bed. Vandaar
// één afspraak over het hele weekend, los van de afspraken per boeking.
//
// Waarom niet gewoon de boekingsafspraken laten volstaan: die lopen van aankomst tot
// vertrek van díé gast. Eén gast die alleen het weekend zelf boekt, dekt de hele periode
// niet, en een leeg weekend heeft helemaal geen afspraak. Deze blokkade is expliciet.
export const weekendBlockIdFor=slug=>createHash("sha256").update(`lewos-tavern-weekend|${slug}`).digest("hex");

export const weekendBlockEvent=({slug,label,startsOn,endsOn,seatsBooked,capacity})=>{
  if(!startsOn||!endsOn)throw new Error("calendar_weekend_dates_missing");
  return {
    slug,
    id:weekendBlockIdFor(slug),
    summary:`The Lewos Tavern — ${label||slug} — house reserved`,
    description:[
      "The Tavern has bookings for this weekend, so the house is not available for other guests.",
      `Seats booked: ${seatsBooked}${capacity?` of ${capacity}`:""}`,
      "Written automatically by lewos.co. Do not delete: the website relies on it.",
      "Questions go to Robert."
    ].join("\n"),
    startDateTime:`${startsOn}T${ARRIVAL_TIME}:00`,
    endDateTime:`${endsOn}T${DEPARTURE_TIME}:00`
  };
};

export const upsertWeekendBlock=async(config,blok)=>{
  const token=await accessToken(config);
  const event={
    id:blok.id,summary:blok.summary,description:blok.description,
    start:{dateTime:blok.startDateTime,timeZone:config.timeZone},
    end:{dateTime:blok.endDateTime,timeZone:config.timeZone},
    transparency:"opaque",
    extendedProperties:{private:{lewosSource:LEWOS_MARKER,lewosWeekendSlug:String(blok.slug)}}
  };
  const aangemaakt=await call(token,`/calendars/${encodeURIComponent(config.calendarId)}/events?sendUpdates=none`,{method:"POST",body:JSON.stringify(event)});
  if(aangemaakt.ok)return {status:"created",event:aangemaakt.body};
  if(aangemaakt.status===409){
    const bijgewerkt=await call(token,`/calendars/${encodeURIComponent(config.calendarId)}/events/${blok.id}?sendUpdates=none`,{method:"PUT",body:JSON.stringify(event)});
    if(!bijgewerkt.ok)throw new Error(`calendar_weekend_update:${bijgewerkt.status}`);
    return {status:"updated",event:bijgewerkt.body};
  }
  throw new Error(`calendar_weekend_insert:${aangemaakt.status}:${JSON.stringify(aangemaakt.body).slice(0,300)}`);
};

// Geen boekingen meer op dat weekend? Dan hoort de blokkade weg, anders houdt de site een
// huis bezet dat niemand nodig heeft — en dat is precies waar Nadine niet aan meedoet.
export const removeWeekendBlock=async(config,slug)=>{
  const token=await accessToken(config);
  const {ok,status}=await call(token,`/calendars/${encodeURIComponent(config.calendarId)}/events/${weekendBlockIdFor(slug)}?sendUpdates=none`,{method:"DELETE"});
  if(ok||status===404||status===410)return {status:ok?"deleted":"absent"};
  throw new Error(`calendar_weekend_delete:${status}`);
};

// Alle weekendblokkades in één keer gelijkzetten. Een weekend met minstens één geboekte
// stoel krijgt een blokkade; een weekend zonder boekingen verliest hem weer — anders houdt
// de site een huis bezet dat niemand nodig heeft, en daar doet Nadine niet aan mee.
export const syncWeekendBlocks=async(config,weekends)=>{
  const uitkomst=[];
  for(const week of weekends||[]){
    if(!week?.slug||!week.startsOn||!week.endsOn){uitkomst.push({slug:week?.slug,status:"skipped_no_dates"});continue;}
    try{
      if(Number(week.seatsBooked)>0){
        const {status}=await upsertWeekendBlock(config,weekendBlockEvent(week));
        uitkomst.push({slug:week.slug,status});
      }else{
        const {status}=await removeWeekendBlock(config,week.slug);
        uitkomst.push({slug:week.slug,status});
      }
    }catch(error){uitkomst.push({slug:week.slug,status:"error",message:String(error.message||error)});}
  }
  return uitkomst;
};
