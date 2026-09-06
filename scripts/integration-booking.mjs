// Boekingscontroles tegen een draaiende `scripts/local-admin-server.mjs`.
//
//   node scripts/local-admin-server.mjs        (in een tweede venster)
//   node scripts/integration-booking.mjs
//
// Let op: de blokkeringslimiet is vier per IP per uur. Draai zo nodig eerst
//   curl -X POST http://127.0.0.1:8790/api/test/reset -d "{\"resetLimits\":true}" -H "content-type: application/json"

// Boekingsintegratie tegen de draaiende lokale server. Geen nagebootste functies: dit
// loopt over HTTP door dezelfde Netlify-handlers die in productie draaien.
const BASIS="http://127.0.0.1:8790";
const post=(pad,body)=>fetch(BASIS+pad,{method:"POST",headers:{"content-type":"application/json"},
  body:JSON.stringify(body)}).then(async r=>({status:r.status,body:await r.json().catch(()=>({}))}));
const token=()=>"tst"+Math.random().toString(36).slice(2).padEnd(40,"x");

let fouten=0;
const check=(naam,voorwaarde,extra="")=>{
  console.log(`${voorwaarde?"✔":"✖"} ${naam}${voorwaarde?"":"  → "+extra}`);
  if(!voorwaarde)fouten++;
};

const deelnemers=n=>Array.from({length:n},(_,i)=>({name:`TEST – Gast ${i+1}`,email:`t${Date.now()}${i}@example.invalid`}));

const boek=async({arrival,departure,seats=1,weekend="weekend-01",dietaryNotes=""})=>{
  const t=token();
  const hold=await post("/api/hold",{sessionToken:t,weekend,people:seats});
  if(hold.status!==200)return {stap:"hold",...hold};
  const promote=await post("/api/hold/promote",{sessionToken:t,
    name:"TEST – Integratie",email:`integratie${Date.now()}@example.invalid`,
    dietaryNotes,message:"",adultConfirmed:true,privacyAccepted:true,filmingAcknowledged:true,
    requestedArrival:arrival,requestedDeparture:departure,participants:deelnemers(seats)});
  return {stap:"promote",...promote};
};

// 1. Vrijdagochtend 6 november moet kunnen.
const goed=await boek({arrival:"2026-10-26",departure:"2026-11-06"});
check("vertrek op vrijdagochtend 6 november wordt aanvaard",
  goed.status===200&&goed.body.extraNightsStored===true,JSON.stringify(goed.body).slice(0,200));
check("de aanvraag is als datums opgeslagen, niet als vrije tekst",
  goed.body.extraNightsStatus==="requested"&&/4 nights after the weekend/.test(goed.body.extraNightsRequest||""),
  goed.body.extraNightsRequest);

// 2. Zaterdag 7 november niet — die nacht is van het volgende weekend.
const teLaat=await boek({arrival:null,departure:"2026-11-07"});
check("vertrek op 7 november wordt door de server geweigerd",
  teLaat.status===200&&teLaat.body.extraNightsStored===false,
  `status ${teLaat.status}, opgeslagen ${teLaat.body.extraNightsStored}`);

// 3. Aankomst vóór de maandag ervóór ook niet.
const teVroeg=await boek({arrival:"2026-10-25",departure:null});
check("aankomst op 25 oktober wordt door de server geweigerd",
  teVroeg.status===200&&teVroeg.body.extraNightsStored===false,
  `opgeslagen ${teVroeg.body.extraNightsStored}`);

// 4. Onleesbare datum komt niet eens tot de database.
const onzin=await post("/api/hold",{sessionToken:token(),weekend:"weekend-01",people:1});
const onzin2=await post("/api/hold/promote",{sessionToken:"x".repeat(40),
  name:"TEST",email:"x@example.invalid",requestedArrival:"26-10-2026",
  adultConfirmed:true,privacyAccepted:true,participants:deelnemers(1)});
check("een onleesbare datum levert 422 op",onzin2.status===422,`status ${onzin2.status}`);

// 5. Het dieetveld reist mee als één veld.
const dieet=await boek({arrival:"2026-10-28",departure:null,
  dietaryNotes:"Ana: severe peanut allergy, carries an EpiPen.\nBram: vegetarian."});
check("de boeking met dieetveld gaat door",dieet.status===200,JSON.stringify(dieet.body).slice(0,160));

console.log(fouten?`\n${fouten} controle(s) mislukt`:"\nalle boekingscontroles geslaagd");
process.exit(fouten?1:0);
