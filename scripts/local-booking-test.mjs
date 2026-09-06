// Lokale proef van de boekingsflow, met één echte afspraak in de gedeelde Lewos-agenda.
//
// Wat dit script wél doet: de échte handlers draaien — `first-access.mjs` voor de
// aanmelding en `stripe-webhook.mjs` voor de bevestigde betaling — tegen een mockserver die
// hier in het proces draait. Daarna schrijft het één afspraak in Google Agenda en leest het
// die terug.
//
// Wat dit script níét doet, en niet kan doen:
//
//   * De productiedatabase aanraken. `SUPABASE_URL` wordt hier op de eigen mockserver gezet
//     en er staat een harde controle op: wijst hij ergens anders heen dan localhost, dan
//     stopt het script.
//   * Stripe aanroepen. De webhook krijgt een gebeurtenis die hier wordt ondertekend met een
//     testgeheim; er gaat geen enkel verzoek naar Stripe.
//   * De gast mailen. Resend wordt op dezelfde mockserver afgevangen. De mails worden
//     opgebouwd en gecontroleerd, maar verlaten deze machine niet.
//   * Een tweede afspraak maken bij opnieuw draaien. Het afspraak-id is afgeleid van het
//     boekingskenmerk, en dat kenmerk staat hieronder vast.
//
// Draaien:
//     node scripts/local-booking-test.mjs            (maakt de afspraak echt aan)
//     node scripts/local-booking-test.mjs --dry-run  (toont wat er zou worden aangemaakt)
//     node scripts/local-booking-test.mjs --dump <map> (schrijft de opgebouwde mails weg)
//
// `--dump` bestaat omdat er nergens op de site een bevestigde boeking te zien is: de
// bevestiging ís de mail. Met deze optie is die in een browser te bekijken zonder dat er
// iets verstuurd wordt. Kies een map buiten de repo.
//
// Zonder ingestelde Google-sleutel valt het script vanzelf terug op --dry-run en zegt het
// welke drie omgevingsvariabelen er ontbreken.

import {createHmac} from "node:crypto";
import http from "node:http";
import {bookingEvent,calendarConfig,describeCalendar,eventIdFor,readEvent,upsertBookingEvent} from "../netlify/functions/_calendar.mjs";

// ── Het scenario ─────────────────────────────────────────────────────────────
// Vastgelegd door Robert op 5 september 2026. Weekend 02 loopt van vrijdag 6 tot maandag
// 9 november 2026; deze fictieve gasten komen de donderdag ervoor en vertrekken de dinsdag
// erna. Vijf overnachtingen: 5, 6, 7, 8 en 9 november.
const SCENARIO={
  claimId:"test-lewos-boeking-weekend-02",   // vast, zodat een herhaalde run dezelfde afspraak raakt
  name:"TEST – Lewos boeking",
  email:"test-lewos-boeking@example.invalid",
  seats:2,
  weekend:"weekend-02",
  weekendLabel:"Weekend 02 · 6 to 9 Nov 2026",
  arrivalDate:"2026-11-05",
  departureDate:"2026-11-10",
  extraNights:"One night before (Thu 5 Nov) and one night after (Mon 9 Nov). Five nights in total.",
  titel:"TEST – Lewos boeking – donderdag t/m dinsdag",
  beschrijving:"LOKALE TEST — geen echte boeking, geen echte gasten.\n\nAangemaakt door scripts/local-booking-test.mjs om te controleren of een bevestigde Tavern-boeking in de gedeelde Lewos-agenda terechtkomt. Er is niet betaald en er is geen gastenmail verstuurd. Deze afspraak mag blijven staan totdat Robert en Nadine hem hebben gezien, en daarna weg."
};

const dryRun=process.argv.includes("--dry-run");
const dumpDir=(()=>{const i=process.argv.indexOf("--dump");return i===-1?null:process.argv[i+1];})();
const log=(...a)=>console.log(...a);

// ── De mockserver: Supabase, Resend en de twee PDF's ─────────────────────────
const mails=[];
const rpcs=[];
const server=http.createServer((request,response)=>{
  let body="";
  request.on("data",chunk=>body+=chunk);
  request.on("end",()=>{
    const url=request.url;
    response.setHeader("content-type","application/json");
    if(url.startsWith("/rest/v1/rpc/")){
      rpcs.push({url,body});
      if(url.endsWith("check_tavern_request_limit"))return response.end("true");
      if(url.endsWith("register_tavern_interest"))return response.end(JSON.stringify({
        status:"first_access_held",claimId:SCENARIO.claimId,weekend:SCENARIO.weekend,
        weekendLabel:SCENARIO.weekendLabel,seats:SCENARIO.seats,remaining:6-SCENARIO.seats
      }));
      if(url.endsWith("confirm_tavern_payment"))return response.end(JSON.stringify({
        status:"paid",claimId:SCENARIO.claimId,name:SCENARIO.name,email:SCENARIO.email,
        seats:SCENARIO.seats,weekendLabel:SCENARIO.weekendLabel,
        arrivalDate:SCENARIO.arrivalDate,departureDate:SCENARIO.departureDate,
        extraNights:SCENARIO.extraNights,dietaryNotes:null,notes:null,
        termsVersion:"local-test",confirmationEmailSent:false
      }));
      if(url.endsWith("mark_tavern_confirmation_email_sent"))return response.end(JSON.stringify({status:"marked"}));
      if(url.endsWith("mark_tavern_receipt_email_sent"))return response.end(JSON.stringify({status:"marked"}));
      return response.end("{}");
    }
    if(url==="/documents/terms.pdf"||url==="/documents/travel.pdf"){
      response.setHeader("content-type","application/pdf");
      return response.end(`%PDF-1.4\n${"local-test-document".repeat(20)}\n%%EOF`);
    }
    if(url==="/emails"){mails.push(JSON.parse(body));return response.end(JSON.stringify({id:"local-test-mail"}));}
    response.statusCode=404;response.end("{}");
  });
});

const luister=()=>new Promise((resolve,reject)=>{
  server.once("error",reject);
  server.listen(0,"127.0.0.1",()=>resolve(`http://127.0.0.1:${server.address().port}`));
});

const run=async()=>{
  const base=await luister();
  const echteFetch=globalThis.fetch;
  globalThis.fetch=(input,options)=>{
    const url=String(input);
    if(url.startsWith("https://api.resend.com/"))return echteFetch(`${base}/emails`,options);
    if(url.startsWith("https://api.stripe.com/"))throw new Error("Stripe is in deze proef verboden");
    if(url.startsWith(base))return echteFetch(input,options);
    // Alleen Google mag hier nog naar buiten. Al het andere is een fout.
    if(url.startsWith("https://oauth2.googleapis.com/")||url.startsWith("https://www.googleapis.com/calendar/"))return echteFetch(input,options);
    return Promise.reject(new Error(`onverwacht netwerkverzoek: ${url}`));
  };

  process.env.SUPABASE_URL=base;
  process.env.SUPABASE_SERVICE_ROLE_KEY="local-test";
  process.env.RATE_LIMIT_SECRET="local-test-secret";
  process.env.RESEND_API_KEY="local-test";
  process.env.TAVERN_FROM_EMAIL="The Lewos Tavern <local-test@example.invalid>";
  process.env.LEWOS_GENERAL_EMAIL=process.env.LEWOS_GENERAL_EMAIL||"lewos.co@gmail.com";
  process.env.FONTECHA_ACCOMMODATION_EMAIL=process.env.FONTECHA_ACCOMMODATION_EMAIL||"accommodation@example.invalid";
  process.env.URL=base;
  process.env.NODE_ENV="test";
  process.env.STRIPE_WEBHOOK_SECRET="whsec_local_test";
  process.env.TAVERN_PAYMENTS_ENABLED="true";
  process.env.BOOKING_TERMS_VERSION="local-test";
  process.env.BOOKING_TERMS_DOCUMENT_URL="/documents/terms.pdf";
  process.env.TRAVEL_INFORMATION_DOCUMENT_URL="/documents/travel.pdf";
  // First Access sluit op deze datum. Voor de proef moet hij in de toekomst liggen, anders
  // weigert de aanmelding met `first_access_closed`. De webhook leest deze waarde niet.
  process.env.PUBLIC_BOOKING_OPENS_AT=new Date(Date.now()+90*24*60*60*1000).toISOString();

  // Harde grens. Deze proef mag nooit tegen de echte database praten, ook niet als iemand
  // het script draait met een productie-URL al in zijn omgeving.
  if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(process.env.SUPABASE_URL))throw new Error("de proef wijst niet naar de lokale mockserver — gestopt");

  log("── 1. Aanmelding via /api/first-access ──────────────────────────────");
  const {handler:firstAccess}=await import("../netlify/functions/first-access.mjs");
  const aanmelding=await firstAccess({httpMethod:"POST",headers:{"content-type":"application/json",accept:"application/json"},
    body:JSON.stringify({name:SCENARIO.name,email:SCENARIO.email,weekend:SCENARIO.weekend,people:SCENARIO.seats,
      consent:"agreed",extraNights:SCENARIO.extraNights,"bot-field":""})});
  log(`   status ${aanmelding.statusCode} · ${JSON.parse(aanmelding.body).status}`);

  log("── 2. Bevestigde betaling via de Stripe-webhook ─────────────────────");
  const {handler:webhook}=await import("../netlify/functions/stripe-webhook.mjs");
  const gebeurtenis=JSON.stringify({type:"checkout.session.completed",created:Math.floor(Date.now()/1000),
    data:{object:{payment_status:"paid",metadata:{payment_reference:"local-test-reference"}}}});
  const t=Math.floor(Date.now()/1000);
  const handtekening=createHmac("sha256","whsec_local_test").update(`${t}.${gebeurtenis}`).digest("hex");
  const bevestiging=await webhook({httpMethod:"POST",headers:{"stripe-signature":`t=${t},v1=${handtekening}`},body:gebeurtenis});
  log(`   status ${bevestiging.statusCode}${bevestiging.statusCode===200?"":" · "+bevestiging.body}`);

  log("── 3. Wat er is opgebouwd, en naar wie ──────────────────────────────");
  for(const mail of mails)log(`   ${[].concat(mail.to).join(", ")} — ${mail.subject}${mail.attachments?` (+${mail.attachments.length} PDF)`:""}`);
  log("   (geen van deze mails heeft deze machine verlaten)");

  if(dumpDir){
    const {mkdir,writeFile}=await import("node:fs/promises");
    await mkdir(dumpDir,{recursive:true});
    const bestanden=[];
    for(const [i,mail] of mails.entries()){
      const naam=`${String(i+1).padStart(2,"0")}-${[].concat(mail.to)[0].replace(/[^a-z0-9]+/gi,"-")}`;
      // Het losse HTML-fragment van een mail draagt geen charset en geen achtergrond; een
      // postvak levert die zelf. Zonder dit omhulsel leest een browser het als latin-1
      // (`TEST â€“ Lewos`) en zet hij donkergroene tekst op een donkere pagina.
      await writeFile(`${dumpDir}/${naam}.html`,
        `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
        +`<title>${mail.subject.replace(/[<>&]/g,"")}</title>`
        +`<style>html{color-scheme:light}body{margin:0;padding:24px;background:#fff}</style></head><body>${mail.html}</body></html>`,"utf8");
      await writeFile(`${dumpDir}/${naam}.txt`,mail.text,"utf8");
      bestanden.push({naam,to:[].concat(mail.to),subject:mail.subject,bijlagen:mail.attachments?.length||0});
    }
    await writeFile(`${dumpDir}/mails.json`,JSON.stringify(bestanden,null,2),"utf8");
    log(`   Weggeschreven naar ${dumpDir} (${bestanden.length} berichten, HTML én tekst)`);
  }

  const velden=bookingEvent({...SCENARIO,summary:SCENARIO.titel,descriptionPrefix:SCENARIO.beschrijving});

  log("── 4. De afspraak ───────────────────────────────────────────────────");
  const config=(()=>{try{return calendarConfig();}catch(error){log(`   ${error.message}`);return null;}})();
  if(!config||dryRun){
    if(!config){
      log("   Google Agenda is niet ingesteld. Ontbrekend:");
      for(const naam of ["GOOGLE_SERVICE_ACCOUNT_EMAIL","GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY","LEWOS_CALENDAR_ID"])
        if(!process.env[naam])log(`     - ${naam}`);
      log("   Zie operations/google-agenda-koppeling.md voor het opzetten.");
    }
    log("   PROEFDRAAI — er is niets aangemaakt. Dit zou er komen te staan:\n");
    log(JSON.stringify({calendarId:process.env.LEWOS_CALENDAR_ID||"<nog niet ingesteld>",eventId:eventIdFor(SCENARIO.claimId),...velden},null,2));
    return {aangemaakt:false};
  }

  const agenda=await describeCalendar(config);
  log(`   Doelagenda: "${agenda.summary}" · ${agenda.calendarId}`);
  log(`   Tijdzone ${agenda.timeZone} · toegangsrol ${agenda.accessRole}`);
  if(!/writer|owner/.test(String(agenda.accessRole)))throw new Error(`geen schrijfrecht op deze agenda (${agenda.accessRole})`);

  const resultaat=await upsertBookingEvent(config,velden);
  log(`   Afspraak ${resultaat.status}: ${resultaat.event.htmlLink}`);

  log("── 5. Teruglezen uit Google Agenda ──────────────────────────────────");
  const terug=await readEvent(config,eventIdFor(SCENARIO.claimId));
  if(!terug.found)throw new Error("de afspraak is niet terug te lezen — de proef is NIET geslaagd");
  log(`   Gevonden: "${terug.event.summary}"`);
  log(`   Start   : ${terug.event.start.dateTime} (${terug.event.start.timeZone})`);
  log(`   Einde   : ${terug.event.end.dateTime} (${terug.event.end.timeZone})`);
  log(`   Agenda  : ${terug.event.organizer?.displayName} <${terug.event.organizer?.email}>`);
  log(`   Gasten  : ${terug.event.attendees?.length||0} (hoort 0 te zijn)`);
  log(`   Link    : ${terug.event.htmlLink}`);
  return {aangemaakt:true,link:terug.event.htmlLink};
};

run().then(r=>{
  console.log(r.aangemaakt?"\nPROEF GESLAAGD — de afspraak staat in Google Agenda.":"\nProefdraai afgerond — er staat nog niets in Google Agenda.");
  server.close();process.exit(0);
}).catch(error=>{
  console.error("\nPROEF MISLUKT:",error.message);
  server.close();process.exit(1);
});
