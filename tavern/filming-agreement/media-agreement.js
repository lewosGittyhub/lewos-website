// Deze pagina is standaard een leesbaar concept en niets meer. De velden staan uit in de
// HTML zelf, dus zonder dit script — of zonder een open mediapoort — valt er niets in te
// vullen en niets te versturen. Alleen een geldige persoonlijke link plus een server die
// zegt dat de overeenkomst is goedgekeurd, zet de velden aan.
const panel=document.querySelector("[data-media-panel]");
const form=document.querySelector("[data-media-form]");
const fieldsets=[...document.querySelectorAll("[data-media-fields]")];
const submit=document.querySelector("[data-media-submit]");
const status=document.querySelector("[data-media-status]");
const progress=document.querySelector("[data-media-progress]");
const label=document.querySelector("[data-media-label]");
const version=document.querySelector("[data-media-version]");
const nameField=document.querySelector("[data-media-name]");
const eventField=document.querySelector("[data-media-event]");
const adult=document.querySelector("[data-media-adult]");
const standard=document.querySelector("[data-media-standard]");
const terms=document.querySelector("[data-media-terms]");
const ads=document.querySelector("[data-media-ads]");

const parameters=new URLSearchParams(location.search);
const token=parameters.get("token")||"";
const progressToken=parameters.get("progress")||"";

const say=(text,element=status)=>{element.textContent=text;element.hidden=false;};

// Eén plek waar de pagina weer dichtgaat. Bij twijfel blijft alles uit. De bezoeker krijgt
// nooit te horen wélke instelling ontbreekt: dat is onze administratie, niet zijn probleem.
const keepClosed=text=>{
  for(const fieldset of fieldsets)fieldset.disabled=true;
  if(submit)submit.hidden=true;
  if(text)say(text);
};
const NOT_AVAILABLE="This agreement cannot be opened at the moment. Please contact Robert at lewos.co@gmail.com and he will sort it out.";

const showProgress=async()=>{
  try{
    const response=await fetch(`/api/media-consent?progress=${encodeURIComponent(progressToken)}`,{headers:{accept:"application/json"}});
    const result=await response.json();
    if(!response.ok){say("This progress link is not active.",progress);return;}
    // Alleen aantallen. Wie wat heeft gekozen is niets van de hoofdboeker.
    say(`${result.completed} of ${result.total} guests have completed the Filming & Media Agreement.`,progress);
  }catch{say("The progress link could not be checked right now.",progress);}
};

const openAgreement=state=>{
  // Het formulier verschijnt pas als de server zegt dat deze link geldig is. Wie de pagina
  // zonder link leest, ziet alleen de tekst van de overeenkomst.
  if(panel)panel.hidden=false;
  if(label)label.textContent="Your choices";
  if(version)version.textContent=state.agreementVersion||"";
  if(nameField){nameField.value=state.fullName||"";nameField.readOnly=true;}
  if(eventField)eventField.value=`The Lewos Tavern · ${state.weekendLabel}`;
  for(const fieldset of fieldsets)fieldset.disabled=false;
  if(submit)submit.hidden=false;
  if(state.alreadyRecorded){
    // Al ingevuld: laat zien wat er staat, en overschrijf niets stilzwijgend.
    if(standard)standard.checked=state.standardUseConsent===true;
    if(ads)ads.checked=state.paidAdvertisingConsent===true;
    if(adult)adult.checked=true;
    if(terms)terms.checked=true;
    keepClosed(`Your choices were recorded on ${new Date(state.recordedAt).toLocaleDateString("en-GB",{dateStyle:"long"})} under reference ${state.auditReference}, for agreement version ${state.agreementVersion}. To change or withdraw them, reply to the email that brought you here.`);
    return;
  }
  say(`This is your own agreement, for ${state.weekendLabel}, version ${state.agreementVersion}. Nobody else can complete it for you, and you cannot complete it for anyone else.`);
};

const load=async()=>{
  try{
    const response=await fetch(`/api/media-consent?token=${encodeURIComponent(token)}`,{headers:{accept:"application/json"}});
    const result=await response.json();
    if(response.status===503){keepClosed(NOT_AVAILABLE);return;}
    if(response.status===410){keepClosed("This link has expired. Please contact Robert at lewos.co@gmail.com for a new one.");return;}
    if(!response.ok){keepClosed("This link is not valid. Please contact Robert at lewos.co@gmail.com for a new one.");return;}
    openAgreement(result);
  }catch{keepClosed("The agreement could not be loaded right now. Nothing has been recorded.");}
};

if(form){
  form.addEventListener("submit",async event=>{
    // Altijd tegenhouden: deze pagina post nooit uit zichzelf ergens naartoe.
    event.preventDefault();
    if(!token)return;
    if(adult&&!adult.checked){say("Please confirm that you are 18 or older and completing this for yourself.");return;}
    if(terms&&!terms.checked){say("Please confirm that you have read the agreement and the privacy information.");return;}
    submit.disabled=true;
    try{
      const response=await fetch("/api/media-consent",{
        method:"POST",
        headers:{"content-type":"application/json"},
        // Versie en teksthash komen van de server. Wat hier meegaat zijn alleen de keuzes.
        body:JSON.stringify({token,standardUse:standard?standard.checked:false,paidAdvertising:ads?ads.checked:false})
      });
      const result=await response.json();
      if(response.status===503){keepClosed(NOT_AVAILABLE);return;}
      if(!response.ok){say("Your choices could not be recorded. Nothing has been stored. Please try again or reply to the email that brought you here.");submit.disabled=false;return;}
      keepClosed(`Thank you. Your choices are recorded under reference ${result.auditReference}. ${result.standardUseConsent?"You gave permission for recognisable use.":"You did not give permission for recognisable use, and that is respected."} ${result.paidAdvertisingConsent===true?"You also allowed paid advertising.":"You did not allow paid advertising."}`);
    }catch{
      say("Your choices could not be recorded. Nothing has been stored.");
      submit.disabled=false;
    }
  });
}

if(progressToken)showProgress();
if(token)load();
