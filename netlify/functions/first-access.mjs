import {createHash} from "node:crypto";
import {mergeLegacyDietary} from "./_dietary.mjs";
import {readStayRequest,stayRequestText,describeStay,houseNightsFree,STAY_ERRORS} from "./_stay.mjs";
import {publicBookingIsOpen} from "./_booking-config.mjs";
import {NAME_MIN,tooLongFields} from "./_field-limits.mjs";
import {escapeHtml,labelledBlock,resendPayload} from "./_email.mjs";
import {readRecipients} from "./_recipients.mjs";
import {environmentIsSafe,unsafeEnvironmentBody} from "./_deploy-context.mjs";

const json=(statusCode,body)=>({statusCode,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"},body:JSON.stringify(body)});
const redirect=location=>({statusCode:303,headers:{location,"cache-control":"no-store"},body:""});
const header=(event,name)=>Object.entries(event.headers||{}).find(([key])=>key.toLowerCase()===name.toLowerCase())?.[1]||"";
const parseBody=event=>header(event,"content-type").includes("application/json")?JSON.parse(event.body||"{}"):Object.fromEntries(new URLSearchParams(event.body||""));
const clientAddress=event=>header(event,"x-nf-client-connection-ip")||header(event,"x-forwarded-for").split(",")[0].trim()||"unknown";
const rateKey=value=>createHash("sha256").update(`${process.env.RATE_LIMIT_SECRET||""}|${value}`).digest("hex");
const knownInputErrors=new Set(["party_too_large","private_party_too_small","unknown_weekend","invalid_name","invalid_email","invalid_party_size","invalid_allergies","invalid_dietary","invalid_dietary_notes","email_claim_limit","first_access_closed"]);
const firstAccessClosesAt=()=>{
  const value=Date.parse(process.env.PUBLIC_BOOKING_OPENS_AT||"");
  return Number.isFinite(value)?value:null;
};
const databaseError=async response=>{
  let detail={};
  try{detail=JSON.parse(await response.text());}catch{}
  const message=String(detail.message||"").trim();
  return knownInputErrors.has(message)?message:null;
};
const databasePublicBookingReady=async({supabaseUrl,serviceKey})=>{
  if(!publicBookingIsOpen())return false;
  const response=await fetch(`${supabaseUrl}/rest/v1/rpc/tavern_public_booking_ready`,{method:"POST",headers:{apikey:serviceKey,authorization:`Bearer ${serviceKey}`,"content-type":"application/json"},body:"{}"});
  if(!response.ok)throw new Error(`public_booking_ready:${response.status}:${await response.text()}`);
  return await response.json()===true;
};

const sendGuestEmail=async({email,name,people,result,dietaryNotes,notes})=>{
  const apiKey=process.env.RESEND_API_KEY;
  const from=process.env.TAVERN_FROM_EMAIL;
  if(!apiKey||!from)return null;
  let subject="We received your Tavern request";
  let message="Thank you. We have received your request and will contact you with the next step.";
  if(result.status==="first_access_held"){
    subject=`Your ${people} First Access seat${people===1?" is":"s are"} set aside`;
    message=`We have set aside ${people} seat${people===1?"":"s"} for ${result.weekendLabel}. Your party stays together, and no payment is due today. When booking opens you get 24 hours to complete payment before the weekend goes public — we will email you before that window starts. Seats that are not paid for within those 24 hours are released.`;
  }else if(result.status==="alternative_offered"){
    subject="Your Tavern weekend options";
    message=`Your complete party does not fit at ${result.requestedWeekend}, so we have not split your group. ${result.offeredWeekendLabel} can currently fit all ${people} of you. Return to the form to choose that weekend and claim the seats.`;
  }else if(result.status==="future_weekend_interest"){
    subject="The next Tavern chapter";
    message=`The announced weekends cannot fit your complete party, so we have registered your interest in opening the next suitable Tavern weekend. We will contact you when that date is ready.`;
  }else if(result.status==="private_inquiry"){
    subject="Your private Tavern request";
    message="Thank you. We have received your request for a private Tavern and will come back to you personally.";
  }
  // Terugkoppelen wat de gast heeft ingevuld. Wie een allergie doorgeeft moet in zijn
  // eigen postvak kunnen nalezen dat hij goed is aangekomen, en een fout kunnen melden.
  const genoteerd=labelledBlock(
    [["Allergies & dietary requirements",dietaryNotes],["Anything else",notes]],
    "We have noted the following. If anything here is wrong or incomplete, reply to this email and we will correct it."
  );
  const tekst=`Hi ${name},\n\n${message}${genoteerd.text}\n\nThe first story can only be told once.\n\nRobert\nThe Lewos Tavern`;
  const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{authorization:`Bearer ${apiKey}`,"content-type":"application/json","idempotency-key":`first-access-receipt-${result.claimId}`},body:JSON.stringify(resendPayload({
    from,to:[email],subject,text:tekst,
    html:`<div style="font-family:Arial,sans-serif;line-height:1.65;color:#0F3B35"><h1 style="font-size:28px">Hi ${escapeHtml(name)},</h1><p>${escapeHtml(message)}</p>${genoteerd.html}<p>The first story can only be told once.</p><p>Robert<br>The Lewos Tavern</p></div>`
  }))});
  if(!response.ok){console.error("First Access email error",response.status,await response.text());return null;}
  const delivery=await response.json();
  return delivery.id||"resend-accepted";
};

// Naar Lewos, en nooit naar de accommodatie. Dit formulier levert geen bevestigde
// boeking op — het houdt stoelen vast of registreert een aanvraag — dus Fontecha heeft
// hier niets te ontvangen. Wat hier wél binnenkomt is precies het soort bericht dat op
// het adres van Lewos hoort: een aanvraag voor een private Tavern, een allergie, een
// dieetwens, een vraag over toegankelijkheid.
//
// Zonder deze mail stond zo'n bericht alleen in Supabase en moest Robert er zelf naar
// gaan zoeken. Een allergie die niemand ziet, is een allergie die niet is doorgegeven.
//
// Faalt hij, dan blijft dat bij een regel in het log. De gast heeft zijn ontvangst-
// bevestiging al en zijn stoelen staan vast; die mag niet alsnog een foutmelding
// krijgen omdat ons eigen postvak onbereikbaar is.
const sendOperatorEmail=async({email,name,people,weekend,result,dietaryNotes,extraNights,stayFailed=false,notes})=>{
  const apiKey=process.env.RESEND_API_KEY;
  const from=process.env.TAVERN_FROM_EMAIL;
  if(!apiKey||!from)return null;
  const bijzonderheden=labelledBlock(
    [["Allergies & dietary requirements",dietaryNotes],["Extra nights requested",extraNights],
     // Staat deze regel er, dan heeft de gast wél nachten aangeklikt maar is de aanvraag
     // niet opgeslagen. Dan moet iemand hem bellen in plaats van erop te vertrouwen.
     ["Needs a call",stayFailed?"The guest asked for extra nights but the request could not be stored. Ask them which nights they meant.":""],
     ["Anything else",notes]],
    "What they told us:"
  );
  // Een private Tavern is altijd een gesprek. De rest alleen wanneer er iets te melden is.
  if(result.status!=="private_inquiry"&&!bijzonderheden.text)return "nothing_to_report";
  const {general}=readRecipients();
  const soort=result.status==="private_inquiry"?"A private Tavern request":"A Tavern registration";
  const aanvraag=labelledBlock([
    ["Name",name],
    ["Email",email],
    ["Party size",String(people)],
    ["Requested weekend",weekend],
    ["Assigned weekend",result.weekendLabel],
    ["Status",result.status],
    ["Reference",result.claimId]
  ],"Request:");
  const tekst=`${soort} came in through lewos.co.${aanvraag.text}${bijzonderheden.text}\n\nThe Lewos Tavern`;
  const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{authorization:`Bearer ${apiKey}`,"content-type":"application/json","idempotency-key":`first-access-operator-${result.claimId}`},body:JSON.stringify(resendPayload({
    from,to:[general],subject:`${soort} — ${name}`,text:tekst,
    html:`<div style="font-family:Arial,sans-serif;line-height:1.65;color:#0F3B35"><h1 style="font-size:24px">${escapeHtml(soort)} came in through lewos.co.</h1>${aanvraag.html}${bijzonderheden.html}<p>The Lewos Tavern</p></div>`
  }))});
  if(!response.ok){console.error("Operator notification error",response.status,await response.text());return null;}
  const delivery=await response.json();
  return delivery.id||"resend-accepted";
};

export const handler=async event=>{
  // Een deploycontext zonder eigen instellingen schrijft niets. Zie _deploy-context.mjs.
  if(!environmentIsSafe())return json(503,unsafeEnvironmentBody());
  const supabaseUrl=process.env.SUPABASE_URL;
  const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!supabaseUrl||!serviceKey) return json(503,{error:"booking_service_not_configured"});
  if(event.httpMethod==="GET"){
    try{
      const availability=await fetch(`${supabaseUrl}/rest/v1/rpc/get_tavern_availability`,{method:"POST",headers:{apikey:serviceKey,authorization:`Bearer ${serviceKey}`,"content-type":"application/json"},body:"{}"});
      if(!availability.ok){console.error("Availability database error",availability.status,await availability.text());return json(503,{error:"booking_service_unavailable"});}
      const weekends=await availability.json();
      const firstAccessClosed=firstAccessClosesAt()!==null&&Date.now()>=firstAccessClosesAt();
      const publicBookingOpen=firstAccessClosed?await databasePublicBookingReady({supabaseUrl,serviceKey}):false;
      return json(200,{weekends,publicBookingOpen,firstAccessClosed:firstAccessClosed&&!publicBookingOpen});
    }catch(error){console.error("Availability connection error",error);return json(503,{error:"booking_service_unavailable"});}
  }
  if(event.httpMethod!=="POST") return json(405,{error:"method_not_allowed"});
  let input;
  try{input=parseBody(event);}catch{return json(400,{error:"invalid_request"});}
  if(input["bot-field"]) return json(200,{status:"received"});
  const name=String(input.name||"").trim();
  const email=String(input.email||"").trim().toLowerCase();
  const weekend=String(input.weekend||"");
  const people=Number.parseInt(input.people,10);
  // Bewust géén .slice() meer. Dit veld draagt allergieën en dieetwensen; stil afkappen
  // betekende dat een gast dacht dat hij iets had doorgegeven wat nooit is aangekomen.
  // Te lang wordt nu geweigerd, met het veld en het aantal tekens erbij.
  const message=String(input.message||"").trim();
  // Eén veld sinds 5 september 2026. `allergies` en `dietary` worden nog aangenomen van
  // oudere clients — een tabblad dat al openstond mag niet stilzwijgend zijn allergie
  // kwijtraken — en worden dan samengevoegd tot dezelfde ene tekst.
  const allergies=String(input.allergies||"").trim();
  const dietary=String(input.dietary||"").trim();
  const dietaryNotes=String(input.dietaryNotes||"").trim()||mergeLegacyDietary(allergies,dietary);
  // Extra nachten voor of na het weekend. Het enige veld op dit formulier dat over de
  // accommodatie gaat en niet over de tafel; het reist mee naar Supabase zodat het bij een
  // bevestigde boeking mee kan naar Fontecha.
  // Extra nachten komen als datums binnen, niet als tekst. De zin die de accommodatie
  // straks leest wordt hieruit afgeleid — zie `_stay.mjs` en `assets/stay.js`. Oudere
  // clients die nog vrije tekst sturen worden niet stilzwijgend genegeerd: die tekst gaat
  // gewoon mee als wat hij is, de eigen woorden van de gast.
  let stayRequest;
  try{stayRequest=readStayRequest(input);}
  catch(error){return json(422,{error:error.message,message:STAY_ERRORS[error.message]||"We could not read those dates."});}
  const extraNights=String(input.extraNights||"").trim();
  const teLang=tooLongFields({name,email,dietaryNotes,allergies,dietary,extraNights,message});
  if(teLang.length) return json(400,{error:"field_too_long",fields:teLang});
  if(name.length<NAME_MIN||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!Number.isInteger(people)||people<1||people>12||!input.consent) return json(400,{error:"invalid_details"});
  if(!["weekend-01","weekend-02","private"].includes(weekend)) return json(400,{error:"invalid_weekend"});
  if(weekend==="private"&&people<4) return json(400,{error:"private_party_too_small"});
  if(weekend!=="private"&&people>6) return json(400,{error:"featured_party_too_large"});
  const closesAt=firstAccessClosesAt();
  if(weekend!=="private"&&closesAt===null)return json(503,{error:"booking_service_not_configured"});
  if(weekend!=="private"&&Date.now()>=closesAt){
    try{
      if(await databasePublicBookingReady({supabaseUrl,serviceKey}))return json(409,{error:"public_booking_open",bookingUrl:"/tavern/book/"});
      return json(409,{error:"first_access_closed"});
    }
    catch(error){console.error("Public booking readiness error",error);return json(503,{error:"booking_service_unavailable"});}
  }
  if(!process.env.RATE_LIMIT_SECRET) return json(503,{error:"booking_service_not_configured"});
  try{
    const checks=[
      {p_key_hash:rateKey(`ip|${clientAddress(event)}`),p_limit:12,p_window_minutes:15},
      {p_key_hash:rateKey(`email|${email}`),p_limit:5,p_window_minutes:15}
    ];
    for(const check of checks){
      const limitResponse=await fetch(`${supabaseUrl}/rest/v1/rpc/check_tavern_request_limit`,{method:"POST",headers:{apikey:serviceKey,authorization:`Bearer ${serviceKey}`,"content-type":"application/json"},body:JSON.stringify(check)});
      if(!limitResponse.ok) return json(503,{error:"booking_service_unavailable"});
      if(!(await limitResponse.json())) return json(429,{error:"too_many_requests"});
    }
  }catch(error){console.error("Rate limit connection error",error);return json(503,{error:"booking_service_unavailable"});}
  let result;
  try{
    const response=await fetch(`${supabaseUrl}/rest/v1/rpc/register_tavern_interest`,{method:"POST",headers:{apikey:serviceKey,authorization:`Bearer ${serviceKey}`,"content-type":"application/json"},body:JSON.stringify({p_name:name,p_email:email,p_party_size:people,p_weekend_slug:weekend,p_message:message,p_allergies:allergies,p_dietary:dietary,p_dietary_notes:dietaryNotes,p_extra_nights:extraNights,p_first_access_closes_at:weekend==="private"?null:new Date(closesAt).toISOString()})});
    if(!response.ok){
      const inputError=await databaseError(response);
      if(inputError)return json(422,{error:inputError});
      console.error("First Access database error",response.status);
      return json(503,{error:"booking_service_unavailable"});
    }
    result=await response.json();
  }catch(error){console.error("First Access connection error",error);return json(503,{error:"booking_service_unavailable"});}
  // De aanvraag voor extra nachten, apart weggeschreven. **Bewust ná de registratie en
  // bewust niet blokkerend**: een optionele vraag over accommodatie mag een gast nooit
  // zijn plaats kosten. Lukt het niet, dan staat dat in de mail aan Robert en kan hij
  // bellen — beter dan een boeking die afketst op een nacht die toch al niet vaststond.
  let stayStored=null;
  let bezetteNachten=[];
  if(result.claimId&&(stayRequest.arrival||stayRequest.departure)){
    try{
      const opgeslagen=await fetch(`${supabaseUrl}/rest/v1/rpc/set_tavern_stay_request`,{method:"POST",
        headers:{apikey:serviceKey,authorization:`Bearer ${serviceKey}`,"content-type":"application/json"},
        body:JSON.stringify({p_claim_id:result.claimId,p_arrival:stayRequest.arrival,p_departure:stayRequest.departure})});
      if(opgeslagen.ok)stayStored=await opgeslagen.json();
      else console.error("Stay request database error",opgeslagen.status,await opgeslagen.text());
    }catch(error){console.error("Stay request connection error",error);}
  }
  // Is het huis die nachten al verhuurd? Pas nu de weekenddatums bekend zijn, is de reeks
  // nachten te bepalen. Botst het, dan trekken we de aanvraag meteen weer in.
  if(stayStored?.status==="ok"){
    const vrij=await houseNightsFree({arrival:stayStored.requestedArrival,departure:stayStored.requestedDeparture,
      weekendStart:stayStored.weekendStart,weekendEnd:stayStored.weekendEnd});
    if(vrij.known&&vrij.conflicts.length){
      bezetteNachten=vrij.conflicts;
      try{await fetch(`${supabaseUrl}/rest/v1/rpc/set_tavern_stay_request`,{method:"POST",
        headers:{apikey:serviceKey,authorization:`Bearer ${serviceKey}`,"content-type":"application/json"},
        body:JSON.stringify({p_claim_id:result.claimId,p_arrival:null,p_departure:null})});}
      catch(error){console.error("Stay rollback error",error);}
      stayStored=null;
    }
  }

  // De regel voor de accommodatie, opgebouwd uit de datums die daadwerkelijk zijn
  // opgeslagen. Is er niets opgeslagen, dan valt hij terug op wat de gast zelf schreef.
  const stayNote=stayStored?.status==="ok"
    ?stayRequestText(describeStay({weekendStart:stayStored.weekendStart,weekendEnd:stayStored.weekendEnd,
       arrival:stayStored.requestedArrival,departure:stayStored.requestedDeparture}))
    :"";
  const stayFailed=Boolean((stayRequest.arrival||stayRequest.departure)&&stayStored?.status!=="ok");

  let emailSent=result.receiptEmailSent===true;
  if(!emailSent&&result.claimId){
    let providerId=null;
    try{providerId=await sendGuestEmail({email,name,people,result,dietaryNotes,notes:message});}catch(error){console.error("First Access email connection error",error);}
    emailSent=Boolean(providerId);
    if(providerId){
      try{
        const marked=await fetch(`${supabaseUrl}/rest/v1/rpc/mark_tavern_receipt_email_sent`,{method:"POST",headers:{apikey:serviceKey,authorization:`Bearer ${serviceKey}`,"content-type":"application/json"},body:JSON.stringify({p_claim_id:result.claimId,p_provider_id:providerId})});
        if(!marked.ok)console.error("First Access email mark error",marked.status,await marked.text());
        else{
          const markResult=await marked.json();
          if(!["marked","already_marked"].includes(markResult.status))console.error("First Access email remains unmarked",markResult);
        }
      }catch(error){console.error("First Access email mark connection error",error);}
    }
  }
  let operatorNotified=false;
  if(result.claimId){
    try{operatorNotified=Boolean(await sendOperatorEmail({email,name,people,weekend,result,dietaryNotes,
      extraNights:stayNote||extraNights,stayFailed,notes:message}));}
    catch(error){console.error("Operator notification connection error",error);}
  }
  if(header(event,"accept").includes("application/json")) return json(200,{...result,emailSent,operatorNotified,
    extraNightsStatus:stayStored?.extraNightsStatus||"none",extraNightsStored:stayStored?.status==="ok",
    ...(bezetteNachten.length?{houseUnavailableNights:bezetteNachten}:{})});
  if(result.status==="first_access_held") return redirect(`/thanks/?status=held&weekend=${encodeURIComponent(result.weekendLabel)}&seats=${result.seats}`);
  if(result.status==="private_inquiry") return redirect("/contact-thanks/");
  if(result.status==="alternative_offered") return redirect(`/tavern/?status=alternative&offered=${encodeURIComponent(result.offeredWeekend)}&label=${encodeURIComponent(result.offeredWeekendLabel)}&seats=${result.seats}#book`);
  return redirect("/tavern/?status=future#book");
};
