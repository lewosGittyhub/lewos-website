// Het boekingsformulier, in twee stappen.
//
//   1. Weekend en aantal kiezen, dan bewust op "Hold these seats" klikken. Pas dán zet de
//      server de stoelen vast, zestig minuten. Alleen rondkijken blokkeert niets.
//   2. Gegevens invullen, ook naam en adres van iedere deelnemer, en indienen. Dezelfde
//      blokkering gaat over naar de betaalfase van dertig minuten; er komt tussendoor geen
//      stoel vrij.
//
// **De afteller is een weergave, geen waarheid.** Hij telt af op de deadline die de server
// heeft gegeven, en bij nul vraagt hij het de server opnieuw in plaats van zelf te besluiten
// dat het voorbij is. Verversen, een tabblad laten openstaan of de klok van de computer
// verzetten verandert niets: de deadline komt elke keer van de server, die hem afleidt uit
// het moment waarop de blokkering is aangemaakt.

import {createWeekendCalendar} from "/assets/weekend-calendar.js";
import {staySentence} from "/assets/stay.js";

const $=k=>document.querySelector(k);
const form=$("[data-public-booking-form]");
if(form){

const SESSIE="lewos.booking.session";
// Eén token per boekingssessie. Blijft staan bij verversen — dát is wat maakt dat de server
// dezelfde blokkering teruggeeft in plaats van een tweede aan te maken.
const sessieToken=()=>{
  let t=null;
  try{t=sessionStorage.getItem(SESSIE);}catch{}
  if(!t){
    t=[...crypto.getRandomValues(new Uint8Array(24))].map(b=>b.toString(16).padStart(2,"0")).join("");
    try{sessionStorage.setItem(SESSIE,t);}catch{}
  }
  return t;
};
const wisSessie=()=>{try{sessionStorage.removeItem(SESSIE);}catch{}};

const stapStoelen=$("[data-step-seats]");
const stapDetails=$("[data-step-details]");
const paneel=$("[data-hold-panel]");
const verzonden=$("[data-sent-panel]");
const holdFout=$("[data-hold-error]");
const boekFout=$("[data-booking-error]");
const deelnemersVak=$("[data-participants]");
const weekend=$("#weekend");
const mensen=$("#people");
const filmingInput=$("#filming-acknowledged");
const filmingNotice=$("[data-filming-notice]");
const filmingCheck=$("[data-filming-check]");
const kalenderVak=$("[data-weekend-calendar]");
const weekendVeld=$("[data-weekend-field]");
const gekozenRegel=$("[data-calendar-chosen]");
const verblijfRegel=$("[data-stay-line]");
const verblijfHint=$("[data-stay-hint]");
const aankomstVeld=$("[data-stay-arrival]");
const vertrekVeld=$("[data-stay-departure]");
const verblijfSamenvatting=$("[data-stay-recap]");
let kalender=null;
let weekends=[];

// De filmbevestiging hoort alleen bij Weekend 01, en mag nooit verplicht zijn terwijl hij
// verborgen staat — dan zou het formulier weigeren zonder te kunnen zeggen waarom.
const zetFilming=()=>{
  const opening=weekend.value==="weekend-01";
  if(filmingNotice)filmingNotice.hidden=!opening;
  if(filmingCheck)filmingCheck.hidden=!opening;
  if(filmingInput){filmingInput.required=opening;if(!opening)filmingInput.checked=false;}
};
weekend?.addEventListener("change",zetFilming);
zetFilming();

// De kalender is de zichtbare bediening; het keuzemenu blijft het veld dat de browser
// valideert en is de terugval als de beschikbaarheid niet geladen kan worden.
const toonWeekendVeld=()=>{
  if(!weekendVeld)return;
  weekendVeld.classList.toggle("is-visually-hidden",Boolean(kalender&&kalender.ready()));
};

// **Alleen een echte aanvraag gaat mee.** Vallen de datums samen met het weekend zelf,
// dan blijven de verborgen velden leeg — anders zou elke boeking binnenkomen alsof er
// extra nachten bij gevraagd zijn.
const onthoudVerblijf=stand=>{
  const heeftExtra=Boolean(stand?.valid&&stand.extraNights>0);
  if(aankomstVeld)aankomstVeld.value=heeftExtra?stand.arrival:"";
  if(vertrekVeld)vertrekVeld.value=heeftExtra?stand.departure:"";
  // De weekendregel noemt de datums al. Deze regel verschijnt pas als je verblijf daarvan
  // afwijkt — dan zegt hij iets nieuws in plaats van hetzelfde nog een keer.
  if(verblijfHint)verblijfHint.hidden=!heeftExtra;
  if(verblijfRegel)verblijfRegel.hidden=!heeftExtra;
  tekenSamenvatting(stand);
};

// Stap 2 herhaalt wat er in stap 1 is aangeklikt, want daar is de kalender niet meer te
// zien. De aangevraagde nachten staan er als aanvraag, niet als onderdeel van de boeking.
const tekenSamenvatting=stand=>{
  if(!verblijfSamenvatting)return;
  if(!stand?.valid){verblijfSamenvatting.hidden=true;return;}
  verblijfSamenvatting.hidden=false;
  $("[data-stay-recap-line]").textContent=staySentence(stand);
  $("[data-stay-recap-note]").textContent=stand.extraNights
    ?"The weekend itself is held and priced. The extra nights are a request: the accommodation has to confirm them, and they are not included in the amount above."
    :"Only the weekend itself. You can still ask for extra nights later by email.";
};

const kiesWeekend=slug=>{
  const item=weekends.find(w=>w.slug===slug);
  if(!gekozenRegel)return;
  // Zonder gekozen weekend zegt de kalender zelf al wat er moet gebeuren. Twee regels
  // die hetzelfde vragen, leest als twee dingen die je moet doen.
  gekozenRegel.hidden=!item||!(kalender&&kalender.ready());
  // De kalender laat in oranje al zien welk weekend het is; dat hoeft er niet nog eens
  // in woorden bij.
  if(item)gekozenRegel.textContent=`${item.label} · ${item.dateLabel} · ${item.remaining} of ${item.capacity} seats free`;
};

// De gedeelde agenda: welke nachten is het huis al kwijt? Lukt dit niet, dan blokkeert de
// kalender niets — extra nachten blijven dan gewoon op aanvraag, zoals voorheen.
const haalBezetteNachten=async(kalender,lijst)=>{
  if(!kalender||!lijst.length)return;
  const datums=lijst.flatMap(w=>[w.startsOn,w.endsOn]).filter(Boolean).sort();
  const marge=(datum,dagen)=>{const d=new Date(`${datum}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+dagen);return d.toISOString().slice(0,10);};
  try{
    const antwoord=await fetch(`/api/house-availability?from=${marge(datums[0],-40)}&to=${marge(datums[datums.length-1],40)}`,
      {headers:{accept:"application/json"}});
    if(!antwoord.ok)return;
    const gegevens=await antwoord.json();
    if(gegevens.configured&&Array.isArray(gegevens.busyNights))kalender.setBusyNights(gegevens.busyNights);
  }catch{/* Onbekend is niet hetzelfde als vrij: we blokkeren dan niets en beloven niets. */}
};

const bouwKalender=()=>{
  if(!kalenderVak)return;
  if(!kalender){
    kalender=createWeekendCalendar({
      mount:kalenderVak,summary:verblijfRegel,
      onChange:({slug,stay})=>{
        if(slug&&weekend.value!==slug){
          weekend.value=slug;
          weekend.dispatchEvent(new Event("change",{bubbles:true}));
        }
        onthoudVerblijf(stay);
        kiesWeekend(slug);
        toonWeekendVeld();
      }
    });
  }
  kalender.setWeekends(weekends);
  kalender.setWantedSeats(Number.parseInt(mensen.value,10)||1);
  if(weekend.value)kalender.select(weekend.value);
  kiesWeekend(weekend.value);
  toonWeekendVeld();
  haalBezetteNachten(kalender,weekends);
};

mensen?.addEventListener("input",()=>{if(kalender)kalender.setWantedSeats(Number.parseInt(mensen.value,10)||1);});
weekend?.addEventListener("change",()=>{if(kalender&&weekend.value)kalender.select(weekend.value);kiesWeekend(weekend.value);});

// De datums komen uit de database, niet uit deze pagina. Lukt dat niet, dan blijft het
// keuzemenu staan met de gepubliceerde labels — liever geen kalender dan een halve.
(async()=>{
  try{
    const antwoord=await fetch("/api/first-access",{headers:{accept:"application/json"}});
    if(!antwoord.ok)return;
    const gegevens=await antwoord.json();
    weekends=Array.isArray(gegevens.weekends)?gegevens.weekends:[];
    bouwKalender();
    // De server bepaalt of er geboekt kan worden, niet deze pagina. Staat de poort dicht,
    // dan gaat het formulier op slot vóórdat iemand iets invult — de server weigert het
    // toch, en dat pas na tien velden te horen krijgen is geen fijne ervaring.
    if(gegevens.publicBookingOpen!==true)sluitBoeking();
  }catch{/* Geen kalender is beter dan een kalender met verzonnen datums. */}
})();

let hold=null;
let tikker=null;

// Het formulier op slot, met uitleg erboven. Alles blijft leesbaar: prijzen, weekenden en
// de kalender mogen gewoon getoond worden, alleen boeken kan niet.
const sluitBoeking=()=>{
  const melding=document.querySelector("[data-booking-closed]");
  if(melding)melding.hidden=false;
  const formulier=document.querySelector("[data-public-booking-form]");
  if(!formulier)return;
  for(const veld of formulier.querySelectorAll("input,select,textarea,button"))veld.disabled=true;
  formulier.setAttribute("aria-disabled","true");
};

const toon=(vak,tekst)=>{if(!vak)return;vak.textContent=tekst;vak.hidden=!tekst;};
const tijd=s=>{const n=Math.max(0,Math.floor(s));return `${String(Math.floor(n/60)).padStart(2,"0")}:${String(n%60).padStart(2,"0")}`;};
const stip=iso=>new Date(iso).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"});

const api=async(pad,opties={})=>{
  const response=await fetch(pad,{headers:{"content-type":"application/json"},...opties});
  const body=await response.json().catch(()=>({}));
  return {ok:response.ok,status:response.status,body};
};

const stopTikker=()=>{if(tikker){clearInterval(tikker);tikker=null;}};

const startTikker=()=>{
  stopTikker();
  if(!hold?.expiresAt)return;
  const eind=new Date(hold.expiresAt).getTime();
  const doel=hold.phase==="payment"?$("[data-sent-countdown]"):$("[data-hold-countdown]");
  const teken=async()=>{
    const over=(eind-Date.now())/1000;
    if(doel)doel.textContent=tijd(over);
    if(over>0)return;
    stopTikker();
    // Nul op de klok betekent niet vanzelf dat het voorbij is; dat zegt de server.
    await ververs();
    // Blijft de server bij de betaalfase terwijl de deadline voorbij is, dan is de kous af:
    // zonder deze stap bleef de gast naar 00:00 kijken zonder enige weg terug.
    if(hold?.phase==="payment"&&new Date(hold.expiresAt).getTime()<=Date.now())toonVerlopen();
  };
  teken();
  tikker=setInterval(teken,1000);
};

const toonVerlopen=()=>{
  stopTikker();
  const blok=$("[data-sent-expired]");
  if(!blok)return;
  verzonden.hidden=true;
  blok.hidden=false;
};

$("[data-restart]")?.addEventListener("click",()=>{
  wisSessie();
  window.location.reload();
});

const ververs=async()=>{
  const {ok,body}=await api(`/api/hold?sessionToken=${encodeURIComponent(sessieToken())}`);
  if(!ok||body.expired||body.status==="ended"){
    stopTikker();hold=null;wisSessie();
    paneel.hidden=true;stapDetails.hidden=true;verzonden.hidden=true;zetStapStoelen(true);
    toon(holdFout,"Your seats were held for 60 minutes and that time has passed, so they have been released. "
      +"Availability has been checked again — please choose your weekend and party size once more.");
    return null;
  }
  hold=body;tekenPaneel();return body;
};

// Een verborgen veld mag nooit verplicht blijven: het formulier weigert dan te verzenden
// zonder te kunnen aanwijzen waarom. Een uitgeschakelde fieldset telt niet mee bij de
// validatie, dus stap 1 gaat uit zodra de stoelen vastliggen — en de gekozen waarden zetten
// we terug, zodat de filmbevestiging nog steeds weet welk weekend het is.
const zetStapStoelen=actief=>{
  stapStoelen.hidden=!actief;
  stapStoelen.disabled=!actief;
};

const tekenPaneel=()=>{
  if(!hold)return;
  if(hold.weekend&&weekend.value!==hold.weekend){weekend.value=hold.weekend;zetFilming();}
  if(hold.seats&&Number(mensen.value)!==hold.seats)mensen.value=String(hold.seats);
  if(hold.phase==="payment"){
    paneel.hidden=true;zetStapStoelen(false);stapDetails.hidden=true;verzonden.hidden=false;
    $("[data-sent-deadline]").textContent=stip(hold.expiresAt);
  }else{
    paneel.hidden=false;zetStapStoelen(false);stapDetails.hidden=false;verzonden.hidden=true;
    $("[data-hold-detail]").textContent=`${hold.seats} ${hold.seats===1?"seat is":"seats are"} held for your party. Nothing has been charged.`;
    $("[data-hold-deadline]").textContent=` left — until ${stip(hold.expiresAt)}`;
  }
  startTikker();
};

$("[data-hold-button]")?.addEventListener("click",async()=>{
  toon(holdFout,"");
  if(!weekend.value||!mensen.value){form.reportValidity();return;}
  const knop=$("[data-hold-button]");
  knop.disabled=true;knop.textContent="Checking availability…";
  const {ok,status,body}=await api("/api/hold",{method:"POST",
    body:JSON.stringify({sessionToken:sessieToken(),weekend:weekend.value,people:Number(mensen.value)})});
  knop.disabled=false;knop.textContent="Hold these seats →";
  if(!ok){
    toon(holdFout,
      status===409&&body.error==="not_available"
        ?`That weekend cannot fit ${mensen.value} ${Number(mensen.value)===1?"guest":"guests"} right now — ${body.remaining} ${body.remaining===1?"seat is":"seats are"} free. Try a smaller party or another weekend.`
      :status===429
        ?"You have started several bookings in a short time. Please finish or cancel one before starting another."
        :"We could not hold those seats just now. Please try again shortly.");
    return;
  }
  hold=body;bouwDeelnemers(Number(mensen.value));tekenPaneel();
});

// Iedere deelnemer betaalt zijn eigen aandeel, dus iedere deelnemer heeft een eigen naam en
// een eigen adres. Zonder adres geen betaallink.
const bouwDeelnemers=aantal=>{
  deelnemersVak.replaceChildren();
  const kop=document.createElement("p");
  kop.innerHTML="<strong>Who is coming?</strong> Each guest pays their own share of &euro;2,025 and receives their own payment link, so we need a name and an email address for everyone.";
  deelnemersVak.append(kop);
  for(let i=0;i<aantal;i++){
    const rij=document.createElement("div");
    // Geen gap: het label draagt zijn eigen ondermarge, net als bij de andere velden.
    // Met allebei stond er tweemaal ruimte tussen label en veld.
    rij.style.cssText="display:grid;margin-bottom:18px";
    rij.innerHTML=`<label for="p-name-${i}">Guest ${i+1} — name</label>`
      +`<input id="p-name-${i}" data-participant-name minlength="2" maxlength="120" required>`
      +`<label for="p-email-${i}">Guest ${i+1} — email</label>`
      +`<input id="p-email-${i}" data-participant-email type="email" maxlength="254" required>`;
    deelnemersVak.append(rij);
  }
};

$("[data-hold-cancel]")?.addEventListener("click",async()=>{
  const {ok,status,body}=await api("/api/hold/release",{method:"POST",body:JSON.stringify({sessionToken:sessieToken()})});
  if(status===409&&body.error==="requires_operator"){
    toon(holdFout,body.message||"Someone in this group has already paid. Please contact Lewos.");
    return;
  }
  stopTikker();hold=null;wisSessie();
  paneel.hidden=true;stapDetails.hidden=true;verzonden.hidden=true;zetStapStoelen(true);
  toon(holdFout,ok?"Your seats have been released and are available to others again.":"");
});

form.addEventListener("submit",async event=>{
  event.preventDefault();
  toon(boekFout,"");
  if(!form.reportValidity())return;
  const namen=[...document.querySelectorAll("[data-participant-name]")].map(i=>i.value.trim());
  const adressen=[...document.querySelectorAll("[data-participant-email]")].map(i=>i.value.trim().toLowerCase());
  if(new Set(adressen).size!==adressen.length){
    toon(boekFout,"Each guest needs their own email address — two of them are the same. That address is where their personal payment link goes.");
    return;
  }
  const knop=form.querySelector("button[type=submit]");
  knop.disabled=true;knop.textContent="Sending payment links…";
  const {ok,status,body}=await api("/api/hold/promote",{method:"POST",body:JSON.stringify({
    sessionToken:sessieToken(),name:$("#name").value.trim(),email:$("#email").value.trim(),
    // Eigen velden, bewust niet samengevoegd tot één bericht: de operator moet een allergie
    // kunnen terugvinden zonder een vrije tekst te hoeven doorlezen.
    // Eén veld sinds 5 september 2026. Het blijft een eigen veld naast `message`: een
    // allergie moet terug te vinden zijn zonder een vrije tekst door te hoeven lezen.
    dietaryNotes:form.elements.dietaryNotes.value,
    message:form.elements.message.value,
    // De aanvraag voor extra nachten reist als datums, niet als tekst. De zin die de
    // accommodatie leest wordt aan de serverkant uit deze twee velden opgebouwd, zodat
    // er nooit een tekst meegaat die iets anders zegt dan de aangeklikte dagen.
    requestedArrival:aankomstVeld?.value||"",
    requestedDeparture:vertrekVeld?.value||"",
    adultConfirmed:form.elements.adultConfirmed.checked,
    privacyAccepted:form.elements.privacyAccepted.checked,
    filmingAcknowledged:Boolean(filmingInput&&filmingInput.checked),
    participants:namen.map((naam,i)=>({name:naam,email:adressen[i]}))})});
  knop.disabled=false;knop.textContent="Send everyone their payment link →";
  if(!ok){
    const zinnen={
      hold_expired:"The 60 minutes for filling in your details have passed and the seats were released. Please start again — we will check availability first.",
      field_too_long:"One of your answers is longer than we can store. Shorten the field that shows a red counter and try again. Nothing was charged.",
      invalid_participant:"One of the guests is missing a name or a valid email address. Each guest needs both, because that is where their own payment link goes.",
      duplicate_participant_email:"Two guests share an email address. Each guest needs their own, because that is where their own payment link goes.",
      confirmations_required:"Please tick the confirmations before continuing. Nothing was charged.",
      booking_not_open:"Booking is not open yet. Nothing was charged and nothing has been confirmed. Leave your details through the contact page and we will let you know the moment it opens.",
      payment_requests_not_sent:"We could not send everyone their payment link, so nothing has been confirmed and nothing was charged. Your seats are still held — please try again.",
      invalid_details:"Something in the form was not accepted. Check the name and email, then try again. Nothing was charged."
    };
    toon(boekFout,zinnen[body.error]||"We could not submit this booking. Nothing was charged. Please check the details and try again.");
    if(body.error==="hold_expired")await ververs();
    return;
  }
  await ververs();
  $("[data-sent-addresses]").textContent=`Payment links were sent to: ${adressen.join(", ")}.`;
});

// Bij het openen van de pagina: loopt er nog een blokkering van deze sessie? Zo ja, dan
// pakken we hem op met zijn oorspronkelijke deadline — niet met een nieuwe.
(async()=>{
  let bestaat=null;
  try{bestaat=sessionStorage.getItem(SESSIE);}catch{}
  if(!bestaat)return;
  const stand=await ververs();
  if(stand&&stand.phase!=="payment")bouwDeelnemers(stand.seats);
})();

// Een tabblad dat weer zichtbaar wordt vraagt de stand opnieuw op, zodat de afteller niet
// doorloopt op een blokkering die bij de server al verlopen is.
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&hold)ververs();});
}
