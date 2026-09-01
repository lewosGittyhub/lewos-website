// Piekbelasting op de First Access-route. Niets hiervan raakt productie: de
// Supabase-aanroepen gaan naar een lokale nabootsing die dezelfde regels volgt als
// database/first-access.sql, en Stripe komt er niet aan te pas.
//
// Wat dit wel bewijst: de functielaag deelt geen stoelen dubbel uit, de snelheidslimiet
// vangt herhaald misbruik af, en een database die wegvalt levert een net antwoord in
// plaats van een hangende verbinding.
// Wat dit niet bewijst: het gedrag van PostgreSQL zelf onder gelijktijdige transacties.
// Dat is de rollbacktest in Supabase, die Codex draait.
import assert from "node:assert/strict";
import {after,before,beforeEach,test} from "node:test";
import http from "node:http";
import {listenOnTestPort,stopTestServer} from "./_test-server.mjs";

const CAPACITEIT=6;
const WEEKENDS=["weekend-01","weekend-02"];

let server;let basis;let db;let databaseDown=false;
const nativeFetch=globalThis.fetch;

const nieuweDatabase=()=>({claims:[],limieten:new Map()});

// Zelfde regel als check_tavern_request_limit: tellen binnen een venster, en pas
// weigeren zodra de teller boven de limiet uitkomt.
const limietCheck=({p_key_hash,p_limit})=>{
  const huidig=(db.limieten.get(p_key_hash)??0)+1;
  db.limieten.set(p_key_hash,huidig);
  return huidig<=p_limit;
};

const bezet=slug=>db.claims
  .filter(claim=>claim.assigned===slug&&["first_access_held","payment_pending","paid"].includes(claim.status))
  .reduce((totaal,claim)=>totaal+claim.party,0);

// Zelfde volgorde als register_tavern_interest: bestaande claim, e-mailgrens, plek in het
// gevraagde weekend, anders een alternatief, anders belangstelling voor later.
const registreer=({p_name,p_email,p_party_size,p_weekend_slug})=>{
  const email=String(p_email).toLowerCase();
  const actief=db.claims.filter(claim=>claim.email===email&&["first_access_held","payment_pending","paid"].includes(claim.status));
  const bestaand=actief.find(claim=>claim.assigned===p_weekend_slug);
  if(bestaand)return {status:bestaand.status,claimId:bestaand.id,duplicate:true,seats:bestaand.party};
  if(actief.length>=2){const fout=new Error("email_claim_limit");fout.databaseMessage="email_claim_limit";throw fout;}
  if(CAPACITEIT-bezet(p_weekend_slug)>=p_party_size){
    const claim={id:`c${db.claims.length+1}`,email,party:p_party_size,assigned:p_weekend_slug,status:"first_access_held"};
    db.claims.push(claim);
    return {status:"first_access_held",claimId:claim.id,weekend:p_weekend_slug,seats:p_party_size,weekendLabel:"Test",remaining:CAPACITEIT-bezet(p_weekend_slug)};
  }
  const alternatief=WEEKENDS.find(slug=>slug!==p_weekend_slug&&CAPACITEIT-bezet(slug)>=p_party_size);
  if(alternatief){
    const claim={id:`c${db.claims.length+1}`,email,party:p_party_size,assigned:null,status:"alternative_offered"};
    db.claims.push(claim);
    return {status:"alternative_offered",claimId:claim.id,offeredWeekend:alternatief,offeredWeekendLabel:"Test",requestedWeekend:"Test",seats:p_party_size};
  }
  const claim={id:`c${db.claims.length+1}`,email,party:p_party_size,assigned:null,status:"future_weekend_interest"};
  db.claims.push(claim);
  return {status:"future_weekend_interest",claimId:claim.id,requestedWeekend:"Test",seats:p_party_size};
};

before(async()=>{
  server=http.createServer((request,response)=>{
    let body="";request.on("data",chunk=>body+=chunk);
    request.on("end",()=>{
      response.setHeader("content-type","application/json");
      if(databaseDown){response.statusCode=500;return response.end(JSON.stringify({message:"unavailable"}));}
      const invoer=body?JSON.parse(body):{};
      try{
        if(request.url==="/rest/v1/rpc/check_tavern_request_limit")return response.end(JSON.stringify(limietCheck(invoer)));
        if(request.url==="/rest/v1/rpc/register_tavern_interest")return response.end(JSON.stringify(registreer(invoer)));
        if(request.url==="/rest/v1/rpc/mark_tavern_receipt_email_sent")return response.end(JSON.stringify({status:"marked"}));
        if(request.url==="/rest/v1/rpc/tavern_public_booking_ready")return response.end("false");
        if(request.url==="/rest/v1/rpc/get_tavern_availability")return response.end(JSON.stringify([]));
      }catch(fout){
        response.statusCode=400;
        return response.end(JSON.stringify({message:fout.databaseMessage??"unknown"}));
      }
      response.statusCode=404;response.end("{}");
    });
  });
  await listenOnTestPort(server);
  basis=`http://127.0.0.1:${server.address().port}`;
  globalThis.fetch=(input,options)=>{
    const url=String(input);
    if(url.startsWith(basis))return nativeFetch(input,options);
    return Promise.reject(new Error(`test_reached_the_network: ${url}`));
  };
  process.env.SUPABASE_URL=basis;
  process.env.SUPABASE_SERVICE_ROLE_KEY="service";
  process.env.RATE_LIMIT_SECRET="load-test-secret";
  process.env.PUBLIC_BOOKING_OPENS_AT="2099-01-01T00:00:00Z";
  delete process.env.RESEND_API_KEY;
});
beforeEach(()=>{db=nieuweDatabase();databaseDown=false;});
after(async()=>{globalThis.fetch=nativeFetch;await stopTestServer(server);server=null;});

const aanvraag=({email,ip,weekend="weekend-01",mensen=1})=>({
  httpMethod:"POST",
  // De pagina vraagt zelf om JSON; zonder die kop antwoordt de functie met een
  // omleiding, zoals bij een formulierpost zonder JavaScript.
  headers:{"content-type":"application/json",accept:"application/json","x-nf-client-connection-ip":ip},
  body:JSON.stringify({name:"Load Tester",email,weekend,people:String(mensen),consent:"agreed"})
});
const stuur=async lijst=>{
  const {handler}=await import("../netlify/functions/first-access.mjs");
  return Promise.all(lijst.map(invoer=>handler(invoer)));
};
const tel=antwoorden=>antwoorden.reduce((telling,antwoord)=>{
  const sleutel=antwoord.statusCode===200?JSON.parse(antwoord.body).status:antwoord.statusCode;
  telling[sleutel]=(telling[sleutel]??0)+1;return telling;
},{});

test("honderd gelijktijdige bezoekers verdelen nooit meer stoelen dan er zijn",async()=>{
  const antwoorden=await stuur(Array.from({length:100},(_,index)=>aanvraag({email:`gast${index}@example.invalid`,ip:`10.0.${Math.floor(index/250)}.${index%250}`})));
  const telling=tel(antwoorden);
  assert.equal(antwoorden.filter(antwoord=>antwoord.statusCode>=500).length,0,"geen enkele serverfout onder normale piek");
  for(const slug of WEEKENDS){
    assert.ok(bezet(slug)<=CAPACITEIT,`${slug} is overboekt: ${bezet(slug)} van ${CAPACITEIT}`);
  }
  assert.equal(telling.first_access_held,CAPACITEIT,"precies zes stoelen vergeven, niet meer en niet minder");
  assert.ok((telling.alternative_offered??0)+(telling.future_weekend_interest??0)>0,"de rest krijgt een eerlijk alternatief, geen fout");
});

test("honderd aanvragen van hetzelfde e-mailadres lopen tegen de limiet aan",async()=>{
  const antwoorden=await stuur(Array.from({length:100},(_,index)=>aanvraag({email:"spammer@example.invalid",ip:`10.1.0.${index%250}`})));
  const telling=tel(antwoorden);
  assert.equal(telling[429],95,"vanaf de zesde poging binnen het venster volgt een nette 429");
  assert.equal(antwoorden.filter(antwoord=>antwoord.statusCode>=500).length,0);
  assert.ok(db.claims.filter(claim=>claim.status==="first_access_held").length<=1,"één e-mailadres claimt hooguit één keer stoelen in hetzelfde weekend");
});

test("honderd aanvragen vanaf hetzelfde adres lopen tegen de adreslimiet aan",async()=>{
  const antwoorden=await stuur(Array.from({length:100},(_,index)=>aanvraag({email:`vanaf${index}@example.invalid`,ip:"10.2.0.9"})));
  const telling=tel(antwoorden);
  assert.equal(telling[429],88,"twaalf aanvragen per kwartier per adres, de rest wordt geweigerd");
  assert.equal(antwoorden.filter(antwoord=>antwoord.statusCode>=500).length,0);
});

test("een database die wegvalt geeft een net antwoord in plaats van een hangende verbinding",async()=>{
  databaseDown=true;
  const antwoorden=await stuur(Array.from({length:50},(_,index)=>aanvraag({email:`uitval${index}@example.invalid`,ip:`10.3.0.${index}`})));
  assert.ok(antwoorden.every(antwoord=>antwoord.statusCode===503),"elke aanvraag krijgt 503, geen 200 en geen stilte");
  for(const antwoord of antwoorden)assert.equal(JSON.parse(antwoord.body).error,"booking_service_unavailable");
  assert.equal(db.claims.length,0,"een storing mag nooit een halve claim achterlaten");
});
