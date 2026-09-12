import {createHmac,timingSafeEqual} from "node:crypto";
import {stayLines,STAY_STATUS} from "./_stay.mjs";
import {bookingDocuments,PUBLISHED_GUIDE_DOCUMENT} from "./_booking-config.mjs";
import {escapeHtml,labelledBlock,sendEmail} from "./_email.mjs";
import {readRecipients} from "./_recipients.mjs";
import {bookingEvent,calendarConfig,upsertBookingEvent} from "./_calendar.mjs";
import {environmentIsSafe,isProduction,unsafeEnvironmentBody,siteOrigin,requestOrigin} from "./_deploy-context.mjs";

const response=(statusCode,body)=>({statusCode,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"},body:JSON.stringify(body)});
const getHeader=(event,name)=>Object.entries(event.headers||{}).find(([key])=>key.toLowerCase()===name.toLowerCase())?.[1]||"";

const validSignature=(rawBody,header,secret)=>{
  const parts=header.split(",").map(part=>part.trim().split("=",2));
  const timestamp=parts.find(([key])=>key==="t")?.[1];
  const signatures=parts.filter(([key])=>key==="v1").map(([,value])=>value);
  if(!timestamp||signatures.length===0)return false;
  const age=Math.abs(Math.floor(Date.now()/1000)-Number(timestamp));
  if(!Number.isFinite(age)||age>300)return false;
  const expected=createHmac("sha256",secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return signatures.some(actual=>actual.length===expected.length&&timingSafeEqual(Buffer.from(actual),Buffer.from(expected)));
};

const rpc=async(name,body)=>{
  const result=await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/${name}`,{method:"POST",headers:{apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,authorization:`Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,"content-type":"application/json"},body:JSON.stringify(body)});
  if(!result.ok)throw new Error(`${name}:${result.status}:${await result.text()}`);
  return result.json();
};
const confirmPayment=(reference,paidAt)=>rpc("confirm_tavern_payment",{p_payment_reference:reference,p_paid_at:paidAt});
// Een deelnemerkenmerk staat niet in `tavern_seat_claims` maar in
// `tavern_booking_participants`. Tot 10 september 2026 werd daar niet naar gekeken: de
// bevestiging gaf `unknown_payment`, de webhook antwoordde 500, en Stripe bleef het opnieuw
// proberen terwijl de betaling nooit werd vastgelegd.
const confirmParticipant=(reference,paidAt)=>rpc("confirm_participant_payment",{p_payment_reference:reference,p_paid_at:paidAt});
const loadAttachment=async(origin,documentPath,filename)=>{
  const url=new URL(documentPath,origin);
  if(url.origin!==new URL(origin).origin)throw new Error("booking_document_origin_mismatch");
  const response=await fetch(url,{headers:{accept:"application/pdf"}});
  if(!response.ok)throw new Error(`booking_document:${response.status}`);
  const content=Buffer.from(await response.arrayBuffer());
  if(content.length<100||content.length>5_000_000||content.subarray(0,4).toString()!=="%PDF")throw new Error("invalid_booking_document");
  return {filename,content:content.toString("base64")};
};

// De gids is geen verkoopdocument: ontbreekt hij of is hij stuk, dan gaat de bevestiging
// gewoon door zonder. Een gast zonder gids is een ongemak; een gast zonder bevestiging na
// betaling is een incident.
const laadGids=async origin=>{
  if(!PUBLISHED_GUIDE_DOCUMENT)return null;
  try{return await loadAttachment(origin,PUBLISHED_GUIDE_DOCUMENT,"Lewos-Tavern-adventurers-guide.pdf");}
  catch(error){console.error("Guide attachment error",error);return null;}
};

const sendBookingEmail=async(booking,origin)=>{
  if(!process.env.RESEND_API_KEY||!process.env.TAVERN_FROM_EMAIL)return null;
  const documents=bookingDocuments();
  let attachments;
  try{attachments=await Promise.all([loadAttachment(origin,documents.terms,"Lewos-Tavern-booking-terms.pdf"),loadAttachment(origin,documents.travel,"Lewos-Tavern-travel-information.pdf")]);}
  catch(error){console.error("Booking document attachment error",error);return null;}
  const gids=await laadGids(origin); if(gids)attachments=[...attachments,gids];
  // De laatste mail vóór aankomst. Wie zijn allergie pas bij de checkout toevoegde, heeft
  // hem nergens anders bevestigd gezien — de ontvangstbevestiging ging al bij de aanmelding
  // de deur uit. Daarom staat hij hier, in beide formaten en met zijn regeleindes.
  const genoteerd=labelledBlock(
    [["Allergies & dietary requirements",booking.dietaryNotes],["Anything else",booking.notes]],
    "We have this on file for your weekend. If anything is wrong or missing, reply to this email."
  );
  const gasten=`${booking.seats} guest${booking.seats===1?"":"s"}`;
  // Geen codenaam in een aankoopbevestiging; zie de toelichting bij sendParticipantEmail.
  // De versie blijft vastgelegd in `tavern_seat_claims.terms_version`.
  const kop="Your party has a table.";
  const regels=[
    `Hi ${booking.name},`,
    `Payment has been received for ${gasten} at ${booking.weekendLabel}. Your booking is confirmed.`,
    "We will write again before the weekend for the guest details and everything you need — how to find us, what to bring, and what to expect when you arrive.",
    "The booking terms and the travel information are attached. They are yours to keep.",
    "See you in the mountains.",
    "Robert\nThe Lewos Tavern"
  ];
  // Het genoteerde blok hoort ná de bevestiging en vóór de rest: wie zijn allergie pas bij
  // de checkout toevoegde, heeft hem nergens anders bevestigd gezien.
  const tekst=`${kop}\n\n${regels[0]}\n\n${regels[1]}${genoteerd.text}\n\n${regels.slice(2).join("\n\n")}`;
  return sendEmail({to:booking.email,subject:`Your Lewos Tavern booking is confirmed`,
    idempotencyKey:`booking-confirmation-${booking.claimId}`,text:tekst,attachments,
    html:`<div style="font-family:Arial,sans-serif;line-height:1.65;color:#0F3B35"><h1 style="font-size:28px">${escapeHtml(kop)}</h1>`
      +`<p>${escapeHtml(regels[0])}</p><p>${escapeHtml(regels[1])}</p>${genoteerd.html}`
      +regels.slice(2).map(r=>`<p>${escapeHtml(r).replace(/\n/g,"<br>")}</p>`).join("")+`</div>`});
};

// De bevestiging voor één deelnemer die zijn eigen aandeel heeft betaald. Naar hem alleen,
// met zijn eigen bedrag en dezelfde twee documenten als de boeker krijgt — hij heeft ze op
// zijn betaalpagina gelezen en hoort ze te houden.
//
// Wat er bewust NIET in staat: het groepstotaal, de namen van de anderen, en hoeveel er nog
// openstaat. Dat een gast weet dat hij zelf klaar is, is genoeg; wie er nog moet betalen is
// niet zijn zaak. De hoofdboeker houdt het overzicht.
//
// Robert, 10 september 2026: **geen codenamen in een aankoopbevestiging.** Er stond
// "Booking terms accepted: booking-2026-v1" — dat is een databaseveld, geen zin voor iemand
// die net €2.025 heeft betaald voor een weekend waar hij naar uitkijkt. De versie wordt nog
// steeds vastgelegd, in `tavern_booking_participants.terms_version`, want daar hoort het
// bewijs. De gast krijgt de documenten zelf als bijlage en een zin die hij begrijpt.
const sendParticipantEmail=async(deelnemer,origin)=>{
  if(!process.env.RESEND_API_KEY||!process.env.TAVERN_FROM_EMAIL)return null;
  const documents=bookingDocuments();
  let attachments;
  try{attachments=await Promise.all([loadAttachment(origin,documents.terms,"Lewos-Tavern-booking-terms.pdf"),loadAttachment(origin,documents.travel,"Lewos-Tavern-travel-information.pdf")]);}
  catch(error){console.error("Participant document attachment error",error);return null;}
  const gids=await laadGids(origin); if(gids)attachments=[...attachments,gids];
  const bedrag=`€${(Number(deelnemer.amountCents)/100).toLocaleString("en-IE",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const kop="Your seat at the table.";
  const regels=[
    `Hi ${deelnemer.name},`,
    `Your share of ${bedrag} is paid, and your seat at ${deelnemer.weekendLabel} is yours.`,
    "We will write again before the weekend with everything you need — how to find us, what to bring, and what to expect when you arrive.",
    // Alleen bij een gefilmd weekend. Dit is het enige dat een gast na het betalen nog zelf
    // moet doen, en hij heeft er op zijn betaalpagina net voor afgevinkt — dan hoort hij te
    // lezen dat het komt. Weekend 02 wordt niet gefilmd; daar hoort deze zin niet te staan.
    ...(deelnemer.filmingRequired===true
      ?["Because this weekend is filmed, you will also receive your personal Filming & Media Agreement. Everyone completes their own — nobody can do it for you."]
      :[]),
    "The booking terms and the travel information are attached. They are yours to keep.",
    "See you in the mountains.",
    "Robert\nThe Lewos Tavern"
  ];
  return verstuur({to:deelnemer.email,subject:`Your seat at The Lewos Tavern is confirmed`,
    idempotencyKey:`participant-confirmation-${deelnemer.participantId}`,
    text:`${kop}\n\n${regels.join("\n\n")}`,attachments,
    html:`<div style="font-family:Arial,sans-serif;line-height:1.65;color:#0F3B35"><h1 style="font-size:28px">${escapeHtml(kop)}</h1>`
      +regels.map(r=>`<p>${escapeHtml(r).replace(/\n/g,"<br>")}</p>`).join("")+`</div>`});
};

// Eén plek voor het versturen. Elke mail uit deze functie heeft precies één ontvanger,
// en die staat er als los argument bij in plaats van ergens binnenin te worden gekozen:
// zo is aan de aanroep te zien wie hem krijgt.
// Staat sinds 6 september 2026 in `_email.mjs`, zodat de beheeromgeving dezelfde weg neemt.
const verstuur=sendEmail;

// Naar de accommodatie. Bewust alleen wat er nodig is om een kamer klaar te zetten:
// naam, aantal gasten, weekend, aankomst, vertrek en eventuele extra nachten. Geen
// allergie, geen dieetwens, geen vrij tekstveld en geen e-mailadres van de gast — die
// gaan naar Lewos, want Lewos is de verkoper en het aanspreekpunt.
//
// Engels én Spaans in dezelfde mail, op verzoek van Robert. De Nederlandse vertaling van
// beide teksten staat in `operations/mailroutering.md`.
//
// `arrivalDate` en `departureDate` komen uit `starts_on` en `ends_on` van het weekend.
// Levert de database ze niet, dan vallen de twee regels weg en blijft het weekendlabel
// over; dat draagt de datums al als tekst. Nooit zelf een datum uitrekenen.
const sendAccommodationEmail=(booking,to)=>{
  const gasten=`${booking.seats} guest${booking.seats===1?"":"s"}`;
  const huespedes=`${booking.seats} huésped${booking.seats===1?"":"es"}`;
  // Eén rij per gegeven, met het kopje in beide talen. Zo staat elke waarde er maar één
  // keer: twee losse blokken zouden bij een wijziging uit elkaar kunnen lopen, en dan
  // staat er een aankomstdatum in het Engels en een andere in het Spaans.
  // Twee blokken, en dat is de hele reden dat deze mail is herschreven. Het eerste blok
  // is wat vaststaat. Het tweede is een vraag. Ze stonden eerst door elkaar, met "extra
  // nachten" onder dezelfde kop als de aankomstdatum — dan leest de accommodatie een
  // aanvraag als een afspraak.
  const velden=labelledBlock([
    ["Guest name / Nombre del huésped",booking.name],
    ["Number of guests / Número de huéspedes",String(booking.seats)],
    ["Weekend / Fin de semana",booking.weekendLabel],
    ["Arrival / Llegada",booking.arrivalDate],
    ["Departure / Salida",booking.departureDate],
    ["Booking reference / Referencia de la reserva",booking.claimId]
  ],"Confirmed booking / Reserva confirmada:");
  // Alleen wanneer er iets gevraagd is. Geen aanvraag, geen blok — dan is er niets te
  // beantwoorden en hoeft er ook niets te staan.
  const aanvraag=booking.extraNightsRequest
    ?labelledBlock([["Requested / Solicitado",booking.extraNightsRequest]],
       "NOT YET CONFIRMED — extra nights requested / TODAVÍA NO CONFIRMADO — noches adicionales solicitadas:")
    :{text:"",html:""};
  const antwoord=booking.extraNightsRequest
    ?"Please reply to Robert to confirm or decline these extra nights. The dates above are the confirmed stay and do not include them. "
     +"· Por favor, responda a Robert para confirmar o rechazar estas noches adicionales. Las fechas de arriba son la estancia confirmada y no las incluyen."
    :"";
  const kop="A Lewos Tavern booking is confirmed and paid. · Una reserva de The Lewos Tavern está confirmada y pagada.";
  const vraag=`Accommodation is needed for ${gasten}. · Se necesita alojamiento para ${huespedes}.`;
  const slot="Questions about this booking go to Robert at Lewos. · Las dudas sobre esta reserva van a Robert, en Lewos.";
  const tekst=`${kop}\n\n${vraag}${velden.text}${aanvraag.text}${antwoord?`\n\n${antwoord}`:""}\n\n${slot}\n\nThe Lewos Tavern`;
  return verstuur({
    to,
    subject:`Confirmed Tavern booking / Reserva confirmada — ${booking.name}, ${gasten}`,
    text:tekst,
    html:`<div style="font-family:Arial,sans-serif;line-height:1.65;color:#0F3B35"><h1 style="font-size:22px">${escapeHtml(kop)}</h1><p>${escapeHtml(vraag)}</p>${velden.html}${aanvraag.html}${antwoord?`<p><strong>${escapeHtml(antwoord)}</strong></p>`:""}<p>${escapeHtml(slot)}</p><p>The Lewos Tavern</p></div>`,
    idempotencyKey:`booking-accommodation-${booking.claimId}`
  });
};

// Naar Lewos. Alleen wanneer er iets bijzonders is: een allergie, een dieetwens of een
// opmerking. Een boeking zonder die drie levert geen mail op — dan is er ook niets te
// melden dat niet al in de database staat.
const sendSpecialRequirementsEmail=async(booking,to)=>{
  const velden=labelledBlock([
    // Eén veld sinds 5 september 2026. Het staat hier nog steeds apart van "Anything
    // else": een allergie moet terug te vinden zijn zonder een vrije tekst door te lezen.
    ["Allergies & dietary requirements",booking.dietaryNotes],
    ["Anything else",booking.notes]
  ],"What this guest told us:");
  if(!velden.text)return "nothing_to_report";
  const wie=labelledBlock([
    ["Guest name",booking.name],
    ["Email",booking.email],
    ["Number of guests",String(booking.seats)],
    ["Weekend",booking.weekendLabel],
    ["Booking reference",booking.claimId]
  ],"Booking:");
  const tekst=`A confirmed Tavern booking needs something arranged.${wie.text}${velden.text}\n\nThe Lewos Tavern`;
  return verstuur({
    to,
    subject:`Special requirements — ${booking.name}`,
    text:tekst,
    html:`<div style="font-family:Arial,sans-serif;line-height:1.65;color:#0F3B35"><h1 style="font-size:24px">A confirmed Tavern booking needs something arranged.</h1>${wie.html}${velden.html}<p>The Lewos Tavern</p></div>`,
    idempotencyKey:`booking-special-${booking.claimId}`
  });
};

// ── Alles wat pas geldt als de héle boeking betaald is ────────────────────────
// De accommodatie, de bijzondere wensen en de agenda gaan over de boeking als geheel, niet
// over één betaling. Bij een groep van vier hoort de accommodatie één mail te krijgen en
// niet vier. Daarom staat dit blok apart: het First Access-pad roept het aan zodra die ene
// betaling binnen is, en het groepspad zodra de laatste deelnemer heeft betaald.
//
// Geeft `null` terug als alles is gelukt, en anders het antwoord dat de webhook moet geven.
// Een 500 laat Stripe het opnieuw proberen, en dat is de bedoeling: een betaalde boeking
// waarvan de accommodatie niets weet, is een gast zonder bed.
const rondBoekingAf=async boeking=>{
  // Wat vaststaat en wat gevraagd is, uit elkaar getrokken. De regel voor de
  // accommodatie wordt hier opgebouwd uit de opgeslagen datums; hij wordt niet
  // overgenomen uit een tekstveld dat iets anders zou kunnen zeggen. Staat er nog een
  // oude vrije tekst in de database, dan reist die mee als wat hij is: de eigen woorden
  // van de gast.
  const verblijf=stayLines({
    weekendStart:boeking.weekendStart||boeking.arrivalDate,
    weekendEnd:boeking.weekendEnd||boeking.departureDate,
    requestedArrival:boeking.requestedArrival,requestedDeparture:boeking.requestedDeparture,
    status:boeking.extraNightsStatus,
    confirmedArrival:boeking.arrivalDate,confirmedDeparture:boeking.departureDate,
    legacyText:boeking.extraNights||""
  });

  // De gast heeft zijn bevestiging. Nu de twee interne meldingen, allebei naar één
  // vast postvak. Ze staan ná de bevestiging omdat de gast voorgaat, en ze geven een
  // 500 terug als ze niet lukken: Stripe probeert de webhook dan opnieuw. Dat is de
  // bedoeling — een betaalde boeking waarvan de accommodatie niets weet, is een gast
  // zonder bed. De herhaling stuurt de gast geen tweede bevestiging: die is in de
  // database afgevinkt. De `idempotency-key` houdt ook de twee meldingen enkelvoudig.
  let mailboxes;
  try{mailboxes=readRecipients();}
  catch(error){console.error("Recipient configuration error",error);return response(500,{error:"recipient_configuration_invalid"});}
  if(!mailboxes.accommodation){
    console.error("Accommodation recipient not configured: set FONTECHA_ACCOMMODATION_EMAIL");
    return response(500,{error:"accommodation_recipient_not_configured"});
  }
  // Het NOT YET CONFIRMED-blok hoort alleen bij een aanvraag die nog open staat. Heeft de
  // accommodatie de nachten al toegezegd of geweigerd, dan is er niets meer te beantwoorden
  // -- en dan is dat blok erger dan leeg: het vraagt de accommodatie om te beslissen over
  // nachten waarover ze al besloten heeft, terwijl de aankomstdatum erboven ze al bevat.
  // `stayLines` vult de aanvraagregel altijd, ook bij `confirmed`; dat is met opzet, want
  // de beheeromgeving wil hem wél blijven zien. De keuze hoort dus hier.
  const openAanvraag=verblijf.extraNightsStatus!==STAY_STATUS.confirmed
    &&verblijf.extraNightsStatus!==STAY_STATUS.declined
    ?verblijf.extraNightsRequest:"";
  const accommodatieId=await sendAccommodationEmail({...boeking,extraNightsRequest:openAanvraag},mailboxes.accommodation);
  if(!accommodatieId)return response(500,{error:"accommodation_notification_pending"});
  const bijzonderId=await sendSpecialRequirementsEmail(boeking,mailboxes.general);
  if(!bijzonderId)return response(500,{error:"special_requirements_notification_pending"});
  // Vastleggen dát ze weg zijn, zodat de beheeromgeving "verstuurd" kan zeggen in plaats
  // van "niet vastgelegd". Lukt het vastleggen niet, dan gaat de boeking gewoon door: de
  // mail is al de deur uit, en het overzicht toont hem dan als klaargezet. Te weinig
  // beweren is hier de veilige kant — nooit "verstuurd" claimen zonder registratie.
  for(const [soort,providerId] of [["accommodation",accommodatieId],["special",bijzonderId]]){
    if(providerId==="nothing_to_report")continue;
    try{await rpc("mark_tavern_notification_sent_by_claim",{p_claim_id:boeking.claimId,p_kind:soort,p_provider_id:providerId});}
    catch(error){console.error("Notification mark error",soort,error);}
  }
  // De gedeelde Lewos-agenda. Staat de koppeling niet ingesteld, dan slaan we hem over:
  // dat is de stand tot Robert de sleutel in Netlify zet, en een boeking mag daar niet
  // op stuklopen. Is hij wél ingesteld, dan telt hij mee — een boeking die niet in de
  // agenda staat, bestaat voor Nadine niet. Eén afspraak per boeking, ook bij een
  // herhaalde webhook: het afspraak-id is afgeleid van het boekingskenmerk.
  let calendar;
  try{calendar=calendarConfig();}
  catch(error){console.error("Calendar configuration error",error);return response(500,{error:"calendar_configuration_invalid"});}
  if(calendar){
    if(!boeking.arrivalDate||!boeking.departureDate){
      console.error("Calendar skipped: the database returned no arrival or departure date",{claimId:boeking.claimId});
      return response(500,{error:"calendar_dates_missing"});
    }
    try{
      // **`arrivalDate` en `departureDate` zijn het bevestigde verblijf.** Een
      // aangevraagde nacht rekt de afspraak niet op: Nadine ziet in de agenda wat
      // vaststaat, en de aanvraag staat in de beheeromgeving en in de mail aan de
      // accommodatie. Een agenda die een nacht toont die niemand heeft toegezegd, is
      // een kamer die op de verkeerde dag klaarstaat.
      await upsertBookingEvent(calendar,bookingEvent({
        claimId:boeking.claimId,name:boeking.name,seats:boeking.seats,weekendLabel:boeking.weekendLabel,
        arrivalDate:boeking.arrivalDate,departureDate:boeking.departureDate,
        extraNights:verblijf.extraNightsStatus===STAY_STATUS.requested?verblijf.extraNightsRequest:""
      }));
    }catch(error){console.error("Calendar event error",error);return response(500,{error:"calendar_event_pending"});}
  }else console.warn("Calendar not configured; no event created for booking",boeking.claimId);
  return null;
};

export const handler=async event=>{
  // Een deploycontext zonder eigen instellingen schrijft niets. Zie _deploy-context.mjs.
  if(!environmentIsSafe())return response(503,unsafeEnvironmentBody());
  if(event.httpMethod!=="POST")return response(405,{error:"method_not_allowed"});
  if(!process.env.STRIPE_WEBHOOK_SECRET||!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY)return response(503,{error:"webhook_not_configured"});
  const rawBody=event.isBase64Encoded?Buffer.from(event.body||"","base64").toString("utf8"):event.body||"";
  if(!validSignature(rawBody,getHeader(event,"stripe-signature"),process.env.STRIPE_WEBHOOK_SECRET))return response(400,{error:"invalid_signature"});
  let stripeEvent;
  try{stripeEvent=JSON.parse(rawBody);}catch{return response(400,{error:"invalid_payload"});}
  // De bijlagen worden van onze eigen site gehaald. Op een preview is dat de preview zelf.
  const herkomst=requestOrigin(event);
  if(isProduction()&&stripeEvent.livemode!==true){
    console.error("Ignored non-live Stripe event in production");
    return response(200,{received:true,ignored:true,reason:"test_event_in_production"});
  }
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
    const betaaldOp=new Date(Number(stripeEvent.created)*1000).toISOString();
    const result=await confirmPayment(reference,betaaldOp);

    // Een deelnemerkenmerk staat niet in `tavern_seat_claims`. Vóór 10 september 2026 bleef
    // het hier steken: `unknown_payment`, een 500, en Stripe die het bleef proberen terwijl
    // de betaling nooit werd vastgelegd. Nu is dat het signaal dat dit een groepsbetaling is.
    if(result.status==="unknown_payment"){
      const deelnemer=await confirmParticipant(reference,betaaldOp);
      if(deelnemer.status!=="paid"){
        console.error("Paid participant session could not be confirmed",
          {reference,status:deelnemer.status,claimId:deelnemer.claimId});
        return response(500,{error:"paid_booking_requires_attention"});
      }
      // Zijn eigen bevestiging, met zijn eigen bedrag. Eén per deelnemer, ook bij een
      // herhaalde webhook: de database houdt bij dat hij weg is.
      if(!deelnemer.confirmationEmailSent){
        const providerId=await sendParticipantEmail(deelnemer,herkomst);
        if(!providerId)return response(500,{error:"confirmation_email_pending"});
        const marked=await rpc("mark_participant_confirmation_email_sent",
          {p_payment_reference:reference,p_provider_id:providerId});
        if(marked.status!=="marked")return response(500,{error:"confirmation_email_mark_failed"});
      }
      // Nog niet iedereen. De accommodatie en de agenda wachten tot de laatste betaald
      // heeft: één mail per boeking, niet één per gast.
      if(!deelnemer.bookingComplete)
        return response(200,{received:true,participantPaid:true,outstanding:deelnemer.outstanding});
      if(!deelnemer.booking){
        console.error("Booking complete but no booking payload returned",{reference,claimId:deelnemer.claimId});
        return response(500,{error:"paid_booking_requires_attention"});
      }
      const mislukt=await rondBoekingAf(deelnemer.booking);
      if(mislukt)return mislukt;
      return response(200,{received:true,result:deelnemer.booking});
    }

    if(result.status!=="paid"){
      console.error("Paid Stripe session could not be confirmed",{reference,status:result.status,claimId:result.claimId});
      return response(500,{error:"paid_booking_requires_attention"});
    }
    if(!result.confirmationEmailSent){
      const providerId=await sendBookingEmail(result,herkomst);
      if(!providerId)return response(500,{error:"confirmation_email_pending"});
      const marked=await rpc("mark_tavern_confirmation_email_sent",{p_payment_reference:reference,p_provider_id:providerId});
      if(marked.status!=="marked")return response(500,{error:"confirmation_email_mark_failed"});
    }
    const mislukt=await rondBoekingAf(result);
    if(mislukt)return mislukt;
    return response(200,{received:true,result});
  }catch(error){console.error("Payment confirmation error",error);return response(500,{error:"confirmation_failed"});}
};
