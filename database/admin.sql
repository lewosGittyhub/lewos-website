-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  LOKAAL GEDRAAID op PostgreSQL 16.4, 6 september 2026 — NIET op Supabase ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Deze migratie draait schoon op een kale PostgreSQL 16.4, twee keer achter elkaar,
-- en `tests/database-integration.sql` slaagt erop. Wat daarmee NIET is aangetoond:
-- de Supabase-standaardrechten, PostgREST, en de gegevens die er al in staan. Zie
-- `operations/supabase-migration-testplan.md`.
-- De beheeromgeving en de betaling per deelnemer.
-- **Draai dit niet op productie voordat het op een tijdelijke database of testbranch is
-- nagelopen.** Draait ná `database/first-access.sql`.
--
-- Wat erin zit:
--   1. `public.lewos_admins` — wie de beheeromgeving mag zien. Ingelogd zijn is niet
--      genoeg; het adres moet hier staan.
--   2. `arrival_date` / `departure_date` op een boeking. De kalender toont de volledige
--      verblijfsduur, en die is niet af te leiden uit `extra_nights`: dat is vrije tekst
--      ("twee nachten ervoor"). Leeg laten betekent: de datums van het weekend zelf.
--   3. Twee ontbrekende verzendregistraties. De melding aan de accommodatie en die aan
--      Lewos werden nergens vastgelegd, dus kon de beheerder niet zien of Nadine haar
--      bericht ooit gekregen heeft. Zonder deze kolommen kan het berichtenoverzicht bij
--      die twee alleen "niet vastgelegd" zeggen, en dat is geen antwoord.
--   4. `public.tavern_booking_participants` — de deelnemers van een groepsboeking, elk
--      met een eigen bedrag, een eigen betaalstatus en een eigen betaalreferentie.
--   5. Drie leesfuncties voor het beheer. Ze schrijven niets.
--
-- Na te lopen scenario's, in één transactie die eindigt op `rollback`:
--   a. De vier `alter table`-regels raken bestaande rijen niet aan.
--   b. `admin_bookings_in_range` geeft niets terug voor een adres dat niet in
--      `lewos_admins` staat, maar gooit `not_an_administrator`.
--   c. Een boeking zonder `arrival_date` valt terug op de weekenddatums.
--   d. Een groep met vier deelnemers waarvan er twee betaald hebben, telt als
--      `partially_paid` en niet als `paid`.
--   e. `anon` en `authenticated` kunnen geen van deze functies uitvoeren.

-- ── 1. Wie mag het beheer zien ───────────────────────────────────────────────
create table if not exists public.lewos_admins (
  email text primary key,
  display_name text not null,
  role text not null default 'admin' check (role in ('admin','accommodation')),
  added_at timestamptz not null default now()
);

-- Alleen het eigen zakelijke adres van Lewos staat hier. Dat is al openbaar: het staat in
-- de voorwaarden, de juridische kennisgeving en op de contactpagina.
--
-- **Het adres van de accommodatie staat hier bewust NIET.** Dat is een persoonsgegeven van
-- een derde en hoort niet in een repository die naar GitHub gaat (harde grens 4 uit
-- CLAUDE.md). Robert voegt dat account zelf toe, één keer, met de regel hieronder — en
-- alleen in de database, niet in een bestand:
--
--   insert into public.lewos_admins (email, display_name, role)
--   values ('<adres van de accommodatie>','Accommodatie','accommodation')
--   on conflict (email) do update set display_name=excluded.display_name, role=excluded.role;
--
-- Zolang die regel niet gedraaid is, komt de accommodatie de beheeromgeving niet in. Dat is
-- zichtbaar en te herstellen; een adres dat eenmaal in de Git-geschiedenis staat niet.
insert into public.lewos_admins (email, display_name, role) values
  ('lewos.co@gmail.com','Robert Neugebauer','admin')
on conflict (email) do update set display_name=excluded.display_name, role=excluded.role;

-- ── 2. De werkelijke verblijfsduur ───────────────────────────────────────────
alter table public.tavern_seat_claims add column if not exists arrival_date date;
alter table public.tavern_seat_claims add column if not exists departure_date date;

-- ── 3. De twee ontbrekende verzendregistraties ───────────────────────────────
alter table public.tavern_seat_claims add column if not exists accommodation_email_sent_at timestamptz;
alter table public.tavern_seat_claims add column if not exists accommodation_email_provider_id text;
alter table public.tavern_seat_claims add column if not exists special_requirements_email_sent_at timestamptz;
alter table public.tavern_seat_claims add column if not exists special_requirements_email_provider_id text;

-- ── 4. De deelnemers van een groepsboeking ───────────────────────────────────
-- Eén rij per persoon die zelf betaalt. `amount_cents` staat per deelnemer en niet als
-- gedeeld totaal: zo kan er nooit vier keer het groepsbedrag gevraagd worden, en kan een
-- afwijkend bedrag (een kind, een korting) later zonder schemawijziging.
create table if not exists public.tavern_booking_participants (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.tavern_seat_claims(id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  email text not null,
  amount_cents integer not null check (amount_cents > 0),
  status text not null default 'awaiting_payment'
    check (status in ('awaiting_payment','paid','expired','cancelled')),
  payment_reference text unique,
  checkout_session_id text unique,
  checkout_session_url text,
  paid_at timestamptz,
  payment_link_sent_at timestamptz,
  payment_link_provider_id text,
  created_at timestamptz not null default now()
);
create unique index if not exists tavern_participants_claim_email_idx
  on public.tavern_booking_participants (claim_id, lower(email));
create index if not exists tavern_participants_claim_idx on public.tavern_booking_participants (claim_id);

alter table public.lewos_admins enable row level security;
alter table public.tavern_booking_participants enable row level security;
revoke all on table public.lewos_admins from public, anon, authenticated;
revoke all on table public.tavern_booking_participants from public, anon, authenticated;

-- ── 5. De leesfuncties ───────────────────────────────────────────────────────

create or replace function public.admin_is_allowed(p_email text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.lewos_admins where lower(email)=lower(trim(coalesce(p_email,''))));
$$;
revoke all on function public.admin_is_allowed(text) from public, anon, authenticated;
grant execute on function public.admin_is_allowed(text) to service_role;

-- De betaalstatus wordt afgeleid, niet apart bijgehouden: twee velden die hetzelfde
-- moeten zeggen lopen vroeg of laat uiteen. Zijn er deelnemers, dan bepalen die het
-- oordeel; is er geen enkele deelnemer, dan telt de status van de boeking zelf.
create or replace function private.tavern_payment_state(p_claim public.tavern_seat_claims)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare totaal integer; betaald integer; verschuldigd integer;
begin
  select count(*)::integer,
         count(*) filter (where status='paid')::integer,
         count(*) filter (where status<>'cancelled')::integer
    into totaal, betaald, verschuldigd
    from public.tavern_booking_participants where claim_id=p_claim.id;
  if totaal=0 then
    return jsonb_build_object(
      'state', case p_claim.status
        when 'paid' then 'paid'
        when 'payment_pending' then 'awaiting_payment'
        when 'expired' then 'expired'
        when 'cancelled' then 'cancelled'
        else 'no_payment_due' end,
      'participantsTotal', 0, 'participantsPaid', 0, 'participantsDue', 0);
  end if;
  return jsonb_build_object(
    'state', case
      when verschuldigd>0 and betaald>=verschuldigd then 'paid'
      when betaald>0 then 'partially_paid'
      when p_claim.status='expired' then 'expired'
      when p_claim.status='cancelled' then 'cancelled'
      else 'awaiting_payment' end,
    'participantsTotal', totaal, 'participantsPaid', betaald, 'participantsDue', verschuldigd);
end; $$;
revoke all on function private.tavern_payment_state(public.tavern_seat_claims) from public, anon, authenticated;

-- Het overzicht voor kalender en lijsten. **Geen allergieën, geen dieetwensen, geen
-- vrije tekst.** Die staan alleen in `admin_booking_detail`. Wie dit antwoord onderschept
-- heeft daarmee geen gezondheidsgegevens.
create or replace function public.admin_bookings_in_range(p_email text, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare resultaat jsonb;
begin
  if not public.admin_is_allowed(p_email) then raise exception 'not_an_administrator'; end if;
  if p_from is null or p_to is null or p_from > p_to then raise exception 'invalid_range'; end if;
  select coalesce(jsonb_agg(rij order by rij->>'arrival', rij->>'name'), '[]'::jsonb) into resultaat from (
    select jsonb_build_object(
      'claimId', c.id,
      'name', c.name,
      'seats', c.party_size,
      'status', c.status,
      'arrival', coalesce(c.arrival_date, w.starts_on),
      'departure', coalesce(c.departure_date, w.ends_on),
      'weekendSlug', w.slug,
      'weekendLabel', w.label || ' · ' || w.date_label,
      'hasExtraNights', nullif(trim(coalesce(c.extra_nights,'')),'') is not null,
      'payment', private.tavern_payment_state(c)
    ) as rij
    from public.tavern_seat_claims c
    left join public.tavern_weekends w on w.id = coalesce(c.assigned_weekend_id, c.requested_weekend_id)
    where c.status in ('first_access_held','payment_pending','paid')
      and coalesce(c.arrival_date, w.starts_on) is not null
      and coalesce(c.departure_date, w.ends_on) is not null
      and coalesce(c.arrival_date, w.starts_on) <= p_to
      and coalesce(c.departure_date, w.ends_on) >= p_from
  ) as rijen;
  return jsonb_build_object('from', p_from, 'to', p_to, 'bookings', resultaat);
end; $$;
revoke all on function public.admin_bookings_in_range(text,date,date) from public, anon, authenticated;
grant execute on function public.admin_bookings_in_range(text,date,date) to service_role;

-- Eén boeking, volledig. Dit is de enige plek waar allergieën en dieetwensen uit de
-- database komen, en hij zit achter dezelfde controle.
create or replace function public.admin_booking_detail(p_email text, p_claim_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.tavern_seat_claims%rowtype; w public.tavern_weekends%rowtype; deelnemers jsonb; berichten jsonb;
begin
  if not public.admin_is_allowed(p_email) then raise exception 'not_an_administrator'; end if;
  select * into c from public.tavern_seat_claims where id=p_claim_id;
  if not found then return jsonb_build_object('status','not_found'); end if;
  select * into w from public.tavern_weekends where id=coalesce(c.assigned_weekend_id, c.requested_weekend_id);

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'name', p.full_name, 'email', p.email,
      'amountCents', p.amount_cents, 'status', p.status, 'paidAt', p.paid_at,
      'hasPaymentLink', p.checkout_session_url is not null,
      'paymentLinkSentAt', p.payment_link_sent_at
    ) order by p.created_at), '[]'::jsonb) into deelnemers
    from public.tavern_booking_participants p where p.claim_id=c.id;

  -- Alleen wat vastgelegd is telt als verstuurd. Een bericht zonder tijdstempel is niet
  -- "waarschijnlijk wel gegaan"; het is niet vastgelegd, en dat staat er dan ook.
  berichten:=jsonb_build_array(
    jsonb_build_object('kind','receipt','label','Registration receipt (guest)',
      'sentAt',c.receipt_email_sent_at,'providerId',c.receipt_email_provider_id,
      'state',case when c.receipt_email_sent_at is not null then 'sent' else 'prepared' end),
    jsonb_build_object('kind','invitation','label','Payment window invitation (guest)',
      'sentAt',c.invitation_sent_at,'providerId',c.invitation_email_provider_id,
      'state',case when c.invitation_sent_at is not null then 'sent'
                   when c.checkout_token_hash is not null then 'prepared' else 'example' end),
    jsonb_build_object('kind','confirmation','label','Booking confirmation (guest)',
      'sentAt',c.confirmation_email_sent_at,'providerId',c.confirmation_email_provider_id,
      'state',case when c.confirmation_email_sent_at is not null then 'sent'
                   when c.status='paid' then 'prepared' else 'example' end),
    jsonb_build_object('kind','accommodation','label','Accommodation notification',
      'sentAt',c.accommodation_email_sent_at,'providerId',c.accommodation_email_provider_id,
      'state',case when c.accommodation_email_sent_at is not null then 'sent'
                   when c.status='paid' then 'prepared' else 'example' end),
    jsonb_build_object('kind','special','label','Special requirements to Lewos',
      'sentAt',c.special_requirements_email_sent_at,'providerId',c.special_requirements_email_provider_id,
      'state',case when c.special_requirements_email_sent_at is not null then 'sent'
                   when nullif(trim(coalesce(c.allergies,'')||coalesce(c.dietary_requirements,'')||coalesce(c.message,'')),'') is not null then 'prepared'
                   else 'example' end));

  return jsonb_build_object(
    -- De rol van wie dit opvraagt. De knoppen in de browser volgen deze waarde; de server
    -- gelooft de browser niet en controleert hem bij elke actie opnieuw.
    'viewerRole', private.admin_role(p_email),
    'claimId', c.id, 'name', c.name, 'email', c.email, 'seats', c.party_size,
    'status', c.status, 'payment', private.tavern_payment_state(c),
    'weekendSlug', w.slug, 'weekendLabel', w.label || ' · ' || w.date_label,
    'arrival', coalesce(c.arrival_date, w.starts_on),
    'departure', coalesce(c.departure_date, w.ends_on),
    'extraNights', c.extra_nights,
    'allergies', c.allergies, 'dietary', c.dietary_requirements, 'notes', c.message,
    'priceCents', c.price_cents, 'termsVersion', c.terms_version,
    'createdAt', c.created_at, 'consentedAt', c.consented_at,
    'participants', deelnemers, 'messages', berichten);
end; $$;
revoke all on function public.admin_booking_detail(text,uuid) from public, anon, authenticated;
grant execute on function public.admin_booking_detail(text,uuid) to service_role;

-- Vastleggen dát een melding is verstuurd. De enige schrijffunctie in dit bestand, en hij
-- raakt alleen verzendregistraties aan — nooit een boeking, een bedrag of een status.
create or replace function public.mark_tavern_notification_sent(p_payment_reference text, p_kind text, p_provider_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare claim_id uuid;
begin
  if p_kind not in ('accommodation','special') then raise exception 'unknown_notification_kind'; end if;
  update public.tavern_seat_claims set
    accommodation_email_sent_at=case when p_kind='accommodation' then coalesce(accommodation_email_sent_at,now()) else accommodation_email_sent_at end,
    accommodation_email_provider_id=case when p_kind='accommodation' then coalesce(accommodation_email_provider_id,nullif(trim(p_provider_id),'')) else accommodation_email_provider_id end,
    special_requirements_email_sent_at=case when p_kind='special' then coalesce(special_requirements_email_sent_at,now()) else special_requirements_email_sent_at end,
    special_requirements_email_provider_id=case when p_kind='special' then coalesce(special_requirements_email_provider_id,nullif(trim(p_provider_id),'')) else special_requirements_email_provider_id end
  where payment_reference=p_payment_reference returning id into claim_id;
  if claim_id is null then return jsonb_build_object('status','unknown_payment'); end if;
  return jsonb_build_object('status','marked','claimId',claim_id);
end; $$;
revoke all on function public.mark_tavern_notification_sent(text,text,text) from public, anon, authenticated;
grant execute on function public.mark_tavern_notification_sent(text,text,text) to service_role;

-- ── Logboek en beheeracties (5 september 2026, nog niet geverifieerd) ────────
-- Elke handeling van een beheerder wordt vastgelegd: wie, wat, wanneer, waarom. Zonder dit
-- is over een half jaar niet meer te zien waarom een plaats terugging naar de voorraad.
create table if not exists public.lewos_admin_actions (
  id uuid primary key default gen_random_uuid(),
  actor_email text not null,
  action text not null check (action in ('remind','extend','release')),
  claim_id uuid references public.tavern_seat_claims(id) on delete set null,
  participant_id uuid,
  reason text,
  details jsonb,
  created_at timestamptz not null default now()
);
alter table public.lewos_admin_actions enable row level security;
revoke all on table public.lewos_admin_actions from public, anon, authenticated;
create index if not exists lewos_admin_actions_claim_idx on public.lewos_admin_actions (claim_id, created_at desc);

-- Alleen de eigenaar mag verlengen en vrijgeven. Nadine mag herinneren en contact opnemen.
create or replace function private.admin_role(p_email text)
returns text language sql stable security definer set search_path='' as $$
  select role from public.lewos_admins where lower(email)=lower(trim(coalesce(p_email,'')));
$$;
revoke all on function private.admin_role(text) from public, anon, authenticated;

-- Wat er in een herinnering hoort te staan, en niets meer. Deze functie **verandert niets**:
-- ze kijkt alleen of er herinnerd kán worden en levert de gegevens voor de mail. Het
-- vastleggen gebeurt pas ná verzending, met `admin_remind_participant`. Die volgorde is met
-- opzet: mislukt de verzending, dan staat er ook geen herinnering in het logboek die nooit
-- de deur uit is gegaan.
--
-- Bewust níét meegeleverd: allergieën, dieetwensen, het vrije tekstveld en de gegevens van
-- de andere deelnemers. Een betaalverzoek gaat over één persoon en één bedrag.
create or replace function public.admin_reminder_payload(p_email text, p_participant_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.tavern_booking_participants%rowtype;
        c public.tavern_seat_claims%rowtype;
        w public.tavern_weekends%rowtype;
begin
  if not public.admin_is_allowed(p_email) then raise exception 'not_an_administrator'; end if;
  select * into p from public.tavern_booking_participants where id=p_participant_id;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if p.status='paid' then return jsonb_build_object('status','already_paid'); end if;
  select * into c from public.tavern_seat_claims where id=p.claim_id;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if c.hold_expires_at is null then
    return jsonb_build_object('status','no_deadline','participantId',p.id);
  end if;
  if nullif(trim(coalesce(p.checkout_session_url,'')),'') is null then
    return jsonb_build_object('status','no_payment_link','participantId',p.id);
  end if;
  select * into w from public.tavern_weekends where id=c.assigned_weekend_id;
  return jsonb_build_object(
    'status','ready','participantId',p.id,
    'participant',jsonb_build_object('full_name',p.full_name,'email',p.email,'amount_cents',p.amount_cents),
    'booking',jsonb_build_object('name',c.name,'seats',c.party_size,
      'weekendLabel',coalesce(w.label||' · '||w.date_label,'the Tavern')),
    'deadline',c.hold_expires_at,
    'paymentUrl',p.checkout_session_url,
    -- Waar de idempotentiesleutel aan hangt: twee pogingen na een netwerkfout leveren bij
    -- Resend één bericht op, een volgende herinnering krijgt een nieuwe sleutel.
    'lastSentAt',p.payment_link_sent_at);
end; $$;
revoke all on function public.admin_reminder_payload(text,uuid) from public, anon, authenticated;
grant execute on function public.admin_reminder_payload(text,uuid) to service_role;

create or replace function public.admin_remind_participant(p_email text, p_participant_id uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.tavern_booking_participants%rowtype;
        v_deadline timestamptz;
begin
  if not public.admin_is_allowed(p_email) then raise exception 'not_an_administrator'; end if;
  select * into p from public.tavern_booking_participants where id=p_participant_id for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if p.status='paid' then return jsonb_build_object('status','already_paid'); end if;
  -- Een betaalverzoek noemt altijd een termijn. Staat die er niet, dan is er niets om aan
  -- te herinneren en verzinnen we er geen: dan zou de gast een datum krijgen die nergens
  -- op slaat. Meld het als eigen uitkomst en leg géén herinnering vast — er is er ook geen
  -- verstuurd. Robert, 6 september 2026: dit gaf eerder een "beheeromgeving niet
  -- beschikbaar", en dan lijkt het systeem stuk terwijl er alleen een termijn ontbreekt.
  select c.hold_expires_at into v_deadline
    from public.tavern_seat_claims c where c.id=p.claim_id;
  if v_deadline is null then
    return jsonb_build_object('status','no_deadline','participantId',p.id);
  end if;
  -- Alleen vastleggen dát er herinnerd is. De deadline blijft waar hij stond: een
  -- herinnering is hetzelfde verzoek, nog een keer, en geeft nooit extra tijd.
  update public.tavern_booking_participants set payment_link_sent_at=now() where id=p.id;
  insert into public.lewos_admin_actions(actor_email,action,claim_id,participant_id,reason)
    values(lower(trim(p_email)),'remind',p.claim_id,p.id,nullif(trim(p_reason),''));
  return jsonb_build_object('status','reminded','participantId',p.id,'email',p.email,'amountCents',p.amount_cents);
end; $$;
revoke all on function public.admin_remind_participant(text,uuid,text) from public, anon, authenticated;
grant execute on function public.admin_remind_participant(text,uuid,text) to service_role;

-- Robert, 6 september 2026: **verlengen mag ook de accommodatie.** Tot die dag stond deze
-- functie op alleen-Robert, met als reden "een commerciële beslissing over geld en
-- voorraad". Robert heeft dat herzien: Nadine weet als eerste of een gast nog onderweg is,
-- en iemand laten omvallen op een termijn terwijl zij dat had kunnen voorkomen is duurder
-- dan de beslissing zelf. **Vrijgeven blijft uitsluitend van Robert** — dat is het
-- onomkeerbare deel, want daar gaat een stoel terug naar de voorraad.
create or replace function public.admin_extend_participant(p_email text, p_participant_id uuid, p_new_deadline timestamptz, p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.tavern_booking_participants%rowtype;
begin
  if not public.admin_is_allowed(p_email) then raise exception 'not_an_administrator'; end if;
  select * into p from public.tavern_booking_participants where id=p_participant_id for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  update public.tavern_seat_claims set hold_expires_at=p_new_deadline where id=p.claim_id;
  insert into public.lewos_admin_actions(actor_email,action,claim_id,participant_id,reason,details)
    values(lower(trim(p_email)),'extend',p.claim_id,p.id,trim(p_reason),jsonb_build_object('newDeadline',p_new_deadline));
  return jsonb_build_object('status','extended','participantId',p.id,'newDeadline',p_new_deadline);
end; $$;
revoke all on function public.admin_extend_participant(text,uuid,timestamptz,text) from public, anon, authenticated;
grant execute on function public.admin_extend_participant(text,uuid,timestamptz,text) to service_role;

-- Eén deelnemer annuleren en zijn plaats vrijgeven. Raakt de anderen niet: de rij blijft
-- bestaan met status 'cancelled', er wordt niets verwijderd en er wordt niets terugbetaald.
-- Een betaalde plaats gaat hier niet doorheen — annuleren, vrijgeven en terugbetalen zijn
-- drie verschillende handelingen en die worden hier niet stilzwijgend samengevoegd.
create or replace function public.admin_release_participant(p_email text, p_participant_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.tavern_booking_participants%rowtype; over integer;
        c public.tavern_seat_claims%rowtype;
begin
  if not public.admin_is_allowed(p_email) then raise exception 'not_an_administrator'; end if;
  if private.admin_role(p_email) is distinct from 'admin' then raise exception 'requires_owner'; end if;
  perform pg_advisory_xact_lock(hashtext('tavern-weekends'));
  select * into p from public.tavern_booking_participants where id=p_participant_id for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if p.status='paid' then return jsonb_build_object('status','already_paid'); end if;
  update public.tavern_booking_participants set status='cancelled' where id=p.id;

  -- Eén stoel terug naar de voorraad. De boeking zelf blijft staan met de overige gasten.
  --
  -- Robert, 7 september 2026: dit deed `party_size-1` zonder ondergrens. Bij een boeking van
  -- één gast werd dat nul, en `party_size` moet tussen 1 en 12 liggen — de hele vrijgave
  -- brak dan af op een check-constraint, en de beheeromgeving meldde "beheeromgeving niet
  -- beschikbaar". Was de laatste gast weg, dan hoort de boeking zelf terug naar de voorraad
  -- te gaan; een boeking met nul gasten bestaat niet.
  select * into c from public.tavern_seat_claims where id=p.claim_id for update;
  if c.party_size <= 1 then
    update public.tavern_seat_claims
      set party_size=1, status='cancelled', hold_phase='released', hold_expires_at=null,
          released_at=clock_timestamp(), released_by=lower(trim(p_email)),
          release_reason=nullif(trim(p_reason),'')
      where id=p.claim_id;
    over := 0;
  else
    update public.tavern_seat_claims set party_size=party_size-1 where id=p.claim_id
      returning party_size into over;
  end if;
  insert into public.lewos_admin_actions(actor_email,action,claim_id,participant_id,reason,details)
    values(lower(trim(p_email)),'release',p.claim_id,p.id,trim(p_reason),
           jsonb_build_object('releasedEmail',p.email,'seatsRemaining',over));
  return jsonb_build_object('status','released','participantId',p.id,'seatsRemaining',over);
end; $$;
revoke all on function public.admin_release_participant(text,uuid,text) from public, anon, authenticated;
grant execute on function public.admin_release_participant(text,uuid,text) to service_role;
