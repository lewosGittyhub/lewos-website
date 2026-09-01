// Verstuurt de persoonlijke links voor de Filming & Media Agreement. Standaard doet dit
// script niets: zonder `--send` is het een droogloop, en zonder een open mediapoort
// weigert het ook dan. Er kan dus niet per ongeluk een uitnodiging de deur uit.
import {createHash,randomBytes} from "node:crypto";
import {MEDIA_INVITATION_WINDOW_DAYS,mediaAgreement,mediaConsentBlockers,mediaConsentIsEnabled} from "../netlify/functions/_media-config.mjs";

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

// De mail gaat naar één deelnemer en noemt niemand anders. Geen namen van medegasten, geen
// aantallen, geen keuzes van anderen — alleen deze persoon, dit weekend, deze versie.
const sendInvitation=async({participant,token,agreement})=>{
  const resendKey=required("RESEND_API_KEY");
  const from=required("TAVERN_FROM_EMAIL");
  const origin=String(process.env.URL||"https://lewos.co").replace(/\/$/,"");
  const link=`${origin}/tavern/filming-agreement/?token=${encodeURIComponent(token)}`;
  const deadline=new Date(participant.expiresAt).toLocaleString("en-GB",{dateStyle:"full",timeStyle:"short",timeZone:"Europe/Madrid"});
  const html=`<div style="font-family:Arial,sans-serif;line-height:1.65;color:#0F3B35">
    <h1 style="font-size:26px">Your Filming &amp; Media Agreement</h1>
    <p>Hi ${escapeHtml(participant.fullName)},</p>
    <p>You are attending <strong>${escapeHtml(participant.weekendLabel)}</strong>, The Lewos Tavern's professionally filmed First Edition. Every adult attending completes this agreement personally — nobody can complete it for you, and you cannot complete it for anyone else.</p>
    <p>This link is yours alone. Please do not forward it.</p>
    <p><a href="${link}" style="display:inline-block;padding:14px 22px;background:#E5643A;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">Open my agreement →</a></p>
    <p>It applies to agreement version <strong>${escapeHtml(agreement.version)}</strong> and stays open until <strong>${escapeHtml(deadline)} (Spain time)</strong>.</p>
    <p>You choose what you agree to. Permission for paid advertising is a separate, optional choice and is never assumed from anything else you tick. Saying no to any of it does not affect your place, your price or your room.</p>
    <p>Robert<br>The Lewos Tavern</p>
  </div>`;
  const resendUrl=process.env.RESEND_API_URL||"https://api.resend.com/emails";
  const response=await fetch(resendUrl,{
    method:"POST",
    headers:{authorization:`Bearer ${resendKey}`,"content-type":"application/json","idempotency-key":`media-agreement-${participant.participantId}-${agreement.version}`},
    body:JSON.stringify({from,to:[participant.email],reply_to:"lewos.co@gmail.com",subject:`Your Filming & Media Agreement for ${participant.weekendLabel}`,html})
  });
  if(!response.ok)throw new Error(`Resend ${response.status}: ${await response.text()}`);
  const result=await response.json();
  return result.id||"resend-accepted";
};

const send=process.argv.includes("--send");

// Poort eerst, altijd. Ook een droogloop mag niet suggereren dat er verstuurd kan worden.
if(!mediaConsentIsEnabled()){
  console.error("The Filming & Media Agreement flow is closed. Nothing was read, sent or written.");
  for(const blocker of mediaConsentBlockers())console.error(`  - ${blocker}`);
  process.exit(1);
}
const agreement=mediaAgreement();
const candidates=await api("tavern_media_participants?select=id,status,invitation_sent_at&status=in.(pending,invited)&invitation_sent_at=is.null&order=created_at.asc");
if(!send){
  console.log(`Dry run: ${candidates.length} media agreement invitation${candidates.length===1?"":"s"} eligible for version ${agreement.version}. No email was sent.`);
  process.exit(0);
}
if(process.env.MEDIA_AGREEMENT_SEND_CONFIRM!=="SEND_MEDIA_AGREEMENTS_NOW")throw new Error("Set MEDIA_AGREEMENT_SEND_CONFIRM=SEND_MEDIA_AGREEMENTS_NOW to send invitations.");

let sent=0;
for(const candidate of candidates){
  const token=randomBytes(32).toString("base64url");
  const hash=createHash("sha256").update(token).digest("hex");
  const participant=await rpc("issue_tavern_media_invitation",{p_participant_id:candidate.id,p_token_hash:hash,p_window_days:MEDIA_INVITATION_WINDOW_DAYS});
  if(participant.status==="already_invited")continue;
  if(participant.status==="not_required"){
    console.log(`Participant ${candidate.id} is not on a filmed weekend. Skipped.`);
    continue;
  }
  if(participant.status!=="invited")throw new Error(`Participant ${candidate.id} could not be invited: ${participant.status}`);
  let providerId;
  try{
    providerId=await sendInvitation({participant,token,agreement});
  }catch(error){
    // Mislukte verzending betekent een token dat niemand heeft. Die trekken we meteen in.
    await rpc("revoke_tavern_media_invitation",{p_participant_id:participant.participantId,p_token_hash:hash}).catch(()=>{});
    throw error;
  }
  const marked=await rpc("mark_tavern_media_invitation_sent",{p_participant_id:participant.participantId,p_provider_id:providerId});
  if(marked.status!=="marked"){
    console.error(`Invitation ${participant.participantId} was accepted by the email provider but delivery could not be recorded. The link is live and needs reconciliation.`);
    throw new Error("media_invitation_not_marked");
  }
  sent+=1;
}
console.log(`Sent ${sent} media agreement invitation${sent===1?"":"s"} for version ${agreement.version}.`);
