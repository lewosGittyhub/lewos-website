// Wat de keuken moet weten, in één lijst.
//
// Allergieën en dieetwensen staan sinds 2 september 2026 in eigen kolommen. Dit script
// leest ze uit; het schrijft nooit iets. Een aanvraag van vóór die datum heeft die
// kolommen leeg staan, ook als de gast destijds zijn allergie in het berichtveld
// schreef — daarom toont de lijst ook `message`, en zegt hij het erbij.
//
//   node scripts/guest-details.mjs --weekend weekend-01
//   node scripts/guest-details.mjs --weekend weekend-01 --json
//
// Lezen mag altijd: er is geen poort omheen, want er verandert niets.
const args=process.argv.slice(2);
const flag=naam=>{const i=args.indexOf(`--${naam}`);return i===-1?null:args[i+1];};
const heeft=naam=>args.includes(`--${naam}`);

const required=naam=>{
  const waarde=String(process.env[naam]||"").trim();
  if(!waarde){console.error(`Missing ${naam}`);process.exit(1);}
  return waarde;
};

const weekend=flag("weekend");
if(!weekend){
  console.error("Give a weekend: --weekend weekend-01");
  process.exit(1);
}

const supabaseUrl=required("SUPABASE_URL").replace(/\/$/,"");
const serviceKey=required("SUPABASE_SERVICE_ROLE_KEY");
const api=async pad=>{
  const response=await fetch(`${supabaseUrl}/rest/v1/${pad}`,{headers:{apikey:serviceKey,authorization:`Bearer ${serviceKey}`}});
  if(!response.ok){console.error(`Supabase ${response.status}: ${await response.text()}`);process.exit(1);}
  return response.json();
};

const weekends=await api(`tavern_weekends?select=id,label,date_label&slug=eq.${encodeURIComponent(weekend)}`);
if(!weekends.length){console.error(`Unknown weekend: ${weekend}`);process.exit(1);}
const [{id:weekendId,label,date_label:datum}]=weekends;

// Alleen wie er echt bij is: een geweigerde of verlopen claim hoort niet op de keukenlijst.
const actief="('first_access_held','payment_pending','paid')";
const claims=await api(`tavern_seat_claims?select=name,email,party_size,status,allergies,dietary_requirements,message,created_at`
  +`&assigned_weekend_id=eq.${weekendId}&status=in.${actief}&order=created_at`);

if(heeft("json")){
  console.log(JSON.stringify({weekend,label,dates:datum,guests:claims},null,2));
  process.exit(0);
}

console.log(`${label} · ${datum}`);
console.log(`${claims.length} booking${claims.length===1?"":"s"}, ${claims.reduce((som,c)=>som+c.party_size,0)} seat${claims.reduce((som,c)=>som+c.party_size,0)===1?"":"s"}.\n`);
if(!claims.length){console.log("Nobody has booked this weekend yet.");process.exit(0);}

const toon=(kop,waarde)=>{
  if(!waarde||!String(waarde).trim())return;
  // De regeleindes van de gast blijven staan; vervolgregels springen in onder hun kopje.
  const regels=String(waarde).split(/\r?\n/).map(r=>r.trim()===""?"":`      ${r}`).join("\n");
  console.log(`    ${kop}:\n${regels}`);
};

let metAllergie=0;
for(const claim of claims){
  console.log(`  ${claim.name} <${claim.email}> — ${claim.party_size} seat${claim.party_size===1?"":"s"} · ${claim.status}`);
  if(claim.allergies){metAllergie+=1;toon("ALLERGIES",claim.allergies);}
  toon("Dietary",claim.dietary_requirements);
  toon("Notes",claim.message);
  if(!claim.allergies&&!claim.dietary_requirements&&!claim.message)console.log("    (nothing reported)");
  console.log("");
}

console.log(`${metAllergie} of ${claims.length} booking${claims.length===1?"":"s"} reported an allergy.`);
const oud=claims.filter(c=>!c.allergies&&!c.dietary_requirements&&c.message);
if(oud.length){
  console.log(`\n⚠  ${oud.length} booking${oud.length===1?" has":"s have"} no allergy or dietary field but do have a note.`);
  console.log("   Requests from before 2 September 2026 kept everything in that one field.");
  console.log("   Read the Notes above for those before you plan the kitchen.");
}
