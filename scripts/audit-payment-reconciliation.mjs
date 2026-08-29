const required=name=>{
  const value=String(process.env[name]||"").trim();
  if(!value)throw new Error(`Missing ${name}`);
  return value;
};

const supabaseUrl=required("SUPABASE_URL");
const serviceKey=required("SUPABASE_SERVICE_ROLE_KEY");
const stripeKey=required("STRIPE_SECRET_KEY");
const stripeBase=String(process.env.STRIPE_API_URL||"https://api.stripe.com").replace(/\/$/,"");
const query="tavern_seat_claims?select=id,payment_reference,checkout_session_id,hold_expires_at,created_at&status=eq.payment_pending&checkout_session_id=not.is.null&order=created_at.asc";
const claimsResponse=await fetch(`${supabaseUrl}/rest/v1/${query}`,{headers:{apikey:serviceKey,authorization:`Bearer ${serviceKey}`}});
if(!claimsResponse.ok)throw new Error(`Supabase ${claimsResponse.status}: ${await claimsResponse.text()}`);
const claims=await claimsResponse.json();
const findings=[];

for(const claim of claims){
  const response=await fetch(`${stripeBase}/v1/checkout/sessions/${encodeURIComponent(claim.checkout_session_id)}`,{headers:{authorization:`Bearer ${stripeKey}`}});
  if(!response.ok){findings.push({claimId:claim.id,sessionId:claim.checkout_session_id,state:"stripe_lookup_failed",httpStatus:response.status});continue;}
  const session=await response.json();
  let state="checkout_open";
  if(session.payment_status==="paid"||session.status==="complete")state="paid_webhook_missing";
  else if(session.status==="expired")state="expiry_webhook_missing";
  findings.push({claimId:claim.id,sessionId:claim.checkout_session_id,state});
}

if(findings.length===0)console.log("Payment reconciliation audit: no attached pending checkouts.");
else console.log(JSON.stringify({checked:findings.length,findings},null,2));
if(findings.some(finding=>finding.state!=="checkout_open"))process.exitCode=2;
