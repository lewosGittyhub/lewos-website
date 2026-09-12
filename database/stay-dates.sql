-- ===========================================================================
--  LOKAAL GEDRAAID op PostgreSQL 16.4, 6 september 2026 — NIET op Supabase.
--  Draait schoon, twee keer achter elkaar, en `tests/database-integration.sql` slaagt
--  erop. Niet aangetoond: Supabase-standaardrechten, PostgREST, bestaande gegevens.
--  Zie `operations/supabase-migration-testplan.md`.
-- ===========================================================================
--
--  Aangevraagd verblijf, apart van bevestigd verblijf.
--
--  VOLGORDE: `first-access.sql` → `filming-consent.sql` → `admin.sql` →
--  `seat-holds.sql` → dit bestand. Deze migratie leunt op
--  `admin_is_allowed`, `lewos_admin_actions`, `private.admin_role` en de kolommen
--  `arrival_date` / `departure_date` uit `admin.sql`, en vervangt aan het eind twee
--  functies uit dat bestand om de nieuwe velden mee te geven.
--
--  WAAROM DIT NIET ÉÉN VELD IS
--
--  Er stond één tekstveld `extra_nights` waarin de gast zelf "twee nachten ervoor" typte.
--  Dat veld betekende drie dingen tegelijk — een wens, een afspraak en een verblijf — en
--  niemand kon zien welke. Nu staan ze uit elkaar:
--
--    requested_arrival / requested_departure   wat de gast heeft aangeklikt
--    extra_nights_status                       none | requested | confirmed | declined
--    arrival_date / departure_date             wat de accommodatie heeft toegezegd
--
--  `arrival_date` en `departure_date` bestonden al sinds `admin.sql` maar werden nergens
--  gevuld. Dat zijn vanaf nu de bevestigde datums, en er is dus geen tweede paar velden
--  bijgekomen dat hetzelfde probeert te zeggen.
--
--  **Leeg = het weekend zelf.** Zolang de accommodatie niets heeft toegezegd blijven die
--  twee null en is het bevestigde verblijf precies het weekend. Dat is geen opmaakkwestie:
--  aan het bevestigde verblijf hangt de agenda-afspraak, en daar mag nooit een nacht in
--  staan die niemand heeft toegezegd.
--
--  `extra_nights` (de vrije tekst) blijft bestaan en wordt niet gewist — bestaande
--  boekingen hebben daar hun aanvraag in staan. Voor nieuwe boekingen wordt die tekst
--  niet meer ingetypt maar afgeleid uit de datums; zie `assets/stay.js`, `stayRequestText`.
--
--  DE AANVRAAG WORDT APART WEGGESCHREVEN
--
--  `set_tavern_stay_request` wordt door de Netlify-functie aangeroepen ná de RPC die de
--  plaats vastlegt. Dat is bewust: een optionele aanvraag voor extra nachten mag een
--  boeking nooit laten mislukken. Lukt het wegschrijven niet, dan staat de boeking er
--  gewoon en meldt de functie dat aan Robert — beter een aanvraag die nagebeld moet
--  worden dan een gast die zijn plaats kwijt is.

alter table public.tavern_seat_claims add column if not exists requested_arrival date;
alter table public.tavern_seat_claims add column if not exists requested_departure date;
alter table public.tavern_seat_claims add column if not exists extra_nights_status text not null default 'none';
alter table public.tavern_seat_claims add column if not exists extra_nights_decided_at timestamptz;
alter table public.tavern_seat_claims add column if not exists extra_nights_decided_by text;

do $$
begin
  if not exists(select 1 from pg_constraint where conname='tavern_seat_claims_extra_nights_status') then
    alter table public.tavern_seat_claims add constraint tavern_seat_claims_extra_nights_status
      check (extra_nights_status in ('none','requested','confirmed','declined'));
  end if;
  -- Een vertrek vóór de aankomst is geen verblijf. De database houdt dat tegen, ook als
  -- er ooit een andere weg naar deze tabel bij komt dan de functies van vandaag.
  if not exists(select 1 from pg_constraint where conname='tavern_seat_claims_requested_order') then
    alter table public.tavern_seat_claims add constraint tavern_seat_claims_requested_order
      check (requested_arrival is null or requested_departure is null or requested_departure > requested_arrival);
  end if;
  if not exists(select 1 from pg_constraint where conname='tavern_seat_claims_confirmed_order') then
    alter table public.tavern_seat_claims add constraint tavern_seat_claims_confirmed_order
      check (arrival_date is null or departure_date is null or departure_date > arrival_date);
  end if;
  -- Bevestigd zonder datums is een status die niets zegt. Dan liever geen bevestiging.
  if not exists(select 1 from pg_constraint where conname='tavern_seat_claims_confirmed_needs_dates') then
    alter table public.tavern_seat_claims add constraint tavern_seat_claims_confirmed_needs_dates
      check (extra_nights_status <> 'confirmed' or (arrival_date is not null and departure_date is not null));
  end if;
end $$;

-- Het logboek uit `admin.sql` kende drie handelingen. Er komen er twee bij, en dat moet
-- de check-constraint weten, anders wordt een bevestiging geweigerd op het moment dat
-- hij vastgelegd wordt.
do $$
begin
  if exists(select 1 from pg_constraint where conname='lewos_admin_actions_action_check') then
    alter table public.lewos_admin_actions drop constraint lewos_admin_actions_action_check;
  end if;
  alter table public.lewos_admin_actions add constraint lewos_admin_actions_action_check
    check (action in ('remind','extend','release','extra_nights_confirmed','extra_nights_declined'));
end $$;

-- Het weekend van een boeking, op één plek opgezocht. `assigned` gaat voor `offered` en
-- die weer voor `requested`, precies zoals de rest van het schema het leest.
create or replace function private.claim_weekend(p_claim public.tavern_seat_claims)
returns public.tavern_weekends
language sql stable security definer set search_path='' as $$
  select w.* from public.tavern_weekends w
  where w.id = coalesce(p_claim.assigned_weekend_id, p_claim.offered_weekend_id, p_claim.requested_weekend_id);
$$;

-- Het venster waarin een gast mag kiezen, in dezelfde vorm als `stayWindow` in
-- `assets/stay.js`. Twee implementaties die hetzelfde moeten uitrekenen — de browser tekent
-- ermee, de database beslist ermee. `tests/database.test.mjs` legt ze naast elkaar.
--
-- Van /tavern/: aankomen kan vanaf de maandag vóór het weekend, vertrekken tot en met de
-- vrijdag erna.
--
-- **De wisseldag valt binnen het venster.** Je vertrekt om 09:30 en de volgende gasten
-- komen om 16:00, dus de vrijdag waarop het volgende weekend begint mag je vertrekdag zijn:
-- jouw laatste nacht is de donderdag, hun eerste nacht die vrijdag. Andersom net zo. Het
-- gaat om nachten, niet om dagen — daarom knippen we op `starts_on` en `ends_on` zelf en
-- niet op de dag ervoor of erna.
create or replace function private.stay_window(p_weekend public.tavern_weekends)
returns table(van date, tot date)
language sql stable security definer set search_path='' as $$
  select
    greatest(
      -- de maandag strikt vóór het begin
      p_weekend.starts_on - ((((extract(isodow from p_weekend.starts_on)::int - 1 + 6) % 7) + 1)),
      coalesce((select max(w.ends_on) from public.tavern_weekends w
                 where w.id <> p_weekend.id and w.ends_on is not null
                   and w.ends_on <= p_weekend.starts_on),
               p_weekend.starts_on - ((((extract(isodow from p_weekend.starts_on)::int - 1 + 6) % 7) + 1)))),
    least(
      -- de vrijdag strikt ná het einde
      p_weekend.ends_on + ((((5 - extract(isodow from p_weekend.ends_on)::int + 6) % 7) + 1)),
      coalesce((select min(w.starts_on) from public.tavern_weekends w
                 where w.id <> p_weekend.id and w.starts_on is not null
                   and w.starts_on >= p_weekend.ends_on),
               p_weekend.ends_on + ((((5 - extract(isodow from p_weekend.ends_on)::int + 6) % 7) + 1))));
$$;

-- De aanvraag van de gast. Toetst de datums aan het weekend zelf — dát is de reden dat
-- deze controle hier staat en niet in de browser: `starts_on` en `ends_on` staan hier.
create or replace function public.set_tavern_stay_request(
  p_claim_id uuid, p_arrival date default null, p_departure date default null)
returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  claim public.tavern_seat_claims%rowtype;
  weekend public.tavern_weekends%rowtype;
  aankomst date; vertrek date; voor integer; na integer; verandert boolean;
  venster_van date; venster_tot date;
begin
  select * into claim from public.tavern_seat_claims where id=p_claim_id;
  if not found then return jsonb_build_object('status','not_found'); end if;

  select * into weekend from private.claim_weekend(claim);
  if not found or weekend.starts_on is null or weekend.ends_on is null then
    return jsonb_build_object('status','no_weekend_dates');
  end if;

  aankomst := coalesce(p_arrival, weekend.starts_on);
  vertrek  := coalesce(p_departure, weekend.ends_on);

  if aankomst > weekend.starts_on then raise exception 'stay_arrival_after_weekend'; end if;
  if vertrek  < weekend.ends_on   then raise exception 'stay_departure_before_weekend'; end if;

  -- **De grens staat hier, niet alleen in de browser.** Een verzoek dat de pagina omzeilt
  -- komt er niet langs.
  select van, tot into venster_van, venster_tot from private.stay_window(weekend);
  if aankomst < venster_van then raise exception 'stay_arrival_too_early'; end if;
  if vertrek  > venster_tot then raise exception 'stay_departure_too_late'; end if;

  voor := weekend.starts_on - aankomst;
  na   := vertrek - weekend.ends_on;

  -- Wijzigt de gast zijn datums nadat de accommodatie al ja heeft gezegd, dan vervalt die
  -- toezegging: hij ging over andere nachten. De status gaat terug naar 'requested' zodat
  -- er opnieuw naar gekeken wordt — zichtbaar, niet stil.
  verandert := claim.extra_nights_status='confirmed'
    and (claim.arrival_date is distinct from aankomst or claim.departure_date is distinct from vertrek);

  update public.tavern_seat_claims set
    requested_arrival   = case when voor+na>0 then aankomst else null end,
    requested_departure = case when voor+na>0 then vertrek  else null end,
    extra_nights_status = case when voor+na>0 then 'requested' else 'none' end,
    arrival_date        = case when verandert or voor+na=0 then null else arrival_date end,
    departure_date      = case when verandert or voor+na=0 then null else departure_date end
  where id=p_claim_id;

  return jsonb_build_object(
    'status','ok','claimId',p_claim_id,
    'weekendStart',weekend.starts_on,'weekendEnd',weekend.ends_on,
    'requestedArrival',case when voor+na>0 then aankomst end,
    'requestedDeparture',case when voor+na>0 then vertrek end,
    'nightsBefore',voor,'nightsAfter',na,
    'withdrewConfirmation',verandert,
    'extraNightsStatus',case when voor+na>0 then 'requested' else 'none' end);
end $$;

-- De site roept dit alleen aan nadat zij de gedeelde accommodatieagenda heeft gelezen en
-- alle gevraagde nachten vrij blijken. Daardoor is de gastkeuze meteen bevestigd, zonder
-- dat de extra accommodatiekosten in de online Tavern-betaling terechtkomen. De aparte
-- betaling gebeurt rechtstreeks bij aankomst. Oude aanvragen blijven via de beheeractie
-- hieronder beslisbaar; deze functie is uitsluitend voor nieuwe, gecontroleerd vrije data.
create or replace function public.confirm_tavern_stay_request(p_claim_id uuid)
returns jsonb
language plpgsql security definer set search_path='' as $$
declare claim public.tavern_seat_claims%rowtype;
begin
  select * into claim from public.tavern_seat_claims where id=p_claim_id for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if claim.extra_nights_status='none' then return jsonb_build_object('status','nothing_requested'); end if;
  if claim.requested_arrival is null or claim.requested_departure is null
    then return jsonb_build_object('status','missing_requested_dates'); end if;

  update public.tavern_seat_claims set
    extra_nights_status='confirmed',
    arrival_date=requested_arrival,
    departure_date=requested_departure,
    extra_nights_decided_at=now(),
    extra_nights_decided_by='availability-check'
  where id=p_claim_id;

  insert into public.lewos_admin_actions(actor_email,action,claim_id,reason)
  values('availability-check','extra_nights_confirmed',p_claim_id,
    'Confirmed automatically after the shared accommodation calendar reported all requested nights free.');

  return jsonb_build_object('status','ok','claimId',p_claim_id,
    'extraNightsStatus','confirmed','confirmedArrival',claim.requested_arrival,
    'confirmedDeparture',claim.requested_departure);
end $$;

revoke all on function public.confirm_tavern_stay_request(uuid) from public, anon, authenticated;
grant execute on function public.confirm_tavern_stay_request(uuid) to service_role;

-- Het oordeel van de accommodatie. Alleen een beheerder mag dit zetten, en de beslissing
-- wordt vastgelegd: over een half jaar wil je kunnen zien wie welke nacht heeft toegezegd.
create or replace function public.admin_decide_extra_nights(
  p_email text, p_claim_id uuid, p_decision text,
  p_arrival date default null, p_departure date default null, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  claim public.tavern_seat_claims%rowtype;
  weekend public.tavern_weekends%rowtype;
  aankomst date; vertrek date;
  venster_van date; venster_tot date;
begin
  if not public.admin_is_allowed(p_email) then raise exception 'not_an_administrator'; end if;
  if p_decision not in ('confirmed','declined') then raise exception 'invalid_decision'; end if;

  select * into claim from public.tavern_seat_claims where id=p_claim_id;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if claim.extra_nights_status='none' then return jsonb_build_object('status','nothing_requested'); end if;

  select * into weekend from private.claim_weekend(claim);
  if not found or weekend.starts_on is null then return jsonb_build_object('status','no_weekend_dates'); end if;

  if p_decision='confirmed' then
    -- De accommodatie mag mínder bevestigen dan gevraagd: één van de twee nachten kan
    -- vrij zijn en de andere niet. Zonder opgave bevestigt zij precies wat er gevraagd is.
    aankomst := coalesce(p_arrival, claim.requested_arrival, weekend.starts_on);
    vertrek  := coalesce(p_departure, claim.requested_departure, weekend.ends_on);
    if aankomst > weekend.starts_on then raise exception 'stay_arrival_after_weekend'; end if;
    if vertrek  < weekend.ends_on   then raise exception 'stay_departure_before_weekend'; end if;
    select van, tot into venster_van, venster_tot from private.stay_window(weekend);
    if aankomst < venster_van then raise exception 'stay_arrival_too_early'; end if;
    if vertrek  > venster_tot then raise exception 'stay_departure_too_late'; end if;
    -- Méér bevestigen dan gevraagd is geen bevestiging maar een nieuwe boeking, en die
    -- hoort niet uit een goedkeurknop te komen.
    if aankomst < coalesce(claim.requested_arrival, weekend.starts_on)
      or vertrek > coalesce(claim.requested_departure, weekend.ends_on) then
      raise exception 'stay_more_than_requested';
    end if;
  end if;

  update public.tavern_seat_claims set
    extra_nights_status=p_decision,
    arrival_date=case when p_decision='confirmed' then aankomst else null end,
    departure_date=case when p_decision='confirmed' then vertrek else null end,
    extra_nights_decided_at=now(),
    extra_nights_decided_by=lower(trim(p_email))
  where id=p_claim_id;

  insert into public.lewos_admin_actions(actor_email,action,claim_id,reason)
  values(lower(trim(p_email)),'extra_nights_'||p_decision,p_claim_id,nullif(trim(p_reason),''));

  return jsonb_build_object('status','ok','claimId',p_claim_id,'decision',p_decision,
    'confirmedArrival',case when p_decision='confirmed' then aankomst end,
    'confirmedDeparture',case when p_decision='confirmed' then vertrek end);
end $$;

revoke all on function public.set_tavern_stay_request(uuid,date,date) from public, anon, authenticated;
grant execute on function public.set_tavern_stay_request(uuid,date,date) to service_role;
revoke all on function public.admin_decide_extra_nights(text,uuid,text,date,date,text) from public, anon, authenticated;
grant execute on function public.admin_decide_extra_nights(text,uuid,text,date,date,text) to service_role;


-- ---------------------------------------------------------------------------
--  De twee leesfuncties uit `admin.sql`, opnieuw met de velden hierboven erbij.
--  Ze staan hier voluit en niet als patch: een `create or replace` vervangt de hele
--  functie, en dan is de volledige tekst lezen de enige manier om te zien wat er draait.
--
--  Wat er NIET verandert: `arrival` en `departure` blijven het bevestigde verblijf. Een
--  aangevraagde nacht rekt het balkje in de maandkalender niet op.
-- ---------------------------------------------------------------------------

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
      'hasExtraNights', c.extra_nights_status <> 'none'
                        or nullif(trim(coalesce(c.extra_nights,'')),'') is not null,
      -- Het overzicht toont het BEVESTIGDE verblijf hierboven. Deze twee zeggen of er
      -- daarnaast nog iets openstaat, zodat een maandvakje niet langer kleurt dan is
      -- toegezegd maar wel laat zien dat er een vraag ligt.
      'extraNightsStatus', c.extra_nights_status,
      'requestedArrival', c.requested_arrival,
      'requestedDeparture', c.requested_departure,
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
                   when nullif(trim(coalesce(c.dietary_notes,'')||coalesce(c.allergies,'')||coalesce(c.dietary_requirements,'')||coalesce(c.message,'')),'') is not null then 'prepared'
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
    -- Vrije tekst van oudere boekingen. Voor nieuwe boekingen wordt deze regel afgeleid
    -- uit de datums hieronder en niet meer ingetypt.
    'extraNights', c.extra_nights,
    -- Aangevraagd, en dus nog niet toegezegd. `arrival`/`departure` hierboven blijven het
    -- bevestigde verblijf: zolang de status niet 'confirmed' is, zijn dat de weekenddatums.
    'extraNightsStatus', c.extra_nights_status,
    'requestedArrival', c.requested_arrival,
    'requestedDeparture', c.requested_departure,
    'extraNightsDecidedAt', c.extra_nights_decided_at,
    'extraNightsDecidedBy', c.extra_nights_decided_by,
    'weekendStart', w.starts_on,
    'weekendEnd', w.ends_on,
    -- **Eén veld, niet twee.** Sinds 5 september 2026 vult de gast allergieën en
    -- dieetwensen samen in. Oudere boekingen hebben nog twee kolommen; `merged_dietary_text`
    -- plakt die aan elkaar mét hun kopje, zodat er niets wegvalt en niets dubbel staat.
    -- Dit is nog steeds de énige plek waar deze gegevens uit de database komen: het
    -- maandoverzicht draagt ze niet.
    'dietaryNotes', coalesce(nullif(trim(coalesce(c.dietary_notes,'')),''),
                             private.merged_dietary_text(c.allergies, c.dietary_requirements)),
    'notes', c.message,
    'priceCents', c.price_cents, 'termsVersion', c.terms_version,
    'createdAt', c.created_at, 'consentedAt', c.consented_at,
    'participants', deelnemers, 'messages', berichten);
end; $$;

revoke all on function public.admin_bookings_in_range(text,date,date) from public, anon, authenticated;
grant execute on function public.admin_bookings_in_range(text,date,date) to service_role;
revoke all on function public.admin_booking_detail(text,uuid) from public, anon, authenticated;
grant execute on function public.admin_booking_detail(text,uuid) to service_role;


-- ---------------------------------------------------------------------------
--  `confirm_tavern_payment`, opnieuw met het onderscheid erin.
--
--  Hij staat hier voluit omdat een `create or replace` de hele functie vervangt; alleen
--  de regels tonen die veranderen zou verbergen wat er straks draait. Hij komt uit
--  `first-access.sql`; dit is dezelfde functie met vier velden erbij.
--
--  **`arrivalDate` en `departureDate` zijn het BEVESTIGDE verblijf.** Zolang de
--  accommodatie niets heeft toegezegd staan `arrival_date` en `departure_date` op null en
--  vallen ze terug op de weekenddatums. Aan deze twee hangt de agenda-afspraak, dus daar
--  mag nooit een aangevraagde nacht in sluipen.
--
--  `requestedArrival`, `requestedDeparture` en `extraNightsStatus` dragen de aanvraag. De
--  webhook zet die in een eigen blok in de mail aan de accommodatie, met de vraag om hem
--  te bevestigen — nooit tussen de bevestigde gegevens.
-- ---------------------------------------------------------------------------

create or replace function public.confirm_tavern_payment(p_payment_reference text,p_paid_at timestamptz)
returns jsonb language plpgsql security definer set search_path=''  as $$
declare claim public.tavern_seat_claims%rowtype; weekend public.tavern_weekends%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext('tavern-weekends'));
  select * into claim from public.tavern_seat_claims where payment_reference=p_payment_reference for update;
  if not found then return jsonb_build_object('status','unknown_payment'); end if;
  select * into weekend from public.tavern_weekends where id=claim.assigned_weekend_id;
  if claim.status='paid' then return jsonb_build_object('status','paid','claimId',claim.id,'name',claim.name,'email',claim.email,'seats',claim.party_size,'weekendLabel',weekend.label||' · '||weekend.date_label,'arrivalDate',coalesce(claim.arrival_date,weekend.starts_on),'departureDate',coalesce(claim.departure_date,weekend.ends_on),'weekendStart',weekend.starts_on,'weekendEnd',weekend.ends_on,'requestedArrival',claim.requested_arrival,'requestedDeparture',claim.requested_departure,'extraNightsStatus',claim.extra_nights_status,'dietaryNotes',coalesce(nullif(trim(coalesce(claim.dietary_notes,'')),''),private.merged_dietary_text(claim.allergies,claim.dietary_requirements)),'notes',claim.message,'extraNights',claim.extra_nights,'termsVersion',claim.terms_version,'confirmationEmailSent',claim.confirmation_email_sent_at is not null,'duplicate',true); end if;
  -- The Stripe session expiry is set a moment after the database hold begins, so
  -- a payment accepted in that final sliver can carry a timestamp just past the
  -- hold. Stripe never accepts payment on an expired session, so this narrow
  -- grace only absorbs clock skew; a released seat is already caught above.
  if claim.status<>'payment_pending' or claim.hold_expires_at is null or p_paid_at is null or p_paid_at>claim.hold_expires_at+interval '5 minutes' then
    return jsonb_build_object('status','expired','claimId',claim.id);
  end if;
  update public.tavern_seat_claims set status='paid',hold_expires_at=null where id=claim.id;
  return jsonb_build_object('status','paid','claimId',claim.id,'name',claim.name,'email',claim.email,'seats',claim.party_size,'weekendLabel',weekend.label||' · '||weekend.date_label,'arrivalDate',coalesce(claim.arrival_date,weekend.starts_on),'departureDate',coalesce(claim.departure_date,weekend.ends_on),'weekendStart',weekend.starts_on,'weekendEnd',weekend.ends_on,'requestedArrival',claim.requested_arrival,'requestedDeparture',claim.requested_departure,'extraNightsStatus',claim.extra_nights_status,'dietaryNotes',coalesce(nullif(trim(coalesce(claim.dietary_notes,'')),''),private.merged_dietary_text(claim.allergies,claim.dietary_requirements)),'notes',claim.message,'extraNights',claim.extra_nights,'termsVersion',claim.terms_version,'confirmationEmailSent',false);
end; $$;
revoke all on function public.confirm_tavern_payment(text,timestamptz) from public, anon, authenticated;
grant execute on function public.confirm_tavern_payment(text,timestamptz) to service_role;

revoke all on function private.stay_window(public.tavern_weekends) from public, anon, authenticated;
