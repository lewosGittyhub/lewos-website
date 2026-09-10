-- Verificatie ná het draaien van database/group-payment-confirmation.sql
--
-- Dit is geen migratie. Er wordt niets gewijzigd: alleen gelezen en geteld. Draai dit in de
-- SQL-editor van Supabase op de preview-branch `rece-migratie-test`, direct na de migratie.
-- Elke query hoort `ok` terug te geven. Geeft er één iets anders, dan is de migratie niet
-- volledig gedraaid en hoor je NIET verder te gaan met het testplan.
--
-- Het inhoudelijke gedrag -- de tien scenario's, waaronder scenario h dat geld kost als het
-- fout gaat -- staat in operations/testplan-groepsbetaling.md. Dit bestand controleert
-- alleen dat er staat wat er zou moeten staan.

-- 1. De zes nieuwe kolommen op de deelnemerstabel.
select case when count(*) = 6 then 'ok' else 'MIST: ' || string_agg(column_name, ', ') end
         as "1 kolommen"
from information_schema.columns
where table_schema = 'public'
  and table_name = 'tavern_booking_participants'
  and column_name in ('adult_confirmed_at','privacy_accepted_at','filming_acknowledged_at',
                      'terms_version','confirmation_email_sent_at','confirmation_email_provider_id');

-- 2. De acht functies uit deze migratie.
with verwacht(naam) as (values
  ('cleanup_tavern_claims'),
  ('record_participant_confirmations'),
  ('attach_participant_checkout_session'),
  ('confirm_participant_payment'),
  ('mark_participant_confirmation_email_sent'),
  ('admin_extend_participant'),
  ('mark_tavern_notification_sent_by_claim'),
  ('tavern_payment_request'))
select case when count(*) filter (where p.oid is null) = 0
            then 'ok'
            else 'MIST: ' || string_agg(v.naam, ', ') filter (where p.oid is null) end
         as "2 functies"
from verwacht v
left join pg_proc p
       on p.proname = v.naam
      and p.pronamespace in ('public'::regnamespace, 'private'::regnamespace);

-- 3. Elke functie draagt een lege search_path. Zonder dat is een security definer een gat.
select case when count(*) = 0 then 'ok'
            else 'ZONDER search_path: ' || string_agg(proname, ', ') end
         as "3 search_path"
from pg_proc
where pronamespace in ('public'::regnamespace, 'private'::regnamespace)
  and proname in ('record_participant_confirmations','attach_participant_checkout_session',
                  'confirm_participant_payment','mark_participant_confirmation_email_sent',
                  'admin_extend_participant','mark_tavern_notification_sent_by_claim',
                  'tavern_payment_request','cleanup_tavern_claims')
  and not coalesce(array_to_string(proconfig, ',') like '%search_path=%', false);

-- 4. Niemand behalve service_role mag deze functies uitvoeren. Een publieke functie die een
--    boeking kan bevestigen is een open kassa.
select case when count(*) = 0 then 'ok'
            else 'TE RUIM: ' || string_agg(distinct proname || ' -> ' || grantee, '; ') end
         as "4 rechten"
from (
  select p.proname, a.grantee
  from pg_proc p
  cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  where p.pronamespace = 'public'::regnamespace
    and p.proname in ('record_participant_confirmations','attach_participant_checkout_session',
                      'confirm_participant_payment','mark_participant_confirmation_email_sent',
                      'admin_extend_participant','mark_tavern_notification_sent_by_claim',
                      'tavern_payment_request')
) x
join pg_roles r on r.oid = x.grantee
cross join lateral (select r.rolname as grantee) g
where g.grantee <> 'service_role';

-- 5. De interne opruimfunctie mag door niemand aangeroepen worden.
select case when count(*) = 0 then 'ok' else 'private.cleanup_tavern_claims is aanroepbaar' end
         as "5 private"
from pg_proc p
cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
join pg_roles r on r.oid = a.grantee
where p.pronamespace = 'private'::regnamespace
  and p.proname = 'cleanup_tavern_claims'
  and r.rolname <> p.proowner::regrole::text;

-- 6. De grens die twee fouten maskeerde: de opruiming laat een blokkering met een betaalde
--    deelnemer staan. Zonder deze regel verdwijnt een boeking waarvoor al geld binnen is.
select case when position('p.status=''paid''' in pg_get_functiondef(oid)) > 0
                 or position('p.status = ''paid''' in pg_get_functiondef(oid)) > 0
            then 'ok' else 'GRENS ONTBREEKT in cleanup_tavern_claims' end
         as "6 opruimgrens"
from pg_proc
where pronamespace = 'private'::regnamespace and proname = 'cleanup_tavern_claims';

-- 7. Het bevestigde verblijf, niet het weekend. Een groepsboeking met een door de
--    accommodatie toegezegde extra nacht moet die nacht meenemen naar de accommodatiemail
--    en naar de agenda.
select case when position('coalesce(c.arrival_date,w.starts_on)' in pg_get_functiondef(oid)) > 0
            then 'ok' else 'confirm_participant_payment geeft het weekend in plaats van het verblijf' end
         as "7 verblijf"
from pg_proc
where pronamespace = 'public'::regnamespace and proname = 'confirm_participant_payment';

-- 8. Er staat nog geen betaalde deelnemer in de preview-database. Staat er wel een, dan is
--    er eerder getest en beginnen de scenario's niet bij nul.
select case when count(*) = 0 then 'ok'
            else count(*) || ' betaalde deelnemer(s) aanwezig -- ruim eerst op' end
         as "8 schone stand"
from public.tavern_booking_participants
where status = 'paid';
