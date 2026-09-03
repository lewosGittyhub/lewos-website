const form=document.querySelector("[data-public-booking-form]");
const weekend=form.elements.weekend;
const notice=document.querySelector("[data-filming-notice]");
const filmingCheck=document.querySelector("[data-filming-check]");
const filmingInput=form.elements.filmingAcknowledged;
const error=document.querySelector("[data-booking-error]");
const button=form.querySelector("button");

// Weekend 01 is de gefilmde editie, dus wie die boekt moet eerst bevestigen dat hij dat
// gelezen heeft. Een verborgen veld mag nooit verplicht staan: de browser weigert dan te
// versturen en laat niets zien. De verplichting loopt daarom mee met het zichtbare vakje.
const updateFilmingNotice=()=>{
  const opening=weekend.value==="weekend-01";
  notice.hidden=!opening;
  filmingCheck.hidden=!opening;
  filmingInput.required=opening;
  if(!opening)filmingInput.checked=false;
};
weekend.addEventListener("change",updateFilmingNotice);

form.addEventListener("submit",async event=>{
  event.preventDefault();
  if(!form.reportValidity())return;
  error.hidden=true;button.disabled=true;button.textContent="Opening payment…";
  const input={mode:"public",name:form.elements.name.value,email:form.elements.email.value,weekend:weekend.value,people:form.elements.people.value,adultConfirmed:form.elements.adultConfirmed.checked,privacyAccepted:form.elements.privacyAccepted.checked,filmingAcknowledged:filmingInput.checked,
    // Eigen velden, bewust niet samengevoegd tot één bericht: de operator moet een
    // allergie kunnen terugvinden zonder een vrije tekst te hoeven doorlezen.
    allergies:form.elements.allergies.value,dietary:form.elements.dietary.value,message:form.elements.message.value};
  try{
    const response=await fetch("/api/checkout",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(input)});
    const result=await response.json();
    if(response.ok&&result.checkoutUrl){location.assign(result.checkoutUrl);return;}
    // Elke afloop krijgt zijn eigen zin. "Er is niets afgeschreven" staat er telkens bij:
    // dat is de vraag die iemand stelt op het moment dat een betaalscherm niet opent.
    const zinnen={
      not_available:`Your complete party does not fit. ${result.remaining||"No"} seat${result.remaining===1?" remains":"s remain"} for this weekend. Choose the other announced weekend, or reduce the party size. Nothing was charged.`,
      field_too_long:"One of your answers is longer than we can store. Shorten the field that shows a red counter and try again. Nothing was charged.",
      invalid_details:"Something in the form was not accepted. Check the name, email, weekend and party size, then try again. Nothing was charged.",
      confirmations_required:"Please tick the confirmations before continuing. Nothing was charged.",
      too_many_requests:"Too many attempts in a short time. Wait fifteen minutes and try again. Nothing was charged.",
      checkout_not_open:"Booking is not open yet. Nothing was charged.",
      booking_not_open:"Booking is not open yet. Nothing was charged.",
      first_access_windows_active:"Seats are being held for invited guests right now. Booking opens for everyone as soon as that window closes. Nothing was charged.",
      unknown_weekend:"That weekend could not be found. Choose one from the list and try again. Nothing was charged.",
      checkout_unavailable:"We could not open the payment screen. Nothing was charged. Please try again, or contact Robert."
    };
    error.textContent=zinnen[result.error]||"We could not open the payment screen. Nothing was charged. Please check the details or contact Robert.";
  }catch{error.textContent="The booking service could not be reached. Nothing was charged. Please try again.";}
  error.hidden=false;error.focus();button.disabled=false;button.textContent="Continue to payment →";
});
