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
