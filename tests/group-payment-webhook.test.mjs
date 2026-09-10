// De webhook bij een groepsbetaling. Dit pad bestond niet: een deelnemerkenmerk staat niet
// in `tavern_seat_claims`, dus `confirm_tavern_payment` gaf `unknown_payment`, de webhook
// antwoordde 500, en Stripe bleef het opnieuw proberen terwijl de betaling nooit werd
// vastgelegd en er geen bevestiging uitging.
//
// Wat hier bewaakt wordt: dat iedere deelnemer zijn eigen bevestiging krijgt, dat de
// accommodatie en de agenda pas aan de beurt zijn als de héle boeking betaald is, en dat
// de naam van één deelnemer nooit in de mail aan de accommodatie belandt.
import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
import {after, before, beforeEach, test} from "node:test";
import http from "node:http";
import {listenOnTestPort,stopTestServer} from "./_test-server.mjs";

process.env.LEWOS_PREVIEW_SAFE="true";

let server, base, aanroepen=[], mails=[], mailFaalt=false, markFaalt=false, markWeigert=false;
const nativeFetch=globalThis.fetch;

// Wat de database zou teruggeven. Twee standen: nog niet iedereen betaald, en de laatste.
let deelnemerResultaat;
const DEELNEMER_ONVOLLEDIG={
  status:"paid",participantId:"deel-2",claimId:"claim-9",
  name:"TEST – Deelnemer twee",email:"twee@example.invalid",amountCents:202500,
  weekend:"weekend-01",weekendLabel:"The Halloween Table · 30 Oct to 2 Nov 2026",
  arrivalDate:"2026-10-30",departureDate:"2026-11-02",
  termsVersion:"booking-test-v1",paidAt:"2026-10-01T10:00:00.000Z",
  bookingComplete:false,outstanding:2,confirmationEmailSent:false,booking:null
};
const BOEKING={
  status:"paid",claimId:"claim-9",name:"TEST – Boeker",email:"boeker@example.invalid",seats:4,
  weekendLabel:"The Halloween Table · 30 Oct to 2 Nov 2026",
  arrivalDate:"2026-10-30",departureDate:"2026-11-02",
  weekendStart:"2026-10-30",weekendEnd:"2026-11-02",
  requestedArrival:null,requestedDeparture:null,extraNightsStatus:"none",
  dietaryNotes:null,notes:null,extraNights:null,termsVersion:"booking-test-v1"
};
const DEELNEMER_LAATSTE={...DEELNEMER_ONVOLLEDIG,participantId:"deel-4",
  name:"TEST – Deelnemer vier",email:"vier@example.invalid",
  bookingComplete:true,outstanding:0,booking:BOEKING};

before(async()=>{
  server=http.createServer((request,response)=>{
    let body="";request.on("data",c=>body+=c);request.on("end",()=>{
      const invoer=body?JSON.parse(body):{};
      aanroepen.push({url:request.url,invoer});
      response.setHeader("content-type","application/json");
      // Een deelnemerkenmerk kent de boekingtabel niet.
      if(request.url==="/rest/v1/rpc/confirm_tavern_payment")
        return response.end(JSON.stringify({status:"unknown_payment"}));
      if(request.url==="/rest/v1/rpc/confirm_participant_payment")
        return response.end(JSON.stringify(deelnemerResultaat));
      if(request.url==="/rest/v1/rpc/mark_participant_confirmation_email_sent"){
        if(markFaalt){response.statusCode=500;return response.end(JSON.stringify({message:"mark_failed"}));}
        if(markWeigert)return response.end(JSON.stringify({status:"not_found"}));
        return response.end(JSON.stringify({status:"marked"}));
      }
      if(request.url==="/rest/v1/rpc/mark_tavern_notification_sent_by_claim")
        return response.end(JSON.stringify({status:"marked",claimId:invoer.p_claim_id}));
      if(request.url==="/documents/terms.pdf"||request.url==="/documents/travel.pdf"){
        response.setHeader("content-type","application/pdf");
        return response.end(`%PDF-1.4 ${"x".repeat(200)}`);
      }
      if(request.url==="/emails"){
        if(mailFaalt){response.statusCode=500;return response.end(JSON.stringify({message:"email_failed"}));}
        mails.push(invoer);
        return response.end(JSON.stringify({id:`mail_${mails.length}`}));
      }
      response.statusCode=404;response.end("{}");
    });
  });
  await listenOnTestPort(server);
  base=`http://127.0.0.1:${server.address().port}`;
  globalThis.fetch=(input,options)=>{
    const url=String(input);
    if(url.startsWith("https://api.resend.com/"))return nativeFetch(`${base}/emails`,options);
    if(url.startsWith(base))return nativeFetch(input,options);
    return Promise.reject(new Error(`test_reached_the_network: ${url}`));
  };
  process.env.SUPABASE_URL=base;
  process.env.SUPABASE_SERVICE_ROLE_KEY="service";
  process.env.STRIPE_WEBHOOK_SECRET="whsec_test";
  process.env.RESEND_API_KEY="re_test";
  process.env.TAVERN_FROM_EMAIL="tavern@example.invalid";
  process.env.URL=base;
  process.env.NODE_ENV="test";
  process.env.TAVERN_PAYMENTS_ENABLED="true";
  process.env.BOOKING_TERMS_VERSION="booking-test-v1";
  process.env.BOOKING_TERMS_DOCUMENT_URL="/documents/terms.pdf";
  process.env.TRAVEL_INFORMATION_DOCUMENT_URL="/documents/travel.pdf";
  process.env.LEWOS_GENERAL_EMAIL="lewos.co@gmail.com";
  process.env.FONTECHA_ACCOMMODATION_EMAIL="accommodation@example.invalid";
  // De agenda blijft bewust oningesteld: die heeft zijn eigen tests, en een boeking mag
  // niet op een ontbrekende agendasleutel stuklopen.
  delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
});
after(async()=>{globalThis.fetch=nativeFetch;await stopTestServer(server);});
beforeEach(()=>{aanroepen=[];mails=[];mailFaalt=false;markFaalt=false;markWeigert=false;deelnemerResultaat=DEELNEMER_ONVOLLEDIG;});

const webhook=async(reference="tav_aaaa1111bbbb2222cccc3333dddd4444")=>{
  const {handler}=await import("../netlify/functions/stripe-webhook.mjs");
  const body=JSON.stringify({type:"checkout.session.completed",created:Math.floor(Date.now()/1000),
    data:{object:{payment_status:"paid",metadata:{payment_reference:reference}}}});
  const t=Math.floor(Date.now()/1000);
  const signature=createHmac("sha256","whsec_test").update(`${t}.${body}`).digest("hex");
  return handler({httpMethod:"POST",headers:{"stripe-signature":`t=${t},v1=${signature}`},body});
};
const mailsAan=adres=>mails.filter(m=>(m.to||[]).includes(adres));
const gebruikt=naam=>aanroepen.some(a=>a.url.endsWith(`/${naam}`));

test("een deelnemerbetaling wordt vastgelegd in plaats van te blijven steken",async()=>{
  const uit=await webhook();
  assert.equal(uit.statusCode,200,"een geldige betaling hoort geen 500 te geven");
  assert.ok(gebruikt("confirm_tavern_payment"),"de boekingtabel wordt eerst geprobeerd");
  assert.ok(gebruikt("confirm_participant_payment"),"daarna de deelnemertabel");
  assert.equal(JSON.parse(uit.body).participantPaid,true);
});

test("de deelnemer krijgt zijn eigen bevestiging met de twee documenten",async()=>{
  await webhook();
  const aanHem=mailsAan("twee@example.invalid");
  assert.equal(aanHem.length,1,"precies één bevestiging naar deze deelnemer");
  assert.equal(aanHem[0].attachments.length,2,"de twee PDF's horen erbij");
  assert.match(aanHem[0].text,/€2,025\.00/,"zijn eigen bedrag hoort erin te staan");
  assert.match(aanHem[0].text,/booking-test-v1/,"de aanvaarde voorwaardenversie hoort erin");
});

test("de bevestiging noemt het groepstotaal niet en de anderen niet",async()=>{
  await webhook();
  const tekst=JSON.stringify(mailsAan("twee@example.invalid")[0]);
  assert.doesNotMatch(tekst,/8,100|810000|Deelnemer vier|Boeker/,
    "wie er nog moet betalen is niet zijn zaak");
});

test("zolang niet iedereen betaald heeft, krijgt de accommodatie niets",async()=>{
  await webhook();
  assert.equal(mailsAan("accommodation@example.invalid").length,0,
    "de accommodatie hoort één mail per boeking te krijgen, niet één per gast");
  assert.equal(mailsAan("lewos.co@gmail.com").length,0);
  assert.ok(!gebruikt("mark_tavern_notification_sent_by_claim"));
  assert.equal(JSON.parse((await webhook()).body).outstanding,2);
});

test("de laatste betaling maakt de boeking rond en dán gaat de accommodatie mee",async()=>{
  deelnemerResultaat=DEELNEMER_LAATSTE;
  const uit=await webhook();
  assert.equal(uit.statusCode,200);
  assert.equal(JSON.parse(uit.body).result.claimId,"claim-9");
  assert.equal(mailsAan("vier@example.invalid").length,1,"ook de laatste krijgt zijn eigen bevestiging");
  assert.equal(mailsAan("accommodation@example.invalid").length,1,"precies één mail naar de accommodatie");
  assert.ok(gebruikt("mark_tavern_notification_sent_by_claim"),"de registratie gaat op boekingsnummer");
});

test("de accommodatie krijgt de naam van de boeking, niet die van één deelnemer",async()=>{
  deelnemerResultaat=DEELNEMER_LAATSTE;
  await webhook();
  const naarAccommodatie=JSON.stringify(mailsAan("accommodation@example.invalid")[0]);
  assert.match(naarAccommodatie,/TEST – Boeker/,"de boekingnaam hoort erin");
  assert.doesNotMatch(naarAccommodatie,/Deelnemer vier/,
    "de naam van de laatste betaler hoort niet de boeking te worden");
  assert.match(naarAccommodatie,/4 guests/,"het aantal gasten komt uit de boeking");
});

test("een herhaalde webhook stuurt geen tweede bevestiging",async()=>{
  deelnemerResultaat={...DEELNEMER_ONVOLLEDIG,confirmationEmailSent:true};
  await webhook();
  assert.equal(mailsAan("twee@example.invalid").length,0,
    "de database had al vastgelegd dat de mail weg was");
});

test("mislukt de bevestigingsmail, dan probeert Stripe het opnieuw",async()=>{
  mailFaalt=true;
  const uit=await webhook();
  assert.equal(uit.statusCode,500);
  assert.equal(JSON.parse(uit.body).error,"confirmation_email_pending");
});

test("antwoordt de database zonder af te vinken, dan is de webhook niet klaar",async()=>{
  // Liever een herhaling dan een gast die twee bevestigingen krijgt omdat niemand heeft
  // vastgelegd dat de eerste weg was.
  markWeigert=true;
  const uit=await webhook();
  assert.equal(uit.statusCode,500);
  assert.equal(JSON.parse(uit.body).error,"confirmation_email_mark_failed");
});

test("valt het afvinken helemaal om, dan probeert Stripe het ook opnieuw",async()=>{
  markFaalt=true;
  const uit=await webhook();
  assert.equal(uit.statusCode,500);
  assert.equal(JSON.parse(uit.body).error,"confirmation_failed");
});

test("een betaling die de database niet kan bevestigen vraagt om aandacht",async()=>{
  deelnemerResultaat={status:"expired",participantId:"deel-2",claimId:"claim-9"};
  const uit=await webhook();
  assert.equal(uit.statusCode,500);
  assert.equal(JSON.parse(uit.body).error,"paid_booking_requires_attention");
  assert.equal(mails.length,0,"er hoort geen mail uit te gaan over een betaling die niet klopt");
});

test("zegt de database rond maar levert hij geen boeking, dan stopt de webhook",async()=>{
  // Dit hoort niet te kunnen. Gebeurt het toch, dan is stil doorgaan het ergste: dan is er
  // betaald, is de boeking rond, en weet de accommodatie het nooit.
  deelnemerResultaat={...DEELNEMER_LAATSTE,booking:null};
  const uit=await webhook();
  assert.equal(uit.statusCode,500);
  assert.equal(JSON.parse(uit.body).error,"paid_booking_requires_attention");
});
