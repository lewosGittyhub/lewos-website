import {createHash,randomUUID} from "node:crypto";
import {CHECKOUT_HOLD_MINUTES,paymentsAreEnabled,publicBookingIsOpen} from "./_booking-config.mjs";

const json=(statusCode,body)=>({statusCode,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"},body:JSON.stringify(body)});
const tokenHash=token=>createHash("sha256").update(token).digest("hex");
const emailOk=email=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const getHeader=(event,name)=>Object.entries(event.headers||{}).find(([key])=>key.toLowerCase()===name.toLowerCase())?.[1]||"";
const clientAddress=event=>getHeader(event,"x-nf-client-connection-ip")||getHeader(event,"x-forwarded-for").split(",")[0].trim()||"unknown";
const rpc=async(name,body)=>{
  const response=await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/${name}`,{method:"POST",headers:{apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,authorization:`Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,"content-type":"application/json"},body:JSON.stringify(body)});
  if(!response.ok)throw new Error(`${name}:${response.status}:${await response.text()}`);
  return response.json();
};

// Filmtoestemming komt niet meer uit dit formulier. Wie betaalt bevestigt alleen dát hij
// weet dat Weekend 01 de gefilmde editie is; de eigenlijke toestemming geeft elke gast
// straks zelf, in de Filming & Media Agreement, met een versienummer en een eigen bewijs
// eronder. Een vinkje hier kan dat niet vastleggen, en de betaler kan het sowieso niet
// namens de anderen geven. Daarom gaat er altijd `false` naar de database: een client die
// zelf `filmingConsent:true` stuurt, krijgt daarmee geen toestemming geregistreerd.
const FILMING_CONSENT_NEVER_FROM_CHECKOUT=false;

// De prijs komt uit dezelfde rij als de prijs die de bezoeker te zien kreeg. Staat er
// een onmogelijk bedrag in, dan gaat er niets naar Stripe: liever geen betaling dan een
// afschrijving die niet klopt met wat er op de pagina stond.
const MIN_PRICE_CENTS=1000;
const MAX_PRICE_CENTS=1000000;
const priceFromHold=hold=>{
  const cents=Number(hold?.priceCents);
  return Number.isInteger(cents)&&cents>=MIN_PRICE_CENTS&&cents<=MAX_PRICE_CENTS?cents:null;
};

const createStripeSession=async({reference,name,email,seats,weekendLabel,unitAmount})=>{
  const origin=process.env.URL||"https://lewos.co";
  const form=new URLSearchParams();
  form.set("mode","payment");
  form.set("customer_email",email);
  form.set("client_reference_id",reference);
  form.set("success_url",`${origin}/booking-success/?session_id={CHECKOUT_SESSION_ID}`);
  form.set("cancel_url",`${origin}/booking-cancelled/`);
  form.set("expires_at",String(Math.floor(Date.now()/1000)+CHECKOUT_HOLD_MINUTES*60));
  form.set("line_items[0][price_data][currency]","eur");
  form.set("line_items[0][price_data][unit_amount]",String(unitAmount));
  form.set("line_items[0][price_data][product_data][name]",`The Lewos Tavern · ${weekendLabel}`);
  form.set("line_items[0][price_data][product_data][description]","Three-night Tavern weekend in Asturias");
  form.set("line_items[0][quantity]",String(seats));
  form.set("metadata[payment_reference]",reference);
  form.set("metadata[guest_name]",name);
  form.set("metadata[party_size]",String(seats));
  const response=await fetch("https://api.stripe.com/v1/checkout/sessions",{method:"POST",headers:{authorization:`Bearer ${process.env.STRIPE_SECRET_KEY}`,"content-type":"application/x-www-form-urlencoded","idempotency-key":reference},body:form.toString()});
  if(!response.ok)throw new Error(`stripe:${response.status}:${await response.text()}`);
  return response.json();
};
const expireStripeSession=async sessionId=>{
  const response=await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}/expire`,{method:"POST",headers:{authorization:`Bearer ${process.env.STRIPE_SECRET_KEY}`}});
  if(!response.ok)throw new Error(`stripe_expire:${response.status}:${await response.text()}`);
};

export const handler=async event=>{
  if(event.httpMethod!=="POST")return json(405,{error:"method_not_allowed"});
  if(!paymentsAreEnabled())return json(503,{error:"checkout_not_open"});
  const termsVersion=String(process.env.BOOKING_TERMS_VERSION||"").trim();
  if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY||!process.env.STRIPE_SECRET_KEY)return json(503,{error:"checkout_not_open"});
  let input;
  try{input=JSON.parse(event.body||"{}");}catch{return json(400,{error:"invalid_request"});}
  const mode=input.mode==="public"?"public":"first_access";
  if(mode==="public"&&!publicBookingIsOpen())return json(403,{error:"booking_not_open"});
  if(mode==="public"){
    try{if(await rpc("tavern_public_booking_ready",{})!==true)return json(403,{error:"first_access_windows_active"});}
    catch(error){console.error("Public booking readiness error",error);return json(503,{error:"checkout_unavailable"});}
  }
  let reference=randomUUID();
  const limiterIdentity=mode==="first_access"?String(input.token||""):String(input.email||"").trim().toLowerCase();
  if(!process.env.RATE_LIMIT_SECRET)return json(503,{error:"checkout_not_open"});
  try{
    const ipKey=createHash("sha256").update(`${process.env.RATE_LIMIT_SECRET}|checkout|ip|${clientAddress(event)}`).digest("hex");
    const identityKey=createHash("sha256").update(`${process.env.RATE_LIMIT_SECRET}|checkout|identity|${limiterIdentity}`).digest("hex");
    const [ipAllowed,identityAllowed]=await Promise.all([
      rpc("check_tavern_request_limit",{p_key_hash:ipKey,p_limit:12,p_window_minutes:15}),
      rpc("check_tavern_request_limit",{p_key_hash:identityKey,p_limit:5,p_window_minutes:15})
    ]);
    if(!ipAllowed||!identityAllowed)return json(429,{error:"too_many_requests"});
  }catch(error){console.error("Checkout rate limit error",error);return json(503,{error:"checkout_unavailable"});}
  let hold;
  try{
    if(mode==="first_access"){
      const token=String(input.token||"");
      const adultConfirmed=input.adultConfirmed===true;
      const privacyAccepted=input.privacyAccepted===true;
      // De uitnodiging zegt niet welk weekend het is; dat weet pas de database. Daarom
      // wordt de bevestiging hier altijd gevraagd. Liever een gast van Weekend 02 die een
      // zin over Weekend 01 leest, dan een gast van Weekend 01 die zonder die zin betaalt.
      const filmingAcknowledged=input.filmingAcknowledged===true;
      if(!/^[A-Za-z0-9_-]{32,200}$/.test(token))return json(400,{error:"invalid_invitation"});
      if(!adultConfirmed||!privacyAccepted||!filmingAcknowledged)return json(400,{error:"confirmations_required"});
      hold=await rpc("begin_tavern_first_access_checkout",{p_token_hash:tokenHash(token),p_payment_reference:reference,p_adult_confirmed:adultConfirmed,p_privacy_accepted:privacyAccepted,p_terms_version:termsVersion,p_filming_consent:FILMING_CONSENT_NEVER_FROM_CHECKOUT,p_hold_minutes:CHECKOUT_HOLD_MINUTES});
    }else{
      const name=String(input.name||"").trim();
      const email=String(input.email||"").trim().toLowerCase();
      const weekend=String(input.weekend||"");
      const people=Number.parseInt(input.people,10);
      const adultConfirmed=input.adultConfirmed===true;
      const privacyAccepted=input.privacyAccepted===true;
      const filmingAcknowledged=input.filmingAcknowledged===true;
      if(name.length<2||name.length>120||!emailOk(email)||!["weekend-01","weekend-02"].includes(weekend)||!Number.isInteger(people)||people<1||people>6||!adultConfirmed||!privacyAccepted)return json(400,{error:"invalid_details"});
      // Het vakje staat op de pagina alleen bij Weekend 01, dus de server eist het daar ook
      // alleen. Een verzoek dat de pagina omzeilt en het weglaat, komt niet langs.
      if(weekend==="weekend-01"&&!filmingAcknowledged)return json(400,{error:"confirmations_required"});
      hold=await rpc("begin_tavern_checkout",{p_name:name,p_email:email,p_party_size:people,p_weekend_slug:weekend,p_payment_reference:reference,p_adult_confirmed:adultConfirmed,p_privacy_accepted:privacyAccepted,p_terms_version:termsVersion,p_filming_consent:FILMING_CONSENT_NEVER_FROM_CHECKOUT,p_public_booking_opens_at:process.env.PUBLIC_BOOKING_OPENS_AT,p_hold_minutes:CHECKOUT_HOLD_MINUTES});
      hold={...hold,name,email,weekendLabel:weekend==="weekend-01"?"Weekend 01 · 30 Oct to 2 Nov 2026":"Weekend 02 · 6 to 9 Nov 2026"};
    }
  }catch(error){console.error("Checkout hold error",error);return json(503,{error:"checkout_unavailable"});}
  if(hold.status!=="payment_pending")return json(409,{error:hold.status,...hold});
  const unitAmount=priceFromHold(hold);
  if(unitAmount===null){
    console.error("Refusing checkout with an unusable price",{reference,priceCents:hold.priceCents});
    try{await rpc("release_tavern_checkout",{p_payment_reference:reference});}catch(releaseError){console.error("Checkout release error",releaseError);}
    return json(503,{error:"checkout_unavailable"});
  }
  if(hold.paymentReference)reference=hold.paymentReference;
  if(hold.checkoutUrl)return json(200,{status:"checkout_ready",checkoutUrl:hold.checkoutUrl,holdExpiresAt:hold.holdExpiresAt,resumed:true});
  let session;
  try{
    session=await createStripeSession({reference,name:hold.name,email:hold.email,seats:hold.seats,weekendLabel:hold.weekendLabel,unitAmount});
  }catch(error){
    console.error("Stripe checkout error",error);
    try{await rpc("release_tavern_checkout",{p_payment_reference:reference});}catch(releaseError){console.error("Checkout release error",releaseError);}
    return json(503,{error:"checkout_unavailable"});
  }
  try{
    const attachment=await rpc("attach_tavern_checkout_session",{p_payment_reference:reference,p_checkout_session_id:session.id,p_checkout_session_url:session.url});
    if(attachment?.status!=="attached")throw new Error(`attach_tavern_checkout_session:${attachment?.status||"invalid_response"}`);
  }
  catch(error){
    console.error("Checkout session attachment error",error);
    try{await expireStripeSession(session.id);}catch(expireError){console.error("Orphan checkout expiration error",expireError);}
    try{await rpc("release_tavern_checkout",{p_payment_reference:reference});}catch(releaseError){console.error("Checkout release error",releaseError);}
    return json(503,{error:"checkout_unavailable"});
  }
  return json(200,{status:"checkout_ready",checkoutUrl:session.url,holdExpiresAt:hold.holdExpiresAt});
};
