(()=>{
  const form=document.querySelector('[data-first-access-form]');
  if(!form)return;
  const result=form.querySelector('[data-booking-result]');
  const submit=form.querySelector('button[type="submit"]');
  const weekend=form.querySelector('#weekend');
  const people=form.querySelector('#people');
  const calendar=form.querySelector('[data-weekend-calendar]');
  const calendarMonths=form.querySelector('[data-calendar-months]');
  const calendarChosen=form.querySelector('[data-calendar-chosen]');
  const publicBooking=document.querySelector('[data-public-booking-open]');
  const firstAccessWaiting=document.querySelector('[data-first-access-closed]');
  let availability=[];
  let publicBookingOpen=false;
  const show=(message,type='info')=>{result.textContent=message;result.dataset.type=type;result.hidden=false;result.focus();};
  const showPublicBooking=()=>{publicBookingOpen=true;form.hidden=true;if(publicBooking)publicBooking.hidden=false;};
  const showFirstAccessWaiting=()=>{form.hidden=true;if(publicBooking)publicBooking.hidden=true;if(firstAccessWaiting)firstAccessWaiting.hidden=false;};
  // De kalender vult zich uit de database. Komen er geen echte datums terug, dan
  // blijft alleen het keuzemenu staan: liever geen kalender dan een halve.
  const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const DOW=['Mo','Tu','We','Th','Fr','Sa','Su'];
  const asDate=value=>{const parts=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value||''));return parts?new Date(Number(parts[1]),Number(parts[2])-1,Number(parts[3])):null;};
  const key=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const dated=()=>availability.filter(item=>asDate(item.startsOn)&&asDate(item.endsOn));

  const paintCalendar=()=>{
    if(!calendar||!calendar.hasAttribute('data-ready'))return;
    const chosen=weekend.value;
    calendar.querySelectorAll('.calday[data-slug]').forEach(cell=>{
      cell.classList.toggle('is-chosen',cell.dataset.slug===chosen&&!cell.classList.contains('is-full'));
    });
    const item=availability.find(entry=>entry.slug===chosen);
    calendarChosen.textContent=item?`Chosen: ${item.label} · ${item.dateLabel} — ${item.remaining} of ${item.capacity} seats free.`:'Pick a weekend in the calendar, or choose a private Tavern below.';
  };

  const buildCalendar=()=>{
    if(!calendar||!calendarMonths)return;
    const items=dated();
    if(!items.length){calendar.removeAttribute('data-ready');calendarMonths.textContent='';return;}
    const days=new Map();
    items.forEach(item=>{
      const start=asDate(item.startsOn), end=asDate(item.endsOn);
      for(let day=new Date(start);day<=end;day.setDate(day.getDate()+1))days.set(key(day),{item,first:key(day)===key(start)});
    });
    const months=[];
    items.forEach(item=>{
      const start=asDate(item.startsOn), end=asDate(item.endsOn);
      [start,end].forEach(date=>{
        const stamp=`${date.getFullYear()}-${date.getMonth()}`;
        if(!months.some(month=>month.stamp===stamp))months.push({stamp,year:date.getFullYear(),month:date.getMonth()});
      });
    });
    months.sort((a,b)=>a.year-b.year||a.month-b.month);
    calendarMonths.innerHTML=months.map(({year,month})=>{
      const lead=(new Date(year,month,1).getDay()+6)%7;
      const total=new Date(year,month+1,0).getDate();
      let cells='';
      for(let i=0;i<lead;i++)cells+='<div class="calday" aria-hidden="true"></div>';
      for(let day=1;day<=total;day++){
        const found=days.get(key(new Date(year,month,day)));
        if(!found){cells+=`<div class="calday"><span class="calday__n">${day}</span></div>`;continue;}
        const {item,first}=found;
        const full=item.remaining<=0;
        const low=!full&&item.remaining<=2;
        const seats=first?`<span class="calday__seats">${full?'full':`${item.remaining} free`}</span>`:'';
        const label=`${item.label}, ${item.dateLabel}, ${full?'no seats left':`${item.remaining} of ${item.capacity} seats free`}`;
        cells+=`<button type="button" class="calday is-weekend${full?' is-full':low?' is-low':''}" data-slug="${item.slug}"${full?' disabled':''} aria-label="${label}"><span class="calday__n">${day}</span>${seats}</button>`;
      }
      return `<div class="calmonth"><h4>${MONTHS[month]} ${year}</h4><div class="calmonth__dow">${DOW.map(name=>`<span>${name}</span>`).join('')}</div><div class="calmonth__grid">${cells}</div></div>`;
    }).join('');
    calendar.setAttribute('data-ready','');
    const openWeekend=items.find(item=>item.remaining>0);
    if(!weekend.value&&openWeekend)weekend.value=openWeekend.slug;
    paintCalendar();
  };

  const hoverCalendar=(slug,on)=>{
    if(!calendar)return;
    calendar.querySelectorAll(`.calday[data-slug="${slug}"]`).forEach(cell=>{
      if(!cell.classList.contains('is-full'))cell.classList.toggle('is-hot',on);
    });
  };
  if(calendar){
    calendar.addEventListener('pointerover',event=>{const cell=event.target.closest('.calday[data-slug]');if(cell)hoverCalendar(cell.dataset.slug,true);});
    calendar.addEventListener('pointerout',event=>{const cell=event.target.closest('.calday[data-slug]');if(cell)hoverCalendar(cell.dataset.slug,false);});
    calendar.addEventListener('click',event=>{
      const cell=event.target.closest('.calday[data-slug]');
      if(!cell||cell.disabled)return;
      weekend.value=cell.dataset.slug;
      weekend.dispatchEvent(new Event('change',{bubbles:true}));
      paintCalendar();
    });
    weekend.addEventListener('change',paintCalendar);
  }

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
    buildCalendar();
  };
  const loadAvailability=async()=>{
    try{
      const response=await fetch('/api/first-access',{headers:{accept:'application/json'}});
      if(!response.ok)return;
      const data=await response.json();
      if(data.publicBookingOpen){showPublicBooking();return;}
      if(data.firstAccessClosed){showFirstAccessWaiting();return;}
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
    if(publicBookingOpen){showPublicBooking();return;}
    if(!form.reportValidity())return;
    submit.disabled=true;submit.textContent='Checking seats…';result.hidden=true;
    try{
      const payload=Object.fromEntries(new FormData(form));
      const response=await fetch('/api/first-access',{method:'POST',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify(payload)});
      const data=await response.json();
      if(data.error==='public_booking_open'){showPublicBooking();return;}
      if(data.error==='first_access_closed'){showFirstAccessWaiting();return;}
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
      const privateTooSmall=error.message==='private_party_too_small';
      const emailLimit=error.message==='email_claim_limit';
      show(unavailable?'Seat registration is temporarily unavailable. Please try again shortly or contact Robert directly.':tooMany?'Too many requests were sent in a short time. Your existing request is safe; please wait fifteen minutes before trying again.':tooLarge?'Featured weekends have six seats. For a larger group, choose a private Tavern in the same weekend menu.':privateTooSmall?'A private Tavern starts with four players. Bring your group to at least four, or choose one of the featured six-seat weekends.':emailLimit?'This email address already has seats held for the maximum number of featured weekends. Contact Robert if you need to change one of those requests.':'We could not check the seats. Please review your details and try again.','error');
    }
    finally{submit.disabled=false;submit.textContent='Claim my seats →';}
  });
})();
