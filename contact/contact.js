// Het vragenformulier post naar /api/contact. Zonder dit script werkt het ook: de
// functie antwoordt op een gewone formulierpost met een doorverwijzing naar
// /contact-thanks/. Dit script is er voor het geval dat het misgaat — anders zou een
// bezoeker bij een fout een pagina met ruwe JSON te zien krijgen.
(()=>{
  const form=document.querySelector('form[action="/api/contact"]');
  if(!form)return;
  const result=form.querySelector('[data-result]');
  const submit=form.querySelector('button[type="submit"]');
  if(!result||!submit)return;
  const show=(message,type='info')=>{result.textContent=message;result.dataset.type=type;result.hidden=false;result.focus();};

  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(!form.checkValidity()){form.reportValidity();return;}
    const data=Object.fromEntries(new FormData(form));
    submit.disabled=true;submit.textContent='Sending…';result.hidden=true;
    try{
      const response=await fetch('/api/contact',{method:'POST',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify(data)});
      const body=await response.json();
      if(!response.ok)throw new Error(body.error||'request_failed');
      window.location.assign('/contact-thanks/');
      return;
    }catch(error){
      const tooLong=error.message==='field_too_long';
      const tooMany=error.message==='too_many_requests';
      const unavailable=error.message==='contact_service_not_configured'||error.message==='contact_service_unavailable'||error.message==='contact_not_delivered';
      show(
        tooLong?'Your question is longer than we can store. Shorten the field that shows a red counter and send again — nothing has been sent yet.':
        tooMany?'Too many messages were sent in a short time. Please wait fifteen minutes before trying again.':
        unavailable?'We could not send your question just now. Please try again shortly, or email lewos.co@gmail.com directly.':
        'We could not send your question. Please check your details and try again.','error');
    }
    finally{submit.disabled=false;submit.textContent='Send my question →';}
  });
})();
