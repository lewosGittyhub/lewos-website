// De beheeracties per deelnemer. Drie stuks, en ze zijn met opzet niet gelijkwaardig.
//
//   POST /api/admin/participants/<id>/remind   herinnering sturen        Robert en Nadine
//   POST /api/admin/participants/<id>/extend   betaaltermijn verlengen   Robert en Nadine
//   POST /api/admin/participants/<id>/release  plaats vrijgeven          alleen Robert
//
// Waarom herinneren en verlengen voor allebei: Nadine is de accommodatie en weet als eerste
// of een gast nog onderweg is. Iemand laten omvallen op een termijn terwijl zij dat had
// kunnen voorkomen, kost meer dan de beslissing zelf. Robert heeft dit op 6 september 2026
// zo vastgesteld; daarvoor stond verlengen dicht.
//
// Waarom vrijgeven niet: dat is het onomkeerbare deel. Er gaat een stoel terug naar de
// voorraad en een gast eruit, en dat blijft van Robert.
//
// **De rol wordt aan de serverkant gecontroleerd én in de database**, net als de toegang
// zelf. De browser stuurt geen rol mee; die komt uit `lewos_admins`, opgezocht op het adres
// uit het gecontroleerde token.
//
// **Elke actie wordt vastgelegd**: wie, wat, wanneer, waarom. Een vrijgave zonder reden
// wordt geweigerd — over een half jaar wil je kunnen zien waaróm een plaats terugging.
//
// Eén deelnemer annuleren raakt de anderen nooit. De rij blijft bestaan met status
// `cancelled`; er wordt niets verwijderd en er wordt niets terugbetaald. Terugbetalen is
// een aparte handeling die hier bewust niet bestaat.

import {authenticate,authErrorResponse} from "./_admin-auth.mjs";
import {sendEmail} from "./_email.mjs";
import {buildPaymentRequestEmail} from "./_payment-request.mjs";
import {environmentIsSafe,unsafeEnvironmentBody,siteOrigin} from "./_deploy-context.mjs";

const json=(statusCode,body)=>({statusCode,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"},body:JSON.stringify(body)});
const ID=/^[0-9a-z-]{6,64}$/i;

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

// Eén tekst voor één situatie, zodat de beheerder overal hetzelfde leest en weet wat hij
// nu moet doen. Geen verzonnen termijn: verlengen is de handeling die er een zet.
const GEEN_TERMIJN={error:"no_payment_deadline",
  message:"This guest has no payment deadline yet, so there is nothing to remind them about. Send the payment request first, or use Extend to set a deadline."};

// Zonder betaallink is een herinnering een mail met een knop die nergens heen gaat.
const GEEN_BETAALLINK={error:"no_payment_link",
  message:"This guest has no payment link yet, so there is nothing to remind them about. The payment request has to go out first."};

export const handler=async event=>{
  // Een deploycontext zonder eigen instellingen schrijft niets. Zie _deploy-context.mjs.
  if(!environmentIsSafe())return json(503,unsafeEnvironmentBody());
  if(event.httpMethod!=="POST")return json(405,{error:"method_not_allowed"});
  if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY)return json(503,{error:"admin_not_configured"});

  let beheerder;
  try{beheerder=await authenticate(event);}
  catch(error){const {statusCode,body}=authErrorResponse(error);return json(statusCode,body);}

  const delen=String(event.path||"").replace(/\/+$/,"").split("/");
  const actie=delen.pop();
  const deelnemerId=delen.pop();
  if(!["remind","extend","release"].includes(actie))return json(404,{error:"unknown_action"});
  if(!ID.test(String(deelnemerId||"")))return json(400,{error:"invalid_participant_id"});

  let invoer={};
  try{invoer=JSON.parse(event.body||"{}");}catch{return json(400,{error:"invalid_request"});}
  const reden=String(invoer.reason||"").trim();

  // Een vrijgave zonder reden is over een half jaar een raadsel. Verlengen ook: er staat
  // dan een andere deadline dan de afgesproken termijn en niemand weet meer waarom.
  if(["release","extend"].includes(actie)&&reden.length<4)return json(400,{error:"reason_required"});
  if(reden.length>500)return json(400,{error:"reason_too_long"});

  try{
    if(actie==="remind"){
      // Eerst kijken óf er herinnerd kan worden, dan versturen, dan pas vastleggen. Die
      // volgorde is het hele punt: mislukt de verzending, dan staat er geen herinnering in
      // het logboek die nooit is verstuurd, en meldt de beheeromgeving geen "verstuurd".
      const klaar=await rpc("admin_reminder_payload",{p_email:beheerder.email,p_participant_id:deelnemerId});
      if(klaar?.status==="not_found")return json(404,{error:"participant_not_found"});
      if(klaar?.status==="already_paid")return json(409,{error:"already_paid"});
      if(klaar?.status==="no_deadline")return json(409,GEEN_TERMIJN);
      if(klaar?.status==="no_payment_link")return json(409,GEEN_BETAALLINK);
      if(klaar?.status!=="ready")return json(503,{error:"admin_unavailable"});

      // Dezelfde link als in het eerste betaalverzoek, uit hetzelfde kenmerk opgebouwd.
      const basis=siteOrigin();
      const betaalUrl=`${basis}/tavern/pay/?ref=${encodeURIComponent(klaar.paymentReference)}`;
      const mail=buildPaymentRequestEmail({participant:klaar.participant,booking:klaar.booking,
        deadline:klaar.deadline,paymentUrl:betaalUrl,reminder:true});
      // De sleutel hangt aan de deelnemer en aan wanneer hij voor het laatst iets kreeg,
      // niet aan het moment van deze poging. Twee pogingen na een netwerkfout leveren bij
      // Resend één bericht op; een volgende herinnering krijgt vanzelf een nieuwe sleutel.
      const providerId=await sendEmail({to:klaar.participant.email,subject:mail.subject,
        text:mail.text,html:mail.html,
        idempotencyKey:`reminder-${klaar.participantId}-${klaar.lastSentAt||"eerste"}`});
      if(!providerId)return json(502,{error:"reminder_not_sent",
        message:"The reminder was not sent, so nothing has been recorded. Check the email settings and try again."});

      const uitkomst=await rpc("admin_remind_participant",{p_email:beheerder.email,p_participant_id:deelnemerId,p_reason:reden||null});
      if(uitkomst?.status==="not_found")return json(404,{error:"participant_not_found"});
      if(uitkomst?.status==="already_paid")return json(409,{error:"already_paid"});
      if(uitkomst?.status==="no_deadline")return json(409,GEEN_TERMIJN);
      return json(200,{...uitkomst,emailSent:true,providerId});
    }
    if(actie==="extend"){
      const nieuw=String(invoer.newDeadline||"");
      if(Number.isNaN(Date.parse(nieuw)))return json(400,{error:"invalid_deadline"});
      // Een verlenging naar het verleden is geen verlenging.
      if(Date.parse(nieuw)<=Date.now())return json(400,{error:"deadline_in_the_past"});
      const uitkomst=await rpc("admin_extend_participant",{p_email:beheerder.email,p_participant_id:deelnemerId,
        p_new_deadline:new Date(nieuw).toISOString(),p_reason:reden});
      if(uitkomst?.status==="not_found")return json(404,{error:"participant_not_found"});
      return json(200,uitkomst);
    }
    const uitkomst=await rpc("admin_release_participant",{p_email:beheerder.email,p_participant_id:deelnemerId,p_reason:reden});
    if(uitkomst?.status==="not_found")return json(404,{error:"participant_not_found"});
    if(uitkomst?.status==="already_paid")
      return json(409,{error:"already_paid",
        message:"This guest has paid. A paid seat is not released here — cancellation and refund are separate steps."});
    return json(200,uitkomst);
  }catch(error){
    if(error.rpcMessage==="not_an_administrator")return json(403,{error:"not_an_administrator"});
    // De database bewaakt de rol zelf. Zegt zij nee, dan is dat een 403 — ook als deze
    // functie het adres wél kende.
    if(error.rpcMessage==="requires_owner")
      return json(403,{error:"requires_owner",
        message:"Only Robert can release a seat. Nadine can send reminders, extend a payment deadline and get in touch."});
    // Hetzelfde geval, maar dan opgegooid in plaats van teruggegeven — bijvoorbeeld als de
    // mail wordt opgebouwd vóórdat de uitkomst is nagekeken. Een ontbrekende termijn is
    // geen storing, dus hij hoort hier geen 503 te worden.
    if(error.code==="payment_request_deadline_missing"||error.message==="payment_request_deadline_missing")
      return json(409,GEEN_TERMIJN);
    console.error("Admin action error",error);
    return json(503,{error:"admin_unavailable"});
  }
};
