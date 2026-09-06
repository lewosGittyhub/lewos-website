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
  const clientEmail=String(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL||"").trim();
  const privateKey=String(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY||"").replace(/\\n/g,"\n").trim();
  const calendarId=String(process.env.LEWOS_CALENDAR_ID||"").trim();
  if(!clientEmail||!privateKey||!calendarId)return null;
  if(!privateKey.includes("BEGIN"))throw new Error("calendar_private_key_malformed");
  return {clientEmail,privateKey,calendarId,timeZone:String(process.env.TAVERN_TIMEZONE||TAVERN_TIMEZONE)};
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
