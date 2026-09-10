// Het persoonlijke betaalverzoek. Eén deelnemer, één bedrag, één link.
//
// De belangrijkste regel staat in de bedragen: **iedere deelnemer krijgt zijn eigen aandeel
// te zien, nooit het groepstotaal.** Vier deelnemers van €2.025 is vier keer €2.025, en de
// mail noemt nergens €8.100 — anders betaalt iemand in verwarring het hele bedrag.
//
// De deadline is voor iedereen dezelfde en komt uit de blokkering, niet uit het moment van
// versturen. Daarom staat hij hier als parameter en wordt hij niet berekend: een herinnering
// die later de deur uit gaat draagt exact dezelfde tijd als de eerste mail.

import {escapeHtml,labelledBlock} from "./_email.mjs";

const geld=centen=>`€${(Number(centen)/100).toLocaleString("en-IE",{minimumFractionDigits:2,maximumFractionDigits:2})}`;

const klok=iso=>new Date(iso).toLocaleString("en-GB",{dateStyle:"medium",timeStyle:"short",timeZone:"Europe/Madrid"});

// `reminder` verandert alleen de toon en het onderwerp. Niet de deadline, niet het bedrag,
// niet de link — een herinnering is hetzelfde verzoek, nog een keer.
export const buildPaymentRequestEmail=({participant,booking,deadline,paymentUrl,reminder=false})=>{
  if(!participant?.email)throw new Error("payment_request_participant_missing");
  if(!deadline)throw new Error("payment_request_deadline_missing");
  if(!paymentUrl)throw new Error("payment_request_url_missing");

  const naam=participant.full_name||participant.name||"there";
  const bedrag=geld(participant.amount_cents);
  const wanneer=klok(deadline);

  const kop=reminder
    ?`A reminder: your share of The Lewos Tavern booking is still to be paid.`
    :`Your seat at The Lewos Tavern — please complete your own payment.`;

  const uitleg=`You are booked as part of ${escapeHtml(booking.name)}'s group for ${escapeHtml(booking.weekendLabel||"the Tavern")}. `
    +`Everyone in the group pays their own share separately, so this link is yours alone.`;

  const feiten=labelledBlock([
    ["Your share",bedrag],
    ["Guest",naam],
    ["Weekend",booking.weekendLabel],
    ["Number of guests in the group",String(booking.seats||"")],
    ["Payment deadline",`${wanneer} (Europe/Madrid)`]
  ],"Your payment:");

  // Robert, 10 september 2026: de knop stond ná vijf feiten, en toen hij zelf de proefmail
  // las moest hij vragen hóe hij betaalde. Vier van die vijf feiten weet de gast al — zijn
  // naam, met wie hij gaat, welk weekend, hoeveel ze zijn. Daar hoeft hij niet langs om te
  // kunnen doen waarvoor de mail bestaat.
  //
  // Dus: knop direct onder de uitleg, en de feiten eronder als bevestiging. Het bedrag staat
  // op de knop én in de onderwerpregel, dus niemand klikt zonder te weten wat het kost.
  const knoplabel=`Pay your share — ${bedrag}`;
  const tekst=`${kop}\n\nHi ${naam},\n\n${uitleg.replace(/&#039;/g,"'")}\n\n`
    +`Pay your share here:\n${paymentUrl}\n\n`
    +`This is ${bedrag} — your own share, not the group total.`
    +`${feiten.text}\n\nEveryone in the group has the same deadline: ${wanneer}.\n\n`
    +`If the deadline passes, the seats already paid for stay confirmed. Nothing is released automatically.\n\n`
    +`Please check your spam folder if you cannot find this email again.\n\nRobert\nThe Lewos Tavern`;

  // `display:block` met een max-width maakt er een echte knop van: op een telefoon over de
  // volle breedte, op een laptop begrensd. En een leesbare link eronder, want een
  // mailprogramma dat de opmaak wegstript mag een gast niet stranden met een dode knop.
  const html=`<div style="font-family:Arial,sans-serif;line-height:1.65;color:#0F3B35">`
    +`<h1 style="font-size:24px">${escapeHtml(kop)}</h1>`
    +`<p>Hi ${escapeHtml(naam)},</p><p>${uitleg}</p>`
    +`<p style="margin:30px 0 14px"><a href="${escapeHtml(paymentUrl)}" `
    +`style="display:block;max-width:380px;padding:22px 24px;border-radius:12px;`
    +`background:#E5643A;color:#ffffff;font:700 20px/1.25 Arial,sans-serif;`
    +`text-decoration:none;text-align:center">${escapeHtml(knoplabel)}</a></p>`
    +`<p style="margin:0 0 26px"><small>If the button does not work, open this link:<br>`
    +`<a href="${escapeHtml(paymentUrl)}" style="color:#B4472A">${escapeHtml(paymentUrl)}</a></small></p>`
    +`<p>This is <strong>${escapeHtml(bedrag)}</strong> — your own share, not the group total.</p>`
    +`${feiten.html}`
    +`<p>Everyone in the group has the same deadline: <strong>${escapeHtml(wanneer)}</strong>.</p>`
    +`<p>If the deadline passes, the seats already paid for stay confirmed. Nothing is released automatically.</p>`
    +`<p><small>Please check your spam folder if you cannot find this email again.</small></p>`
    +`<p>Robert<br>The Lewos Tavern</p></div>`;

  return {
    to:participant.email,
    subject:reminder
      ?`Reminder — your share of ${bedrag} for The Lewos Tavern`
      :`Your payment link for The Lewos Tavern — ${bedrag}`,
    text:tekst,html
  };
};

// De melding aan Robert en Nadine wanneer de laatste verlenging ingaat. Geen gastgegevens
// meer dan nodig om contact op te nemen: naam en adres van wie nog niet betaald heeft.
export const buildOperatorNoticeEmail=({booking,deadline,unpaidParticipants=[]})=>{
  const wanneer=klok(deadline);
  const wie=labelledBlock(
    unpaidParticipants.map((p,i)=>[`Still unpaid ${i+1}`,`${p.name} <${p.email}>`]),
    "Who has not paid yet:");
  const tekst=`A group booking has entered its final payment extension.\n\n`
    +`${booking.name} · ${booking.seats} guests · ${booking.weekendLabel}\n`
    +`Final deadline: ${wanneer} (Europe/Madrid)${wie.text}\n\n`
    +`Nothing is released automatically. After the deadline the unpaid seats are marked "Action needed" `
    +`and stay blocked until Robert releases them.\n\nThe Lewos Tavern`;
  return {
    subject:`Final payment extension — ${booking.name}, ${booking.seats} guests`,
    text:tekst,
    html:`<div style="font-family:Arial,sans-serif;line-height:1.65;color:#0F3B35">`
      +`<h1 style="font-size:22px">A group booking has entered its final payment extension.</h1>`
      +`<p>${escapeHtml(booking.name)} &middot; ${escapeHtml(String(booking.seats))} guests &middot; ${escapeHtml(booking.weekendLabel||"")}<br>`
      +`Final deadline: <strong>${escapeHtml(wanneer)}</strong> (Europe/Madrid)</p>${wie.html}`
      +`<p>Nothing is released automatically. After the deadline the unpaid seats are marked &ldquo;Action needed&rdquo; `
      +`and stay blocked until Robert releases them.</p><p>The Lewos Tavern</p></div>`
  };
};
