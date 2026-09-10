// De persoonlijke betaalpagina. Het kenmerk in de URL komt uit de eigen betaalmail van de
// gast; alles wat deze pagina toont gaat over die ene persoon.
//
// De pagina rekent niets zelf uit en gelooft niets uit de URL behalve het kenmerk. Naam,
// bedrag en termijn komen van de server, want anders zou iemand met een bewerkte link zijn
// eigen bedrag kunnen bepalen.
const $=s=>document.querySelector(s);
const ref=new URLSearchParams(location.search).get("ref")||"";

const toonFout=tekst=>{
  $("#laden").hidden=true;$("#gevonden").hidden=true;
  $("#foutregel").textContent=tekst;$("#fout").hidden=false;
};

const geld=centen=>typeof centen==="number"
  ?`€${(centen/100).toLocaleString("en-IE",{minimumFractionDigits:2,maximumFractionDigits:2})}`:"";

// De termijn in de tijdzone van het weekend, niet die van de bezoeker: het gaat om een tijd
// die iedereen in de groep gelijk heeft.
const klok=iso=>{
  const d=new Date(iso);
  return Number.isNaN(d.getTime())?"":d.toLocaleString("en-GB",
    {dateStyle:"medium",timeStyle:"short",timeZone:"Europe/Madrid"})+" (Europe/Madrid)";
};

(async()=>{
  if(!ref)return toonFout("This link is missing its payment reference. Use the link from your payment email.");
  let antwoord,gegevens;
  try{
    antwoord=await fetch(`/api/pay?ref=${encodeURIComponent(ref)}`,{headers:{accept:"application/json"}});
    gegevens=await antwoord.json();
  }catch{return toonFout("We could not reach the booking service. Nothing has been charged. Please try again in a moment.");}

  if(!antwoord.ok||gegevens.status==="already_paid"){
    const zinnen={
      not_found:"We do not recognise this payment link. Check that you used the whole link from your email.",
      expired:"The payment window for this booking has passed. Nothing has been charged — get in touch and we will see what is still possible.",
      cancelled:"This booking was released. Nothing has been charged.",
      payment_service_unavailable:"We could not look up this booking just now. Nothing has been charged. Please try again shortly."
    };
    if(gegevens.status==="already_paid"){
      $("#kop").textContent="Already paid";
      return toonFout(`${gegevens.fullName||"This guest"} has already paid this share. Nothing further is due.`);
    }
    return toonFout(zinnen[gegevens.error]||"We could not open this payment. Nothing has been charged.");
  }

  $("#naam").textContent=gegevens.fullName||"";
  $("#weekend").textContent=gegevens.weekendLabel||"";
  $("#bedrag").textContent=geld(gegevens.amountCents);
  $("#termijn").textContent=klok(gegevens.deadline);
  $("#laden").hidden=true;$("#gevonden").hidden=false;

  if(!gegevens.paymentsOpen){$("#poortdicht").hidden=false;return;}

  // De eigen bevestigingen van deze deelnemer. Ze staan pas in beeld als er ook echt
  // betaald kan worden — anders vraag je iemand iets te bevestigen voor een knop die
  // niet werkt.
  const filmen=gegevens.filmingRequired===true;
  $("#bevestigingen").hidden=false;
  if(filmen){
    $("#filmweekend").textContent=gegevens.weekendLabel||"this weekend";
    $("#vink-filmen").hidden=false;
  }
  const vinkjes=[$("#eigen-adult"),$("#eigen-privacy"),...(filmen?[$("#eigen-filmen")]:[])];

  const knop=$("#betaal");
  knop.hidden=false;
  // Alle drie zijn verplicht. De knop blijft uit tot ze staan; de server weigert het ook,
  // maar een dode knop is duidelijker dan een foutmelding na het klikken.
  const weegKnop=()=>{knop.disabled=!vinkjes.every(v=>v.checked);};
  vinkjes.forEach(v=>v.addEventListener("change",weegKnop));
  weegKnop();

  knop.addEventListener("click",async()=>{
    if(knop.disabled)return;
    knop.disabled=true;knop.textContent="Opening the payment page…";
    $("#knopfout").hidden=true;
    try{
      const r=await fetch(`/api/pay?ref=${encodeURIComponent(ref)}`,{method:"POST",
        headers:{accept:"application/json","content-type":"application/json"},
        body:JSON.stringify({
          adultConfirmed:$("#eigen-adult").checked,
          privacyAccepted:$("#eigen-privacy").checked,
          filmingAcknowledged:filmen?$("#eigen-filmen").checked:false
        })});
      const b=await r.json();
      if(r.ok&&b.checkoutUrl){location.href=b.checkoutUrl;return;}
      $("#knopfout").textContent=b.message||"We could not open the payment page. Nothing has been charged.";
    }catch{
      $("#knopfout").textContent="We could not reach the payment page. Nothing has been charged.";
    }
    $("#knopfout").hidden=false;
    knop.textContent="Pay my share →";
    weegKnop();
  });
})();
