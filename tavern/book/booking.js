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
  error.hidden=true;button.disabled=true;button.textContent="Securing your seats…";
  const input={mode:"public",name:form.elements.name.value,email:form.elements.email.value,weekend:weekend.value,people:form.elements.people.value,adultConfirmed:form.elements.adultConfirmed.checked,privacyAccepted:form.elements.privacyAccepted.checked,filmingAcknowledged:filmingInput.checked};
  try{
    const response=await fetch("/api/checkout",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(input)});
    const result=await response.json();
    if(response.ok&&result.checkoutUrl){location.assign(result.checkoutUrl);return;}
    if(result.error==="not_available")error.textContent=`Your complete party does not fit. ${result.remaining||"No"} seat${result.remaining===1?" remains":"s remain"} for this weekend. Choose the other announced weekend or contact Robert and we will keep your group together.`;
    else error.textContent="We could not secure this checkout. No payment was taken. Please check the details or contact Robert.";
  }catch{error.textContent="The booking service could not be reached. No payment was taken. Please try again.";}
  error.hidden=false;error.focus();button.disabled=false;button.textContent="Secure my seats and continue →";
});
