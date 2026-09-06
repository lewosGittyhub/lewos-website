// Zet de weekendblokkades in de gedeelde agenda gelijk aan de werkelijkheid.
//
//   node scripts/sync-weekend-blocks.mjs           tegen de ingestelde agenda
//   node scripts/sync-weekend-blocks.mjs --dry-run laat alleen zien wat er zou gebeuren
//
// Waarom dit bestaat: zodra er één stoel geboekt is, is dat weekend uit Nadine's markt.
// Zij moet dat kúnnen zien in dezelfde agenda waarin zij haar eigen verhuur zet, anders
// verhuurt ze het huis eroverheen en staan er gasten zonder bed. De losse afspraken per
// boeking dekken dat niet: die lopen van aankomst tot vertrek van één gast, en een weekend
// waarop nog niemand extra nachten heeft, is dan maar deels zichtbaar.
//
// Draai dit na een boeking, of periodiek. Het is idempotent: tweemaal draaien verandert
// niets, en een weekend zonder boekingen verliest zijn blokkade weer.

import {calendarConfig,describeCalendar,syncWeekendBlocks,weekendBlockEvent} from "../netlify/functions/_calendar.mjs";

const droog=process.argv.includes("--dry-run");
const url=process.env.SUPABASE_URL,sleutel=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!sleutel){console.error("SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY zijn nodig.");process.exit(1);}

const rpc=async(naam,body={})=>{
  const r=await fetch(`${url}/rest/v1/rpc/${naam}`,{method:"POST",
    headers:{apikey:sleutel,authorization:`Bearer ${sleutel}`,"content-type":"application/json"},
    body:JSON.stringify(body)});
  if(!r.ok)throw new Error(`${naam}: ${r.status} ${await r.text()}`);
  return r.json();
};

const config=calendarConfig();
if(!config){console.error("De agendakoppeling is niet ingesteld.");process.exit(1);}
if(!droog){
  const agenda=await describeCalendar(config);
  console.log(`Agenda: ${agenda.summary||config.calendarId} (${agenda.accessRole})`);
}

const weekends=(await rpc("get_tavern_availability")).map(w=>({
  slug:w.slug,label:w.label,startsOn:w.startsOn,endsOn:w.endsOn,
  capacity:w.capacity,seatsBooked:Number(w.capacity)-Number(w.remaining)
}));

for(const w of weekends){
  const wat=w.seatsBooked>0?`blokkade (${w.seatsBooked} van ${w.capacity} geboekt)`:"geen blokkade (leeg)";
  console.log(`  ${w.slug}  ${w.startsOn} → ${w.endsOn}  ${wat}`);
  if(droog&&w.seatsBooked>0)console.log(`      "${weekendBlockEvent(w).summary}"`);
}

if(droog){console.log("\n--dry-run: er is niets naar de agenda geschreven.");process.exit(0);}
for(const regel of await syncWeekendBlocks(config,weekends))console.log(`  ${regel.slug}: ${regel.status}${regel.message?` — ${regel.message}`:""}`);
