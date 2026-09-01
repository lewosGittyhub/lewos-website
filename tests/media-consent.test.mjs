import assert from "node:assert/strict";
import {after,before,beforeEach,test} from "node:test";
import {createHash,randomBytes} from "node:crypto";
import {readFile} from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import {listenOnTestPort,stopTestServer} from "./_test-server.mjs";

const root=path.resolve(import.meta.dirname,"..");
const read=file=>readFile(path.join(root,file),"utf8");

let calls=[];let stateResult;let recordResult;let progressResult;let withdrawResult;let emailRequests=0;let server;
let limiterFails=false;
const nativeFetch=globalThis.fetch;
const originalEnv={...process.env};

// De zes instellingen die de mediapoort openzetten. Alleen geldig op een lokale testserver:
// `_media-config.mjs` weigert deze overrides zodra `URL` geen localhost is.
const openTheGate=()=>{
  process.env.TAVERN_MEDIA_CONSENT_ENABLED="true";
  process.env.MEDIA_AGREEMENT_VERSION="media-test-v1";
  process.env.MEDIA_AGREEMENT_DOCUMENT_URL="/documents/media-test.pdf";
  process.env.MEDIA_AGREEMENT_HASH="a".repeat(64);
  process.env.MEDIA_PRIVACY_CONTACT="privacy@example.invalid";
  process.env.MEDIA_RETENTION_PERIOD="test retention";
  process.env.MEDIA_LEGAL_REVIEW_REFERENCE="test-review-1";
};
const closeTheGate=()=>{
  for(const key of ["TAVERN_MEDIA_CONSENT_ENABLED","MEDIA_AGREEMENT_VERSION","MEDIA_AGREEMENT_DOCUMENT_URL","MEDIA_AGREEMENT_HASH","MEDIA_PRIVACY_CONTACT","MEDIA_RETENTION_PERIOD","MEDIA_LEGAL_REVIEW_REFERENCE"])delete process.env[key];
};
const handler=async()=>(await import("../netlify/functions/media-consent.mjs")).handler;
const token="abcdefghijklmnopqrstuvwxyzABCDEF123456";

before(async()=>{
  server=http.createServer((request,response)=>{
    let body="";request.on("data",chunk=>body+=chunk);
    request.on("end",()=>{
      calls.push({url:request.url,body});
      response.setHeader("content-type","application/json");
      if(request.url==="/rest/v1/rpc/check_tavern_request_limit"){
        if(limiterFails){response.statusCode=500;return response.end('{"message":"limiter_down"}');}
        return response.end("true");
      }
      if(request.url==="/rest/v1/rpc/get_tavern_media_agreement_state")return response.end(JSON.stringify(stateResult));
      if(request.url==="/rest/v1/rpc/record_tavern_media_consent")return response.end(JSON.stringify(recordResult));
      if(request.url==="/rest/v1/rpc/get_tavern_media_progress")return response.end(JSON.stringify(progressResult));
      if(request.url==="/rest/v1/rpc/withdraw_tavern_media_consent")return response.end(JSON.stringify(withdrawResult));
      if(request.url==="/emails"){emailRequests+=1;return response.end(JSON.stringify({id:"email-1"}));}
      response.statusCode=404;response.end("{}");
    });
  });
  await listenOnTestPort(server);
  const base=`http://127.0.0.1:${server.address().port}`;
  globalThis.fetch=(input,options)=>{
    const url=String(input);
    if(url.startsWith("https://api.resend.com/"))return nativeFetch(`${base}/emails`,options);
    if(url.startsWith(base))return nativeFetch(input,options);
    return Promise.reject(new Error(`test_reached_the_network: ${url}`));
  };
  process.env.SUPABASE_URL=base;
  process.env.SUPABASE_SERVICE_ROLE_KEY="service";
  process.env.RATE_LIMIT_SECRET="media-test-secret";
  process.env.URL=base;
  process.env.NODE_ENV="test";
});
beforeEach(()=>{
  calls=[];emailRequests=0;limiterFails=false;
  openTheGate();
  stateResult={status:"ready",participantId:"participant-1",fullName:"Test Guest",weekend:"weekend-01",weekendLabel:"Weekend 01 · 30 Oct to 2 Nov 2026",agreementVersion:"media-test-v1",alreadyRecorded:false};
  recordResult={status:"recorded",participantId:"participant-1",auditReference:"abc123",recordedAt:"2026-10-01T10:00:00Z",standardUseConsent:true,paidAdvertisingConsent:false};
  progressResult={status:"ready",expected:6,total:6,completed:4,agreementVersion:"media-test-v1"};
  withdrawResult={status:"withdrawn",participantId:"participant-1",auditReference:"abc123",withdrawnAt:"2026-10-02T10:00:00Z"};
});
after(async()=>{
  globalThis.fetch=nativeFetch;
  // Dit bestand zet een stuk of tien omgevingsvariabelen. Laat het er geen achter: een
  // volgend testbestand in hetzelfde proces zou anders op onze Supabase-URL uitkomen.
  for(const key of Object.keys(process.env))if(!(key in originalEnv))delete process.env[key];
  Object.assign(process.env,originalEnv);
  await stopTestServer(server);
  server=null;
});

// ---------------------------------------------------------------- de poort

test("a missing setting keeps the whole flow shut, and says which one",async()=>{
  const {mediaConsentBlockers,mediaConsentIsEnabled}=await import("../netlify/functions/_media-config.mjs");
  for(const missing of ["TAVERN_MEDIA_CONSENT_ENABLED","MEDIA_AGREEMENT_VERSION","MEDIA_AGREEMENT_DOCUMENT_URL","MEDIA_AGREEMENT_HASH","MEDIA_PRIVACY_CONTACT","MEDIA_RETENTION_PERIOD","MEDIA_LEGAL_REVIEW_REFERENCE"]){
    openTheGate();
    delete process.env[missing];
    assert.equal(mediaConsentIsEnabled(),false,`${missing} on its own must be able to hold the flow shut`);
    assert.ok(mediaConsentBlockers().length>0,"a closed gate must be able to explain itself");
  }
});

test("the flow is shut by default, with nothing published in the code",async()=>{
  const config=await read("netlify/functions/_media-config.mjs");
  // Twee sloten: de constanten in de code én de instellingen in Netlify. Eén is te weinig.
  for(const constant of ["PUBLISHED_MEDIA_AGREEMENT_VERSION","PUBLISHED_MEDIA_AGREEMENT_DOCUMENT","PUBLISHED_MEDIA_AGREEMENT_HASH","PUBLISHED_MEDIA_PRIVACY_CONTACT","PUBLISHED_MEDIA_RETENTION","PUBLISHED_MEDIA_LEGAL_REVIEW"]){
    assert.match(config,new RegExp(`export const ${constant}="";`),`${constant} must ship empty`);
  }
  closeTheGate();
  const {mediaConsentIsEnabled,mediaAgreement}=await import("../netlify/functions/_media-config.mjs");
  assert.equal(mediaConsentIsEnabled(),false);
  assert.equal(mediaAgreement(),null,"a closed gate must never hand out an agreement version");
});

test("test fixtures can never open the gate on a public deployment",async()=>{
  openTheGate();
  const publicUrl=process.env.URL;
  process.env.URL="https://lewos.co";
  const {mediaConsentIsEnabled}=await import("../netlify/functions/_media-config.mjs");
  assert.equal(mediaConsentIsEnabled(),false);
  process.env.URL=publicUrl;
});

test("the closed flow touches nothing: no database call, no email, no stored data",async()=>{
  closeTheGate();
  const run=await handler();
  const responses=await Promise.all([
    run({httpMethod:"GET",queryStringParameters:{token}}),
    run({httpMethod:"POST",body:JSON.stringify({token,standardUse:true,paidAdvertising:true})}),
    run({httpMethod:"GET",queryStringParameters:{progress:token}})
  ]);
  for(const response of responses){
    assert.equal(response.statusCode,503);
    assert.equal(JSON.parse(response.body).error,"media_consent_not_open");
  }
  assert.deepEqual(calls,[],"a closed gate may not reach the database at all");
  assert.equal(emailRequests,0,"a closed gate may not send an email");
});

test("the invitation script refuses to run while the gate is shut",async()=>{
  const script=await read("scripts/issue-media-agreements.mjs");
  assert.match(script,/if\(!mediaConsentIsEnabled\(\)\)/,"the gate must be checked before anything is read");
  assert.match(script,/process\.exit\(1\)/);
  // Zonder --send is het altijd een droogloop, ook met een open poort.
  assert.match(script,/const send=process\.argv\.includes\("--send"\)/);
  assert.match(script,/MEDIA_AGREEMENT_SEND_CONFIRM!=="SEND_MEDIA_AGREEMENTS_NOW"/);
});

// ---------------------------------------------------------------- tokens

test("invitation tokens are unpredictable and never stored raw",async()=>{
  const script=await read("scripts/issue-media-agreements.mjs");
  const migration=await read("database/filming-consent.sql");
  // 32 willekeurige bytes uit de crypto-generator, niet uit Math.random of een teller.
  assert.match(script,/randomBytes\(32\)\.toString\("base64url"\)/);
  assert.doesNotMatch(script,/Math\.random/);
  // Alleen de hash gaat naar de database.
  assert.match(script,/createHash\("sha256"\)\.update\(token\)\.digest\("hex"\)/);
  assert.match(script,/p_token_hash:hash/);
  assert.doesNotMatch(script,/p_token:token|p_invitation_token:/,"a raw token may never be sent to the database");
  // De kolom heet naar wat er in zit en accepteert alleen een sha256-hash.
  assert.match(migration,/invitation_token_hash text check \(invitation_token_hash is null or char_length\(invitation_token_hash\)=64\)/);
  assert.doesNotMatch(migration,/invitation_token text/,"there must be no column that could hold a raw token");
  // En de gegenereerde tokens zijn feitelijk uniek en breed genoeg.
  const tokens=new Set(Array.from({length:500},()=>randomBytes(32).toString("base64url")));
  assert.equal(tokens.size,500,"generated tokens must not repeat");
  for(const value of tokens)assert.ok(value.length>=42,"32 random bytes must survive the encoding");
});

test("one token can only ever belong to one participant",async()=>{
  const migration=await read("database/filming-consent.sql");
  // Een uniek index maakt hier een regel van in plaats van een belofte.
  assert.match(migration,/create unique index if not exists tavern_media_participants_token_idx on public\.tavern_media_participants \(invitation_token_hash\) where invitation_token_hash is not null/);
  // En de opzoeking gaat op de hash, niet op iets wat de bezoeker zelf kan kiezen.
  assert.match(migration,/from public\.tavern_media_participants where invitation_token_hash=p_token_hash/);
});

test("the function only ever sends a hash to the database",async()=>{
  const run=await handler();
  await run({httpMethod:"GET",queryStringParameters:{token}});
  const state=calls.find(call=>call.url==="/rest/v1/rpc/get_tavern_media_agreement_state");
  const sent=JSON.parse(state.body);
  assert.equal(sent.p_token_hash,createHash("sha256").update(token).digest("hex"));
  assert.ok(!JSON.stringify(sent).includes(token),"the raw token may not leave the function");
});

test("expired and unknown links are refused",async()=>{
  const run=await handler();
  stateResult={status:"link_expired"};
  const expired=await run({httpMethod:"GET",queryStringParameters:{token}});
  assert.equal(expired.statusCode,410);
  stateResult={status:"invalid_link"};
  const unknown=await run({httpMethod:"GET",queryStringParameters:{token}});
  assert.equal(unknown.statusCode,404);
  // Een ingetrokken link is er domweg geen meer: de hash is gewist.
  const migration=await read("database/filming-consent.sql");
  assert.match(migration,/set invitation_token_hash=null,invitation_expires_at=null,invitation_sent_at=null,invitation_email_provider_id=null/);
  // Een link die niet meer geldig is, kan ook niets meer vastleggen.
  recordResult={status:"link_expired"};
  const late=await run({httpMethod:"POST",body:JSON.stringify({token,standardUse:true})});
  assert.equal(late.statusCode,410);
});

test("a failing rate limiter answers 503 instead of throwing",async()=>{
  // Dit ging eerder mis: de twee limietaanroepen zaten niet in een try/catch, dus een
  // storing bij Supabase liet de handler gooien in plaats van antwoorden. In productie een
  // 500 zonder uitleg; in een test een afgewezen belofte in plaats van een antwoord.
  limiterFails=true;
  const run=await handler();
  for(const event of [
    {httpMethod:"GET",queryStringParameters:{token}},
    {httpMethod:"POST",body:JSON.stringify({token,standardUse:true})},
    {httpMethod:"GET",queryStringParameters:{progress:token}}
  ]){
    const response=await run(event);
    assert.equal(response.statusCode,503);
    assert.equal(JSON.parse(response.body).error,"media_consent_unavailable");
  }
  // En een storing mag nooit een vrijbrief zijn: er is niets vastgelegd.
  assert.equal(calls.some(call=>call.url==="/rest/v1/rpc/record_tavern_media_consent"),false);
});

test("both limiter calls are awaited, so no request outlives the response",async()=>{
  const source=await read("netlify/functions/media-consent.mjs");
  // Promise.all keert terug zodra de eerste aanroep afketst en laat de tweede doorlopen.
  // Dat verzoek loopt dan door nadat de test al klaar is, met een socket die nog openstaat
  // terwijl de mockserver afsluit.
  assert.match(source,/Promise\.allSettled\(\[/);
  assert.doesNotMatch(source,/await Promise\.all\(\[/);
});

test("a malformed link never reaches the database",async()=>{
  const run=await handler();
  for(const bad of ["","short","../../etc/passwd","a".repeat(400)]){
    const response=await run({httpMethod:"GET",queryStringParameters:{token:bad}});
    assert.equal(response.statusCode,400);
  }
  assert.equal(calls.length,0);
});

// ---------------------------------------------------------------- de keuzes

test("paid advertising is a separate value that is never derived from the other choice",async()=>{
  const run=await handler();
  await run({httpMethod:"POST",body:JSON.stringify({token,standardUse:true})});
  const sent=JSON.parse(calls.find(call=>call.url==="/rest/v1/rpc/record_tavern_media_consent").body);
  // Toestemming voor gewoon gebruik zegt niets over advertenties.
  assert.equal(sent.p_standard_use,true);
  assert.equal(sent.p_paid_advertising,null,"an unanswered advertising question is not consent");

  calls=[];
  await run({httpMethod:"POST",body:JSON.stringify({token,standardUse:true,paidAdvertising:false})});
  assert.equal(JSON.parse(calls.find(call=>call.url==="/rest/v1/rpc/record_tavern_media_consent").body).p_paid_advertising,false);

  calls=[];
  await run({httpMethod:"POST",body:JSON.stringify({token,standardUse:true,paidAdvertising:"yes please"})});
  assert.equal(JSON.parse(calls.find(call=>call.url==="/rest/v1/rpc/record_tavern_media_consent").body).p_paid_advertising,null,"only a real boolean counts as an answer");
});

test("the advertising checkbox is separate, optional and never pre-ticked",async()=>{
  const page=await read("tavern/filming-agreement/index.html");
  const script=await read("tavern/filming-agreement/media-agreement.js");
  const migration=await read("database/filming-consent.sql");
  assert.match(page,/<input id="fa-ads" type="checkbox" data-media-ads>/,"the advertising box must ship plain and unticked");
  assert.match(page,/never assumed from anything you ticked above/i);
  assert.match(script,/paidAdvertising:ads\?ads\.checked:false/);
  // Eigen kolom, nullable, en losstaand van de kern-toestemming.
  assert.match(migration,/paid_advertising_consent boolean,/);
  assert.match(migration,/standard_use_consent boolean not null,/);
});

test("a choice must actually be made before anything is recorded",async()=>{
  const run=await handler();
  for(const body of [{token},{token,standardUse:null},{token,standardUse:"true"}]){
    const response=await run({httpMethod:"POST",body:JSON.stringify(body)});
    assert.equal(response.statusCode,400);
    assert.equal(JSON.parse(response.body).error,"consent_choice_required");
  }
  assert.equal(calls.filter(call=>call.url==="/rest/v1/rpc/record_tavern_media_consent").length,0);
});

test("the version and the exact text come from the server, never from the request",async()=>{
  const run=await handler();
  await run({httpMethod:"POST",body:JSON.stringify({token,standardUse:true,agreementVersion:"attacker-v9",agreementHash:"b".repeat(64)})});
  const sent=JSON.parse(calls.find(call=>call.url==="/rest/v1/rpc/record_tavern_media_consent").body);
  assert.equal(sent.p_agreement_version,"media-test-v1");
  assert.equal(sent.p_agreement_hash,"a".repeat(64));
});

test("a second submission is safe and returns the same audit reference",async()=>{
  const run=await handler();
  recordResult={status:"already_recorded",participantId:"participant-1",auditReference:"abc123",recordedAt:"2026-10-01T10:00:00Z",standardUseConsent:true,paidAdvertisingConsent:null};
  const response=await run({httpMethod:"POST",body:JSON.stringify({token,standardUse:false})});
  assert.equal(response.statusCode,200);
  assert.equal(JSON.parse(response.body).auditReference,"abc123","a repeat submission may not silently overwrite the first");
  const migration=await read("database/filming-consent.sql");
  assert.match(migration,/create unique index if not exists tavern_media_consents_live_idx on public\.tavern_media_consents \(participant_id, agreement_version\) where withdrawn_at is null/);
  assert.match(migration,/return jsonb_build_object\('status','already_recorded'/);
});

test("a new agreement version needs a new agreement from every guest",async()=>{
  const migration=await read("database/filming-consent.sql");
  // Toestemming hangt aan een versie. Voor een andere versie bestaat hij simpelweg niet.
  assert.match(migration,/agreement_version text not null references public\.tavern_media_agreements\(version\)/);
  assert.match(migration,/where participant_id=deelnemer\.id and agreement_version=p_agreement_version and withdrawn_at is null/);
  // En de teller van de hoofdboeker telt alleen de huidige versie mee.
  assert.match(migration,/and toestemming\.agreement_version=p_agreement_version/);
  const run=await handler();
  stateResult={...stateResult,alreadyRecorded:false,agreementVersion:"media-test-v1"};
  const response=await run({httpMethod:"GET",queryStringParameters:{token}});
  assert.equal(JSON.parse(response.body).alreadyRecorded,false,"an older consent may not count as consent to a new version");
});

test("withdrawal is recorded rather than erased",async()=>{
  const run=await handler();
  const response=await run({httpMethod:"POST",body:JSON.stringify({token,action:"withdraw"})});
  assert.equal(response.statusCode,200);
  assert.equal(JSON.parse(response.body).status,"withdrawn");
  const migration=await read("database/filming-consent.sql");
  assert.match(migration,/update public\.tavern_media_consents set withdrawn_at=now\(\)/);
  assert.doesNotMatch(migration,/delete from public\.tavern_media_consents/,"a withdrawal is evidence and may not be deleted");
});

// ---------------------------------------------------------------- wie ziet wat

test("the organiser sees counts and never another guest's details",async()=>{
  const run=await handler();
  const response=await run({httpMethod:"GET",queryStringParameters:{progress:token}});
  const body=JSON.parse(response.body);
  assert.equal(response.statusCode,200);
  assert.deepEqual(Object.keys(body).sort(),["agreementVersion","completed","expected","status","total"]);
  for(const leak of ["fullName","email","name","standardUseConsent","paidAdvertisingConsent","participantId"]){
    assert.equal(body[leak],undefined,`the progress view may not expose ${leak}`);
  }
  const migration=await read("database/filming-consent.sql");
  assert.match(migration,/'expected',claim\.party_size,'total',totaal,'completed',afgerond/);
});

test("a participant link returns only that participant",async()=>{
  const run=await handler();
  const body=JSON.parse((await run({httpMethod:"GET",queryStringParameters:{token}})).body);
  assert.equal(body.fullName,"Test Guest");
  const migration=await read("database/filming-consent.sql");
  // De functie kijkt alleen naar de rij die bij deze hash hoort; er is geen pad naar de rest.
  assert.doesNotMatch(migration,/select .* from tavern_media_participants where claim_id=[^\n]*returns jsonb/);
  assert.match(migration,/geen naam, geen e-mailadres en geen keuze van een andere gast/);
});

// ---------------------------------------------------------------- de grenzen eromheen

test("Weekend 01 needs a personal agreement and Weekend 02 is never dragged into it",async()=>{
  const migration=await read("database/filming-consent.sql");
  // Dit staat in de database, niet alleen in een formulier: een formulier is te omzeilen.
  assert.match(migration,/create or replace function public\.tavern_media_agreement_required\(p_weekend_slug text\)\s*\nreturns boolean language sql immutable set search_path='' as \$\$ select p_weekend_slug='weekend-01'; \$\$;/);
  // Elke ingang controleert het opnieuw.
  const guarded=migration.match(/if not public\.tavern_media_agreement_required\(weekend\.slug\) then/g)||[];
  assert.ok(guarded.length>=4,`every entry point must check it, found ${guarded.length}`);
  assert.match(migration,/return jsonb_build_object\('status','not_required'/);
});

test("the lead booker's checkout tick is an acknowledgement and never media consent",async()=>{
  const checkout=await read("netlify/functions/create-checkout-session.mjs");
  const page=await read("tavern/book/index.html");
  // De kassa legt nog steeds geen toestemming vast, ook niet nu de flow bestaat.
  assert.match(checkout,/FILMING_CONSENT_NEVER_FROM_CHECKOUT=false/);
  assert.match(checkout,/p_filming_consent:FILMING_CONSENT_NEVER_FROM_CHECKOUT/);
  assert.doesNotMatch(checkout,/p_filming_consent:filmingConsent/);
  assert.match(page,/not media or privacy permission/i);
  // En de kassa kent de mediapoort niet: die twee mogen elkaar niet kunnen openen.
  assert.doesNotMatch(checkout,/_media-config/);
});

test("the media gate cannot open or weaken the payment gate",async()=>{
  const media=await read("netlify/functions/_media-config.mjs");
  const booking=await read("netlify/functions/_booking-config.mjs");
  const mediaFunction=await read("netlify/functions/media-consent.mjs");
  assert.doesNotMatch(media,/TAVERN_PAYMENTS_ENABLED|PUBLISHED_TERMS|paymentsAreEnabled/);
  assert.doesNotMatch(mediaFunction,/stripe|payment|checkout/i);
  assert.doesNotMatch(booking,/_media-config|MEDIA_/);
  // De betaalpoort staat nog net zo dicht als hij stond.
  for(const constant of ["PUBLISHED_TERMS_VERSION","PUBLISHED_TERMS_DOCUMENT","PUBLISHED_TRAVEL_DOCUMENT"]){
    assert.match(booking,new RegExp(`export const ${constant}="";`));
  }
});

test("every environment variable the media flow needs is written down for the operator",async()=>{
  const handlerSource=await read("netlify/functions/media-consent.mjs");
  const config=await read("netlify/functions/_media-config.mjs");
  const script=await read("scripts/issue-media-agreements.mjs");
  const runbook=await read("operations/filming-weekend-01.md");
  const needed=[...new Set([...`${handlerSource}\n${config}\n${script}`.matchAll(/process\.env\.([A-Z_]+)/g)].map(match=>match[1]))];
  const missing=needed.filter(name=>!runbook.includes(name));
  assert.deepEqual(missing,[],`not documented anywhere for the operator: ${missing.join(", ")}`);
});
