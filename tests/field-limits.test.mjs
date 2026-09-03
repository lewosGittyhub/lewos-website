import assert from "node:assert/strict";
import {after,before,beforeEach,test} from "node:test";
import http from "node:http";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {listenOnTestPort,stopTestServer} from "./_test-server.mjs";
import {FIELD_LIMITS,NAME_MIN} from "../netlify/functions/_field-limits.mjs";

// Robert, 2 september 2026: elke grens die een gast kan raken moet zichtbaar zijn, overal
// hetzelfde betekenen, en nooit stilzwijgend tekst weggooien. Het berichtveld draagt
// allergieën en dieetwensen; daar is stil afkappen het schadelijkst.
const root=path.resolve(import.meta.dirname,"..");
const lees=p=>readFile(path.join(root,p),"utf8");

let rpcBodies=[];
let mailBodies=[];
let server;let base;
const nativeFetch=globalThis.fetch;

before(async()=>{
  server=http.createServer((request,response)=>{
    let body="";
    request.on("data",c=>body+=c);
    request.on("end",()=>{
      response.setHeader("content-type","application/json");
      if(request.url==="/rest/v1/rpc/check_tavern_request_limit")return response.end("true");
      if(request.url==="/rest/v1/rpc/register_tavern_interest"){
        rpcBodies.push(JSON.parse(body));
        return response.end(JSON.stringify({status:"first_access_held",claimId:"00000000-0000-4000-8000-000000000001",weekendLabel:"Weekend 01 · 30 Oct to 2 Nov 2026",seats:1,remaining:5}));
      }
      if(request.url==="/emails"){mailBodies.push(JSON.parse(body));return response.end(JSON.stringify({id:"email-1"}));}
      response.statusCode=404;response.end("{}");
    });
  });
  await listenOnTestPort(server);
  base=`http://127.0.0.1:${server.address().port}`;
  globalThis.fetch=(input,options)=>{
    const url=String(input);
    if(url.startsWith("https://api.resend.com/"))return nativeFetch(`${base}/emails`,options);
    if(url.startsWith(base))return nativeFetch(input,options);
    return Promise.reject(new Error(`test_reached_the_network: ${url}`));
  };
});
after(async()=>{globalThis.fetch=nativeFetch;await stopTestServer(server);server=null;});
beforeEach(()=>{
  rpcBodies=[];
  mailBodies=[];
  process.env.SUPABASE_URL=base;
  process.env.SUPABASE_SERVICE_ROLE_KEY="test-service-key";
  process.env.RATE_LIMIT_SECRET="a-long-random-test-secret";
  process.env.URL=base;
  process.env.PUBLIC_BOOKING_OPENS_AT="2099-01-01T00:00:00Z";
  process.env.RESEND_API_KEY="test-resend-key";
  process.env.TAVERN_FROM_EMAIL="The Lewos Tavern <tavern@example.invalid>";
});

const post=body=>({httpMethod:"POST",headers:{"content-type":"application/json",accept:"application/json"},body:JSON.stringify(body)});
const basis={name:"Robert",email:"robert@example.invalid",weekend:"weekend-01",people:1,consent:"agreed","bot-field":""};

// ── 1. Eén bron, twee bestanden ────────────────────────────────────────────────
test("de browser en de server hanteren exact dezelfde getallen",async()=>{
  const client=await lees("assets/field-limits.js");
  const gevonden=client.match(/var LIMITS=\{([^}]*)\}/);
  assert.ok(gevonden,"assets/field-limits.js declareert geen LIMITS-object");
  const uitClient=Object.fromEntries(gevonden[1].split(",").map(paar=>{
    const [veld,waarde]=paar.split(":");
    return [veld.trim(),Number(waarde)];
  }));
  assert.deepEqual(uitClient,FIELD_LIMITS,"client en server lopen uit elkaar");
});

// ── 2. Onder, exact op, en boven de grens ──────────────────────────────────────
test("een bericht onder de grens komt volledig aan",async()=>{
  const {handler}=await import("../netlify/functions/first-access.mjs");
  const bericht="Ik ben allergisch voor noten.".padEnd(FIELD_LIMITS.message-1,".");
  const result=await handler(post({...basis,message:bericht}));
  assert.equal(result.statusCode,200);
  assert.equal(rpcBodies[0].p_message,bericht,"de tekst is onderweg veranderd");
});

test("een bericht exact op de grens komt volledig aan",async()=>{
  const {handler}=await import("../netlify/functions/first-access.mjs");
  const bericht="a".repeat(FIELD_LIMITS.message);
  const result=await handler(post({...basis,message:bericht}));
  assert.equal(result.statusCode,200,"exact op de grens hoort te worden geaccepteerd");
  assert.equal(rpcBodies[0].p_message.length,FIELD_LIMITS.message);
  assert.equal(rpcBodies[0].p_message,bericht,"er is een teken verdwenen op de grens");
});

test("een bericht boven de grens wordt geweigerd en niet afgekapt",async()=>{
  const {handler}=await import("../netlify/functions/first-access.mjs");
  const bericht="a".repeat(FIELD_LIMITS.message+1);
  const result=await handler(post({...basis,message:bericht}));
  assert.equal(result.statusCode,400);
  const body=JSON.parse(result.body);
  assert.equal(body.error,"field_too_long");
  assert.deepEqual(body.fields,[{field:"message",limit:FIELD_LIMITS.message,length:FIELD_LIMITS.message+1}]);
  assert.equal(rpcBodies.length,0,"een te lang bericht mag de database niet bereiken");
});

test("een te lange naam of e-mail wordt net zo geweigerd",async()=>{
  const {handler}=await import("../netlify/functions/first-access.mjs");
  for(const [veld,grens] of [["name",FIELD_LIMITS.name],["email",FIELD_LIMITS.email]]){
    const waarde=veld==="email"?"a".repeat(grens-12)+"@example.invalid":"a".repeat(grens+1);
    const result=await handler(post({...basis,[veld]:waarde}));
    assert.equal(result.statusCode,400,`${veld} boven de grens werd geaccepteerd`);
    assert.equal(JSON.parse(result.body).error,"field_too_long");
  }
  assert.equal(rpcBodies.length,0);
});

// ── 3. Geen stille bewerkingen meer ────────────────────────────────────────────
test("geen enkele functie kapt gasttekst stilzwijgend af",async()=>{
  for(const bestand of ["netlify/functions/first-access.mjs","netlify/functions/create-checkout-session.mjs","netlify/functions/media-consent.mjs"]){
    const bron=await lees(bestand);
    const regels=bron.split("\n").filter(r=>/\.slice\(0\s*,/.test(r)&&!r.trim().startsWith("//"));
    // media-consent mag een tokenhash inkorten voor een snelheidssleutel; dat is geen
    // gasttekst en gaat nergens heen.
    const verdacht=regels.filter(r=>!/tokenHash\(/.test(r));
    assert.deepEqual(verdacht,[],`${bestand} kapt nog tekst af:\n${verdacht.join("\n")}`);
  }
});

// ── 4. Zichtbaar in de HTML: maxlength, teller, en de grens in tekst ───────────
const paginas=[
  ["tavern/index.html",["name","email","message"]],
  ["tavern/private/index.html",["name","email","when","idea"]],
  ["tavern/book/index.html",["name","email"]],
  ["contact/index.html",["name","email","question"]]
];

test("elk invoerveld dat een gast vult draagt een bekende grens",async()=>{
  for(const [pagina,velden] of paginas){
    const html=await lees(pagina);
    for(const veld of velden){
      assert.match(html,new RegExp(`data-limit="${veld}"`),`${pagina} mist data-limit="${veld}"`);
      assert.ok(FIELD_LIMITS[veld],`${veld} heeft geen grens in _field-limits.mjs`);
    }
    assert.match(html,/assets\/field-limits\.js/,`${pagina} laadt het grensscript niet`);
  }
});

test("elk vrij tekstveld heeft een data-limit; er blijft er geen ongedekt", async()=>{
  for(const [pagina] of paginas){
    const html=await lees(pagina);
    const velden=html.match(/<(?:input|textarea)[^>]*>/g)||[];
    for(const veld of velden){
      const vrijeTekst=/<textarea/.test(veld)||/type="text"/.test(veld)||/type="email"/.test(veld)||(/<input/.test(veld)&&!/type=/.test(veld));
      const uitgezonderd=/bot-field/.test(veld)||/type="hidden"/.test(veld)||/readonly/.test(veld);
      if(!vrijeTekst||uitgezonderd)continue;
      assert.match(veld,/data-limit="/,`${pagina}: dit veld heeft geen grens: ${veld.slice(0,110)}`);
    }
  }
});

test("het script zet een maxlength en een zichtbare teller neer",async()=>{
  const client=await lees("assets/field-limits.js");
  assert.match(client,/setAttribute\("maxlength"/,"het script zet geen maxlength");
  assert.match(client,/lengte\+" \/ "\+grens/,"er is geen teller in de vorm 120 / 2000");
  assert.match(client,/dataset\.state=/,"de teller geeft niet aan wanneer hij vol raakt");
  const css=await lees("tavern/index.html");
  assert.match(css,/\.field-count\[data-state="over"\]/,"er is geen opmaak voor een volle teller");
  assert.doesNotMatch(client,/\.slice\(0\s*,/,"het browserscript kapt tekst af");
});

test("de grens staat ook als tekst voor een schermlezer",async()=>{
  const client=await lees("assets/field-limits.js");
  assert.match(client,/Maximum "\+grens\+" characters\./);
  assert.match(client,/aria-describedby/,"de grens wordt niet aan het veld gekoppeld");
});

// ── 5. Duidelijke foutmelding vóór verzending ─────────────────────────────────
test("de browser weigert verzenden en noemt het veld bij naam",async()=>{
  const client=await lees("assets/field-limits.js");
  assert.match(client,/event\.preventDefault\(\)/,"verzenden wordt niet tegengehouden");
  assert.match(client,/characters too long/,"de melding zegt niet hoeveel te veel");
  assert.match(client,/reportValidity\(\)/,"de melding wordt niet getoond");
});

test("elke pagina met een eigen script vertaalt field_too_long naar gewone taal",async()=>{
  for(const script of ["tavern/first-access.js","tavern/private/private.js","tavern/book/booking.js"]){
    const bron=await lees(script);
    assert.match(bron,/field_too_long/,`${script} kent de foutcode niet`);
    assert.match(bron,/longer than we can store/,`${script} legt de fout niet uit aan de gast`);
  }
});

// ── 6. Geen dataverlies bij de samengestelde velden van de privépagina ────────
test("de privépagina plakt twee velden samen en blijft binnen de berichtgrens",async()=>{
  assert.ok(FIELD_LIMITS.when+FIELD_LIMITS.idea+"When: \n\n".length<=FIELD_LIMITS.message,
    "when + idea passen samen niet in message; een gast zou tekst verliezen");
  const bron=await lees("tavern/private/private.js");
  assert.match(bron,/LEWOS_FIELD_LIMITS/,"private.js controleert de samengestelde grens niet");
  assert.match(bron,/nothing has been sent yet/,"private.js zegt niet dat er niets verstuurd is");
});

// ── 7. De ondergrens blijft bestaan ───────────────────────────────────────────
test("een naam van één teken wordt nog steeds geweigerd",async()=>{
  const {handler}=await import("../netlify/functions/first-access.mjs");
  const result=await handler(post({...basis,name:"R"}));
  assert.equal(result.statusCode,400);
  assert.equal(JSON.parse(result.body).error,"invalid_details");
  assert.equal(NAME_MIN,2);
});

// ── 8. Allergieën en dieetwensen staan apart, niet in het berichtveld ─────────
// Robert, 2 september 2026: belangrijke informatie mag niet verborgen raken in één
// algemeen berichtveld. Deze tests bewaken dat ze een eigen veld, een eigen kolom en
// een eigen weg naar de operator houden.

test("allergieën en dieetwensen hebben een eigen veld op beide formulieren",async()=>{
  for(const pagina of ["tavern/index.html","tavern/private/index.html"]){
    const html=await lees(pagina);
    for(const veld of ["allergies","dietary"]){
      assert.match(html,new RegExp(`name="${veld}"`),`${pagina} mist een eigen veld voor ${veld}`);
      assert.match(html,new RegExp(`data-limit="${veld}"`),`${pagina}: ${veld} heeft geen zichtbare grens`);
    }
    // Het oude berichtveld mag ze niet meer als zijn taak opeisen.
    assert.doesNotMatch(html,/placeholder="Allergies, dietary needs/,`${pagina} stuurt allergieën nog naar het berichtveld`);
  }
});

test("de privépagina plakt allergieën niet in het bericht",async()=>{
  const bron=await lees("tavern/private/private.js");
  const payload=bron.slice(bron.indexOf("const payload="),bron.indexOf("submit.disabled=true"));
  assert.match(payload,/allergies:String\(data\.allergies/,"allergies gaat niet als eigen veld mee");
  assert.match(payload,/dietary:String\(data\.dietary/,"dietary gaat niet als eigen veld mee");
  const bericht=payload.slice(payload.indexOf("message:"));
  for(const verboden of ["allergies","dietary"]){
    assert.doesNotMatch(bericht,new RegExp(verboden),`${verboden} wordt in het samengestelde bericht geplakt`);
  }
});

test("beide velden komen als eigen parameter bij de database aan",async()=>{
  const {handler}=await import("../netlify/functions/first-access.mjs");
  const result=await handler(post({...basis,allergies:"Severe peanut allergy, carries an EpiPen",dietary:"Vegetarian",message:"We arrive late on Friday."}));
  assert.equal(result.statusCode,200);
  assert.equal(rpcBodies[0].p_allergies,"Severe peanut allergy, carries an EpiPen");
  assert.equal(rpcBodies[0].p_dietary,"Vegetarian");
  assert.equal(rpcBodies[0].p_message,"We arrive late on Friday.","het bericht is vervuild met de andere velden");
});

test("een allergie exact op de grens komt volledig aan, erboven wordt geweigerd",async()=>{
  const {handler}=await import("../netlify/functions/first-access.mjs");
  const opGrens="p".repeat(FIELD_LIMITS.allergies);
  assert.equal((await handler(post({...basis,allergies:opGrens}))).statusCode,200);
  assert.equal(rpcBodies[0].p_allergies,opGrens,"er is een teken van de allergie verdwenen");
  rpcBodies.length=0;
  const teLang=await handler(post({...basis,allergies:"p".repeat(FIELD_LIMITS.allergies+1)}));
  assert.equal(teLang.statusCode,400);
  const body=JSON.parse(teLang.body);
  assert.equal(body.error,"field_too_long");
  assert.deepEqual(body.fields,[{field:"allergies",limit:FIELD_LIMITS.allergies,length:FIELD_LIMITS.allergies+1}]);
  assert.equal(rpcBodies.length,0,"een te lange allergie mag de database niet bereiken");
});

test("de database bewaart ze in eigen kolommen met een eigen grens",async()=>{
  const migratie=await lees("database/first-access.sql");
  assert.match(migratie,/add column if not exists allergies text;/,"geen idempotente kolom voor allergieën");
  assert.match(migratie,/add column if not exists dietary_requirements text;/,"geen idempotente kolom voor dieetwensen");
  for(const naam of ["tavern_seat_claims_allergies_length","tavern_seat_claims_dietary_length"]){
    assert.match(migratie,new RegExp(`conname='${naam}'`),`${naam} wordt niet idempotent toegevoegd`);
    assert.match(migratie,new RegExp(`add constraint ${naam} check`),`${naam} bestaat niet`);
  }
  // De grens in de database is dezelfde als die de gast ziet.
  const checks=migratie.match(/char_length\((?:allergies|dietary_requirements)\)<=(\d+)/g)||[];
  assert.equal(checks.length,2,"niet allebei de kolommen hebben een lengtecheck");
  for(const check of checks)assert.ok(check.endsWith(`<=${FIELD_LIMITS.allergies}`),`${check} wijkt af van de gedeelde grens`);
  assert.match(migratie,/raise exception 'invalid_allergies'/,"de functie weigert een te lange allergie niet");
  assert.match(migratie,/raise exception 'invalid_dietary'/,"de functie weigert een te lange dieetwens niet");
});

test("bestaande aanvragen blijven werken en bestaande berichten blijven staan",async()=>{
  const migratie=await lees("database/first-access.sql");
  // Geen not null en geen default: bestaande rijen worden null en niets wordt herschreven.
  assert.doesNotMatch(migratie,/add column if not exists allergies text not null/,"bestaande rijen zouden de migratie breken");
  assert.doesNotMatch(migratie,/add column if not exists dietary_requirements text not null/,"idem");
  assert.doesNotMatch(migratie,/update public\.tavern_seat_claims set message/,"de migratie herschrijft bestaande berichten");
  // De nieuwe parameters hebben een default, dus een oude aanroep zonder die twee werkt nog.
  assert.match(migratie,/p_allergies text default null,p_dietary text default null\)/,"de nieuwe parameters zijn niet optioneel");
  // En de oude signatuur wordt opgeruimd, anders blijven er twee functies naast elkaar staan.
  assert.match(migratie,/drop function if exists public\.register_tavern_interest\(text,text,integer,text,text,timestamptz\);/,"de oude signatuur wordt niet opgeruimd");
  const {handler}=await import("../netlify/functions/first-access.mjs");
  assert.equal((await handler(post(basis))).statusCode,200,"een aanvraag zonder de nieuwe velden hoort gewoon te werken");
  assert.equal(rpcBodies[0].p_allergies,"");
});

test("de rechten op de nieuwe signatuur staan nog steeds alleen op service_role",async()=>{
  const migratie=await lees("database/first-access.sql");
  assert.match(migratie,/revoke all on function public\.register_tavern_interest\(text,text,integer,text,text,timestamptz,text,text\) from public, anon, authenticated;/);
  assert.match(migratie,/grant execute on function public\.register_tavern_interest\(text,text,integer,text,text,timestamptz,text,text\) to service_role;/);
  assert.doesNotMatch(migratie,/grant execute on function public\.register_tavern_interest[^;]*to (anon|authenticated|public)/);
});

// Gevonden op 3 september 2026, bij het draaien van de migratie tegen een echte Supabase-
// branch. Lokaal was dit onzichtbaar: kale PostgreSQL kent de Supabase-standaardrechten
// niet, dus daar stond de teller op nul. Op Supabase hadden anon en authenticated alle
// zeven rechten op alle drie de tabellen. Zes daarvan houdt RLS tegen; TRUNCATE niet,
// want TRUNCATE valt buiten row-level security.
test("anon en authenticated hebben geen rechten op de tavern-tabellen",async()=>{
  const migratie=await lees("database/first-access.sql");
  for(const tabel of ["tavern_weekends","tavern_seat_claims","tavern_request_limits"]){
    assert.match(migratie,new RegExp("revoke all on table public\\."+tabel+"\\s+from public, anon, authenticated;"),
      `de tabelrechten op ${tabel} moeten expliciet worden ingetrokken; RLS dekt TRUNCATE niet af`);
    assert.doesNotMatch(migratie,new RegExp("grant [^;]*on table public\\."+tabel+"[^;]*to (anon|authenticated|public)"),
      `${tabel} mag nooit rechten teruggeven aan anon of authenticated`);
  }
  // De intrekking moet ná het aanmaken van de tabellen komen, anders heeft ze geen effect.
  assert.ok(migratie.indexOf("revoke all on table public.tavern_seat_claims")>migratie.indexOf("create table if not exists public.tavern_seat_claims"),
    "de intrekking staat vóór het aanmaken van de tabel en doet dan niets");
});

// ── 9. Een herhaalde aanvraag mag nieuwe allergie-informatie niet weggooien ───
// Gevonden bij de eindcontrole van 2 september 2026: `register_tavern_interest` gaf bij
// een duplicaat meteen de bestaande claim terug en negeerde de meegestuurde velden. Wie
// terugkwam omdat hij zijn allergie vergeten was, raakte die dus stil kwijt — precies het
// geval waarvoor deze hele wijziging bestaat.

test("een duplicaat werkt allergie, dieet en bericht bij zonder ze te kunnen wissen",async()=>{
  const migratie=await lees("database/first-access.sql");
  const functie=migratie.slice(migratie.indexOf("function public.register_tavern_interest"),migratie.indexOf("revoke all on function public.register_tavern_interest"));
  const duplicaten=functie.match(/'duplicate',true/g)||[];
  assert.equal(duplicaten.length,4,"er zijn niet vier duplicaatpaden meer");
  assert.equal((functie.match(/'detailsUpdated',details_bijgewerkt/g)||[]).length,4,"niet elk duplicaatpad meldt of het iets heeft bijgewerkt");
  assert.equal((functie.match(/update public\.tavern_seat_claims set/g)||[]).length,4,"niet elk duplicaatpad slaat de nieuwe gegevens op");
  // coalesce zorgt dat een leeg veld nooit iets wist wat er al stond.
  for(const kolom of ["allergies","dietary_requirements","message"]){
    const patroon=new RegExp(`${kolom}=coalesce\\(nullif\\(trim\\(p_\\w+\\),''\\),${kolom}\\)`,"g");
    assert.equal((functie.match(patroon)||[]).length,4,`${kolom} kan door een lege inzending gewist worden`);
  }
});

test("de bijwerking staat binnen 'if found' en raakt geen andere functie",async()=>{
  const migratie=await lees("database/first-access.sql");
  // Buiten register_tavern_interest mag de vlag niet bestaan: confirm_tavern_payment heeft
  // ook een 'duplicate',true maar kent existing_claim niet en zou stukgaan.
  const anderen=migratie.split("function public.register_tavern_interest")[0]+migratie.split("revoke all on function public.register_tavern_interest")[1];
  assert.doesNotMatch(anderen,/details_bijgewerkt/,"de vlag lekt naar een functie die hem niet kent");
  const functie=migratie.slice(migratie.indexOf("function public.register_tavern_interest"),migratie.indexOf("revoke all on function public.register_tavern_interest"));
  for(const stuk of functie.split("details_bijgewerkt:=").slice(1)){
    const ervoor=functie.slice(0,functie.indexOf(stuk));
    assert.ok(ervoor.trimEnd().endsWith("--")||/if found then[\s\S]*$/.test(ervoor.slice(-400)),"de bijwerking staat buiten een 'if found'-tak");
  }
});

test("de pagina vertelt de gast dat zijn nieuwe gegevens zijn opgeslagen",async()=>{
  for(const script of ["tavern/first-access.js","tavern/private/private.js"]){
    const bron=await lees(script);
    assert.match(bron,/detailsUpdated/,`${script} negeert de bijwerking`);
    assert.match(bron,/Nothing you wrote has been lost\./,`${script} stelt de gast niet gerust`);
    assert.match(bron,/including any allergies and dietary requirements/,`${script} noemt niet wat er is bijgewerkt`);
  }
});

test("een duplicaat stuurt geen tweede ontvangstbevestiging",async()=>{
  // Robert: geen dubbele e-mails. De functie mailt alleen als de claim er nog geen had.
  const bron=await lees("netlify/functions/first-access.mjs");
  assert.match(bron,/let emailSent=result\.receiptEmailSent===true;/,"de al-verstuurd-vlag wordt niet gelezen");
  assert.match(bron,/if\(!emailSent&&result\.claimId\)/,"er wordt gemaild zonder die vlag te controleren");
  assert.match(bron,/idempotency-key["'`:\s]+.*first-access-receipt-\$\{result\.claimId\}/,"de mail heeft geen idempotentiesleutel per claim");
});

// ── 10. Randgevallen die ik bij de eindcontrole heb nagelopen ────────────────

test("lege, ontbrekende en witruimte-velden leveren niets op en breken niets",async()=>{
  const {handler}=await import("../netlify/functions/first-access.mjs");
  for(const extra of [{},{allergies:"",dietary:""},{allergies:"   ",dietary:"\t\n "}]){
    rpcBodies.length=0;
    const result=await handler(post({...basis,...extra}));
    assert.equal(result.statusCode,200,`${JSON.stringify(extra)} werd geweigerd`);
    assert.equal(rpcBodies[0].p_allergies,"","witruimte belandt als tekst in de database");
    assert.equal(rpcBodies[0].p_dietary,"");
  }
});

test("de database maakt van een lege waarde null en niet een lege tekst",async()=>{
  const migratie=await lees("database/first-access.sql");
  const functie=migratie.slice(migratie.indexOf("function public.register_tavern_interest"),migratie.indexOf("revoke all on function public.register_tavern_interest"));
  // Per statement controleren in plaats van een totaal tellen: een totaal verschuift zodra
  // er ergens een regel bij komt, en dan bewijst de test niets meer.
  const inserts=functie.split("insert into public.tavern_seat_claims").slice(1).map(blok=>blok.slice(0,blok.indexOf(";")));
  assert.equal(inserts.length,4,"er zijn geen vier inserts meer");
  for(const insert of inserts){
    assert.match(insert,/nullif\(trim\(p_allergies\),''\)/,"een insert schrijft een lege allergie als lege tekst");
    assert.match(insert,/nullif\(trim\(p_dietary\),''\)/,"een insert schrijft een lege dieetwens als lege tekst");
  }
  const updates=functie.split("update public.tavern_seat_claims set").slice(1).map(blok=>blok.slice(0,blok.indexOf(";")));
  assert.equal(updates.length,4,"er zijn geen vier bijwerkingen meer");
  for(const update of updates){
    assert.match(update,/allergies=coalesce\(nullif\(trim\(p_allergies\),''\),allergies\)/,"een bijwerking kan de allergie wissen");
    assert.match(update,/dietary_requirements=coalesce\(nullif\(trim\(p_dietary\),''\),dietary_requirements\)/,"een bijwerking kan de dieetwens wissen");
  }
});

// ── 11. De e-mail, in beide formaten, met de echte payload ───────────────────
// Robert, 2 september 2026: regeleindes moeten blijven staan, niets mag samenvloeien,
// en er mag geen HTML- of header-injectie mogelijk zijn. Deze tests lezen de payload
// die daadwerkelijk naar Resend gaat, niet de broncode.

const stuur=async extra=>{
  const {handler}=await import("../netlify/functions/first-access.mjs");
  const result=await handler(post({...basis,...extra}));
  assert.equal(result.statusCode,200,`de aanvraag werd geweigerd: ${result.body}`);
  assert.equal(mailBodies.length,1,"er ging geen of meer dan één mail uit");
  return mailBodies[0];
};

test("elke mail draagt zowel een HTML- als een tekstversie",async()=>{
  const mail=await stuur({allergies:"Peanuts"});
  assert.ok(mail.html,"er is geen HTML-versie");
  assert.ok(mail.text,"er is geen tekstversie — een postvak zonder HTML ziet de allergie dan niet");
  assert.match(mail.text,/Allergies:\n {2}Peanuts/,"de tekstversie noemt de allergie niet onder een kopje");
});

test("één regel komt in beide formaten ongewijzigd aan",async()=>{
  const mail=await stuur({allergies:"Peanut allergy"});
  assert.match(mail.html,/<strong>Allergies:<\/strong><br>Peanut allergy<\/li>/);
  assert.match(mail.text,/Allergies:\n {2}Peanut allergy/);
});

test("meerdere regels blijven afzonderlijk leesbaar en vloeien niet samen",async()=>{
  const mail=await stuur({allergies:"Peanuts - severe\nShellfish - moderate\nSesame - mild"});
  // HTML: een <br> tussen elke regel, dus niets loopt over.
  assert.match(mail.html,/Peanuts - severe<br>Shellfish - moderate<br>Sesame - mild/);
  assert.doesNotMatch(mail.html,/severe\s*Shellfish/,"twee regels zijn samengevloeid in de HTML");
  // Tekst: echte regeleindes, elke regel ingesprongen onder zijn kopje.
  assert.match(mail.text,/Allergies:\n {2}Peanuts - severe\n {2}Shellfish - moderate\n {2}Sesame - mild/);
  for(const regel of ["Peanuts - severe","Shellfish - moderate","Sesame - mild"]){
    assert.ok(mail.text.includes(regel)&&mail.html.includes(regel),`${regel} is verdwenen`);
  }
});

test("een lege regel binnen de tekst blijft, maar zonder losse inspringing",async()=>{
  const mail=await stuur({allergies:"Peanuts\n\nShellfish"});
  assert.match(mail.text,/Allergies:\n {2}Peanuts\n\n {2}Shellfish/,"de lege regel draagt spaties of is weg");
  assert.doesNotMatch(mail.text,/\n {2}\n/,"er staat een regel met alleen inspringing");
  assert.match(mail.html,/Peanuts<br><br>Shellfish/);
});

test("een leeg veld levert geen kopje en geen lege regel op",async()=>{
  const mail=await stuur({allergies:"Peanuts",dietary:"",message:"   "});
  assert.doesNotMatch(mail.text,/Dietary requirements:/,"een leeg veld kreeg toch een kopje");
  assert.doesNotMatch(mail.text,/Anything else:/);
  assert.doesNotMatch(mail.html,/Dietary requirements/);
  assert.doesNotMatch(mail.text,/\n\n\n/,"er staan onduidelijke lege regels in de tekstversie");
  // En zonder enig ingevuld veld staat het hele blok er niet.
  mailBodies.length=0;
  const kaal=await stuur({});
  assert.doesNotMatch(kaal.text,/We have noted the following/,"een lege aanvraag kreeg toch een notitieblok");
  assert.doesNotMatch(kaal.html,/We have noted the following/);
});

test("lange maar geldige invoer komt volledig door, in beide formaten",async()=>{
  const lang=Array.from({length:20},(_,i)=>`Line ${i+1} of a long but valid allergy list`).join("\n").slice(0,FIELD_LIMITS.allergies);
  const mail=await stuur({allergies:lang});
  for(const regel of lang.split("\n"))assert.ok(mail.text.includes(regel),`"${regel}" ontbreekt in de tekstversie`);
  assert.equal(mail.html.match(/<br>/g).length>=lang.split("\n").length-1,true,"niet elke regel kreeg een <br>");
});

test("speciale tekens en HTML-achtige tekst worden getoond, niet uitgevoerd",async()=>{
  const gemeen='Sesame & mustard <mild>; "quotes"; O\'Brien; <script>alert(1)</script>';
  const mail=await stuur({allergies:gemeen});
  assert.doesNotMatch(mail.html,/<script>/,"er staat een uitvoerbare scripttag in de mail");
  assert.match(mail.html,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/,"de scripttag is niet zichtbaar als tekst");
  assert.match(mail.html,/Sesame &amp; mustard &lt;mild&gt;/);
  assert.match(mail.html,/&quot;quotes&quot;/);
  assert.match(mail.html,/O&#039;Brien/);
  // De tekstversie is geen HTML en hoort de tekens juist ongewijzigd te tonen.
  assert.ok(mail.text.includes(gemeen),"de tekstversie heeft de invoer veranderd");
});

test("allergieën, dieetwensen en overige opmerkingen staan gescheiden naast elkaar",async()=>{
  const mail=await stuur({allergies:"Peanuts",dietary:"Vegetarian",message:"We arrive late."});
  for(const [kop,waarde] of [["Allergies","Peanuts"],["Dietary requirements","Vegetarian"],["Anything else","We arrive late."]]){
    assert.ok(mail.text.includes(`${kop}:\n  ${waarde}`),`${kop} staat niet als eigen kopje in de tekstversie`);
    assert.ok(mail.html.includes(`<strong>${kop}:</strong><br>${waarde}`),`${kop} staat niet als eigen punt in de HTML`);
  }
  assert.doesNotMatch(mail.text,/Peanuts *Vegetarian/,"twee velden zijn samengevoegd zonder scheiding");
  assert.equal((mail.html.match(/<li>/g)||[]).length,3,"de drie velden staan niet als drie punten");
});

test("geen header-injectie: vrije tekst komt nooit in een kopregel terecht",async()=>{
  const mail=await stuur({allergies:"Peanuts\nBcc: iemand@elders.invalid",message:"Subject: overschreven"});
  assert.deepEqual(mail.to,[basis.email],"het ontvangstadres is gewijzigd");
  assert.doesNotMatch(mail.subject,/Bcc|Subject:|\n|\r/,"de onderwerpregel draagt vrije tekst of een regeleinde");
  assert.equal(mail.reply_to,"lewos.co@gmail.com");
  // De tekst zelf mag er gewoon in staan; het gaat erom dat hij in de body blijft.
  assert.match(mail.text,/ {2}Bcc: iemand@elders\.invalid/);
});

// ── 12. Het boekingspad en de operatorweergave ───────────────────────────────

test("de boekingspagina heeft dezelfde drie velden met dezelfde grenzen",async()=>{
  const html=await lees("tavern/book/index.html");
  for(const veld of ["allergies","dietary","message"]){
    assert.match(html,new RegExp(`name="${veld}"`),`tavern/book/ mist een veld voor ${veld}`);
    assert.match(html,new RegExp(`data-limit="${veld}"`),`tavern/book/: ${veld} heeft geen zichtbare grens`);
  }
  assert.match(html,/assets\/field-limits\.js/,"tavern/book/ laadt het grensscript niet");
});

test("de boekingspagina stuurt ze apart mee, niet samengevoegd",async()=>{
  const bron=await lees("tavern/book/booking.js");
  const input=bron.slice(bron.indexOf("const input="),bron.indexOf("try{"));
  for(const veld of ["allergies","dietary","message"]){
    assert.match(input,new RegExp(`${veld}:form\\.elements\\.${veld}\\.value`),`${veld} gaat niet als eigen veld mee`);
  }
  assert.doesNotMatch(input,/message:.*allergies|allergies.*\+.*dietary/,"velden worden samengeplakt");
});

test("begin_tavern_checkout bewaart ze in dezelfde kolommen en weigert te lange invoer",async()=>{
  const migratie=await lees("database/first-access.sql");
  const functie=migratie.slice(migratie.indexOf("function public.begin_tavern_checkout(p_name"),migratie.indexOf("revoke all on function public.begin_tavern_checkout"));
  assert.match(functie,/p_allergies text default null,p_dietary text default null,p_message text default null\)/,"de nieuwe parameters zijn niet optioneel");
  assert.match(functie,/raise exception 'invalid_allergies'/);
  assert.match(functie,/raise exception 'invalid_dietary'/);
  assert.match(functie,/raise exception 'invalid_message'/);
  assert.match(functie,/status,allergies,dietary_requirements,message,consented_at/,"de insert vult de eigen kolommen niet");
  assert.match(functie,/nullif\(trim\(p_allergies\),''\),nullif\(trim\(p_dietary\),''\),nullif\(trim\(p_message\),''\)/);
  // De oude signatuur moet weg, anders staan er twee functies naast elkaar en faalt PostgREST.
  assert.match(migratie,/drop function if exists public\.begin_tavern_checkout\(text,text,integer,text,text,boolean,boolean,text,boolean,timestamptz,integer\);/);
  for(const woord of ["revoke all on function","grant execute on function"]){
    assert.match(migratie,new RegExp(`${woord} public\\.begin_tavern_checkout\\(text,text,integer,text,text,boolean,boolean,text,boolean,timestamptz,integer,text,text,text\\)`),`${woord} staat nog op de oude signatuur`);
  }
});

test("het operator-script leest de drie velden en schrijft nooit iets",async()=>{
  const bron=await lees("scripts/guest-details.mjs");
  assert.doesNotMatch(bron,/method:"(POST|PATCH|PUT|DELETE)"/,"het script schrijft naar de database");
  assert.doesNotMatch(bron,/rpc\//,"het script roept een RPC aan in plaats van te lezen");
  assert.match(bron,/select=name,email,party_size,status,allergies,dietary_requirements,message/,"het script leest niet alle drie de velden");
  assert.match(bron,/ALLERGIES/,"een allergie valt niet op in de uitvoer");
  // Regeleindes van de gast blijven staan in de operatorweergave.
  assert.match(bron,/split\(\/\\r\?\\n\/\)/,"de operatorweergave plet meerregelige tekst");
  // En de waarschuwing over oude aanvragen moet erin blijven.
  assert.match(bron,/before 2 September 2026/,"het script waarschuwt niet over oude aanvragen");
});

test("oude aanvragen zonder de nieuwe velden blijven bruikbaar",async()=>{
  const migratie=await lees("database/first-access.sql");
  // Geen not null, geen default, geen herschrijving van bestaande berichten.
  assert.doesNotMatch(migratie,/add column if not exists (allergies|dietary_requirements) text not null/);
  assert.doesNotMatch(migratie,/update public\.tavern_seat_claims set message=(?!coalesce)/);
  // En het operator-script wijst de operator op die rijen in plaats van ze te verbergen.
  const script=await lees("scripts/guest-details.mjs");
  assert.match(script,/no allergy or dietary field but do have a note/);
});

// ── 13. Het First Access-betaalvenster: aanvullen mag, wissen nooit ──────────

test("de checkoutpagina heeft de drie velden en zegt dat leeg laten niets wist",async()=>{
  const html=await lees("tavern/checkout/index.html");
  for(const veld of ["allergies","dietary","message"]){
    assert.match(html,new RegExp(`data-limit="${veld}"`),`tavern/checkout/ mist een grens voor ${veld}`);
  }
  assert.match(html,/assets\/field-limits\.js/,"tavern/checkout/ laadt het grensscript niet");
  assert.match(html,/Leaving a field empty never erases what you told us before\./,"de gast leest niet dat leeg laten veilig is");
  const bron=await lees("tavern/checkout/checkout.js");
  for(const veld of ["allergies","dietary","message"])assert.match(bron,new RegExp(`${veld}:\\(document\\.querySelector\\("#${veld}"\\)`),`${veld} gaat niet mee`);
});

test("begin_tavern_first_access_checkout vult aan en wist nooit",async()=>{
  const migratie=await lees("database/first-access.sql");
  const functie=migratie.slice(migratie.indexOf("function public.begin_tavern_first_access_checkout(p_token_hash"),migratie.indexOf("revoke all on function public.begin_tavern_first_access_checkout"));
  assert.match(functie,/p_allergies text default null,p_dietary text default null,p_message text default null\)/);
  for(const fout of ["invalid_allergies","invalid_dietary","invalid_message"])assert.match(functie,new RegExp(`raise exception '${fout}'`));
  // Drie update-takken: twee die de claim bijwerken, en één die een verlopen uitnodiging
  // op 'expired' zet. Die laatste hoort de velden juist NIET aan te raken.
  const updates=functie.split("update public.tavern_seat_claims set").slice(1);
  assert.equal(updates.length,3,"het aantal update-takken is veranderd — kijk na welke");
  const metVelden=updates.filter(u=>/allergies=coalesce/.test(u));
  assert.equal(metVelden.length,2,"niet precies twee takken werken de drie velden bij");
  for(const update of metVelden){
    assert.match(update,/allergies=coalesce\(nullif\(trim\(p_allergies\),''\),allergies\)/,"een tak kan de allergie wissen");
    assert.match(update,/dietary_requirements=coalesce\(nullif\(trim\(p_dietary\),''\),dietary_requirements\)/);
    assert.match(update,/message=coalesce\(nullif\(trim\(p_message\),''\),message\)/,"een tak kan het bericht wissen");
  }
  const verlopen=updates.find(u=>/status='expired'/.test(u));
  assert.ok(verlopen,"de verlooptak is verdwenen");
  assert.doesNotMatch(verlopen,/allergies=/,"de verlooptak raakt de gastgegevens aan");
  assert.match(migratie,/drop function if exists public\.begin_tavern_first_access_checkout\(text,text,boolean,boolean,text,boolean,integer\);/,"de oude signatuur blijft staan");
  for(const woord of ["revoke all on function","grant execute on function"]){
    assert.match(migratie,new RegExp(`${woord} public\\.begin_tavern_first_access_checkout\\(text,text,boolean,boolean,text,boolean,integer,text,text,text\\)`));
  }
});

test("alle vier de gastpaden sturen de drie velden apart mee",async()=>{
  const paden=[
    ["/tavern/ (First Access)","tavern/index.html",["allergies","dietary","message"]],
    ["/tavern/private/","tavern/private/index.html",["allergies","dietary"]],
    ["/tavern/book/","tavern/book/index.html",["allergies","dietary","message"]],
    ["/tavern/checkout/","tavern/checkout/index.html",["allergies","dietary","message"]]
  ];
  for(const [naam,pagina,velden] of paden){
    const html=await lees(pagina);
    for(const veld of velden)assert.match(html,new RegExp(`data-limit="${veld}"`),`${naam} mist ${veld}`);
    assert.match(html,/assets\/field-limits\.js/,`${naam} laadt het grensscript niet`);
  }
});

test("geen enkele klasse op de vier formulierpagina's mist een stijlregel",async()=>{
  // Dit ging op 1 september al een keer mis: een hernoemde CSS-regel liet een element
  // ongestyled achter, en dat valt niet op in de HTML of in een test die alleen de
  // structuur leest. Nu ook op de vier pagina's met de drie velden.
  for(const pagina of ["tavern/index.html","tavern/private/index.html","tavern/book/index.html","tavern/checkout/index.html"]){
    const html=await lees(pagina);
    const stijl=html.slice(html.indexOf("<style"),html.lastIndexOf("</style>"));
    const gebruikt=new Set([...html.matchAll(/class="([^"]+)"/g)].flatMap(m=>m[1].split(/\s+/)).filter(Boolean));
    const gedefinieerd=new Set([...stijl.matchAll(/\.([a-zA-Z][\w-]*)/g)].map(m=>m[1]));
    const wees=[...gebruikt].filter(k=>!gedefinieerd.has(k));
    assert.deepEqual(wees,[],`${pagina} gebruikt klassen zonder stijlregel: ${wees.join(", ")}`);
  }
});

test("een tekstveld van 100% breed loopt niet buiten de pagina",async()=>{
  // Gevonden 2 september 2026 in de browser op 375px: `width:100%` plus een rand van 1px
  // aan elke kant maakt het veld twee pixels te breed, en dan schuift de hele pagina
  // horizontaal. Dat gebeurt alleen op een pagina die geen box-sizing zet.
  for(const pagina of ["tavern/index.html","tavern/private/index.html","tavern/book/index.html","tavern/checkout/index.html"]){
    const html=await lees(pagina);
    const stijl=html.slice(html.indexOf("<style"),html.lastIndexOf("</style>"));
    // Een globale regel mag ook als selectorlijst staan: `*, *::before, *::after { … }`.
    const globaal=(stijl.match(/[^{}]*\{[^}]*box-sizing\s*:\s*border-box[^}]*\}/g)||[])
      .some(regel=>regel.split("{")[0].split(",").some(sel=>sel.trim()==="*"));
    // Elke regel die een veld op 100% zet én er een rand of padding bij geeft.
    for(const regel of stijl.match(/[^{}]*\{[^}]*\}/g)||[]){
      const raaktVeld=/textarea|input|\.field\b/.test(regel.split("{")[0]);
      const vol=/width\s*:\s*100%/.test(regel)&&/(padding|border)\s*:/.test(regel);
      if(!raaktVeld||!vol)continue;
      assert.ok(globaal||/box-sizing\s*:\s*border-box/.test(regel),
        `${pagina}: "${regel.split("{")[0].trim()}" zet 100% breedte met rand of padding, zonder box-sizing — dat geeft horizontale overloop`);
    }
  }
});
