// Wie krijgt welke mail. Twee postvakken, en ze mogen nooit door elkaar lopen.
//
// 1. **Lewos** — `LEWOS_GENERAL_EMAIL`, standaard `lewos.co@gmail.com`. Alles wat geen
//    gewone accommodatieboeking is: vragen, allergieën, dieetwensen, toegankelijkheid,
//    aanvragen voor een private Tavern. Dit adres staat al door de hele site en blijft
//    het hoofdadres van Lewos; de omgevingsvariabele kan het verplaatsen, niet vervangen.
// 2. **De accommodatie** — `FONTECHA_ACCOMMODATION_EMAIL`. Bevestigde boekingen en wat
//    Fontecha nodig heeft om een bed klaar te zetten: naam, aantal gasten, weekend,
//    aankomst en vertrek, en eventuele extra nachten.
//
// Bewust géén standaardwaarde voor het tweede adres. Het is het postvak van een derde
// partij en dat hoort niet in een repository; zonder de variabele gaat er dus niets naar
// de accommodatie, en dat zegt de functie hardop in plaats van stil te blijven.
//
// De strikte scheiding is geen nette gewoonte maar de kern van de opdracht: op het ene
// adres komen dieetwensen en persoonlijke vragen, op het andere alleen wat nodig is om
// een kamer te reserveren. Wie de twee door elkaar haalt, stuurt een allergie naar een
// partij die daar niets mee te maken heeft. Daarom controleert `readRecipients()` dat de
// twee adressen verschillen, en weigert `resendPayload()` in `_email.mjs` elke mail die
// ze allebei tegelijk als ontvanger heeft.

const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Het hoofdadres van Lewos. Verandert alleen mee met de omgevingsvariabele.
export const LEWOS_GENERAL_DEFAULT="lewos.co@gmail.com";

const lees=naam=>String(process.env[naam]||"").trim().toLowerCase();

export const readRecipients=()=>{
  const general=lees("LEWOS_GENERAL_EMAIL")||LEWOS_GENERAL_DEFAULT;
  const accommodation=lees("FONTECHA_ACCOMMODATION_EMAIL");
  if(!EMAIL.test(general))throw new Error("general_recipient_invalid");
  if(accommodation&&!EMAIL.test(accommodation))throw new Error("accommodation_recipient_invalid");
  // Eén adres voor allebei zou de scheiding stilzwijgend opheffen. Liever geen mail dan
  // een dieetwens op het verkeerde bureau.
  if(accommodation&&accommodation===general)throw new Error("recipient_mixup");
  return {general,accommodation:accommodation||null};
};

// Voor de controle in `_email.mjs`: staan er twee verschillende postvakken in één
// ontvangerslijst, dan is er iets door elkaar gelopen. Faalt het uitlezen van de
// variabelen, dan laat deze controle de mail door — de aanroeper krijgt die fout al
// via `readRecipients()` en een tweede fout hier zou hem alleen maskeren.
export const recipientsAreMixed=to=>{
  let mailboxes;
  try{mailboxes=readRecipients();}catch{return false;}
  if(!mailboxes.accommodation)return false;
  const adressen=(Array.isArray(to)?to:[to]).map(waarde=>String(waarde||"").trim().toLowerCase());
  return adressen.includes(mailboxes.general)&&adressen.includes(mailboxes.accommodation);
};
