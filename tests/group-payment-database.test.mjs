// Statische controles op `database/group-payment-confirmation.sql`. Er staat hier geen
// PostgreSQL, dus deze tests lezen de migratie in plaats van hem te draaien — dezelfde
// aanpak als `tests/media-database.test.mjs`, en om dezelfde reden: de afspraken die je niet
// aan de code kunt zien moeten bewaakt worden zodra iemand er later een functie bij zet.
//
// Wat hier NIET wordt aangetoond: dat de migratie op Supabase draait. Dat moet op de
// preview-branch, en pas daarna op productie.
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {test} from "node:test";

const root=path.resolve(import.meta.dirname,"..");
const source=await readFile(path.join(root,"database/group-payment-confirmation.sql"),"utf8");
// Alleen wat de database uitvoert. Het commentaar mag een fout benoemen juist omdat het fout
// is; de SQL zelf mag hem niet maken.
const migration=source.split("\n").filter(line=>!line.trim().startsWith("--")).join("\n");

const functions=[...migration.matchAll(/create or replace function\s+(\w+)\.(\w+)\(([^)]*)\)\s*\nreturns ([^\n]*?)\s+as \$\$([\s\S]*?)\$\$;/g)]
  .map(match=>({schema:match[1],name:match[2],args:match[3],signature:match[4],body:match[5]}));
const byName=naam=>functions.find(fn=>fn.name===naam);

const schemaObjects=["tavern_booking_participants","tavern_seat_claims","tavern_weekends",
  "tavern_media_agreement_required"];

test("de commentaarfilter laat de SQL zelf intact",()=>{
  // Haalt dit filter te veel weg, dan lopen alle tests hieronder stilzwijgend over niets.
  assert.ok(migration.includes("create or replace function public.confirm_participant_payment"));
  assert.ok(!migration.split("\n").some(line=>line.trim().startsWith("--")),"geen commentaarregel mag overleven");
  assert.ok(source.includes("-- ── De velden"),"de bron draagt echt commentaar dat eraf moet");
});

test("de migratie levert de acht functies die deze suite bewaakt",()=>{
  const namen=functions.map(fn=>`${fn.schema}.${fn.name}`).sort();
  assert.deepEqual(namen,[
    "private.cleanup_tavern_claims",
    "public.admin_extend_participant",
    "public.attach_participant_checkout_session",
    "public.confirm_participant_payment",
    "public.mark_participant_confirmation_email_sent",
    "public.mark_tavern_notification_sent_by_claim",
    "public.record_participant_confirmations",
    "public.tavern_payment_request"
  ]);
});

test("elke functie zet een lege search_path vast",()=>{
  // `search_path=public` laat de aanroeper bepalen wat `public` betekent. Leeg is de enige
  // veilige waarde, en de Supabase-linter verlangt hem ook op functies zonder definer.
  for(const fn of functions){
    assert.match(fn.signature,/set search_path=''/,`${fn.schema}.${fn.name} zet geen lege search_path`);
  }
  assert.doesNotMatch(migration,/search_path\s*=\s*"?public/,"geen functie mag terugvallen op public");
});

test("elk object dat een functiebody aanraakt draagt zijn schema",()=>{
  const missing=[];
  for(const fn of functions){
    for(const object of schemaObjects){
      for(const hit of fn.body.matchAll(new RegExp(`(?<![\\w.])${object}\\b`,"g"))){
        const start=fn.body.lastIndexOf("\n",hit.index)+1;
        missing.push(`${fn.schema}.${fn.name}: ${fn.body.slice(start,fn.body.indexOf("\n",hit.index)).trim()}`);
      }
    }
  }
  assert.deepEqual(missing,[],`met een lege search_path lossen deze niet op:\n${missing.join("\n")}`);
});

test("%rowtype-declaraties zijn ook gekwalificeerd",()=>{
  for(const [,declared] of migration.matchAll(/([\w.]+)%rowtype/g)){
    assert.match(declared,/^(public|private)\./,`${declared}%rowtype is niet gekwalificeerd`);
  }
});

test("de migratie leunt op niets buiten pg_catalog",()=>{
  for(const fromExtension of ["gen_random_bytes","digest(","crypt(","hmac(","uuid_generate_v4"]){
    assert.ok(!migration.includes(fromExtension),`${fromExtension} hangt aan een extensie waarvan wij het schema niet bepalen`);
  }
});

test("elke functie trekt rechten in van PUBLIC, anon en authenticated",()=>{
  for(const fn of functions){
    const types=fn.args.split(",").map(argument=>argument.trim().split(/\s+/).slice(1).join(" ").replace(/\s+default\s+.*$/i,"").trim()).filter(Boolean).join(",");
    const revoke=`revoke all on function ${fn.schema}.${fn.name}(${types}) from public, anon, authenticated;`;
    assert.ok(migration.includes(revoke),`ontbrekende revoke voor ${fn.schema}.${fn.name}: verwacht\n  ${revoke}`);
  }
});

test("alleen service_role mag de publieke functies uitvoeren, en de interne niemand",()=>{
  for(const fn of functions.filter(f=>f.schema==="public")){
    const grants=[...migration.matchAll(new RegExp(`grant execute on function ${fn.schema}\\.${fn.name}\\([^)]*\\) to ([^;]+);`,"g"))].map(m=>m[1].trim());
    assert.deepEqual(grants,["service_role"],`${fn.schema}.${fn.name} hoort alleen naar service_role te gaan`);
  }
  assert.ok(!/grant execute on function private\./.test(migration),
    "een private functie hoort door niemand aangeroepen te kunnen worden");
});

// ── Het gedrag waar deze migratie voor bestaat ──────────────────────────────────

test("een deelnemerbetaling wordt daadwerkelijk vastgelegd",()=>{
  // Dit is de schakel die ontbrak: er was geen enkele functie die een deelnemer op `paid`
  // zette, en `paid_at` werd nergens geschreven.
  const fn=byName("confirm_participant_payment");
  assert.match(fn.body,/update public\.tavern_booking_participants\s+set status='paid'/,
    "de betaling moet de deelnemer op paid zetten");
  assert.match(fn.body,/paid_at=coalesce\(p_paid_at,now\(\)\)/,"paid_at moet geschreven worden");
});

test("de laatste betaling maakt de boeking rond zonder de stoelen los te laten",()=>{
  const fn=byName("confirm_participant_payment");
  // `get_tavern_availability` telt ook op status 'paid', dus de stoelen blijven bezet.
  assert.match(fn.body,/status='paid', hold_phase='confirmed', hold_expires_at=null/,
    "de boeking hoort op paid en confirmed te komen");
  assert.match(fn.body,/where claim_id=c\.id and status<>'paid'/,
    "er moet geteld worden hoeveel deelnemers nog niet betaald hebben");
});

test("hetzelfde slot en dezelfde marge als de bestaande bevestiging",async()=>{
  // Twee functies die over dezelfde stoelen gaan en een ander slot pakken, beschermen
  // elkaar niet. En een andere marge zou twee verschillende antwoorden geven op dezelfde
  // vraag: was deze betaling nog binnen de termijn?
  const bestaand=await readFile(path.join(root,"database/stay-dates.sql"),"utf8");
  const fn=byName("confirm_participant_payment");
  assert.match(fn.body,/pg_advisory_xact_lock\(hashtext\('tavern-weekends'\)\)/);
  assert.ok(bestaand.includes("pg_advisory_xact_lock(hashtext('tavern-weekends'))"),
    "de bestaande bevestiging gebruikt dit slot ook");
  assert.match(fn.body,/hold_expires_at \+ interval '5 minutes'/);
  assert.ok(bestaand.includes("interval '5 minutes'"),"de bestaande bevestiging kent dezelfde marge");
});

test("een tweede webhook voor dezelfde betaling stuurt geen tweede mail",()=>{
  const fn=byName("confirm_participant_payment");
  assert.match(fn.body,/if p\.status='paid' then/,"al betaald hoort dezelfde uitkomst te geven");
  assert.match(fn.body,/'confirmationEmailSent',p\.confirmation_email_sent_at is not null/,
    "de uitkomst moet zeggen of de mail al weg is");
});

test("een deels betaalde boeking vervalt nooit door een timer",()=>{
  // Dit was de tweede fout, en de gevaarlijkste: cleanup_tavern_claims liet elke
  // payment_pending-boeking zonder eigen checkout_session_id vervallen. Bij een
  // groepsboeking is dat altijd zo, want de sessies hangen aan de deelnemers.
  const fn=byName("cleanup_tavern_claims");
  assert.match(fn.body,/not exists\(select 1 from public\.tavern_booking_participants p\s*\n?\s*where p\.claim_id=public\.tavern_seat_claims\.id and p\.status='paid'\)/,
    "de opruiming moet een boeking met een betaalde deelnemer overslaan");
});

test("de opruiming laat het First Access-pad ongemoeid",async()=>{
  // Deze functie vervangt de versie in first-access.sql. Alles behalve de nieuwe grens moet
  // woord voor woord gelijk blijven, anders verandert er stil iets aan een pad dat werkt.
  const origineel=await readFile(path.join(root,"database/first-access.sql"),"utf8");
  const fn=byName("cleanup_tavern_claims");
  for(const regel of [
    "set status='expired'",
    "where status='first_access_held'",
    "and invitation_expires_at<=clock_timestamp()",
    "and checkout_session_id is null"
  ]){
    assert.ok(fn.body.includes(regel),`${regel} hoort ongewijzigd te blijven`);
    assert.ok(origineel.includes(regel),`${regel} hoort ook in het origineel te staan`);
  }
});

test("geen betaalsessie zonder de eigen bevestigingen van de deelnemer",()=>{
  // De weigering staat in de database en niet alleen in de functie: een formulier is te
  // omzeilen, en wie de functie erboven vergeet aan te roepen komt hier alsnog niet langs.
  const fn=byName("attach_participant_checkout_session");
  assert.match(fn.body,/if p\.adult_confirmed_at is null or p\.privacy_accepted_at is null/);
  assert.match(fn.body,/or p\.terms_version is null then/);
  assert.match(fn.body,/return jsonb_build_object\('status','confirmations_required'\)/);
});

test("de filmerkenning wordt alleen geëist waar er gefilmd wordt",()=>{
  // Weekend 02 wordt niet gefilmd; die gasten hoort niets over filmen gevraagd te worden.
  // Welk weekend het is weet één functie, en die wordt hergebruikt in plaats van nagemaakt.
  const fn=byName("record_participant_confirmations");
  assert.match(fn.body,/v_filmen := public\.tavern_media_agreement_required\(w\.slug\)/);
  assert.match(fn.body,/if v_filmen and p_filming_acknowledged is not true then/);
});

test("zonder voorwaardenversie wordt er niets vastgelegd",()=>{
  // Een bevestiging zonder versie is later niets waard: dan is niet te zeggen waarop
  // iemand ja heeft gezegd.
  const fn=byName("record_participant_confirmations");
  assert.match(fn.body,/if p_terms_version is null or char_length\(trim\(p_terms_version\)\)<1 then/);
  assert.match(fn.body,/'status','terms_version_missing'/);
});

test("de betaalpagina krijgt te horen wat ze moet vragen",()=>{
  const fn=byName("tavern_payment_request");
  assert.match(fn.body,/'filmingRequired',coalesce\(public\.tavern_media_agreement_required\(w\.slug\),false\)/);
  assert.match(fn.body,/'confirmationsRecorded'/);
  // En nog steeds niets over andere gasten of het groepstotaal.
  for(const verboden of ["party_size","allergies","dietary","participantsTotal"]){
    assert.ok(!fn.body.includes(verboden),`${verboden} hoort niet naar de betaalpagina te gaan`);
  }
});

test("de migratie raakt de betaalpoort niet aan",()=>{
  for(const constante of ["PUBLISHED_TERMS_VERSION","TAVERN_PAYMENTS_ENABLED","tavern_public_booking_ready"]){
    assert.ok(!migration.includes(constante),`${constante} hoort hier niet in`);
  }
});

test("de migratie zegt zelf dat hij niet gedraaid is en waar hij achteraan komt",()=>{
  // Dezelfde afspraak als bij de andere migraties: het bestand vertelt zijn eigen volgorde,
  // zodat niemand hoeft te gokken wat er eerst moet.
  assert.match(source,/NIET GEDRAAID/);
  assert.match(source,/preview-branch/);
  for(const eerder of ["first-access.sql","admin.sql","seat-holds.sql","filming-consent.sql"]){
    assert.ok(source.includes(eerder),`de volgorde moet ${eerder} noemen`);
  }
});

test("een deelnemerbetaling levert de boekinggegevens apart aan",()=>{
  // De naam van één deelnemer hoort niet in de mail aan de accommodatie. Daarom staat wat
  // over de boeking als geheel gaat in een eigen laag, in dezelfde vorm als
  // `confirm_tavern_payment` teruggeeft -- zodat de webhook dat blok kan hergebruiken.
  const fn=byName("confirm_participant_payment");
  assert.match(fn.body,/'booking',case when v_rond then jsonb_build_object\(/);
  // De dieetwens staat er met zijn terugval op de oude kolommen; de vorm daarvan wordt
  // hieronder in zijn eigen test vastgehouden.
  for(const veld of ["'name',c.name","'seats',c.party_size","'dietaryNotes',coalesce(",
                     "'extraNightsStatus',c.extra_nights_status"]){
    assert.ok(fn.body.includes(veld),`${veld} hoort in de boekinglaag te staan`);
  }
  assert.match(fn.body,/else null end\)/,"zolang de boeking niet rond is hoort er geen boekinglaag te zijn");
});

test("verzendregistratie kan ook op boekingsnummer",()=>{
  // Een groepsboeking heeft zelf geen payment_reference: die hangen aan de deelnemers.
  const fn=byName("mark_tavern_notification_sent_by_claim");
  assert.match(fn.body,/where id=p_claim_id/);
  assert.match(fn.body,/if p_kind not in \('accommodation','special'\) then raise exception/);
  // Alleen verzendregistraties, nooit een status of een bedrag.
  for(const verboden of ["set status","amount_cents","price_cents","hold_expires_at"]){
    assert.ok(!fn.body.includes(verboden),`${verboden} hoort deze functie niet aan te raken`);
  }
});

test("elke functie die stoelen kan vrijgeven kent de betaalde deelnemer",async()=>{
  // Deze migratie maakt het mogelijk dat een deelnemer op `paid` staat. Daarmee wordt elke
  // plek die aannam dat dat nooit gebeurde ineens scherp. Vijf functies hadden de grens al;
  // `cleanup_tavern_claims` miste hem, en dat was onvindbaar zolang niemand ooit betaalde.
  //
  // Deze test houdt die vijf vast. Komt er een functie bij die stoelen vrijgeeft of een
  // deelnemer aanraakt, dan hoort hij hier ook in te staan.
  const bronnen=Object.fromEntries(await Promise.all(
    ["admin.sql","seat-holds.sql"].map(async naam=>
      [naam,await readFile(path.join(root,"database",naam),"utf8")])));
  const eisen=[
    ["admin.sql","admin_release_participant","een betaalde deelnemer mag niet worden vrijgegeven"],
    ["admin.sql","admin_remind_participant","een betaalde deelnemer krijgt geen herinnering"],
    ["seat-holds.sql","release_seat_hold","een blokkering met een betaalde deelnemer geeft niets vrij"]
  ];
  for(const [bestand,functie,waarom] of eisen){
    const bron=bronnen[bestand];
    const begin=bron.indexOf(`function public.${functie}`);
    assert.ok(begin>-1,`${functie} bestaat niet meer in ${bestand}`);
    const einde=bron.indexOf("$$;",begin);
    const lijf=bron.slice(begin,einde);
    assert.match(lijf,/status='paid'/,`${functie}: ${waarom}`);
  }
  // En de opruimfuncties, ieder met hun eigen formulering van dezelfde regel.
  assert.match(bronnen["seat-holds.sql"],/and p\.status='paid'\)/,
    "expire_filling_holds hoort een betaalde deelnemer over te slaan");
  assert.match(migration,/and p\.status='paid'\)/,
    "cleanup_tavern_claims hoort een betaalde deelnemer over te slaan");
});

test("het verblijf in de groepsboeking is het bevestigde verblijf, niet het weekend",async()=>{
  // Robert, 10 september 2026: "hoe zit het trouwens met extra nachten." Bij het nakijken
  // bleek `confirm_participant_payment` de weekenddatums plat als `arrivalDate` en
  // `departureDate` terug te geven, terwijl `stay-dates.sql` daar het BEVESTIGDE verblijf
  // in zet. De webhook leest ze als bevestigd verblijf: hij zet ze in de mail aan de
  // accommodatie, geeft ze aan `stayLines` als `confirmedArrival`, en zet ze in de agenda.
  //
  // Gevolg was dat een door de accommodatie toegezegde extra nacht bij een groepsboeking
  // verdween: een gast die maandag aankomt bij een kamer die pas vrijdag klaarstaat. Bij een
  // enkele boeking gebeurde dat niet — daarom moet het hier vastgehouden worden.
  const fn=byName("confirm_participant_payment");
  assert.ok(fn,"confirm_participant_payment bestaat niet meer");
  assert.equal(fn.body.match(/'arrivalDate',w\.starts_on/g),null,
    "arrivalDate mag niet plat het weekend zijn: dan verdwijnt een bevestigde extra nacht");
  assert.equal(fn.body.match(/'departureDate',w\.ends_on/g),null,
    "departureDate mag niet plat het weekend zijn");
  // Vier, sinds 12 september 2026. De korte uitgang -- "deze deelnemer stond al op betaald"
  // -- geeft nu óók het boekingsblok terug, en daar staat het verblijf een tweede keer in.
  // Zie `database/group-payment-repeat-webhook.sql`.
  assert.equal((fn.body.match(/'arrivalDate',coalesce\(c\.arrival_date,w\.starts_on\)/g)||[]).length,4,
    "alle vier de teruggaven horen het bevestigde verblijf te geven");
  assert.equal((fn.body.match(/'departureDate',coalesce\(c\.departure_date,w\.ends_on\)/g)||[]).length,4,
    "alle vier de teruggaven horen het bevestigde vertrek te geven");
  // En het weekend zelf blijft apart meereizen, want `stayLines` heeft beide nodig om
  // aangevraagd van bevestigd te kunnen onderscheiden.
  assert.match(fn.body,/'weekendStart',w\.starts_on,'weekendEnd',w\.ends_on/,
    "het weekend hoort naast het verblijf te staan, niet in plaats daarvan");
  assert.match(fn.body,/'requestedArrival',c\.requested_arrival/,
    "de aanvraag van de gast hoort mee te reizen als aanvraag");
  assert.match(fn.body,/'extraNightsStatus',c\.extra_nights_status/,
    "zonder status kan de webhook aangevraagd niet van bevestigd onderscheiden");
});

test("de dieetwens van een groepsboeking valt terug op de oude kolommen",async()=>{
  // Dezelfde vergelijking met `first-access.sql`: daar staat een terugval op `allergies` en
  // `dietary_requirements` voor boekingen van voor het samengevoegde veld. Plat
  // `c.dietary_notes` liet bij zo'n boeking een allergie weg uit de melding aan Lewos, en
  // een weggevallen allergie is het gevaarlijkste lege veld dat we hebben.
  const fn=byName("confirm_participant_payment");
  assert.match(fn.body,
    /'dietaryNotes',coalesce\(nullif\(trim\(coalesce\(c\.dietary_notes,''\)\),''\),\s*private\.merged_dietary_text\(c\.allergies,c\.dietary_requirements\)\)/,
    "de dieetwens hoort dezelfde terugval te hebben als in first-access.sql");
});

test("een herhaalde webhook krijgt de boeking nog steeds terug",async()=>{
  // Gevonden op 12 september 2026 met een echte testbetaling. Stripe levert een event
  // opnieuw zodra de webhook geen 2xx geeft, en dat gebeurt bij elke hapering ná het
  // vastleggen van de betaling. Bij die tweede levering staat de deelnemer al op `paid`,
  // dus antwoordt de korte uitgang van `confirm_participant_payment`. Die gaf
  // `bookingComplete: true` terug zonder `booking`, en `stripe-webhook.mjs` valt daarop
  // terug met 500 — waarna Stripe opnieuw levert en op precies hetzelfde gat vastloopt.
  //
  // Het gevolg was onzichtbaar en blijvend: de accommodatie krijgt haar mail nooit, de
  // agenda-afspraak wordt nooit geschreven, en de gast merkt niets omdat zijn eigen
  // bevestiging allang verstuurd is.
  const fn=byName("confirm_participant_payment");
  const kort=fn.body.slice(0,fn.body.indexOf("if p.status='cancelled'"));
  assert.ok(kort.includes("if p.status='paid' then"),"de korte uitgang staat er nog");
  assert.match(kort,/'booking',case when v_rond then jsonb_build_object\(/,
    "wie al betaald had hoort de boeking terug te krijgen, anders kan de webhook nooit afmaken");
  assert.match(kort,/'bookingComplete',v_rond/,
    "bookingComplete en booking horen uit dezelfde bron te komen");
  assert.match(kort,/'outstanding',v_open/,
    "ook de korte uitgang hoort te zeggen hoeveel deelnemers er nog openstaan");
  assert.match(kort,/'filmingRequired',coalesce\(public\.tavern_media_agreement_required\(w\.slug\),false\)/,
    "een gefilmd weekend blijft een gefilmd weekend, ook bij een tweede levering");
});

test("de boeking wordt opnieuw ingelezen nadat hij op betaald is gezet",async()=>{
  // Anders leest het boekingsblok op de normale uitgang een rij waarvan `status` nog op de
  // oude waarde staat, terwijl de korte uitgang dezelfde boeking wél als `paid` ziet. Twee
  // uitgangen die iets anders zeggen over dezelfde boeking is precies waar dit bestand
  // tegen bewaakt.
  const fn=byName("confirm_participant_payment");
  assert.match(fn.body,
    /set status='paid', hold_phase='confirmed', hold_expires_at=null\s*\n\s*where id=c\.id;\s*\n(\s*--[^\n]*\n)*\s*select \* into c from public\.tavern_seat_claims where id=c\.id;/,
    "na het bijwerken hoort de rij opnieuw ingelezen te worden");
});

test("de losse migratie en de volledige migratie beschrijven dezelfde functie",async()=>{
  // `database/group-payment-repeat-webhook.sql` bestaat zodat Robert op productie niet het
  // hele bestand opnieuw hoeft te draaien. Twee plekken met dezelfde functie lopen vroeg of
  // laat uit elkaar; deze test is de enige reden dat dat niet gebeurt.
  const los=await readFile(path.join(root,"database/group-payment-repeat-webhook.sql"),"utf8");
  const pak=tekst=>{
    const start=tekst.indexOf("create or replace function public.confirm_participant_payment(");
    const eind=tekst.indexOf("end; $$;",start);
    assert.ok(start>=0&&eind>start,"de functie staat in beide bestanden");
    return tekst.slice(start,eind);
  };
  assert.equal(pak(los),pak(source),
    "group-payment-repeat-webhook.sql hoort woordelijk dezelfde functie te bevatten als group-payment-confirmation.sql");
});
