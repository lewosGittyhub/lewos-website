// De persoonlijke betaalpagina achter `/tavern/pay/?ref=…`.
//
// Elke deelnemer betaalt zijn eigen aandeel, met een eigen kenmerk uit zijn eigen mail. Wat
// deze functie teruggeeft gaat daarom **altijd over precies één persoon**: zijn naam, zijn
// bedrag, zijn termijn. Nooit de andere gasten, nooit het groepstotaal, nooit een allergie.
//
// Twee wegen:
//
//   GET  /api/pay?ref=…   wat er te betalen valt — ook als de betaalpoort dicht staat, want
//                         dan hoort de gast te lezen dat zijn plek er is en betalen nog niet
//                         kan, in plaats van een foutmelding.
//   POST /api/pay?ref=…   de eigen bevestigingen van de deelnemer vastleggen en daarna de
//                         betaalsessie openen. **Alleen als de poort open staat.**
//
// Die bevestigingen zijn van deze deelnemer alleen: meerderjarigheid, de privacyverklaring,
// en bij een gefilmd weekend de filmerkenning. Tot nu toe vinkte de hoofdboeker ze aan voor
// de hele groep, en dat kan niet — meerderjarigheid verklaar je niet voor iemand anders. De
// database weigert een betaalsessie zonder deze vastlegging, dus dit pad is niet te omzeilen
// door de front-end over te slaan.
//
// De sessie is idempotent op twee niveaus: Stripe krijgt het betaalkenmerk als
// `idempotency-key`, en de database bewaart de eerste sessie en geeft die daarna terug. Twee
// keer klikken levert dus één betaling op, niet twee.

import {paymentsAreEnabled} from "./_booking-config.mjs";
import {environmentIsSafe,unsafeEnvironmentBody,siteOrigin,requestOrigin} from "./_deploy-context.mjs";

const json=(statusCode,body)=>({statusCode,
  headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"},
  body:JSON.stringify(body)});

const rpc=async(naam,body)=>{
  const url=process.env.SUPABASE_URL,sleutel=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const response=await fetch(`${url}/rest/v1/rpc/${naam}`,{method:"POST",
    headers:{apikey:sleutel,authorization:`Bearer ${sleutel}`,"content-type":"application/json"},
    body:JSON.stringify(body)});
  const tekst=await response.text();
  let inhoud=null;try{inhoud=tekst?JSON.parse(tekst):null;}catch{}
  if(!response.ok){
    const fout=new Error(String(inhoud?.message||`rpc_failed:${response.status}`));
    fout.rpcMessage=String(inhoud?.message||"");throw fout;
  }
  return inhoud;
};

// Wat de browser mag zien. Bewust een eigen laag: wat de database teruggeeft mag groeien
// zonder dat er per ongeluk iets nieuws naar buiten lekt.
const publiek=r=>({
  status:r.status,
  ...(r.fullName?{fullName:r.fullName}:{}),
  ...(r.amountCents!=null?{amountCents:r.amountCents}:{}),
  ...(r.deadline?{deadline:r.deadline}:{}),
  ...(r.weekendLabel?{weekendLabel:r.weekendLabel}:{}),
  ...(r.bookingName?{bookingName:r.bookingName}:{}),
  // De pagina moet weten of ze de filmerkenning hoort te vragen. Welk weekend gefilmd
  // wordt staat in de database, niet in de front-end.
  ...(r.filmingRequired!=null?{filmingRequired:r.filmingRequired===true}:{})
});

const stripeSessie=async({reference,bedragCenten,naam,weekendLabel,basis})=>{
  const form=new URLSearchParams();
  form.set("mode","payment");
  form.set("payment_method_types[0]","card");
  form.set("payment_method_types[1]","ideal");
  form.set("payment_method_types[2]","bancontact");
  form.set("success_url",`${basis}/booking-success/`);
  form.set("cancel_url",`${basis}/booking-cancelled/`);
  form.set("client_reference_id",reference);
  form.set("metadata[payment_reference]",reference);
  form.set("line_items[0][quantity]","1");
  form.set("line_items[0][price_data][currency]","eur");
  form.set("line_items[0][price_data][unit_amount]",String(bedragCenten));
  form.set("line_items[0][price_data][product_data][name]",`The Lewos Tavern — ${weekendLabel}`);
  form.set("line_items[0][price_data][product_data][description]",`Own share for ${naam}`);
  const response=await fetch("https://api.stripe.com/v1/checkout/sessions",{method:"POST",
    headers:{authorization:`Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "content-type":"application/x-www-form-urlencoded",
      // Hetzelfde kenmerk als de betaallink: Stripe maakt dan bij een tweede poging
      // dezelfde sessie in plaats van een nieuwe.
      "idempotency-key":reference},
    body:form.toString()});
  if(!response.ok){
    console.error("Stripe session error",response.status,await response.text());
    return null;
  }
  return response.json();
};

export const handler=async event=>{
  // Een deploycontext zonder eigen instellingen schrijft niets. Zie _deploy-context.mjs.
  if(!environmentIsSafe())return json(503,unsafeEnvironmentBody());
  if(!["GET","POST"].includes(event.httpMethod))return json(405,{error:"method_not_allowed"});
  if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY)
    return json(503,{error:"payment_service_unavailable"});

  const reference=String(event.queryStringParameters?.ref||"").trim();
  // Vorm van het kenmerk zoals `prepare_seat_hold_payment` het maakt. Alles wat daar niet
  // op lijkt gaat niet eens naar de database.
  if(!/^tav_[a-f0-9]{16,80}$/.test(reference))return json(404,{error:"not_found"});

  let gevonden;
  try{gevonden=await rpc("tavern_payment_request",{p_reference:reference});}
  catch(error){console.error("Payment lookup error",error);return json(503,{error:"payment_service_unavailable"});}

  if(!gevonden||gevonden.status==="not_found")return json(404,{error:"not_found"});
  if(gevonden.status==="cancelled")return json(410,{error:"cancelled",
    message:"This booking was released. Nothing has been charged."});
  if(gevonden.status==="expired")return json(410,{error:"expired",
    message:"The payment window for this booking has passed. Nothing has been charged — contact us and we will see what is still possible."});
  if(gevonden.status==="already_paid")return json(200,{...publiek(gevonden),
    message:"This share has already been paid. Nothing further is due."});
  if(gevonden.status!=="ok")return json(503,{error:"payment_service_unavailable"});

  const open=paymentsAreEnabled();

  if(event.httpMethod==="GET")
    return json(200,{...publiek(gevonden),paymentsOpen:open,
      ...(gevonden.checkoutSessionUrl?{checkoutUrl:gevonden.checkoutSessionUrl}:{})});

  // ── POST: de betaalsessie ────────────────────────────────────────────────
  // Harde grens 1: geen betalingen zolang de reisbureauregistratie niet rond is.
  if(!open)return json(503,{error:"payments_not_open",
    message:"Payment is not open yet. Your place is held and nothing has been charged. We will let you know the moment it opens."});

  // Bestaat er al een sessie, dan die. Nooit een tweede. De bevestigingen zijn dan al
  // vastgelegd: zonder die vastlegging had de database die sessie niet afgegeven.
  if(gevonden.checkoutSessionUrl)
    return json(200,{status:"checkout_ready",checkoutUrl:gevonden.checkoutSessionUrl});

  // ── De eigen bevestigingen, vóór de betaalsessie ──────────────────────────
  // De versie komt uit de omgeving en niet uit de browser. Staat de poort open, dan is die
  // versie ook gepubliceerd: `paymentsAreEnabled()` eist dat hij gelijk is aan
  // PUBLISHED_TERMS_VERSION. Er wordt dus nooit een aanvaarding vastgelegd tegen een concept.
  let invoer={};
  try{invoer=event.body?JSON.parse(event.body):{};}
  catch{return json(400,{error:"invalid_json"});}

  let vastgelegdeBevestiging;
  try{
    vastgelegdeBevestiging=await rpc("record_participant_confirmations",{
      p_reference:reference,
      p_terms_version:String(process.env.BOOKING_TERMS_VERSION||"").trim(),
      p_adult_confirmed:invoer.adultConfirmed===true,
      p_privacy_accepted:invoer.privacyAccepted===true,
      p_filming_acknowledged:invoer.filmingAcknowledged===true});
  }catch(error){
    console.error("Participant confirmation error",error);
    return json(503,{error:"payment_service_unavailable"});
  }

  if(vastgelegdeBevestiging?.status==="confirmations_required")
    return json(400,{error:"confirmations_required",
      message:"Please confirm the three statements above. Nothing has been charged."});
  if(vastgelegdeBevestiging?.status==="terms_version_missing"){
    // Dit hoort niet te kunnen: de poort staat alleen open met een gepubliceerde versie.
    // Gebeurt het toch, dan is er iets mis met de instellingen en niet met de gast.
    console.error("Terms version missing while payments are open",{reference});
    return json(503,{error:"payment_service_unavailable"});
  }
  if(vastgelegdeBevestiging?.status==="expired")return json(410,{error:"expired",
    message:"The payment window for this booking has passed. Nothing has been charged — contact us and we will see what is still possible."});
  if(vastgelegdeBevestiging?.status==="cancelled")return json(410,{error:"cancelled",
    message:"This booking was released. Nothing has been charged."});
  if(vastgelegdeBevestiging?.status==="already_paid")return json(200,{status:"already_paid",
    message:"This share has already been paid. Nothing further is due."});
  if(vastgelegdeBevestiging?.status!=="recorded")return json(503,{error:"payment_service_unavailable"});

  const basis=requestOrigin(event);
  const sessie=await stripeSessie({reference,bedragCenten:gevonden.amountCents,
    naam:gevonden.fullName,weekendLabel:gevonden.weekendLabel,basis});
  if(!sessie?.url)return json(502,{error:"checkout_not_created",
    message:"We could not open the payment page. Nothing has been charged. Please try again."});

  let vastgelegd;
  try{vastgelegd=await rpc("attach_participant_checkout_session",
    {p_reference:reference,p_session_id:sessie.id,p_session_url:sessie.url});}
  catch(error){console.error("Attach session error",error);return json(503,{error:"payment_service_unavailable"});}

  // Twee gelijktijdige klikken: de database hield de eerste sessie vast. Dan die gebruiken,
  // zodat beide tabbladen naar dezelfde betaling gaan.
  // De database weigert een sessie zonder vastgelegde bevestigingen. Dat hoort hier niet te
  // kunnen -- we hebben ze net vastgelegd -- maar als het gebeurt is het geen gastfout.
  if(vastgelegd?.status==="confirmations_required"){
    console.error("Database refused a session without confirmations",{reference});
    return json(503,{error:"payment_service_unavailable"});
  }

  const url=vastgelegd?.status==="already_attached"?vastgelegd.checkoutSessionUrl:sessie.url;
  return json(200,{status:"checkout_ready",checkoutUrl:url});
};
