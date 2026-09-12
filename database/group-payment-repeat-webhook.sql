-- Een herhaalde webhook op een groepsboeking moet de boeking nog steeds kunnen afmaken.
--
-- Gevonden op 12 september 2026 tijdens een testbetaling op de branch: de keten liep vast en
-- Stripe bleef het proberen zonder dat het ooit goed kwam.
--
-- **Wat er fout was.** `confirm_participant_payment` heeft twee uitgangen. De normale uitgang
-- geeft, zodra de laatste deelnemer betaald heeft, een `booking`-blok terug: alles wat de
-- webhook nodig heeft voor de mail aan de accommodatie en voor de agenda-afspraak. De tweede
-- uitgang -- "deze deelnemer stond al op betaald" -- gaf `bookingComplete: true` terug maar
-- géén `booking`. `netlify/functions/stripe-webhook.mjs` doet dan:
--
--     if(!deelnemer.booking){ console.error("Booking complete but no booking payload
--       returned"); return response(500,{error:"paid_booking_requires_attention"}); }
--
-- Gevolg: mislukt er ná het vastleggen van de betaling één ding -- Resend hapert, Google
-- Agenda is traag, een instelling ontbreekt -- dan antwoordt de webhook met 500, probeert
-- Stripe het opnieuw, en loopt élke volgende poging op dit gat vast. De accommodatie krijgt
-- haar mail nooit, de agenda-afspraak komt er nooit, en de gast merkt niets: die heeft zijn
-- eigen bevestiging al.
--
-- **Wat deze migratie doet.** Alleen `confirm_participant_payment` vervangen. De korte
-- uitgang geeft nu hetzelfde boekingsblok terug als de normale uitgang, plus `outstanding`
-- en `filmingRequired` die er ook al hoorden te staan. En na het op `paid` zetten van de
-- boeking wordt de rij opnieuw ingelezen, zodat beide uitgangen van dezelfde gegevens
-- uitgaan.
--
-- Geen kolommen, geen rechten, geen ander gedrag bij een eerste betaling. Veilig om opnieuw
-- te draaien.
--
-- Deze tekst is woordelijk gelijk aan wat er in `database/group-payment-confirmation.sql`
-- staat; `tests/group-payment-database.test.mjs` bewaakt dat ze niet uit elkaar lopen.
--
-- Volgorde: `first-access.sql` -> `admin.sql` -> `stay-dates.sql` ->
-- `group-payment-confirmation.sql` -> dit bestand.

create or replace function public.confirm_participant_payment(
  p_payment_reference text, p_paid_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.tavern_booking_participants%rowtype;
        c public.tavern_seat_claims%rowtype;
        w public.tavern_weekends%rowtype;
        v_open integer;
        v_rond boolean;
begin
  perform pg_advisory_xact_lock(hashtext('tavern-weekends'));
  select * into p from public.tavern_booking_participants
    where payment_reference=trim(p_payment_reference) for update;
  if not found then return jsonb_build_object('status','unknown_payment'); end if;
  select * into c from public.tavern_seat_claims where id=p.claim_id for update;
  if not found then return jsonb_build_object('status','unknown_payment'); end if;
  select * into w from public.tavern_weekends where id=c.assigned_weekend_id;

  -- Al vastgelegd: dezelfde uitkomst, met de melding dat de mail al is afgevinkt.
  --
  -- **Inclusief het boekingsblok als de boeking rond is.** Dat ontbrak hier tot 12 september
  -- 2026. Een tweede levering van Stripe -- en die komt zodra er ná het vastleggen iets
  -- mislukt: Resend hapert, Google Agenda is traag, een instelling ontbreekt -- kreeg dan
  -- `bookingComplete: true` zonder `booking`. `stripe-webhook.mjs` antwoordt daarop met 500,
  -- Stripe probeert het opnieuw, en elke poging loopt op hetzelfde gat vast. De accommodatie
  -- kreeg haar mail nooit en de agenda-afspraak kwam er nooit -- stil, want de gast had zijn
  -- eigen bevestiging al wel. Zie `database/group-payment-repeat-webhook.sql`.
  if p.status='paid' then
    v_rond := c.status='paid';
    select count(*)::integer into v_open from public.tavern_booking_participants
      where claim_id=c.id and status<>'paid';
    return jsonb_build_object('status','paid','participantId',p.id,'claimId',c.id,
      'name',p.full_name,'email',p.email,'amountCents',p.amount_cents,
      'weekend',w.slug,'weekendLabel',w.label||' · '||w.date_label,
      'arrivalDate',coalesce(c.arrival_date,w.starts_on),
      'departureDate',coalesce(c.departure_date,w.ends_on),
      'termsVersion',p.terms_version,'paidAt',p.paid_at,
      'bookingComplete',v_rond,'outstanding',v_open,
      'filmingRequired',coalesce(public.tavern_media_agreement_required(w.slug),false),
      'confirmationEmailSent',p.confirmation_email_sent_at is not null,
      'booking',case when v_rond then jsonb_build_object(
      'status','paid','claimId',c.id,'name',c.name,'email',c.email,'seats',c.party_size,
      'weekendLabel',w.label||' · '||w.date_label,
      -- `arrivalDate` en `departureDate` zijn het BEVESTIGDE verblijf, precies zoals in
      -- `stay-dates.sql`. Leeg betekent: het weekend zelf. Stonden hier de weekenddatums
      -- plat, dan verdween een door de accommodatie toegezegde extra nacht uit de mail
      -- aan de accommodatie en uit de agenda -- een gast die maandag aankomt bij een
      -- kamer die pas vrijdag klaarstaat.
      'arrivalDate',coalesce(c.arrival_date,w.starts_on),
      'departureDate',coalesce(c.departure_date,w.ends_on),
      'weekendStart',w.starts_on,'weekendEnd',w.ends_on,
      'requestedArrival',c.requested_arrival,'requestedDeparture',c.requested_departure,
      'extraNightsStatus',c.extra_nights_status,
      -- Dezelfde terugval als in `first-access.sql`: staat de dieetwens nog in de oude
      -- kolommen `allergies` en `dietary_requirements`, dan komt hij daaruit. Plat
      -- `c.dietary_notes` liet bij een oudere boeking een allergie weg.
      'dietaryNotes',coalesce(nullif(trim(coalesce(c.dietary_notes,'')),''),
        private.merged_dietary_text(c.allergies,c.dietary_requirements)),
      'notes',c.message,'extraNights',c.extra_nights,
      'termsVersion',p.terms_version) else null end);
  end if;
  if p.status='cancelled' then return jsonb_build_object('status','cancelled','participantId',p.id); end if;

  -- Stripe accepteert nooit een betaling op een verlopen sessie. Deze marge vangt dus alleen
  -- klokverschil op tussen Stripe en de database, niet een echt verlopen venster.
  if c.hold_expires_at is null or p_paid_at is null
     or p_paid_at > c.hold_expires_at + interval '5 minutes' then
    return jsonb_build_object('status','expired','participantId',p.id,'claimId',c.id);
  end if;

  update public.tavern_booking_participants
    set status='paid', paid_at=coalesce(p_paid_at,now())
    where id=p.id;

  -- Is dit de laatste? Dan is de boeking rond: de stoelen blijven bezet omdat
  -- `get_tavern_availability` ook op `paid` telt, en de klok mag eraf.
  select count(*)::integer into v_open from public.tavern_booking_participants
    where claim_id=c.id and status<>'paid';
  v_rond := v_open=0;
  if v_rond then
    update public.tavern_seat_claims
      set status='paid', hold_phase='confirmed', hold_expires_at=null
      where id=c.id;
    -- Opnieuw inlezen, zodat het boekingsblok hieronder dezelfde rij ziet als het blok op
    -- de korte uitgang. Anders verschillen ze bij een herhaalde levering in `status`.
    select * into c from public.tavern_seat_claims where id=c.id;
  end if;

  -- Twee lagen, en dat is met opzet. `name` en `email` zijn van de deelnemer: die krijgt
  -- zijn eigen bevestiging. Alles wat over de boeking als geheel gaat staat in `booking`,
  -- in exact dezelfde vorm als `confirm_tavern_payment` teruggeeft. Zo kan de webhook het
  -- "boeking rond"-blok hergebruiken zonder dat de naam van één deelnemer in de mail aan
  -- de accommodatie belandt.
  return jsonb_build_object('status','paid','participantId',p.id,'claimId',c.id,
    'name',p.full_name,'email',p.email,'amountCents',p.amount_cents,
    'weekend',w.slug,'weekendLabel',w.label||' · '||w.date_label,
    'arrivalDate',coalesce(c.arrival_date,w.starts_on),
    'departureDate',coalesce(c.departure_date,w.ends_on),
    'termsVersion',p.terms_version,'paidAt',coalesce(p_paid_at,now()),
    'bookingComplete',v_rond,'outstanding',v_open,
    -- De bevestiging vertelt bij een gefilmd weekend dat de persoonlijke
    -- Filming & Media Agreement nog komt. Welk weekend dat is weet de database; de
    -- webhook hoort geen weekendnummer te kennen.
    'filmingRequired',coalesce(public.tavern_media_agreement_required(w.slug),false),
    'confirmationEmailSent',false,
    'booking',case when v_rond then jsonb_build_object(
      'status','paid','claimId',c.id,'name',c.name,'email',c.email,'seats',c.party_size,
      'weekendLabel',w.label||' · '||w.date_label,
      -- `arrivalDate` en `departureDate` zijn het BEVESTIGDE verblijf, precies zoals in
      -- `stay-dates.sql`. Leeg betekent: het weekend zelf. Stonden hier de weekenddatums
      -- plat, dan verdween een door de accommodatie toegezegde extra nacht uit de mail
      -- aan de accommodatie en uit de agenda -- een gast die maandag aankomt bij een
      -- kamer die pas vrijdag klaarstaat.
      'arrivalDate',coalesce(c.arrival_date,w.starts_on),
      'departureDate',coalesce(c.departure_date,w.ends_on),
      'weekendStart',w.starts_on,'weekendEnd',w.ends_on,
      'requestedArrival',c.requested_arrival,'requestedDeparture',c.requested_departure,
      'extraNightsStatus',c.extra_nights_status,
      -- Dezelfde terugval als in `first-access.sql`: staat de dieetwens nog in de oude
      -- kolommen `allergies` en `dietary_requirements`, dan komt hij daaruit. Plat
      -- `c.dietary_notes` liet bij een oudere boeking een allergie weg.
      'dietaryNotes',coalesce(nullif(trim(coalesce(c.dietary_notes,'')),''),
        private.merged_dietary_text(c.allergies,c.dietary_requirements)),
      'notes',c.message,'extraNights',c.extra_nights,
      'termsVersion',p.terms_version) else null end);
end; $$;

revoke all on function public.confirm_participant_payment(text,timestamptz) from public, anon, authenticated;
grant execute on function public.confirm_participant_payment(text,timestamptz) to service_role;
