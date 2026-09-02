// De browserkant van de lengtegrenzen. Dezelfde getallen als in
// netlify/functions/_field-limits.mjs; een test bewaakt dat ze gelijk blijven.
//
// Wat dit bestand doet, en waarom:
// - het zet een teller onder elk veld met een maxlength, zodat de grens zichtbaar is
//   vóór iemand hem raakt in plaats van erna;
// - het weigert verzenden zolang een veld over de grens zit, met een melding die het
//   veld bij naam noemt;
// - het kapt nooit iets af. Tekst weggooien zonder het te zeggen is precies wat we
//   hier weghalen.
(function(){
  var LIMITS={name:120,email:254,allergies:500,dietary:500,message:2000,when:120,idea:1800,question:500};
  window.LEWOS_FIELD_LIMITS=LIMITS;

  var velden=[].slice.call(document.querySelectorAll("[data-limit]"));
  if(!velden.length)return;

  var labelVan=function(veld){
    var label=veld.id?document.querySelector('label[for="'+veld.id+'"]'):null;
    return label?label.textContent.replace(/\s+/g," ").trim():"This field";
  };

  velden.forEach(function(veld){
    var grens=LIMITS[veld.dataset.limit];
    if(!grens)return;
    veld.setAttribute("maxlength",String(grens));

    var teller=document.createElement("span");
    teller.className="field-count";
    teller.setAttribute("data-field-count",veld.dataset.limit);
    // Geen aria-live: dat zou bij elke toetsaanslag voorlezen. De grens staat in de
    // beschrijving van het veld, zodat een schermlezer hem één keer noemt bij focus.
    teller.setAttribute("aria-hidden","true");
    veld.insertAdjacentElement("afterend",teller);

    var beschrijving=document.createElement("span");
    beschrijving.className="field-count__sr";
    beschrijving.id=(veld.id||veld.name)+"-limit";
    beschrijving.textContent="Maximum "+grens+" characters.";
    teller.insertAdjacentElement("afterend",beschrijving);
    var beschreven=veld.getAttribute("aria-describedby");
    veld.setAttribute("aria-describedby",beschreven?beschreven+" "+beschrijving.id:beschrijving.id);

    var werkBij=function(){
      var lengte=veld.value.length;
      teller.textContent=lengte+" / "+grens;
      teller.dataset.state=lengte>grens?"over":(lengte>grens*0.9?"near":"ok");
    };
    veld.addEventListener("input",werkBij);
    werkBij();
  });

  // Laatste net vóór verzenden. `maxlength` houdt typen en plakken al tegen, maar een
  // waarde die door een script is gezet komt daar langs — en dan hoort de gast een
  // melding te zien, niet een stilzwijgend ingekorte tekst.
  [].slice.call(document.querySelectorAll("form")).forEach(function(form){
    form.addEventListener("submit",function(event){
      var teLang=velden.filter(function(veld){
        return form.contains(veld)&&LIMITS[veld.dataset.limit]&&veld.value.length>LIMITS[veld.dataset.limit];
      });
      if(!teLang.length)return;
      event.preventDefault();
      event.stopImmediatePropagation();
      var veld=teLang[0];
      var grens=LIMITS[veld.dataset.limit];
      veld.setCustomValidity(labelVan(veld)+" is "+(veld.value.length-grens)+" characters too long. The maximum is "+grens+".");
      veld.reportValidity();
      veld.addEventListener("input",function herstel(){veld.setCustomValidity("");veld.removeEventListener("input",herstel);});
      veld.focus();
    },true);
  });
})();
