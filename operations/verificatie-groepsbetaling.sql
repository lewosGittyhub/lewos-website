-- Verificatie ná het draaien van database/group-payment-confirmation.sql
--
-- Dit is geen migratie. Er wordt niets gewijzigd: alleen gelezen en geteld. Draai dit in de
-- SQL-editor van Supabase op de preview-branch `rece-migratie-test`, direct na de migratie.
--
-- Het is met opzet ÉÉN query die acht regels teruggeeft. De eerste versie was acht losse
-- queries, en toen bleek waarom dat niet werkt: de editor stopte bij een fout in de vierde
-- en toonde de eerste drie niet. Nu zie je alle acht in één tabel, of geen enkele.
--
-- Elke regel hoort `ok` in de kolom `uitkomst` te hebben. Staat er iets anders, dan is de
-- migratie niet volledig aangekomen en hoor je NIET verder te gaan met het testplan.
--
-- Het inhoudelijke gedrag -- de elf scenario's, waaronder h dat geld kost als het fout gaat
-- en k dat het bevestigde verblijf controleert -- staat in
-- operations/testplan-groepsbetaling.md. Dit bestand controleert alleen dat er staat wat er
-- zou moeten staan.

with functies(naam) as (values
    ('record_participant_confirmations'),
    ('attach_participant_checkout_session'),
    ('confirm_participant_payment'),
    ('mark_participant_confirmation_email_sent'),
    ('admin_extend_participant'),
    ('mark_tavern_notification_sent_by_claim'),
    ('tavern_payment_request')),

-- Alle uitvoerrechten op de publieke functies, met PUBLIC als naam in plaats van als lege
-- plek. PUBLIC heeft grantee 0 en matcht met geen enkele rol; met een gewone join zou een
-- te ruime toekenning juist onzichtbaar blijven -- precies de fout die je wil vinden.
rechten as (
  select p.proname as functie,
         case when a.grantee = 0 then 'PUBLIC' else r.rolname end as wie
    from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    left join pg_roles r on r.oid = a.grantee
   where p.proname in (select naam from functies)
     and p.pronamespace = 'public'::regnamespace
     and a.privilege_type = 'EXECUTE'
     and a.grantee <> p.proowner),

interne_rechten as (
  select case when a.grantee = 0 then 'PUBLIC' else r.rolname end as wie
    from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    left join pg_roles r on r.oid = a.grantee
   where p.pronamespace = 'private'::regnamespace
     and p.proname = 'cleanup_tavern_claims'
     and a.privilege_type = 'EXECUTE'
     and a.grantee <> p.proowner),

opruiming as (
  select pg_get_functiondef(oid) as lijf
    from pg_proc
   where pronamespace = 'private'::regnamespace and proname = 'cleanup_tavern_claims'),

bevestigen as (
  select pg_get_functiondef(oid) as lijf
    from pg_proc
   where pronamespace = 'public'::regnamespace and proname = 'confirm_participant_payment')

select * from (

  -- 1. De zes nieuwe kolommen op de deelnemerstabel.
  select 1 as nr, 'kolommen' as controle,
         case when count(*) = 6 then 'ok'
              else 'MIST ' || (6 - count(*)) || ' van 6' end as uitkomst
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'tavern_booking_participants'
     and column_name in ('adult_confirmed_at','privacy_accepted_at','filming_acknowledged_at',
                         'terms_version','confirmation_email_sent_at','confirmation_email_provider_id')

  union all
  -- 2. De zeven publieke functies plus de interne opruimfunctie.
  -- count(p.oid) en niet count(*): count(*) telt ook de regels die NIET gevonden zijn en
  -- zou dus altijd acht zeggen.
  select 2, 'functies',
         case when count(p.oid) = 8 then 'ok'
              else 'MIST: ' || coalesce(string_agg(v.naam, ', ') filter (where p.oid is null), '?') end
    from (select naam, 'public' as schemanaam from functies
          union all select 'cleanup_tavern_claims', 'private') v
    left join pg_proc p
           on p.proname = v.naam
          and p.pronamespace = (case when v.schemanaam = 'private'
                                then 'private'::regnamespace else 'public'::regnamespace end)

  union all
  -- 3. Elke functie draagt een lege search_path. Zonder dat is een security definer een gat.
  select 3, 'search_path',
         case when count(*) = 0 then 'ok'
              else 'ZONDER: ' || string_agg(proname, ', ') end
    from pg_proc
   where pronamespace in ('public'::regnamespace, 'private'::regnamespace)
     and (proname in (select naam from functies) or proname = 'cleanup_tavern_claims')
     and not coalesce(array_to_string(proconfig, ',') like '%search_path=%', false)

  union all
  -- 4. Niemand behalve service_role mag deze functies uitvoeren. Een publieke functie die
  --    een boeking kan bevestigen is een open kassa.
  select 4, 'rechten',
         case when count(*) = 0 then 'ok'
              else 'TE RUIM: ' || string_agg(distinct functie || ' -> ' || wie, '; ') end
    from rechten
   where wie is distinct from 'service_role'

  union all
  -- 5. De interne opruimfunctie mag door niemand aangeroepen worden.
  select 5, 'private',
         case when count(*) = 0 then 'ok'
              else 'AANROEPBAAR DOOR: ' || string_agg(distinct wie, ', ') end
    from interne_rechten

  union all
  -- 6. De grens die twee fouten maskeerde: de opruiming laat een blokkering met een betaalde
  --    deelnemer staan. Zonder deze regel verdwijnt een boeking waarvoor al geld binnen is.
  select 6, 'opruimgrens',
         case when (select lijf from opruiming) is null then 'FUNCTIE BESTAAT NIET'
              when (select lijf from opruiming) like '%status=''paid''%'
                or (select lijf from opruiming) like '%status = ''paid''%' then 'ok'
              else 'GRENS ONTBREEKT' end

  union all
  -- 7. Het bevestigde verblijf, niet het weekend. Een groepsboeking met een door de
  --    accommodatie toegezegde extra nacht moet die nacht meenemen naar de accommodatiemail
  --    en naar de agenda. Scenario k in het testplan toont hetzelfde aan in gedrag.
  select 7, 'verblijf',
         case when (select lijf from bevestigen) is null then 'FUNCTIE BESTAAT NIET'
              when (select lijf from bevestigen) like '%coalesce(c.arrival_date,w.starts_on)%' then 'ok'
              else 'GEEFT HET WEEKEND IN PLAATS VAN HET VERBLIJF' end

  union all
  -- 8. Er staat nog geen betaalde deelnemer in de preview-database. Staat er wel een, dan is
  --    er eerder getest en beginnen de scenario's niet bij nul.
  select 8, 'schone stand',
         case when count(*) = 0 then 'ok'
              else count(*) || ' betaalde deelnemer(s) -- ruim eerst op' end
    from public.tavern_booking_participants
   where status = 'paid'

) r order by nr;
