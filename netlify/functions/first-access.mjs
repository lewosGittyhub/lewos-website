import {createHash} from "node:crypto";
import {publicBookingIsOpen} from "./_booking-config.mjs";

const json=(statusCode,body)=>({statusCode,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"},body:JSON.stringify(body)});
const redirect=location=>({statusCode:303,headers:{location,"cache-control":"no-store"},body:""});
const header=(event,name)=>Object.entries(event.headers||{}).find(([key])=>key.toLowerCase()===name.toLowerCase())?.[1]||"";
const parseBody=event=>header(event,"content-type").includes("application/json")?JSON.parse(event.body||"{}"):Object.fromEntries(new URLSearchParams(event.body||""));
const escapeHtml=value=>String(value).replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));
const clientAddress=event=>header(event,"x-nf-client-connection-ip")||header(event,"x-forwarded-for").split(",")[0].trim()||"unknown";
const rateKey=value=>createHash("sha256").update(`${process.env.RATE_LIMIT_SECRET||""}|${value}`).digest("hex");
const knownInputErrors=new Set(["party_too_large","private_party_too_small","unknown_weekend","invalid_name","invalid_email","invalid_party_size","email_claim_limit","first_access_closed"]);
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

const sendGuestEmail=async({email,name,people,result})=>{
  const apiKey=process.env.RESEND_API_KEY;
  const from=process.env.TAVERN_FROM_EMAIL;
  if(!apiKey||!from)return null;
  let subject="We received your Tavern request";
  let message="Thank you. We have received your request and will contact you with the next step.";
  if(result.status==="first_access_held"){
    subject=`Your ${people} First Access seat${people===1?" is":"s are"} set aside`;
    message=`We have set aside ${people} seat${people===1?"":"s"} for ${escapeHtml(result.weekendLabel)}. Your party stays together, and no payment is due today. When booking opens you get 24 hours to complete payment before the weekend goes public — we will email you before that window starts. Seats that are not paid for within those 24 hours are released.`;
  }else if(result.status==="alternative_offered"){
    subject="Your Tavern weekend options";
    message=`Your complete party does not fit at ${escapeHtml(result.requestedWeekend)}, so we have not split your group. ${escapeHtml(result.offeredWeekendLabel)} can currently fit all ${people} of you. Return to the form to choose that weekend and claim the seats.`;
  }else if(result.status==="future_weekend_interest"){
    subject="The next Tavern chapter";
    message=`The announced weekends cannot fit your complete party, so we have registered your interest in opening the next suitable Tavern weekend. We will contact you when that date is ready.`;
  }else if(result.status==="private_inquiry"){
    subject="Your private Tavern request";
    message="Thank you. We have received your request for a private Tavern and will come back to you personally.";
  }
  const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{authorization:`Bearer ${apiKey}`,"content-type":"application/json","idempotency-key":`first-access-receipt-${result.claimId}`},body:JSON.stringify({from,to:[email],reply_to:"lewos.co@gmail.com",subject,html:`<div style="font-family:Arial,sans-serif;line-height:1.65;color:#0F3B35"><h1 style="font-size:28px">Hi ${escapeHtml(name)},</h1><p>${message}</p><p>The first story can only be told once.</p><p>Robert<br>The Lewos Tavern</p></div>`})});
  if(!response.ok){console.error("First Access email error",response.status,await response.text());return null;}
  const delivery=await response.json();
  return delivery.id||"resend-accepted";
};

export const handler=async event=>{
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
  const message=String(input.message||"").trim().slice(0,2000);
  if(name.length<2||name.length>120||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!Number.isInteger(people)||people<1||people>12||!input.consent) return json(400,{error:"invalid_details"});
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
    const response=await fetch(`${supabaseUrl}/rest/v1/rpc/register_tavern_interest`,{method:"POST",headers:{apikey:serviceKey,authorization:`Bearer ${serviceKey}`,"content-type":"application/json"},body:JSON.stringify({p_name:name,p_email:email,p_party_size:people,p_weekend_slug:weekend,p_message:message,p_first_access_closes_at:weekend==="private"?null:new Date(closesAt).toISOString()})});
    if(!response.ok){
      const inputError=await databaseError(response);
      if(inputError)return json(422,{error:inputError});
      console.error("First Access database error",response.status);
      return json(503,{error:"booking_service_unavailable"});
    }
    result=await response.json();
  }catch(error){console.error("First Access connection error",error);return json(503,{error:"booking_service_unavailable"});}
  let emailSent=result.receiptEmailSent===true;
  if(!emailSent&&result.claimId){
    let providerId=null;
    try{providerId=await sendGuestEmail({email,name,people,result});}catch(error){console.error("First Access email connection error",error);}
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
  if(header(event,"accept").includes("application/json")) return json(200,{...result,emailSent});
  if(result.status==="first_access_held") return redirect(`/thanks/?status=held&weekend=${encodeURIComponent(result.weekendLabel)}&seats=${result.seats}`);
  if(result.status==="private_inquiry") return redirect("/contact-thanks/");
  if(result.status==="alternative_offered") return redirect(`/tavern/?status=alternative&offered=${encodeURIComponent(result.offeredWeekend)}&label=${encodeURIComponent(result.offeredWeekendLabel)}&seats=${result.seats}#book`);
  return redirect("/tavern/?status=future#book");
};
