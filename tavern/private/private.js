(()=>{
  const form=document.querySelector('[data-private-form]');
  if(!form)return;
  const result=form.querySelector('[data-result]');
  const submit=form.querySelector('button[type="submit"]');
  const show=(message,type='info')=>{result.textContent=message;result.dataset.type=type;result.hidden=false;result.focus();};

  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(!form.checkValidity()){form.reportValidity();return;}
    const data=Object.fromEntries(new FormData(form));
    // De bestaande aanvraagfunctie kent naam, e-mail, aantal, weekend en één
    // berichtveld. De gewenste periode hoort bij het verhaal, dus die gaat mee in
    // dat bericht in plaats van in een veld dat de server niet kent.
    const when=String(data.when||'').trim();
    const idea=String(data.idea||'').trim();
    const payload={
      'bot-field':data['bot-field']||'',
      name:data.name,
      email:data.email,
      people:data.people,
      weekend:'private',
      consent:data.consent||'',
      message:(when?`When: ${when}\n\n`:'')+idea
    };
    submit.disabled=true;submit.textContent='Sending…';result.hidden=true;
    try{
      const response=await fetch('/api/first-access',{method:'POST',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify(payload)});
      const body=await response.json();
      if(!response.ok)throw new Error(body.error||'request_failed');
      if(body.status==='private_inquiry'){window.location.assign('/contact-thanks/');return;}
      show('Thank you. We have received your request and will come back to you.');
    }catch(error){
      const tooSmall=error.message==='private_party_too_small';
      const tooMany=error.message==='too_many_requests';
      const unavailable=error.message==='booking_service_not_configured'||error.message==='booking_service_unavailable';
      show(
        tooSmall?'A private Tavern starts with four players. Bring your group to at least four, or write to Robert directly at lewos.co@gmail.com.':
        tooMany?'Too many requests were sent in a short time. Your request is safe; please wait fifteen minutes before trying again.':
        unavailable?'Requests are temporarily unavailable. Please try again shortly, or email lewos.co@gmail.com.':
        'We could not send your request. Please check your details and try again.','error');
    }
    finally{submit.disabled=false;submit.textContent='Send my request →';}
  });
})();
