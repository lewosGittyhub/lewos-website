create extension if not exists pgcrypto;

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

alter table public.tavern_seat_claims add column if not exists hold_expires_at timestamptz;
alter table public.tavern_seat_claims add column if not exists payment_reference text;

create table if not exists public.tavern_request_limits (
  key_hash text primary key,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 1
);

create index if not exists tavern_seat_claims_assigned_status_idx on public.tavern_seat_claims (assigned_weekend_id, status);
create unique index if not exists tavern_seat_claims_payment_reference_idx on public.tavern_seat_claims (payment_reference) where payment_reference is not null;
alter table public.tavern_weekends enable row level security;
alter table public.tavern_seat_claims enable row level security;
alter table public.tavern_request_limits enable row level security;

insert into public.tavern_weekends (slug, label, date_label, sort_order)
values ('weekend-01', 'Weekend 01', '30 Oct to 2 Nov 2026', 1), ('weekend-02', 'Weekend 02', '6 to 9 Nov 2026', 2)
on conflict (slug) do update set label=excluded.label,date_label=excluded.date_label,sort_order=excluded.sort_order;

create or replace function public.register_tavern_interest(p_name text,p_email text,p_party_size integer,p_weekend_slug text,p_message text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare requested tavern_weekends%rowtype; alternative tavern_weekends%rowtype; existing_claim tavern_seat_claims%rowtype; occupied integer; claim_id uuid;
begin
  if char_length(trim(p_name)) < 2 or char_length(trim(p_name)) > 120 then raise exception 'invalid_name'; end if;
  if p_email !~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then raise exception 'invalid_email'; end if;
  if p_party_size < 1 or p_party_size > 12 then raise exception 'invalid_party_size'; end if;
  if p_weekend_slug='private' then
    if p_party_size < 4 then raise exception 'private_party_too_small'; end if;
    insert into tavern_seat_claims(name,email,party_size,status,message,consented_at) values(trim(p_name),lower(trim(p_email)),p_party_size,'private_inquiry',nullif(trim(p_message),''),now()) returning id into claim_id;
    return jsonb_build_object('status','private_inquiry','claimId',claim_id);
  end if;
  select * into requested from tavern_weekends where slug=p_weekend_slug and visible=true;
  if not found then raise exception 'unknown_weekend'; end if;
  if p_party_size > requested.capacity then raise exception 'party_too_large'; end if;
  perform pg_advisory_xact_lock(hashtext('tavern-weekends'));
  select * into existing_claim from tavern_seat_claims where lower(email)=lower(trim(p_email)) and assigned_weekend_id=requested.id and status in('first_access_held','payment_pending','paid') order by created_at limit 1;
  if found then
    return jsonb_build_object('status',existing_claim.status,'claimId',existing_claim.id,'weekend',requested.slug,'weekendLabel',requested.label||' · '||requested.date_label,'seats',existing_claim.party_size,'duplicate',true);
  end if;
  select coalesce(sum(party_size),0)::integer into occupied from tavern_seat_claims where assigned_weekend_id=requested.id and (status in('first_access_held','paid') or (status='payment_pending' and (hold_expires_at is null or hold_expires_at>now())));
  if requested.capacity-occupied >= p_party_size then
    insert into tavern_seat_claims(name,email,party_size,requested_weekend_id,assigned_weekend_id,status,message,consented_at) values(trim(p_name),lower(trim(p_email)),p_party_size,requested.id,requested.id,'first_access_held',nullif(trim(p_message),''),now()) returning id into claim_id;
    return jsonb_build_object('status','first_access_held','claimId',claim_id,'weekend',requested.slug,'weekendLabel',requested.label||' · '||requested.date_label,'seats',p_party_size,'remaining',requested.capacity-occupied-p_party_size);
  end if;
  select w.* into alternative from tavern_weekends w where w.visible=true and w.sort_order>requested.sort_order and w.capacity-coalesce((select sum(c.party_size) from tavern_seat_claims c where c.assigned_weekend_id=w.id and (c.status in('first_access_held','paid') or (c.status='payment_pending' and (c.hold_expires_at is null or c.hold_expires_at>now())))),0)>=p_party_size order by w.sort_order limit 1;
  if found then
    insert into tavern_seat_claims(name,email,party_size,requested_weekend_id,offered_weekend_id,status,message,consented_at) values(trim(p_name),lower(trim(p_email)),p_party_size,requested.id,alternative.id,'alternative_offered',nullif(trim(p_message),''),now()) returning id into claim_id;
    return jsonb_build_object('status','alternative_offered','claimId',claim_id,'requestedWeekend',requested.label||' · '||requested.date_label,'offeredWeekend',alternative.slug,'offeredWeekendLabel',alternative.label||' · '||alternative.date_label,'seats',p_party_size);
  end if;
  insert into tavern_seat_claims(name,email,party_size,requested_weekend_id,status,message,consented_at) values(trim(p_name),lower(trim(p_email)),p_party_size,requested.id,'future_weekend_interest',nullif(trim(p_message),''),now()) returning id into claim_id;
  return jsonb_build_object('status','future_weekend_interest','claimId',claim_id,'requestedWeekend',requested.label||' · '||requested.date_label,'seats',p_party_size);
end; $$;
revoke all on function public.register_tavern_interest(text,text,integer,text,text) from public;
grant execute on function public.register_tavern_interest(text,text,integer,text,text) to service_role;

create or replace function public.get_tavern_availability()
returns jsonb language sql security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'slug',w.slug,
    'label',w.label,
    'dateLabel',w.date_label,
    'capacity',w.capacity,
    'remaining',greatest(w.capacity-coalesce(c.occupied,0),0)
  ) order by w.sort_order),'[]'::jsonb)
  from tavern_weekends w
  left join (
    select assigned_weekend_id,sum(party_size)::integer as occupied
    from tavern_seat_claims
    where status in('first_access_held','paid') or (status='payment_pending' and (hold_expires_at is null or hold_expires_at>now()))
    group by assigned_weekend_id
  ) c on c.assigned_weekend_id=w.id
  where w.visible=true;
$$;
revoke all on function public.get_tavern_availability() from public;
grant execute on function public.get_tavern_availability() to service_role;

create or replace function public.check_tavern_request_limit(p_key_hash text,p_limit integer default 5,p_window_minutes integer default 15)
returns boolean language plpgsql security definer set search_path=public as $$
declare current_attempts integer;
begin
  if p_key_hash is null or char_length(p_key_hash) < 32 then return false; end if;
  perform pg_advisory_xact_lock(hashtext('tavern-rate-'||p_key_hash));
  delete from tavern_request_limits where window_started_at < now()-make_interval(mins=>p_window_minutes);
  insert into tavern_request_limits(key_hash,window_started_at,attempts)
  values(p_key_hash,now(),1)
  on conflict(key_hash) do update set attempts=tavern_request_limits.attempts+1
  returning attempts into current_attempts;
  return current_attempts <= p_limit;
end; $$;
revoke all on function public.check_tavern_request_limit(text,integer,integer) from public;
grant execute on function public.check_tavern_request_limit(text,integer,integer) to service_role;

-- Public-sale checkout protection. The first complete party to start checkout
-- receives a short hold; payment speed never decides who gets the seats.
create or replace function public.begin_tavern_checkout(p_name text,p_email text,p_party_size integer,p_weekend_slug text,p_payment_reference text,p_hold_minutes integer default 30)
returns jsonb language plpgsql security definer set search_path=public as $$
declare requested tavern_weekends%rowtype; occupied integer; claim_id uuid; expires_at timestamptz;
begin
  if p_party_size < 1 or p_party_size > 6 then raise exception 'invalid_party_size'; end if;
  select * into requested from tavern_weekends where slug=p_weekend_slug and visible=true;
  if not found then raise exception 'unknown_weekend'; end if;
  perform pg_advisory_xact_lock(hashtext('tavern-weekends'));
  update tavern_seat_claims set status='expired'
    where status='payment_pending' and hold_expires_at is not null and hold_expires_at<=now();
  select coalesce(sum(party_size),0)::integer into occupied from tavern_seat_claims
    where assigned_weekend_id=requested.id and (status in('first_access_held','paid') or (status='payment_pending' and (hold_expires_at is null or hold_expires_at>now())));
  if requested.capacity-occupied < p_party_size then
    return jsonb_build_object('status','not_available','remaining',greatest(requested.capacity-occupied,0));
  end if;
  expires_at:=now()+make_interval(mins=>greatest(5,least(p_hold_minutes,60)));
  insert into tavern_seat_claims(name,email,party_size,requested_weekend_id,assigned_weekend_id,status,consented_at,hold_expires_at,payment_reference)
  values(trim(p_name),lower(trim(p_email)),p_party_size,requested.id,requested.id,'payment_pending',now(),expires_at,p_payment_reference)
  returning id into claim_id;
  return jsonb_build_object('status','payment_pending','claimId',claim_id,'seats',p_party_size,'holdExpiresAt',expires_at,'remaining',requested.capacity-occupied-p_party_size);
end; $$;
revoke all on function public.begin_tavern_checkout(text,text,integer,text,text,integer) from public;
grant execute on function public.begin_tavern_checkout(text,text,integer,text,text,integer) to service_role;

create or replace function public.confirm_tavern_payment(p_payment_reference text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare claim tavern_seat_claims%rowtype;
begin
  select * into claim from tavern_seat_claims where payment_reference=p_payment_reference for update;
  if not found then return jsonb_build_object('status','unknown_payment'); end if;
  if claim.status='paid' then return jsonb_build_object('status','paid','claimId',claim.id,'duplicate',true); end if;
  if claim.status<>'payment_pending' or claim.hold_expires_at<=now() then
    update tavern_seat_claims set status='expired' where id=claim.id and status='payment_pending';
    return jsonb_build_object('status','expired','claimId',claim.id);
  end if;
  update tavern_seat_claims set status='paid',hold_expires_at=null where id=claim.id;
  return jsonb_build_object('status','paid','claimId',claim.id);
end; $$;
revoke all on function public.confirm_tavern_payment(text) from public;
grant execute on function public.confirm_tavern_payment(text) to service_role;
