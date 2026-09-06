// Welke nachten zijn het huis al kwijt?
//
// Er is één gedeelde agenda. Nadine zet haar eigen verhuur er rechtstreeks in, de site
// schrijft de Tavern-boekingen erin, en beiden zien hem in hun eigen Google Calendar.
// Dit eindpunt vertelt de bezoeker één ding: welke nachten bezet zijn.
//
// **Datums, en verder niets.** Nadine's afspraken dragen de namen van háár gasten. Die
// horen niet in een antwoord dat iedere bezoeker kan opvragen. De beheeromgeving mag ze
// wel zien; daar zit een controle voor. Hier gaan alleen kale datums de deur uit.
//
// Kan de agenda niet gelezen worden — niet ingesteld, Google onbereikbaar, rechten
// ingetrokken — dan blokkeren we niets en beloven we ook niets. Het valt dan terug op het
// gedrag van vóór deze koppeling: extra nachten zijn op aanvraag en Nadine bevestigt ze.
// **Nooit andersom**: een storing mag nooit een nacht vrij verklaren die bezet is, dus
// `configured:false` betekent "wij weten het niet", niet "alles is vrij".

import {calendarConfig,listEvents,busyNights} from "./_calendar.mjs";

const json=(statusCode,body,seconden=60)=>({statusCode,
  headers:{"content-type":"application/json; charset=utf-8","cache-control":`public, max-age=${seconden}`},
  body:JSON.stringify(body)});

const DATUM=/^\d{4}-\d{2}-\d{2}$/;

// Google heeft een quotum en een bezoeker ververst vaker dan een agenda verandert. Vijf
// minuten is kort genoeg dat een boeking van Nadine snel doorkomt, en lang genoeg dat een
// drukke pagina niet elke keer belt.
const CACHE_MS=5*60*1000;
// **De cache geldt alleen voor wat de bezoeker grijs ziet.** De controle bij het opslaan
// van een aanvraag leest de agenda rechtstreeks — zie `houseNightsFree` in `_stay.mjs`.
// Anders zou een boeking van Nadine vijf minuten lang onzichtbaar zijn voor de grens die
// er echt toe doet.
//
// Een Map die alleen maar groeit is in een langlevend proces een lek; elk nieuw
// datumbereik zou een regel achterlaten. Vandaar een dak erop.
const CACHE_MAX=64;
const cache=new Map();
const onthoud=(sleutel,waarde)=>{
  cache.set(sleutel,waarde);
  while(cache.size>CACHE_MAX)cache.delete(cache.keys().next().value);
};

export const handler=async event=>{
  if(event.httpMethod!=="GET")return json(405,{error:"method_not_allowed"},0);
  const {from,to}=event.queryStringParameters||{};
  if(!DATUM.test(String(from||""))||!DATUM.test(String(to||"")))return json(400,{error:"invalid_range"},0);
  if(from>to)return json(400,{error:"invalid_range"},0);
  // Een venster van meer dan een jaar is geen kalenderweergave maar een uitleespoging.
  if((Date.parse(to)-Date.parse(from))/86400000>400)return json(400,{error:"range_too_wide"},0);

  let config;
  try{config=calendarConfig();}
  catch(error){console.error("Calendar configuration error",error);return json(200,{configured:false,reason:"configuration"},0);}
  if(!config)return json(200,{configured:false,reason:"not_configured"},0);

  const sleutel=`${from}|${to}`;
  const bewaard=cache.get(sleutel);
  if(bewaard&&Date.now()-bewaard.tijd<CACHE_MS)
    return json(200,{configured:true,from,to,busyNights:bewaard.nachten});

  try{
    const afspraken=await listEvents(config,{from,to});
    const nachten=[...busyNights(afspraken)].sort();
    onthoud(sleutel,{tijd:Date.now(),nachten});
    return json(200,{configured:true,from,to,busyNights:nachten});
  }catch(error){
    console.error("Calendar availability error",error);
    // Geen 500: de pagina moet gewoon werken. Hij weet dan alleen niet wat bezet is.
    return json(200,{configured:false,reason:"unavailable"},0);
  }
};
