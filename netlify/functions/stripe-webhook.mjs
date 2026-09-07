import {createHmac,timingSafeEqual} from "node:crypto";
import {stayLines,STAY_STATUS} from "./_stay.mjs";
import {bookingDocuments} from "./_booking-config.mjs";
import {escapeHtml,labelledBlock,sendEmail} from "./_email.mjs";
import {readRecipients} from "./_recipients.mjs";
import {bookingEvent,calendarConfig,upsertBookingEvent} from "./_calendar.mjs";

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
const loadAttachment=async(origin,documentPath,filename)=>{
  const url=new URL(documentPath,origin);
  if(url.origin!==new URL(origin).origin)throw new Error("booking_document_origin_mismatch");
  const response=await fetch(url,{headers:{accept:"application/pdf"}});
  if(!response.ok)throw new Error(`booking_document:${response.status}`);
  const content=Buffer.from(await response.arrayBuffer());
  if(content.length<100||content.length>5_000_000||content.subarray(0,4).toString()!=="%PDF")throw new Error("invalid_booking_document");
  return {filename,content:content.toString("base64")};
};
const sendBookingEmail=async booking=>{
  if(!process.env.RESEND_API_KEY||!process.env.TAVERN_FROM_EMAIL)return null;
  const origin=process.env.URL||"https://lewos.co";
  const documents=bookingDocuments();
  let attachments;
  try{attachments=await Promise.all([loadAttachment(origin,documents.terms,"Lewos-Tavern-booking-terms.pdf"),loadAttachment(origin,documents.travel,"Lewos-Tavern-travel-information.pdf")]);}
  catch(error){console.error("Booking document attachment error",error);return null;}
  // De laatste mail vóór aankomst. Wie zijn allergie pas bij de checkout toevoegde, heeft
  // hem nergens anders bevestigd gezien — de ontvangstbevestiging ging al bij de aanmelding
  // de deur uit. Daarom staat hij hier, in beide formaten en met zijn regeleindes.
  const genoteerd=labelledBlock(
    [["Allergies & dietary requirements",booking.dietaryNotes],["Anything else",booking.notes]],
    "We have this on file for your weekend. If anything is wrong or missing, reply to this email."
  );
  const gasten=`${booking.seats} guest${booking.seats===1?"":"s"}`;
  const termsVersie=booking.termsVersion||"not recorded";
  const tekst=`Your party has a table.\n\nHi ${booking.name},\n\nPayment has been received for ${gasten} at ${booking.weekendLabel}. Your booking is confirmed.${genoteerd.text}\n\nBooking terms accepted: ${termsVersie}. Keep this email and its two PDF attachments with your booking records.\n\nWe will contact you with the guest details and everything you need before the weekend.\n\nRobert\nThe Lewos Tavern`;
  return sendEmail({to:booking.email,subject:`Your Lewos Tavern booking is confirmed`,
    idempotencyKey:`booking-confirmation-${booking.claimId}`,text:tekst,attachments,
    html:`<div style="font-family:Arial,sans-serif;line-height:1.65;color:#0F3B35"><h1 style="font-size:28px">Your party has a table.</h1><p>Hi ${escapeHtml(booking.name)},</p><p>Payment has been received for ${gasten} at ${escapeHtml(booking.weekendLabel)}. Your booking is confirmed.</p>${genoteerd.html}<p><strong>Booking terms accepted:</strong> ${escapeHtml(termsVersie)}. Keep this email and its two PDF attachments with your booking records.</p><p>We will contact you with the guest details and everything you need before the weekend.</p><p>Robert<br>The Lewos Tavern</p></div>`});
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

export const handler=async event=>{
  if(event.httpMethod!=="POST")return response(405,{error:"method_not_allowed"});
  if(!process.env.STRIPE_WEBHOOK_SECRET||!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY)return response(503,{error:"webhook_not_configured"});
  const rawBody=event.isBase64Encoded?Buffer.from(event.body||"","base64").toString("utf8"):event.body||"";
  if(!validSignature(rawBody,getHeader(event,"stripe-signature"),process.env.STRIPE_WEBHOOK_SECRET))return response(400,{error:"invalid_signature"});
  let stripeEvent;
  try{stripeEvent=JSON.parse(rawBody);}catch{return response(400,{error:"invalid_payload"});}
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
    const result=await confirmPayment(reference,new Date(Number(stripeEvent.created)*1000).toISOString());
    if(result.status!=="paid"){
      console.error("Paid Stripe session could not be confirmed",{reference,status:result.status,claimId:result.claimId});
      return response(500,{error:"paid_booking_requires_attention"});
    }
    if(!result.confirmationEmailSent){
      const providerId=await sendBookingEmail(result);
      if(!providerId)return response(500,{error:"confirmation_email_pending"});
      const marked=await rpc("mark_tavern_confirmation_email_sent",{p_payment_reference:reference,p_provider_id:providerId});
      if(marked.status!=="marked")return response(500,{error:"confirmation_email_mark_failed"});
    }
    // Wat vaststaat en wat gevraagd is, uit elkaar getrokken. De regel voor de
    // accommodatie wordt hier opgebouwd uit de opgeslagen datums; hij wordt niet
    // overgenomen uit een tekstveld dat iets anders zou kunnen zeggen. Staat er nog een
    // oude vrije tekst in de database, dan reist die mee als wat hij is: de eigen woorden
    // van de gast.
    const verblijf=stayLines({
      weekendStart:result.weekendStart||result.arrivalDate,
      weekendEnd:result.weekendEnd||result.departureDate,
      requestedArrival:result.requestedArrival,requestedDeparture:result.requestedDeparture,
      status:result.extraNightsStatus,
      confirmedArrival:result.arrivalDate,confirmedDeparture:result.departureDate,
      legacyText:result.extraNights||""
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
    const accommodatieId=await sendAccommodationEmail({...result,extraNightsRequest:verblijf.extraNightsRequest},mailboxes.accommodation);
    if(!accommodatieId)return response(500,{error:"accommodation_notification_pending"});
    const bijzonderId=await sendSpecialRequirementsEmail(result,mailboxes.general);
    if(!bijzonderId)return response(500,{error:"special_requirements_notification_pending"});
    // Vastleggen dát ze weg zijn, zodat de beheeromgeving "verstuurd" kan zeggen in plaats
    // van "niet vastgelegd". Lukt het vastleggen niet, dan gaat de boeking gewoon door: de
    // mail is al de deur uit, en het overzicht toont hem dan als klaargezet. Te weinig
    // beweren is hier de veilige kant — nooit "verstuurd" claimen zonder registratie.
    for(const [soort,providerId] of [["accommodation",accommodatieId],["special",bijzonderId]]){
      if(providerId==="nothing_to_report")continue;
      try{await rpc("mark_tavern_notification_sent",{p_payment_reference:reference,p_kind:soort,p_provider_id:providerId});}
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
      if(!result.arrivalDate||!result.departureDate){
        console.error("Calendar skipped: the database returned no arrival or departure date",{claimId:result.claimId});
        return response(500,{error:"calendar_dates_missing"});
      }
      try{
        // **`arrivalDate` en `departureDate` zijn het bevestigde verblijf.** Een
        // aangevraagde nacht rekt de afspraak niet op: Nadine ziet in de agenda wat
        // vaststaat, en de aanvraag staat in de beheeromgeving en in de mail aan de
        // accommodatie. Een agenda die een nacht toont die niemand heeft toegezegd, is
        // een kamer die op de verkeerde dag klaarstaat.
        await upsertBookingEvent(calendar,bookingEvent({
          claimId:result.claimId,name:result.name,seats:result.seats,weekendLabel:result.weekendLabel,
          arrivalDate:result.arrivalDate,departureDate:result.departureDate,
          extraNights:verblijf.extraNightsStatus===STAY_STATUS.requested?verblijf.extraNightsRequest:""
        }));
      }catch(error){console.error("Calendar event error",error);return response(500,{error:"calendar_event_pending"});}
    }else console.warn("Calendar not configured; no event created for booking",result.claimId);
    return response(200,{received:true,result});
  }catch(error){console.error("Payment confirmation error",error);return response(500,{error:"confirmation_failed"});}
};
