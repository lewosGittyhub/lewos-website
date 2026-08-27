(()=>{
  const form=document.querySelector('[data-first-access-form]');
  if(!form)return;
  const result=form.querySelector('[data-booking-result]');
  const submit=form.querySelector('button[type="submit"]');
  const weekend=form.querySelector('#weekend');
  const people=form.querySelector('#people');
  let availability=[];
  const show=(message,type='info')=>{result.textContent=message;result.dataset.type=type;result.hidden=false;result.focus();};
  const updateWeekendOptions=()=>{
    const partySize=Number.parseInt(people.value,10)||0;
    availability.forEach(item=>{
      const option=weekend.querySelector(`option[value="${item.slug}"]`);
      if(!option)return;
      const full=item.remaining===0;
      const doesNotFit=partySize>0&&partySize>item.remaining;
      option.disabled=full||doesNotFit;
      const seats=item.remaining===1?'1 seat left':`${item.remaining} seats available`;
      const fitNote=doesNotFit&&!full?' · your full party will not fit':'';
      option.textContent=`${item.label} · ${item.dateLabel} · ${full?'FULL':seats}${fitNote}`;
      if(option.selected&&option.disabled)weekend.value='';
    });
  };
  const loadAvailability=async()=>{
    try{
      const response=await fetch('/api/first-access',{headers:{accept:'application/json'}});
      if(!response.ok)return;
      const data=await response.json();
      availability=Array.isArray(data.weekends)?data.weekends:[];
      updateWeekendOptions();
    }catch{
      // Keep the published date labels when live availability cannot be reached.
    }
  };
  people.addEventListener('input',updateWeekendOptions);
  loadAvailability();
  const query=new URLSearchParams(window.location.search);
  if(query.get('status')==='alternative'){
    weekend.value=query.get('offered')||'';
    show(`${query.get('label')||'The next announced weekend'} can currently fit your complete party. Check the new date and submit again to claim the seats.`,'alternative');
  }else if(query.get('status')==='future'){
    show('The announced weekends cannot fit your complete party. We have registered your interest in opening the next Tavern chapter and will contact you with the next suitable date.','future');
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(!form.reportValidity())return;
    submit.disabled=true;submit.textContent='Checking seats…';result.hidden=true;
    try{
      const payload=Object.fromEntries(new FormData(form));
      const response=await fetch('/api/first-access',{method:'POST',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify(payload)});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||'request_failed');
      if(data.status==='first_access_held'){window.location.assign(`/thanks/?status=held&weekend=${encodeURIComponent(data.weekendLabel)}&seats=${data.seats}`);return;}
      if(data.status==='alternative_offered'){weekend.value=data.offeredWeekend;show(`${data.requestedWeekend} cannot fit your complete party. We have selected ${data.offeredWeekendLabel}, where your ${data.seats} seats can still stay together. Check the new date and submit again to claim them.`,'alternative');return;}
      if(data.status==='future_weekend_interest'){show('The announced weekends cannot fit your complete party. We have registered your interest in opening the next Tavern chapter and will contact you with the next suitable date.','future');return;}
      if(data.status==='private_inquiry'){window.location.assign('/contact-thanks/');return;}
      show('Thank you. We have received your request.');
    }catch(error){
      const unavailable=error.message==='booking_service_not_configured'||error.message==='booking_service_unavailable';
      const tooMany=error.message==='too_many_requests';
      const tooLarge=error.message==='featured_party_too_large';
      show(unavailable?'Seat registration is temporarily unavailable. Please try again shortly or contact Robert directly.':tooMany?'Too many requests were sent in a short time. Your existing request is safe; please wait fifteen minutes before trying again.':tooLarge?'Featured weekends have six seats. For a larger group, choose a private Tavern.':'We could not check the seats. Please review your details and try again.','error');
    }
    finally{submit.disabled=false;submit.textContent='Claim my seats →';}
  });
})();
