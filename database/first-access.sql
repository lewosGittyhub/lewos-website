-- Tijd onder een slot: PostgreSQL bevriest now() op het begin van de transactie. Wie
-- vlak vóór een deadline binnenkomt en dan op het slot wacht, zou daarna nog met die
-- oude tijd beoordeeld worden. Elke vergelijking met een deadline of vervaltijd, en elke
-- vervaltijd die we zelf uitrekenen, gebruikt daarom clock_timestamp(): de tijd op het
-- moment dat de regel echt draait. De tijdstempels die alleen vastleggen wanneer iets
-- gebeurde blijven now(); daar maakt het geen verschil.
create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.tavern_weekends (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  label text not null,
  date_label text not null,
  sort_order integer unique not null,
  capacity integer not null default 6 check (capacity > 0),
  minimum_players integer not null default 4 check (minimum_players > 0),
  visible boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.tavern_seat_claims (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  party_size integer not null check (party_size between 1 and 12),
  requested_weekend_id uuid references public.tavern_weekends(id),
  assigned_weekend_id uuid references public.tavern_weekends(id),
  offered_weekend_id uuid references public.tavern_weekends(id),
  status text not null check (status in ('first_access_held','alternative_offered','future_weekend_interest','private_inquiry','payment_pending','paid','expired','cancelled')),
  message text,
  consented_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Echte datums naast het tekstlabel. Zonder deze twee kan de kalender een weekend
-- niet op een maandrooster plaatsen; date_label is alleen bedoeld om te tonen.
alter table public.tavern_weekends add column if not exists starts_on date;
alter table public.tavern_weekends add column if not exists ends_on date;
-- Prijs per persoon in centen. Bewust per weekend, want een seizoenseditie kan een
-- andere prijs hebben. Staat niet in de seed hieronder: die draait bij elke migratie
-- opnieuw en zou een prijs die Robert zelf aanpast weer overschrijven.
alter table public.tavern_weekends add column if not exists price_cents integer not null default 202500 check (price_cents > 0);

-- Allergieën en dieetwensen staan bewust in eigen kolommen en niet in `message`. Een
-- allergie die in een vrij tekstveld verdwijnt is een allergie die iemand over het hoofd
-- ziet. `message` blijft bestaan voor overige opmerkingen en wordt niet aangeraakt, dus
-- bestaande aanvragen blijven precies zoals ze zijn: deze twee kolommen zijn dan null.
alter table public.tavern_seat_claims add column if not exists allergies text;
alter table public.tavern_seat_claims add column if not exists dietary_requirements text;
do $$ begin
  if not exists(select 1 from pg_constraint where conname='tavern_seat_claims_allergies_length') then
    alter table public.tavern_seat_claims add constraint tavern_seat_claims_allergies_length check (allergies is null or char_length(allergies)<=500);
  end if;
  if not exists(select 1 from pg_constraint where conname='tavern_seat_claims_dietary_length') then
    alter table public.tavern_seat_claims add constraint tavern_seat_claims_dietary_length check (dietary_requirements is null or char_length(dietary_requirements)<=500);
  end if;
end $$;

alter table public.tavern_seat_claims add column if not exists hold_expires_at timestamptz;
alter table public.tavern_seat_claims add column if not exists payment_reference text;
alter table public.tavern_seat_claims add column if not exists checkout_token_hash text;
alter table public.tavern_seat_claims add column if not exists invitation_expires_at timestamptz;
alter table public.tavern_seat_claims add column if not exists invitation_sent_at timestamptz;
alter table public.tavern_seat_claims add column if not exists invitation_email_provider_id text;
alter table public.tavern_seat_claims add column if not exists receipt_email_sent_at timestamptz;
alter table public.tavern_seat_claims add column if not exists receipt_email_provider_id text;
alter table public.tavern_seat_claims add column if not exists checkout_session_id text;
alter table public.tavern_seat_claims add column if not exists checkout_session_url text;
alter table public.tavern_seat_claims add column if not exists adult_confirmed_at timestamptz;
alter table public.tavern_seat_claims add column if not exists privacy_accepted_at timestamptz;
alter table public.tavern_seat_claims add column if not exists terms_version text;
alter table public.tavern_seat_claims add column if not exists filming_notice_acknowledged_at timestamptz;
alter table public.tavern_seat_claims add column if not exists filming_consent_at timestamptz;
alter table public.tavern_seat_claims add column if not exists confirmation_email_sent_at timestamptz;
alter table public.tavern_seat_claims add column if not exists confirmation_email_provider_id text;
-- De prijs per persoon zoals die gold toen de stoelen werden vastgehouden. Verandert de
-- weekendprijs later, dan blijft zichtbaar wat er met deze gast is afgesproken.
alter table public.tavern_seat_claims add column if not exists price_cents integer;

create table if not exists public.tavern_request_limits (
  key_hash text primary key,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 1
);

create index if not exists tavern_seat_claims_assigned_status_idx on public.tavern_seat_claims (assigned_weekend_id, status);
create index if not exists tavern_seat_claims_requested_weekend_idx on public.tavern_seat_claims (requested_weekend_id);
create index if not exists tavern_seat_claims_offered_weekend_idx on public.tavern_seat_claims (offered_weekend_id);
create unique index if not exists tavern_seat_claims_payment_reference_idx on public.tavern_seat_claims (payment_reference) where payment_reference is not null;
create unique index if not exists tavern_seat_claims_checkout_token_hash_idx on public.tavern_seat_claims (checkout_token_hash) where checkout_token_hash is not null;
create unique index if not exists tavern_seat_claims_checkout_session_id_idx on public.tavern_seat_claims (checkout_session_id) where checkout_session_id is not null;
create index if not exists tavern_seat_claims_invitation_expiry_idx on public.tavern_seat_claims (invitation_expires_at) where status='first_access_held' and invitation_expires_at is not null;
create index if not exists tavern_seat_claims_active_invite_idx on public.tavern_seat_claims (invitation_expires_at) where status in('first_access_held','payment_pending') and checkout_token_hash is not null;
create index if not exists tavern_seat_claims_uninvited_hold_idx on public.tavern_seat_claims (id) where status='first_access_held' and checkout_token_hash is null;
create index if not exists tavern_seat_claims_orphan_hold_idx on public.tavern_seat_claims (hold_expires_at) where status='payment_pending' and checkout_session_id is null;
alter table public.tavern_weekends enable row level security;
alter table public.tavern_seat_claims enable row level security;
alter table public.tavern_request_limits enable row level security;

insert into public.tavern_weekends (slug, label, date_label, sort_order, starts_on, ends_on)
values ('weekend-01', 'Weekend 01', '30 Oct to 2 Nov 2026', 1, date '2026-10-30', date '2026-11-02'),
       ('weekend-02', 'Weekend 02', '6 to 9 Nov 2026', 2, date '2026-11-06', date '2026-11-09')
on conflict (slug) do update set label=excluded.label,date_label=excluded.date_label,sort_order=excluded.sort_order,starts_on=excluded.starts_on,ends_on=excluded.ends_on;

-- Never free an attached Stripe checkout on a local timer alone: a paid
-- webhook may still be in flight. Only orphan holds without an attached
-- Stripe session and unused expired invitations are safe to release here.
create or replace function private.cleanup_tavern_claims()
returns void language plpgsql security definer set search_path=''  as $$
begin
  perform pg_advisory_xact_lock(hashtext('tavern-weekends'));
  update public.tavern_seat_claims
    set status='expired'
    where status='first_access_held'
      and invitation_expires_at is not null
      and invitation_expires_at<=clock_timestamp();
  update public.tavern_seat_claims
    set status=case when checkout_token_hash is not null and invitation_expires_at>clock_timestamp() then 'first_access_held' else 'expired' end,
        hold_expires_at=null,
        payment_reference=null
    where status='payment_pending'
      and checkout_session_id is null
      and hold_expires_at is not null
      and hold_expires_at<=clock_timestamp();
end; $$;
revoke all on function private.cleanup_tavern_claims() from public, anon, authenticated;

drop function if exists public.register_tavern_interest(text,text,integer,text,text);
drop function if exists public.register_tavern_interest(text,text,integer,text,text,timestamptz);
create or replace function public.register_tavern_interest(p_name text,p_email text,p_party_size integer,p_weekend_slug text,p_message text default null,p_first_access_closes_at timestamptz default null,p_allergies text default null,p_dietary text default null)
returns jsonb language plpgsql security definer set search_path=''  as $$
declare requested public.tavern_weekends%rowtype; alternative public.tavern_weekends%rowtype; existing_claim public.tavern_seat_claims%rowtype; occupied integer; active_claims integer; claim_id uuid; details_bijgewerkt boolean;
begin
  if char_length(trim(p_name)) < 2 or char_length(trim(p_name)) > 120 then raise exception 'invalid_name'; end if;
  if p_email !~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then raise exception 'invalid_email'; end if;
  if p_party_size < 1 or p_party_size > 12 then raise exception 'invalid_party_size'; end if;
  -- Niet afkappen maar weigeren. Zie de kolomtoelichting hierboven.
  if char_length(coalesce(p_allergies,'')) > 500 then raise exception 'invalid_allergies'; end if;
  if char_length(coalesce(p_dietary,'')) > 500 then raise exception 'invalid_dietary'; end if;
  if p_weekend_slug='private' then
    if p_party_size < 4 then raise exception 'private_party_too_small'; end if;
    select * into existing_claim from public.tavern_seat_claims where lower(email)=lower(trim(p_email)) and status='private_inquiry' order by created_at desc limit 1;
    if found then
      -- Een herhaalde aanvraag mag nieuwe allergie- of dieetinformatie niet weggooien: dat is
      -- juist het geval waarin iemand terugkomt omdat hij iets vergeten was. Een lege waarde
      -- overschrijft nooit wat er al staat, dus niets kan per ongeluk gewist worden.
      details_bijgewerkt:=(nullif(trim(p_allergies),'') is not null and coalesce(existing_claim.allergies,'') is distinct from trim(p_allergies))
        or (nullif(trim(p_dietary),'') is not null and coalesce(existing_claim.dietary_requirements,'') is distinct from trim(p_dietary))
        or (nullif(trim(p_message),'') is not null and coalesce(existing_claim.message,'') is distinct from trim(p_message));
      if details_bijgewerkt then
        update public.tavern_seat_claims set
          allergies=coalesce(nullif(trim(p_allergies),''),allergies),
          dietary_requirements=coalesce(nullif(trim(p_dietary),''),dietary_requirements),
          message=coalesce(nullif(trim(p_message),''),message)
        where id=existing_claim.id;
      end if;
      return jsonb_build_object('status','private_inquiry','claimId',existing_claim.id,'duplicate',true,'detailsUpdated',details_bijgewerkt,'receiptEmailSent',existing_claim.receipt_email_sent_at is not null);
    end if;
    insert into public.tavern_seat_claims(name,email,party_size,status,message,allergies,dietary_requirements,consented_at) values(trim(p_name),lower(trim(p_email)),p_party_size,'private_inquiry',nullif(trim(p_message),''),nullif(trim(p_allergies),''),nullif(trim(p_dietary),''),now()) returning id into claim_id;
    return jsonb_build_object('status','private_inquiry','claimId',claim_id);
  end if;
  select * into requested from public.tavern_weekends where slug=p_weekend_slug and visible=true;
  if not found then raise exception 'unknown_weekend'; end if;
  if p_party_size > requested.capacity then raise exception 'party_too_large'; end if;
  perform pg_advisory_xact_lock(hashtext('tavern-weekends'));
  perform private.cleanup_tavern_claims();
  if p_first_access_closes_at is null or clock_timestamp()>=p_first_access_closes_at then raise exception 'first_access_closed'; end if;
  select * into existing_claim from public.tavern_seat_claims where lower(email)=lower(trim(p_email)) and assigned_weekend_id=requested.id and status in('first_access_held','payment_pending','paid') order by created_at limit 1;
  if found then
    -- Een herhaalde aanvraag mag nieuwe allergie- of dieetinformatie niet weggooien: dat is
    -- juist het geval waarin iemand terugkomt omdat hij iets vergeten was. Een lege waarde
    -- overschrijft nooit wat er al staat, dus niets kan per ongeluk gewist worden.
    details_bijgewerkt:=(nullif(trim(p_allergies),'') is not null and coalesce(existing_claim.allergies,'') is distinct from trim(p_allergies))
      or (nullif(trim(p_dietary),'') is not null and coalesce(existing_claim.dietary_requirements,'') is distinct from trim(p_dietary))
      or (nullif(trim(p_message),'') is not null and coalesce(existing_claim.message,'') is distinct from trim(p_message));
    if details_bijgewerkt then
      update public.tavern_seat_claims set
        allergies=coalesce(nullif(trim(p_allergies),''),allergies),
        dietary_requirements=coalesce(nullif(trim(p_dietary),''),dietary_requirements),
        message=coalesce(nullif(trim(p_message),''),message)
      where id=existing_claim.id;
    end if;
    return jsonb_build_object('status',existing_claim.status,'claimId',existing_claim.id,'weekend',requested.slug,'weekendLabel',requested.label||' · '||requested.date_label,'seats',existing_claim.party_size,'duplicate',true,'detailsUpdated',details_bijgewerkt,'receiptEmailSent',existing_claim.receipt_email_sent_at is not null);
  end if;
  select count(*)::integer into active_claims from public.tavern_seat_claims where lower(email)=lower(trim(p_email)) and status in('first_access_held','payment_pending','paid');
  if active_claims >= 2 then raise exception 'email_claim_limit'; end if;
  select coalesce(sum(party_size),0)::integer into occupied from public.tavern_seat_claims where assigned_weekend_id=requested.id and status in('first_access_held','payment_pending','paid');
  if requested.capacity-occupied >= p_party_size then
    insert into public.tavern_seat_claims(name,email,party_size,requested_weekend_id,assigned_weekend_id,status,message,allergies,dietary_requirements,consented_at) values(trim(p_name),lower(trim(p_email)),p_party_size,requested.id,requested.id,'first_access_held',nullif(trim(p_message),''),nullif(trim(p_allergies),''),nullif(trim(p_dietary),''),now()) returning id into claim_id;
    return jsonb_build_object('status','first_access_held','claimId',claim_id,'weekend',requested.slug,'weekendLabel',requested.label||' · '||requested.date_label,'seats',p_party_size,'remaining',requested.capacity-occupied-p_party_size);
  end if;
  select w.* into alternative from public.tavern_weekends w where w.visible=true and w.sort_order>requested.sort_order and w.capacity-coalesce((select sum(c.party_size) from public.tavern_seat_claims c where c.assigned_weekend_id=w.id and c.status in('first_access_held','payment_pending','paid')),0)>=p_party_size order by w.sort_order limit 1;
  if found then
    select * into existing_claim from public.tavern_seat_claims where lower(email)=lower(trim(p_email)) and requested_weekend_id=requested.id and offered_weekend_id=alternative.id and status='alternative_offered' order by created_at limit 1;
    if found then
      -- Een herhaalde aanvraag mag nieuwe allergie- of dieetinformatie niet weggooien: dat is
      -- juist het geval waarin iemand terugkomt omdat hij iets vergeten was. Een lege waarde
      -- overschrijft nooit wat er al staat, dus niets kan per ongeluk gewist worden.
      details_bijgewerkt:=(nullif(trim(p_allergies),'') is not null and coalesce(existing_claim.allergies,'') is distinct from trim(p_allergies))
        or (nullif(trim(p_dietary),'') is not null and coalesce(existing_claim.dietary_requirements,'') is distinct from trim(p_dietary))
        or (nullif(trim(p_message),'') is not null and coalesce(existing_claim.message,'') is distinct from trim(p_message));
      if details_bijgewerkt then
        update public.tavern_seat_claims set
          allergies=coalesce(nullif(trim(p_allergies),''),allergies),
          dietary_requirements=coalesce(nullif(trim(p_dietary),''),dietary_requirements),
          message=coalesce(nullif(trim(p_message),''),message)
        where id=existing_claim.id;
      end if;
      return jsonb_build_object('status','alternative_offered','claimId',existing_claim.id,'requestedWeekend',requested.label||' · '||requested.date_label,'offeredWeekend',alternative.slug,'offeredWeekendLabel',alternative.label||' · '||alternative.date_label,'seats',existing_claim.party_size,'duplicate',true,'detailsUpdated',details_bijgewerkt,'receiptEmailSent',existing_claim.receipt_email_sent_at is not null);
    end if;
    insert into public.tavern_seat_claims(name,email,party_size,requested_weekend_id,offered_weekend_id,status,message,allergies,dietary_requirements,consented_at) values(trim(p_name),lower(trim(p_email)),p_party_size,requested.id,alternative.id,'alternative_offered',nullif(trim(p_message),''),nullif(trim(p_allergies),''),nullif(trim(p_dietary),''),now()) returning id into claim_id;
    return jsonb_build_object('status','alternative_offered','claimId',claim_id,'requestedWeekend',requested.label||' · '||requested.date_label,'offeredWeekend',alternative.slug,'offeredWeekendLabel',alternative.label||' · '||alternative.date_label,'seats',p_party_size);
  end if;
  select * into existing_claim from public.tavern_seat_claims where lower(email)=lower(trim(p_email)) and requested_weekend_id=requested.id and status='future_weekend_interest' order by created_at limit 1;
  if found then
    -- Een herhaalde aanvraag mag nieuwe allergie- of dieetinformatie niet weggooien: dat is
    -- juist het geval waarin iemand terugkomt omdat hij iets vergeten was. Een lege waarde
    -- overschrijft nooit wat er al staat, dus niets kan per ongeluk gewist worden.
    details_bijgewerkt:=(nullif(trim(p_allergies),'') is not null and coalesce(existing_claim.allergies,'') is distinct from trim(p_allergies))
      or (nullif(trim(p_dietary),'') is not null and coalesce(existing_claim.dietary_requirements,'') is distinct from trim(p_dietary))
      or (nullif(trim(p_message),'') is not null and coalesce(existing_claim.message,'') is distinct from trim(p_message));
    if details_bijgewerkt then
      update public.tavern_seat_claims set
        allergies=coalesce(nullif(trim(p_allergies),''),allergies),
        dietary_requirements=coalesce(nullif(trim(p_dietary),''),dietary_requirements),
        message=coalesce(nullif(trim(p_message),''),message)
      where id=existing_claim.id;
    end if;
    return jsonb_build_object('status','future_weekend_interest','claimId',existing_claim.id,'requestedWeekend',requested.label||' · '||requested.date_label,'seats',existing_claim.party_size,'duplicate',true,'detailsUpdated',details_bijgewerkt,'receiptEmailSent',existing_claim.receipt_email_sent_at is not null);
  end if;
  insert into public.tavern_seat_claims(name,email,party_size,requested_weekend_id,status,message,allergies,dietary_requirements,consented_at) values(trim(p_name),lower(trim(p_email)),p_party_size,requested.id,'future_weekend_interest',nullif(trim(p_message),''),nullif(trim(p_allergies),''),nullif(trim(p_dietary),''),now()) returning id into claim_id;
  return jsonb_build_object('status','future_weekend_interest','claimId',claim_id,'requestedWeekend',requested.label||' · '||requested.date_label,'seats',p_party_size);
end; $$;
revoke all on function public.register_tavern_interest(text,text,integer,text,text,timestamptz,text,text) from public, anon, authenticated;
grant execute on function public.register_tavern_interest(text,text,integer,text,text,timestamptz,text,text) to service_role;

create or replace function public.mark_tavern_receipt_email_sent(p_claim_id uuid,p_provider_id text)
returns jsonb language plpgsql security definer set search_path=''  as $$
declare marked_id uuid;
begin
  update public.tavern_seat_claims
    set receipt_email_sent_at=coalesce(receipt_email_sent_at,now()),receipt_email_provider_id=coalesce(receipt_email_provider_id,nullif(trim(p_provider_id),''))
    where id=p_claim_id and receipt_email_sent_at is null
    returning id into marked_id;
  if marked_id is null then
    if exists(select 1 from public.tavern_seat_claims where id=p_claim_id and receipt_email_sent_at is not null) then return jsonb_build_object('status','already_marked','claimId',p_claim_id); end if;
    return jsonb_build_object('status','unknown_claim');
  end if;
  return jsonb_build_object('status','marked','claimId',marked_id);
end; $$;
revoke all on function public.mark_tavern_receipt_email_sent(uuid,text) from public, anon, authenticated;
grant execute on function public.mark_tavern_receipt_email_sent(uuid,text) to service_role;

create or replace function public.get_tavern_availability()
returns jsonb language plpgsql security definer set search_path=''  as $$
declare result jsonb;
begin
  perform private.cleanup_tavern_claims();
  select coalesce(jsonb_agg(jsonb_build_object(
    'slug',w.slug,
    'label',w.label,
    'dateLabel',w.date_label,
    'capacity',w.capacity,
    'startsOn',w.starts_on,
    'endsOn',w.ends_on,
    'priceCents',w.price_cents,
    'remaining',greatest(w.capacity-coalesce(c.occupied,0),0)
  ) order by w.sort_order),'[]'::jsonb) into result
  from public.tavern_weekends w
  left join (
    select assigned_weekend_id,sum(party_size)::integer as occupied
    from public.tavern_seat_claims
    where status in('first_access_held','payment_pending','paid')
    group by assigned_weekend_id
  ) c on c.assigned_weekend_id=w.id
  where w.visible=true;
  return result;
end;
$$;
revoke all on function public.get_tavern_availability() from public, anon, authenticated;
grant execute on function public.get_tavern_availability() to service_role;

-- Public booking may open only after every promised private invitation window
-- has ended. This remains fail-closed even if the configured opening time is
-- accidentally moved forward after invitations have already been issued.
create or replace function public.tavern_public_booking_ready()
returns boolean language plpgsql security definer set search_path=''  as $$
begin
  perform private.cleanup_tavern_claims();
  return not exists(
    select 1 from public.tavern_seat_claims where
      (status='first_access_held' and checkout_token_hash is null)
      or
      (status in('first_access_held','payment_pending') and checkout_token_hash is not null and invitation_expires_at>clock_timestamp())
  );
end; $$;
revoke all on function public.tavern_public_booking_ready() from public, anon, authenticated;
grant execute on function public.tavern_public_booking_ready() to service_role;

create or replace function public.check_tavern_request_limit(p_key_hash text,p_limit integer default 5,p_window_minutes integer default 15)
returns boolean language plpgsql security definer set search_path=''  as $$
declare current_attempts integer;
begin
  if p_key_hash is null or char_length(p_key_hash) < 32 then return false; end if;
  perform pg_advisory_xact_lock(hashtext('tavern-rate-'||p_key_hash));
  delete from public.tavern_request_limits where window_started_at < clock_timestamp()-make_interval(mins=>p_window_minutes);
  insert into public.tavern_request_limits(key_hash,window_started_at,attempts)
  values(p_key_hash,now(),1)
  on conflict(key_hash) do update set attempts=public.tavern_request_limits.attempts+1
  returning attempts into current_attempts;
  return current_attempts <= p_limit;
end; $$;
revoke all on function public.check_tavern_request_limit(text,integer,integer) from public, anon, authenticated;
grant execute on function public.check_tavern_request_limit(text,integer,integer) to service_role;

-- Public-sale checkout protection. The first complete party to start checkout
-- receives a short hold; payment speed never decides who gets the seats.
drop function if exists public.begin_tavern_checkout(text,text,integer,text,text,integer);
drop function if exists public.begin_tavern_checkout(text,text,integer,text,text,boolean,boolean,text,boolean,integer);
-- De publieke checkout maakt een nieuwe claim en is daarmee het enige andere pad waarop
-- een gast zijn allergie kan doorgeven. Zelfde drie velden, zelfde grenzen, zelfde regel:
-- weigeren in plaats van afkappen.
drop function if exists public.begin_tavern_checkout(text,text,integer,text,text,boolean,boolean,text,boolean,timestamptz,integer);
create or replace function public.begin_tavern_checkout(p_name text,p_email text,p_party_size integer,p_weekend_slug text,p_payment_reference text,p_adult_confirmed boolean,p_privacy_accepted boolean,p_terms_version text,p_filming_consent boolean,p_public_booking_opens_at timestamptz,p_hold_minutes integer default 30,p_allergies text default null,p_dietary text default null,p_message text default null)
returns jsonb language plpgsql security definer set search_path=''  as $$
declare requested public.tavern_weekends%rowtype; occupied integer; claim_id uuid; expires_at timestamptz;
begin
  if p_party_size < 1 or p_party_size > 6 then raise exception 'invalid_party_size'; end if;
  if char_length(coalesce(p_allergies,'')) > 500 then raise exception 'invalid_allergies'; end if;
  if char_length(coalesce(p_dietary,'')) > 500 then raise exception 'invalid_dietary'; end if;
  if char_length(coalesce(p_message,'')) > 2000 then raise exception 'invalid_message'; end if;
  if p_adult_confirmed is not true or p_privacy_accepted is not true then raise exception 'required_terms_not_accepted'; end if;
  if p_terms_version is null or char_length(trim(p_terms_version)) < 1 then raise exception 'missing_terms_version'; end if;
  select * into requested from public.tavern_weekends where slug=p_weekend_slug and visible=true;
  if not found then raise exception 'unknown_weekend'; end if;
  perform pg_advisory_xact_lock(hashtext('tavern-weekends'));
  perform private.cleanup_tavern_claims();
  if p_public_booking_opens_at is null or clock_timestamp()<p_public_booking_opens_at then return jsonb_build_object('status','booking_not_open'); end if;
  if exists(select 1 from public.tavern_seat_claims where
    (status='first_access_held' and checkout_token_hash is null)
    or
    (status in('first_access_held','payment_pending') and checkout_token_hash is not null and invitation_expires_at>clock_timestamp()))
  then return jsonb_build_object('status','first_access_windows_active'); end if;
  select coalesce(sum(party_size),0)::integer into occupied from public.tavern_seat_claims
    where assigned_weekend_id=requested.id and status in('first_access_held','payment_pending','paid');
  if requested.capacity-occupied < p_party_size then
    return jsonb_build_object('status','not_available','remaining',greatest(requested.capacity-occupied,0));
  end if;
  expires_at:=clock_timestamp()+make_interval(mins=>greatest(5,least(p_hold_minutes,60)));
  insert into public.tavern_seat_claims(name,email,party_size,requested_weekend_id,assigned_weekend_id,status,allergies,dietary_requirements,message,consented_at,hold_expires_at,payment_reference,price_cents,adult_confirmed_at,privacy_accepted_at,terms_version,filming_notice_acknowledged_at,filming_consent_at)
  values(trim(p_name),lower(trim(p_email)),p_party_size,requested.id,requested.id,'payment_pending',nullif(trim(p_allergies),''),nullif(trim(p_dietary),''),nullif(trim(p_message),''),now(),expires_at,p_payment_reference,requested.price_cents,now(),now(),trim(p_terms_version),case when requested.slug='weekend-01' then now() else null end,case when requested.slug='weekend-01' and p_filming_consent is true then now() else null end)
  returning id into claim_id;
  return jsonb_build_object('status','payment_pending','claimId',claim_id,'seats',p_party_size,'priceCents',requested.price_cents,'holdExpiresAt',expires_at,'remaining',requested.capacity-occupied-p_party_size);
end; $$;
revoke all on function public.begin_tavern_checkout(text,text,integer,text,text,boolean,boolean,text,boolean,timestamptz,integer,text,text,text) from public, anon, authenticated;
grant execute on function public.begin_tavern_checkout(text,text,integer,text,text,boolean,boolean,text,boolean,timestamptz,integer,text,text,text) to service_role;

drop function if exists public.confirm_tavern_payment(text);
create or replace function public.confirm_tavern_payment(p_payment_reference text,p_paid_at timestamptz)
returns jsonb language plpgsql security definer set search_path=''  as $$
declare claim public.tavern_seat_claims%rowtype; weekend public.tavern_weekends%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext('tavern-weekends'));
  select * into claim from public.tavern_seat_claims where payment_reference=p_payment_reference for update;
  if not found then return jsonb_build_object('status','unknown_payment'); end if;
  select * into weekend from public.tavern_weekends where id=claim.assigned_weekend_id;
  if claim.status='paid' then return jsonb_build_object('status','paid','claimId',claim.id,'name',claim.name,'email',claim.email,'seats',claim.party_size,'weekendLabel',weekend.label||' · '||weekend.date_label,'allergies',claim.allergies,'dietary',claim.dietary_requirements,'notes',claim.message,'termsVersion',claim.terms_version,'confirmationEmailSent',claim.confirmation_email_sent_at is not null,'duplicate',true); end if;
  -- The Stripe session expiry is set a moment after the database hold begins, so
  -- a payment accepted in that final sliver can carry a timestamp just past the
  -- hold. Stripe never accepts payment on an expired session, so this narrow
  -- grace only absorbs clock skew; a released seat is already caught above.
  if claim.status<>'payment_pending' or claim.hold_expires_at is null or p_paid_at is null or p_paid_at>claim.hold_expires_at+interval '5 minutes' then
    return jsonb_build_object('status','expired','claimId',claim.id);
  end if;
  update public.tavern_seat_claims set status='paid',hold_expires_at=null where id=claim.id;
  return jsonb_build_object('status','paid','claimId',claim.id,'name',claim.name,'email',claim.email,'seats',claim.party_size,'weekendLabel',weekend.label||' · '||weekend.date_label,'allergies',claim.allergies,'dietary',claim.dietary_requirements,'notes',claim.message,'termsVersion',claim.terms_version,'confirmationEmailSent',false);
end; $$;
revoke all on function public.confirm_tavern_payment(text,timestamptz) from public, anon, authenticated;
grant execute on function public.confirm_tavern_payment(text,timestamptz) to service_role;

create or replace function public.mark_tavern_confirmation_email_sent(p_payment_reference text,p_provider_id text)
returns jsonb language plpgsql security definer set search_path=''  as $$
declare claim_id uuid;
begin
  update public.tavern_seat_claims
    set confirmation_email_sent_at=coalesce(confirmation_email_sent_at,now()),
        confirmation_email_provider_id=coalesce(confirmation_email_provider_id,nullif(trim(p_provider_id),''))
    where payment_reference=p_payment_reference and status='paid'
    returning id into claim_id;
  if claim_id is null then return jsonb_build_object('status','unknown_payment'); end if;
  return jsonb_build_object('status','marked','claimId',claim_id);
end; $$;
revoke all on function public.mark_tavern_confirmation_email_sent(text,text) from public, anon, authenticated;
grant execute on function public.mark_tavern_confirmation_email_sent(text,text) to service_role;

-- First Access invitations are issued only when the private payment window opens.
-- Store a hash, never the guest's raw invitation token.
create or replace function public.issue_tavern_checkout_invitation(p_claim_id uuid,p_token_hash text,p_window_hours integer default 24)
returns jsonb language plpgsql security definer set search_path=''  as $$
declare claim public.tavern_seat_claims%rowtype; weekend public.tavern_weekends%rowtype; expires_at timestamptz;
begin
  if p_token_hash is null or char_length(p_token_hash)<>64 then raise exception 'invalid_token_hash'; end if;
  select * into claim from public.tavern_seat_claims where id=p_claim_id for update;
  if not found then return jsonb_build_object('status','unknown_claim'); end if;
  if claim.status<>'first_access_held' then return jsonb_build_object('status','claim_not_eligible'); end if;
  if claim.checkout_token_hash is not null and claim.invitation_expires_at>clock_timestamp() then return jsonb_build_object('status','already_invited','claimId',claim.id); end if;
  select * into weekend from public.tavern_weekends where id=claim.assigned_weekend_id;
  expires_at:=clock_timestamp()+make_interval(hours=>greatest(1,least(p_window_hours,72)));
  update public.tavern_seat_claims
    set checkout_token_hash=p_token_hash,invitation_expires_at=expires_at,invitation_sent_at=null,invitation_email_provider_id=null
    where id=claim.id;
  return jsonb_build_object('status','invited','claimId',claim.id,'name',claim.name,'email',claim.email,'expiresAt',expires_at,'seats',claim.party_size,'weekendLabel',weekend.label||' · '||weekend.date_label);
end; $$;
revoke all on function public.issue_tavern_checkout_invitation(uuid,text,integer) from public, anon, authenticated;
grant execute on function public.issue_tavern_checkout_invitation(uuid,text,integer) to service_role;

create or replace function public.mark_tavern_invitation_sent(p_claim_id uuid,p_provider_id text)
returns jsonb language plpgsql security definer set search_path=''  as $$
declare marked_id uuid;
begin
  update public.tavern_seat_claims
    set invitation_sent_at=coalesce(invitation_sent_at,now()),invitation_email_provider_id=coalesce(invitation_email_provider_id,nullif(trim(p_provider_id),''))
    where id=p_claim_id and status='first_access_held' and checkout_token_hash is not null and invitation_expires_at>clock_timestamp()
    returning id into marked_id;
  if marked_id is null then return jsonb_build_object('status','not_marked'); end if;
  return jsonb_build_object('status','marked','claimId',marked_id);
end; $$;
revoke all on function public.mark_tavern_invitation_sent(uuid,text) from public, anon, authenticated;
grant execute on function public.mark_tavern_invitation_sent(uuid,text) to service_role;

create or replace function public.revoke_tavern_checkout_invitation(p_claim_id uuid,p_token_hash text)
returns jsonb language plpgsql security definer set search_path=''  as $$
declare revoked_id uuid;
begin
  update public.tavern_seat_claims
    set checkout_token_hash=null,invitation_expires_at=null,invitation_sent_at=null,invitation_email_provider_id=null
    where id=p_claim_id and status='first_access_held' and checkout_token_hash=p_token_hash and invitation_sent_at is null
    returning id into revoked_id;
  if revoked_id is null then return jsonb_build_object('status','not_revoked'); end if;
  return jsonb_build_object('status','revoked','claimId',revoked_id);
end; $$;
revoke all on function public.revoke_tavern_checkout_invitation(uuid,text) from public, anon, authenticated;
grant execute on function public.revoke_tavern_checkout_invitation(uuid,text) to service_role;

drop function if exists public.begin_tavern_first_access_checkout(text,text,integer);
-- Ook hier de drie velden, maar dit pad hervat een bestaande claim in plaats van er een
-- te maken. Een lege waarde laat dus staan wat de gast bij zijn aanmelding heeft ingevuld;
-- alleen iets nieuws overschrijft. Wie zijn allergie vergeten was kan hem hier alsnog
-- toevoegen, vlak voor hij betaalt.
drop function if exists public.begin_tavern_first_access_checkout(text,text,boolean,boolean,text,boolean,integer);
create or replace function public.begin_tavern_first_access_checkout(p_token_hash text,p_payment_reference text,p_adult_confirmed boolean,p_privacy_accepted boolean,p_terms_version text,p_filming_consent boolean,p_hold_minutes integer default 30,p_allergies text default null,p_dietary text default null,p_message text default null)
returns jsonb language plpgsql security definer set search_path=''  as $$
declare claim public.tavern_seat_claims%rowtype; weekend public.tavern_weekends%rowtype; expires_at timestamptz;
begin
  if p_adult_confirmed is not true or p_privacy_accepted is not true then raise exception 'confirmations_required'; end if;
  if p_terms_version is null or char_length(trim(p_terms_version))<1 then raise exception 'missing_terms_version'; end if;
  if char_length(coalesce(p_allergies,'')) > 500 then raise exception 'invalid_allergies'; end if;
  if char_length(coalesce(p_dietary,'')) > 500 then raise exception 'invalid_dietary'; end if;
  if char_length(coalesce(p_message,'')) > 2000 then raise exception 'invalid_message'; end if;
  perform pg_advisory_xact_lock(hashtext('tavern-weekends'));
  perform private.cleanup_tavern_claims();
  select * into claim from public.tavern_seat_claims where checkout_token_hash=p_token_hash for update;
  if not found then return jsonb_build_object('status','invalid_invitation'); end if;
  if claim.status='paid' then return jsonb_build_object('status','already_paid'); end if;
  select * into weekend from public.tavern_weekends where id=claim.assigned_weekend_id;
  if claim.status='payment_pending' and claim.hold_expires_at>clock_timestamp() then
    update public.tavern_seat_claims set allergies=coalesce(nullif(trim(p_allergies),''),allergies),dietary_requirements=coalesce(nullif(trim(p_dietary),''),dietary_requirements),message=coalesce(nullif(trim(p_message),''),message),adult_confirmed_at=coalesce(adult_confirmed_at,now()),privacy_accepted_at=coalesce(privacy_accepted_at,now()),terms_version=coalesce(terms_version,trim(p_terms_version)),filming_notice_acknowledged_at=case when weekend.slug='weekend-01' then coalesce(filming_notice_acknowledged_at,now()) else filming_notice_acknowledged_at end,filming_consent_at=case when weekend.slug='weekend-01' and p_filming_consent is true then coalesce(filming_consent_at,now()) else filming_consent_at end where id=claim.id;
    return jsonb_build_object('status','payment_pending','claimId',claim.id,'name',claim.name,'email',claim.email,'seats',claim.party_size,'priceCents',coalesce(claim.price_cents,weekend.price_cents),'weekend',weekend.slug,'weekendLabel',weekend.label||' · '||weekend.date_label,'holdExpiresAt',claim.hold_expires_at,'paymentReference',claim.payment_reference,'checkoutUrl',claim.checkout_session_url);
  end if;
  if claim.status='payment_pending' and claim.checkout_session_id is not null then
    return jsonb_build_object('status','payment_reconciliation_pending','claimId',claim.id);
  end if;
  if claim.invitation_expires_at is null or claim.invitation_expires_at<=clock_timestamp() then
    update public.tavern_seat_claims set status='expired' where id=claim.id and status in('first_access_held','payment_pending');
    return jsonb_build_object('status','invitation_expired');
  end if;
  if claim.status not in('first_access_held','payment_pending') then return jsonb_build_object('status','claim_not_eligible'); end if;
  expires_at:=clock_timestamp()+make_interval(mins=>greatest(5,least(p_hold_minutes,60)));
  update public.tavern_seat_claims set allergies=coalesce(nullif(trim(p_allergies),''),allergies),dietary_requirements=coalesce(nullif(trim(p_dietary),''),dietary_requirements),message=coalesce(nullif(trim(p_message),''),message),status='payment_pending',hold_expires_at=expires_at,payment_reference=p_payment_reference,price_cents=weekend.price_cents,adult_confirmed_at=now(),privacy_accepted_at=now(),terms_version=trim(p_terms_version),filming_notice_acknowledged_at=case when weekend.slug='weekend-01' then now() else null end,filming_consent_at=case when weekend.slug='weekend-01' and p_filming_consent is true then now() else null end
    where id=claim.id;
  return jsonb_build_object('status','payment_pending','claimId',claim.id,'name',claim.name,'email',claim.email,'seats',claim.party_size,'priceCents',weekend.price_cents,'weekend',weekend.slug,'weekendLabel',weekend.label||' · '||weekend.date_label,'holdExpiresAt',expires_at);
end; $$;
revoke all on function public.begin_tavern_first_access_checkout(text,text,boolean,boolean,text,boolean,integer,text,text,text) from public, anon, authenticated;
grant execute on function public.begin_tavern_first_access_checkout(text,text,boolean,boolean,text,boolean,integer,text,text,text) to service_role;

drop function if exists public.attach_tavern_checkout_session(text,text,text,boolean,boolean,text,boolean);
create or replace function public.attach_tavern_checkout_session(p_payment_reference text,p_checkout_session_id text,p_checkout_session_url text)
returns jsonb language plpgsql security definer set search_path=''  as $$
declare claim_id uuid;
begin
  update public.tavern_seat_claims set checkout_session_id=p_checkout_session_id,checkout_session_url=p_checkout_session_url
    where payment_reference=p_payment_reference and status='payment_pending'
    returning id into claim_id;
  if claim_id is null then return jsonb_build_object('status','unknown_payment'); end if;
  return jsonb_build_object('status','attached','claimId',claim_id);
end; $$;
revoke all on function public.attach_tavern_checkout_session(text,text,text) from public, anon, authenticated;
grant execute on function public.attach_tavern_checkout_session(text,text,text) to service_role;

create or replace function public.release_tavern_checkout(p_payment_reference text)
returns jsonb language plpgsql security definer set search_path=''  as $$
declare claim public.tavern_seat_claims%rowtype;
begin
  select * into claim from public.tavern_seat_claims where payment_reference=p_payment_reference for update;
  if not found then return jsonb_build_object('status','unknown_payment'); end if;
  if claim.status='payment_pending' then
    update public.tavern_seat_claims set
      status=case when checkout_token_hash is not null and invitation_expires_at>clock_timestamp() then 'first_access_held' else 'cancelled' end,
      hold_expires_at=null,payment_reference=null,checkout_session_id=null,checkout_session_url=null
      where id=claim.id;
    return jsonb_build_object('status','released','claimId',claim.id);
  end if;
  return jsonb_build_object('status',claim.status,'claimId',claim.id);
end; $$;
revoke all on function public.release_tavern_checkout(text) from public, anon, authenticated;
grant execute on function public.release_tavern_checkout(text) to service_role;
