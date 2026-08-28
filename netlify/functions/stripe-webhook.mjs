import {createHmac,timingSafeEqual} from "node:crypto";

const response=(statusCode,body)=>({statusCode,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"},body:JSON.stringify(body)});
const getHeader=(event,name)=>Object.entries(event.headers||{}).find(([key])=>key.toLowerCase()===name.toLowerCase())?.[1]||"";

const validSignature=(rawBody,header,secret)=>{
  const entries=Object.fromEntries(header.split(",").map(part=>part.split("=",2)));
  if(!entries.t||!entries.v1)return false;
  const age=Math.abs(Math.floor(Date.now()/1000)-Number(entries.t));
  if(!Number.isFinite(age)||age>300)return false;
  const expected=createHmac("sha256",secret).update(`${entries.t}.${rawBody}`).digest("hex");
  const actual=entries.v1;
  return actual.length===expected.length&&timingSafeEqual(Buffer.from(actual),Buffer.from(expected));
};

const escapeHtml=value=>String(value).replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));
const rpc=async(name,body)=>{
  const result=await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/${name}`,{method:"POST",headers:{apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,authorization:`Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,"content-type":"application/json"},body:JSON.stringify(body)});
  if(!result.ok)throw new Error(`${name}:${result.status}:${await result.text()}`);
  return result.json();
};
const confirmPayment=(reference,paidAt)=>rpc("confirm_tavern_payment",{p_payment_reference:reference,p_paid_at:paidAt});
const sendBookingEmail=async booking=>{
  if(!process.env.RESEND_API_KEY||!process.env.TAVERN_FROM_EMAIL)return false;
  const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{authorization:`Bearer ${process.env.RESEND_API_KEY}`,"content-type":"application/json"},body:JSON.stringify({from:process.env.TAVERN_FROM_EMAIL,to:[booking.email],reply_to:"lewos.co@gmail.com",subject:`Your Lewos Tavern booking is confirmed`,html:`<div style="font-family:Arial,sans-serif;line-height:1.65;color:#0F3B35"><h1 style="font-size:28px">Your party has a table.</h1><p>Hi ${escapeHtml(booking.name)},</p><p>Payment has been received for ${booking.seats} guest${booking.seats===1?"":"s"} at ${escapeHtml(booking.weekendLabel)}. Your booking is confirmed.</p><p>We will contact you with the guest details, travel information and everything you need before the weekend.</p><p>Robert<br>The Lewos Tavern</p></div>`})});
  if(!response.ok)console.error("Booking email error",response.status,await response.text());
  return response.ok;
};

export const handler=async event=>{
  if(event.httpMethod!=="POST")return response(405,{error:"method_not_allowed"});
  if(!process.env.STRIPE_WEBHOOK_SECRET||!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY)return response(503,{error:"webhook_not_configured"});
  const rawBody=event.isBase64Encoded?Buffer.from(event.body||"","base64").toString("utf8"):event.body||"";
  if(!validSignature(rawBody,getHeader(event,"stripe-signature"),process.env.STRIPE_WEBHOOK_SECRET))return response(400,{error:"invalid_signature"});
  let stripeEvent;
  try{stripeEvent=JSON.parse(rawBody);}catch{return response(400,{error:"invalid_payload"});}
  const session=stripeEvent.data?.object||{};
  const reference=session.metadata?.payment_reference||session.client_reference_id;
  if(stripeEvent.type==="checkout.session.expired"){
    if(reference)try{await rpc("release_tavern_checkout",{p_payment_reference:reference});}catch(error){console.error("Expired checkout release error",error);return response(500,{error:"release_failed"});}
    return response(200,{received:true,released:Boolean(reference)});
  }
  if(stripeEvent.type!=="checkout.session.completed")return response(200,{received:true,ignored:true});
  if(session.payment_status!=="paid")return response(200,{received:true,ignored:true});
  if(!reference)return response(400,{error:"missing_payment_reference"});
  try{
    const result=await confirmPayment(reference,new Date(Number(stripeEvent.created)*1000).toISOString());
    if(result.status==="paid"&&!result.duplicate)await sendBookingEmail(result);
    if(result.status!=="paid"){
      console.error("Paid Stripe session could not be confirmed",{reference,status:result.status,claimId:result.claimId});
      return response(500,{error:"paid_booking_requires_attention"});
    }
    return response(200,{received:true,result});
  }catch(error){console.error("Payment confirmation error",error);return response(500,{error:"confirmation_failed"});}
};
