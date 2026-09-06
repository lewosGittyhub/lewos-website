// De grensgevallen van de twee termijnen, tegen de draaiende lokale server.
//
//     node scripts/local-admin-server.mjs        (in een ander venster)
//     node scripts/local-boundary-test.mjs
//
// Waarom apart van de unittests: dit meet de hele keten — eindpunt, nagebootste database en
// de opruiming — met een klok die het hele serverproces verzet. Een unittest die de
// rekenregel controleert zou een fout in het eindpunt niet zien; dat is op 5 september 2026
// ook echt gebeurd (`new Date()` liep om de testklok heen, en het eindpunt gaf 200 terug
// voor een blokkering die de database al beëindigd had).
//
// Over de optelling: elke stap telt bij de vorige op. "20 minuten + 41 minuten" is dus
// 61 minuten na het aanmaken, en daarmee voorbij de grens van zestig.

const B=process.env.LEWOS_LOCAL_URL||"http://127.0.0.1:8790";
const post=(p,b)=>fetch(B+p,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(b)}).then(r=>r.json().then(j=>({s:r.status,j})));
const get=p=>fetch(B+p).then(r=>r.json().then(j=>({s:r.status,j})));
const klok=(m,o={})=>post("/api/test/clock",{advanceMinutes:m,...o});
const reset=()=>post("/api/test/clock",{reset:true});
// De testgegevens terugzetten. Zonder dit loopt een tweede run stuk op de blokkeringen van
// de eerste — de stoelen zijn dan nog bezet.
const schoon=()=>post("/api/test/reset",{});
const token=()=>"grens-"+[...crypto.getRandomValues(new Uint8Array(20))].map(b=>b.toString(16).padStart(2,"0")).join("");
const WEEKEND=process.env.LEWOS_TEST_WEEKEND||"weekend-03";

let fouten=0;
const eis=(o,v,g="")=>{console.log(`  ${v?"\x1b[32m✓\x1b[0m":"\x1b[31m✗\x1b[0m"} ${o}${g?"  → "+g:""}`);if(!v)fouten++;};

const reeks=async(naam,stappen,promoveer)=>{
  await schoon();
  const t=token();
  const h=await post("/api/hold",{sessionToken:t,weekend:WEEKEND,people:1});
  if(h.s!==200)throw new Error(`kon geen blokkering maken: ${JSON.stringify(h.j)}`);
  if(promoveer)await post("/api/hold/promote",{sessionToken:t,name:"TEST – Grens",email:"grens@example.invalid",
    adultConfirmed:true,privacyAccepted:true,participants:[{name:"TEST – Een",email:"g1@example.invalid"}]});
  console.log(`\n\x1b[1m${naam}\x1b[0m`);
  let totaal=0;
  for(const [stap,geldig] of stappen){
    await klok(stap); totaal+=stap;
    const r=await get(`/api/hold?sessionToken=${t}`);
    const leeft=r.s===200;
    eis(`na ${totaal.toFixed(2)} min totaal → ${geldig?"nog geldig":"verlopen"}`,leeft===geldig,
      leeft?`nog ${r.j.secondsRemaining}s`:r.j.error);
  }
};

const run=async()=>{
  console.log("\x1b[1mLewos — grensgevallen van de twee termijnen\x1b[0m");
  await schoon();
  await reeks("Invulfase — de grens ligt op exact 60:00",[[59,true],[0.98,true],[0.02,false],[1,false]],false);
  await reeks("Betaalfase — de grens ligt op exact 30:00 als niemand betaalde",[[29,true],[0.98,true],[0.02,false],[1,false]],true);

  console.log("\n\x1b[1m20 + 41 minuten telt op tot 61 en is dus voorbij de grens\x1b[0m");
  await schoon();
  const t=token();
  await post("/api/hold",{sessionToken:t,weekend:WEEKEND,people:1});
  await klok(20); const a=await get(`/api/hold?sessionToken=${t}`);
  eis("na 20 min: nog geldig",a.s===200,a.s===200?`nog ${(a.j.secondsRemaining/60).toFixed(0)} min`:a.j.error);
  await klok(41); const b=await get(`/api/hold?sessionToken=${t}`);
  eis("na nog eens 41 min (61 totaal): verlopen",b.s===404,b.s===404?b.j.error:"nog geldig");

  console.log("\n\x1b[1mSnelheidsbegrenzing: steeds een nieuw sessietoken\x1b[0m");
  await schoon();
  for(let i=1;i<=6;i++){
    const r=await post("/api/hold",{sessionToken:token(),weekend:WEEKEND,people:1});
    if(i<=4)eis(`poging ${i} → beoordeeld op beschikbaarheid`,r.s===200||r.j.error==="not_available",r.j.status||r.j.error);
    else eis(`poging ${i} → geweigerd door de begrenzer`,r.s===429,r.j.error);
  }
  await schoon();
  console.log(fouten?`\n\x1b[31m${fouten} controle(s) mislukt\x1b[0m\n`:"\n\x1b[32mAlle grenscontroles geslaagd\x1b[0m\n");
  process.exit(fouten?1:0);
};
run().catch(e=>{console.error("\nMislukt:",e.message);process.exit(1);});
