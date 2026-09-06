// De beheeromgeving. Lezen, niet wijzigen: er zit in deze versie bewust geen enkele knop
// om te annuleren, terug te betalen of een boeking aan te passen.
//
// Deze code houdt geen geheim vast. Het token in `sessionStorage` is het bewijs van de
// ingelogde gebruiker en verdwijnt als het tabblad sluit; de servicesleutel van de
// database staat uitsluitend in de Netlify-functie en komt hier nooit langs. Alles wat
// deze pagina toont is wat het eindpunt teruggaf — en dat eindpunt geeft allergieën en
// dieetwensen alléén mee bij één opgevraagde boeking, nooit in het maandoverzicht.

const $=kies=>document.querySelector(kies);
const el=(tag,props={},...kinderen)=>{
  const knoop=Object.assign(document.createElement(tag),props);
  for(const kind of kinderen.flat())if(kind!=null)knoop.append(kind.nodeType?kind:String(kind));
  return knoop;
};
const TOKEN="lewos.admin.token";
const bewaarToken=w=>{try{sessionStorage.setItem(TOKEN,w);}catch{}};
const leesToken=()=>{try{return sessionStorage.getItem(TOKEN);}catch{return null;}};
const wisToken=()=>{try{sessionStorage.removeItem(TOKEN);}catch{}};
// Wie er is ingelogd, uit het token zelf. Puur om het in de kop te tonen; de server
// gelooft dit niet en leest het adres uit het token dat hij zelf heeft gecontroleerd.
const ingelogdAls=()=>{
  const token=leesToken();
  if(!token)return null;
  try{return JSON.parse(atob(token.split(".")[1].replace(/-/g,"+").replace(/_/g,"/"))).email||null;}catch{return null;}
};

const STATUS={
  paid:{label:"Paid",klasse:"s-paid"},
  partially_paid:{label:"Part paid",klasse:"s-partially_paid"},
  awaiting_payment:{label:"Awaiting payment",klasse:"s-awaiting_payment"},
  no_payment_due:{label:"Held · no payment due",klasse:"s-no_payment_due"},
  expired:{label:"Expired",klasse:"s-expired"},
  cancelled:{label:"Cancelled",klasse:"s-cancelled"}
};
const status=sleutel=>STATUS[sleutel]||{label:sleutel||"Unknown",klasse:"s-no_payment_due"};
// De fase van de betaaltermijn. De kleur volgt de ernst, niet de fase: een groep in de
// laatste verlenging hoort er anders uit te zien dan een die net begonnen is.
const FASE_KLASSE={complete:"s-paid",open:"s-awaiting_payment",extended:"s-partially_paid",
  final_extension:"s-awaiting_payment",action_required:"s-expired",lapsed:"s-expired"};
const resterend=m=>m==null?null:m<=0?"deadline passed":m<60?`${m} min left`:`${Math.floor(m/60)}h ${m%60}m left`;
const geld=centen=>typeof centen==="number"?`€${(centen/100).toLocaleString("en-IE",{minimumFractionDigits:2,maximumFractionDigits:2})}`:"—";
const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const uitIso=s=>{const [j,m,d]=String(s).split("-").map(Number);return new Date(j,m-1,d);};
const toonDatum=s=>s?uitIso(s).toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short",year:"numeric"}):"—";
const toonMoment=s=>s?new Date(s).toLocaleString("en-GB",{dateStyle:"medium",timeStyle:"short"}):null;

let config={mode:"supabase"};
let boekingen=[];
let zichtbaar=new Date();
let gekozenDag=null;
let weektab="arrivals";
let weekends=[];

// ── Praten met de server ────────────────────────────────────────────────────
const api=async pad=>{
  const token=leesToken();
  const response=await fetch(pad,{headers:token?{authorization:`Bearer ${token}`}:{}});
  if(response.status===401){wisToken();toonInloggen("Your session has ended. Please sign in again.");throw new Error("unauthenticated");}
  if(response.status===403){
    wisToken();
    toonInloggen("That account is signed in, but it is not on the list of Lewos administrators. Access was refused by the server.","error");
    throw new Error("forbidden");
  }
  if(!response.ok)throw new Error((await response.json().catch(()=>({}))).error||`request_failed_${response.status}`);
  return response.json();
};

// ── Inloggen ────────────────────────────────────────────────────────────────
const toonInloggen=(bericht,soort="info")=>{
  $("[data-app]").hidden=true;$("[data-who]").hidden=true;$("[data-signin]").hidden=false;
  const vak=$("[data-signin-msg]");
  if(bericht){vak.textContent=bericht;vak.dataset.kind=soort;vak.hidden=false;}else vak.hidden=true;
};

const magischeLink=async()=>{
  const email=$("#email").value.trim();
  if(!email)return;
  const vak=$("[data-signin-msg]");
  vak.hidden=false;vak.dataset.kind="info";vak.textContent="Sending…";
  try{
    const response=await fetch(`${config.supabaseUrl}/auth/v1/otp`,{method:"POST",
      headers:{"content-type":"application/json",apikey:config.anonKey},
      body:JSON.stringify({email,create_user:false,options:{email_redirect_to:location.origin+"/admin/"}})});
    // Altijd hetzelfde antwoord, ook als het adres niet bestaat of niet is toegestaan.
    // Anders is dit formulier een manier om te achterhalen wie er beheerder is.
    vak.textContent=response.ok||response.status===422
      ?"If that address belongs to a Lewos administrator, a sign-in link is on its way."
      :"We could not send a sign-in link just now. Please try again shortly.";
  }catch{vak.textContent="We could not reach the sign-in service.";vak.dataset.kind="error";}
};

const lokaalInloggen=async email=>{
  const response=await fetch("/api/admin/local-login",{method:"POST",
    headers:{"content-type":"application/json"},body:JSON.stringify({email})});
  const body=await response.json();
  if(!response.ok){toonInloggen(body.error||"Local sign-in failed.","error");return;}
  bewaarToken(body.token);
  await start();
};

// ── Kalender ────────────────────────────────────────────────────────────────
const overlapt=(b,dag)=>b.arrival<=dag&&b.departure>=dag;

const tekenKalender=()=>{
  const jaar=zichtbaar.getFullYear(),maand=zichtbaar.getMonth();
  $("[data-month]").textContent=zichtbaar.toLocaleDateString("en-GB",{month:"long",year:"numeric"});
  const dagen=$("[data-days]");dagen.replaceChildren();
  const koppen=$("[data-dow]");
  if(!koppen.childElementCount)
    for(const d of ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"])koppen.append(el("div",{className:"dow",textContent:d}));

  const eerste=new Date(jaar,maand,1);
  const start=(eerste.getDay()+6)%7;              // maandag als eerste kolom
  const aantal=new Date(jaar,maand+1,0).getDate();
  const vandaag=iso(new Date());

  for(let i=0;i<start;i++)dagen.append(el("button",{className:"day",disabled:true,tabIndex:-1}));
  for(let d=1;d<=aantal;d++){
    const datum=iso(new Date(jaar,maand,d));
    const opDeze=boekingen.filter(b=>overlapt(b,datum));
    const cel=el("button",{className:`day${datum===vandaag?" today":""}`,type:"button"});
    cel.setAttribute("aria-pressed",String(datum===gekozenDag));
    cel.setAttribute("aria-label",`${toonDatum(datum)} — ${opDeze.length} booking${opDeze.length===1?"":"s"}`);
    cel.append(el("span",{className:"num",textContent:String(d)}));
    for(const b of opDeze.slice(0,3)){
      const s=status(b.payment?.state);
      cel.append(el("span",{className:`chip ${s.klasse}`,title:`${b.name} · ${b.seats} guests · ${s.label}`},
        b.name,el("span",{className:"seats",textContent:` · ${b.seats}`})));
    }
    if(opDeze.length>3)cel.append(el("span",{className:"more",textContent:`+${opDeze.length-3} more`}));
    cel.addEventListener("click",()=>{gekozenDag=datum;tekenKalender();tekenDag();});
    dagen.append(cel);
  }

  const legenda=$("[data-legend]");legenda.replaceChildren();
  for(const [sleutel,waarde] of Object.entries(STATUS))
    legenda.append(el("span",{},el("i",{className:`dot ${waarde.klasse}`}),waarde.label));
};

// ── Tellingen: boekingen tegenover personen ─────────────────────────────────
const telling=(lijst,titel,onder)=>el("div",{className:"tally"},
  el("b",{textContent:String(lijst.reduce((n,b)=>n+Number(b.seats||0),0))}),
  el("span",{textContent:titel}),
  el("small",{textContent:`${lijst.length} booking${lijst.length===1?"":"s"}${onder?" · "+onder:""}`}));

const rij=b=>{
  const s=status(b.payment?.state);
  const knop=el("button",{className:"row",type:"button"},
    el("span",{},el("span",{className:"nm",textContent:b.name}),
      el("span",{className:"meta",textContent:` · ${b.seats} ${b.seats===1?"person":"people"}`}),
      // De datums zijn het BEVESTIGDE verblijf; het balkje in de maandkalender loopt niet
      // verder dan dit. Ligt er een aanvraag, dan staat dat erbij als aanvraag — zichtbaar,
      // maar niet als extra dagen die al vastliggen.
      el("div",{className:"meta",textContent:`${toonDatum(b.arrival)} → ${toonDatum(b.departure)}${
        b.extraNightsStatus==="requested"?" · extra nights requested":""}`})),
    el("span",{className:`badge ${b.payment?.phase?FASE_KLASSE[b.payment.phase]||s.klasse:s.klasse}`,textContent:
      b.payment?.participantsTotal?`${b.payment.participantsPaid} of ${b.payment.participantsTotal} paid`:s.label}));
  if(b.payment?.progress)knop.querySelector("span").append(
    el("div",{className:"meta",textContent:`${b.payment.phaseLabel} · ${b.payment.progress}${
      b.payment.minutesRemaining!=null?" · "+resterend(b.payment.minutesRemaining):""}`}));
  knop.addEventListener("click",()=>toonDetail(b.claimId));
  return knop;
};

const tekenDag=()=>{
  const vak=$("[data-dayview]");
  if(!gekozenDag){vak.hidden=true;return;}
  vak.hidden=false;
  $("[data-daytitle]").textContent=toonDatum(gekozenDag);
  const opDeze=boekingen.filter(b=>overlapt(b,gekozenDag));
  const aan=opDeze.filter(b=>b.arrival===gekozenDag);
  const af=opDeze.filter(b=>b.departure===gekozenDag);
  $("[data-daytallies]").replaceChildren(
    telling(opDeze,"guests on site"),telling(aan,"arriving"),telling(af,"departing"));
  const rijen=$("[data-dayrows]");
  rijen.replaceChildren(...(opDeze.length?opDeze.map(rij):[el("p",{className:"empty",textContent:"No bookings on this day."})]));
};

const tekenWeek=()=>{
  const nu=new Date();
  const maandag=new Date(nu);maandag.setDate(nu.getDate()-((nu.getDay()+6)%7));
  const zondag=new Date(maandag);zondag.setDate(maandag.getDate()+6);
  const van=iso(maandag),tot=iso(zondag);
  $("[data-weekrange]").textContent=`${toonDatum(van)} → ${toonDatum(tot)}`;
  const aan=boekingen.filter(b=>b.arrival>=van&&b.arrival<=tot);
  const af=boekingen.filter(b=>b.departure>=van&&b.departure<=tot);
  const binnen=boekingen.filter(b=>b.arrival<=tot&&b.departure>=van);
  $("[data-weektallies]").replaceChildren(
    telling(aan,"arriving"),telling(af,"departing"),telling(binnen,"in house"));
  const lijst={arrivals:aan,departures:af,inhouse:binnen}[weektab];
  $("[data-weekrows]").replaceChildren(...(lijst.length?lijst.map(rij)
    :[el("p",{className:"empty",textContent:"Nothing this week."})]));
};

// ── Stoelen per weekend ─────────────────────────────────────────────────────
// De enige plek waar de verdeling tussen bevestigd en vastgehouden zichtbaar is. Een
// bezoeker op de site krijgt één getal: hoeveel er vrij zijn.
const tekenWeekends=()=>{
  const vak=$("[data-weekends]");
  if(!weekends.length){vak.hidden=true;return;}
  vak.hidden=false;
  const rijen=$("[data-weekendrows]");rijen.replaceChildren();
  for(const w of weekends){
    const breedte=n=>`${(n/Math.max(1,w.capacity))*100}%`;
    const kaart=el("div",{className:"wk"},el("h4",{textContent:w.label}),
      el("div",{className:"bar"},
        el("i",{className:"s-paid",style:`width:${breedte(w.seatsConfirmed)}`}),
        el("i",{className:"s-partially_paid",style:`width:${breedte(w.seatsHeld)}`})),
      el("div",{className:"wkmeta"},
        el("span",{textContent:`${w.seatsConfirmed} confirmed`}),
        el("span",{textContent:`${w.seatsHeld} held`}),
        el("span",{textContent:`${w.remaining} free of ${w.capacity}`})));
    if(w.weekendStatus==="below_minimum")kaart.append(el("div",{className:"warn",textContent:
      `Below the minimum: ${w.seatsConfirmed} of ${w.minimumPaidGuests} paid guests. ${w.belowMinimumBy} more needed for this weekend to go ahead. Held seats do not count — only paid ones do.`}));
    rijen.append(kaart);
  }
};

// ── Detail ──────────────────────────────────────────────────────────────────
// Botsingen met de gedeelde agenda. Bovenaan, want dit is het soort probleem dat je wilt
// zien vóórdat je iets anders doet: iemand heeft het huis verhuurd over een boeking heen.
const toonBotsingen=lijst=>{
  const vak=$("[data-conflicts]");
  if(!vak)return;
  if(!lijst||!lijst.length){vak.hidden=true;vak.replaceChildren();return;}
  vak.hidden=false;
  vak.replaceChildren(el("h3",{textContent:`Calendar conflicts — ${lijst.length}`}),
    el("p",{className:"why",textContent:
      "Something in the shared calendar overlaps a Tavern booking. Nothing has been changed automatically. Check the calendar and decide what happens."}),
    ...lijst.map(c=>el("div",{className:"row"},
      el("span",{},el("span",{className:"nm",textContent:c.summary||"(untitled calendar entry)"}),
        el("div",{className:"meta",textContent:`overlaps ${c.name} · ${c.weekendLabel||""} · ${c.nights.join(", ")}`})))));
};

const paar=(kop,waarde)=>[el("dt",{textContent:kop}),el("dd",{},waarde??"—")];

// Eén beheeractie uitvoeren. De server beslist of het mag; wij tonen alleen wat hij zegt.
let laatsteDetail=null;
// Een handeling op de boeking, niet op één deelnemer. Vandaag alleen het oordeel over
// aangevraagde extra nachten.
const boekingActie=async(claimId,pad,body,knop)=>{
  const token=leesToken();
  const response=await fetch(`/api/admin/bookings/${encodeURIComponent(claimId)}/${pad}`,{method:"POST",
    headers:{"content-type":"application/json",...(token?{authorization:`Bearer ${token}`}:{})},
    body:JSON.stringify(body)});
  const uitkomst=await response.json().catch(()=>({}));
  if(knop)knop.disabled=false;
  if(!response.ok){
    alert(uitkomst.message||{
      nothing_requested:"This booking has no extra nights requested.",
      stay_more_than_requested:"You cannot confirm more nights than the guest asked for.",
      no_weekend_dates:"This weekend has no dates in the database, so nights around it cannot be worked out."
    }[uitkomst.error]||`That did not work (${uitkomst.error||response.status}).`);
    return;
  }
  if(laatsteDetail)await toonDetail(laatsteDetail);
  await laad();
};

const actie=async(pad,body,knop)=>{
  const token=leesToken();
  const response=await fetch(`/api/admin/participants/${pad}`,{method:"POST",
    headers:{"content-type":"application/json",...(token?{authorization:`Bearer ${token}`}:{})},
    body:JSON.stringify(body)});
  const uitkomst=await response.json().catch(()=>({}));
  if(knop)knop.disabled=false;
  if(!response.ok){
    alert(uitkomst.message||{
      requires_owner:"Only Robert can extend a deadline or release a seat.",
      already_paid:"This guest has paid. Cancelling and refunding a paid seat is a separate step.",
      reason_required:"Please give a reason — it is recorded with the action."
    }[uitkomst.error]||`That did not work (${uitkomst.error||response.status}).`);
    return;
  }
  if(laatsteDetail)await toonDetail(laatsteDetail);
  await laad();
};

const toonDetail=async claimId=>{
  laatsteDetail=claimId;
  const vak=$("[data-detail]");
  vak.hidden=false;
  vak.replaceChildren(el("p",{className:"empty",textContent:"Loading…"}));
  let d;
  try{d=await api(`/api/admin/bookings/${encodeURIComponent(claimId)}`);}
  catch(error){vak.replaceChildren(el("p",{className:"empty",textContent:`Could not load this booking (${error.message}).`}));return;}

  const s=status(d.payment?.state);
  const kop=el("div",{className:"cardhead"},el("h2",{textContent:d.name}),
    el("span",{className:"spacer"}),el("span",{className:`badge ${s.klasse}`,textContent:s.label}));

  const feiten=el("dl",{className:"detail"},
    paar("Booking",d.claimId),
    paar("Contact",el("a",{href:`mailto:${d.email}`,textContent:d.email})),
    paar("People",`${d.seats} ${d.seats===1?"person":"people"}`),
    paar("Weekend",d.weekendLabel),
    // **Bevestigd verblijf.** Dit is wat er in de agenda staat en wat de accommodatie
    // heeft toegezegd. Zolang extra nachten niet bevestigd zijn, is dit het weekend zelf.
    paar("Arrival (confirmed)",toonDatum(d.arrival)),
    paar("Departure (confirmed)",toonDatum(d.departure)),
    paar("Booking status",d.status),
    paar("Payment",d.payment?.participantsTotal
      ? `${d.payment.phaseLabel||s.label} — ${d.payment.progress}`:s.label),
    ...(d.payment?.deadline?paar("Payment deadline",
      `${toonMoment(d.payment.deadline)} · ${resterend(d.payment.minutesRemaining)}`):[]),
    paar("Price per person",geld(d.priceCents)),
    paar("Registered",toonMoment(d.createdAt)));

  const secties=[kop,feiten];

  // Aangevraagde nachten krijgen een eigen blok, niet een regel tussen de bevestigde
  // gegevens. Anders leest een aanvraag als een afspraak — precies de verwarring die dit
  // hele onderscheid moet wegnemen.
  const nachtenStatus=d.extraNightsStatus||"none";
  if(nachtenStatus!=="none"||d.extraNights){
    const etiket={requested:"Requested — not confirmed",confirmed:"Confirmed by the accommodation",
      declined:"Declined by the accommodation",none:"Guest note"}[nachtenStatus]||"Requested";
    const blok=el("div",{className:"section"},
      el("h3",{textContent:`Extra nights — ${etiket}`}));
    const regels=el("dl",{className:"detail"});
    if(d.requestedArrival||d.requestedDeparture){
      regels.append(...paar("Requested arrival",toonDatum(d.requestedArrival)));
      regels.append(...paar("Requested departure",toonDatum(d.requestedDeparture)));
    }
    // Vrije tekst van oudere boekingen. Die staat er als wat hij is: de woorden van de
    // gast, niet een datum die wij hebben uitgerekend.
    if(d.extraNights)regels.append(...paar("As the guest wrote it",el("span",{className:"pre",textContent:d.extraNights})));
    if(d.extraNightsDecidedAt)regels.append(...paar("Decided",
      `${toonMoment(d.extraNightsDecidedAt)}${d.extraNightsDecidedBy?` by ${d.extraNightsDecidedBy}`:""}`));
    blok.append(regels);

    if(nachtenStatus==="requested"){
      blok.append(el("p",{className:"why",textContent:
        "Nothing above the confirmed arrival and departure is booked. The calendar entry covers the weekend only until these nights are confirmed."}));
      const knoppen=el("div",{className:"pacties"});
      const maak=(label,fn)=>{
        const b=el("button",{type:"button",className:"mini",textContent:label});
        b.addEventListener("click",()=>fn(b));return b;
      };
      knoppen.append(maak("Confirm as requested",async b=>{
        if(!confirm("Confirm these extra nights exactly as the guest asked? The calendar entry will then cover them."))return;
        b.disabled=true;
        await boekingActie(d.claimId,"extra-nights",{decision:"confirmed"},b);}));
      knoppen.append(maak("Confirm different dates",async b=>{
        // De accommodatie kan er één wél hebben en de andere niet. Meer dan gevraagd kan
        // niet; dat weigert de database.
        const aankomst=prompt("Confirmed arrival (YYYY-MM-DD)",d.requestedArrival||d.arrival||"");
        if(!aankomst)return;
        const vertrek=prompt("Confirmed departure (YYYY-MM-DD)",d.requestedDeparture||d.departure||"");
        if(!vertrek)return;
        b.disabled=true;
        await boekingActie(d.claimId,"extra-nights",
          {decision:"confirmed",confirmedArrival:aankomst,confirmedDeparture:vertrek},b);}));
      knoppen.append(maak("Decline",async b=>{
        const reden=prompt("Why can these nights not be given? This is recorded.");
        if(reden===null)return;
        b.disabled=true;
        await boekingActie(d.claimId,"extra-nights",{decision:"declined",reason:reden},b);}));
      blok.append(knoppen);
    }
    secties.push(blok);
  }

  if(Array.isArray(d.participants)&&d.participants.length){
    const lijst=el("div",{className:"plist"});
    for(const p of d.participants){
      const ps=status(p.status==="paid"?"paid":p.status==="awaiting_payment"?"awaiting_payment":p.status);
      const acties=el("div",{className:"pacties"});
      if(p.status!=="paid"&&p.status!=="cancelled"){
        const knop=(label,fn)=>{
          const b=el("button",{type:"button",className:"mini",textContent:label});
          b.addEventListener("click",()=>fn(b));
          return b;
        };
        acties.append(knop("Send reminder",async b=>{
          b.disabled=true;await actie(`${p.id}/remind`,{},b);}));
        // Verlengen en vrijgeven zijn beslissingen van Robert. Nadine ziet ze niet, en de
        // server weigert ze ook als iemand ze alsnog aanroept.
        if(d.viewerRole==="admin"){
          acties.append(knop("Extend deadline",async b=>{
            const reden=prompt("Why is this deadline being extended?");
            if(!reden)return;
            const uren=Number(prompt("Extend by how many hours?","2"));
            if(!Number.isFinite(uren)||uren<=0)return;
            b.disabled=true;
            await actie(`${p.id}/extend`,{reason:reden,newDeadline:new Date(Date.now()+uren*3600e3).toISOString()},b);}));
          acties.append(knop("Release seat",async b=>{
            const reden=prompt("Why is this seat being released? This is recorded.");
            if(!reden)return;
            if(!confirm(`Release the seat of ${p.name}? The other guests keep their confirmed places. Nothing is refunded here.`))return;
            b.disabled=true;await actie(`${p.id}/release`,{reason:reden},b);}));
        }
      }
      lijst.append(el("div",{className:"p"},
        el("span",{},el("span",{className:"nm",textContent:p.name}),
          el("div",{className:"meta",textContent:`${p.email} · ${geld(p.amountCents)}`}),
          el("div",{className:"meta",textContent:p.paidAt?`Paid ${toonMoment(p.paidAt)}`
            :p.hasPaymentLink?`Payment link ${p.paymentLinkSentAt?`sent ${toonMoment(p.paymentLinkSentAt)}`:"prepared, not sent"}`:"No payment link yet"})),
        el("span",{className:`badge ${ps.klasse}`,textContent:ps.label}),acties));
    }
    const kopje=el("div",{className:"section"},
      el("h3",{textContent:`Participants — ${d.payment.progress||`${d.payment.participantsPaid} of ${d.payment.participantsTotal} paid`}`}));
    // De melding die Robert en Nadine krijgen zodra de laatste dertig minuten ingaan.
    if(d.payment.needsOperatorNotice)kopje.append(el("div",{className:"sensitive"},
      el("p",{className:"why",style:"margin:0",textContent:
        `Final extension running until ${toonMoment(d.payment.deadline)}. Still unpaid: ${
          (d.payment.unpaidParticipants||[]).map(p=>`${p.name} <${p.email}>`).join(", ")}. Nothing is released automatically.`})));
    kopje.append(lijst);
    secties.push(kopje);
  }

  if(d.notes)secties.push(el("div",{className:"section"},
    el("h3",{textContent:"Practical notes"}),el("p",{className:"pre",textContent:d.notes})));

  // Gezondheidsgegevens. Ze komen alleen in dit antwoord voor, nooit in het
  // maandoverzicht en nooit in Google Agenda.
  // **Eén blok, één tekst.** Sinds 5 september 2026 vult de gast allergieën en dieetwensen
  // samen in. Boekingen van vóór die dag hebben nog twee kolommen; de database plakt die
  // aan elkaar mét hun kopje, zodat er niets wegvalt en niets twee keer staat.
  const dieet=d.dietaryNotes||"";
  if(dieet){
    secties.push(el("div",{className:"section"},
      el("h3",{textContent:"Allergies & dietary requirements"}),
      el("div",{className:"sensitive"},
        el("p",{className:"why",textContent:"Visible to named administrators only. Never written to Google Calendar or to any shared overview."}),
        el("p",{className:"pre",style:"margin:0",textContent:dieet}))));
  }

  if(Array.isArray(d.messages)){
    const rijen=el("div",{className:"rows"});
    for(const m of d.messages){
      const uitleg={sent:"Recorded as sent",prepared:"Ready to send — not sent yet",example:"Example only — nothing prepared"}[m.state]||m.state;
      rijen.append(el("div",{className:"row"},
        el("span",{},el("span",{className:"nm",textContent:m.label}),
          el("div",{className:"meta",textContent:m.sentAt?`${uitleg} · ${toonMoment(m.sentAt)}${m.providerId?` · ${m.providerId}`:""}`:uitleg})),
        el("span",{className:`mstate m-${m.state}`,textContent:m.state})));
    }
    secties.push(el("div",{className:"section"},el("h3",{textContent:"Messages"}),rijen));
  }

  vak.replaceChildren(...secties);
  vak.scrollIntoView({behavior:"smooth",block:"nearest"});
};

// ── Opstarten ───────────────────────────────────────────────────────────────
const laad=async()=>{
  const jaar=zichtbaar.getFullYear(),maand=zichtbaar.getMonth();
  // Ruim om de maand heen, zodat een verblijf dat over de maandgrens loopt meetelt.
  const van=iso(new Date(jaar,maand-1,1)),tot=iso(new Date(jaar,maand+2,0));
  const data=await api(`/api/admin/bookings?from=${van}&to=${tot}`);
  boekingen=data.bookings||[];
  weekends=data.weekends||[];
  tekenKalender();tekenWeekends();tekenWeek();tekenDag();
  toonBotsingen(data.calendarConflicts);
};

const start=async()=>{
  try{
    $("[data-signin]").hidden=true;
    $("[data-app]").hidden=false;
    await laad();
    $("[data-who]").hidden=false;
    $("[data-whoami]").textContent=ingelogdAls()||"Signed in";
  }catch(error){if(!["unauthenticated","forbidden"].includes(error.message))
    toonInloggen("We could not load the bookings. Please try again.","error");}
};

const init=async()=>{
  try{config=await (await fetch("/api/admin/config")).json();}catch{config={mode:"supabase"};}
  if(config.testEnvironment){
    $("[data-testbanner]").hidden=false;
    $("[data-env]").hidden=false;$("[data-env]").textContent="Test";
  }
  // Een magische link brengt het token terug in de fragmentidentificatie van de URL.
  const fragment=new URLSearchParams(location.hash.replace(/^#/,""));
  if(fragment.get("access_token")){
    bewaarToken(fragment.get("access_token"));
    history.replaceState(null,"",location.pathname);
  }
  if(config.mode==="local"){
    $("[data-local-signin]").hidden=false;
    const vak=$("[data-identities]");
    for(const i of config.identities||[]){
      const knop=el("button",{type:"button"},el("strong",{textContent:i.label}),
        el("small",{textContent:`${i.email} — ${i.allowed?"on the administrator list":"NOT on the list, should be refused"}`}));
      knop.addEventListener("click",()=>lokaalInloggen(i.email));
      vak.append(knop);
    }
  }else $("[data-supabase-signin]").hidden=false;

  $("[data-send]")?.addEventListener("click",magischeLink);
  $("[data-signout]").addEventListener("click",()=>{wisToken();location.reload();});
  $("[data-prev]").addEventListener("click",()=>{zichtbaar=new Date(zichtbaar.getFullYear(),zichtbaar.getMonth()-1,1);laad();});
  $("[data-next]").addEventListener("click",()=>{zichtbaar=new Date(zichtbaar.getFullYear(),zichtbaar.getMonth()+1,1);laad();});
  $("[data-today]").addEventListener("click",()=>{zichtbaar=new Date();gekozenDag=iso(new Date());laad();});
  for(const knop of document.querySelectorAll("[data-weektabs] button"))
    knop.addEventListener("click",()=>{
      weektab=knop.dataset.tab;
      for(const b of document.querySelectorAll("[data-weektabs] button"))b.setAttribute("aria-selected",String(b===knop));
      tekenWeek();
    });

  if(leesToken())await start();else toonInloggen();
};

init();
