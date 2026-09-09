/* Indicatieve omrekening naast de prijs.
 *
 * De euro blíjft de prijs. Stripe rekent in euro af (`currency:"eur"` in pay.mjs en
 * create-checkout-session.mjs) en de precontractuele informatie noemt één totaalbedrag.
 * Wat dit bestand toont is een hulpmiddel voor een gast die in ponden of dollars denkt,
 * geen tweede aanbod. Daarom staat er altijd "approx." bij, plus het eurobedrag dat
 * werkelijk wordt afgeschreven en de datum van de koers.
 *
 * De koersen zijn de referentiekoersen van de Europese Centrale Bank. Verzin er nooit een
 * bij en schat er nooit een: staat de dag van vandaag er niet bij, dan hoort de knop
 * gewoon te verdwijnen. Bijwerken doe je hier, op één plek, met de datum mee.
 *   Bron: https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml
 */
(function(){
  "use strict";

  var RATE_DATE="2026-09-08";
  var RATE_DATE_LABEL="8 September 2026";
  var CURRENCIES=[
    // De locale bepaalt hoe het symbool wordt geschreven: en-GB maakt van USD "US$2,352",
    // en-US maakt er "$2,352" van. Dat laatste is wat een Amerikaan verwacht te zien.
    {code:"EUR",symbol:"€",rate:1,locale:"en-IE",label:"euro"},
    {code:"GBP",symbol:"£",rate:0.85740,locale:"en-GB",label:"pound sterling"},
    {code:"USD",symbol:"$",rate:1.1614,locale:"en-US",label:"US dollar"}
  ];
  var STORAGE="lewos:currency";

  var codes=CURRENCIES.map(function(c){return c.code;});
  var find=function(code){
    for(var i=0;i<CURRENCIES.length;i++)if(CURRENCIES[i].code===code)return CURRENCIES[i];
    return CURRENCIES[0];
  };

  // Een privévenster of geblokkeerde opslag mag de pagina niet stukmaken.
  var read=function(){
    try{
      var saved=window.localStorage.getItem(STORAGE);
      return codes.indexOf(saved)>-1?saved:"EUR";
    }catch(e){return "EUR";}
  };
  var write=function(code){
    try{window.localStorage.setItem(STORAGE,code);}catch(e){}
  };

  var chosen=read();

  var format=function(cents,code){
    var currency=find(code);
    var amount=(Number(cents)/100)*currency.rate;
    if(!isFinite(amount))return "";
    try{
      return new Intl.NumberFormat(currency.locale,{style:"currency",currency:currency.code,maximumFractionDigits:0}).format(amount);
    }catch(e){
      return currency.symbol+Math.round(amount).toLocaleString(currency.locale);
    }
  };

  /* De publieke haak. `first-access.js` is een module en bouwt zijn eigen prijsregel op;
   * die vraagt hier het staartje op in plaats van de koers zelf te kennen. Bij euro is het
   * antwoord een lege string, zodat de regel er ongewijzigd uitziet. */
  window.lewosCurrency={
    current:function(){return chosen;},
    rateDate:RATE_DATE,
    /** " (approx. $2,352)" of "" bij euro. */
    approx:function(cents){
      if(chosen==="EUR")return "";
      var money=format(cents,chosen);
      return money?" (approx. "+money+")":"";
    }
  };

  var paint=function(){
    // Een pagina kan meer dan één knoppenrij hebben — bij de prijs én bij het formulier.
    // Ze tonen allemaal dezelfde keuze, anders lijkt de ene rij de andere tegen te spreken.
    var knoppen=document.querySelectorAll(".fx__button[data-currency]");
    for(var k=0;k<knoppen.length;k++){
      knoppen[k].setAttribute("aria-pressed",String(knoppen[k].getAttribute("data-currency")===chosen));
    }
    var nodes=document.querySelectorAll("[data-approx]");
    for(var i=0;i<nodes.length;i++){
      var cents=Number(nodes[i].getAttribute("data-approx"));
      if(!isFinite(cents)||cents<=0){nodes[i].textContent="";continue;}
      nodes[i].textContent=chosen==="EUR"?"":" ≈ "+format(cents,chosen);
    }
    var notes=document.querySelectorAll("[data-approx-note]");
    for(var n=0;n<notes.length;n++)notes[n].hidden=(chosen==="EUR");
    // De module-scripts rekenen hun eigen regels opnieuw op dit signaal.
    document.dispatchEvent(new CustomEvent("lewos:currency",{detail:{currency:chosen}}));
  };

  var build=function(host){
    var group=host.querySelector("[data-currency-buttons]");
    if(!group)return;
    CURRENCIES.forEach(function(currency){
      var button=document.createElement("button");
      button.type="button";
      button.className="fx__button";
      button.setAttribute("data-currency",currency.code);
      button.textContent=currency.symbol+" "+currency.code;
      button.setAttribute("aria-label","Show approximate prices in "+currency.label);
      button.setAttribute("aria-pressed",String(currency.code===chosen));
      button.addEventListener("click",function(){
        chosen=currency.code;
        write(chosen);
        paint();
      });
      group.appendChild(button);
    });
    host.hidden=false;
  };

  var start=function(){
    var hosts=document.querySelectorAll("[data-currency-switch]");
    for(var i=0;i<hosts.length;i++)build(hosts[i]);
    // De datumregel komt uit dezelfde bron als de koers, zodat ze niet uit elkaar lopen.
    var stamps=document.querySelectorAll("[data-rate-date]");
    for(var s=0;s<stamps.length;s++)stamps[s].textContent=RATE_DATE_LABEL;
    paint();
  };

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start);
  else start();
})();
