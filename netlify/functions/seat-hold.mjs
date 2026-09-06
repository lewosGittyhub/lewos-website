// De stoelblokkering, als eindpunt. Dit is wat het boekingsformulier aanroept.
//
//   POST   /api/hold           {sessionToken, weekend, people}  → blokkeer of hervat
//   GET    /api/hold?...       {sessionToken}                    → de stand, voor de afteller
//   POST   /api/hold/release   {sessionToken}                    → expliciet afbreken
//   POST   /api/hold/promote   {sessionToken, name, email, participants[]} → naar betalen
//
// Het sessietoken wordt door de browser gemaakt en hier gehasht; de database ziet nooit het
// token zelf. Eén blokkering per sessie — dat ligt vast in een unieke index, niet in een
// controle die iemand kan vergeten.
//
// **Snelheidsbegrenzing op twee niveaus**, want één ervan is niet genoeg:
//
//   1. Per sessie. Dezelfde sessie die nog eens aanklopt krijgt zijn bestaande blokkering
//      terug — nooit een tweede, nooit een nieuwe deadline.
//   2. Per bezoeker. Wie steeds een nieuw sessietoken verzint zou anders met tien tabbladen
//      een heel weekend kunnen dichtzetten. Daarom telt `check_tavern_request_limit` ook
//      het aantal blokkeringen per netwerkadres, in een eigen sleutelruimte.
//
// Het antwoord bevat nooit iets over andere boekingen: hoeveel stoelen er nog vrij zijn, en
// verder niets. Geen namen, geen betaalstatussen, geen verdeling.

import {createHash} from "node:crypto";
import {mergeLegacyDietary} from "./_dietary.mjs";
import {readStayRequest,stayRequestText,describeStay,STAY_ERRORS} from "./_stay.mjs";
import {FILLING_WINDOW_MINUTES,holdState,HOLD_PHASES} from "./_seat-hold.mjs";
import {NAME_MIN,tooLongFields} from "./_field-limits.mjs";

const json=(statusCode,body)=>({statusCode,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"},body:JSON.stringify(body)});
const header=(event,naam)=>Object.entries(event.headers||{}).find(([k])=>k.toLowerCase()===naam.toLowerCase())?.[1]||"";
const clientAddress=event=>header(event,"x-nf-client-connection-ip")||header(event,"x-forwarded-for").split(",")[0].trim()||"unknown";
const rateKey=waarde=>createHash("sha256").update(`${process.env.RATE_LIMIT_SECRET||""}|${waarde}`).digest("hex");
const sessionHash=token=>createHash("sha256").update(`lewos-booking-session|${token}`).digest("hex");

const rpc=async(naam,body)=>{
  const url=process.env.SUPABASE_URL,sleutel=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const response=await fetch(`${url}/rest/v1/rpc/${naam}`,{method:"POST",
    headers:{apikey:sleutel,authorization:`Bearer ${sleutel}`,"content-type":"application/json"},body:JSON.stringify(body)});
  const tekst=await response.text();
  let inhoud=null;try{inhoud=tekst?JSON.parse(tekst):null;}catch{}
  if(!response.ok){
    const fout=new Error(String(inhoud?.message||`rpc_failed:${response.status}`));
    fout.rpcMessage=String(inhoud?.message||"");throw fout;
  }
  return inhoud;
};

// Hoeveel blokkeringen mag één netwerkadres maken. Ruim genoeg voor iemand die twijfelt en
// opnieuw begint, krap genoeg om een weekend niet met tabbladen dicht te kunnen zetten.
const HOLDS_PER_ADDRESS=4;
const HOLDS_WINDOW_MINUTES=60;

const binnenGrens=async(sleutel,limiet,minuten)=>{
  const antwoord=await rpc("check_tavern_request_limit",{p_key_hash:rateKey(sleutel),p_limit:limiet,p_window_minutes:minuten});
  return antwoord===true;
};

// Wat er naar de browser gaat. Bewust smal: de fase, de deadline en de resterende tijd van
// de eigen blokkering, plus hoeveel stoelen er nog vrij zijn. Verder niets.
const publiekeStand=(hold,vrij)=>{
  const stand=holdState({
    phase:hold.phase===HOLD_PHASES.payment?HOLD_PHASES.payment:HOLD_PHASES.filling,
    holdStartedAt:hold.holdStartedAt,paymentStartedAt:hold.paymentStartedAt,
    participants:hold.participants||[],seats:hold.seats});
  return {
    status:hold.status,claimId:hold.claimId,seats:hold.seats,weekend:hold.weekend,
    phase:stand.phase,expiresAt:stand.deadline,
    secondsRemaining:stand.secondsRemaining??(stand.minutesRemaining!=null?stand.minutesRemaining*60:null),
    expired:stand.expired===true,
    ...(vrij==null?{}:{remaining:vrij})
  };
};

export const handler=async event=>{
  if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY||!process.env.RATE_LIMIT_SECRET)
    return json(503,{error:"booking_service_not_configured"});

  const pad=String(event.path||"").replace(/\/+$/,"");
  const actie=pad.endsWith("/release")?"release":pad.endsWith("/promote")?"promote":"hold";

  let invoer={};
  if(event.httpMethod==="POST"){
    try{invoer=JSON.parse(event.body||"{}");}catch{return json(400,{error:"invalid_request"});}
  }else if(event.httpMethod==="GET"){
    invoer=event.queryStringParameters||{};
  }else return json(405,{error:"method_not_allowed"});

  const token=String(invoer.sessionToken||"").trim();
  // Een kort of raadbaar token zou betekenen dat iemand andermans blokkering kan opvragen.
  if(token.length<32||token.length>200)return json(400,{error:"invalid_session"});
  const hash=sessionHash(token);

  try{
    if(actie==="release"){
      if(event.httpMethod!=="POST")return json(405,{error:"method_not_allowed"});
      const uitkomst=await rpc("release_seat_hold",{p_session_hash:hash});
      if(uitkomst.status==="requires_operator")
        return json(409,{error:"requires_operator",
          message:"Someone in this group has already paid. Please contact Lewos to change this booking."});
      return json(200,{status:uitkomst.status});
    }

    if(actie==="promote"){
      if(event.httpMethod!=="POST")return json(405,{error:"method_not_allowed"});
      const naam=String(invoer.name||"").trim();
      const email=String(invoer.email||"").trim().toLowerCase();
      const deelnemers=Array.isArray(invoer.participants)?invoer.participants:[];
      if(naam.length<NAME_MIN||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json(400,{error:"invalid_details"});
      // Iedere deelnemer betaalt zelf, dus iedere deelnemer heeft een eigen naam en adres.
      for(const d of deelnemers){
        const dn=String(d?.name||"").trim(),de=String(d?.email||"").trim().toLowerCase();
        if(dn.length<NAME_MIN||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(de))return json(400,{error:"invalid_participant"});
        const teLang=tooLongFields({name:dn,email:de});
        if(teLang.length)return json(400,{error:"field_too_long",fields:teLang});
      }
      const adressen=deelnemers.map(d=>String(d.email).trim().toLowerCase());
      if(new Set(adressen).size!==adressen.length)return json(400,{error:"duplicate_participant_email"});

      if(invoer.adultConfirmed!==true||invoer.privacyAccepted!==true)return json(400,{error:"confirmations_required"});
      // Weekend 01 is de gefilmde editie. De server controleert dat zelf; een formulier is
      // geen bewijs. Het blijft een bevestiging, geen toestemming — die vraagt Lewos apart.
      // Eén veld sinds 5 september 2026; oudere clients mogen nog twee velden sturen en
      // worden dan samengevoegd — een tabblad dat al openstond mag geen allergie verliezen.
      const dietaryNotes=String(invoer.dietaryNotes||"").trim()
        ||mergeLegacyDietary(invoer.allergies,invoer.dietary);
      const teLangVrij=tooLongFields({dietaryNotes,
        extraNights:String(invoer.extraNights||""),message:String(invoer.message||"")});
      if(teLangVrij.length)return json(400,{error:"field_too_long",fields:teLangVrij});
      // De extra nachten komen als datums binnen. Vorm hier, betekenis in de database:
      // of die datums bij het weekend passen weet alleen de database, want daar staan de
      // weekenddatums.
      let stayRequest;
      try{stayRequest=readStayRequest(invoer);}
      catch(error){return json(422,{error:error.message,message:STAY_ERRORS[error.message]||"We could not read those dates."});}

      const uitkomst=await rpc("promote_seat_hold_to_payment",{
        p_session_hash:hash,p_name:naam,p_email:email,
        p_allergies:String(invoer.allergies||"").trim(),p_dietary:String(invoer.dietary||"").trim(),
        p_dietary_notes:dietaryNotes,
        p_message:String(invoer.message||"").trim(),
        // Geen vrije tekst meer vanaf dit formulier: de aanvraag staat in de datums en de
        // regel eronder wordt daaruit afgeleid. Oudere clients die nog tekst sturen worden
        // wel gerespecteerd — die tekst is dan het enige wat de gast heeft gegeven.
        p_extra_nights:String(invoer.extraNights||"").trim(),
        p_filming_acknowledged:invoer.filmingAcknowledged===true,
        p_participants:deelnemers.map(d=>({name:String(d.name).trim(),email:String(d.email).trim().toLowerCase()}))});
      if(uitkomst.status==="hold_expired")return json(409,{error:"hold_expired"});
      if(uitkomst.status==="no_hold")return json(404,{error:"no_hold"});

      // Pas nu de aanvraag voor extra nachten. **Niet blokkerend**: de plaatsen liggen
      // vast en de betaallinks gaan zo de deur uit — een vraag over accommodatie mag dat
      // niet meer omgooien. Lukt het niet, dan zegt het antwoord dat eerlijk.
      let stayStored=null;
      if(uitkomst.claimId&&(stayRequest.arrival||stayRequest.departure)){
        try{stayStored=await rpc("set_tavern_stay_request",
          {p_claim_id:uitkomst.claimId,p_arrival:stayRequest.arrival,p_departure:stayRequest.departure});}
        catch(error){console.error("Stay request error",error);}
      }
      const stayNote=stayStored?.status==="ok"
        ?stayRequestText(describeStay({weekendStart:stayStored.weekendStart,weekendEnd:stayStored.weekendEnd,
           arrival:stayStored.requestedArrival,departure:stayStored.requestedDeparture}))
        :"";
      return json(200,{...uitkomst,
        extraNightsStatus:stayStored?.extraNightsStatus||"none",
        extraNightsStored:(stayRequest.arrival||stayRequest.departure)?stayStored?.status==="ok":null,
        extraNightsRequest:stayNote});
    }

    if(event.httpMethod==="GET"){
      const uitkomst=await rpc("get_seat_hold",{p_session_hash:hash});
      if(!uitkomst||uitkomst.status==="no_hold")return json(404,{error:"no_hold"});
      // Zegt de database dat de blokkering voorbij is, dan is hij voorbij. De klok van deze
      // functie is dan niet meer relevant: twee klokken die het oneens zijn, en de database
      // heeft de stoelen al aan iemand anders kunnen geven.
      if(uitkomst.status!=="active")return json(404,{error:"hold_expired"});
      return json(200,publiekeStand(uitkomst,uitkomst.remaining));
    }

    // Blokkeren of hervatten.
    const weekend=String(invoer.weekend||"");
    const mensen=Number.parseInt(invoer.people,10);
    if(!Number.isInteger(mensen)||mensen<1||mensen>6)return json(400,{error:"invalid_party_size"});
    if(!/^[a-z0-9-]{3,40}$/.test(weekend))return json(400,{error:"invalid_weekend"});

    // De grens per bezoeker. Staat vóór de aanroep die stoelen vastzet, zodat een geweigerde
    // poging geen voorraad kan raken.
    if(!await binnenGrens(`hold-ip|${clientAddress(event)}`,HOLDS_PER_ADDRESS,HOLDS_WINDOW_MINUTES))
      return json(429,{error:"too_many_holds",
        message:"You have started several bookings in a short time. Please finish or cancel one before starting another."});

    const uitkomst=await rpc("begin_seat_hold",{p_session_hash:hash,p_weekend_slug:weekend,
      p_party_size:mensen,p_window_minutes:FILLING_WINDOW_MINUTES});
    if(uitkomst.status==="not_available")
      return json(409,{error:"not_available",remaining:uitkomst.remaining});
    return json(200,publiekeStand({...uitkomst,phase:uitkomst.phase,weekend},uitkomst.remaining));
  }catch(error){
    if(["unknown_weekend","invalid_party_size","invalid_session"].includes(error.rpcMessage))
      return json(400,{error:error.rpcMessage});
    console.error("Seat hold error",error);
    return json(503,{error:"booking_service_unavailable"});
  }
};
