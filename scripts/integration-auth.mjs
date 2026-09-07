// Authenticatie- en autorisatiecontroles tegen een draaiende `scripts/local-admin-server.mjs`.
//
//   node scripts/local-admin-server.mjs        (in een tweede venster)
//   node scripts/integration-auth.mjs
//
// Leest geen broncode: dit zijn echte HTTP-verzoeken langs dezelfde Netlify-handlers die
// in productie draaien. Geen npm-afhankelijkheden.

// Authenticatie tegen de draaiende server. Niet de broncode gelezen — echte verzoeken.
import {createHmac} from "node:crypto";
const BASIS="http://127.0.0.1:8790";
let fouten=0;
const check=(naam,ok,extra="")=>{console.log(`${ok?"✔":"✖"} ${naam}${ok?"":"  → "+extra}`);if(!ok)fouten++;};

const login=async email=>(await (await fetch(`${BASIS}/api/admin/local-login`,{method:"POST",
  headers:{"content-type":"application/json"},body:JSON.stringify({email})})).json()).token;

const b64=v=>Buffer.from(v).toString("base64url");
const zelfgemaakt=(email,{alg="HS256",geheim="fout-geheim"}={})=>{
  const kop=b64(JSON.stringify({alg,typ:"JWT"}));
  const inhoud=b64(JSON.stringify({email,email_verified:true,exp:Math.floor(Date.now()/1000)+3600}));
  if(alg==="none")return `${kop}.${inhoud}.`;
  return `${kop}.${inhoud}.${createHmac("sha256",geheim).update(`${kop}.${inhoud}`).digest("base64url")}`;
};

const vraag=(pad,token,opties={})=>fetch(BASIS+pad,{...opties,
  headers:{...(token?{authorization:`Bearer ${token}`}:{}),...(opties.body?{"content-type":"application/json"}:{})}})
  .then(async r=>({status:r.status,tekst:await r.text()}));

const RANGE="/api/admin/bookings?from=2026-10-01&to=2026-11-30";
const robert=await login("lewos.co@gmail.com");
const nadine=await login("accommodatie@example.invalid");
const vreemde=await login("someone.else@gmail.com");

check("zonder token: 401",(await vraag(RANGE,null)).status===401);
check("alg:none wordt geweigerd",(await vraag(RANGE,zelfgemaakt("lewos.co@gmail.com",{alg:"none"}))).status===401);
check("verkeerde handtekening wordt geweigerd",(await vraag(RANGE,zelfgemaakt("lewos.co@gmail.com"))).status===401);
check("verlopen token wordt geweigerd",(await vraag(RANGE,(()=>{
  const kop=b64(JSON.stringify({alg:"HS256",typ:"JWT"}));
  const inhoud=b64(JSON.stringify({email:"lewos.co@gmail.com",email_verified:true,exp:Math.floor(Date.now()/1000)-60}));
  return `${kop}.${inhoud}.x`;})())).status===401);

const alsVreemde=await vraag(RANGE,vreemde);
check("ingelogd maar niet op de lijst: 403",alsVreemde.status===403,`status ${alsVreemde.status}`);
check("een geweigerde krijgt geen enkel gegeven",!/TEST –/.test(alsVreemde.tekst));

const alsRobert=await vraag(RANGE,robert);
check("Robert mag het overzicht lezen",alsRobert.status===200,`status ${alsRobert.status}`);
check("Nadine mag het overzicht lezen",(await vraag(RANGE,nadine)).status===200);

// Het maandoverzicht draagt geen gezondheidsgegevens.
const verboden=["peanut","vegetarian","epipen","allerg","dietary"];
const gevonden=verboden.filter(w=>alsRobert.tekst.toLowerCase().includes(w));
check("het maandoverzicht draagt geen dieetgegevens",gevonden.length===0,gevonden.join(", "));

// Het detail wél, en alleen achter de controle.
const ids=[...alsRobert.tekst.matchAll(/"claimId":"([^"]+)"/g)].map(m=>m[1]);
const detail=await vraag(`/api/admin/bookings/${ids[0]}`,robert);
check("het detail is er voor een beheerder",detail.status===200,`status ${detail.status}`);
check("het detail draagt het gecombineerde dieetveld",/dietaryNotes/.test(detail.tekst));
check("het detail draagt de oude losse velden niet",!/"allergies":|"dietary":/.test(detail.tekst));
check("hetzelfde detail is voor een vreemde 403",
  (await vraag(`/api/admin/bookings/${ids[0]}`,vreemde)).status===403);

// De rolverdeling bij de deelnemersacties.
// Zoek dóór de boekingen tot er een onbetaalde deelnemer is; niet elke boeking heeft er een.
let onbetaald=null;
for(const id of ids){
  const d=JSON.parse((await vraag(`/api/admin/bookings/${id}`,robert)).tekst);
  onbetaald=(d.participants||[]).find(p=>p.status!=="paid"&&p.status!=="cancelled");
  if(onbetaald)break;
}
if(onbetaald){
  const doe=(wie,actie,body)=>vraag(`/api/admin/participants/${onbetaald.id}/${actie}`,wie,
    {method:"POST",body:JSON.stringify(body)});
  // Toon de status en het antwoord bij een mislukking: zonder dat is een rode regel hier
  // niet te herleiden, en dat kostte op 6 september 2026 een half uur.
  //
  // Twee antwoorden zijn goed. Heeft de deelnemer een betaaltermijn, dan gaat de
  // herinnering eruit (200). Heeft hij die niet — en op een verse database is dat zo — dan
  // hoort er een leesbare weigering te komen, géén storing. Alleen een 503 is fout.
  const herinnering=await doe(nadine,"remind",{});
  const geweigerd=herinnering.status===409&&/no_payment_deadline/.test(herinnering.tekst);
  check("Nadine mag herinneren, of hoort waarom niet",
    herinnering.status===200||geweigerd,
    `status ${herinnering.status}: ${herinnering.tekst.slice(0,200)}`);
  check("een ontbrekende termijn is nooit een storing",herinnering.status!==503,
    `status ${herinnering.status}`);
  if(geweigerd)check("de weigering zegt wat er nu moet gebeuren",
    /Extend/.test(herinnering.tekst)&&/payment request/i.test(herinnering.tekst),
    herinnering.tekst.slice(0,200));
  check("Nadine mag niet vrijgeven",(await doe(nadine,"release",{reason:"proef"})).status===403);
  check("Nadine mag niet verlengen",
    (await doe(nadine,"extend",{reason:"proef",newDeadline:new Date(Date.now()+7200e3).toISOString()})).status===403);
  check("vrijgeven zonder reden wordt geweigerd",(await doe(robert,"release",{})).status===400);
}else check("er was een onbetaalde deelnemer om de rollen op te proeven",false,"geen gevonden");

console.log(fouten?`\n${fouten} controle(s) mislukt`:"\nalle authenticatiecontroles geslaagd");
process.exit(fouten?1:0);
