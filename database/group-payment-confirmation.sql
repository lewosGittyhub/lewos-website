-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║  NIET GEDRAAID. Zet dit eerst op de Supabase-preview-branch, nooit direct  ║
-- ║  op productie. Draait ná first-access.sql, admin.sql, seat-holds.sql,      ║
-- ║  stay-dates.sql en filming-consent.sql.                                    ║
-- ╚════════════════════════════════════════════════════════════════════════════╝
--
-- De laatste schakel van de groepsbetaling. Die ontbrak.
--
-- Wat er tot nu toe gebeurde: de deelnemers werden aangemaakt, kregen ieder een eigen
-- betaalkenmerk en een eigen betaallink, en er werd een Stripe-sessie aan gehangen. En
-- daarna niets. Er bestond geen enkele functie die een deelnemer op `paid` zette; `paid_at`
-- werd nergens geschreven. De webhook riep `confirm_tavern_payment` aan, die uitsluitend in
-- `tavern_seat_claims` zoekt — een deelnemerkenmerk staat daar niet in, dus die gaf
-- `unknown_payment` terug en de webhook antwoordde met 500. Stripe bleef het opnieuw
-- proberen, de betaling werd nooit vastgelegd, en er ging geen bevestiging uit.
--
-- Dat pad is nooit gelopen: de betaalpoort staat sinds het begin dicht. Er is geen gast en
-- geen euro door geraakt. Maar het moest af voordat die poort opengaat.
--
-- ── Twee fouten die elkaar maskeerden ──────────────────────────────────────────
--
-- `private.cleanup_tavern_claims` liet iedere `payment_pending`-boeking vervallen waarvan de
-- claim zelf geen `checkout_session_id` heeft. Bij een groepsboeking is dat altijd zo: de
-- sessies hangen aan de deelnemers. Er stond geen controle in of er al iemand betaald had.
--
-- Vier gasten, drie betaald, het venster verstrijkt: de boeking op `expired`,
-- `hold_expires_at` leeg, `payment_reference` gewist, stoelen vrij. Drie mensen hadden
-- betaald en hun boeking was weg.
--
-- Die fout kon zich niet voordoen zolang niemand ooit op `paid` kwam. De ontbrekende schakel
-- hield hem tegen. Wie alleen de schakel bouwt, zet de tweede fout aan. Daarom staan ze hier
-- samen.
--
-- `private.expire_filling_holds` had de juiste regel al wel:
--   "Een betaalfase waarin al iemand betaald heeft wordt hier nooit aangeraakt — dat is
--    Roberts beslissing, en een timer is geen beslissing."
-- Diezelfde regel geldt nu voor beide.
--
-- ── Wat een deelnemer zelf bevestigt ──────────────────────────────────────────
--
-- Tot nu toe vinkte de hoofdboeker meerderjarigheid, privacy en de filmerkenning aan voor de
-- hele groep. Dat kan niet: meerderjarigheid verklaar je niet voor iemand anders, en
-- privacytoestemming al helemaal niet. De verkooppagina belooft het ook anders — "One person
-- cannot agree on behalf of the rest of the party."
--
-- Vanaf hier bevestigt iedere deelnemer op zijn eigen betaalpagina zijn eigen drie dingen, en
-- **geeft de database geen betaalsessie af zonder die bevestigingen.** Die weigering staat
-- hier en niet alleen in de functie: een formulier is te omzeilen, een grant niet.
--
-- Na te lopen scenario's, in één transactie die eindigt op `rollback`:
--   a. Betaalsessie aanvragen zonder bevestigingen: geweigerd.
--   b. Tweemaal `confirm_participant_payment` op hetzelfde kenmerk: één keer betaald, de
--      tweede keer dezelfde uitkomst en geen tweede mail.
--   c. Laatste deelnemer betaalt: de boeking gaat op `paid` en `hold_phase='confirmed'`.
--   d. Deels betaalde boeking waarvan het venster verstrijkt: blijft staan, stoelen bezet.
--   e. Onbetaalde groep waarvan het venster verstrijkt: vervalt wel.
--   f. Betaling met een tijdstip ná de deadline plus vijf minuten: `expired`.

-- ── De velden ─────────────────────────────────────────────────────────────────
-- `paid_at` bestond al en werd nooit geschreven. De rest is nieuw. De bevestigingen staan
-- als tijdstip en niet als vinkje: wanneer iemand iets accepteerde is het bewijs, een
-- boolean is dat niet.
alter table public.tavern_booking_participants
  add column if not exists adult_confirmed_at timestamptz;
alter table public.tavern_booking_participants
  add column if not exists privacy_accepted_at timestamptz;
alter table public.tavern_booking_participants
  add column if not exists filming_acknowledged_at timestamptz;
alter table public.tavern_booking_participants
  add column if not exists terms_version text;
alter table public.tavern_booking_participants
  add column if not exists confirmation_email_sent_at timestamptz;
alter table public.tavern_booking_participants
  add column if not exists confirmation_email_provider_id text;

-- ── Opruimen: een deels betaalde boeking vervalt nooit ────────────────────────
-- Vervangt de versie in `first-access.sql`. Enige wijziging: de laatste `update` raakt geen
-- boeking meer waarvan een deelnemer betaald heeft. Verder woord voor woord hetzelfde,
-- zodat het First Access-pad ongemoeid blijft.
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
      and hold_expires_at<=clock_timestamp()
      -- Geld dat binnen is, is een beslissing van Robert en niet van een timer.
      and not exists(select 1 from public.tavern_booking_participants p
                     where p.claim_id=public.tavern_seat_claims.id and p.status='paid');
end; $$;
revoke all on function private.cleanup_tavern_claims() from public, anon, authenticated;

-- ── De eigen bevestigingen van de deelnemer ──────────────────────────────────
-- Wordt aangeroepen vlak voordat de betaalsessie wordt geopend, met wat de deelnemer op zijn
-- eigen betaalpagina heeft aangevinkt. De filmerkenning wordt alleen gevraagd — en alleen
-- geëist — bij een weekend dat gefilmd wordt; dat weet `tavern_media_agreement_required`.
create or replace function public.record_participant_confirmations(
  p_reference text, p_terms_version text,
  p_adult_confirmed boolean default false,
  p_privacy_accepted boolean default false,
  p_filming_acknowledged boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.tavern_booking_participants%rowtype;
        c public.tavern_seat_claims%rowtype;
        w public.tavern_weekends%rowtype;
        v_filmen boolean;
begin
  select * into p from public.tavern_booking_participants
    where payment_reference=trim(p_reference) for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if p.status='paid' then return jsonb_build_object('status','already_paid'); end if;
  if p.status='cancelled' then return jsonb_build_object('status','cancelled'); end if;

  select * into c from public.tavern_seat_claims where id=p.claim_id;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if c.status in ('cancelled','expired') then return jsonb_build_object('status','cancelled'); end if;
  if c.hold_expires_at is null or c.hold_expires_at<=clock_timestamp() then
    return jsonb_build_object('status','expired');
  end if;

  select * into w from public.tavern_weekends where id=c.assigned_weekend_id;
  v_filmen := public.tavern_media_agreement_required(w.slug);

  if p_adult_confirmed is not true or p_privacy_accepted is not true then
    return jsonb_build_object('status','confirmations_required');
  end if;
  if v_filmen and p_filming_acknowledged is not true then
    return jsonb_build_object('status','confirmations_required');
  end if;
  -- Zonder versie is er niets vastgelegd om je later op te beroepen.
  if p_terms_version is null or char_length(trim(p_terms_version))<1 then
    return jsonb_build_object('status','terms_version_missing');
  end if;

  -- `coalesce` houdt het eerste moment vast. Wie twee keer op dezelfde pagina bevestigt,
  -- heeft dat de eerste keer gedaan.
  update public.tavern_booking_participants
    set adult_confirmed_at=coalesce(adult_confirmed_at,now()),
        privacy_accepted_at=coalesce(privacy_accepted_at,now()),
        filming_acknowledged_at=case when v_filmen
          then coalesce(filming_acknowledged_at,now()) else filming_acknowledged_at end,
        terms_version=trim(p_terms_version)
    where id=p.id;

  return jsonb_build_object('status','recorded','participantId',p.id,
    'filmingRequired',v_filmen,'termsVersion',trim(p_terms_version));
end; $$;
revoke all on function public.record_participant_confirmations(text,text,boolean,boolean,boolean) from public, anon, authenticated;
grant execute on function public.record_participant_confirmations(text,text,boolean,boolean,boolean) to service_role;

-- ── Geen betaalsessie zonder bevestigingen ───────────────────────────────────
-- Vervangt de versie in `seat-holds.sql`. Zelfde gedrag, met één grens ervoor: is er niets
-- vastgelegd, dan komt er geen sessie. Dit is de plek waar het écht moet staan — de
-- front-end is te omzeilen en de functie erboven kan iemand vergeten aan te roepen.
create or replace function public.attach_participant_checkout_session(
  p_reference text, p_session_id text, p_session_url text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.tavern_booking_participants%rowtype;
begin
  select * into p from public.tavern_booking_participants
    where payment_reference = trim(p_reference) for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if p.status='paid' then return jsonb_build_object('status','already_paid'); end if;
  if p.adult_confirmed_at is null or p.privacy_accepted_at is null
     or p.terms_version is null then
    return jsonb_build_object('status','confirmations_required');
  end if;
  -- Er is er al een: die blijft staan. Anders krijgt een gast die twee keer klikt twee
  -- betaalsessies, en dan is niet meer te zeggen welke de zijne is.
  if p.checkout_session_id is not null then
    return jsonb_build_object('status','already_attached',
      'checkoutSessionId',p.checkout_session_id,'checkoutSessionUrl',p.checkout_session_url);
  end if;
  update public.tavern_booking_participants
    set checkout_session_id=p_session_id, checkout_session_url=p_session_url
    where id=p.id;
  return jsonb_build_object('status','attached',
    'checkoutSessionId',p_session_id,'checkoutSessionUrl',p_session_url);
end; $$;
revoke all on function public.attach_participant_checkout_session(text,text,text) from public, anon, authenticated;
grant execute on function public.attach_participant_checkout_session(text,text,text) to service_role;

-- ── De ontbrekende schakel ───────────────────────────────────────────────────
-- Legt één deelnemerbetaling vast, en zegt of daarmee de hele boeking rond is.
--
-- Dezelfde vorm als `confirm_tavern_payment`: hetzelfde slot, dezelfde marge van vijf
-- minuten op de deadline, en idempotent. Stripe stuurt een webhook desnoods vijf keer, en
-- dan hoort er niet vijf keer een mail uit te gaan.
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
  if p.status='paid' then
    return jsonb_build_object('status','paid','participantId',p.id,'claimId',c.id,
      'name',p.full_name,'email',p.email,'amountCents',p.amount_cents,
      'weekend',w.slug,'weekendLabel',w.label||' · '||w.date_label,
      'arrivalDate',w.starts_on,'departureDate',w.ends_on,
      'termsVersion',p.terms_version,'paidAt',p.paid_at,
      'bookingComplete',c.status='paid',
      'confirmationEmailSent',p.confirmation_email_sent_at is not null);
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
  end if;

  return jsonb_build_object('status','paid','participantId',p.id,'claimId',c.id,
    'name',p.full_name,'email',p.email,'amountCents',p.amount_cents,
    'weekend',w.slug,'weekendLabel',w.label||' · '||w.date_label,
    'arrivalDate',w.starts_on,'departureDate',w.ends_on,
    'termsVersion',p.terms_version,'paidAt',coalesce(p_paid_at,now()),
    'bookingComplete',v_rond,'outstanding',v_open,
    'bookingName',c.name,'bookingEmail',c.email,'seats',c.party_size,
    'confirmationEmailSent',false);
end; $$;
revoke all on function public.confirm_participant_payment(text,timestamptz) from public, anon, authenticated;
grant execute on function public.confirm_participant_payment(text,timestamptz) to service_role;

-- ── De bevestigingsmail afvinken ─────────────────────────────────────────────
-- Zelfde patroon als `mark_tavern_confirmation_email_sent`: vastleggen dát hij weg is, zodat
-- een herhaalde webhook geen tweede mail stuurt. Nooit "verstuurd" beweren zonder registratie
-- bij de provider.
create or replace function public.mark_participant_confirmation_email_sent(
  p_payment_reference text, p_provider_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.tavern_booking_participants%rowtype;
begin
  select * into p from public.tavern_booking_participants
    where payment_reference=trim(p_payment_reference) for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if p.confirmation_email_sent_at is not null then
    return jsonb_build_object('status','marked','participantId',p.id,
      'providerId',p.confirmation_email_provider_id);
  end if;
  update public.tavern_booking_participants
    set confirmation_email_sent_at=now(),
        confirmation_email_provider_id=nullif(trim(p_provider_id),'')
    where id=p.id;
  return jsonb_build_object('status','marked','participantId',p.id,'providerId',trim(p_provider_id));
end; $$;
revoke all on function public.mark_participant_confirmation_email_sent(text,text) from public, anon, authenticated;
grant execute on function public.mark_participant_confirmation_email_sent(text,text) to service_role;

-- ── De betaalpagina weet nu wat ze moet vragen ───────────────────────────────
-- Vervangt de versie in `seat-holds.sql`. Twee velden erbij: of dit weekend gefilmd wordt —
-- dan hoort de filmerkenning erbij — en of deze deelnemer zijn bevestigingen al heeft gegeven.
-- Er komt nog steeds niets naar buiten over andere gasten of het groepstotaal.
create or replace function public.tavern_payment_request(p_reference text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.tavern_booking_participants%rowtype;
        c public.tavern_seat_claims%rowtype;
        w public.tavern_weekends%rowtype;
begin
  if p_reference is null or char_length(trim(p_reference)) < 8 then
    return jsonb_build_object('status','not_found');
  end if;
  select * into p from public.tavern_booking_participants
    where payment_reference = trim(p_reference);
  if not found then return jsonb_build_object('status','not_found'); end if;

  select * into c from public.tavern_seat_claims where id=p.claim_id;
  if not found then return jsonb_build_object('status','not_found'); end if;

  -- Al betaald: geen tweede betaling, en dat moet de pagina kunnen zeggen.
  if p.status='paid' then
    return jsonb_build_object('status','already_paid','fullName',p.full_name,
      'amountCents',p.amount_cents);
  end if;
  if p.status='cancelled' or c.status in ('cancelled','expired') then
    return jsonb_build_object('status','cancelled');
  end if;
  if c.hold_expires_at is null or c.hold_expires_at <= clock_timestamp() then
    return jsonb_build_object('status','expired','fullName',p.full_name);
  end if;

  select * into w from public.tavern_weekends where id=c.assigned_weekend_id;
  return jsonb_build_object('status','ok',
    'participantId',p.id,
    'fullName',p.full_name,
    'amountCents',p.amount_cents,
    'deadline',c.hold_expires_at,
    'bookingName',c.name,
    'weekendLabel',coalesce(w.label||' · '||w.date_label,'The Lewos Tavern'),
    'filmingRequired',coalesce(public.tavern_media_agreement_required(w.slug),false),
    'confirmationsRecorded',(p.adult_confirmed_at is not null
      and p.privacy_accepted_at is not null and p.terms_version is not null),
    -- Bestaat er al een betaalsessie, dan hergebruiken we die. Twee keer op de link klikken
    -- hoort niet twee betalingen op te leveren.
    'checkoutSessionId',p.checkout_session_id,
    'checkoutSessionUrl',p.checkout_session_url);
end; $$;
revoke all on function public.tavern_payment_request(text) from public, anon, authenticated;
grant execute on function public.tavern_payment_request(text) to service_role;
