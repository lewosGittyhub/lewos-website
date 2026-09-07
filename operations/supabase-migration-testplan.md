# Testplan — `database/filming-consent.sql` op een wegwerpdatabase

Intern. `/operations/*` geeft 404 en staat in `robots.txt`.

Opgesteld 1 september 2026 op commit `77ba4c0`. **Niet uit te voeren door Claude**: op deze
Mac staat geen `supabase`-CLI, geen `psql`, geen Supabase-omgevingsvariabele en geen
Supabase-koppeling. Dit plan is geschreven om door Codex of door Robert gedraaid te worden.

**Nooit tegen productie.** Elk commando hieronder hoort op een tijdelijke branch of een
wegwerpdatabase. Alle testgegevens gebruiken `.invalid`-adressen, een gereserveerd domein dat
per definitie niet bestaat.

## Waarom dit opnieuw moet

Codex heeft deze migratie eerder op een tijdelijke branch gedraaid en vond toen een echte
fout. Sindsdien is het bestand op drie punten gewijzigd, en geen van die wijzigingen is ooit
tegen een echte PostgreSQL aan gehouden:

1. Alle elf functies staan nu op `set search_path=''` in plaats van `=public`, en 47
   verwijzingen plus zestien `%rowtype`-declaraties zijn volledig schema-gekwalificeerd.
2. `register_tavern_media_participants` ontdubbelt nu vóór het tellen, telt al geregistreerde
   deelnemers mee, en valideert in een aparte lus vóór de telling.
3. De audit-referentie gebruikt `gen_random_uuid()` in plaats van `gen_random_bytes()`, zodat
   de migratie niet meer van pgcrypto afhangt.

Een lege `search_path` is precies het soort wijziging die pas bij uitvoeren stukgaat: mist er
één kwalificatie, dan faalt die functie met `relation ... does not exist` — en niet bij het
aanmaken, maar pas bij de eerste aanroep. Statisch is het gecontroleerd (`tests/media-database.test.mjs`),
maar statisch is niet gedraaid.

## Voorbereiding

1. Maak een **tijdelijke** Supabase-ontwikkelbranch voor het project, of gebruik een lokale
   wegwerpdatabase (`supabase start` volstaat ook).
2. Draai eerst `database/first-access.sql`. De mediamigratie hangt aan `tavern_seat_claims`
   en `tavern_weekends`, en de seed daarin maakt `weekend-01` en `weekend-02` aan.
3. Draai daarna `database/filming-consent.sql`.
4. Beide zijn idempotent: een tweede keer draaien hoort niets kapot te maken. Doe dat ook
   even, dat is stap 6 hieronder.

## Wat er moet slagen

### 1. De migratie draait schoon

Geen fouten, geen waarschuwingen over ontbrekende objecten. Let bij het aanmaken al op
`private` — dat schema wordt door beide bestanden aangemaakt en dat mag botsen noch falen.

### 2. Elke functie is aanroepbaar met een lege `search_path`

Dit is de kern van deze ronde. Een gemiste kwalificatie valt pas hier om.

```sql
-- Elke functie minstens één keer echt aanroepen. Een functie die nooit is aangeroepen,
-- is niet getest: PostgreSQL controleert de body pas bij uitvoering.
select public.tavern_media_agreement_required('weekend-01');   -- true
select public.tavern_media_agreement_required('weekend-02');   -- false
```

De overige negen komen langs in het integratieblok hieronder. Controleer na afloop dat er
geen enkele `relation ... does not exist`- of `function ... does not exist`-fout is geweest.

### 3. Het integratieblok

Draai het tweede `begin; do $$ ... $$; rollback;`-blok onderaan
`tests/database-integration.sql`. Het dekt de vijf gevallen die Robert heeft opgesomd, elk
met een eigen foutmelding zodat je meteen ziet wélke regel brak:

| geval | verwacht | foutmelding als het misgaat |
| --- | --- | --- |
| twee unieke deelnemers, één dubbele regel, `party_size` 2 | `registered`, `added: 2` | `een_dubbele_regel_werd_geteld_als_extra_deelnemer` |
| drie unieke deelnemers, `party_size` 2 | `too_many_participants`, niets geplaatst | `drie_unieke_gasten_pasten_op_twee_stoelen` |
| tweede aanroep terwijl de claim vol is | `too_many_participants` | `een_tweede_aanroep_kon_het_weekend_overvullen` |
| dezelfde lijst opnieuw insturen | `registered`, `added: 0` | `een_herhaalde_inzending_was_niet_veilig` |
| een geweigerde aanroep plaatst niemand | 0 rijen | `een_geweigerde_registratie_plaatste_toch_deelnemers` |

Daarnaast dekt het blok: Weekend 02 komt niet in de flow · dezelfde tokenhash kan niet bij
twee deelnemers · een lege keuze wordt geweigerd · een afwijkende teksthash wordt geweigerd ·
een tweede inzending geeft dezelfde audit-referentie · een nieuwe versie vraagt opnieuw
akkoord · de teller lekt geen deelnemersgegevens · intrekken wist niets · een verlopen of
ingetrokken link doet niets meer · intrekken door de operator zonder tokenhash, twee keer
intrekken, en opnieuw uitgeven daarna.

**En sinds 1 september 2026 de belangrijkste van allemaal: de grens tussen twee deelnemers.**
Het blok registreert twee gasten, geeft ze allebei een eigen token, en probeert dan echt uit
dat de token van A het record van A opent en dat van B niet: A's token geeft A's id en A's
naam terug · B ziet niet dat A getekend heeft · er ontstaat geen toestemmingsrij bij B ·
B kan met zijn eigen token tekenen zonder A's keuze te overschrijven · en als A intrekt,
blijft de toestemming van B staan en zakt de teller van twee naar één. Dit stond eerder
alleen statisch in de code nagelezen; nu wordt het gedraaid.

### 4. Alles is teruggedraaid

Het blok eindigt op `rollback;`. Controleer daarna dat er niets is blijven staan:

```sql
select count(*) from public.tavern_media_participants;   -- 0
select count(*) from public.tavern_media_consents;       -- 0
select count(*) from public.tavern_media_agreements;     -- 0
select count(*) from public.tavern_seat_claims where email like '%@example.invalid';  -- 0
select count(*) from public.tavern_weekends where slug like 'codex-test-%';           -- 0
```

Alle vijf horen `0` te zijn. Is er één niet nul, dan is de transactie ergens gecommit en moet
de wegwerpdatabase weg — niet opschonen met de hand, want dan weet je niet wat er nog meer in
staat.

### 5. Rechten en afscherming

```sql
-- RLS aan op alle drie de mediatabellen, en géén policy.
select relname, relrowsecurity from pg_class
 where relname in ('tavern_media_agreements','tavern_media_participants','tavern_media_consents');
-- verwacht: alle drie relrowsecurity = true

select count(*) from pg_policies
 where tablename in ('tavern_media_agreements','tavern_media_participants','tavern_media_consents');
-- verwacht: 0

-- Geen enkel recht voor anon of authenticated op die tabellen.
select grantee, table_name, privilege_type from information_schema.role_table_grants
 where table_name in ('tavern_media_agreements','tavern_media_participants','tavern_media_consents')
   and grantee in ('anon','authenticated','PUBLIC');
-- verwacht: 0 rijen

-- Elke functie: search_path leeg, security definer waar het hoort.
select p.proname, p.prosecdef, p.proconfig
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where p.proname like '%tavern_media%' or p.proname like '%_media_%'
 order by p.proname;
-- verwacht: proconfig bevat overal search_path="" (elf functies)

-- Uitvoerrechten: alleen service_role op de publieke mediafuncties, niets op de private.
select routine_name, grantee from information_schema.role_routine_grants
 where routine_name like '%tavern_media%' order by routine_name, grantee;
-- verwacht: alleen service_role; geen anon, geen authenticated, geen PUBLIC
```

### 6. Idempotent

Draai `database/filming-consent.sql` een tweede keer. Verwacht: geen fout, geen dubbele
tabel, geen dubbele index. Draai daarna nogmaals de rechtencontroles uit stap 5 — een tweede
`create or replace function` mag de `revoke`/`grant` niet stilzwijgend hebben teruggezet.

### 7. Advisors

Draai de Supabase security- en performance-advisors en noteer wat ze zeggen over de drie
nieuwe tabellen en de elf functies. Twee dingen die ze naar verwachting níét meer melden,
omdat ze deze ronde juist zijn aangepakt: `function_search_path_mutable` en RLS-waarschuwingen
op de nieuwe tabellen. Meldt de advisor ze tóch, dan is dat een echte bevinding.

## Als er iets faalt

1. Noteer de **exacte** foutmelding, met functienaam en regelnummer.
2. Herstel alleen een echte implementatiefout. Pas het testplan niet aan om een fout te laten
   verdwijnen.
3. Draai de proef opnieuw.
4. Voer niets tegen productie uit.
5. Zet de bevinding in `HANDOVER.md`, ook als hij is opgelost — dan weet de volgende waarom
   de code eruitziet zoals hij eruitziet.

## Na afloop

**Verwijder de tijdelijke branch of database meteen.** Die kost geld zolang hij bestaat, en
er staan testgegevens in die nergens toe dienen.

## Ook nieuw: `database/first-access.sql` is gewijzigd

*Bijgewerkt 2 september 2026.* Dit plan ging tot nu toe alleen over de mediamigratie.
`database/first-access.sql` is sindsdien twee keer gewijzigd en hoort er nu bij.

1. **Alle vijftien `SECURITY DEFINER`-functies staan op `set search_path=''`** met volledig
   gekwalificeerde verwijzingen. Net als bij de mediamigratie gaat dat pas stuk bij het
   *aanroepen*, niet bij het aanmaken. **Roep daarom elke functie minstens één keer aan**;
   `get_tavern_availability()` en `tavern_public_booking_ready()` kunnen los, de rest komt
   langs in het integratieblok.
2. **Twee nieuwe kolommen op `tavern_seat_claims`**: `allergies` en `dietary_requirements`,
   allebei `text` zonder `not null` en zonder default, met een aparte `check` op 500 tekens
   die via `pg_constraint` idempotent wordt toegevoegd. Draai de migratie twee keer en
   controleer dat de tweede ronde geen fout geeft en geen dubbele constraint maakt.
3. **Drie functies hebben een nieuwe signatuur, elk met een `drop` ervoor.** Naast
   `register_tavern_interest` zijn dat `begin_tavern_checkout` en
   `begin_tavern_first_access_checkout`; alle drie kregen `p_allergies`, `p_dietary` en
   (bij de laatste twee) `p_message` als optionele parameters. **Controleer voor alle drie
   dat er ná de migratie precies één versie overblijft** — twee overloads met dezelfde naam
   laten PostgREST op ambiguïteit falen:

```sql
select oid::regprocedure from pg_proc
 where proname in ('register_tavern_interest','begin_tavern_checkout','begin_tavern_first_access_checkout');
-- verwacht: precies drie regels
```

4. **`register_tavern_interest` heeft een nieuwe signatuur** — er zijn twee optionele
   parameters bij. De oude signatuur wordt met `drop function if exists ...(text,text,
   integer,text,text,timestamptz)` opgeruimd. **Controleer op een database waar de oude
   versie al stond dat die drop ook echt draait** en dat er daarna niet twee functies met
   dezelfde naam naast elkaar staan:

```sql
select oid::regprocedure from pg_proc where proname='register_tavern_interest';
-- verwacht: precies één regel, met acht parameters
```

Het integratieblok bevat sinds dezelfde datum een eigen proef hiervoor: de allergie en de
dieetwens komen ongewijzigd in hun eigen kolom terecht, het berichtveld blijft schoon, een
aanvraag zónder die twee velden werkt gewoon en laat ze `null`, en een allergie van 501
tekens wordt geweigerd met `invalid_allergies` zonder een rij achter te laten.

## Wat er sinds het schrijven van dit plan is bijgekomen

Robert koos op 1 september 2026 de operator-flow. Daardoor is de migratie op drie punten
gewijzigd, en die horen bij deze proef:

- **`get_tavern_media_progress` heeft een nieuwe signatuur**: `(p_claim_id uuid,
  p_agreement_version text)` in plaats van een tokenhash. De oude versie wordt met een
  `drop function if exists` opgeruimd — controleer dat die drop ook echt draait op een
  database waar de oude versie al stond.
- **`revoke_tavern_media_participant_link(uuid)` is nieuw**: intrekken door de operator, zonder
  de tokenhash. Het integratieblok test intrekken, twee keer intrekken, dat de toestemming
  blijft staan, en dat er daarna een nieuwe link uitgegeven kan worden.
- **De kolommen `media_progress_token_hash` en `media_progress_expires_at` zijn geschrapt**,
  met hun index. Ze zijn nooit ergens toegepast, dus er is niets te migreren — maar
  controleer op een database waar een eerdere versie al stond of ze er nog liggen.

Het integratieblok dekt deze drie. Roep in stap 2 dus ook
`public.revoke_tavern_media_participant_link` en de nieuwe
`public.get_tavern_media_progress` minstens één keer aan.

---

# Lokaal tegen een echte PostgreSQL (6 september 2026)

**Wat hier voor het eerst is gelukt:** de migraties zijn niet langer alleen gelezen maar
gedraaid. Er staat op deze Mac geen PostgreSQL, geen Homebrew en geen Docker, en dat was
maandenlang de reden dat elke migratie "NOG NIET GEVERIFIEERD" bleef. Er is een weg zonder
installatie en zonder beheerdersrechten.

## Hoe

Native arm64-binaries, ~30 MB, uit de Maven-repository van zonky.io. Ze hoeven nergens
geïnstalleerd te worden; uitpakken is genoeg.

```bash
DIR=/tmp/lewos-pg && mkdir -p $DIR && cd $DIR
curl -sL -o pg.jar https://repo1.maven.org/maven2/io/zonky/test/postgres/embedded-postgres-binaries-darwin-arm64v8/16.4.0/embedded-postgres-binaries-darwin-arm64v8-16.4.0.jar
unzip -oq pg.jar -d jar && mkdir -p dist && tar -xJf jar/postgres-darwin-arm_64.txz -C dist
./dist/bin/initdb -D data -U lewos -A trust -E UTF8 --locale=C
./dist/bin/pg_ctl -D data -o "-p 55432 -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" -l pg.log start
```

Twee dingen die misgaan als je ze niet weet:

- **Er zit geen `psql` bij.** Alleen `initdb`, `pg_ctl` en `postgres`. Gebruik een client —
  `npm install pg` in een map búíten de repo, zodat er geen afhankelijkheid in de repo komt.
- **Het socketpad wordt te lang** in een diepe map. Vandaar `unix_socket_directories=''`:
  alleen TCP op 127.0.0.1.

## Wat er gedraaid is

Een lege database, de rollen `anon`, `authenticated` en `service_role` erin (die levert
Supabase, kale PostgreSQL niet), en dan de migraties in deze volgorde:

```
first-access.sql → filming-consent.sql → admin.sql → seat-holds.sql → stay-dates.sql
```

**Alle vijf draaien schoon.** Daarna nog een keer alle vijf: ook schoon — ze zijn dus
idempotent, en de eenmalige samenvoeging van de dieetvelden verdubbelt niets bij een tweede
run.

Vervolgens `tests/database-integration.sql` erop: **alle controles geslaagd.** Dat bestand
bevat sinds vandaag ook het verblijfsvenster, het samengevoegde dieetveld en de
beheerfuncties. Het draait in één transactie en rolt aan het eind terug.

## Wat dat wel en niet bewijst

**Wel:** de SQL is syntactisch geldig, de functies compileren, de constraints doen wat ze
zeggen, de handtekeningen zijn eenduidig (geen dubbele overloads na het toevoegen van
parameters), en het gedrag klopt — een te late vertrekdatum wordt geweigerd, een lege
waarde wist niets, een vreemde kan geen extra nachten bevestigen.

**Niet:** dit is PostgreSQL 16.4, geen Supabase. Wat hier níét getest is:

- Supabase-specifieke rollen en de standaardrechten die Supabase zelf uitdeelt. Op
  3 september 2026 bleek dat verschil al eerder te bijten: lokaal stond de teller op nul,
  op Supabase hadden `anon` en `authenticated` alle rechten op alle drie de tabellen.
- PostgREST: of de RPC's over HTTP dezelfde handtekening vinden.
- De echte gegevens die er al in staan.

Draai `tests/database-integration.sql` dus alsnog één keer op een Supabase-branch voordat
het naar productie gaat.

---

# De Supabase-eindcontrole (6 september 2026)

**UITGEVOERD op 7 september 2026 — alles geslaagd.** Zie "Uitkomst" onderaan deze sectie.

Oorspronkelijk stond hier dat Claude dit niet kon uitvoeren: geen `supabase`-CLI, geen
Docker, geen toegangstoken. Dat klopte, tot de Chrome-extensie werd verbonden en de controle
via het dashboard van Robert kon lopen — in de **preview-branch**, nooit in productie.

## Wat er te controleren valt dat lokaal níét kan

`tests/database-integration.sql` bewijst het **gedrag** van de functies, en dat is op echte
PostgreSQL 16.4 rond. Wat daar niet in zit is precies wat op Supabase anders is:

- de rechten die Supabase zélf uitdeelt aan `anon` en `authenticated`;
- of RLS overal aan staat;
- of PostgREST de functies met dezelfde handtekening terugvindt;
- de rolverdeling tussen Robert en Nadine tegen de echte database.

Daarvoor is `tests/supabase-checks.sql` geschreven: tien controles, één transactie, aan het
eind een `rollback`. Elk testgegeven is verzonnen en gebruikt `.invalid`. Er gaat geen mail
uit, er wordt niets betaald en de agenda blijft ongemoeid — het bestand praat alleen met de
database.

## Wat Robert doet

1. **Maak een ontwikkelbranch** in Supabase (Branching), of een apart testproject. **Nooit
   het productieproject.**
2. Draai in de SQL Editor van díé branch de vier migraties, in deze volgorde:
   `first-access.sql` → `admin.sql` → `seat-holds.sql` → `stay-dates.sql`.
   *(Draait ook `filming-consent.sql` mee, zet die dan ná `first-access.sql`.)*
3. Draai `tests/supabase-checks.sql`.
4. Kijk naar de meldingen onderaan. Bij succes eindigt hij op:

   ```
   SUPABASE-CONTROLE GESLAAGD
   ```

   Faalt er iets, dan stopt hij mét de reden. Stuur die regel door; hij is zo geschreven dat
   er in staat wát er mis is, niet alleen dát er iets mis is.
5. **Gooi de ontwikkelbranch daarna weg.**

## De tien controles

| | Wat |
| --- | --- |
| 1 | RLS staat aan op alle zes tabellen |
| 2 | `anon` en `authenticated` kunnen niet lezen of schrijven in gastgegevens |
| 3 | de zeven beheerfuncties zijn voor hen niet aanroepbaar |
| 4 | standaardtermijnen zijn 60 minuten invullen en 30 minuten betalen |
| 5 | Nadine mag herinneren en verlengen, niet vrijgeven |
| 6 | een vreemde mag geen enkele beheeractie |
| 7 | een deels betaalde groep verliest niets automatisch |
| 8 | alleen Robert geeft vrij, en de betaalde plaats blijft staan |
| 9 | `anon` en `authenticated` kunnen geen enkele functie van ons aanroepen |
| 10 | dieetgegevens alleen in het beveiligde detail, nooit in het maandoverzicht |

**Controle 2 en 9 zijn de reden dat dit bestand bestaat.** PostgreSQL geeft EXECUTE
standaard aan `PUBLIC`, en `anon` erft dat. Elke migratie moet dat expliciet intrekken;
vergeet er één, dan staat die functie op het open internet. Lokaal valt dat niet op, want
daar bestaat `anon` alleen omdat wij hem zelf aanmaken. Op 3 september 2026 beet dat verschil
al een keer: lokaal stond de teller op nul, op Supabase hadden `anon` en `authenticated` alle
rechten op alle drie de tabellen.

Controle 9 laat functies van extensies met rust — pgcrypto zet er tientallen in `public` en
die dragen geen gastgegevens.

## Wat het niet dekt

**PostgREST over HTTP.** Of de RPC's via de REST-laag dezelfde handtekening vinden, blijkt
pas uit een echte aanroep. De goedkoopste proef: laat de beheeromgeving één keer een
maandoverzicht ophalen tegen de ontwikkelbranch. Krijgt hij `PGRST202` (function not found),
dan is er een handtekening verschoven.

**Stripe en Supabase Auth.** Los, ongewijzigd, en hier niet aan de orde.


## Uitkomst, 7 september 2026

**Gebruikt:** organisatie **Lewos** (Pro), project **Lewos Tavern**, preview-branch
**`rece-migratie-test`** — een eigen database met een eigen project-ref, los van de
productiebranch `main`. Die laatste draagt in het dashboard het label `PRODUCTION` en is
niet aangeraakt.

Vóór de eerste schrijfactie is in de SQL-editor zelf gecontroleerd op welke database werd
gewerkt; pas daarna zijn de migraties geplakt. Ze zijn niet ingetypt maar via het klembord
geplakt: de editor vult haakjes en aanhalingstekens automatisch aan en zou de SQL anders
verminken.

| Stap | Uitkomst |
| --- | --- |
| `first-access.sql` | Success (Supabase waarschuwde voor "destructive operations" — dat zijn de `drop function if exists`-regels) |
| `admin.sql` | Success |
| `seat-holds.sql` | Success (zelfde waarschuwing) |
| `stay-dates.sql` | Success |
| `tests/supabase-checks.sql` | Success — en omdat elke mislukte controle daarin een exception opgooit, betekent dat: alle tien geslaagd |

**De cijfers, apart opgevraagd** omdat de SQL-editor `raise notice` niet toont:

| Meting | Waarde |
| --- | --- |
| Tabellen met RLS aan | **6 van 6** |
| Tabelrechten voor `anon`/`authenticated` die weg moeten | **0** |
| Functies van ons die `anon`/`authenticated` mag aanroepen | **0** |
| Beheerfuncties aanwezig | 8 |
| `begin_seat_hold` standaard 60 minuten | true |
| `promote_seat_hold_to_payment` standaard 30 minuten | true |

**PostgREST**, zonder sleutel benaderd: leeft en weigert alles. `401` op de tabellen én op
`admin_bookings_in_range`, `admin_booking_detail` en `admin_release_participant`.

**Geen enkel verschil met lokale PostgreSQL gevonden.** Het probleem van 3 september 2026 —
`anon` en `authenticated` met alle rechten op alle tabellen — is hier **niet** teruggekomen.

**Opgeruimd:** nul testboekingen, nul testdeelnemers, nul vastgelegde beheeracties, nul
boekingen in totaal. De twee beheerders komen uit de seed van `admin.sql`, niet uit de test.
De SQL-snippet in de editor is verwijderd.

## Wat hiermee nog steeds niet bewezen is

- **Gelijktijdige stoelclaims op Supabase.** De SQL-editor is één sessie; de proef met twaalf
  parallelle verbindingen liep alleen lokaal.
- **De beheerfuncties over HTTP mét service_role.** Bewezen is dat PostgREST ze *weigert*
  zonder sleutel — niet dat hij ze mét sleutel correct bedient. Dat vraagt de service-role
  sleutel, en die hoort een assistent niet uit het dashboard te halen.
- **`tests/database-integration.sql` op Supabase.** Dat bestand controleert het gedrag van de
  functies en draaide alleen lokaal.
- Stripe, Supabase Auth, Resend en Google Agenda: onaangeroerd.
