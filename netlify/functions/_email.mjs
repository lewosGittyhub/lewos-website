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
  const payload={from,to,reply_to:replyTo,subject,text,html};
  if(attachments)payload.attachments=attachments;
  return payload;
};
