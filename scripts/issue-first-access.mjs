import {createHash,randomBytes} from "node:crypto";
import {paymentsAreEnabled} from "../netlify/functions/_booking-config.mjs";

const required=name=>{
  const value=String(process.env[name]||"").trim();
  if(!value)throw new Error(`Missing ${name}`);
  return value;
};
const escapeHtml=value=>String(value).replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));
const api=async(path,options={})=>{
  const base=required("SUPABASE_URL");
  const key=required("SUPABASE_SERVICE_ROLE_KEY");
  const response=await fetch(`${base}/rest/v1/${path}`,{...options,headers:{apikey:key,authorization:`Bearer ${key}`,"content-type":"application/json",...(options.headers||{})}});
  if(!response.ok)throw new Error(`Supabase ${response.status}: ${await response.text()}`);
  return response.json();
};
const rpc=(name,body)=>api(`rpc/${name}`,{method:"POST",body:JSON.stringify(body)});
const sendEmail=async({claim,token,tokenHash})=>{
  const resendKey=required("RESEND_API_KEY");
  const from=required("TAVERN_FROM_EMAIL");
  const origin=String(process.env.URL||"https://lewos.co").replace(/\/$/,"");
  const checkoutUrl=`${origin}/tavern/checkout/?token=${encodeURIComponent(token)}`;
  const deadline=new Date(claim.expiresAt).toLocaleString("en-GB",{dateStyle:"full",timeStyle:"short",timeZone:"Europe/Madrid"});
  const html=`<div style="font-family:Arial,sans-serif;line-height:1.65;color:#0F3B35">
    <h1 style="font-size:28px">Your First Access seats are ready.</h1>
    <p>Hi ${escapeHtml(claim.name)},</p>
    <p>Your ${claim.seats} seat${claim.seats===1?" is":"s are"} set aside for ${escapeHtml(claim.weekendLabel)}. Your complete party stays together.</p>
    <p>Your private payment window is open for 24 hours. Complete payment before <strong>${escapeHtml(deadline)} (Spain time)</strong>.</p>
    <p><a href="${checkoutUrl}" style="display:inline-block;padding:14px 22px;background:#E5643A;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">Complete my booking →</a></p>
    <p>If payment is not completed before the window closes, the seats are released before public booking opens.</p>
    <p>Robert<br>The Lewos Tavern</p>
  </div>`;
  const resendUrl=process.env.RESEND_API_URL||"https://api.resend.com/emails";
  const response=await fetch(resendUrl,{
    method:"POST",
    headers:{authorization:`Bearer ${resendKey}`,"content-type":"application/json","idempotency-key":`first-access-${claim.claimId}-${tokenHash.slice(0,16)}`},
    body:JSON.stringify({from,to:[claim.email],reply_to:"lewos.co@gmail.com",subject:"Your private booking window is open",html})
  });
  if(!response.ok)throw new Error(`Resend ${response.status}: ${await response.text()}`);
  const result=await response.json();
  return result.id||"resend-accepted";
};

const send=process.argv.includes("--send");
const claims=await api("tavern_seat_claims?select=id,status,assigned_weekend_id&status=eq.first_access_held&invitation_sent_at=is.null&order=created_at.asc");
const eligible=claims.filter(claim=>claim.assigned_weekend_id);
if(!send){
  console.log(`Dry run: ${eligible.length} First Access invitation${eligible.length===1?"":"s"} eligible. No email was sent.`);
  process.exit(0);
}
if(process.env.FIRST_ACCESS_SEND_CONFIRM!=="SEND_FIRST_ACCESS_NOW")throw new Error("Set FIRST_ACCESS_SEND_CONFIRM=SEND_FIRST_ACCESS_NOW to send invitations.");
if(!paymentsAreEnabled())throw new Error("Payments and the published booking-terms version must be enabled before invitations can be sent.");

let sent=0;
for(const candidate of eligible){
  const token=randomBytes(32).toString("base64url");
  const tokenHash=createHash("sha256").update(token).digest("hex");
  const claim=await rpc("issue_tavern_checkout_invitation",{p_claim_id:candidate.id,p_token_hash:tokenHash,p_window_hours:24});
  if(claim.status==="already_invited")continue;
  if(claim.status!=="invited")throw new Error(`Claim ${candidate.id} could not be invited: ${claim.status}`);
  try{
    const providerId=await sendEmail({claim,token,tokenHash});
    const marked=await rpc("mark_tavern_invitation_sent",{p_claim_id:claim.claimId,p_provider_id:providerId});
    if(marked.status!=="marked")throw new Error(`Invitation ${claim.claimId} could not be marked as sent.`);
    sent+=1;
  }catch(error){
    await rpc("revoke_tavern_checkout_invitation",{p_claim_id:claim.claimId,p_token_hash:tokenHash}).catch(()=>{});
    throw error;
  }
}
console.log(`Sent ${sent} First Access invitation${sent===1?"":"s"}.`);
