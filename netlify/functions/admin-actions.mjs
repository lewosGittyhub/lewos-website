// De beheeracties per deelnemer. Drie stuks, en ze zijn met opzet niet gelijkwaardig.
//
//   POST /api/admin/participants/<id>/remind   herinnering sturen        Robert en Nadine
//   POST /api/admin/participants/<id>/extend   betaaltermijn verlengen   alleen Robert
//   POST /api/admin/participants/<id>/release  plaats vrijgeven          alleen Robert
//
// Waarom herinneren wél voor allebei: Nadine mag contact opnemen. Waarom verlengen en
// vrijgeven niet: dat zijn commerciële beslissingen over geld en voorraad, en Robert heeft
// vastgelegd dat vrijgeven uitsluitend van hem komt. Verlengen valt in dezelfde categorie,
// dus die staat hier ook dicht — dat is de voorzichtige lezing en makkelijk te openen als
// Robert het anders wil.
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

export const handler=async event=>{
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
      const uitkomst=await rpc("admin_remind_participant",{p_email:beheerder.email,p_participant_id:deelnemerId,p_reason:reden||null});
      if(uitkomst?.status==="not_found")return json(404,{error:"participant_not_found"});
      if(uitkomst?.status==="already_paid")return json(409,{error:"already_paid"});
      return json(200,uitkomst);
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
        message:"Only Robert can extend a deadline or release a seat. Nadine can send a reminder and get in touch."});
    console.error("Admin action error",error);
    return json(503,{error:"admin_unavailable"});
  }
};
