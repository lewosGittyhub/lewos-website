// Statische controles op `database/filming-consent.sql`. Er staat hier geen PostgreSQL, dus
// deze tests lezen de migratie in plaats van hem te draaien. Ze bewaken de afspraken die je
// niet aan de code kunt zien zodra iemand er later een functie bij zet: een lege
// `search_path`, volledig gekwalificeerde verwijzingen, en rechten die alleen naar
// `service_role` gaan. De echte proef staat in `tests/database-integration.sql` en kan
// alleen op een testproject draaien.
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {test} from "node:test";

const root=path.resolve(import.meta.dirname,"..");
const source=await readFile(path.join(root,"database/filming-consent.sql"),"utf8");
// De controles hieronder gaan over wat de database uitvoert, niet over wat het commentaar
// erboven uitlegt. Een toelichting mag `search_path=public` benoemen juist omdat het fout
// is; alleen de SQL zelf mag het niet doen. Elke regel die met `--` begint gaat er dus af.
const migration=source.split("\n").filter(line=>!line.trim().startsWith("--")).join("\n");

// Kop en body van elke functie apart, zodat een test over de body niet per ongeluk op de
// `revoke`-regels eronder matcht.
const functions=[...migration.matchAll(/create or replace function\s+(\w+)\.(\w+)\(([^)]*)\)\s*\nreturns ([^\n]*?)\s+as \$\$([\s\S]*?)\$\$;/g)]
  .map(match=>({schema:match[1],name:match[2],args:match[3],signature:match[4],body:match[5]}));

// Elk object dat in een body kan voorkomen en dat via de search_path zou worden opgezocht.
const schemaObjects=["tavern_media_participants","tavern_media_consents","tavern_media_agreements","tavern_seat_claims","tavern_weekends","tavern_media_agreement_required"];
const mediaTables=["tavern_media_agreements","tavern_media_participants","tavern_media_consents"];
const publicFunctions=()=>functions.filter(fn=>fn.schema==="public");

test("the comment stripper leaves the SQL itself intact",()=>{
  // Als dit filter te veel weghaalt, worden alle tests hieronder stilletjes waardeloos.
  assert.ok(migration.includes("create or replace function public.record_tavern_media_consent"));
  assert.ok(migration.includes("alter table public.tavern_media_consents enable row level security;"));
  assert.ok(!migration.split("\n").some(line=>line.trim().startsWith("--")),"no comment line may survive");
  assert.ok(source.includes("-- Zoekpad:"),"the source really does carry comments worth stripping");
});

test("the migration defines the functions this suite expects to guard",()=>{
  // Zonder deze controle zou elke test hieronder stilzwijgend over nul functies lopen.
  assert.ok(functions.length>=11,`expected at least 11 functions, found ${functions.length}`);
  assert.ok(functions.some(fn=>fn.schema==="private"),"the internal cleanup functions must exist");
});

test("every SECURITY DEFINER function runs with an empty search_path",()=>{
  // `set search_path=public` laat de aanroeper bepalen wat `public` betekent. Wie een eigen
  // schema vóór `public` zet, laat zijn eigen tabel of functie draaien met de rechten van
  // de eigenaar van deze functie. Leeg is de enige veilige waarde.
  const definers=functions.filter(fn=>/security definer/.test(fn.signature));
  assert.ok(definers.length>=10,`expected at least 10 definer functions, found ${definers.length}`);
  for(const fn of definers){
    assert.match(fn.signature,/set search_path=''/,`${fn.schema}.${fn.name} does not pin an empty search_path`);
  }
  assert.doesNotMatch(migration,/search_path=public/,"no function may fall back to the public schema");
  assert.doesNotMatch(migration,/search_path\s*=\s*"?public/,"no function may fall back to the public schema");
});

test("no function is left with a search_path the caller can choose",()=>{
  // Ook een functie zonder SECURITY DEFINER hoort hem vast te zetten; dat is wat de
  // Supabase-linter onder `function_search_path_mutable` verlangt.
  for(const fn of functions){
    assert.match(fn.signature,/set search_path=''/,`${fn.schema}.${fn.name} has no fixed search_path`);
  }
});

test("every object a function body touches carries its schema",()=>{
  // Met een lege search_path wordt een kale tabelnaam niet meer gevonden. Dit vangt ook het
  // geval waarin iemand later een functie toevoegt en de kwalificatie vergeet.
  const missing=[];
  for(const fn of functions){
    for(const object of schemaObjects){
      for(const hit of fn.body.matchAll(new RegExp(`(?<![\\w.])${object}\\b`,"g"))){
        const start=fn.body.lastIndexOf("\n",hit.index)+1;
        missing.push(`${fn.schema}.${fn.name}: ${fn.body.slice(start,fn.body.indexOf("\n",hit.index)).trim()}`);
      }
    }
  }
  assert.deepEqual(missing,[],`unqualified references would not resolve with an empty search_path:\n${missing.join("\n")}`);
});

test("%rowtype declarations are qualified too",()=>{
  // Een kaal `tavern_media_participants%rowtype` wordt net zo goed via de search_path
  // opgezocht als een tabel in een query, en faalt dus even hard.
  for(const [,declared] of migration.matchAll(/([\w.]+)%rowtype/g)){
    assert.match(declared,/^(public|private)\./,`${declared}%rowtype is not schema-qualified`);
  }
});

test("the migration leans on nothing outside pg_catalog",()=>{
  // `gen_random_bytes` komt uit pgcrypto, en op Supabase staat die extensie in het schema
  // `extensions`. Met een lege search_path is die naam niet te vinden. `gen_random_uuid()`
  // zit sinds PostgreSQL 13 in de kern en werkt overal.
  for(const fromExtension of ["gen_random_bytes","digest(","crypt(","hmac(","uuid_generate_v4"]){
    assert.ok(!migration.includes(fromExtension),`${fromExtension} depends on an extension whose schema we do not control`);
  }
  assert.match(migration,/gen_random_uuid\(\)/,"the built-in generator is the one to use");
});

test("every function withdraws execute rights from PUBLIC, anon and authenticated",()=>{
  for(const fn of functions){
    const types=fn.args.split(",").map(argument=>argument.trim().split(/\s+/).slice(1).join(" ").replace(/\s+default\s+.*$/i,"").trim()).filter(Boolean).join(",");
    const revoke=`revoke all on function ${fn.schema}.${fn.name}(${types}) from public, anon, authenticated;`;
    assert.ok(migration.includes(revoke),`missing exact revoke for ${fn.schema}.${fn.name}: expected\n  ${revoke}`);
  }
});

test("only service_role may execute the public media functions",()=>{
  for(const fn of publicFunctions()){
    const grants=[...migration.matchAll(new RegExp(`grant execute on function ${fn.schema}\\.${fn.name}\\([^)]*\\) to ([^;]+);`,"g"))].map(match=>match[1].trim());
    assert.deepEqual(grants,["service_role"],`${fn.schema}.${fn.name} must be granted to service_role and to nobody else`);
  }
  // En nergens een ruimere toekenning dan dat.
  for(const [,role] of migration.matchAll(/grant execute on function [^;]*? to ([^;]+);/g)){
    assert.equal(role.trim(),"service_role","no role other than service_role may execute these functions");
  }
});

test("the internal cleanup functions are executable by nobody",()=>{
  // Deze horen bij een geplande taak die als eigenaar draait, niet bij een API-sleutel.
  const privateFunctions=functions.filter(fn=>fn.schema==="private");
  assert.ok(privateFunctions.length>=2,"the cleanup and purge functions must both exist");
  for(const fn of privateFunctions){
    assert.doesNotMatch(migration,new RegExp(`grant execute on function private\\.${fn.name}`),`${fn.name} may not be granted to anyone`);
  }
});

test("row level security stays on, with no policy handing out access",()=>{
  for(const table of mediaTables){
    assert.ok(migration.includes(`alter table public.${table} enable row level security;`),`RLS must be enabled on ${table}`);
    assert.ok(migration.includes(`revoke all on table public.${table} from public, anon, authenticated;`),`table rights on ${table} must be withdrawn`);
  }
  // RLS aan zonder policy betekent: anon en authenticated kunnen niets. Zodra hier een
  // policy verschijnt, is dat een bewuste keuze die iemand moet nakijken.
  assert.doesNotMatch(migration,/create policy/i,"a policy on these tables needs review, not a silent commit");
  assert.doesNotMatch(migration,/disable row level security/i);
});

test("participants are deduplicated before they are counted against the seats",()=>{
  // Codex vond dit op een tijdelijke Supabase-branch: er werd op `jsonb_array_length`
  // geteld, dus twee unieke gasten met één dubbele regel werden geweigerd als
  // 'too_many_participants'. Ontdubbelen hoort vóór het tellen.
  const fn=functions.find(item=>item.name==="register_tavern_media_participants");
  assert.ok(fn,"the registration function must exist");
  assert.doesNotMatch(fn.body,/jsonb_array_length\(p_participants\)\s*>\s*claim\.party_size/,"the seat check may not count raw array items");
  assert.match(fn.body,/select distinct lower\(trim\(item->>'email'\)\) as email/,"the count must run over distinct email addresses");
  // Wat er al geregistreerd staat telt mee. Zonder dat vult een tweede aanroep met andere
  // adressen het weekend alsnog: zes plus zes op zes stoelen.
  assert.match(fn.body,/count\(\*\) into al_geplaatst from public\.tavern_media_participants where claim_id=claim\.id/);
  assert.match(fn.body,/al_geplaatst\+nog_te_plaatsen>claim\.party_size/,"already registered participants must count towards the limit");
  // De grens zelf blijft staan: meer unieke gasten dan stoelen wordt nog steeds geweigerd.
  assert.match(fn.body,/'too_many_participants'/);
  // En de volgorde: eerst valideren, dan tellen, dan pas invoegen. Zo komt een onbruikbaar
  // adres eruit als invoerfout en niet als een verhaal over te veel deelnemers.
  const validatie=fn.body.indexOf("invalid_participant_email");
  const telling=fn.body.indexOf("into nog_te_plaatsen");
  const invoegen=fn.body.indexOf("insert into public.tavern_media_participants");
  assert.ok(validatie>-1&&telling>validatie&&invoegen>telling,`validate (${validatie}) then count (${telling}) then insert (${invoegen})`);
});

test("the integration file proves the seat count on a real database",async()=>{
  // De statische test hierboven leest alleen de vorm. Het bewijs dat het klopt komt van de
  // proef die Codex op een wegwerpbranch draait, dus die gevallen moeten er staan.
  const integration=await readFile(path.join(root,"tests/database-integration.sql"),"utf8");
  for(const geval of [
    "een_dubbele_regel_werd_geteld_als_extra_deelnemer",
    "drie_unieke_gasten_pasten_op_twee_stoelen",
    "een_tweede_aanroep_kon_het_weekend_overvullen",
    "een_herhaalde_inzending_was_niet_veilig",
    "een_geweigerde_registratie_plaatste_toch_deelnemers"
  ]){
    assert.ok(integration.includes(geval),`the integration test must cover: ${geval}`);
  }
  assert.match(integration,/^rollback;$/m,"every fixture must be rolled back");
});

test("this migration leaves the payment gate and the media switch alone",()=>{
  // Het hardenen van de search_path mag niets opengooien.
  for(const forbidden of ["TAVERN_PAYMENTS_ENABLED","PUBLISHED_TERMS_VERSION","TAVERN_MEDIA_CONSENT_ENABLED","MEDIA_AGREEMENT_VERSION"]){
    assert.ok(!migration.includes(forbidden),`the migration may not touch ${forbidden}`);
  }
  assert.doesNotMatch(migration,/stripe/i);
});

// ---------------------------------------------------------------- de operator-flow

test("only the operator can put a participant into the system",async()=>{
  // Robert koos op 1 september 2026 de operator-flow: geen publieke route waarlangs iemand
  // de naam en het e-mailadres van een ander kan invoeren. Dat is hier de hoofdregel.
  const publicRoutes=await readFile(path.join(root,"_redirects"),"utf8");
  const apiRoutes=[...publicRoutes.matchAll(/^\/api\/(\S+)\s+\/\.netlify\/functions\/(\S+)/gm)].map(match=>match[2]);
  for(const name of apiRoutes){
    const source=await readFile(path.join(root,"netlify/functions",`${name}.mjs`),"utf8");
    assert.ok(!source.includes("register_tavern_media_participants"),`${name} exposes participant registration to the web`);
    assert.ok(!source.includes("revoke_tavern_media_participant_link"),`${name} exposes link revocation to the web`);
    assert.ok(!source.includes("get_tavern_media_progress"),`${name} exposes the progress counter to the web`);
  }
  // Ze bestaan wél, en alleen het operatorscript roept ze aan.
  const operator=await readFile(path.join(root,"scripts/media-participants.mjs"),"utf8");
  for(const call of ["register_tavern_media_participants","revoke_tavern_media_participant_link","get_tavern_media_progress"]){
    assert.ok(operator.includes(call),`the operator script must be able to call ${call}`);
  }
});

test("the operator script writes nothing without --commit and an open gate",async()=>{
  const operator=await readFile(path.join(root,"scripts/media-participants.mjs"),"utf8");
  // Twee remmen op elke schrijfactie. Lezen mag wel: zonder lijst kan de operator geen link
  // opnieuw uitgeven.
  assert.match(operator,/const commit=args\.includes\("--commit"\)/);
  assert.match(operator,/gateOrExit\("register participants"\)/);
  assert.match(operator,/gateOrExit\("revoke a link"\)/);
  const registerBlock=operator.slice(operator.indexOf('if(command==="register")'),operator.indexOf('if(command==="revoke")'));
  assert.ok(registerBlock.indexOf("gateOrExit")<registerBlock.indexOf("rpc("),"the gate must come before the write");
  assert.match(registerBlock,/if\(!commit\)\{[\s\S]*?Nothing was written/);
});

test("a participant link opens one record and cannot reach another",async()=>{
  const migration=await readFile(path.join(root,"database/filming-consent.sql"),"utf8");
  // Elke deelnemersfunctie zoekt op de tokenhash, niet op iets wat de bezoeker kan kiezen.
  for(const fn of ["get_tavern_media_agreement_state","record_tavern_media_consent","withdraw_tavern_media_consent"]){
    const body=migration.slice(migration.indexOf(`function public.${fn}`),migration.indexOf(`revoke all on function public.${fn}`));
    assert.match(body,/where invitation_token_hash=p_token_hash/,`${fn} must look the participant up by token hash`);
    assert.ok(!/p_participant_id/.test(body),`${fn} may not accept a participant id from the caller`);
  }
  // En er is geen functie die een deelnemer een lijst van anderen teruggeeft.
  const state=migration.slice(migration.indexOf("function public.get_tavern_media_agreement_state"),migration.indexOf("revoke all on function public.get_tavern_media_agreement_state"));
  for(const leak of ["claim_id=claim.id","from public.tavern_media_participants where claim_id"]){
    assert.ok(!state.includes(leak),`the participant view may not select by claim: ${leak}`);
  }
});

test("the operator can revoke a link without holding the token",async()=>{
  const migration=await readFile(path.join(root,"database/filming-consent.sql"),"utf8");
  // De scriptvariant eist de hash als veiligheidscontrole. Een operator die een kwijtgeraakte
  // link intrekt heeft die niet, en hoeft hem ook niet te hebben.
  assert.match(migration,/create or replace function public\.revoke_tavern_media_participant_link\(p_participant_id uuid\)/);
  assert.match(migration,/revoke all on function public\.revoke_tavern_media_participant_link\(uuid\) from public, anon, authenticated;/);
  assert.match(migration,/grant execute on function public\.revoke_tavern_media_participant_link\(uuid\) to service_role;/);
  const body=migration.slice(migration.indexOf("function public.revoke_tavern_media_participant_link"),migration.indexOf("revoke all on function public.revoke_tavern_media_participant_link"));
  // Intrekken van een link is niet hetzelfde als intrekken van een keuze.
  assert.ok(!body.includes("tavern_media_consents"),"revoking a link may not touch the recorded consent");
  assert.match(body,/'status','no_active_link'/,"revoking twice must be safe");
  // En daarna kan er opnieuw uitgegeven worden: de hash wordt leeggemaakt, niet vastgezet.
  assert.match(body,/set invitation_token_hash=null/);
});

test("the progress counter is an operator call with no token and no names",async()=>{
  const migration=await readFile(path.join(root,"database/filming-consent.sql"),"utf8");
  assert.match(migration,/create or replace function public\.get_tavern_media_progress\(p_claim_id uuid,p_agreement_version text\)/);
  const body=migration.slice(migration.indexOf("function public.get_tavern_media_progress(p_claim_id"),migration.indexOf("revoke all on function public.get_tavern_media_progress"));
  assert.ok(!body.includes("token"),"the counter needs no token in the operator flow");
  for(const leak of ["full_name","email"])assert.ok(!body.includes(leak),`the counter may not return ${leak}`);
  assert.match(body,/'expected',claim\.party_size,'total',totaal,'completed',afgerond/);
  // De weggevallen kolommen zijn echt weg, niet alleen ongebruikt.
  assert.ok(!migration.includes("media_progress_token_hash"),"the unused progress column must be gone");
  assert.ok(!migration.includes("media_progress_expires_at"),"the unused progress expiry must be gone");
});

test("a raw token never reaches a screen, a log or a shell history",async()=>{
  // De ruwe token bestaat maar op twee plekken: kort in het geheugen van het script, en in
  // de link in de mail. Zodra hij in een console-regel belandt staat hij in de scrollback en
  // in het logbestand van wie het script draait, en dan is de link niet meer persoonlijk.
  const invitations=await readFile(path.join(root,"scripts/issue-media-agreements.mjs"),"utf8");
  const operator=await readFile(path.join(root,"scripts/media-participants.mjs"),"utf8");
  for(const [name,source] of [["issue-media-agreements",invitations],["media-participants",operator]]){
    for(const [line] of source.matchAll(/console\.(?:log|error)\([^\n]*/g)){
      assert.ok(!/\$\{token\}|\$\{link\}|\$\{rawToken\}/.test(line),`${name} prints a raw token or link: ${line.slice(0,90)}`);
    }
  }
  // En het operatorscript kent de ruwe token helemaal niet: het maakt er geen aan en krijgt
  // er geen terug. Alleen het uitnodigingsscript raakt hem aan, en geeft hem door aan de mail.
  assert.ok(!operator.includes("randomBytes"),"the operator tool has no business minting tokens");
  assert.match(invitations,/const link=`\$\{origin\}\/tavern\/filming-agreement\/\?token=\$\{encodeURIComponent\(token\)\}`/);
  // De database ziet nooit meer dan de hash.
  assert.match(invitations,/p_token_hash:hash/);
  assert.ok(!/p_token:\s*token/.test(invitations),"a raw token may never be sent to the database");
});

test("the eight cases Robert listed are each proven somewhere",async()=>{
  // Deze test is een inhoudsopgave. Hij valt om zodra een van de acht gevallen uit de proef
  // verdwijnt, ook als de rest blijft draaien.
  const integration=await readFile(path.join(root,"tests/database-integration.sql"),"utf8");
  const cases={
    "dubbele deelnemer":"dezelfde_deelnemer_kreeg_twee_rijen",
    "te veel deelnemers":"drie_unieke_gasten_pasten_op_twee_stoelen",
    "verlopen token":"een_verlopen_link_werd_niet_geweigerd",
    "ingetrokken token":"een_door_de_operator_ingetrokken_link_werkte_nog",
    "onbekende token":"een_ingetrokken_link_werkte_nog",
    "token van A voor B":"de_token_van_a_opende_het_record_van_iemand_anders",
    "opnieuw uitgeven":"na_intrekken_kon_er_geen_nieuwe_link_worden_uitgegeven",
    "geen gedeeltelijke opslag":"een_geweigerde_registratie_plaatste_toch_deelnemers"
  };
  for(const [label,marker] of Object.entries(cases)){
    assert.ok(integration.includes(marker),`the integration test no longer covers: ${label}`);
  }
  // Elk blok draait binnen een transactie die wordt teruggedraaid. Tellen, niet matchen: er
  // staan twee blokken in dit bestand, en met alleen `assert.match` zou een `commit;` in het
  // ene blok wegvallen tegen de `rollback;` van het andere. Die fout zat hier eerst in.
  const begins=(integration.match(/^begin;$/gm)||[]).length;
  const rollbacks=(integration.match(/^rollback;$/gm)||[]).length;
  assert.ok(begins>0,"the integration test must open a transaction");
  assert.equal(rollbacks,begins,`every one of the ${begins} blocks must end in a rollback`);
  assert.doesNotMatch(integration,/^commit;$/m,"a fixture may never be committed");
});
