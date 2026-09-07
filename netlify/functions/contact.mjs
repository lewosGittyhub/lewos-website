// Het vragenformulier op /contact/.
//
// Tot 5 september 2026 liep dit via Netlify Forms: het bericht kwam in het Netlify-
// dashboard binnen en werd van daaruit doorgestuurd naar een adres dat alleen daar stond.
// Dat is precies het soort instelling dat je vergeet als je van adres wisselt. Sinds deze
// functie gaat een vraag langs `LEWOS_GENERAL_EMAIL`, net als elk ander bericht dat geen
// gewone accommodatieboeking is — en nooit langs het adres van de accommodatie.
//
// De opzet volgt `first-access.mjs`: dezelfde honeypot, dezelfde lengtegrenzen, dezelfde
// snelheidsbegrenzer, en hetzelfde antwoord op een formulierpost zonder JavaScript.

import {createHash} from "node:crypto";
import {NAME_MIN,tooLongFields} from "./_field-limits.mjs";
import {escapeHtml,escapeLines,resendPayload} from "./_email.mjs";
import {readRecipients} from "./_recipients.mjs";
import {environmentIsSafe,unsafeEnvironmentBody} from "./_deploy-context.mjs";

const json=(statusCode,body)=>({statusCode,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"},body:JSON.stringify(body)});
const redirect=location=>({statusCode:303,headers:{location,"cache-control":"no-store"},body:""});
const header=(event,name)=>Object.entries(event.headers||{}).find(([key])=>key.toLowerCase()===name.toLowerCase())?.[1]||"";
const parseBody=event=>header(event,"content-type").includes("application/json")?JSON.parse(event.body||"{}"):Object.fromEntries(new URLSearchParams(event.body||""));
const clientAddress=event=>header(event,"x-nf-client-connection-ip")||header(event,"x-forwarded-for").split(",")[0].trim()||"unknown";
const rateKey=value=>createHash("sha256").update(`${process.env.RATE_LIMIT_SECRET||""}|${value}`).digest("hex");

export const handler=async event=>{
  // Een deploycontext zonder eigen instellingen schrijft niets. Zie _deploy-context.mjs.
  if(!environmentIsSafe())return json(503,unsafeEnvironmentBody());
  if(event.httpMethod!=="POST")return json(405,{error:"method_not_allowed"});
  let input;
  try{input=parseBody(event);}catch{return json(400,{error:"invalid_request"});}
  // De honeypot heet hier anders dan op het aanmeldformulier, omdat het veld op de pagina
  // al zo heette. Een gevulde honeypot krijgt een gewoon antwoord: een bot hoort niet te
  // merken dat hij herkend is.
  if(input["contact-bot-field"]||input["bot-field"])return json(200,{status:"received"});
  const name=String(input.name||"").trim();
  const email=String(input.email||"").trim().toLowerCase();
  const question=String(input.question||"").trim();
  const teLang=tooLongFields({name,email,question});
  if(teLang.length)return json(400,{error:"field_too_long",fields:teLang});
  if(name.length<NAME_MIN||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!question)return json(400,{error:"invalid_details"});

  const supabaseUrl=process.env.SUPABASE_URL;
  const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  // Zonder begrenzer is een formulier dat mail verstuurt een doorgeefluik voor spam.
  // Liever dicht dan open: hetzelfde antwoord als het aanmeldformulier geeft.
  if(!supabaseUrl||!serviceKey||!process.env.RATE_LIMIT_SECRET)return json(503,{error:"contact_service_not_configured"});
  try{
    const checks=[
      {p_key_hash:rateKey(`contact-ip|${clientAddress(event)}`),p_limit:8,p_window_minutes:15},
      {p_key_hash:rateKey(`contact-email|${email}`),p_limit:4,p_window_minutes:15}
    ];
    for(const check of checks){
      const limitResponse=await fetch(`${supabaseUrl}/rest/v1/rpc/check_tavern_request_limit`,{method:"POST",headers:{apikey:serviceKey,authorization:`Bearer ${serviceKey}`,"content-type":"application/json"},body:JSON.stringify(check)});
      if(!limitResponse.ok)return json(503,{error:"contact_service_unavailable"});
      if(!(await limitResponse.json()))return json(429,{error:"too_many_requests"});
    }
  }catch(error){console.error("Contact rate limit connection error",error);return json(503,{error:"contact_service_unavailable"});}

  let general;
  try{({general}=readRecipients());}
  catch(error){console.error("Recipient configuration error",error);return json(503,{error:"contact_service_not_configured"});}
  if(!process.env.RESEND_API_KEY||!process.env.TAVERN_FROM_EMAIL)return json(503,{error:"contact_service_not_configured"});

  // `reply_to` op het adres van de gast, zodat Robert gewoon op beantwoorden kan drukken.
  // Dat mag alleen omdat het adres hierboven al door de controle is gekomen: het patroon
  // laat geen witruimte toe, dus ook geen regeleinde en geen extra kopregel.
  const tekst=`${name} <${email}> asks:\n\n${question}\n\nReply to this email and it goes straight back to them.`;
  try{
    const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{authorization:`Bearer ${process.env.RESEND_API_KEY}`,"content-type":"application/json"},body:JSON.stringify(resendPayload({
      from:process.env.TAVERN_FROM_EMAIL,to:[general],replyTo:email,subject:`A question from the Tavern website`,text:tekst,
      html:`<div style="font-family:Arial,sans-serif;line-height:1.65;color:#0F3B35"><p><strong>${escapeHtml(name)}</strong> &lt;${escapeHtml(email)}&gt; asks:</p><p>${escapeLines(question)}</p><p>Reply to this email and it goes straight back to them.</p></div>`
    }))});
    if(!response.ok){console.error("Contact email error",response.status,await response.text());return json(502,{error:"contact_not_delivered"});}
  }catch(error){console.error("Contact email connection error",error);return json(502,{error:"contact_not_delivered"});}

  if(header(event,"accept").includes("application/json"))return json(200,{status:"sent"});
  return redirect("/contact-thanks/");
};
