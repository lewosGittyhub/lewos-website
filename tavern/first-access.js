import {createWeekendCalendar} from '/assets/weekend-calendar.js';

(()=>{
  const form=document.querySelector('[data-first-access-form]');
  if(!form)return;
  const result=form.querySelector('[data-booking-result]');
  const submit=form.querySelector('button[type="submit"]');
  const weekend=form.querySelector('#weekend');
  const people=form.querySelector('#people');
  const calendar=form.querySelector('[data-weekend-calendar]');
  const calendarChosen=form.querySelector('[data-calendar-chosen]');
  const stayLine=form.querySelector('[data-stay-line]');
  const stayHint=form.querySelector('[data-stay-hint]');
  const arrivalInput=form.querySelector('[data-stay-arrival]');
  const departureInput=form.querySelector('[data-stay-departure]');
  let kalender=null;
  const partyPrice=form.querySelector('[data-party-price]');
  const weekendField=form.querySelector('[data-weekend-field]');
  const bookingNote=form.querySelector('#booking-note');
  const publicBooking=document.querySelector('[data-public-booking-open]');
  const firstAccessWaiting=document.querySelector('[data-first-access-closed]');
  let availability=[];
  let publicBookingOpen=false;
  const show=(message,type='info')=>{result.textContent=message;result.dataset.type=type;result.hidden=false;result.focus();};
  // De statusregel in de editiekaart stond hardgecodeerd op "First Access now open" en bleef
  // dat zeggen toen het formulier al verborgen was. Wat de bezoeker daar leest hoort uit
  // dezelfde bron te komen als wat hij verderop kan doen.
  const accessStatus=document.querySelector('[data-access-status]');
  const setStatus=tekst=>{if(accessStatus)accessStatus.textContent=tekst;};
  const showPublicBooking=()=>{publicBookingOpen=true;form.hidden=true;if(publicBooking)publicBooking.hidden=false;setStatus('Public booking open');};
  const showFirstAccessWaiting=()=>{form.hidden=true;if(publicBooking)publicBooking.hidden=true;if(firstAccessWaiting)firstAccessWaiting.hidden=false;setStatus('First Access closing');};
  // De kalender vult zich uit de database. Komen er geen echte datums terug, dan
  // blijft alleen het keuzemenu staan: liever geen kalender dan een halve.
  const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const DOW=['Mo','Tu','We','Th','Fr','Sa','Su'];
  const asDate=value=>{const parts=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value||''));return parts?new Date(Number(parts[1]),Number(parts[2])-1,Number(parts[3])):null;};
  const key=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const dated=()=>availability.filter(item=>asDate(item.startsOn)&&asDate(item.endsOn));
  const wantedSeats=()=>{const party=Number.parseInt(people.value,10);return Number.isInteger(party)&&party>0?party:1;};

  // Zonder beschikbaarheid kan er geen bedrag berekend worden: de prijs komt uit de
  // database, niet uit dit bestand. Zeg dat dan ook, in plaats van een streepje te laten
  // staan dat nooit meer verandert. De gast kan nog wel gewoon een aanvraag versturen.
  const priceUnavailable=()=>{
    if(!partyPrice)return;
    partyPrice.textContent='Unavailable';
    partyPrice.setAttribute('data-empty','');
  };

  // Het weekend, de vrije stoelen en het bedrag. De kalender zelf tekent zichzelf; deze
  // functie zegt alleen wat er gekozen is en wat dat kost.
  const paintChoice=()=>{
    const gereed=Boolean(kalender&&kalender.ready());
    if(calendarChosen)calendarChosen.hidden=!gereed;
    if(!gereed){priceUnavailable();return;}
    const item=availability.find(entry=>entry.slug===weekend.value);
    if(!item){
      if(calendarChosen)calendarChosen.textContent='Pick a weekend in the calendar, or choose a private Tavern below.';
      if(partyPrice){partyPrice.textContent='Pick a weekend';partyPrice.setAttribute('data-empty','');}
      return;
    }
    // De prijs komt uit de database, niet uit dit bestand: één plek waar hij staat.
    // Levert de API er geen, dan zwijgen we erover in plaats van te gokken.
    const cents=Number(item.priceCents);
    // De euro is de prijs. Staat de bezoeker op ponden of dollars, dan komt daar een
    // indicatie achter — zie assets/currency.js. Ontbreekt dat bestand, dan verandert er niets.
    const money=amount=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(amount/100)
      +(window.lewosCurrency?window.lewosCurrency.approx(amount):'');
    const hasPrice=Number.isFinite(cents)&&cents>0;
    // Geen "Selected weekend:" ervoor: de kalender laat in oranje al zien welk weekend het
    // is. Wat hier hoort te staan is wat je dáár niet kunt zien — hoeveel plek er nog is,
    // en wat het kost. **"including taxes" blijft staan**: elke prijs op de site hoort een
    // totaalprijs te zijn, en dat is een consumenteneis, geen opmaak. `tests/site.test.mjs`
    // ving het meteen toen ik het wegliet.
    if(calendarChosen)calendarChosen.textContent=`${item.label} · ${item.dateLabel} · ${item.remaining} of ${item.capacity} seats free${hasPrice?` · ${money(cents)} per person, including taxes`:''}`;
    if(!partyPrice)return;
    const guests=Number.parseInt(people.value,10);
    const fits=Number.isInteger(guests)&&guests>0&&guests<=Math.min(item.capacity,item.remaining);
    if(hasPrice&&fits){
      partyPrice.textContent=money(cents*guests);
      partyPrice.removeAttribute('data-empty');
    }else{
      // Drie gevallen, niet twee. Nog niets ingevuld: een streepje, want het label zegt al
      // Total. Wel ingevuld maar de groep past niet: zeg hoeveel er vrij is, anders staart
      // de gast naar een streepje zonder te weten waarom. Nooit een bedrag voor een boeking
      // die niet kan.
      const ingevuld=Number.isInteger(guests)&&guests>0;
      partyPrice.textContent=!hasPrice?'On request'
        :!ingevuld?'\u2014'
        :item.remaining===0?'No seats left'
        :`Only ${item.remaining} free`;
      partyPrice.setAttribute('data-empty','');
    }
  };

  // **Het bedrag hierboven gaat alleen over het weekend.** Een aangevraagde nacht telt er
  // niet in mee en mag dat ook niet: wij weten niet of hij vrij is en wat hij kost. De
  // prijs daarvan komt van de accommodatie, ná bevestiging.
  // Een andere valuta verandert alleen wat er staat, niets aan de keuze zelf.
  document.addEventListener('lewos:currency',()=>paintChoice());

  const onthoudVerblijf=stand=>{
    const heeftExtra=Boolean(stand?.valid&&stand.extraNights>0);
    // Alleen een échte aanvraag gaat mee. Zijn de datums gelijk aan het weekend zelf, dan
    // blijven de velden leeg — anders zou elke boeking als "extra nachten" binnenkomen.
    if(arrivalInput)arrivalInput.value=heeftExtra?stand.arrival:'';
    if(departureInput)departureInput.value=heeftExtra?stand.departure:'';
    // De weekendregel noemt de datums al. Deze regel verschijnt pas als je verblijf
    // daarvan afwijkt — dan zegt hij iets nieuws in plaats van hetzelfde nog een keer.
    if(stayHint)stayHint.hidden=!heeftExtra;
    if(stayLine)stayLine.hidden=!heeftExtra;
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

  const buildCalendar=()=>{
    if(!calendar)return;
    if(!kalender){
      kalender=createWeekendCalendar({
        mount:calendar,summary:stayLine,
        onChange:({slug,stay})=>{
          if(slug&&weekend.value!==slug){
            weekend.value=slug;
            weekend.dispatchEvent(new Event('change',{bubbles:true}));
          }
          onthoudVerblijf(stay);
          paintChoice();
          syncWeekendField();
        }
      });
    }
    kalender.setWeekends(dated());
    kalender.setWantedSeats(wantedSeats());
    // Is er nog geen weekend gekozen, kies dan het eerste waar de hele groep in past.
    if(!weekend.value||weekend.value==='private'){
      const open=dated().find(item=>item.remaining>=wantedSeats());
      if(open&&weekend.value!=='private')kalender.select(open.slug);
    }else{
      kalender.select(weekend.value);
    }
    paintChoice();
    syncWeekendField();
    haalBezetteNachten(kalender,dated());
  };

  // Een privé-Tavern heeft een eigen pagina. Het keuzemenu houdt de optie wel, want
  // dat menu is de terugval als de kalender niet kan laden.
  const isPrivate=()=>weekend.value==='private';
  const submitLabel=()=>isPrivate()?'Send my request →':'Hold my seats →';
  const applyMode=on=>{
    if(calendar)calendar.style.display=on?'none':'';
    if(calendarChosen)calendarChosen.hidden=on||!kalender?.ready();
    if(stayLine)stayLine.hidden=on;
    if(stayHint)stayHint.hidden=on;
    // Een privé-Tavern heeft geen vast weekend, dus ook geen aangevraagde nachten die
    // aan zo'n weekend hangen. Laat ze dan los in plaats van ze mee te sturen.
    if(on){if(arrivalInput)arrivalInput.value='';if(departureInput)departureInput.value='';}
    if(bookingNote)bookingNote.hidden=on;
    // Een vast weekend heeft zes stoelen; een privé-Tavern loopt van vier tot twaalf.
    people.min=on?'4':'1';
    people.max=on?'12':'6';
    submit.textContent=submitLabel();
    syncWeekendField();
  };

  // Zodra de kalender de zichtbare bediening is, hoeft het keuzemenu alleen nog het
  // gekozen weekend te dragen. Kan de kalender niet laden, dan komt het menu terug.
  const syncWeekendField=()=>{
    if(!weekendField)return;
    const usingCalendar=Boolean(kalender&&kalender.ready())||weekend.value==='private';
    weekendField.classList.toggle('is-visually-hidden',usingCalendar);
  };

  weekend.addEventListener('change',()=>{
    if(kalender&&weekend.value&&weekend.value!=='private')kalender.select(weekend.value);
    paintChoice();
    applyMode(isPrivate());
  });

  // Een waarde uit de URL of uit de API hoort nooit in een CSS-selector terecht te komen:
  // `querySelector` gooit op een aanhalingsteken of een blokhaak, en dan valt het hele script
  // stil. De optielijst doorlopen kan niet stuk.
  const optieVoor=waarde=>[...weekend.options].find(optie=>optie.value===waarde)||null;

  const updateWeekendOptions=()=>{
    const partySize=Number.parseInt(people.value,10)||0;
    availability.forEach(item=>{
      const option=optieVoor(item.slug);
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
  people.addEventListener('input',()=>{
    updateWeekendOptions();
    if(kalender)kalender.setWantedSeats(wantedSeats());
    paintChoice();
  });
  applyMode(isPrivate());
  const query=new URLSearchParams(window.location.search);
  const requestedWeekend=query.get('weekend');
  if(requestedWeekend&&optieVoor(requestedWeekend))weekend.value=requestedWeekend;
  loadAvailability();
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
      // Een herhaalde aanvraag maakt geen tweede claim, maar de nieuwe allergie- of
      // dieetinformatie is wél opgeslagen. Dan hoort de gast dat te lezen in plaats van
      // stilzwijgend doorgestuurd te worden naar een bedankpagina.
      if(data.duplicate&&data.detailsUpdated){show('You already have a request under this email address, so we have not created a second one. We have updated the details you just sent, including any allergies and dietary requirements. Nothing you wrote has been lost.');return;}
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
      // De server kapt niets meer af, dus hij kan 'te lang' terugmelden. Zeg dan wélk
      // veld en hoeveel te veel — een gast die zijn allergie opschrijft moet weten dat
      // die tekst niet is aangekomen, en waarom.
      const tooLong=error.message==='field_too_long';
      show(tooLong?'One of your answers is longer than we can store. Shorten the field that shows a red counter and send again — nothing has been saved yet.':unavailable?'Seat registration is temporarily unavailable. Please try again shortly or contact Robert directly.':tooMany?'Too many requests were sent in a short time. Your existing request is safe; please wait fifteen minutes before trying again.':tooLarge?'Featured weekends have six seats. For a larger group, choose a private Tavern in the same weekend menu.':privateTooSmall?'A private Tavern starts with four players. Bring your group to at least four, or choose one of the featured six-seat weekends.':emailLimit?'This email address already has seats held for the maximum number of featured weekends. Contact Robert if you need to change one of those requests.':'We could not check the seats. Please review your details and try again.','error');
    }
    finally{submit.disabled=false;submit.textContent=submitLabel();}
  });
})();
