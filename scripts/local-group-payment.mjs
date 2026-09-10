// De groepsbetaling lokaal doorlopen, van betaallink tot bevestigingsmail.
//
//     node scripts/local-group-payment.mjs            → http://127.0.0.1:8791/
//     node scripts/local-group-payment.mjs --reseed   → nieuwe testboeking
//
// Wat hier echt is en wat niet:
//
//   * **`pay.mjs` en `stripe-webhook.mjs` zijn echt.** Dit script importeert de functies
//     zoals ze in productie draaien. Weigert de betaalpagina zonder vinkjes, dan weigert
//     ze dat hier ook, en om dezelfde reden.
//   * **De database is nagebootst.** Een JSON-bestand in `.local-data/` in plaats van
//     Supabase. De RPC's hieronder volgen `database/group-payment-confirmation.sql` regel
//     voor regel; loopt dat uiteen, dan is de proef hier niets waard. De SQL zelf kan hier
//     niet gedraaid worden — er staat geen PostgreSQL op deze Mac. Zie
//     `operations/testplan-groepsbetaling.md`.
//   * **Stripe is nagebootst.** Er wordt niets aangemaakt en niets afgeschreven. Een
//     "betaling" is een knop die de webhook aanroept met een geldig ondertekend nepverzoek.
//   * **De mails worden niet verstuurd.** Ze worden onderschept en op de pagina gezet, met
//     ontvanger en bijlagen erbij. Juist wie welke mail krijgt is wat hier fout kan gaan.
//
// **De betaalpoort staat hier open, en alleen hier.** Dat gebeurt met omgevingswaarden in
// dit proces; `PUBLISHED_TERMS_VERSION` in `_booking-config.mjs` blijft leeg en op productie
// verandert er niets. Zonder die openstand valt er niets te doorlopen.
//
// Het luistert alleen op 127.0.0.1, raakt geen productiegegeven aan en stuurt niets weg.

import {createHmac,randomUUID} from "node:crypto";
import {existsSync,mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {extname,join} from "node:path";
import {fileURLToPath} from "node:url";
import http from "node:http";

const WORTEL=fileURLToPath(new URL("..",import.meta.url));
const DATA=join(WORTEL,".local-data");
const BESTAND=join(DATA,"group-payment.json");
const POORT=Number(process.env.PORT||8791);
const BASIS=`http://127.0.0.1:${POORT}`;
const reseed=process.argv.includes("--reseed");
if(!existsSync(DATA))mkdirSync(DATA,{recursive:true});

// ── De omgeving ───────────────────────────────────────────────────────────────
// `localTestOverridesAllowed()` in _booking-config.mjs eist NODE_ENV=test én een URL op
// 127.0.0.1. Alleen dan mogen de voorwaardenversie en de documenten uit de omgeving komen
// in plaats van uit de lege constanten. Dat is precies de sluis die op productie dicht zit.
process.env.LEWOS_PREVIEW_SAFE="true";
process.env.NODE_ENV="test";
process.env.URL=BASIS;
process.env.SUPABASE_URL=BASIS;
process.env.SUPABASE_SERVICE_ROLE_KEY="lokaal-geen-echte-sleutel";
process.env.STRIPE_SECRET_KEY="sk_test_lokaal_nooit_echt";
process.env.STRIPE_WEBHOOK_SECRET="whsec_lokaal";
process.env.RESEND_API_KEY="re_lokaal";
process.env.TAVERN_FROM_EMAIL="tavern@example.invalid";
process.env.TAVERN_PAYMENTS_ENABLED="true";
process.env.BOOKING_TERMS_VERSION="lokaal-doorloop-v1";
process.env.BOOKING_TERMS_DOCUMENT_URL="/documents/terms.pdf";
process.env.TRAVEL_INFORMATION_DOCUMENT_URL="/documents/travel.pdf";
process.env.LEWOS_GENERAL_EMAIL="lewos.co@gmail.com";
process.env.FONTECHA_ACCOMMODATION_EMAIL="accommodatie@example.invalid";
delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;   // de agenda heeft eigen tests

// ── De nagebootste database ───────────────────────────────────────────────────
const PRIJS=202500;
const zaad=()=>{
  const claimId=randomUUID();
  const gasten=[
    ["TEST – Anna","anna@example.invalid"],
    ["TEST – Bram","bram@example.invalid"],
    ["TEST – Chloë","chloe@example.invalid"],
    ["TEST – Diederik","diederik@example.invalid"]
  ];
  return {
    weekend:{slug:"weekend-01",label:"The Halloween Table",date_label:"30 Oct to 2 Nov 2026",
      starts_on:"2026-10-30",ends_on:"2026-11-02",price_cents:PRIJS,capacity:6},
    claim:{id:claimId,name:"TEST – Anna",email:"anna@example.invalid",party_size:4,
      status:"payment_pending",hold_phase:"payment",
      // Twee uur, niet dertig minuten. De echte betaalfase begint op dertig, maar met de
      // verlengingen uit admin.sql kan hij tot twee uur lopen -- dus dit is een geldige
      // stand en geen verzinsel. Het geeft je de tijd om rustig door te klikken. Het gedrag
      // rond het verstrijken van de deadline heeft zijn eigen tests.
      hold_expires_at:new Date(Date.now()+120*60000).toISOString(),
      dietary_notes:"TEST – noten bij Chloë",message:null,extra_nights:null,
      // Een aangevraagde extra nacht vooraf: aankomst op de maandag voor het weekend. Dat
      // is een aanvraag en geen reservering, dus `arrival_date` blijft leeg tot de
      // accommodatie hem toezegt. Zo is in de doorloop te zien dat de mail aan de
      // accommodatie hem onder NOT YET CONFIRMED zet en de agenda hem buiten de afspraak
      // houdt.
      requested_arrival:"2026-10-26",requested_departure:null,
      extra_nights_status:"requested",arrival_date:null,departure_date:null,
      accommodation_email_sent_at:null,special_requirements_email_sent_at:null},
    deelnemers:gasten.map(([naam,email],i)=>({
      id:randomUUID(),claim_id:claimId,full_name:naam,email,amount_cents:PRIJS,
      status:"awaiting_payment",
      payment_reference:"tav_"+randomUUID().replace(/-/g,"")+randomUUID().replace(/-/g,""),
      checkout_session_id:null,checkout_session_url:null,paid_at:null,
      adult_confirmed_at:null,privacy_accepted_at:null,filming_acknowledged_at:null,
      terms_version:null,confirmation_email_sent_at:null,confirmation_email_provider_id:null,
      created_at:new Date(Date.now()+i).toISOString()})),
    mails:[]
  };
};
let db=(!reseed&&existsSync(BESTAND))?JSON.parse(readFileSync(BESTAND,"utf8")):zaad();
const bewaar=()=>writeFileSync(BESTAND,JSON.stringify(db,null,2));
bewaar();

const filmenVerplicht=slug=>slug==="weekend-01";   // public.tavern_media_agreement_required
const zoekDeelnemer=ref=>db.deelnemers.find(p=>p.payment_reference===String(ref||"").trim());
const weekendLabel=()=>`${db.weekend.label} · ${db.weekend.date_label}`;

// Elke RPC hieronder is een transcriptie van de bijbehorende SQL-functie. De takken staan in
// dezelfde volgorde, met dezelfde statussen, zodat een verschil opvalt.
const RPCS={
  tavern_payment_request({p_reference}){
    if(!p_reference||String(p_reference).trim().length<8)return {status:"not_found"};
    const p=zoekDeelnemer(p_reference);
    if(!p)return {status:"not_found"};
    const c=db.claim;
    if(p.status==="paid")return {status:"already_paid",fullName:p.full_name,amountCents:p.amount_cents};
    if(p.status==="cancelled"||["cancelled","expired"].includes(c.status))return {status:"cancelled"};
    if(!c.hold_expires_at||new Date(c.hold_expires_at)<=new Date())
      return {status:"expired",fullName:p.full_name};
    return {status:"ok",participantId:p.id,fullName:p.full_name,amountCents:p.amount_cents,
      deadline:c.hold_expires_at,bookingName:c.name,weekendLabel:weekendLabel(),
      filmingRequired:filmenVerplicht(db.weekend.slug),
      confirmationsRecorded:Boolean(p.adult_confirmed_at&&p.privacy_accepted_at&&p.terms_version),
      checkoutSessionId:p.checkout_session_id,checkoutSessionUrl:p.checkout_session_url};
  },
  record_participant_confirmations({p_reference,p_terms_version,p_adult_confirmed,p_privacy_accepted,p_filming_acknowledged}){
    const p=zoekDeelnemer(p_reference);
    if(!p)return {status:"not_found"};
    if(p.status==="paid")return {status:"already_paid"};
    if(p.status==="cancelled")return {status:"cancelled"};
    const c=db.claim;
    if(["cancelled","expired"].includes(c.status))return {status:"cancelled"};
    if(!c.hold_expires_at||new Date(c.hold_expires_at)<=new Date())return {status:"expired"};
    const filmen=filmenVerplicht(db.weekend.slug);
    if(p_adult_confirmed!==true||p_privacy_accepted!==true)return {status:"confirmations_required"};
    if(filmen&&p_filming_acknowledged!==true)return {status:"confirmations_required"};
    if(!String(p_terms_version||"").trim())return {status:"terms_version_missing"};
    p.adult_confirmed_at=p.adult_confirmed_at||new Date().toISOString();
    p.privacy_accepted_at=p.privacy_accepted_at||new Date().toISOString();
    if(filmen)p.filming_acknowledged_at=p.filming_acknowledged_at||new Date().toISOString();
    p.terms_version=String(p_terms_version).trim();
    bewaar();
    return {status:"recorded",participantId:p.id,filmingRequired:filmen,termsVersion:p.terms_version};
  },
  attach_participant_checkout_session({p_reference,p_session_id,p_session_url}){
    const p=zoekDeelnemer(p_reference);
    if(!p)return {status:"not_found"};
    if(p.status==="paid")return {status:"already_paid"};
    if(!p.adult_confirmed_at||!p.privacy_accepted_at||!p.terms_version)
      return {status:"confirmations_required"};
    if(p.checkout_session_id)return {status:"already_attached",
      checkoutSessionId:p.checkout_session_id,checkoutSessionUrl:p.checkout_session_url};
    p.checkout_session_id=p_session_id;p.checkout_session_url=p_session_url;bewaar();
    return {status:"attached",checkoutSessionId:p_session_id,checkoutSessionUrl:p_session_url};
  },
  confirm_tavern_payment(){return {status:"unknown_payment"};},   // een claim heeft hier geen kenmerk
  confirm_participant_payment({p_payment_reference,p_paid_at}){
    const p=zoekDeelnemer(p_payment_reference);
    if(!p)return {status:"unknown_payment"};
    const c=db.claim,w=db.weekend;
    const gemeen={participantId:p.id,claimId:c.id,name:p.full_name,email:p.email,
      amountCents:p.amount_cents,weekend:w.slug,weekendLabel:weekendLabel(),
      // Het bevestigde verblijf, net als in de echte functie: leeg betekent het weekend zelf.
      arrivalDate:c.arrival_date||w.starts_on,departureDate:c.departure_date||w.ends_on,
      termsVersion:p.terms_version};
    if(p.status==="paid")return {status:"paid",...gemeen,paidAt:p.paid_at,
      filmingRequired:filmenVerplicht(w.slug),bookingComplete:c.status==="paid",
      confirmationEmailSent:Boolean(p.confirmation_email_sent_at)};
    if(p.status==="cancelled")return {status:"cancelled",participantId:p.id};
    if(!c.hold_expires_at||!p_paid_at
       ||new Date(p_paid_at)>new Date(new Date(c.hold_expires_at).getTime()+5*60000))
      return {status:"expired",participantId:p.id,claimId:c.id};
    p.status="paid";p.paid_at=p_paid_at||new Date().toISOString();
    const open=db.deelnemers.filter(x=>x.status!=="paid").length;
    const rond=open===0;
    if(rond){c.status="paid";c.hold_phase="confirmed";c.hold_expires_at=null;}
    bewaar();
    return {status:"paid",...gemeen,paidAt:p.paid_at,bookingComplete:rond,outstanding:open,
      filmingRequired:filmenVerplicht(w.slug),confirmationEmailSent:false,
      booking:rond?{status:"paid",claimId:c.id,name:c.name,email:c.email,seats:c.party_size,
        weekendLabel:weekendLabel(),
        arrivalDate:c.arrival_date||w.starts_on,departureDate:c.departure_date||w.ends_on,
        weekendStart:w.starts_on,weekendEnd:w.ends_on,
        requestedArrival:c.requested_arrival,requestedDeparture:c.requested_departure,
        extraNightsStatus:c.extra_nights_status,dietaryNotes:c.dietary_notes,
        notes:c.message,extraNights:c.extra_nights,termsVersion:p.terms_version}:null};
  },
  mark_participant_confirmation_email_sent({p_payment_reference,p_provider_id}){
    const p=zoekDeelnemer(p_payment_reference);
    if(!p)return {status:"not_found"};
    if(p.confirmation_email_sent_at)return {status:"marked",participantId:p.id,
      providerId:p.confirmation_email_provider_id};
    p.confirmation_email_sent_at=new Date().toISOString();
    p.confirmation_email_provider_id=p_provider_id||null;bewaar();
    return {status:"marked",participantId:p.id,providerId:p_provider_id};
  },
  mark_tavern_notification_sent_by_claim({p_claim_id,p_kind,p_provider_id}){
    if(!["accommodation","special"].includes(p_kind))throw new Error("unknown_notification_kind");
    if(db.claim.id!==p_claim_id)return {status:"unknown_booking"};
    const veld=p_kind==="accommodation"?"accommodation_email_sent_at":"special_requirements_email_sent_at";
    db.claim[veld]=db.claim[veld]||new Date().toISOString();bewaar();
    return {status:"marked",claimId:p_claim_id};
  }
};

// ── Stripe en Resend onderscheppen ────────────────────────────────────────────
const nativeFetch=globalThis.fetch;
globalThis.fetch=(input,options)=>{
  const url=String(input);
  if(url.startsWith("https://api.stripe.com/")){
    const sleutel=String(options?.headers?.["idempotency-key"]||randomUUID());
    return Promise.resolve(new Response(JSON.stringify(
      {id:`cs_lokaal_${sleutel.slice(0,18)}`,url:`${BASIS}/nep-stripe/?ref=${sleutel}`}),
      {status:200,headers:{"content-type":"application/json"}}));
  }
  if(url.startsWith("https://api.resend.com/")){
    const inhoud=JSON.parse(String(options?.body||"{}"));
    db.mails.push({op:new Date().toISOString(),aan:(inhoud.to||[]).join(", "),
      onderwerp:inhoud.subject,bijlagen:(inhoud.attachments||[]).map(a=>a.filename),
      tekst:String(inhoud.text||"").slice(0,900),html:String(inhoud.html||"")});
    bewaar();
    return Promise.resolve(new Response(JSON.stringify({id:`mail_${db.mails.length}`}),
      {status:200,headers:{"content-type":"application/json"}}));
  }
  return nativeFetch(input,options);
};

const {handler:payHandler}=await import("../netlify/functions/pay.mjs");
const {handler:webhookHandler}=await import("../netlify/functions/stripe-webhook.mjs");
const {buildPaymentRequestEmail}=await import("../netlify/functions/_payment-request.mjs");

// ── Het overzicht ─────────────────────────────────────────────────────────────
const bedrag=c=>`€${(c/100).toLocaleString("en-IE",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
let laatsteWebhook="";
const overzicht=()=>{
  const LAATSTE_WEBHOOK=laatsteWebhook
    ?(laatsteWebhook==="geen sessie"
        ?`<p class="let">Er is voor die deelnemer nog geen betaalsessie. Doorloop eerst de
           betaalpagina: zonder sessie zou Stripe nooit een webhook sturen.</p>`
        :`<p class="stand">Laatste webhook: <strong>HTTP ${laatsteWebhook}</strong>${laatsteWebhook==="200"?" — vastgelegd":" — Stripe zou het opnieuw proberen"}</p>`)
    :"";
  const rijen=db.deelnemers.map(p=>{
    const bevestigd=p.adult_confirmed_at?"✔":"—";
    const knop=p.status==="paid"?"<em>betaald</em>"
      :`<a class="k" href="/tavern/pay/?ref=${p.payment_reference}">betaalpagina openen</a>`
        +`<a class="k grijs" href="/proefmail?ref=${p.payment_reference}">betaalverzoek bekijken</a>`
        +(p.checkout_session_id
          ?`<a class="k grijs" href="/simuleer/betaling?ref=${p.payment_reference}">Stripe-betaling simuleren</a>`
          :`<br><small>eerst de betaalpagina doorlopen — zonder sessie stuurt Stripe geen webhook</small>`);
    return `<tr><td>${p.full_name}<br><small>${p.email}</small></td>
      <td>${bedrag(p.amount_cents)}</td><td>${p.status}</td>
      <td>${bevestigd}</td><td>${p.terms_version||"—"}</td><td>${knop}</td></tr>`;
  }).join("");
  const mails=db.mails.length?db.mails.map(m=>
    `<tr><td>${m.aan}</td><td>${m.onderwerp}</td><td>${m.bijlagen.join(", ")||"—"}</td>
      <td><pre>${m.tekst.replace(/[<>&]/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;"}[c]))}</pre></td></tr>`).join("")
    :`<tr><td colspan="4"><em>nog geen mail onderschept</em></td></tr>`;
  return `<!doctype html><meta charset="utf-8"><title>Groepsbetaling — lokale doorloop</title>
<style>
/* Expliciete achtergrond én kleur. Zonder achtergrond erft deze pagina het donkere thema
   van de browser en staat donkergroene tekst op zwart. Dit is een intern hulpmiddel, dus
   het kiest bewust één vaste look in plaats van mee te bewegen. */
:root{color-scheme:light}
html,body{background:#F7F3EC}
body{font:15px/1.6 -apple-system,Arial,sans-serif;max-width:1100px;margin:0 auto;padding:2rem 1rem;color:#0F3B35}
h1{font-size:1.7rem;margin:0 0 .2em}table{border-collapse:collapse;width:100%;margin:1.2em 0}
th,td{border-top:1px solid #d8d0c2;padding:.55em .5em;text-align:left;vertical-align:top;font-size:.92rem;color:#0F3B35}
th{font-size:.78rem;text-transform:uppercase;letter-spacing:.06em;color:#6B6F72}
em{color:#6B6F72}h2{font-size:1.15rem;margin-top:1.8em}
a:not(.k){color:#B4472A}
.k{display:inline-block;background:#E5643A;color:#fff;text-decoration:none;padding:.35em .7em;border-radius:6px;font-size:.85rem;margin:.1em .2em .1em 0}
.grijs{background:#6B6F72}pre{margin:0;white-space:pre-wrap;font-size:.8rem;color:#4B2E20;background:#fff;border:1px solid #e6ded0;border-radius:5px;padding:.5em .6em;max-height:14em;overflow:auto}
.let{background:#FDF3E7;border-left:4px solid #E5643A;padding:.7em 1em;margin:1em 0}
.stand{background:#EDE6DA;padding:.7em 1em;border-radius:8px;color:#0F3B35}
.let{color:#0F3B35}</style>
<h1>Groepsbetaling — lokale doorloop</h1>
${LAATSTE_WEBHOOK}
<p class="let"><strong>Niets hiervan is echt.</strong> De database is een JSON-bestand, Stripe is nagebootst en er wordt geen mail verstuurd.
<code>pay.mjs</code> en <code>stripe-webhook.mjs</code> zijn wél de echte functies. De SQL is hier niet gedraaid — dat kan alleen op de preview-branch.</p>
<p class="stand"><strong>Boeking:</strong> ${db.claim.name} · ${db.claim.party_size} gasten · ${weekendLabel()}<br>
<strong>Status:</strong> ${db.claim.status} · fase ${db.claim.hold_phase} ·
betalen tot ${db.claim.hold_expires_at||"—"}<br>
<strong>Accommodatie gemeld:</strong> ${db.claim.accommodation_email_sent_at||"nog niet"} ·
<strong>Bijzonderheden gemeld:</strong> ${db.claim.special_requirements_email_sent_at||"nog niet"}</p>
<h2>De vier deelnemers</h2>
<table><tr><th>Gast</th><th>Aandeel</th><th>Status</th><th>Bevestigd</th><th>Voorwaardenversie</th><th></th></tr>${rijen}</table>
<p><a class="k grijs" href="/simuleer/opnieuw">nieuwe testboeking</a></p>
<h2>Onderschepte mails (${db.mails.length})</h2>
<table><tr><th>Aan</th><th>Onderwerp</th><th>Bijlagen</th><th>Tekst</th></tr>${mails}</table>`;
};

// ── De server ─────────────────────────────────────────────────────────────────
const MIME={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",
  ".js":"text/javascript; charset=utf-8",".svg":"image/svg+xml",".png":"image/png",
  ".jpg":"image/jpeg",".webp":"image/webp",".json":"application/json",".pdf":"application/pdf"};

http.createServer(async(req,res)=>{
  const url=new URL(req.url,BASIS);
  const stuur=(code,body,type="text/html; charset=utf-8")=>
    res.writeHead(code,{"content-type":type,"cache-control":"no-store"}).end(body);

  let body="";
  if(req.method==="POST")await new Promise(r=>{req.on("data",c=>body+=c);req.on("end",r);});

  // De nagebootste database
  if(url.pathname.startsWith("/rest/v1/rpc/")){
    const naam=url.pathname.split("/").pop();
    if(!RPCS[naam])return stuur(404,JSON.stringify({message:`onbekende rpc: ${naam}`}),"application/json");
    try{return stuur(200,JSON.stringify(RPCS[naam](JSON.parse(body||"{}"))),"application/json");}
    catch(fout){return stuur(500,JSON.stringify({message:String(fout.message)}),"application/json");}
  }

  // De twee documenten die aan de bevestigingsmail hangen
  if(url.pathname==="/documents/terms.pdf"||url.pathname==="/documents/travel.pdf")
    return stuur(200,Buffer.from(`%PDF-1.4\n% lokale doorloop, geen echt document\n${"x".repeat(300)}`),"application/pdf");

  // De echte betaalfunctie
  if(url.pathname==="/api/pay"){
    const uit=await payHandler({httpMethod:req.method,path:"/api/pay",headers:{},
      queryStringParameters:Object.fromEntries(url.searchParams),body:body||undefined});
    return stuur(uit.statusCode,uit.body,"application/json");
  }

  // Een "betaling": de echte webhook, met een geldig ondertekend nepverzoek
  if(url.pathname==="/simuleer/betaling"){
    const ref=url.searchParams.get("ref")||"";
    // Stripe stuurt alleen een webhook als er een sessie bestond, en een sessie bestaat
    // alleen als de bevestigingen zijn vastgelegd. Zonder die grens zou je hier een
    // toestand kunnen maken die in werkelijkheid niet kan voorkomen, en dan bewijst de
    // doorloop niets.
    const deel=zoekDeelnemer(ref);
    if(!deel?.checkout_session_id){
      laatsteWebhook="geen sessie";
      return res.writeHead(303,{location:"/","cache-control":"no-store"}).end();
    }
    const payload=JSON.stringify({type:"checkout.session.completed",
      created:Math.floor(Date.now()/1000),
      data:{object:{payment_status:"paid",metadata:{payment_reference:ref}}}});
    const t=Math.floor(Date.now()/1000);
    const sig=createHmac("sha256",process.env.STRIPE_WEBHOOK_SECRET).update(`${t}.${payload}`).digest("hex");
    const uit=await webhookHandler({httpMethod:"POST",
      headers:{"stripe-signature":`t=${t},v1=${sig}`},body:payload});
    laatsteWebhook=String(uit.statusCode);
    return res.writeHead(303,{location:"/","cache-control":"no-store"}).end();
  }
  // Het betaalverzoek zoals het eruitziet. Robert, 10 september 2026: Gmail haalde de
  // achtergrond van de knop weg en zette er zijn eigen omleidingswaarschuwing voor de link
  // tussen. Dat is Gmail en niet onze mail -- dus hier staat hij zonder mailprogramma
  // ertussen, met een knop die rechtstreeks naar de betaalpagina gaat.
  if(url.pathname==="/proefmail"){
    const deel=zoekDeelnemer(url.searchParams.get("ref")||"");
    if(!deel)return stuur(404,"<p>onbekende deelnemer</p>");
    const c=db.claim;
    const mail=buildPaymentRequestEmail({
      participant:deel,
      booking:{name:c.name,weekendLabel:weekendLabel(),seats:c.party_size},
      deadline:c.hold_expires_at,
      paymentUrl:`${BASIS}/tavern/pay/?ref=${deel.payment_reference}`
    });
    return stuur(200,`<!doctype html><meta charset="utf-8"><title>Betaalverzoek — ${deel.full_name}</title>
<style>:root{color-scheme:light}html,body{background:#F7F3EC;margin:0}
.blad{max-width:640px;margin:2rem auto;background:#fff;padding:1.6rem 1.8rem;border:1px solid #e6ded0;border-radius:10px}
.terug{display:block;max-width:640px;margin:1rem auto 0;font:14px/1.5 Arial,sans-serif;color:#B4472A}</style>
<a class="terug" href="/">&larr; terug naar het overzicht</a>
<div class="blad"><p style="font:13px/1.5 Arial,sans-serif;color:#6B6F72;margin:0 0 1.2em">
Aan: ${deel.email} &middot; Onderwerp: ${mail.subject}</p>${mail.html}</div>`);
  }

  if(url.pathname==="/simuleer/opnieuw"){db=zaad();bewaar();return res.writeHead(303,{location:"/"}).end();}
  if(url.pathname==="/nep-stripe/")
    return stuur(200,`<!doctype html><meta charset="utf-8"><title>Nagebootste Stripe</title>
      <body style="font:15px/1.6 Arial;max-width:640px;margin:3rem auto;padding:0 1rem">
      <h1>Dit zou Stripe zijn</h1><p>Er is niets aangemaakt en niets afgeschreven. De betaalpagina
      heeft een sessie aangevraagd en de echte <code>pay.mjs</code> heeft die geleverd.</p>
      <p>Gebruik op het overzicht <strong>Stripe-betaling simuleren</strong> om de webhook te laten lopen.</p>
      <p><a href="/">terug naar het overzicht</a></p>`);

  if(url.pathname==="/")return stuur(200,overzicht());

  // De site zelf
  let pad=url.pathname.endsWith("/")?url.pathname+"index.html":url.pathname;
  const bestand=join(WORTEL,pad);
  if(!bestand.startsWith(WORTEL))return stuur(403,"nee","text/plain");
  try{return stuur(200,readFileSync(bestand),MIME[extname(bestand)]||"application/octet-stream");}
  catch{return stuur(404,"404","text/plain");}
}).listen(POORT,"127.0.0.1",()=>{
  console.log(`\nGroepsbetaling — lokale doorloop op ${BASIS}/`);
  console.log("De database is een JSON-bestand, Stripe en de mails zijn nagebootst.");
  console.log("pay.mjs en stripe-webhook.mjs zijn de echte functies.\n");
});
