import {createHash} from "node:crypto";
import {mediaAgreement,mediaConsentBlockers,mediaConsentIsEnabled} from "./_media-config.mjs";

const json=(statusCode,body)=>({statusCode,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"},body:JSON.stringify(body)});
const getHeader=(event,name)=>Object.entries(event.headers||{}).find(([key])=>key.toLowerCase()===name.toLowerCase())?.[1]||"";
const clientAddress=event=>getHeader(event,"x-nf-client-connection-ip")||getHeader(event,"x-forwarded-for").split(",")[0].trim()||"unknown";
const tokenHash=token=>createHash("sha256").update(token).digest("hex");
// Dezelfde vorm als de First Access-uitnodiging: 32 willekeurige bytes als base64url.
const tokenLooksValid=token=>/^[A-Za-z0-9_-]{32,200}$/.test(token);

const rpc=async(name,body)=>{
  const response=await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/${name}`,{method:"POST",headers:{apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,authorization:`Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,"content-type":"application/json"},body:JSON.stringify(body)});
  if(!response.ok)throw new Error(`${name}:${response.status}:${await response.text()}`);
  return response.json();
};

// De poort zit vóór alles. Zolang hij dicht is raakt deze functie de database niet aan,
// stuurt ze geen mail en schrijft ze niets weg.
//
// Wélke instelling ontbreekt gaat naar het serverlog en nooit naar de bezoeker. Een gast die
// een link opent hoeft niets te weten over onze voorbereiding; hij krijgt een neutrale
// melding en een adres waar hij terechtkan.
const closedResponse=()=>{
  console.error("Media consent flow is closed",mediaConsentBlockers());
  return json(503,{
    error:"media_consent_not_open",
    message:"This agreement cannot be opened at the moment. Please contact Robert at lewos.co@gmail.com."
  });
};

// Geeft `null` terug als het verzoek door mag, en anders het antwoord dat de bezoeker krijgt.
// Twee dingen die hier eerder misgingen, en waarom het nu zo staat:
//
// 1. De aanroepen zaten niet in een try/catch, anders dan bij de betaalfunctie. Viel
//    Supabase weg, dan gooide deze functie en gaf de handler helemaal geen antwoord meer:
//    in productie een 500 zonder uitleg. Een storing bij de begrenzer doet de deur nu dicht.
// 2. Met `Promise.all` keert de functie terug zodra de eerste aanroep afketst, terwijl de
//    tweede nog onderweg is. Dat verzoek loopt dan door nadat het antwoord al verstuurd is —
//    en in een test nadat de test al klaar is, met een socket die nog openstaat terwijl de
//    mockserver afsluit. `allSettled` wacht ze allebei af, dus er loopt niets meer na.
const limitOrNull=async(event,identity)=>{
  if(!process.env.RATE_LIMIT_SECRET)return json(503,{error:"media_consent_unavailable"});
  const ipKey=createHash("sha256").update(`${process.env.RATE_LIMIT_SECRET}|media|ip|${clientAddress(event)}`).digest("hex");
  const identityKey=createHash("sha256").update(`${process.env.RATE_LIMIT_SECRET}|media|identity|${identity}`).digest("hex");
  const results=await Promise.allSettled([
    rpc("check_tavern_request_limit",{p_key_hash:ipKey,p_limit:20,p_window_minutes:15}),
    rpc("check_tavern_request_limit",{p_key_hash:identityKey,p_limit:10,p_window_minutes:15})
  ]);
  const failed=results.filter(result=>result.status==="rejected");
  if(failed.length){
    console.error("Media rate limit error",failed.map(result=>result.reason));
    return json(503,{error:"media_consent_unavailable"});
  }
  return results.every(result=>result.value===true)?null:json(429,{error:"too_many_requests"});
};

export const handler=async event=>{
  if(!mediaConsentIsEnabled())return closedResponse();
  if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY)return json(503,{error:"media_consent_unavailable"});
  const agreement=mediaAgreement();
  if(!agreement)return closedResponse();

  const query=event.queryStringParameters&&typeof event.queryStringParameters==="object"
    ?new URLSearchParams(Object.entries(event.queryStringParameters).map(([key,value])=>[key,String(value??"")]))
    :new URLSearchParams(String(event.rawQuery||""));
  let input={};
  if(event.httpMethod==="POST"){
    try{input=JSON.parse(event.body||"{}");}catch{return json(400,{error:"invalid_request"});}
  }

  // Deze route kent maar één soort bezoeker: een deelnemer met zijn eigen link. De
  // voortgangsteller zat hier eerst ook in, met een aparte token voor de hoofdboeker. Robert
  // koos op 1 september 2026 voor de operator-flow, en daarmee is er niemand meer om zo'n
  // link aan te geven: de operator leest de teller met `service_role` via
  // `scripts/media-participants.mjs`. Een publieke route die aantallen teruggeeft heeft dan
  // geen doel meer, en wat geen doel heeft hoort niet op het web te staan.
  const token=String(query.get("token")||input.token||"");
  if(!tokenLooksValid(token))return json(400,{error:"invalid_link"});
  const limited=await limitOrNull(event,`participant|${tokenHash(token).slice(0,32)}`);
  if(limited)return limited;
  const hash=tokenHash(token);

  if(event.httpMethod==="GET"){
    try{
      const state=await rpc("get_tavern_media_agreement_state",{p_token_hash:hash,p_agreement_version:agreement.version});
      if(state.status!=="ready")return json(state.status==="link_expired"?410:404,{error:state.status});
      // Alleen de gegevens van deze ene deelnemer, plus welke versie hij te zien krijgt.
      return json(200,{
        status:"ready",
        fullName:state.fullName,
        weekend:state.weekend,
        weekendLabel:state.weekendLabel,
        agreementVersion:agreement.version,
        // Bewust niet meegestuurd: documentreferentie, privacycontact en bewaartermijn.
        // Die staan vast in de tekst van de overeenkomst zelf en worden gedekt door de
        // teksthash. Zou de pagina ze uit de configuratie halen, dan kan er iets anders op
        // het scherm staan dan wat er is vastgelegd. `MEDIA_RETENTION_PERIOD` blijft wel een
        // eis van de poort: Robert moet een termijn hebben bepaald voordat dit open kan.
        alreadyRecorded:state.alreadyRecorded===true,
        standardUseConsent:state.standardUseConsent,
        paidAdvertisingConsent:state.paidAdvertisingConsent,
        auditReference:state.auditReference,
        recordedAt:state.recordedAt
      });
    }catch(error){console.error("Media state error",error);return json(503,{error:"media_consent_unavailable"});}
  }

  if(event.httpMethod!=="POST")return json(405,{error:"method_not_allowed"});

  if(input.action==="withdraw"){
    try{
      const result=await rpc("withdraw_tavern_media_consent",{p_token_hash:hash,p_agreement_version:agreement.version});
      if(result.status==="withdrawn")return json(200,result);
      return json(result.status==="invalid_link"?404:409,{error:result.status});
    }catch(error){console.error("Media withdrawal error",error);return json(503,{error:"media_consent_unavailable"});}
  }

  // Een keuze moet echt gemaakt zijn. `undefined` of `null` is geen antwoord en wordt
  // geweigerd in plaats van als "nee" of als "ja" ingevuld.
  if(typeof input.standardUse!=="boolean")return json(400,{error:"consent_choice_required"});
  // Toestemming voor advertenties komt alleen mee als er een echte booleaan staat. Wordt er
  // niets over gezegd, dan gaat er `null` naar de database: niet beantwoord, en dus geen
  // toestemming. Deze waarde wordt nooit uit `standardUse` afgeleid.
  const paidAdvertising=typeof input.paidAdvertising==="boolean"?input.paidAdvertising:null;
  try{
    // Versie én teksthash komen uit de serverconfiguratie, niet uit het verzoek. Een client
    // kan dus niet zeggen dat hij een andere, oudere of niet-goedgekeurde tekst tekende.
    const result=await rpc("record_tavern_media_consent",{p_token_hash:hash,p_agreement_version:agreement.version,p_agreement_hash:agreement.hash,p_standard_use:input.standardUse,p_paid_advertising:paidAdvertising});
    if(result.status==="recorded")return json(201,result);
    if(result.status==="already_recorded")return json(200,result);
    return json(result.status==="link_expired"?410:409,{error:result.status});
  }catch(error){console.error("Media consent error",error);return json(503,{error:"media_consent_unavailable"});}
};
