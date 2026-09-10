# Testplan — `database/group-payment-confirmation.sql`

Intern. `/operations/*` geeft 404 en staat in `robots.txt`.

Opgesteld 10 september 2026. **Niet uit te voeren door Claude**: op deze Mac staat geen
`psql`, geen PostgreSQL en geen Supabase-koppeling. Statisch is de migratie gecontroleerd
door `tests/group-payment-database.test.mjs` (24 controles), maar statisch is niet gedraaid.

**Nooit rechtstreeks op productie.** Eerst de Supabase-preview-branch `rece-migratie-test`.
Alle testgegevens gebruiken `.invalid`-adressen, een gereserveerd domein dat niet bestaat.

## Wat deze migratie repareert

Er bestond geen functie die een deelnemer op `paid` zette. De webhook riep
`confirm_tavern_payment` aan, die alleen in `tavern_seat_claims` zoekt; een deelnemerkenmerk
staat daar niet in, dus die gaf `unknown_payment` en de webhook antwoordde 500. Stripe bleef
het opnieuw proberen, de betaling werd nooit vastgelegd, en er ging geen bevestiging uit.

Dat pad is nooit gelopen: de betaalpoort staat sinds het begin dicht.

Daarnaast liet `cleanup_tavern_claims` een deels betaalde groepsboeking vervallen. Die fout
kon zich niet voordoen zolang niemand ooit op `paid` kwam — de ontbrekende schakel hield hem
tegen. Wie alleen de schakel bouwt, zet hem aan. Ze staan daarom in één migratie.

## Volgorde

Draait ná `first-access.sql`, `admin.sql`, `seat-holds.sql`, `stay-dates.sql` en
`filming-consent.sql`. De migratie vervangt vier bestaande functies:

| Functie | Stond in | Wat er verandert |
| --- | --- | --- |
| `private.cleanup_tavern_claims` | first-access.sql | slaat een boeking met een betaalde deelnemer over |
| `public.attach_participant_checkout_session` | seat-holds.sql | geen sessie zonder vastgelegde bevestigingen |
| `public.tavern_payment_request` | seat-holds.sql | geeft `filmingRequired` en `confirmationsRecorded` mee |
| `public.admin_extend_participant` | admin.sql | geen verlenging op een boeking die al rond is |

Nieuw: `record_participant_confirmations`, `confirm_participant_payment`,
`mark_participant_confirmation_email_sent`, `mark_tavern_notification_sent_by_claim`.

Nieuwe kolommen op `tavern_booking_participants`: `adult_confirmed_at`,
`privacy_accepted_at`, `filming_acknowledged_at`, `terms_version`,
`confirmation_email_sent_at`, `confirmation_email_provider_id`. Allemaal `add column if not
exists`, dus tweemaal draaien is veilig.

## Vóór het draaien

1. **Back-up.** Supabase → Database → Backups, of een export van de vier tabellen.
2. **Controleer dat de vier vervangen functies zijn zoals verwacht.** Wijkt er één af, dan
   heeft iemand er sinds 10 september aan gezeten en overschrijft deze migratie dat.

```sql
select p.proname, md5(pg_get_functiondef(p.oid)) as vingerafdruk
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where p.proname in ('cleanup_tavern_claims','attach_participant_checkout_session',
                    'tavern_payment_request','admin_extend_participant')
order by 1;
```

## Draaien

Plak het hele bestand in de SQL-editor van de **preview-branch**. Verwacht:
`Success. No rows returned`.

Draai hem daarna **nog een keer**. Idempotent, dus opnieuw hetzelfde antwoord.

## De elf scenario's

Elk in één transactie die eindigt op `rollback`, zodat er niets blijft staan.

### a. Geen betaalsessie zonder bevestigingen

```sql
begin;
select public.attach_participant_checkout_session(
  (select payment_reference from public.tavern_booking_participants
   where status='awaiting_payment' limit 1), 'cs_test_a', 'https://example.invalid/a');
-- verwacht: {"status":"confirmations_required"}
rollback;
```

### b. Bevestigen, dan koppelen

```sql
begin;
select public.record_participant_confirmations(
  (select payment_reference from public.tavern_booking_participants
   where status='awaiting_payment' limit 1),
  'testplan-v1', true, true, true);
-- verwacht: {"status":"recorded", ...}
select public.attach_participant_checkout_session(
  (select payment_reference from public.tavern_booking_participants
   where status='awaiting_payment' limit 1), 'cs_test_b', 'https://example.invalid/b');
-- verwacht: {"status":"attached", ...}
rollback;
```

### c. Zonder voorwaardenversie wordt niets vastgelegd

Zelfde als b, met `''` als versie. Verwacht `{"status":"terms_version_missing"}`, en daarna
moet `adult_confirmed_at` nog steeds `null` zijn.

### d. Tweemaal bevestigen verzet het eerste moment niet

Twee keer `record_participant_confirmations` achter elkaar; `adult_confirmed_at` hoort na de
tweede keer dezelfde waarde te hebben.

### e. Een betaling wordt vastgelegd

```sql
begin;
select public.confirm_participant_payment(
  (select payment_reference from public.tavern_booking_participants
   where status='awaiting_payment' limit 1), now());
-- verwacht: status paid, bookingComplete false zolang er meer deelnemers zijn
rollback;
```

### f. Tweemaal bevestigen geeft dezelfde uitkomst en geen tweede mail

Twee keer `confirm_participant_payment` op hetzelfde kenmerk. De tweede keer hoort
`confirmationEmailSent` te vertellen wat er al is gebeurd, en `paid_at` mag niet verschuiven.

### g. De laatste betaling maakt de boeking rond

Alle deelnemers van één boeking bevestigen. Na de laatste:
`tavern_seat_claims.status='paid'`, `hold_phase='confirmed'`, `hold_expires_at is null`. En
in de uitkomst een `booking`-laag met de naam van de **boeker**, niet van de laatste betaler.

**En daarna controleren dat de stoelen bezet blijven:**

```sql
select slug, remaining from jsonb_to_recordset(public.get_tavern_availability())
  as x(slug text, remaining integer);
```

Het aantal vrije stoelen hoort niet omhoog te zijn gegaan. `get_tavern_availability` telt op
`status in ('filling','first_access_held','payment_pending','paid')`, dus `paid` telt mee.

### h. Een deels betaalde boeking vervalt niet

```sql
begin;
-- één deelnemer op betaald zetten, de deadline in het verleden leggen
update public.tavern_seat_claims set hold_expires_at=now()-interval '1 hour'
  where id=(select claim_id from public.tavern_booking_participants where status='paid' limit 1);
select private.cleanup_tavern_claims();
select status, hold_expires_at, payment_reference from public.tavern_seat_claims
  where id=(select claim_id from public.tavern_booking_participants where status='paid' limit 1);
-- verwacht: status ONVERANDERD, hold_expires_at nog gevuld, payment_reference nog gevuld
rollback;
```

**Dit is het scenario dat vóór deze migratie geld liet verdampen.** Ging hij fout, dan stond
de boeking op `expired` en waren de stoelen vrij terwijl er betaald was.

### i. Een onbetaalde groep vervalt wél

Zelfde als h, maar met alle deelnemers op `awaiting_payment`. Verwacht: de boeking gaat op
`expired`, `hold_expires_at` leeg. Dat gedrag moet blijven — anders blijven stoelen eeuwig
bezet door groepen die nooit betalen.

### j. Geen verlenging op een afgeronde boeking

```sql
begin;
select public.admin_extend_participant('<een beheerdersadres>',
  (select id from public.tavern_booking_participants
   where claim_id=(select id from public.tavern_seat_claims where status='paid' limit 1) limit 1),
  now()+interval '1 day', 'testplan');
-- verwacht: {"status":"booking_complete", ...} en géén regel in lewos_admin_actions
rollback;
```

### k. Het bevestigde verblijf reist mee, niet het weekend

Toegevoegd op 10 september 2026, ná de rest van dit plan. Robert vroeg hoe extra nachten in
een groepsboeking lopen, en toen bleek `confirm_participant_payment` de weekenddatums plat
terug te geven als `arrivalDate` en `departureDate` — terwijl de webhook die leest als het
**bevestigde** verblijf en ze in de mail aan de accommodatie en in de agenda zet. Bij een
groepsboeking met een toegezegde extra nacht verdween daarmee de eerdere aankomst: een gast
die maandag komt bij een kamer die pas vrijdag klaarstaat. Bij een enkele boeking ging het
al goed, dus dit is niet ergens anders opgevangen.

Neem een boeking waarvan alle deelnemers op één na betaald hebben en zeg de extra nachten
toe:

```sql
begin;
update public.tavern_seat_claims
   set extra_nights_status='confirmed',
       requested_arrival=(select starts_on from public.tavern_weekends
                          where id=assigned_weekend_id) - interval '4 days',
       arrival_date=(select starts_on from public.tavern_weekends
                     where id=assigned_weekend_id) - interval '4 days'
 where id='<claim-id>';

select public.confirm_participant_payment('<kenmerk van de laatste deelnemer>', now());
```

Verwacht in de `booking`-laag van de uitkomst:

- `arrivalDate` is de **toegezegde** aankomst, dus vier dagen vóór `weekendStart`
- `weekendStart` en `weekendEnd` staan er náást en zijn onveranderd het weekend zelf
- `extraNightsStatus` is `confirmed`
- `requestedArrival` staat er ook nog

Staat `arrivalDate` gelijk aan `weekendStart`, dan is de correctie niet aangekomen en mag
deze migratie niet naar productie. Query 7 van `operations/verificatie-groepsbetaling.sql`
controleert hetzelfde statisch; dit scenario controleert het gedrag.

**En de dieetwens in dezelfde uitkomst.** Een boeking van vóór het samengevoegde veld heeft
zijn allergie nog in de oude kolommen staan:

```sql
update public.tavern_seat_claims
   set dietary_notes=null, allergies='TEST - noten', dietary_requirements=null
 where id='<claim-id>';

select public.confirm_participant_payment('<kenmerk>', now());
rollback;
```

`dietaryNotes` in de `booking`-laag hoort `TEST - noten` te bevatten en niet leeg te zijn.
Leeg betekent dat de melding aan Lewos een allergie weglaat, en dat is het gevaarlijkste
lege veld dat we hebben.

## Na het draaien

1. **De Supabase-linter.** Database → Advisors. Verwacht geen nieuwe
   `function_search_path_mutable` en geen nieuwe `rls_disabled_in_public`.
2. **Rechten controleren.** Elke nieuwe functie hoort alleen door `service_role` uitvoerbaar
   te zijn, en `cleanup_tavern_claims` door niemand:

```sql
select p.proname, coalesce(array_to_string(p.proacl,' '),'(geen acl)') as rechten
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where p.proname in ('record_participant_confirmations','confirm_participant_payment',
  'mark_participant_confirmation_email_sent','mark_tavern_notification_sent_by_claim',
  'cleanup_tavern_claims','admin_extend_participant')
order by 1;
```

3. **De beheeromgeving.** Een betaalde deelnemer hoort er nu als betaald in te staan, met
   tijdstip. Vóór deze migratie stond iedereen eeuwig op `awaiting_payment` zonder `paidAt`,
   omdat niets dat veld ooit schreef.

## Wat dit plan niet aantoont

- Dat de betaalweg van begin tot eind werkt met echte Stripe-webhooks. Dat kan pas als de
  betaalpoort opengaat, en die staat dicht tot de papieren rond zijn.
- Of de gekozen structuur juridisch de juiste is: of iedere deelnemer contractspartij is
  voor zijn eigen stoel. Dat staat als open vraag in `operations/voorwaarden-verschillen.md`.
  Deze migratie legt vast wat er gebeurt; ze beantwoordt die vraag niet.

## Pas op productie draaien als

De preview-branch alle elf de scenario's heeft doorstaan, alle acht queries van
`operations/verificatie-groepsbetaling.sql` `ok` teruggaven, de linter niets nieuws meldt, en
`node --test tests/*.test.mjs` groen is op de commit die je deployt.
