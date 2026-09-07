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

const metContext=async(context,vlag,doen)=>{
  const eerderContext=process.env.CONTEXT, eerderVlag=process.env.LEWOS_PREVIEW_SAFE;
  if(context===null)delete process.env.CONTEXT; else process.env.CONTEXT=context;
  if(vlag===null)delete process.env.LEWOS_PREVIEW_SAFE; else process.env.LEWOS_PREVIEW_SAFE=vlag;
  try{return await doen();}
  finally{
    if(eerderContext===undefined)delete process.env.CONTEXT; else process.env.CONTEXT=eerderContext;
    if(eerderVlag===undefined)delete process.env.LEWOS_PREVIEW_SAFE; else process.env.LEWOS_PREVIEW_SAFE=eerderVlag;
  }
};

const {environmentIsSafe,isProduction,isLocal,deployContext,unsafeEnvironmentBody}=
  await import("../netlify/functions/_deploy-context.mjs");

test("productie mag, een ontwikkelmachine mag, een kale preview niet",async()=>{
  assert.equal(await metContext("production",null,()=>environmentIsSafe()),true,"productie geweigerd");
  assert.equal(await metContext(null,null,()=>environmentIsSafe()),true,"lokale machine geweigerd");
  assert.equal(await metContext("branch-deploy",null,()=>environmentIsSafe()),false,
    "een branch-deploy zonder eigen instellingen werd toegelaten");
  assert.equal(await metContext("deploy-preview",null,()=>environmentIsSafe()),false,
    "een deploy-preview zonder eigen instellingen werd toegelaten");
});

test("een preview mag pas met een uitdrukkelijke markering",async()=>{
  assert.equal(await metContext("branch-deploy","true",()=>environmentIsSafe()),true);
  // Alles behalve "true" telt niet. Half ingevuld is niet ingevuld.
  for(const bijna of ["","false","TRUE","1","ja","yes","waar"])
    assert.equal(await metContext("branch-deploy",bijna,()=>environmentIsSafe()),false,
      `"${bijna}" werd als toestemming gelezen`);
  // Witruimte eromheen verandert de betekenis niet: wie een waarde plakt uit een document
  // krijgt er soms een spatie bij, en daarop een preview weigeren helpt niemand.
  assert.equal(await metContext("branch-deploy"," true ",()=>environmentIsSafe()),true);
});

test("de context wordt gelezen zoals Netlify hem zet",async()=>{
  assert.equal(await metContext("production",null,()=>isProduction()),true);
  assert.equal(await metContext("PRODUCTION",null,()=>isProduction()),true,"hoofdletters mogen niets uitmaken");
  assert.equal(await metContext(null,null,()=>isLocal()),true);
  assert.equal(await metContext("branch-deploy",null,()=>deployContext()),"branch-deploy");
});

test("de weigering zegt wat er moet gebeuren en dat er niets is gebeurd",async()=>{
  const body=await metContext("branch-deploy",null,()=>unsafeEnvironmentBody());
  assert.equal(body.error,"preview_not_configured");
  assert.equal(body.context,"branch-deploy");
  assert.match(body.message,/LEWOS_PREVIEW_SAFE/);
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
    const uit=await metContext("branch-deploy",null,()=>sendEmail(
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
    assert.equal(await metContext("branch-deploy",null,()=>calendarConfig()),null,
      "de agenda werd geconfigureerd in een onveilige preview");
    assert.notEqual(await metContext("production",null,()=>calendarConfig()),null,
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
