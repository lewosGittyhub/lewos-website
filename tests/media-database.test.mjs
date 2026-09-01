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

test("this migration leaves the payment gate and the media switch alone",()=>{
  // Het hardenen van de search_path mag niets opengooien.
  for(const forbidden of ["TAVERN_PAYMENTS_ENABLED","PUBLISHED_TERMS_VERSION","TAVERN_MEDIA_CONSENT_ENABLED","MEDIA_AGREEMENT_VERSION"]){
    assert.ok(!migration.includes(forbidden),`the migration may not touch ${forbidden}`);
  }
  assert.doesNotMatch(migration,/stripe/i);
});
