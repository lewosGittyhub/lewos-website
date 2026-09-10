// De betaaltermijn, in de klok van wie hem leest.
//
// Robert, 10 september 2026: "hoe doen we dit als iemand uit Amerika boekt?" Er stond
// alleen Spaanse tijd op de betaalpagina, en dat is de tijd die de hele groep gelijk heeft
// -- maar wie in Portland zit moet dan zelf negen uur aftrekken terwijl er een termijn
// loopt. Dezelfde 15:02 in Madrid is 09:02 in New York, 06:02 in Los Angeles en 03:02 op
// Hawaii.
//
// Daarom twee regels: de eigen klok van de bezoeker eerst, want daarop handelt hij, en de
// Spaanse tijd eronder, want dat is het moment dat in zijn mail en in de voorwaarden staat
// en dat voor iedereen in de groep hetzelfde is. Zit de bezoeker zelf in Spanje, dan is één
// regel genoeg: twee keer dezelfde tijd is geen informatie.
//
// Dit staat apart van de pagina zodat het te testen is zonder browser, en zodat een tweede
// pagina die een termijn moet tonen niet zijn eigen versie gaat maken.

const MADRID="Europe/Madrid";

const klokIn=(datum,zone)=>datum.toLocaleString("en-GB",
  {dateStyle:"medium",timeStyle:"short",timeZone:zone});

// De tijdzone van de browser. Kan ontbreken of onbruikbaar zijn; dan valt alles terug op
// alleen de Spaanse tijd. Dat is nooit fout, alleen minder behulpzaam.
export const eigenZone=()=>{
  try{return Intl.DateTimeFormat().resolvedOptions().timeZone||"";}
  catch{return "";}
};

export const deadlineLines=(iso,zone=eigenZone())=>{
  const d=new Date(iso);
  if(Number.isNaN(d.getTime()))return [];
  let spaans;
  try{spaans=klokIn(d,MADRID);}
  catch{return [];}
  const alleenSpaans=[`${spaans} (${MADRID})`];
  if(!zone||zone===MADRID)return alleenSpaans;
  let eigen;
  try{eigen=klokIn(d,zone);}
  catch{return alleenSpaans;}
  // Een andere zonenaam met dezelfde klok -- Europe/Amsterdam bijvoorbeeld -- hoeft geen
  // tweede regel. Het gaat om de tijd die iemand op zijn eigen klok ziet, niet om de naam.
  if(eigen===spaans)return alleenSpaans;
  return [`${eigen} — your time (${zone.replace(/_/g," ")})`,
          `${spaans} in Spain — the same moment for everyone in your group`];
};
