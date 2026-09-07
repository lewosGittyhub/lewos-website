-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  LOKAAL GEDRAAID op PostgreSQL 16.4, 6 september 2026 — NIET op Supabase ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Deze migratie draait schoon op een kale PostgreSQL 16.4, twee keer achter elkaar,
-- en `tests/database-integration.sql` slaagt erop. Wat daarmee NIET is aangetoond:
-- de Supabase-standaardrechten, PostgREST, en de gegevens die er al in staan. Zie
-- `operations/supabase-migration-testplan.md`.
-- De blokkering in twee fasen. Geschreven zonder Supabase-toegang; alleen tegen de
-- testsuite gedraaid, en die leest SQL als tekst. **Draai dit niet op productie voordat
-- het op een tijdelijke database is nagelopen.** Draait ná `first-access.sql` en `admin.sql`.
--
--   Invulfase   60 minuten vanaf het bewust doorgaan met boeken
--   Betaalfase  30 minuten vanaf het indienen, plus de verlengingen uit admin.sql
--
-- De overgang laat geen stoel los: het is dezelfde rij die van fase wisselt. Er wordt
-- nergens vrijgegeven-en-opnieuw-gereserveerd, want daartussen kan iemand anders er
-- tussendoor glippen.
--
-- **Alles wat met beschikbaarheid te maken heeft loopt onder `pg_advisory_xact_lock`.**
-- Twee bezoekers die op dezelfde seconde op boeken klikken, worden achter elkaar gezet;
-- de tweede ziet de stoelen van de eerste al staan. Dat slot bestond al voor de checkout
-- en is bewust hetzelfde slot, anders beschermen ze elkaar niet.
--
-- Na te lopen scenario's, in één transactie die eindigt op `rollback`:
--   a. Twee gelijktijdige `begin_seat_hold` op hetzelfde weekend met samen meer stoelen
--      dan er zijn: precies één slaagt.
--   b. Tweemaal `begin_seat_hold` met dezelfde sessie geeft dezelfde rij én dezelfde
--      `hold_expires_at` terug — verversen verlengt niets.
--   c. Een verlopen invulblokkering telt niet meer mee in `get_tavern_availability`.
--   d. `promote_seat_hold_to_payment` verandert de telling niet.
--   e. `release_seat_hold` weigert zodra er een deelnemer betaald heeft.

-- ── De velden ────────────────────────────────────────────────────────────────
-- `hold_phase` staat naast `status` en niet erin: `status` gaat over de boeking, dit gaat
-- over de stoelen. Ze lopen niet gelijk op — een boeking kan `payment_pending` zijn
-- terwijl de blokkering al bevestigd is voor twee van de vier deelnemers.
alter table public.tavern_seat_claims add column if not exists hold_phase text
  check (hold_phase is null or hold_phase in ('filling','payment','confirmed','released'));
alter table public.tavern_seat_claims add column if not exists hold_started_at timestamptz;
alter table public.tavern_seat_claims add column if not exists payment_started_at timestamptz;
-- Eén blokkering per boekingssessie. We bewaren een hash, nooit het token zelf.
alter table public.tavern_seat_claims add column if not exists booking_session_hash text;
alter table public.tavern_seat_claims add column if not exists released_at timestamptz;
alter table public.tavern_seat_claims add column if not exists released_by text;
alter table public.tavern_seat_claims add column if not exists release_reason text;

create unique index if not exists tavern_claims_booking_session_idx
  on public.tavern_seat_claims (booking_session_hash)
  where booking_session_hash is not null and hold_phase in ('filling','payment');
create index if not exists tavern_claims_filling_idx
  on public.tavern_seat_claims (hold_expires_at) where hold_phase='filling';

-- 'filling' erbij als geldige boekingsstatus.
do $$ begin
  alter table public.tavern_seat_claims drop constraint if exists tavern_seat_claims_status_check;
  alter table public.tavern_seat_claims add constraint tavern_seat_claims_status_check
    check (status in ('filling','first_access_held','alternative_offered','future_weekend_interest',
                      'private_inquiry','payment_pending','paid','expired','cancelled'));
end $$;

-- ── Opruimen ─────────────────────────────────────────────────────────────────
-- Een verlopen invulblokkering vervalt vanzelf: er is niets betaald, dus er is niets te
-- beslissen. Een betaalfase waarin al iemand betaald heeft wordt hier nooit aangeraakt —
-- dat is Roberts beslissing, en een timer is geen beslissing.
create or replace function private.expire_filling_holds()
returns integer language plpgsql security definer set search_path='' as $$
declare aantal integer;
begin
  perform pg_advisory_xact_lock(hashtext('tavern-weekends'));
  with vervallen as (
    update public.tavern_seat_claims
      set status='expired',hold_phase='released',released_at=clock_timestamp(),
          released_by='system',release_reason='filling_window_expired'
      where hold_phase='filling'
        and hold_expires_at is not null
        and hold_expires_at<=clock_timestamp()
        and not exists(select 1 from public.tavern_booking_participants p
                       where p.claim_id=public.tavern_seat_claims.id and p.status='paid')
      returning 1)
  select count(*)::integer into aantal from vervallen;
  return aantal;
end; $$;
revoke all on function private.expire_filling_holds() from public, anon, authenticated;

-- ── Beschikbaarheid ──────────────────────────────────────────────────────────
-- Vervangt de versie in `first-access.sql`. Enige inhoudelijke wijziging: `filling` telt
-- mee als bezet. Een stoel die iemand aan het invullen is, is voor een ander niet vrij.
-- Naar buiten gaat één getal; er staat hier met opzet geen verdeling in.
create or replace function public.get_tavern_availability()
returns jsonb language plpgsql security definer set search_path=''  as $$
declare result jsonb;
begin
  perform private.cleanup_tavern_claims();
  perform private.expire_filling_holds();
  select coalesce(jsonb_agg(jsonb_build_object(
    'slug',w.slug,'label',w.label,'dateLabel',w.date_label,'capacity',w.capacity,
    'startsOn',w.starts_on,'endsOn',w.ends_on,'priceCents',w.price_cents,
    'remaining',greatest(w.capacity-coalesce(c.occupied,0),0)
  ) order by w.sort_order),'[]'::jsonb) into result
  from public.tavern_weekends w
  left join (
    select assigned_weekend_id,sum(party_size)::integer as occupied
    from public.tavern_seat_claims
    where status in('filling','first_access_held','payment_pending','paid')
    group by assigned_weekend_id
  ) c on c.assigned_weekend_id=w.id
  where w.visible=true;
  return result;
end; $$;
revoke all on function public.get_tavern_availability() from public, anon, authenticated;
grant execute on function public.get_tavern_availability() to service_role;

-- ── De invulfase beginnen ────────────────────────────────────────────────────
-- Dezelfde sessie die nog eens aanklopt krijgt zijn bestáánde blokkering terug, met de
-- oorspronkelijke deadline. Dát is waarom verversen niets verlengt: er is geen tak in deze
-- functie die `hold_expires_at` opnieuw zet.
create or replace function public.begin_seat_hold(
  p_session_hash text, p_weekend_slug text, p_party_size integer, p_window_minutes integer default 60)
returns jsonb language plpgsql security definer set search_path='' as $$
declare w public.tavern_weekends%rowtype; bestaand public.tavern_seat_claims%rowtype;
        bezet integer; vervalt timestamptz; nieuw uuid;
begin
  if p_session_hash is null or char_length(p_session_hash)<>64 then raise exception 'invalid_session'; end if;
  if p_party_size is null or p_party_size<1 or p_party_size>6 then raise exception 'invalid_party_size'; end if;

  perform pg_advisory_xact_lock(hashtext('tavern-weekends'));
  perform private.cleanup_tavern_claims();
  perform private.expire_filling_holds();

  select * into w from public.tavern_weekends where slug=p_weekend_slug and visible=true;
  if not found then raise exception 'unknown_weekend'; end if;

  select * into bestaand from public.tavern_seat_claims
    where booking_session_hash=p_session_hash and hold_phase in('filling','payment');
  if found then
    -- Bestaat al. Niets verlengen, niets bijtellen; alleen teruggeven wat er staat.
    return jsonb_build_object('status','resumed','claimId',bestaand.id,'seats',bestaand.party_size,
      'phase',bestaand.hold_phase,'holdStartedAt',bestaand.hold_started_at,
      'holdExpiresAt',bestaand.hold_expires_at,'weekend',w.slug);
  end if;

  select coalesce(sum(party_size),0)::integer into bezet from public.tavern_seat_claims
    where assigned_weekend_id=w.id and status in('filling','first_access_held','payment_pending','paid');
  if w.capacity-bezet < p_party_size then
    return jsonb_build_object('status','not_available','remaining',greatest(w.capacity-bezet,0));
  end if;

  vervalt:=clock_timestamp()+make_interval(mins=>greatest(5,least(p_window_minutes,120)));
  insert into public.tavern_seat_claims
    (name,email,party_size,requested_weekend_id,assigned_weekend_id,status,consented_at,
     hold_phase,hold_started_at,hold_expires_at,booking_session_hash,price_cents)
  values('(filling in)','pending@hold.invalid',p_party_size,w.id,w.id,'filling',now(),
     'filling',clock_timestamp(),vervalt,p_session_hash,w.price_cents)
  returning id into nieuw;
  return jsonb_build_object('status','held','claimId',nieuw,'seats',p_party_size,'phase','filling',
    'holdStartedAt',clock_timestamp(),'holdExpiresAt',vervalt,'weekend',w.slug,
    'remaining',greatest(w.capacity-bezet-p_party_size,0));
end; $$;
revoke all on function public.begin_seat_hold(text,text,integer,integer) from public, anon, authenticated;
grant execute on function public.begin_seat_hold(text,text,integer,integer) to service_role;

-- ── Afbreken ─────────────────────────────────────────────────────────────────
-- Wie expliciet afbreekt, geeft zijn stoelen meteen terug. Maar nooit als er al iemand
-- betaald heeft: dan is het een beslissing van Robert en niet van een knop in een browser.
create or replace function public.release_seat_hold(p_session_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.tavern_seat_claims%rowtype; betaald integer;
begin
  perform pg_advisory_xact_lock(hashtext('tavern-weekends'));
  select * into c from public.tavern_seat_claims
    where booking_session_hash=p_session_hash and hold_phase in('filling','payment') for update;
  if not found then return jsonb_build_object('status','no_hold'); end if;
  select count(*)::integer into betaald from public.tavern_booking_participants
    where claim_id=c.id and status='paid';
  if betaald>0 then return jsonb_build_object('status','requires_operator','claimId',c.id,'paidParticipants',betaald); end if;
  update public.tavern_seat_claims
    set status='cancelled',hold_phase='released',released_at=clock_timestamp(),
        released_by='guest',release_reason='cancelled_by_guest'
    where id=c.id;
  return jsonb_build_object('status','released','claimId',c.id,'seats',c.party_size);
end; $$;
revoke all on function public.release_seat_hold(text) from public, anon, authenticated;
grant execute on function public.release_seat_hold(text) to service_role;

-- ── Van invullen naar betalen ────────────────────────────────────────────────
-- Dezelfde rij, andere fase. Er wordt niets vrijgegeven en niets bijgeteld; de stoelen
-- blijven onafgebroken van deze boeking. `payment_started_at` is het nulpunt voor de
-- dertig minuten, en wordt maar één keer gezet.
create or replace function public.promote_seat_hold_to_payment(
  p_session_hash text, p_name text, p_email text, p_participants jsonb default '[]'::jsonb,
  p_allergies text default null, p_dietary text default null, p_message text default null,
  -- Sinds 5 september 2026 één veld op het formulier. `p_allergies` en `p_dietary`
  -- blijven bestaan voor oudere clients; er wordt niets meer naartoe geschreven vanaf
  -- de site zelf.
  p_dietary_notes text default null,
  p_extra_nights text default null, p_filming_acknowledged boolean default false,
  p_payment_window_minutes integer default 30)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.tavern_seat_claims%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext('tavern-weekends'));
  select * into c from public.tavern_seat_claims
    where booking_session_hash=p_session_hash for update;
  if not found then return jsonb_build_object('status','no_hold'); end if;
  if c.hold_phase='payment' then
    -- Al gepromoveerd. Opnieuw indienen mag de klok niet terugzetten.
    return jsonb_build_object('status','already_in_payment','claimId',c.id,
      'paymentStartedAt',c.payment_started_at,'seats',c.party_size);
  end if;
  if c.hold_phase<>'filling' then return jsonb_build_object('status','hold_not_open','phase',c.hold_phase); end if;
  if c.hold_expires_at<=clock_timestamp() then return jsonb_build_object('status','hold_expired'); end if;

  update public.tavern_seat_claims
    set name=trim(p_name),email=lower(trim(p_email)),status='payment_pending',hold_phase='payment',
        allergies=nullif(trim(p_allergies),''),dietary_requirements=nullif(trim(p_dietary),''),
        dietary_notes=nullif(trim(p_dietary_notes),''),
        message=nullif(trim(p_message),''),extra_nights=nullif(trim(p_extra_nights),''),
        adult_confirmed_at=now(),privacy_accepted_at=now(),
        filming_notice_acknowledged_at=case when p_filming_acknowledged then now() else filming_notice_acknowledged_at end,
        payment_started_at=clock_timestamp(),
        hold_expires_at=clock_timestamp()+make_interval(mins=>greatest(5,least(p_payment_window_minutes,30)))
    where id=c.id;

  -- Iedere deelnemer krijgt zijn eigen rij met zijn eigen bedrag. Het bedrag komt uit de
  -- weekendprijs die bij de blokkering is vastgelegd, niet uit iets dat de browser meestuurt:
  -- anders zou een bezoeker zijn eigen prijs kunnen bepalen. Vier deelnemers is dus vier keer
  -- de persoonsprijs, en nooit vier keer het groepstotaal.
  insert into public.tavern_booking_participants (claim_id,full_name,email,amount_cents,status)
  select c.id, trim(d->>'name'), lower(trim(d->>'email')),
         coalesce(c.price_cents,(select price_cents from public.tavern_weekends where id=c.assigned_weekend_id)),
         'awaiting_payment'
  from jsonb_array_elements(coalesce(p_participants,'[]'::jsonb)) as d
  on conflict do nothing;

  return jsonb_build_object('status','in_payment','claimId',c.id,'seats',c.party_size,
    'paymentStartedAt',clock_timestamp(),
    'participants',(select count(*) from public.tavern_booking_participants where claim_id=c.id));
end; $$;
-- De oude handtekening opruimen: anders staan er twee functies naast elkaar.
drop function if exists public.promote_seat_hold_to_payment(text,text,text,jsonb,text,text,text,text,boolean,integer);
revoke all on function public.promote_seat_hold_to_payment(text,text,text,jsonb,text,text,text,text,text,boolean,integer) from public, anon, authenticated;
grant execute on function public.promote_seat_hold_to_payment(text,text,text,jsonb,text,text,text,text,text,boolean,integer) to service_role;

-- ── De stand opvragen ────────────────────────────────────────────────────────
-- Voor de afteller in de browser. Geeft alleen de eigen blokkering terug plus hoeveel
-- stoelen er nog vrij zijn — nooit iets over andere boekingen.
create or replace function public.get_seat_hold(p_session_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.tavern_seat_claims%rowtype; w public.tavern_weekends%rowtype; bezet integer;
begin
  perform private.expire_filling_holds();
  select * into c from public.tavern_seat_claims where booking_session_hash=p_session_hash
    order by created_at desc limit 1;
  if not found then return jsonb_build_object('status','no_hold'); end if;
  select * into w from public.tavern_weekends where id=c.assigned_weekend_id;
  select coalesce(sum(party_size),0)::integer into bezet from public.tavern_seat_claims
    where assigned_weekend_id=w.id and status in('filling','first_access_held','payment_pending','paid');
  return jsonb_build_object(
    'status',case when c.hold_phase in('filling','payment') then 'active' else 'ended' end,
    'claimId',c.id,'seats',c.party_size,'weekend',w.slug,'phase',c.hold_phase,
    'holdStartedAt',c.hold_started_at,'paymentStartedAt',c.payment_started_at,
    'remaining',greatest(w.capacity-bezet,0));
end; $$;
revoke all on function public.get_seat_hold(text) from public, anon, authenticated;
grant execute on function public.get_seat_hold(text) to service_role;

-- ── Het eerste betaalverzoek, in twee stappen ────────────────────────────────
--
-- Robert, 7 september 2026: `promote_seat_hold_to_payment` zette de boeking in één keer in
-- de betaalfase én maakte de deelnemers aan. Daar was geen plek om de betaalverzoeken te
-- versturen: mislukte er één mail, dan stond de boeking al als "betaalfase" in de database
-- en zag de gast een bevestiging voor een verzoek dat nooit is aangekomen.
--
-- Daarom nu twee stappen, met het versturen ertussen:
--
--   1. `prepare_seat_hold_payment`  — deelnemers aanmaken, ieder met eigen bedrag en eigen
--      betaalkenmerk. **De blokkering blijft in de invulfase.** Er verandert niets aan de
--      status van de boeking.
--   2. de functie verstuurt de betaalverzoeken
--   3. `confirm_seat_hold_payment`  — pas nu betaalfase, pas nu de klok van 30 minuten.
--
-- Gaat stap 2 mis, dan `abandon_seat_hold_payment`: de deelnemers gaan weg en de gast houdt
-- zijn plaatsen in de invulfase. Beter een gast die het opnieuw probeert dan een gast die
-- denkt dat hij een betaallink krijgt die nooit komt.

create or replace function public.prepare_seat_hold_payment(
  p_session_hash text, p_name text, p_email text, p_participants jsonb default '[]'::jsonb,
  p_allergies text default null, p_dietary text default null, p_message text default null,
  p_dietary_notes text default null,
  p_extra_nights text default null, p_filming_acknowledged boolean default false,
  p_payment_window_minutes integer default 30)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.tavern_seat_claims%rowtype; v_deadline timestamptz;
begin
  perform pg_advisory_xact_lock(hashtext('tavern-weekends'));
  select * into c from public.tavern_seat_claims
    where booking_session_hash=p_session_hash for update;
  if not found then return jsonb_build_object('status','no_hold'); end if;
  -- Al in de betaalfase: opnieuw indienen mag de klok niet terugzetten en mag geen tweede
  -- ronde betaalverzoeken opleveren.
  if c.hold_phase='payment' then
    return jsonb_build_object('status','already_in_payment','claimId',c.id,
      'paymentStartedAt',c.payment_started_at,'seats',c.party_size);
  end if;
  if c.hold_phase<>'filling' then return jsonb_build_object('status','hold_not_open','phase',c.hold_phase); end if;
  if c.hold_expires_at<=clock_timestamp() then return jsonb_build_object('status','hold_expired'); end if;

  -- De gegevens van de boeking mogen wel vast vastgelegd worden: dat is wat de gast heeft
  -- ingevuld, en het maakt de mail mogelijk. De fase blijft `filling`.
  update public.tavern_seat_claims
    set name=trim(p_name),email=lower(trim(p_email)),
        allergies=nullif(trim(p_allergies),''),dietary_requirements=nullif(trim(p_dietary),''),
        dietary_notes=nullif(trim(p_dietary_notes),''),
        message=nullif(trim(p_message),''),extra_nights=nullif(trim(p_extra_nights),''),
        adult_confirmed_at=now(),privacy_accepted_at=now(),
        filming_notice_acknowledged_at=case when p_filming_acknowledged then now() else filming_notice_acknowledged_at end
    where id=c.id;

  -- Ieder zijn eigen rij, eigen bedrag, eigen betaalkenmerk. Het bedrag komt uit de
  -- weekendprijs die bij de blokkering is vastgelegd, nooit uit iets dat de browser stuurt.
  -- `on conflict do nothing` op (claim_id, lower(email)) maakt dit idempotent: een tweede
  -- poging levert dezelfde rijen op, met dezelfde ids, dus ook dezelfde idempotentiesleutel
  -- bij de mailprovider.
  insert into public.tavern_booking_participants (claim_id,full_name,email,amount_cents,status,payment_reference)
  select c.id, trim(d->>'name'), lower(trim(d->>'email')),
         coalesce(c.price_cents,(select price_cents from public.tavern_weekends where id=c.assigned_weekend_id)),
         'awaiting_payment',
         -- `gen_random_uuid()` zit sinds PostgreSQL 13 in de kern; pgcrypto is hier
         -- eerder bewust losgelaten. Twee uuid's geven ruim genoeg onvoorspelbaarheid
         -- voor een kenmerk dat in een betaallink terechtkomt.
         'tav_'||replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','')
  from jsonb_array_elements(coalesce(p_participants,'[]'::jsonb)) as d
  on conflict do nothing;

  -- Eén termijn voor de hele groep. Hij wordt hier berekend en meegegeven aan de mails,
  -- zodat wat er in de mail staat en wat er straks in de database komt hetzelfde zijn.
  v_deadline := clock_timestamp()+make_interval(mins=>greatest(5,least(p_payment_window_minutes,30)));

  return jsonb_build_object('status','ready','claimId',c.id,'seats',c.party_size,
    'deadline',v_deadline,
    'weekendLabel',(select w.label||' · '||w.date_label from public.tavern_weekends w where w.id=c.assigned_weekend_id),
    'name',c.name,
    'participants',(select coalesce(jsonb_agg(jsonb_build_object(
        'id',p.id,'fullName',p.full_name,'email',p.email,
        'amountCents',p.amount_cents,'paymentReference',p.payment_reference)
      order by p.created_at),'[]'::jsonb)
      from public.tavern_booking_participants p where p.claim_id=c.id));
end; $$;
revoke all on function public.prepare_seat_hold_payment(text,text,text,jsonb,text,text,text,text,text,boolean,integer) from public, anon, authenticated;
grant execute on function public.prepare_seat_hold_payment(text,text,text,jsonb,text,text,text,text,text,boolean,integer) to service_role;

create or replace function public.confirm_seat_hold_payment(
  p_claim_id uuid, p_deadline timestamptz, p_sent jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.tavern_seat_claims%rowtype; v_deadline timestamptz; v_open integer;
begin
  perform pg_advisory_xact_lock(hashtext('tavern-weekends'));
  select * into c from public.tavern_seat_claims where id=p_claim_id for update;
  if not found then return jsonb_build_object('status','no_hold'); end if;
  if c.hold_phase='payment' then
    return jsonb_build_object('status','already_in_payment','claimId',c.id,
      'paymentStartedAt',c.payment_started_at);
  end if;

  -- Geen deelnemer zonder verstuurd betaalverzoek. Dit is de grens die voorkomt dat een
  -- boeking in de betaalfase belandt terwijl iemand nooit een link heeft gekregen.
  select count(*) into v_open from public.tavern_booking_participants p
    where p.claim_id=c.id
      and not exists (select 1 from jsonb_array_elements(coalesce(p_sent,'[]'::jsonb)) s
                      where (s->>'participantId')::uuid = p.id);
  if v_open > 0 then
    return jsonb_build_object('status','not_all_sent','open',v_open);
  end if;

  -- De termijn komt van de aanroeper zodat mail en database dezelfde tijd noemen, maar hij
  -- wordt hier begrensd: nooit meer dan 30 minuten vanaf nu, nooit in het verleden.
  v_deadline := least(coalesce(p_deadline, clock_timestamp()+interval '30 minutes'),
                      clock_timestamp()+interval '30 minutes');
  if v_deadline <= clock_timestamp() then v_deadline := clock_timestamp()+interval '30 minutes'; end if;

  update public.tavern_seat_claims
    set status='payment_pending', hold_phase='payment',
        payment_started_at=clock_timestamp(), hold_expires_at=v_deadline
    where id=c.id;

  update public.tavern_booking_participants p
    set payment_link_sent_at=now(),
        payment_link_provider_id=s.provider_id,
        checkout_session_url=s.url
  from (select (e->>'participantId')::uuid as id, e->>'providerId' as provider_id, e->>'url' as url
        from jsonb_array_elements(coalesce(p_sent,'[]'::jsonb)) e) s
  where p.claim_id=c.id and p.id=s.id;

  return jsonb_build_object('status','in_payment','claimId',c.id,'seats',c.party_size,
    'paymentStartedAt',clock_timestamp(),'deadline',v_deadline,
    'participants',(select count(*) from public.tavern_booking_participants where claim_id=c.id));
end; $$;
revoke all on function public.confirm_seat_hold_payment(uuid,timestamptz,jsonb) from public, anon, authenticated;
grant execute on function public.confirm_seat_hold_payment(uuid,timestamptz,jsonb) to service_role;

create or replace function public.abandon_seat_hold_payment(p_claim_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.tavern_seat_claims%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext('tavern-weekends'));
  select * into c from public.tavern_seat_claims where id=p_claim_id for update;
  if not found then return jsonb_build_object('status','no_hold'); end if;
  -- Staat de boeking al in de betaalfase, dan is er niets af te breken: dan zijn de
  -- verzoeken wél verstuurd. Nooit een betaalfase terugdraaien.
  if c.hold_phase='payment' then return jsonb_build_object('status','already_in_payment'); end if;
  -- Alleen deelnemers die nog niets gekregen en niets betaald hebben.
  delete from public.tavern_booking_participants
    where claim_id=c.id and status='awaiting_payment' and payment_link_sent_at is null;
  return jsonb_build_object('status','abandoned','claimId',c.id);
end; $$;
revoke all on function public.abandon_seat_hold_payment(uuid) from public, anon, authenticated;
grant execute on function public.abandon_seat_hold_payment(uuid) to service_role;
