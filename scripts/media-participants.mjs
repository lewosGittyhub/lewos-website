// Operatorgereedschap voor de Filming & Media Agreement. Alles wat een deelnemer in het
// systeem zet of eruit haalt gaat hierlangs — er is geen publieke route voor.
//
// Waarom een script en geen webpagina: wie hier werkt heeft de service_role-sleutel, en die
// zit in de omgeving van de operator. Er is dus geen inlog te bouwen, geen sessie te stelen
// en geen formulier waar een gast de gegevens van een ander in kan typen. De prijs is dat
// Robert het zelf draait; dat is de afspraak van 1 september 2026.
//
//   node scripts/media-participants.mjs list      --claim <uuid>
//   node scripts/media-participants.mjs progress  --claim <uuid>
//   node scripts/media-participants.mjs register  --claim <uuid> --file <deelnemers.json>
//   node scripts/media-participants.mjs revoke    --participant <uuid>
//
// Lezen mag altijd. Schrijven vraagt `--commit`, én een open mediapoort: zolang de
// overeenkomst niet is goedgekeurd hoort er geen naam of e-mailadres van een gast in de
// database te staan.
import {mediaAgreement,mediaConsentBlockers,mediaConsentIsEnabled} from "../netlify/functions/_media-config.mjs";

const required=name=>{
  const value=String(process.env[name]||"").trim();
  if(!value)throw new Error(`Missing ${name}`);
  return value;
};
const api=async(path,options={})=>{
  const base=required("SUPABASE_URL");
  const key=required("SUPABASE_SERVICE_ROLE_KEY");
  const response=await fetch(`${base}/rest/v1/${path}`,{...options,headers:{apikey:key,authorization:`Bearer ${key}`,"content-type":"application/json",...(options.headers||{})}});
  if(!response.ok)throw new Error(`Supabase ${response.status}: ${await response.text()}`);
  return response.json();
};
const rpc=(name,body)=>api(`rpc/${name}`,{method:"POST",body:JSON.stringify(body)});

const args=process.argv.slice(2);
const command=args[0];
const flag=name=>{const i=args.indexOf(`--${name}`);return i<0?null:args[i+1];};
const commit=args.includes("--commit");
const uuidLooksValid=value=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value||""));

const gateOrExit=action=>{
  if(mediaConsentIsEnabled())return;
  console.error(`Cannot ${action}: the Filming & Media Agreement flow is closed.`);
  for(const blocker of mediaConsentBlockers())console.error(`  - ${blocker}`);
  console.error("Nothing was read, written or sent.");
  process.exit(1);
};
const claimOrExit=()=>{
  const claim=flag("claim");
  if(!uuidLooksValid(claim)){console.error("Give a claim id: --claim <uuid>");process.exit(1);}
  return claim;
};

if(command==="list"){
  const claim=claimOrExit();
  // De operator ziet hier wél namen en adressen: het is zijn eigen gastenlijst, en zonder
  // die lijst kan hij geen link opnieuw uitgeven. Een deelnemer komt hier nooit.
  const rows=await api(`tavern_media_participants?select=id,full_name,email,status,invitation_expires_at,invitation_sent_at&claim_id=eq.${claim}&order=created_at.asc`);
  if(!rows.length){console.log("No participants registered for this claim.");process.exit(0);}
  for(const row of rows){
    const link=row.invitation_expires_at?`link until ${row.invitation_expires_at}`:"no active link";
    console.log(`${row.id}  ${row.status.padEnd(9)}  ${link.padEnd(34)}  ${row.full_name} <${row.email}>`);
  }
  console.log(`\n${rows.length} participant${rows.length===1?"":"s"}.`);
  process.exit(0);
}

if(command==="progress"){
  const claim=claimOrExit();
  gateOrExit("read progress");
  const agreement=mediaAgreement();
  const progress=await rpc("get_tavern_media_progress",{p_claim_id:claim,p_agreement_version:agreement.version});
  if(progress.status!=="ready"){console.error(`Cannot read progress: ${progress.status}`);process.exit(1);}
  console.log(`${progress.completed} of ${progress.total} guests have completed the Filming & Media Agreement.`);
  console.log(`Seats booked: ${progress.expected}. Agreement version: ${progress.agreementVersion}.`);
  process.exit(0);
}

if(command==="register"){
  const claim=claimOrExit();
  const file=flag("file");
  if(!file){console.error("Give a participants file: --file <deelnemers.json>");process.exit(1);}
  gateOrExit("register participants");
  const {readFile}=await import("node:fs/promises");
  let participants;
  try{participants=JSON.parse(await readFile(file,"utf8"));}
  catch(error){console.error(`Could not read ${file}: ${error.message}`);process.exit(1);}
  if(!Array.isArray(participants)){console.error("The file must contain a JSON array.");process.exit(1);}
  for(const entry of participants){
    if(typeof entry?.fullName!=="string"||typeof entry?.email!=="string"){
      console.error('Every entry needs a "fullName" and an "email".');process.exit(1);
    }
    if(entry.adultDeclared!==true){
      // De database weigert toestemming zonder deze verklaring; laat dat hier al zien in
      // plaats van pas als de gast op zijn link klikt.
      console.error(`"${entry.fullName}" has no adultDeclared: true. Weekend 01 is for adults, and the agreement cannot be completed without it.`);
      process.exit(1);
    }
  }
  if(!commit){
    console.log(`Dry run: ${participants.length} entr${participants.length===1?"y":"ies"} would be offered for claim ${claim}.`);
    console.log("Duplicate email addresses are ignored, and only unique participants count against the seats.");
    console.log("Nothing was written. Add --commit to register them.");
    process.exit(0);
  }
  const result=await rpc("register_tavern_media_participants",{p_claim_id:claim,p_participants:participants});
  if(result.status==="registered"){
    console.log(`Registered. ${result.added} new participant${result.added===1?"":"s"} added; ${result.expected} seat${result.expected===1?"":"s"} booked.`);
    process.exit(0);
  }
  if(result.status==="too_many_participants"){
    console.error(`Refused: ${result.unique} unique participants against ${result.expected} seats. Nothing was written.`);
    process.exit(1);
  }
  console.error(`Refused: ${result.status}. Nothing was written.`);
  process.exit(1);
}

if(command==="revoke"){
  const participant=flag("participant");
  if(!uuidLooksValid(participant)){console.error("Give a participant id: --participant <uuid>");process.exit(1);}
  gateOrExit("revoke a link");
  if(!commit){
    console.log(`Dry run: the personal link of participant ${participant} would stop working.`);
    console.log("Their recorded choices stay exactly as they are; only the link is withdrawn.");
    console.log("Nothing was changed. Add --commit to revoke it.");
    process.exit(0);
  }
  const result=await rpc("revoke_tavern_media_participant_link",{p_participant_id:participant});
  if(result.status==="revoked"){
    console.log(`Revoked the link for ${result.fullName}. Run issue-media-agreements.mjs to send a new one.`);
    process.exit(0);
  }
  if(result.status==="no_active_link"){console.log("That participant has no active link. Nothing to revoke.");process.exit(0);}
  console.error(`Could not revoke: ${result.status}`);
  process.exit(1);
}

console.error(`Usage:
  node scripts/media-participants.mjs list      --claim <uuid>
  node scripts/media-participants.mjs progress  --claim <uuid>
  node scripts/media-participants.mjs register  --claim <uuid> --file <participants.json> [--commit]
  node scripts/media-participants.mjs revoke    --participant <uuid> [--commit]

Writing needs --commit and an open media gate. Reading the list does not.`);
process.exit(1);
