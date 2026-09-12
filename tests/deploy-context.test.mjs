// De deploycontext. Wat hier bewaakt wordt: dat een Netlify-preview niet stilzwijgend met de
// productie-instellingen draait.
//
// Robert, 7 september 2026: Netlify laat omgevingsvariabelen standaard voor álle deploy
// contexts gelden, en geen enkele functie keek naar `CONTEXT`. Een branch-deploy zou dus naar
// de productiedatabase hebben geschreven, echte mail hebben verstuurd en echte afspraken in
// de gedeelde agenda hebben gezet.
import assert from "node:assert/strict";
import {test} from "node:test";
import {readFile,readdir} from "node:fs/promises";
import path from "node:path";

const root=path.resolve(import.meta.dirname,"..");
const lees=p=>readFile(path.join(root,p),"utf8");

// Zet de twee verklaringen, doet iets, en zet alles terug.
const metVerklaring=async({productie=null,preview=null,context=null},doen)=>{
  const eerder={p:process.env.LEWOS_ENVIRONMENT,v:process.env.LEWOS_PREVIEW_SAFE,c:process.env.CONTEXT};
  const zet=(k,w)=>{if(w===null)delete process.env[k]; else process.env[k]=w;};
  zet("LEWOS_ENVIRONMENT",productie); zet("LEWOS_PREVIEW_SAFE",preview); zet("CONTEXT",context);
  try{return await doen();}
  finally{
    for(const [k,w] of [["LEWOS_ENVIRONMENT",eerder.p],["LEWOS_PREVIEW_SAFE",eerder.v],["CONTEXT",eerder.c]])
      if(w===undefined)delete process.env[k]; else process.env[k]=w;
  }
};

const {environmentIsSafe,isProduction,previewIsConfigured,deployContext,environmentLabel,unsafeEnvironmentBody}=
  await import("../netlify/functions/_deploy-context.mjs");

test("wie zich niet verklaart, mag niets",async()=>{
  // De eerste versie las `CONTEXT` en zag "niet gezet" als een ontwikkelmachine. In de echte
  // Deploy Preview van 7 september bleek CONTEXT in de functie-runtime niet gezet: elke
  // preview zag eruit als een laptop en de poort vuurde nooit. Vandaar: verklaren, niet raden.
  assert.equal(await metVerklaring({},()=>environmentIsSafe()),false,
    "een omgeving zonder verklaring werd toegelaten");
  // Ook niet als Netlify wél een context meegeeft — die is geen verklaring.
  for(const c of ["production","deploy-preview","branch-deploy",null])
    assert.equal(await metVerklaring({context:c},()=>environmentIsSafe()),false,
      `CONTEXT=${c} werd op zichzelf als toestemming gelezen`);
});

test("productie en een ingerichte preview mogen wel",async()=>{
  assert.equal(await metVerklaring({productie:"production"},()=>environmentIsSafe()),true);
  assert.equal(await metVerklaring({preview:"true"},()=>environmentIsSafe()),true);
  assert.equal(await metVerklaring({productie:"PRODUCTION"},()=>isProduction()),true,
    "hoofdletters mogen niets uitmaken");
});

test("half ingevuld is niet ingevuld",async()=>{
  for(const bijna of ["","false","TRUE","1","ja","yes"])
    assert.equal(await metVerklaring({preview:bijna},()=>environmentIsSafe()),false,
      `"${bijna}" werd als toestemming gelezen`);
  for(const bijna of ["prod","Production ","live"])
    assert.equal(await metVerklaring({productie:bijna},()=>environmentIsSafe()),
      bijna.trim().toLowerCase()==="production",`"${bijna}" werd verkeerd gelezen`);
  // Witruimte verandert de betekenis niet.
  assert.equal(await metVerklaring({preview:" true "},()=>environmentIsSafe()),true);
});

test("de weigering zegt wat er moet gebeuren en dat er niets is gebeurd",async()=>{
  const body=await metVerklaring({context:"deploy-preview"},()=>unsafeEnvironmentBody());
  assert.equal(body.error,"environment_not_declared");
  assert.equal(body.environment,"niet verklaard");
  assert.equal(body.buildContext,"deploy-preview");
  assert.match(body.message,/LEWOS_ENVIRONMENT=production/);
  assert.match(body.message,/LEWOS_PREVIEW_SAFE=true/);
  assert.match(body.message,/nothing has been charged, sent or stored/i);
});

test("een onveilige preview verstuurt geen mail",async()=>{
  const {sendEmail}=await import("../netlify/functions/_email.mjs");
  const eerder=globalThis.fetch;
  let gebeld=false;
  globalThis.fetch=()=>{gebeld=true;return Promise.reject(new Error("mocht niet"));};
  process.env.RESEND_API_KEY="test-sleutel";
  process.env.TAVERN_FROM_EMAIL="tavern@example.invalid";
  try{
    const uit=await metVerklaring({context:"deploy-preview"},()=>sendEmail(
      {to:"gast@example.invalid",subject:"proef",text:"t",html:"<p>t</p>"}));
    assert.equal(uit,null,"er werd een bericht-id teruggegeven");
    assert.equal(gebeld,false,"Resend werd gebeld vanuit een onveilige preview");
  }finally{globalThis.fetch=eerder;}
});

test("een onveilige preview raakt de agenda niet",async()=>{
  const {calendarConfig}=await import("../netlify/functions/_calendar.mjs");
  const bewaar={id:process.env.LEWOS_CALENDAR_ID,email:process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    sleutel:process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY};
  process.env.LEWOS_CALENDAR_ID="productie@group.calendar.google.com";
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL="account@example.invalid";
  process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\ntest\n";
  try{
    assert.equal(await metVerklaring({context:"deploy-preview"},()=>calendarConfig()),null,
      "de agenda werd geconfigureerd in een onveilige preview");
    assert.notEqual(await metVerklaring({productie:"production"},()=>calendarConfig()),null,
      "productie kan de agenda niet meer gebruiken");
  }finally{
    for(const [k,v] of [["LEWOS_CALENDAR_ID",bewaar.id],["GOOGLE_SERVICE_ACCOUNT_EMAIL",bewaar.email],
      ["GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY",bewaar.sleutel]])
      if(v===undefined)delete process.env[k]; else process.env[k]=v;
  }
});

test("elke functie die naar de database schrijft kent de poort",async()=>{
  // Een nieuwe functie die dit vergeet, zou in een preview alsnog naar productie schrijven.
  const map=path.join(root,"netlify/functions");
  const ontbreekt=[];
  for(const naam of await readdir(map)){
    if(!naam.endsWith(".mjs")||naam.startsWith("_"))continue;
    const bron=await lees(`netlify/functions/${naam}`);
    if(!/SUPABASE_SERVICE_ROLE_KEY/.test(bron))continue;
    if(!/environmentIsSafe\(\)/.test(bron))ontbreekt.push(naam);
  }
  assert.deepEqual(ontbreekt,[],"deze functies schrijven naar de database zonder de poort te kennen");
});

test("de poort gebruikt een antwoordhulp die in dat bestand bestaat",async()=>{
  // `node --check` ziet dit niet: `json(...)` in een bestand dat alleen `response(...)` kent
  // is syntactisch prima en klapt pas bij de eerste echte aanroep. Dat gebeurde op
  // 7 september 2026 in stripe-webhook.mjs.
  const map=path.join(root,"netlify/functions");
  const stuk=[];
  for(const naam of await readdir(map)){
    if(!naam.endsWith(".mjs")||naam.startsWith("_"))continue;
    const bron=await lees(`netlify/functions/${naam}`);
    const poort=bron.match(/if\(!environmentIsSafe\(\)\)return (\w+)\(/);
    if(!poort)continue;
    const hulp=poort[1];
    // De hulpfunctie moet in ditzelfde bestand gedefinieerd of geïmporteerd zijn.
    const bestaat=new RegExp(`(const|let|function)\\s+${hulp}\\b|import\\s*\\{[^}]*\\b${hulp}\\b`).test(bron);
    if(!bestaat)stuk.push(`${naam} gebruikt ${hulp}(), maar kent die niet`);
  }
  assert.deepEqual(stuk,[]);
});

test("de poort staat vóór het werk, niet erna",async()=>{
  for(const naam of ["seat-hold.mjs","pay.mjs","admin-actions.mjs","first-access.mjs",
    "create-checkout-session.mjs","media-consent.mjs","contact.mjs","stripe-webhook.mjs",
    "admin-bookings.mjs"]){
    const bron=await lees(`netlify/functions/${naam}`);
    const handler=bron.indexOf("export const handler");
    const poort=bron.indexOf("environmentIsSafe()",handler);
    const rpc=bron.indexOf("rest/v1/rpc",handler);
    assert.ok(poort>handler,`${naam}: de poort staat niet in de handler`);
    if(rpc>0)assert.ok(poort<rpc,`${naam}: de poort staat ná de eerste database-aanroep`);
  }
});

// 12 september 2026: op de branchdeploy wees de betaallink in de mail naar lewos.co. Netlify
// zet `URL` namelijk ook op een preview op het productieadres. De gast kreeg daardoor een
// link naar een boeking die op productie niet bestaat ("we do not recognise this payment
// link"). Buiten productie hoort DEPLOY_PRIME_URL te winnen; op productie juist niet.
test("buiten productie wijzen links naar de deploy zelf, op productie naar lewos.co",async()=>{
  const {siteOrigin}=await import("../netlify/functions/_deploy-context.mjs");
  const eerder={u:process.env.URL,d:process.env.DEPLOY_PRIME_URL,e:process.env.LEWOS_ENVIRONMENT};
  process.env.URL="https://lewos.co";
  process.env.DEPLOY_PRIME_URL="https://verkoop-open--lewos.netlify.app";

  process.env.LEWOS_ENVIRONMENT="production";
  assert.equal(siteOrigin(),"https://lewos.co","productie moet het eigen domein houden");

  delete process.env.LEWOS_ENVIRONMENT;
  assert.equal(siteOrigin(),"https://verkoop-open--lewos.netlify.app",
    "een preview moet naar zichzelf wijzen, niet naar productie");

  delete process.env.DEPLOY_PRIME_URL;
  assert.equal(siteOrigin(),"https://lewos.co","zonder deploy-adres blijft URL over");

  process.env.URL=""; 
  assert.equal(siteOrigin(),"https://lewos.co","zonder enige instelling blijft het domein staan");

  for(const [k,v] of [["URL",eerder.u],["DEPLOY_PRIME_URL",eerder.d],["LEWOS_ENVIRONMENT",eerder.e]])
    if(v===undefined)delete process.env[k]; else process.env[k]=v;
});

// Elke plek die een gastlink of terugkeerpagina bouwt, hoort door siteOrigin te gaan.
test("alle plekken die een link naar onszelf bouwen gebruiken siteOrigin",async()=>{
  for(const pad of ["netlify/functions/seat-hold.mjs","netlify/functions/pay.mjs",
    "netlify/functions/create-checkout-session.mjs","netlify/functions/stripe-webhook.mjs",
    "netlify/functions/admin-actions.mjs"]){
    const bron=await lees(pad);
    assert.match(bron,/siteOrigin\(\)|requestOrigin\(/,
      `${pad} bouwt zijn eigen adres in plaats van siteOrigin() of requestOrigin()`);
    assert.doesNotMatch(bron,/process\.env\.URL\|\|"https:\/\/lewos\.co"/,
      `${pad} gebruikt process.env.URL nog rechtstreeks`);
  }
});
