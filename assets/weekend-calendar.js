// De kalender waarin een gast zijn weekend kiest en daarna zijn aankomst en vertrek.
//
// Eén component, gebruikt door /tavern/ en /tavern/book/, zodat er niet twee kalenders
// bestaan die verschillend tellen. Het rekenwerk zit in `stay.js`; dit bestand tekent
// alleen en vangt kliks op.
//
// Hoe het bedient, in de volgorde waarin een gast het tegenkomt:
//
//   1. Klik op een dag in een weekendblok  → dat weekend is gekozen. Aankomst en vertrek
//      staan dan op de weekenddatums: het weekend zelf, drie nachten, meer niet.
//   2. Klik op een dag vóór het weekend    → dat wordt je aankomstdag.
//   3. Klik op een dag ná het weekend      → dat wordt je vertrekdag.
//   4. Klik nog eens op diezelfde dag      → de aanvraag gaat weer weg.
//
// **De weekendnachten kun je niet uitzetten.** Dat is het product; wie ze weg zou kunnen
// klikken koopt iets wat niet bestaat.
//
// De dagen eromheen zagen er eerst gestippeld uit, om te zeggen "dit is een aanvraag, geen
// geboekte nacht". Dat was op de verkeerde plek: die stippel stond óók op de vijfenveertig
// dagen die niemand had aangeklikt, en dan zegt hij alleen nog "hier kun je klikken". Het
// resultaat was een raster vol even luide vakjes waarin je je eigen weekend kwijtraakte.
//
// Nu is een niet-gekozen dag gewoon een datum. Hij licht op als je eroverheen gaat, en de
// dagen die je wél aanklikt kleuren mee in hetzelfde oranje als het weekend — **een tint
// lichter**, want ze zijn aangevraagd en niet geboekt. Dat onderscheid zit verder in de
// legenda, in de zin onder de kalender en in het voorleeslabel van elk vakje.
//
// **Buiten het venster kun je niet klikken.** Dat is hoe een datumkiezer bij een hotel
// werkt: dagen die je niet kunt krijgen zijn grijs en doen niets. Zonder die grens kon je
// in één klik acht weken aanvragen, en dan kleurde een hele maand oranje voor een verblijf
// dat nooit zo verkocht wordt.
//
// Het venster is geen verzinsel van dit bestand. Het staat als afspraak op /tavern/:
//
//   "Depending on availability, you can extend your stay from the Monday before your
//    Tavern weekend, or remain until Friday morning after it. Want to stay longer — or
//    join us across two Tavern weekends? Ask us."
//
// Dus: aankomen kan vanaf de maandag vóór het weekend, vertrekken tot en met de vrijdag
// erna. Wie langer wil, komt bij Robert terecht — en dat staat er ook, met een link. Een
// gesprek is hier het juiste antwoord, geen vakje dat je aanklikt.

import {STAY_STATUS,parseDay,formatDay,addDays,describeStay,staySentence,shortDate,stayWindow} from "/assets/stay.js";

const MONTHS=["January","February","March","April","May","June",
  "July","August","September","October","November","December"];
const DOW=["Mo","Tu","We","Th","Fr","Sa","Su"];

const monthKey=date=>date.getUTCFullYear()*12+date.getUTCMonth();
const fromMonthKey=n=>new Date(Date.UTC(Math.floor(n/12),n%12,1,12));
const vandaag=()=>{const d=new Date(Date.now());return new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate(),12));};

export const createWeekendCalendar=({mount,summary,onChange,monthsVisible=2}={})=>{
  if(!mount)return null;

  let weekends=[];            // [{slug,label,dateLabel,startsOn,endsOn,remaining,capacity}]
  let gekozen="";             // slug van het gekozen weekend
  let aankomst=null,vertrek=null; // ISO-datums, of null = de weekendgrens zelf
  let gewenst=1;              // aantal stoelen, bepaalt of een weekend nog past
  let eersteMaand=null;       // linkerkolom van de zichtbare maanden
  // Nachten die het huis al kwijt is, uit de gedeelde agenda. Leeg betekent "wij weten het
  // niet" — dan blokkeert de kalender niets en blijven extra nachten gewoon op aanvraag.
  let bezet=new Set();

  const dated=()=>weekends.filter(w=>parseDay(w.startsOn)&&parseDay(w.endsOn));

  // De nachten van een weekend: aankomstdag tot en met de dag vóór vertrek.
  const nachtenVan=week=>{
    const uit=[],eind=parseDay(week.endsOn);
    for(let d=parseDay(week.startsOn);d<eind;d=addDays(d,1))uit.push(formatDay(d));
    return uit;
  };
  // **Wie het eerst boekt, heeft het.** Staat er een boeking van Nadine over dit weekend,
  // dan is het huis weg en gaat het weekend van de site af — niet als dichte deur, maar
  // met de vraag om contact op te nemen.
  const weekendBezet=week=>nachtenVan(week).some(n=>bezet.has(n));
  const huidig=()=>dated().find(w=>w.slug===gekozen)||null;

  // Van wanneer tot wanneer je mag kiezen. Het rekenwerk staat in `stay.js`, zodat de
  // browser en de database exact hetzelfde venster uitrekenen. Aankomen in het verleden
  // kan niet, dus de ondergrens schuift mee met vandaag.
  const venster=()=>{
    const week=huidig();
    if(!week)return null;
    return stayWindow({weekendStart:week.startsOn,weekendEnd:week.endsOn,
      weekends:dated(),notBefore:formatDay(vandaag())});
  };

  const stand=()=>{
    const week=huidig();
    if(!week)return null;
    return describeStay({weekendStart:week.startsOn,weekendEnd:week.endsOn,arrival:aankomst,departure:vertrek});
  };

  // Alle dagen die bij een weekendblok horen, zodat een cel weet wat hij is.
  const weekendDagen=()=>{
    const kaart=new Map();
    dated().forEach(week=>{
      const eind=parseDay(week.endsOn);
      for(let dag=parseDay(week.startsOn);dag<=eind;dag=addDays(dag,1))kaart.set(formatDay(dag),week);
    });
    return kaart;
  };

  const laagsteMaand=()=>{
    const datums=dated().map(w=>monthKey(parseDay(w.startsOn)));
    return Math.min(monthKey(vandaag()),...(datums.length?datums:[monthKey(vandaag())]));
  };

  const zichtbaar=()=>{
    if(eersteMaand===null){
      const week=huidig()||dated()[0];
      eersteMaand=week?monthKey(parseDay(week.startsOn)):monthKey(vandaag());
    }
    if(eersteMaand<laagsteMaand())eersteMaand=laagsteMaand();
    return Array.from({length:monthsVisible},(_,i)=>eersteMaand+i);
  };

  const cel=(datum,blok,verblijf)=>{
    const iso=formatDay(datum);
    const dagnummer=datum.getUTCDate();
    const week=huidig();
    const isVerleden=datum<vandaag();

    if(blok){
      const huisWeg=weekendBezet(blok);
      const past=blok.remaining>=gewenst&&!huisWeg;
      const isGekozen=week&&blok.slug===week.slug;
      // **Een wisseldag.** Deze dag hoort bij een ánder weekend, maar is voor jou een
      // geldige aankomst- of vertrekdag: je vertrekt om 09:30 en de volgende gasten komen
      // om 16:00, dus jullie nachten botsen niet. Hij is dan te kiezen als eindpunt; de
      // andere drie dagen van dat blok blijven de weg om van weekend te wisselen.
      const grensNu=verblijf?.valid?venster():null;
      if(week&&!isGekozen&&grensNu&&(iso===grensNu.from||iso===grensNu.to)){
        const rol=iso===grensNu.from?"arrival":"departure";
        const gekozenRand=verblijf.extraNights>0&&(iso===verblijf.arrival||iso===verblijf.departure);
        const inAanvraagNu=verblijf.valid&&((rol==="arrival"&&iso>=verblijf.arrival&&iso<verblijf.weekendStart)
          ||(rol==="departure"&&iso<=verblijf.departure&&iso>verblijf.weekendEnd));
        const kl=["calday","is-open","is-turnover"];
        if(inAanvraagNu)kl.push("is-requested");
        if(gekozenRand)kl.push("is-edge");
        const uitleg=rol==="arrival"
          ?`${iso} — you can arrive on this day: the previous Tavern group leaves in the morning. On request, subject to availability.`
          :`${iso} — you can leave on this morning: the next Tavern group arrives in the afternoon. On request, subject to availability.`;
        return `<button type="button" class="${kl.join(" ")}" data-extra="${rol}" data-day="${iso}"`
          +` aria-pressed="${inAanvraagNu?"true":"false"}" aria-label="${uitleg}" title="${uitleg}">`
          +`<span class="calday__n">${dagnummer}</span></button>`;
      }
      const klassen=["calday","is-weekend"];
      if(isGekozen)klassen.push("is-chosen");
      else if(huisWeg)klassen.push("is-taken");
      else if(!past)klassen.push("is-full");
      else if(blok.remaining<=2)klassen.push("is-low");
      const zitplaatsen=huisWeg?"the house is booked for these dates — ask us about other possibilities"
        :blok.remaining===0?"no seats left"
        :!past?`only ${blok.remaining} of ${blok.capacity} seats free, not enough for ${gewenst}`
        :`${blok.remaining} of ${blok.capacity} seats free`;
      const label=isGekozen?`${blok.label}, ${blok.dateLabel} — your chosen weekend, included`
        :`${blok.label}, ${blok.dateLabel}, ${zitplaatsen}`;
      // Het gekozen weekend blijft een knop zodat de focusvolgorde niet verspringt,
      // maar hij doet niets: deze nachten horen bij de boeking en gaan nergens heen.
      return `<button type="button" class="${klassen.join(" ")}" data-slug="${blok.slug}" data-day="${iso}"`
        +`${!past&&!isGekozen?" disabled":""}${isGekozen?' aria-current="true"':""} aria-label="${label}" title="${label}">`
        +`<span class="calday__n">${dagnummer}</span></button>`;
    }

    // Zonder gekozen weekend is een gewone dag alleen een datum. Er valt dan nog niets
    // te verlengen, dus hij is ook niet aan te klikken.
    if(!week||isVerleden)return `<div class="calday${isVerleden?" is-past":""}"><span class="calday__n">${dagnummer}</span></div>`;

    const start=parseDay(week.startsOn),eind=parseDay(week.endsOn);
    const voor=datum<start,na=datum>eind;
    if(!voor&&!na)return `<div class="calday"><span class="calday__n">${dagnummer}</span></div>`;
    // Buiten het venster: wel te zien, niet te kiezen. Net als een volgeboekte dag bij een
    // hotel — hij staat er, hij doet niets, en eronder staat wat je dan wél kunt doen.
    const grens=venster();
    if(grens&&(iso<grens.from||iso>grens.to))
      return `<div class="calday is-outside"><span class="calday__n">${dagnummer}</span></div>`;
    // Het huis is die nacht al verhuurd. Zichtbaar, niet te kiezen — net als bij een hotel.
    if(bezet.has(iso))
      return `<div class="calday is-busy" title="The house is booked for this night."`
        +` aria-label="${iso} — the house is already booked for this night."><span class="calday__n">${dagnummer}</span></div>`;

    const inAanvraag=verblijf?.valid
      &&((voor&&iso>=verblijf.arrival)||(na&&iso<=verblijf.departure));
    const isRand=verblijf?.valid&&(iso===verblijf.arrival||iso===verblijf.departure)&&verblijf.extraNights>0;
    // `is-open` is een dag die je kúnt aanklikken. Hij draagt geen rand: een kalender waar
    // vijfenveertig vakjes tegelijk om aandacht vragen is geen kalender meer.
    const klassen=["calday","is-open"];
    if(inAanvraag)klassen.push("is-requested");
    if(isRand)klassen.push("is-edge");
    const rol=voor?"arrival":"departure";
    const label=inAanvraag
      ?`${iso} — extra night on request, currently in your request. Click to remove.`
      :`${iso} — request this as an extra ${rol==="arrival"?"night before":"night after"} the weekend. On request, subject to availability.`;
    return `<button type="button" class="${klassen.join(" ")}" data-extra="${rol}" data-day="${iso}"`
      +` aria-pressed="${inAanvraag?"true":"false"}" aria-label="${label}" title="${label}">`
      +`<span class="calday__n">${dagnummer}</span></button>`;
  };

  const maand=(sleutel,blokken,verblijf)=>{
    const eerste=fromMonthKey(sleutel);
    const jaar=eerste.getUTCFullYear(),maandnr=eerste.getUTCMonth();
    const aanloop=(new Date(Date.UTC(jaar,maandnr,1)).getUTCDay()+6)%7;
    const dagen=new Date(Date.UTC(jaar,maandnr+1,0)).getUTCDate();
    let cellen="";
    for(let i=0;i<aanloop;i++)cellen+='<div class="calday" aria-hidden="true"></div>';
    for(let d=1;d<=dagen;d++){
      const datum=new Date(Date.UTC(jaar,maandnr,d,12));
      cellen+=cel(datum,blokken.get(formatDay(datum))||null,verblijf);
    }
    return `<div class="calmonth"><h4>${MONTHS[maandnr]} ${jaar}</h4>`
      +`<div class="calmonth__dow">${DOW.map(n=>`<span>${n}</span>`).join("")}</div>`
      +`<div class="calmonth__grid">${cellen}</div></div>`;
  };

  const teken=()=>{
    const items=dated();
    if(!items.length){mount.removeAttribute("data-ready");mount.innerHTML="";vertel();return;}
    const blokken=weekendDagen();
    const verblijf=stand();
    const maanden=zichtbaar();
    const terugKan=maanden[0]>laagsteMaand();
    mount.innerHTML=
      `<div class="calnav">`
      +`<button type="button" class="calnav__btn" data-move="-1"${terugKan?"":" disabled"} aria-label="Show earlier months">&larr;</button>`
      +`<span class="calnav__label" aria-live="polite">${maanden.map(m=>{const d=fromMonthKey(m);return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;}).join(" – ")}</span>`
      +`<button type="button" class="calnav__btn" data-move="1" aria-label="Show later months">&rarr;</button>`
      +`</div>`
      +`<div class="calendar__months">${maanden.map(m=>maand(m,blokken,verblijf)).join("")}</div>`
      +legenda(verblijf);
    mount.setAttribute("data-ready","");
    vertel();
  };

  const legenda=verblijf=>{
    if(!verblijf?.valid)return `<p class="calendar__hint">Pick a weekend first. You can add nights before or after once a weekend is chosen.</p>`;
    const grens=venster();
    // Wat er buiten het venster ligt is geen fout van de gast en geen dood einde: het is
    // een vraag aan Robert. Dat hoort er te staan, met de weg ernaartoe.
    const ruimte=grens
      ? `<p class="calendar__hint">You can arrive from ${shortDate(grens.from)} and leave by ${shortDate(grens.to)}. `
        +`Staying longer, or joining two Tavern weekends? <a href="/contact/">Ask us</a> &mdash; special arrangements may be possible.</p>`
      : "";
    return `<div class="callegend">`
      +`<span class="callegend__item"><span class="callegend__swatch is-chosen"></span>Your weekend &mdash; included</span>`
      +`<span class="callegend__item"><span class="callegend__swatch is-requested"></span>Extra night &mdash; on request, not confirmed</span>`
      +`<span class="callegend__item"><span class="callegend__swatch is-unavailable"></span>Not available</span>`
      +(verblijf.extraNights?`<button type="button" class="callegend__clear" data-clear>Only the weekend</button>`:"")
      +`</div>`+ruimte;
  };

  const vertel=()=>{
    const verblijf=stand();
    if(summary){
      summary.textContent=verblijf?.valid
        ?staySentence(verblijf)
        :"Pick a weekend in the calendar, or choose a private Tavern below.";
    }
    if(typeof onChange==="function")onChange({
      slug:gekozen,
      stay:verblijf,
      weekend:huidig(),
      arrival:verblijf?.valid?verblijf.arrival:"",
      departure:verblijf?.valid?verblijf.departure:"",
      status:verblijf?.valid?verblijf.status:STAY_STATUS.none
    });
  };

  // Wat je zou krijgen als je hier klikt, vóórdat je klikt. Dit tekent niet opnieuw maar
  // zet klassen: opnieuw tekenen zou de muisaanwijzer onder de vakjes vandaan trekken.
  const wisVoorbeeld=()=>mount.querySelectorAll(".is-preview").forEach(c=>c.classList.remove("is-preview"));
  const toonVoorbeeld=knop=>{
    wisVoorbeeld();
    const verblijf=stand();
    if(!verblijf?.valid)return;
    const dag=knop.dataset.day,kant=knop.dataset.extra;
    mount.querySelectorAll("button.is-open[data-day]").forEach(cel=>{
      const d=cel.dataset.day;
      if(cel.classList.contains("is-requested"))return;
      const raakt=kant==="arrival"
        ?(d>=dag&&d<verblijf.arrival)
        :(d<=dag&&d>verblijf.departure);
      if(raakt)cel.classList.add("is-preview");
    });
  };
  mount.addEventListener("pointerover",event=>{
    const knop=event.target.closest("button.is-open[data-extra]");
    if(knop)toonVoorbeeld(knop);else wisVoorbeeld();
  });
  mount.addEventListener("pointerleave",wisVoorbeeld);

  mount.addEventListener("click",event=>{
    const verplaats=event.target.closest("[data-move]");
    if(verplaats){eersteMaand=zichtbaar()[0]+Number(verplaats.dataset.move);teken();return;}
    if(event.target.closest("[data-clear]")){aankomst=null;vertrek=null;teken();return;}
    const knop=event.target.closest("button[data-day]");
    if(!knop||knop.disabled)return;

    if(knop.dataset.slug){
      // Een ander weekend kiezen laat de extra nachten los: die hoorden bij de vorige
      // datums en zouden er anders stilzwijgend aan de verkeerde kant bij komen te staan.
      if(knop.dataset.slug!==gekozen){gekozen=knop.dataset.slug;aankomst=null;vertrek=null;teken();}
      return;
    }
    const dag=knop.dataset.day;
    const verblijf=stand();
    if(!verblijf?.valid)return;
    // De opmaak alleen is geen grens. Deze controle is de grens.
    const grens=venster();
    if(grens&&(dag<grens.from||dag>grens.to))return;
    if(bezet.has(dag))return;
    // Ook geen bereik dat over een bezette nacht heen springt: elke nacht ertussen moet
    // vrij zijn, anders vraag je een verblijf aan met een gat erin.
    const verblijfNu=stand();
    if(verblijfNu?.valid){
      const van=knop.dataset.extra==="arrival"?dag:verblijfNu.weekendEnd;
      const tot=knop.dataset.extra==="arrival"?verblijfNu.weekendStart:dag;
      for(let d=parseDay(van);formatDay(d)<tot;d=addDays(d,1))if(bezet.has(formatDay(d)))return;
    }
    if(knop.dataset.extra==="arrival")aankomst=(verblijf.arrival===dag)?null:dag;
    else vertrek=(verblijf.departure===dag)?null:dag;
    teken();
    wisVoorbeeld();
  });

  return {
    element:mount,
    setWeekends(lijst){weekends=Array.isArray(lijst)?lijst:[];teken();},
    // De bezette nachten uit de gedeelde agenda. Niets doorgeven betekent "onbekend", en
    // dan blokkeert de kalender niets — een storing mag nooit een nacht vrij verklaren.
    setBusyNights(nachten){bezet=new Set(Array.isArray(nachten)?nachten:[]);teken();},
    setWantedSeats(aantal){
      gewenst=Number.isInteger(aantal)&&aantal>0?aantal:1;
      // Past de eerder gekozen datum niet meer bij een groter gezelschap, laat hem los
      // in plaats van iemand met een onmogelijke keuze te laten doorlopen.
      const week=huidig();
      if(week&&week.remaining<gewenst){gekozen="";aankomst=null;vertrek=null;}
      teken();
    },
    select(slug){if(slug!==gekozen){gekozen=slug||"";aankomst=null;vertrek=null;teken();}},
    selection(){const verblijf=stand();return {slug:gekozen,stay:verblijf,
      arrival:verblijf?.valid?verblijf.arrival:"",departure:verblijf?.valid?verblijf.departure:""};},
    ready(){return mount.hasAttribute("data-ready");}
  };
};
