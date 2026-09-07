// De beheeromgeving lokaal draaien, met fictieve boekingen die een herstart overleven.
//
//     node scripts/local-admin-server.mjs            → http://127.0.0.1:8790/admin/
//     node scripts/local-admin-server.mjs --reseed   → gooit de testgegevens weg en zet ze opnieuw
//
// Wat hier echt is en wat niet:
//
//   * **De autorisatie is echt.** De handtekening van het token wordt gecontroleerd, het
//     adres moet in `LEWOS_ADMIN_EMAILS` staan én in de `lewos_admins`-lijst van de
//     database. Dezelfde functie, dezelfde drie sloten als in productie.
//   * **De identiteitsprovider is nagebootst.** In productie tekent Supabase Auth het
//     token na een magische link; hier tekent dit script het met een lokaal geheim, zodat
//     er geen mail de deur uit hoeft. Dat is het enige verschil in het inlogpad — en het
//     is bewust het enige, want juist de controle wil je echt testen.
//   * **De database is nagebootst.** Een JSON-bestand in `.local-data/` in plaats van
//     Supabase. De twee leesfuncties hieronder volgen `database/admin.sql` regel voor
//     regel; loopt dat uiteen, dan is de proef hier niets waard.
//
// Er wordt niets verstuurd, niets betaald, geen agenda-afspraak gemaakt en geen
// productiegegeven aangeraakt. Het luistert alleen op 127.0.0.1.

import {createHmac,generateKeyPairSync,randomBytes,randomUUID} from "node:crypto";
import {stayWindow} from "../assets/stay.js";
import {existsSync,mkdirSync,readFileSync,rmSync,writeFileSync} from "node:fs";
import {extname,join,normalize} from "node:path";
import {fileURLToPath} from "node:url";
import http from "node:http";
import {groupPaymentState,groupProgressLabel,PHASE_LABELS} from "../netlify/functions/_group-payment.mjs";
import {FILLING_WINDOW_MINUTES,HOLD_PHASES,adminAvailability,holdState} from "../netlify/functions/_seat-hold.mjs";
import {buildOperatorNoticeEmail,buildPaymentRequestEmail} from "../netlify/functions/_payment-request.mjs";
import {readdirSync} from "node:fs";


const WORTEL=fileURLToPath(new URL("..",import.meta.url));
const DATA=join(WORTEL,".local-data");
const BESTAND=join(DATA,"admin-bookings.json");
const GEHEIM=join(DATA,"local-jwt-secret");
const POORT=Number(process.env.PORT||8790);
const reseed=process.argv.includes("--reseed");

if(!existsSync(DATA))mkdirSync(DATA,{recursive:true});
if(!existsSync(GEHEIM))writeFileSync(GEHEIM,randomBytes(48).toString("hex"),{mode:0o600});
const jwtGeheim=readFileSync(GEHEIM,"utf8").trim();

// ── De toegestane adressen ───────────────────────────────────────────────────
const ADMINS=[
  {email:"lewos.co@gmail.com",display_name:"Robert Neugebauer",role:"admin"},
  {email:"accommodatie@example.invalid",display_name:"TEST – Accommodatie",role:"accommodation"}
];

// ── Fictieve boekingen ───────────────────────────────────────────────────────
// Allemaal duidelijk als test herkenbaar. De eerste is de boeking die al in de agenda
// staat; de rest is er om kalender, lijsten en statussen te kunnen beoordelen.
const PRIJS=202500;
// De betaalfasen hangen aan de klok. Om ze alle vier te kunnen zien krijgen de fictieve
// groepen een aanmaakmoment ten opzichte van het zaaien: 5 minuten geleden loopt nog, 45
// minuten geleden zit in de verlenging, 100 in de laatste, 200 in "Actie nodig".
// `--reseed` zet ze terug, want ze verouderen vanzelf.
const geleden=minuten=>new Date(Date.now()-minuten*60000).toISOString();
const zaad=()=>{
  const groep=(naam,emails,betaald)=>emails.map((e,i)=>({
    id:randomUUID(),full_name:e.naam,email:e.email,amount_cents:PRIJS,
    status:i<betaald?"paid":"awaiting_payment",
    payment_reference:`test-ref-${naam}-${i+1}`,
    checkout_session_url:`https://checkout.stripe.test/TEST-${naam}-${i+1}`,
    paid_at:i<betaald?"2026-09-01T10:0"+i+":00Z":null,
    payment_link_sent_at:"2026-08-30T09:00:00Z",created_at:`2026-08-30T09:0${i}:00Z`}));

  return {
    weekends:[
      {slug:"weekend-01",label:"Weekend 01",date_label:"30 Oct to 2 Nov 2026",starts_on:"2026-10-30",ends_on:"2026-11-02"},
      {slug:"weekend-02",label:"Weekend 02",date_label:"6 to 9 Nov 2026",starts_on:"2026-11-06",ends_on:"2026-11-09"},
      {slug:"weekend-03",label:"TEST Weekend 03",date_label:"13 to 16 Nov 2026",starts_on:"2026-11-13",ends_on:"2026-11-16"},
      {slug:"weekend-04",label:"TEST Weekend 04",date_label:"20 to 23 Nov 2026",starts_on:"2026-11-20",ends_on:"2026-11-23"}
    ],
    claims:[
      {
        id:"test-lewos-boeking-weekend-02",name:"TEST – Lewos boeking",email:"test-lewos-boeking@example.invalid",
        party_size:2,weekend:"weekend-02",status:"paid",
        // Een openstaande aanvraag: één nacht ervoor en één erna, nog niet toegezegd.
        // Het bevestigde verblijf blijft daarom het weekend zelf (6 t/m 9 november).
        arrival_date:null,departure_date:null,
        requested_arrival:"2026-11-05",requested_departure:"2026-11-10",
        extra_nights_status:"requested",
        extra_nights:"One night before (Thu 5 Nov) and one night after (Mon 9 Nov). Five nights in total.",
        allergies:null,dietary_requirements:null,message:null,price_cents:PRIJS,terms_version:"local-test",
        created_at:geleden(200),consented_at:geleden(200),
        receipt_email_sent_at:"2026-08-28T12:00:05Z",receipt_email_provider_id:"local-test-receipt",
        confirmation_email_sent_at:"2026-09-01T10:02:00Z",confirmation_email_provider_id:"local-test-confirmation",
        accommodation_email_sent_at:"2026-09-01T10:02:04Z",accommodation_email_provider_id:"local-test-accommodation",
        special_requirements_email_sent_at:null,special_requirements_email_provider_id:null,
        checkout_token_hash:"x",invitation_sent_at:"2026-08-31T08:00:00Z",invitation_email_provider_id:"local-test-invite",
        participants:groep("lewos",[
          {naam:"TEST – Ana Ruiz",email:"test-ana@example.invalid"},
          {naam:"TEST – Bram de Wit",email:"test-bram@example.invalid"}],2)
      },
      {
        id:"test-group-of-four",name:"TEST – Group of four",email:"test-group@example.invalid",
        party_size:4,weekend:"weekend-04",status:"payment_pending",
        arrival_date:"2026-11-20",departure_date:"2026-11-23",extra_nights:null,
        // Bewust nog in de twee oude kolommen: dit is de boeking waarmee te zien is dat
        // bestaande gegevens niet verloren gaan en niet dubbel komen te staan.
        allergies:"TEST DATA — severe peanut allergy, carries an EpiPen.",
        dietary_requirements:"TEST DATA — one vegetarian, one gluten-free.",
        dietary_notes:null,
        message:"Fictional booking. Arriving late on the Friday, around 21:00.",
        price_cents:PRIJS,terms_version:"local-test",
        created_at:geleden(45),consented_at:geleden(45),
        receipt_email_sent_at:"2026-08-29T09:00:06Z",receipt_email_provider_id:"local-test-receipt-2",
        confirmation_email_sent_at:null,accommodation_email_sent_at:null,
        special_requirements_email_sent_at:"2026-08-29T09:00:09Z",special_requirements_email_provider_id:"local-test-special",
        checkout_token_hash:"x",invitation_sent_at:"2026-08-31T08:00:00Z",invitation_email_provider_id:"local-test-invite-2",
        participants:groep("four",[
          {naam:"TEST – Carla Meijer",email:"test-carla@example.invalid"},
          {naam:"TEST – Daan Bakker",email:"test-daan@example.invalid"},
          {naam:"TEST – Elena Costa",email:"test-elena@example.invalid"},
          {naam:"TEST – Finn O'Neill",email:"test-finn@example.invalid"}],2)
      },
      {
        id:"test-three-awaiting",name:"TEST – Three awaiting payment",email:"test-three@example.invalid",
        party_size:3,weekend:"weekend-03",status:"payment_pending",
        arrival_date:null,departure_date:null,extra_nights:null,
        allergies:null,dietary_requirements:null,
        dietary_notes:"TEST DATA — vegan. One guest is allergic to shellfish (mild).",message:null,
        price_cents:PRIJS,terms_version:"local-test",
        created_at:geleden(5),consented_at:geleden(5),
        receipt_email_sent_at:"2026-09-02T14:00:04Z",receipt_email_provider_id:"local-test-receipt-3",
        confirmation_email_sent_at:null,accommodation_email_sent_at:null,special_requirements_email_sent_at:null,
        checkout_token_hash:null,invitation_sent_at:null,
        participants:groep("three",[
          {naam:"TEST – Gerd Jansen",email:"test-gerd@example.invalid"},
          {naam:"TEST – Hana Silva",email:"test-hana@example.invalid"},
          {naam:"TEST – Iris Lund",email:"test-iris@example.invalid"}],0)
      },
      {
        id:"test-final-extension",name:"TEST – Final extension",email:"test-final@example.invalid",
        party_size:4,weekend:"weekend-02",status:"payment_pending",
        arrival_date:"2026-11-06",departure_date:"2026-11-09",extra_nights:null,
        allergies:null,dietary_requirements:null,message:"Fictional booking — two guests still owe their share.",
        price_cents:PRIJS,terms_version:"local-test",
        created_at:geleden(100),consented_at:geleden(100),
        receipt_email_sent_at:geleden(99),receipt_email_provider_id:"local-test-receipt-5",
        confirmation_email_sent_at:null,accommodation_email_sent_at:null,special_requirements_email_sent_at:null,
        checkout_token_hash:"x",invitation_sent_at:geleden(99),invitation_email_provider_id:"local-test-invite-5",
        participants:groep("final",[
          {naam:"TEST – Joos Terp",email:"test-joos@example.invalid"},
          {naam:"TEST – Kira Halla",email:"test-kira@example.invalid"},
          {naam:"TEST – Luuk Vos",email:"test-luuk@example.invalid"},
          {naam:"TEST – Mira Peña",email:"test-mira@example.invalid"}],2)
      },
      {
        id:"test-first-access-hold",name:"TEST – First Access hold",email:"test-hold@example.invalid",
        party_size:2,weekend:"weekend-03",status:"first_access_held",
        arrival_date:null,departure_date:null,extra_nights:"Possibly one night before, to be confirmed.",
        allergies:null,dietary_requirements:null,message:"Fictional booking — no payment due yet.",
        price_cents:null,terms_version:null,
        created_at:geleden(100),consented_at:geleden(100),
        receipt_email_sent_at:"2026-09-03T11:00:03Z",receipt_email_provider_id:"local-test-receipt-4",
        confirmation_email_sent_at:null,accommodation_email_sent_at:null,special_requirements_email_sent_at:null,
        checkout_token_hash:null,invitation_sent_at:null,participants:[]
      }
    ]
  };
};

if(reseed&&existsSync(BESTAND))writeFileSync(BESTAND,JSON.stringify(zaad(),null,2));
if(!existsSync(BESTAND))writeFileSync(BESTAND,JSON.stringify(zaad(),null,2));
const db=()=>JSON.parse(readFileSync(BESTAND,"utf8"));

// ── De twee leesfuncties, exact zoals database/admin.sql ────────────────────
const isAdmin=email=>ADMINS.some(a=>a.email.toLowerCase()===String(email||"").trim().toLowerCase());

const betaalstand=claim=>{
  const p=claim.participants||[];
  // De fase komt uit dezelfde module die de webhook zou gebruiken. Loopt die hier uiteen,
  // dan is de lokale proef niets waard.
  const fase=p.length?groupPaymentState({createdAt:claim.payment_started_at||claim.created_at,participants:p,now:nu()}):null;
  const betaald=p.filter(x=>x.status==="paid").length;
  const verschuldigd=p.filter(x=>x.status!=="cancelled").length;
  if(!p.length)return {state:{paid:"paid",payment_pending:"awaiting_payment",expired:"expired",cancelled:"cancelled"}[claim.status]||"no_payment_due",
    participantsTotal:0,participantsPaid:0,participantsDue:0};
  return {state:verschuldigd>0&&betaald>=verschuldigd?"paid":betaald>0?"partially_paid"
      :claim.status==="expired"?"expired":claim.status==="cancelled"?"cancelled":"awaiting_payment",
    participantsTotal:p.length,participantsPaid:betaald,participantsDue:verschuldigd,
    phase:fase.phase,phaseLabel:PHASE_LABELS[fase.phase],progress:groupProgressLabel(fase),
    deadline:fase.deadline,minutesRemaining:fase.minutesRemaining,
    needsOperatorNotice:fase.notifyOperators,unpaidParticipants:fase.unpaidParticipants};
};

// **Bevestigd is niet aangevraagd.** `arrival_date` en `departure_date` zijn wat de
// accommodatie heeft toegezegd; staan ze leeg, dan is het verblijf het weekend zelf.
// De aanvraag staat er los naast en rekt het verblijf nooit op.
const verblijf=(claim,weekends)=>{
  const w=weekends.find(x=>x.slug===claim.weekend)||{};
  const bevestigd=claim.extra_nights_status==="confirmed";
  return {w,
    arrival:(bevestigd&&claim.arrival_date)||w.starts_on,
    departure:(bevestigd&&claim.departure_date)||w.ends_on,
    extraNightsStatus:claim.extra_nights_status||"none",
    requestedArrival:claim.requested_arrival||null,
    requestedDeparture:claim.requested_departure||null,
    weekendStart:w.starts_on,weekendEnd:w.ends_on};
};

const bookingsInRange=(email,van,tot)=>{
  if(!isAdmin(email))throw Object.assign(new Error("not_an_administrator"),{rpc:true});
  const {claims,weekends}=db();
  const rijen=claims
    .filter(c=>["first_access_held","payment_pending","paid"].includes(c.status))
    .map(c=>{
      const v=verblijf(c,weekends);
      return {claimId:c.id,name:c.name,seats:c.party_size,status:c.status,
        arrival:v.arrival,departure:v.departure,
        weekendSlug:v.w.slug,weekendLabel:v.w.label?`${v.w.label} · ${v.w.date_label}`:null,
        hasExtraNights:v.extraNightsStatus!=="none"||Boolean((c.extra_nights||"").trim()),
        extraNightsStatus:v.extraNightsStatus,
        requestedArrival:v.requestedArrival,requestedDeparture:v.requestedDeparture,
        payment:betaalstand(c)};
    })
    .filter(b=>b.arrival&&b.departure&&b.arrival<=tot&&b.departure>=van)
    .sort((a,b)=>a.arrival.localeCompare(b.arrival)||a.name.localeCompare(b.name));
  // De verdeling per weekend. Alleen hier: publiek is beschikbaarheid één getal.
  const weekendlijst=weekends.map(w=>{
    // `first_access_held` telt mee bij het uitgeven van stoelen, dus hoort hij ook in het
    // beheeroverzicht te staan. Stond hij er niet in, dan zag Robert meer vrije stoelen dan
    // er waren — en dat is precies het getal waar hij op stuurt.
    const holds=claims.filter(c=>c.weekend===w.slug&&["payment_pending","paid","filling","first_access_held"].includes(c.status))
      .map(c=>({phase:c.status==="filling"?HOLD_PHASES.filling:HOLD_PHASES.payment,
        holdStartedAt:c.hold_started_at||c.created_at,paymentStartedAt:c.created_at,
        participants:c.participants||[],seats:c.party_size}));
    return {slug:w.slug,label:`${w.label} · ${w.date_label}`,
      ...adminAvailability({capacity:6,minimumPaidGuests:4,holds})};
  });
  // Geen allergieën, geen dieetwensen, geen vrije tekst. Net als in de SQL.
  return {from:van,to:tot,bookings:rijen,weekends:weekendlijst};
};

const bookingDetail=(email,id)=>{
  if(!isAdmin(email))throw Object.assign(new Error("not_an_administrator"),{rpc:true});
  const {claims,weekends}=db();
  const c=claims.find(x=>x.id===id);
  if(!c)return {status:"not_found"};
  const {w,arrival,departure,extraNightsStatus,requestedArrival,requestedDeparture,weekendStart,weekendEnd}=verblijf(c,weekends);
  const bericht=(kind,label,sentAt,providerId,klaar)=>({kind,label,sentAt:sentAt||null,providerId:providerId||null,
    state:sentAt?"sent":klaar?"prepared":"example"});
  return {
    viewerRole:rolVan(email),
    claimId:c.id,name:c.name,email:c.email,seats:c.party_size,status:c.status,payment:betaalstand(c),
    weekendSlug:w.slug,weekendLabel:w.label?`${w.label} · ${w.date_label}`:null,arrival,departure,
    extraNights:c.extra_nights,
    extraNightsStatus,requestedArrival,requestedDeparture,weekendStart,weekendEnd,
    extraNightsDecidedAt:c.extra_nights_decided_at||null,extraNightsDecidedBy:c.extra_nights_decided_by||null,
    dietaryNotes:dieetTekst(c)||null,notes:c.message,
    priceCents:c.price_cents,termsVersion:c.terms_version,createdAt:c.created_at,consentedAt:c.consented_at,
    participants:(c.participants||[]).map(p=>({id:p.id,name:p.full_name,email:p.email,amountCents:p.amount_cents,
      status:p.status,paidAt:p.paid_at,hasPaymentLink:Boolean(p.checkout_session_url),paymentLinkSentAt:p.payment_link_sent_at})),
    messages:[
      bericht("receipt","Registration receipt (guest)",c.receipt_email_sent_at,c.receipt_email_provider_id,true),
      bericht("invitation","Payment window invitation (guest)",c.invitation_sent_at,c.invitation_email_provider_id,Boolean(c.checkout_token_hash)),
      bericht("confirmation","Booking confirmation (guest)",c.confirmation_email_sent_at,c.confirmation_email_provider_id,c.status==="paid"),
      bericht("accommodation","Accommodation notification",c.accommodation_email_sent_at,c.accommodation_email_provider_id,c.status==="paid"),
      bericht("special","Special requirements to Lewos",c.special_requirements_email_sent_at,c.special_requirements_email_provider_id,
        Boolean(dieetTekst(c)+(c.message||"")))
    ]
  };
};

// De aanvraag van de gast. Dezelfde toets als in `database/stay-dates.sql`: de datums
// worden aan het weekend gemeten, want daar staan de weekenddatums.
const zetVerblijfAanvraag=({p_claim_id,p_arrival,p_departure})=>{
  const data=db();
  const c=data.claims.find(x=>x.id===p_claim_id);
  if(!c)return {status:"not_found"};
  const w=data.weekends.find(x=>x.slug===c.weekend);
  if(!w?.starts_on)return {status:"no_weekend_dates"};
  const aankomst=p_arrival||w.starts_on, vertrek=p_departure||w.ends_on;
  if(aankomst>w.starts_on)throw Object.assign(new Error("stay_arrival_after_weekend"),{rpc:true});
  if(vertrek<w.ends_on)throw Object.assign(new Error("stay_departure_before_weekend"),{rpc:true});
  // Hetzelfde venster als `private.stay_window` in de database en `stayWindow` in de
  // browser. Staat het hier niet, dan bewijst een lokale proef niets over de grens.
  const venster=stayWindow({weekendStart:w.starts_on,weekendEnd:w.ends_on,
    weekends:data.weekends.map(x=>({startsOn:x.starts_on,endsOn:x.ends_on}))});
  if(venster&&aankomst<venster.from)throw Object.assign(new Error("stay_arrival_too_early"),{rpc:true});
  if(venster&&vertrek>venster.to)throw Object.assign(new Error("stay_departure_too_late"),{rpc:true});
  const nachten=(a,b)=>Math.round((Date.parse(b+"T12:00:00Z")-Date.parse(a+"T12:00:00Z"))/86400000);
  const voor=nachten(aankomst,w.starts_on), na=nachten(w.ends_on,vertrek);
  const extra=voor+na>0;
  // Wijzigen ná een bevestiging haalt die bevestiging weg: hij ging over andere nachten.
  const wijzigt=c.extra_nights_status==="confirmed"&&(c.arrival_date!==aankomst||c.departure_date!==vertrek);
  const rij=data.claims.find(x=>x.id===p_claim_id);
  rij.requested_arrival=extra?aankomst:null;
  rij.requested_departure=extra?vertrek:null;
  rij.extra_nights_status=extra?"requested":"none";
  if(wijzigt||!extra){rij.arrival_date=null;rij.departure_date=null;}
  bewaar(data);
  return {status:"ok",claimId:p_claim_id,weekendStart:w.starts_on,weekendEnd:w.ends_on,
    requestedArrival:extra?aankomst:null,requestedDeparture:extra?vertrek:null,
    nightsBefore:voor,nightsAfter:na,withdrewConfirmation:wijzigt,
    extraNightsStatus:extra?"requested":"none"};
};

// Het oordeel van de accommodatie.
const beslisExtraNachten=({p_email,p_claim_id,p_decision,p_arrival,p_departure,p_reason})=>{
  if(!isAdmin(p_email))throw Object.assign(new Error("not_an_administrator"),{rpc:true});
  const data=db();
  const c=data.claims.find(x=>x.id===p_claim_id);
  if(!c)return {status:"not_found"};
  if((c.extra_nights_status||"none")==="none")return {status:"nothing_requested"};
  const w=data.weekends.find(x=>x.slug===c.weekend);
  if(!w?.starts_on)return {status:"no_weekend_dates"};
  let aankomst=null,vertrek=null;
  if(p_decision==="confirmed"){
    aankomst=p_arrival||c.requested_arrival||w.starts_on;
    vertrek=p_departure||c.requested_departure||w.ends_on;
    if(aankomst>w.starts_on)throw Object.assign(new Error("stay_arrival_after_weekend"),{rpc:true});
    if(vertrek<w.ends_on)throw Object.assign(new Error("stay_departure_before_weekend"),{rpc:true});
    // Meer bevestigen dan gevraagd is geen bevestiging maar een nieuwe boeking.
    if(aankomst<(c.requested_arrival||w.starts_on)||vertrek>(c.requested_departure||w.ends_on))
      throw Object.assign(new Error("stay_more_than_requested"),{rpc:true});
  }
  const rij=data.claims.find(x=>x.id===p_claim_id);
  rij.extra_nights_status=p_decision;
  rij.arrival_date=p_decision==="confirmed"?aankomst:null;
  rij.departure_date=p_decision==="confirmed"?vertrek:null;
  rij.extra_nights_decided_at=nu().toISOString();
  rij.extra_nights_decided_by=String(p_email).toLowerCase();
  (data.adminActions||=[]).push({actor:p_email,action:`extra_nights_${p_decision}`,claimId:p_claim_id,
    reason:p_reason||null,at:nu().toISOString()});
  bewaar(data);
  return {status:"ok",claimId:p_claim_id,decision:p_decision,confirmedArrival:aankomst,confirmedDeparture:vertrek};
};

// ── De lokale postbus ────────────────────────────────────────────────────────
// Er gaat niets de deur uit. De mails worden met de échte bouwfunctie opgebouwd en als
// bestand weggeschreven, zodat ze te bekijken zijn op /outbox/. Alleen de bezorging is
// vervangen; de inhoud is productiecode.
const OUTBOX=join(DATA,"outbox");
if(!existsSync(OUTBOX))mkdirSync(OUTBOX,{recursive:true});
let postTeller=0;
const inPostbus=(mail,soort)=>{
  postTeller+=1;
  const naam=`${String(postTeller).padStart(3,"0")}-${soort}-${String(mail.to||"operators").replace(/[^a-z0-9]+/gi,"-")}`;
  writeFileSync(join(OUTBOX,`${naam}.html`),
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${mail.subject.replace(/[<>&]/g,"")}</title>`
    +`<style>html{color-scheme:light}body{margin:0;padding:24px;background:#fff;font:15px/1.6 system-ui}`
    +`.kop{margin:-24px -24px 24px;padding:14px 24px;background:#0F3B35;color:#F7F3EC;font:13px/1.5 system-ui}`
    +`</style></head><body><div class="kop"><strong>To:</strong> ${mail.to||"lewos.co@gmail.com, accommodatie@example.invalid"}`
    +`<br><strong>Subject:</strong> ${mail.subject}<br><em>Local preview — not sent.</em></div>${mail.html}</body></html>`,"utf8");
  writeFileSync(join(OUTBOX,`${naam}.txt`),`To: ${mail.to||"operators"}\nSubject: ${mail.subject}\n\n${mail.text}`,"utf8");
  return naam;
};

// ── Een versnelbare klok ─────────────────────────────────────────────────────
// Alleen lokaal. De echte database gebruikt `clock_timestamp()`; hier kunnen we hem
// vooruitzetten om een deadline te halen zonder een uur te wachten.
let klokOffsetMs=0;
// De verschuiving geldt voor het héle proces, niet alleen voor de nagebootste database.
// De echte functies rekenen zelf met `Date.now()`; zou die niet meeschuiven, dan meet een
// grensproef de klok van de test tegen de klok van de code en bewijst hij niets.
const echteNow=Date.now.bind(Date);
Date.now=()=>echteNow()+klokOffsetMs;
const nu=()=>new Date(Date.now());

// Dezelfde vorm als `private.merged_dietary_text` in de database en `mergeLegacyDietary`
// in de functies: één tekst, met de kopjes van de twee oude velden erbij zodat er geen
// betekenis verdwijnt. Nooit allebei tonen — dan staat een allergie er twee keer.
const dieetTekst=c=>String(c.dietary_notes||"").trim()||[
  String(c.allergies||"").trim()?`Allergies: ${String(c.allergies).trim()}`:"",
  String(c.dietary_requirements||"").trim()?`Dietary requirements: ${String(c.dietary_requirements).trim()}`:""
].filter(Boolean).join("\n");

// ── De blokkeringsfuncties, spiegel van database/seat-holds.sql ─────────────
// Eén bewerking tegelijk, net als `pg_advisory_xact_lock(hashtext('tavern-weekends'))`.
let slot=Promise.resolve();
const onderSlot=taak=>{const r=slot.then(taak);slot=r.catch(()=>{});return r;};

const CAPACITEIT=6;
const bewaar=data=>writeFileSync(BESTAND,JSON.stringify(data,null,2));

const verlopenOpruimen=data=>{
  for(const c of data.claims){
    if(!["filling","payment"].includes(c.hold_phase)||!c.hold_expires_at)continue;
    if(new Date(c.hold_expires_at)>nu())continue;
    // Heeft iemand betaald, dan vervalt er niets — ook niet in de betaalfase. Dat blijft
    // een beslissing van Robert. Spiegel van private.cleanup_tavern_claims().
    if((c.participants||[]).some(p=>p.status==="paid"))continue;
    c.hold_phase="released";c.status="expired";
    c.release_reason=c.hold_phase==="payment"?"payment_window_expired":"filling_window_expired";
    c.released_at=nu().toISOString();c.released_by="system";
  }
};
const weekendLabel=(data,slug)=>{const w=data.weekends.find(x=>x.slug===slug);return w?`${w.label} · ${w.date_label}`:slug;};
const bezet=(data,slug)=>data.claims
  .filter(c=>c.weekend===slug&&["filling","first_access_held","payment_pending","paid"].includes(c.status))
  .reduce((n,c)=>n+c.party_size,0);

const beginSeatHold=({p_session_hash,p_weekend_slug,p_party_size,p_window_minutes})=>onderSlot(async()=>{
  if(!p_session_hash||p_session_hash.length!==64)throw Object.assign(new Error("invalid_session"),{rpc:true});
  if(!(p_party_size>=1&&p_party_size<=6))throw Object.assign(new Error("invalid_party_size"),{rpc:true});
  const data=db();verlopenOpruimen(data);
  const w=data.weekends.find(x=>x.slug===p_weekend_slug);
  if(!w)throw Object.assign(new Error("unknown_weekend"),{rpc:true});
  const bestaand=data.claims.find(c=>c.booking_session_hash===p_session_hash&&["filling","payment"].includes(c.hold_phase));
  if(bestaand){bewaar(data);return {status:"resumed",claimId:bestaand.id,seats:bestaand.party_size,
    phase:bestaand.hold_phase,holdStartedAt:bestaand.hold_started_at,paymentStartedAt:bestaand.payment_started_at,
    holdExpiresAt:bestaand.hold_expires_at,remaining:Math.max(0,CAPACITEIT-bezet(data,p_weekend_slug))};}
  const vrij=CAPACITEIT-bezet(data,p_weekend_slug);
  if(vrij<p_party_size){bewaar(data);return {status:"not_available",remaining:Math.max(0,vrij)};}
  const start=nu();
  const claim={id:`hold-${randomUUID().slice(0,8)}`,name:"(filling in)",email:"pending@hold.invalid",
    party_size:p_party_size,weekend:p_weekend_slug,status:"filling",hold_phase:"filling",
    hold_started_at:start.toISOString(),
    hold_expires_at:new Date(start.getTime()+(p_window_minutes||FILLING_WINDOW_MINUTES)*60000).toISOString(),
    booking_session_hash:p_session_hash,price_cents:PRIJS,created_at:start.toISOString(),
    consented_at:start.toISOString(),participants:[],arrival_date:null,departure_date:null,
    allergies:null,dietary_requirements:null,dietary_notes:null,message:null,extra_nights:null};
  data.claims.push(claim);bewaar(data);
  return {status:"held",claimId:claim.id,seats:p_party_size,phase:"filling",
    holdStartedAt:claim.hold_started_at,holdExpiresAt:claim.hold_expires_at,
    remaining:Math.max(0,vrij-p_party_size)};
});

const getSeatHold=({p_session_hash})=>onderSlot(async()=>{
  const data=db();verlopenOpruimen(data);bewaar(data);
  const c=[...data.claims].reverse().find(x=>x.booking_session_hash===p_session_hash);
  if(!c)return {status:"no_hold"};
  return {status:["filling","payment"].includes(c.hold_phase)?"active":"ended",
    claimId:c.id,seats:c.party_size,weekend:c.weekend,phase:c.hold_phase,
    holdStartedAt:c.hold_started_at,paymentStartedAt:c.payment_started_at,
    participants:c.participants||[],remaining:Math.max(0,CAPACITEIT-bezet(data,c.weekend))};
});

const releaseSeatHold=({p_session_hash})=>onderSlot(async()=>{
  const data=db();
  const c=data.claims.find(x=>x.booking_session_hash===p_session_hash&&["filling","payment"].includes(x.hold_phase));
  if(!c)return {status:"no_hold"};
  if((c.participants||[]).some(p=>p.status==="paid"))
    return {status:"requires_operator",claimId:c.id,paidParticipants:c.participants.filter(p=>p.status==="paid").length};
  c.hold_phase="released";c.status="cancelled";c.release_reason="cancelled_by_guest";
  c.released_at=nu().toISOString();c.released_by="guest";
  bewaar(data);return {status:"released",claimId:c.id,seats:c.party_size};
});

// ── Het eerste betaalverzoek, in drie stappen ────────────────────────────────
// Spiegel van `database/seat-holds.sql`. Sinds 7 september 2026 verstuurt de Netlify-functie
// de betaalverzoeken zelf, langs dezelfde `sendEmail` als de rest van de boekingsflow; deze
// server onderschept die verzending en schrijft hem naar de postbus. Deed de shim het nog
// zelf, dan gingen er twee mails uit per deelnemer.
const prepareSeatHold=({p_session_hash,p_name,p_email,p_participants,p_allergies,p_dietary,p_dietary_notes,p_message,p_extra_nights,p_payment_window_minutes})=>onderSlot(async()=>{
  const data=db();verlopenOpruimen(data);
  const c=data.claims.find(x=>x.booking_session_hash===p_session_hash);
  if(!c){bewaar(data);return {status:"no_hold"};}
  if(c.hold_phase==="payment"){bewaar(data);return {status:"already_in_payment",claimId:c.id,paymentStartedAt:c.payment_started_at,seats:c.party_size};}
  if(c.hold_phase!=="filling"){bewaar(data);return {status:"hold_not_open",phase:c.hold_phase};}
  if(new Date(c.hold_expires_at)<=nu()){bewaar(data);return {status:"hold_expired"};}
  c.name=String(p_name).trim();c.email=String(p_email).trim().toLowerCase();
  c.allergies=(p_allergies||"").trim()||null;c.dietary_requirements=(p_dietary||"").trim()||null;
  c.dietary_notes=(p_dietary_notes||"").trim()||null;
  c.message=(p_message||"").trim()||null;c.extra_nights=(p_extra_nights||"").trim()||null;
  // Idempotent op e-mailadres, net als de unieke index in de database.
  c.participants=c.participants||[];
  for(const d of p_participants||[]){
    const adres=String(d.email).trim().toLowerCase();
    if(c.participants.some(p=>String(p.email).toLowerCase()===adres))continue;
    c.participants.push({id:randomUUID(),full_name:d.name,email:adres,
      amount_cents:c.price_cents||PRIJS,status:"awaiting_payment",
      payment_reference:`tav_${randomUUID().replace(/-/g,"")}`,
      checkout_session_url:null,paid_at:null,payment_link_sent_at:null,created_at:nu().toISOString()});
  }
  // De fase blijft `filling`. Pas na het versturen wordt het betaalfase.
  const minuten=Math.max(5,Math.min(Number(p_payment_window_minutes)||30,30));
  bewaar(data);
  return {status:"ready",claimId:c.id,seats:c.party_size,
    deadline:new Date(nu().getTime()+minuten*60000).toISOString(),
    weekendLabel:weekendLabel(data,c.weekend),name:c.name,
    participants:c.participants.map(p=>({id:p.id,fullName:p.full_name,email:p.email,
      amountCents:p.amount_cents,paymentReference:p.payment_reference}))};
});

const confirmSeatHold=({p_claim_id,p_deadline,p_sent})=>onderSlot(async()=>{
  const data=db();
  const c=data.claims.find(x=>x.id===p_claim_id);
  if(!c){bewaar(data);return {status:"no_hold"};}
  if(c.hold_phase==="payment"){bewaar(data);return {status:"already_in_payment",claimId:c.id,paymentStartedAt:c.payment_started_at};}
  const verstuurd=new Map((p_sent||[]).map(e=>[e.participantId,e]));
  const open=(c.participants||[]).filter(p=>!verstuurd.has(p.id)).length;
  if(open>0){bewaar(data);return {status:"not_all_sent",open};}
  const grens=new Date(nu().getTime()+30*60000);
  let deadline=p_deadline?new Date(p_deadline):grens;
  if(deadline>grens||deadline<=nu())deadline=grens;
  c.status="payment_pending";c.hold_phase="payment";
  c.payment_started_at=nu().toISOString();c.hold_expires_at=deadline.toISOString();
  for(const p of c.participants||[]){
    const e=verstuurd.get(p.id);
    p.payment_link_sent_at=nu().toISOString();
    // De betaallink niet opslaan: `checkout_session_url` is voor de Stripe-sessie.
    p.payment_link_provider_id=e.providerId;
  }
  bewaar(data);
  return {status:"in_payment",claimId:c.id,seats:c.party_size,
    paymentStartedAt:c.payment_started_at,deadline:c.hold_expires_at,
    participants:(c.participants||[]).length};
});

// De persoonlijke betaalpagina. Spiegel van `tavern_payment_request` in seat-holds.sql:
// precies één deelnemer, nooit de groep.
const betaalVerzoek=({p_reference})=>onderSlot(async()=>{
  const data=db();
  const ref=String(p_reference||"").trim();
  for(const c of data.claims)for(const p of c.participants||[]){
    if(p.payment_reference!==ref)continue;
    if(p.status==="paid")return {status:"already_paid",fullName:p.full_name,amountCents:p.amount_cents};
    if(p.status==="cancelled"||["cancelled","expired"].includes(c.status))return {status:"cancelled"};
    if(!c.hold_expires_at||new Date(c.hold_expires_at)<=nu())return {status:"expired",fullName:p.full_name};
    return {status:"ok",participantId:p.id,fullName:p.full_name,amountCents:p.amount_cents,
      deadline:c.hold_expires_at,bookingName:c.name,weekendLabel:weekendLabel(data,c.weekend),
      checkoutSessionId:p.checkout_session_id||null,checkoutSessionUrl:p.checkout_session_url||null};
  }
  return {status:"not_found"};
});

const koppelSessie=({p_reference,p_session_id,p_session_url})=>onderSlot(async()=>{
  const data=db();const ref=String(p_reference||"").trim();
  for(const c of data.claims)for(const p of c.participants||[]){
    if(p.payment_reference!==ref)continue;
    if(p.status==="paid")return {status:"already_paid"};
    if(p.checkout_session_id)return {status:"already_attached",
      checkoutSessionId:p.checkout_session_id,checkoutSessionUrl:p.checkout_session_url};
    p.checkout_session_id=p_session_id;p.checkout_session_url=p_session_url;
    bewaar(data);
    return {status:"attached",checkoutSessionId:p_session_id,checkoutSessionUrl:p_session_url};
  }
  return {status:"not_found"};
});

const abandonSeatHold=({p_claim_id})=>onderSlot(async()=>{
  const data=db();
  const c=data.claims.find(x=>x.id===p_claim_id);
  if(!c){bewaar(data);return {status:"no_hold"};}
  if(c.hold_phase==="payment"){bewaar(data);return {status:"already_in_payment"};}
  c.participants=(c.participants||[]).filter(p=>!(p.status==="awaiting_payment"&&!p.payment_link_sent_at));
  bewaar(data);
  return {status:"abandoned",claimId:c.id};
});

// De beheeracties. Spiegel van database/admin.sql, inclusief de rolcontrole.
const rolVan=email=>ADMINS.find(a=>a.email.toLowerCase()===String(email||"").toLowerCase())?.role;
const zoekDeelnemer=(data,id)=>{
  for(const c of data.claims)for(const p of c.participants||[])if(p.id===id)return {claim:c,deelnemer:p};
  return null;
};
const logboek=(data,regel)=>{(data.adminActions=data.adminActions||[]).unshift({...regel,created_at:nu().toISOString()});};

// Wat er in een herinnering hoort. Verandert niets — net als de echte RPC. Sinds
// 6 september 2026 bouwt en verstuurt de Netlify-functie de mail zelf, via dezelfde
// `sendEmail` als de rest van de boekingsflow; deze server onderschept die verzending en
// schrijft hem naar de postbus. Deed de shim het nog zelf, dan gingen er twee mails uit.
const adminReminderPayload=({p_email,p_participant_id})=>onderSlot(async()=>{
  if(!isAdmin(p_email))throw Object.assign(new Error("not_an_administrator"),{rpc:true});
  const data=db();const gevonden=zoekDeelnemer(data,p_participant_id);
  if(!gevonden)return {status:"not_found"};
  if(gevonden.deelnemer.status==="paid")return {status:"already_paid"};
  if(!gevonden.claim.hold_expires_at)return {status:"no_deadline",participantId:p_participant_id};
  if(!String(gevonden.deelnemer.payment_reference||"").trim())
    return {status:"no_payment_link",participantId:p_participant_id};
  return {status:"ready",participantId:p_participant_id,
    participant:{full_name:gevonden.deelnemer.full_name,email:gevonden.deelnemer.email,
      amount_cents:gevonden.deelnemer.amount_cents},
    booking:{name:gevonden.claim.name,seats:gevonden.claim.party_size,
      weekendLabel:weekendLabel(data,gevonden.claim.weekend)},
    deadline:gevonden.claim.hold_expires_at,
    paymentReference:gevonden.deelnemer.payment_reference,
    lastSentAt:gevonden.deelnemer.payment_link_sent_at||null};
});

const adminRemind=({p_email,p_participant_id,p_reason})=>onderSlot(async()=>{
  if(!isAdmin(p_email))throw Object.assign(new Error("not_an_administrator"),{rpc:true});
  const data=db();const gevonden=zoekDeelnemer(data,p_participant_id);
  if(!gevonden)return {status:"not_found"};
  if(gevonden.deelnemer.status==="paid")return {status:"already_paid"};
  if(!gevonden.claim.hold_expires_at)return {status:"no_deadline",participantId:p_participant_id};
  // Alleen vastleggen. De deadline blijft staan; een herinnering geeft nooit extra tijd.
  gevonden.deelnemer.payment_link_sent_at=nu().toISOString();
  logboek(data,{actor_email:p_email,action:"remind",claim_id:gevonden.claim.id,participant_id:p_participant_id,reason:p_reason||null});
  bewaar(data);
  return {status:"reminded",participantId:p_participant_id,email:gevonden.deelnemer.email};
});

const adminExtend=({p_email,p_participant_id,p_new_deadline,p_reason})=>onderSlot(async()=>{
  // Verlengen mag sinds 6 september 2026 ook de accommodatie; vrijgeven blijft van Robert.
  if(!isAdmin(p_email))throw Object.assign(new Error("not_an_administrator"),{rpc:true});
  const data=db();const gevonden=zoekDeelnemer(data,p_participant_id);
  if(!gevonden)return {status:"not_found"};
  gevonden.claim.hold_expires_at=p_new_deadline;
  logboek(data,{actor_email:p_email,action:"extend",claim_id:gevonden.claim.id,participant_id:p_participant_id,
    reason:p_reason,details:{newDeadline:p_new_deadline}});
  bewaar(data);
  return {status:"extended",participantId:p_participant_id,newDeadline:p_new_deadline};
});

const adminRelease=({p_email,p_participant_id,p_reason})=>onderSlot(async()=>{
  if(!isAdmin(p_email))throw Object.assign(new Error("not_an_administrator"),{rpc:true});
  if(rolVan(p_email)!=="admin")throw Object.assign(new Error("requires_owner"),{rpc:true});
  const data=db();const gevonden=zoekDeelnemer(data,p_participant_id);
  if(!gevonden)return {status:"not_found"};
  if(gevonden.deelnemer.status==="paid")return {status:"already_paid"};
  // Alleen deze plaats. De rij blijft bestaan, er wordt niets verwijderd en niets terugbetaald.
  gevonden.deelnemer.status="cancelled";
  // Was dit de laatste gast, dan gaat de boeking zelf terug naar de voorraad. `party_size`
  // op nul zetten kan in de database niet (die eist 1 tot 12) en zou hier een lege boeking
  // laten staan. Zie `admin_release_participant` in database/admin.sql.
  if(gevonden.claim.party_size<=1){
    gevonden.claim.party_size=1;
    gevonden.claim.status="cancelled";gevonden.claim.hold_phase="released";
    gevonden.claim.hold_expires_at=null;gevonden.claim.released_at=nu().toISOString();
    gevonden.claim.released_by=String(p_email||"").toLowerCase();
    gevonden.claim.release_reason=(p_reason||"").trim()||null;
  }else gevonden.claim.party_size=gevonden.claim.party_size-1;
  logboek(data,{actor_email:p_email,action:"release",claim_id:gevonden.claim.id,participant_id:p_participant_id,
    reason:p_reason,details:{releasedEmail:gevonden.deelnemer.email,seatsRemaining:gevonden.claim.party_size}});
  bewaar(data);
  const over=gevonden.claim.hold_phase==="released"?0:gevonden.claim.party_size;
  return {status:"released",participantId:p_participant_id,seatsRemaining:over};
});

// De snelheidsbegrenzer, met dezelfde vorm als in Supabase.
const grenzen=new Map();
const checkLimit=({p_key_hash,p_limit,p_window_minutes})=>{
  const venster=p_window_minutes*60000;
  const rij=grenzen.get(p_key_hash)||{start:nu().getTime(),pogingen:0};
  if(nu().getTime()-rij.start>venster){rij.start=nu().getTime();rij.pogingen=0;}
  rij.pogingen+=1;grenzen.set(p_key_hash,rij);
  return rij.pogingen<=p_limit;
};

// ── Een nagebootste Supabase, zodat de échte functie onveranderd draait ─────
const nepSupabase=http.createServer((request,response)=>{
  let body="";request.on("data",c=>body+=c);request.on("end",()=>{
    response.setHeader("content-type","application/json");
    try{
      const invoer=JSON.parse(body||"{}");
      if(request.url.endsWith("/admin_bookings_in_range"))
        return response.end(JSON.stringify(bookingsInRange(invoer.p_email,invoer.p_from,invoer.p_to)));
      if(request.url.endsWith("/admin_booking_detail"))
        return response.end(JSON.stringify(bookingDetail(invoer.p_email,invoer.p_claim_id)));
      if(request.url.endsWith("/admin_decide_extra_nights"))
        return response.end(JSON.stringify(beslisExtraNachten(invoer)));
      if(request.url.endsWith("/set_tavern_stay_request"))
        return response.end(JSON.stringify(zetVerblijfAanvraag(invoer)));
      if(request.url.endsWith("/check_tavern_request_limit"))
        return response.end(JSON.stringify(checkLimit(invoer)));
      const holdRpcs={begin_seat_hold:beginSeatHold,get_seat_hold:getSeatHold,
        release_seat_hold:releaseSeatHold,
        tavern_payment_request:betaalVerzoek,
        attach_participant_checkout_session:koppelSessie,
        prepare_seat_hold_payment:prepareSeatHold,
        confirm_seat_hold_payment:confirmSeatHold,
        abandon_seat_hold_payment:abandonSeatHold,
        admin_reminder_payload:adminReminderPayload,
        admin_remind_participant:adminRemind,admin_extend_participant:adminExtend,
        admin_release_participant:adminRelease};
      const naam=Object.keys(holdRpcs).find(n=>request.url.endsWith("/"+n));
      if(naam)return holdRpcs[naam](invoer)
        .then(r=>response.end(JSON.stringify(r)))
        .catch(e=>{response.statusCode=e.rpc?400:500;response.end(JSON.stringify({message:e.message}));});
      response.statusCode=404;response.end("{}");
    }catch(error){
      response.statusCode=error.rpc?400:500;
      response.end(JSON.stringify({message:error.message}));
    }
  });
});

// ── Het lokale token ────────────────────────────────────────────────────────
const b64=v=>Buffer.from(v).toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const maakToken=email=>{
  const nu=Math.floor(Date.now()/1000);
  const kop=b64(JSON.stringify({alg:"HS256",typ:"JWT"}));
  const inhoud=b64(JSON.stringify({sub:`local-${email}`,email,email_verified:true,iat:nu,exp:nu+8*3600,iss:"local-admin-server"}));
  const sig=createHmac("sha256",jwtGeheim).update(`${kop}.${inhoud}`).digest("base64")
    .replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
  return `${kop}.${inhoud}.${sig}`;
};

const MIME={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",
  ".json":"application/json",".svg":"image/svg+xml",".webp":"image/webp",".jpg":"image/jpeg",".png":"image/png",".woff2":"font/woff2"};

const start=async()=>{
  await new Promise(r=>nepSupabase.listen(0,"127.0.0.1",r));
  process.env.SUPABASE_URL=`http://127.0.0.1:${nepSupabase.address().port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY="local-test-service-key";
  process.env.SUPABASE_JWT_SECRET=jwtGeheim;
  process.env.LEWOS_ADMIN_EMAILS=ADMINS.map(a=>a.email).join(",");
  process.env.RATE_LIMIT_SECRET="local-test-rate-limit-secret";
  // Functies die zelf naar Resend bellen (het contactformulier, de melding aan de
  // operator) worden hier afgevangen. **Er gaat niets de deur uit**: de payload gaat naar
  // dezelfde postbus als de rest, en de functie krijgt een geloofwaardig antwoord terug.
  process.env.RESEND_API_KEY="local-test-resend-key";
  process.env.TAVERN_FROM_EMAIL="The Lewos Tavern <test@example.invalid>";
  process.env.LEWOS_GENERAL_EMAIL="lewos.co@gmail.com";
  // Een nagebootste Google-agenda. **Jouw echte agenda wordt hier nooit aangeraakt.**
  // De afspraken staan in .local-data/calendar.json; daarin zet je met de hand een
  // "boeking van Nadine" om te zien wat de site daarmee doet.
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL="lokaal-test@example.invalid";
  // Een echte, weggooibare RSA-sleutel. Niet omdat de nagebootste agenda hem nodig heeft,
  // maar omdat de productiecode er écht mee ondertekent — met een neptekst zou die stap
  // worden overgeslagen en dan test je hem niet.
  const {privateKey:testSleutel}=generateKeyPairSync("rsa",{modulusLength:2048,
    privateKeyEncoding:{type:"pkcs8",format:"pem"},publicKeyEncoding:{type:"spki",format:"pem"}});
  process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=testSleutel;
  process.env.LEWOS_CALENDAR_ID="lokale-testagenda";
  // Zonder deze variabele valt de koppeling terug op "alles blokkeert" en test je de
  // herkenning nooit. Een verzonnen adres; het echte staat alleen in Netlify.
  const HUISADRES="accommodatie@lokale-test.invalid";
  process.env.LEWOS_ACCOMMODATION_EMAILS=HUISADRES;
  // Netlify zet `URL` op het adres van de site. Lokaal wijst hij naar deze server, zodat
  // de betaallinks in de postbus naar iets wijzen dat hier bestaat.
  process.env.URL=`http://127.0.0.1:${POORT}`;
  // De betaalpoort staat in productie dicht tot de reisbureauregistratie rond is. Hier moet
  // hij open, anders valt de hele boekingsflow niet te testen. Dat kan alleen omdat
  // `localTestOverridesAllowed()` twee dingen tegelijk eist: NODE_ENV op "test" én een URL
  // die naar localhost wijst. Die combinatie kan op Netlify niet ontstaan.
  process.env.NODE_ENV="test";
  process.env.TAVERN_PAYMENTS_ENABLED="true";
  process.env.BOOKING_TERMS_VERSION="lokale-test-voorwaarden";
  process.env.BOOKING_TERMS_DOCUMENT_URL=`http://127.0.0.1:${POORT}/voorwaarden.pdf`;
  process.env.TRAVEL_INFORMATION_DOCUMENT_URL=`http://127.0.0.1:${POORT}/reisinformatie.pdf`;
  const AGENDA=join(DATA,"calendar.json");
  const leesAgenda=()=>{try{return JSON.parse(readFileSync(AGENDA,"utf8"));}catch{return {items:[]};}};
  const schrijfAgenda=d=>writeFileSync(AGENDA,JSON.stringify(d,null,2));
  // Twee voorbeelden, en het verschil ertussen is de hele wijziging van 6 september 2026:
  // de boeking van de accommodatie haalt nachten van de site, de privéafspraak niet.
  if(!existsSync(AGENDA))schrijfAgenda({items:[{
    id:"nadine-voorbeeld",summary:"TEST — Familie Jansen (boeking van Nadine)",
    creator:{email:HUISADRES},organizer:{email:HUISADRES},
    start:{date:"2026-11-10"},end:{date:"2026-11-13"}
  },{
    id:"prive-voorbeeld",summary:"TEST — Tandarts (privé, mag niets blokkeren)",
    creator:{email:"robert@lokale-test.invalid"},
    start:{date:"2026-11-17"},end:{date:"2026-11-18"}
  },{
    // En onze eigen boeking, die nooit tegen zichzelf mag meetellen.
    id:"eigen-voorbeeld",summary:"TEST — Tavern-boeking (van ons)",
    creator:{email:"lokaal-test@example.invalid"},
    start:{date:"2026-11-19"},end:{date:"2026-11-21"},
    extendedProperties:{private:{lewosSource:"tavern-booking",lewosClaimId:"voorbeeld"}}
  }]});

  // Wat Stripe zou hebben teruggegeven, per idempotentiesleutel. Zo levert twee keer
  // klikken hier dezelfde sessie op, net als bij de echte Stripe.
  const stripeSessies=new Map();

  const echteFetch=globalThis.fetch;
  globalThis.fetch=async(invoer,opties)=>{
    const url=String(invoer?.url||invoer||"");
    // Het token voor Google. Niets echts: de nagebootste agenda vraagt er niet naar.
    if(url.startsWith("https://oauth2.googleapis.com/token"))
      return new Response(JSON.stringify({access_token:"lokaal-test-token",expires_in:3600}),
        {status:200,headers:{"content-type":"application/json"}});
    if(url.startsWith("https://www.googleapis.com/calendar/v3")){
      const pad=new URL(url);
      const methode=(opties?.method||"GET").toUpperCase();
      const data=leesAgenda();
      const isLijst=/\/events$/.test(pad.pathname);
      if(methode==="GET"&&isLijst)
        return new Response(JSON.stringify({items:data.items,summary:"Lokale testagenda",timeZone:"Europe/Madrid",accessRole:"writer"}),
          {status:200,headers:{"content-type":"application/json"}});
      const id=decodeURIComponent(pad.pathname.split("/events/")[1]||"");
      if(methode==="GET"&&id){
        const gevonden=data.items.find(i=>i.id===id);
        return new Response(JSON.stringify(gevonden||{error:"not_found"}),{status:gevonden?200:404,
          headers:{"content-type":"application/json"}});
      }
      if(methode==="POST"&&isLijst){
        const nieuw=JSON.parse(opties?.body||"{}");
        if(data.items.some(i=>i.id===nieuw.id))
          return new Response(JSON.stringify({error:"duplicate"}),{status:409,headers:{"content-type":"application/json"}});
        data.items.push(nieuw);schrijfAgenda(data);
        console.log(`  agenda: aangemaakt "${nieuw.summary}"`);
        return new Response(JSON.stringify(nieuw),{status:200,headers:{"content-type":"application/json"}});
      }
      if(methode==="PUT"&&id){
        const nieuw=JSON.parse(opties?.body||"{}");
        data.items=data.items.map(i=>i.id===id?nieuw:i);schrijfAgenda(data);
        return new Response(JSON.stringify(nieuw),{status:200,headers:{"content-type":"application/json"}});
      }
      if(methode==="DELETE"&&id){
        const voor=data.items.length;
        data.items=data.items.filter(i=>i.id!==id);schrijfAgenda(data);
        return new Response("",{status:voor===data.items.length?404:204});
      }
      return new Response(JSON.stringify({error:"unsupported"}),{status:400,headers:{"content-type":"application/json"}});
    }
    // Stripe wordt onderschept, nooit gebeld. De sessie krijgt een herkenbaar nep-id en een
    // URL naar een pagina op deze server, zodat de hele betaalweg lokaal te volgen is
    // zonder dat er ooit een echte betaling ontstaat.
    if(url.startsWith("https://api.stripe.com/v1/checkout/sessions")){
      const sleutel=String(opties?.headers?.["idempotency-key"]||"onbekend");
      const bestaand=stripeSessies.get(sleutel);
      if(bestaand){
        console.log(`  stripe: bestaande sessie hergebruikt voor ${sleutel}`);
        return new Response(JSON.stringify(bestaand),{status:200,headers:{"content-type":"application/json"}});
      }
      const sessie={id:`cs_test_${sleutel}`,url:`http://127.0.0.1:${POORT}/tavern/pay/test-checkout/?sessie=${sleutel}`};
      stripeSessies.set(sleutel,sessie);
      console.log(`  stripe: nagebootste sessie ${sessie.id}`);
      return new Response(JSON.stringify(sessie),{status:200,headers:{"content-type":"application/json"}});
    }

    if(url.startsWith("https://api.resend.com")){
      let mail={};
      try{mail=JSON.parse(opties?.body||"{}");}catch{}
      // Noem het beestje bij de naam in de postbus. "resend" zegt niets als je nakijkt of
      // een herinnering eruit is gegaan; het onderwerp weet dat wel.
      const onderwerp=String(mail.subject||"");
      const soort=/^Reminder\b/i.test(onderwerp)?"reminder"
        :/payment link/i.test(onderwerp)?"payment-request"
        :/booking is confirmed/i.test(onderwerp)?"booking-confirmation"
        :"resend";
      const bestand=inPostbus(mail,soort);
      console.log(`  postbus: ${bestand}  →  ${[].concat(mail.to||[]).join(", ")}`);
      return new Response(JSON.stringify({id:`local-${bestand}`}),
        {status:200,headers:{"content-type":"application/json"}});
    }
    return echteFetch(invoer,opties);
  };
  const {handler}=await import("../netlify/functions/admin-bookings.mjs");

  const server=http.createServer(async(request,response)=>{
    const url=new URL(request.url,"http://127.0.0.1");
    const stuur=(code,body,type="application/json")=>{
      response.writeHead(code,{"content-type":type,"cache-control":"no-store"});
      // Een Buffer is een bestand en gaat er ongewijzigd uit; een object is JSON. Zonder
      // dit onderscheid werd elke pagina als een reeks bytegetallen uitgeleverd.
      response.end(Buffer.isBuffer(body)||typeof body==="string"?body:JSON.stringify(body));
    };

    if(url.pathname==="/api/admin/config")return stuur(200,{
      mode:"local",testEnvironment:true,
      identities:[
        ...ADMINS.map(a=>({email:a.email,label:a.display_name,allowed:true})),
        {email:"someone.else@example.invalid",label:"Someone else (not an administrator)",allowed:false}
      ]});

    if(url.pathname==="/api/admin/local-login"&&request.method==="POST"){
      let body="";for await(const c of request)body+=c;
      const {email}=JSON.parse(body||"{}");
      // Let op: dit tekent een token voor élk adres, ook een niet-toegestaan adres. Dat is
      // met opzet — zo is te zien dat de weigering van de autorisatie komt en niet van het
      // ontbreken van een token. In productie bestaat dit eindpunt niet.
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email||"")))return stuur(400,{error:"invalid_email"});
      return stuur(200,{token:maakToken(String(email).toLowerCase()),signedInAs:email});
    }

    // De publieke beschikbaarheid, zoals `/api/first-access` hem teruggeeft. De kalender
    // op /tavern/ en /tavern/book/ leeft hiervan: zonder echte datums tekent hij niets.
    // **Eén getal per weekend**, net als in productie — geen verdeling tussen betaald en
    // vastgehouden, want dat is voor de beheeromgeving.
    // Het contactformulier loopt sinds 5 september 2026 langs een eigen functie in plaats
    // van Netlify Forms. Hier draait diezelfde functie, met de postbus als bestemming.
    if(url.pathname==="/api/pay"){
      const {handler:h}=await import("../netlify/functions/pay.mjs");
      const r=await h({httpMethod:request.method,path:url.pathname,
        headers:{...request.headers},queryStringParameters:Object.fromEntries(url.searchParams)});
      return stuur(r.statusCode,r.body);
    }

    if(url.pathname==="/api/house-availability"){
      const {handler:h}=await import("../netlify/functions/house-availability.mjs");
      const r=await h({httpMethod:request.method,path:url.pathname,headers:{...request.headers},
        queryStringParameters:Object.fromEntries(url.searchParams)});
      return stuur(r.statusCode,r.body);
    }

    if(url.pathname==="/api/contact"){
      const {handler:contactHandler}=await import("../netlify/functions/contact.mjs");
      let body="";if(request.method!=="GET")for await(const c of request)body+=c;
      const r=await contactHandler({httpMethod:request.method,path:url.pathname,
        headers:{...request.headers,"x-forwarded-for":request.socket.remoteAddress||"127.0.0.1"},
        queryStringParameters:Object.fromEntries(url.searchParams),body});
      if(r.headers?.location){response.writeHead(r.statusCode,r.headers);return response.end();}
      return stuur(r.statusCode,r.body);
    }

    if(url.pathname==="/api/first-access"&&request.method==="GET"){
      const data=db();
      return stuur(200,{publicBookingOpen:false,firstAccessClosed:false,
        weekends:data.weekends.map(w=>({
          slug:w.slug,label:w.label,dateLabel:w.date_label,
          startsOn:w.starts_on,endsOn:w.ends_on,
          capacity:CAPACITEIT,remaining:Math.max(0,CAPACITEIT-bezet(data,w.slug)),
          priceCents:PRIJS}))});
    }

    if(url.pathname.startsWith("/api/hold")){
      // Na een boeking de weekendblokkades gelijkzetten, net als het script dat in
      // productie zou draaien. Zo is lokaal te zien wat Nadine in haar agenda krijgt.
      const naBoeking=async()=>{
        try{
          const {calendarConfig,syncWeekendBlocks}=await import("../netlify/functions/_calendar.mjs");
          const config=calendarConfig();
          if(!config)return;
          const data=db();
          await syncWeekendBlocks(config,data.weekends.map(w=>({
            slug:w.slug,label:w.label,startsOn:w.starts_on,endsOn:w.ends_on,
            capacity:CAPACITEIT,seatsBooked:bezet(data,w.slug)})));
        }catch(error){console.error("  agenda: blokkades bijwerken mislukt",error.message);}
      };
      const {handler:holdHandler}=await import("../netlify/functions/seat-hold.mjs");
      let body="";if(request.method!=="GET")for await(const c of request)body+=c;
      const r=await holdHandler({httpMethod:request.method,path:url.pathname,
        headers:{...request.headers,"x-forwarded-for":request.socket.remoteAddress||"127.0.0.1"},
        queryStringParameters:Object.fromEntries(url.searchParams),body});
      if(request.method==="POST")await naBoeking();
      return stuur(r.statusCode,r.body);
    }

    // Alleen lokaal: de testgegevens terugzetten, zodat een proef niet op de resten van de
    // vorige stukloopt.
    if(url.pathname==="/api/test/reset"&&request.method==="POST"){
      writeFileSync(BESTAND,JSON.stringify(zaad(),null,2));
      klokOffsetMs=0;grenzen.clear();postTeller=0;
      if(existsSync(OUTBOX))for(const f of readdirSync(OUTBOX))rmSync(join(OUTBOX,f));
      return stuur(200,{status:"reseeded"});
    }

    // Alleen lokaal: de klok vooruitzetten om een deadline te halen zonder te wachten.
    if(url.pathname==="/api/test/clock"){
      if(request.method==="POST"){
        let body="";for await(const c of request)body+=c;
        const {advanceMinutes=0,reset=false,resetLimits=false}=JSON.parse(body||"{}");
        klokOffsetMs=reset?0:klokOffsetMs+Number(advanceMinutes)*60000;
        if(reset||resetLimits)grenzen.clear();
      }
      return stuur(200,{now:nu().toISOString(),offsetMinutes:Math.round(klokOffsetMs/60000)});
    }

    if(url.pathname.startsWith("/api/admin/participants")){
      const {handler:actieHandler}=await import("../netlify/functions/admin-actions.mjs");
      let body="";for await(const c of request)body+=c;
      const r=await actieHandler({httpMethod:request.method,path:url.pathname,
        headers:Object.fromEntries(Object.entries(request.headers)),body});
      return stuur(r.statusCode,r.body);
    }

    // Alleen lokaal: een geslaagde betaling nabootsen. In productie komt dit uitsluitend
    // van een gecontroleerde Stripe-webhook — een terugkeer naar de site bewijst niets.
    if(url.pathname==="/api/test/pay"&&request.method==="POST"){
      let body="";for await(const c of request)body+=c;
      const {participantId}=JSON.parse(body||"{}");
      const data=db();
      let raak=null;
      for(const c of data.claims)for(const p of c.participants||[])if(p.id===participantId){p.status="paid";p.paid_at=nu().toISOString();raak={c,p};}
      if(!raak)return stuur(404,{error:"participant_not_found"});
      bewaar(data);
      return stuur(200,{status:"paid",participantId,claimId:raak.c.id});
    }

    // Alleen lokaal: de melding aan Robert en Nadine opbouwen zodra een groep in de laatste
    // verlenging zit. In productie zou een planner dit doen.
    if(url.pathname==="/api/test/operator-notices"&&request.method==="POST"){
      const data=db();const gestuurd=[];
      for(const c of data.claims){
        if(c.hold_phase!=="payment"||!(c.participants||[]).length)continue;
        const stand=holdState({phase:HOLD_PHASES.payment,paymentStartedAt:c.payment_started_at,
          participants:c.participants,seats:c.party_size,now:nu()});
        if(!stand.notifyOperators||c.operator_notice_sent_at)continue;
        inPostbus(buildOperatorNoticeEmail({booking:{name:c.name,seats:c.party_size,weekendLabel:weekendLabel(data,c.weekend)},
          deadline:stand.deadline,unpaidParticipants:stand.unpaidParticipants}),"operator-notice");
        c.operator_notice_sent_at=nu().toISOString();
        gestuurd.push({claimId:c.id,unpaid:stand.unpaidParticipants.length});
      }
      bewaar(data);
      return stuur(200,{notices:gestuurd});
    }

    // De lokale postbus, als lijst.
    if(url.pathname==="/outbox/"||url.pathname==="/outbox"){
      const bestanden=existsSync(OUTBOX)?readdirSync(OUTBOX).filter(f=>f.endsWith(".html")).sort().reverse():[];
      const rijen=bestanden.map(f=>{
        const [,soort]=f.match(/^\d+-([a-z-]+)-/)||[];
        return `<li><a href="/outbox/${f}">${f.replace(/\.html$/,"")}</a> <em>${soort||""}</em></li>`;}).join("");
      return stuur(200,`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Local outbox</title>`
        +`<style>html{color-scheme:light}body{font:15px/1.7 system-ui;margin:0;padding:28px;background:#F7F3EC;color:#0F3B35}`
        +`h1{font-size:1.5rem}li{margin:4px 0}em{color:#6B6F72;font-size:.8rem}a{color:#E5643A}</style></head><body>`
        +`<h1>Local outbox — ${bestanden.length} message(s)</h1>`
        +`<p>Nothing was sent. These are the messages the flow built, written to disk instead.</p><ul>${rijen}</ul></body></html>`,"text/html; charset=utf-8");
    }
    if(url.pathname.startsWith("/outbox/")){
      const bestand=join(OUTBOX,url.pathname.replace("/outbox/",""));
      if(!bestand.startsWith(OUTBOX)||!existsSync(bestand))return stuur(404,"Not found","text/plain");
      return stuur(200,readFileSync(bestand),bestand.endsWith(".txt")?"text/plain; charset=utf-8":"text/html; charset=utf-8");
    }

    if(url.pathname.startsWith("/api/admin/bookings")){
      const resultaat=await handler({httpMethod:request.method,path:url.pathname,
        headers:Object.fromEntries(Object.entries(request.headers)),
        body:await (async()=>{let b="";if(request.method!=="GET")for await(const c of request)b+=c;return b;})(),
        queryStringParameters:Object.fromEntries(url.searchParams)});
      return stuur(resultaat.statusCode,resultaat.body);
    }

    // De statische site.
    let pad=decodeURIComponent(url.pathname);
    if(pad.endsWith("/"))pad+="index.html";
    const bestand=join(WORTEL,normalize(pad).replace(/^(\.\.[/\\])+/,""));
    if(!bestand.startsWith(WORTEL)||!existsSync(bestand))return stuur(404,"Not found","text/plain");
    stuur(200,readFileSync(bestand),MIME[extname(bestand)]||"application/octet-stream");
  });

  server.listen(POORT,"127.0.0.1",()=>{
    console.log(`\nLewos-beheeromgeving (lokaal, testgegevens)\n  http://127.0.0.1:${POORT}/admin/\n`);
    console.log("Toegestaan:");for(const a of ADMINS)console.log(`  ${a.email}  (${a.display_name})`);
    console.log("Geweigerd : someone.else@example.invalid — ingelogd, maar geen beheerder");
    console.log(`\nTestgegevens: ${BESTAND}\n  --reseed zet ze terug naar de begintoestand.\n`);
  });
};

start().catch(error=>{console.error(error);process.exit(1);});
