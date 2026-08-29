(()=>{
  const slider=document.querySelector('[data-surroundings]');
  if(!slider)return;
  const track=slider.querySelector('[data-track]');
  const slides=[...track.querySelectorAll('figure')];
  const dots=slider.querySelector('[data-dots]');
  if(slides.length<2)return;

  const WISSEL=3000;
  // Iemand die beweging heeft uitgezet krijgt geen automatisch doorschuivende beelden.
  const rustig=window.matchMedia('(prefers-reduced-motion: reduce)');
  let huidig=0;
  let timer=null;
  let overgenomen=rustig.matches;

  const gedrag=()=>rustig.matches?'auto':'smooth';
  const ga=index=>{
    huidig=(index+slides.length)%slides.length;
    track.scrollTo({left:slides[huidig].offsetLeft-track.offsetLeft,behavior:gedrag()});
    teken();
  };

  const knoppen=slides.map((slide,index)=>{
    const knop=document.createElement('button');
    knop.type='button';
    knop.setAttribute('role','tab');
    knop.setAttribute('aria-label',`Photograph ${index+1} of ${slides.length}`);
    knop.addEventListener('click',()=>{neem();ga(index);});
    dots.appendChild(knop);
    return knop;
  });
  const teken=()=>{
    knoppen.forEach((knop,index)=>knop.setAttribute('aria-selected',String(index===huidig)));
    slides.forEach((slide,index)=>slide.setAttribute('aria-hidden',String(index!==huidig)));
  };

  const stop=()=>{if(timer){clearInterval(timer);timer=null;}};
  const start=()=>{if(!overgenomen&&!timer&&!document.hidden)timer=setInterval(()=>ga(huidig+1),WISSEL);};
  // Zodra de bezoeker zelf stuurt, houdt het automatisch doorschuiven op. Anders
  // beweegt de pagina onder iemands vinger weg terwijl die aan het kijken is.
  const neem=()=>{overgenomen=true;stop();};

  slider.querySelector('[data-prev]').addEventListener('click',()=>{neem();ga(huidig-1);});
  slider.querySelector('[data-next]').addEventListener('click',()=>{neem();ga(huidig+1);});
  track.addEventListener('keydown',event=>{
    if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight')return;
    event.preventDefault();neem();ga(huidig+(event.key==='ArrowRight'?1:-1));
  });
  ['pointerdown','wheel','touchstart'].forEach(soort=>track.addEventListener(soort,neem,{passive:true}));

  // Het spoor schuift ook met een veeg; houd de stippen gelijk met waar het staat.
  let bezig=null;
  track.addEventListener('scroll',()=>{
    clearTimeout(bezig);
    bezig=setTimeout(()=>{
      const midden=track.scrollLeft+track.clientWidth/2;
      const dichtst=slides.reduce((beste,slide,index)=>{
        const afstand=Math.abs(slide.offsetLeft-track.offsetLeft+slide.clientWidth/2-midden);
        return afstand<beste.afstand?{index,afstand}:beste;
      },{index:huidig,afstand:Infinity}).index;
      if(dichtst!==huidig){huidig=dichtst;teken();}
    },120);
  },{passive:true});

  // Niet doorschuiven terwijl niemand kijkt: buiten beeld, in een verborgen tabblad,
  // of terwijl de muis of het toetsenbord op de slider staat.
  slider.addEventListener('pointerenter',stop);
  slider.addEventListener('pointerleave',start);
  slider.addEventListener('focusin',stop);
  slider.addEventListener('focusout',start);
  document.addEventListener('visibilitychange',()=>document.hidden?stop():start());
  if('IntersectionObserver' in window){
    new IntersectionObserver(entries=>{entries[0].isIntersecting?start():stop();},{threshold:.35}).observe(slider);
  }else start();

  teken();
})();
