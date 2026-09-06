// De leeskant van de beheeromgeving. Leest alleen; er is in deze versie geen enkele weg
// om iets te wijzigen, te annuleren of terug te betalen.
//
// Twee eindpunten:
//   GET /api/admin/bookings?from=YYYY-MM-DD&to=YYYY-MM-DD   → de kalender en de lijsten
//   GET /api/admin/bookings/<id>                            → één boeking, volledig
//
// Het verschil tussen die twee is niet alleen detailniveau maar een grens: **het
// overzicht geeft geen allergieën en geen dieetwensen terug.** Niet verborgen in de
// browser, maar simpelweg niet in het antwoord. Wie het overzicht onderschept heeft
// daarmee nog steeds geen gezondheidsgegevens. Die staan alleen in het detail van één
// boeking, achter dezelfde drie sloten.

import {authenticate,authErrorResponse} from "./_admin-auth.mjs";
import {readStayRequest,STAY_ERRORS} from "./_stay.mjs";

const json=(statusCode,body)=>({statusCode,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"},body:JSON.stringify(body)});
const DATUM=/^\d{4}-\d{2}-\d{2}$/;
const UUID=/^[0-9a-z-]{6,64}$/i;

const rpc=async(naam,body)=>{
  const url=process.env.SUPABASE_URL;
  const sleutel=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const response=await fetch(`${url}/rest/v1/rpc/${naam}`,{method:"POST",
    headers:{apikey:sleutel,authorization:`Bearer ${sleutel}`,"content-type":"application/json"},body:JSON.stringify(body)});
  const tekst=await response.text();
  let inhoud=null;
  try{inhoud=tekst?JSON.parse(tekst):null;}catch{}
  if(!response.ok){
    const melding=String(inhoud?.message||"").trim();
    const fout=new Error(melding||`rpc_failed:${response.status}`);
    fout.rpcMessage=melding;
    throw fout;
  }
  return inhoud;
};

// Wat er in de gedeelde agenda staat en botst met wat wij verkocht hebben. Dit verandert
// niets — het maakt zichtbaar. Een agenda-item mag nooit stilzwijgend een boeking omgooien.
const agendaBotsingen=async boekingen=>{
  if(!boekingen.length)return [];
  try{
    const {calendarConfig,listEvents,classifyEvent}=await import("./_calendar.mjs");
    const config=calendarConfig();
    if(!config)return [];
    const datums=boekingen.flatMap(b=>[b.arrival,b.departure]).filter(Boolean).sort();
    // Boekingen zonder datums leveren een leeg bereik op, en dan zou `listEvents` met
    // `undefined` naar Google bellen. Dan liever niets controleren.
    if(!datums.length)return [];
    const afspraken=await listEvents(config,{from:datums[0],to:datums[datums.length-1]});
    const botsingen=[];
    for(const afspraak of afspraken){
      if(afspraak.ours)continue;
      for(const boeking of boekingen){
        // De nachten van een boeking: aankomst tot en met de dag vóór vertrek.
        const raakt=(afspraak.nights||[]).filter(n=>n>=boeking.arrival&&n<boeking.departure);
        if(!raakt.length)continue;
        // Ook een afspraak die géén voorraad blokkeert komt hier terecht. Juist die:
        // hij is niet herkend als accommodatieboeking, dus de site heeft die nachten
        // gewoon doorverkocht. Dat moet Robert zien.
        const oordeel=classifyEvent(afspraak,config.accommodationEmails);
        botsingen.push({eventId:afspraak.id,summary:afspraak.summary,
          blocks:oordeel.blocks,reason:oordeel.reason,
          claimId:boeking.claimId,name:boeking.name,weekendLabel:boeking.weekendLabel,nights:raakt});
      }
    }
    return botsingen;
  }catch(error){console.error("Calendar conflict check error",error);return [];}
};

export const handler=async event=>{
  // Lezen mag met GET. Er is één schrijfhandeling: het oordeel van de accommodatie over
  // aangevraagde extra nachten. Die staat hier en niet bij de deelnemersacties, omdat hij
  // over de boeking gaat en niet over één betaler.
  if(!["GET","POST"].includes(event.httpMethod))return json(405,{error:"method_not_allowed"});
  if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY)return json(503,{error:"admin_not_configured"});

  let beheerder;
  try{beheerder=await authenticate(event);}
  catch(error){const {statusCode,body}=authErrorResponse(error);return json(statusCode,body);}

  // Het pad achter /api/admin/bookings. Netlify geeft het hele pad mee; alles na het
  // laatste segment is het boekingskenmerk.
  const pad=String(event.path||"").replace(/\/+$/,"");
  const staart=pad.split("/bookings")[1]||"";
  const delen=staart.replace(/^\//,"").split("/");
  const claimId=delen[0]||"";
  const actie=delen[1]||"";

  try{
    if(event.httpMethod==="POST"){
      if(!UUID.test(claimId))return json(400,{error:"invalid_booking_id"});
      if(actie!=="extra-nights")return json(404,{error:"unknown_action"});
      let invoer={};
      try{invoer=JSON.parse(event.body||"{}");}catch{return json(400,{error:"invalid_request"});}
      const besluit=String(invoer.decision||"");
      if(!["confirmed","declined"].includes(besluit))return json(400,{error:"invalid_decision"});
      const reden=String(invoer.reason||"").trim();
      if(reden.length>500)return json(400,{error:"reason_too_long"});
      // Bevestigen mag met minder nachten dan gevraagd: de accommodatie kan er één wél
      // hebben. Geeft zij niets op, dan bevestigt zij precies wat er gevraagd is.
      let stay={arrival:null,departure:null};
      if(besluit==="confirmed"){
        try{stay=readStayRequest({requestedArrival:invoer.confirmedArrival,requestedDeparture:invoer.confirmedDeparture});}
        catch(error){return json(422,{error:error.message,message:STAY_ERRORS[error.message]||"We could not read those dates."});}
      }
      const uitkomst=await rpc("admin_decide_extra_nights",{p_email:beheerder.email,p_claim_id:claimId,
        p_decision:besluit,p_arrival:stay.arrival,p_departure:stay.departure,p_reason:reden||null});
      if(uitkomst?.status==="not_found")return json(404,{error:"booking_not_found"});
      if(uitkomst?.status==="nothing_requested")return json(409,{error:"nothing_requested"});
      if(uitkomst?.status==="no_weekend_dates")return json(409,{error:"no_weekend_dates"});
      return json(200,uitkomst);
    }
    if(claimId){
      if(!UUID.test(claimId))return json(400,{error:"invalid_booking_id"});
      const detail=await rpc("admin_booking_detail",{p_email:beheerder.email,p_claim_id:claimId});
      if(!detail||detail.status==="not_found")return json(404,{error:"booking_not_found"});
      return json(200,detail);
    }
    const params=event.queryStringParameters||{};
    const from=String(params.from||"");
    const to=String(params.to||"");
    if(!DATUM.test(from)||!DATUM.test(to))return json(400,{error:"invalid_range"});
    if(from>to)return json(400,{error:"invalid_range"});
    const overzicht=await rpc("admin_bookings_in_range",{p_email:beheerder.email,p_from:from,p_to:to});
    // Botsingen met de gedeelde agenda. **Hier mag dit wél de titels tonen**: dit antwoord
    // zit achter de beheerderscontrole, en zonder de naam van de afspraak kan niemand
    // uitzoeken wat er aan de hand is. Het publieke eindpunt geeft alleen kale datums.
    const conflicten=await agendaBotsingen(overzicht?.bookings||[]);
    return json(200,{...(overzicht||{bookings:[]}),calendarConflicts:conflicten});
  }catch(error){
    // De database controleert het adres nóg een keer. Zegt zij nee, dan is dat een 403 —
    // ook als deze functie het adres wél goedkeurde. De strengste van de twee wint.
    if(error.rpcMessage==="not_an_administrator")return json(403,{error:"not_an_administrator"});
    // Meer bevestigen dan gevraagd is geen bevestiging maar een nieuwe boeking. De
    // database houdt dat tegen; hier komt het als een leesbare melding terug.
    if(error.rpcMessage==="stay_more_than_requested")
      return json(409,{error:"stay_more_than_requested",
        message:"You cannot confirm more nights than the guest asked for. Ask them to change their request first."});
    if(String(error.rpcMessage||"").startsWith("stay_"))return json(409,{error:error.rpcMessage});
    console.error("Admin read error",error);
    return json(503,{error:"admin_unavailable"});
  }
};
