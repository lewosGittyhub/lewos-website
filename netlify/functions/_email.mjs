// Gedeelde bouwstenen voor elke mail die Lewos verstuurt.
//
// Twee regels die overal gelden:
//
// 1. **Elke mail gaat als HTML én als platte tekst de deur uit.** Een postvak dat geen
//    HTML toont, of een schermlezer die de tekstversie pakt, hoort dezelfde inhoud te
//    zien — inclusief een allergie. Tot 2 september 2026 was elke mail HTML-only.
// 2. **Regeleindes blijven staan.** Een gast typt zijn allergieën vaak onder elkaar, en
//    "Peanuts - severe" mag niet overlopen in "Shellfish".
//
// `escapeHtml` stond viermaal los in de repo; hij staat nu hier.

import {recipientsAreMixed} from "./_recipients.mjs";
import {environmentIsSafe,deployContext} from "./_deploy-context.mjs";

export const escapeHtml=value=>String(value).replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));

// Eerst ontsnappen, dán pas de regeleindes omzetten. Die volgorde is wat dit veilig
// houdt: andersom zou een `<br>` uit de invoer zelf blijven staan.
export const escapeLines=value=>escapeHtml(value).replace(/\r?\n/g,"<br>");

// Een blok met gelabelde velden, in beide formaten. Een leeg veld valt volledig weg —
// geen kopje, geen lege regel. Is alles leeg, dan komt het blok er helemaal niet.
//
// velden: [[label, waarde], ...]
export const labelledBlock=(velden,inleiding)=>{
  const gevuld=velden.map(([label,waarde])=>[label,String(waarde??"").trim()]).filter(([,waarde])=>waarde!=="");
  if(!gevuld.length)return{html:"",text:""};
  return{
    html:`<p>${escapeHtml(inleiding)}</p><ul>${gevuld.map(([label,waarde])=>`<li><strong>${escapeHtml(label)}:</strong><br>${escapeLines(waarde)}</li>`).join("")}</ul>`,
    // Twee spaties voor elke regel, zodat vervolgregels zichtbaar bij hun kopje horen.
    // Een lege regel krijgt die inspringing niet: dat zou een regel met alleen spaties zijn.
    text:`\n\n${inleiding}\n\n`+gevuld.map(([label,waarde])=>
      `${label}:\n`+waarde.split(/\r?\n/).map(regel=>regel.trim()===""?"":"  "+regel).join("\n")).join("\n\n")
  };
};

// Elke Resend-payload loopt hierlangs, zodat er nooit een mail uitgaat zonder tekstversie.
export const resendPayload=({from,to,replyTo="lewos.co@gmail.com",subject,html,text,attachments})=>{
  if(!html||!String(html).trim())throw new Error("email_html_missing");
  if(!text||!String(text).trim())throw new Error("email_text_missing");
  // Een onderwerpregel met een regeleinde is een kopregel-injectie. Dat kan hier niet
  // ontstaan — de onderwerpen zijn vaste tekst — maar de controle hoort op de plek te
  // staan waar elke mail langskomt.
  if(/[\r\n]/.test(String(subject)))throw new Error("email_subject_newline");
  // Elke mail passeert deze functie, dus staat hier ook de scheiding tussen de twee
  // postvakken. Het adres van Lewos en dat van de accommodatie in één ontvangerslijst
  // betekent dat een dieetwens of een persoonlijke vraag meeliftt naar een partij die
  // alleen de kamergegevens hoort te zien. Dat is geen mail die we alsnog versturen.
  if(recipientsAreMixed(to))throw new Error("email_recipient_mixup");
  const payload={from,to,reply_to:replyTo,subject,text,html};
  if(attachments)payload.attachments=attachments;
  return payload;
};

// Eén plek voor het daadwerkelijk versturen. Stond tot 6 september 2026 alleen in
// `stripe-webhook.mjs`, waardoor de beheeromgeving geen enkele mail kón versturen: de knop
// "Herinneren" legde iets vast en stuurde niets. Nu delen beide dezelfde weg.
//
// Geeft de provider-id terug, of `null` als er niets verstuurd is. **`null` betekent: er is
// geen mail de deur uit.** Wie deze functie aanroept moet dat afhandelen en mag nooit
// "verstuurd" melden op een `null`.
export const sendEmail=async({to,subject,text,html,idempotencyKey,attachments})=>{
  // Een preview die de productiesleutel erft zou echte mail naar echte gasten sturen.
  // Zolang die context niet uitdrukkelijk als veilig is gemarkeerd, gaat er niets uit.
  if(!environmentIsSafe()){
    console.warn(`Email withheld: deploy context "${deployContext()}" is not marked preview-safe`);
    return null;
  }
  if(!process.env.RESEND_API_KEY||!process.env.TAVERN_FROM_EMAIL)return null;
  const response=await fetch("https://api.resend.com/emails",{method:"POST",
    headers:{authorization:`Bearer ${process.env.RESEND_API_KEY}`,"content-type":"application/json",
      ...(idempotencyKey?{"idempotency-key":idempotencyKey}:{})},
    body:JSON.stringify(resendPayload({from:process.env.TAVERN_FROM_EMAIL,to:[to],subject,text,html,attachments}))});
  if(!response.ok){console.error("Email error",subject,response.status,await response.text());return null;}
  const result=await response.json();
  return result.id||"resend-accepted";
};
