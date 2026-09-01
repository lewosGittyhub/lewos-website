-- Repeatable Supabase integration checks. Run only after database/first-access.sql
-- inside a non-production test invocation. Every fixture is rolled back.
begin;

do $$
declare
  full_weekend uuid;
  next_weekend uuid;
  alternative_one jsonb;
  alternative_two jsonb;
  future_one jsonb;
  future_two jsonb;
  first_mark jsonb;
  second_mark jsonb;
  priced_checkout jsonb;
  stored_price integer;
  closed_blocked boolean:=false;
begin
  insert into public.tavern_weekends(slug,label,date_label,sort_order,capacity) values
    ('codex-test-full','Test Full','Test',900001,2),
    ('codex-test-next','Test Next','Test',900002,6);
  select id into full_weekend from public.tavern_weekends where slug='codex-test-full';
  select id into next_weekend from public.tavern_weekends where slug='codex-test-next';

  insert into public.tavern_seat_claims(name,email,party_size,assigned_weekend_id,status,consented_at)
    values('Occupier','occupier-test@example.invalid',1,full_weekend,'paid',now());
  alternative_one:=public.register_tavern_interest('Test Guest','dedupe-alt@example.invalid',2,'codex-test-full',null,now()+interval '1 hour');
  alternative_two:=public.register_tavern_interest('Test Guest','dedupe-alt@example.invalid',2,'codex-test-full',null,now()+interval '1 hour');
  if alternative_one->>'status'<>'alternative_offered' or alternative_one->>'claimId'<>alternative_two->>'claimId' then
    raise exception 'alternative_deduplication_failed';
  end if;

  first_mark:=public.mark_tavern_receipt_email_sent((alternative_one->>'claimId')::uuid,'provider-test');
  second_mark:=public.mark_tavern_receipt_email_sent((alternative_one->>'claimId')::uuid,'provider-test');
  if first_mark->>'status'<>'marked' or second_mark->>'status'<>'already_marked' then
    raise exception 'receipt_marking_failed';
  end if;

  insert into public.tavern_seat_claims(name,email,party_size,assigned_weekend_id,status,consented_at)
    values('Occupier 2','occupier2-test@example.invalid',6,next_weekend,'paid',now());
  future_one:=public.register_tavern_interest('Future Guest','dedupe-future@example.invalid',2,'codex-test-full',null,now()+interval '1 hour');
  future_two:=public.register_tavern_interest('Future Guest','dedupe-future@example.invalid',2,'codex-test-full',null,now()+interval '1 hour');
  if future_one->>'status'<>'future_weekend_interest' or future_one->>'claimId'<>future_two->>'claimId' then
    raise exception 'future_deduplication_failed';
  end if;

  insert into public.tavern_seat_claims(name,email,party_size,assigned_weekend_id,status,consented_at,checkout_token_hash,invitation_expires_at)
    values('Invite Guest','invite-gate@example.invalid',1,next_weekend,'first_access_held',now(),repeat('a',64),now()+interval '1 hour');
  if public.tavern_public_booking_ready() is not false then
    raise exception 'public_gate_failed';
  end if;
  update public.tavern_seat_claims set status='payment_pending' where email='invite-gate@example.invalid';
  if public.tavern_public_booking_ready() is not false then
    raise exception 'payment_pending_invite_gate_failed';
  end if;
  update public.tavern_seat_claims set status='expired' where email='invite-gate@example.invalid';
  insert into public.tavern_seat_claims(name,email,party_size,assigned_weekend_id,status,consented_at)
    values('Uninvited Guest','uninvited-gate@example.invalid',1,next_weekend,'first_access_held',now());
  if public.tavern_public_booking_ready() is not false then
    raise exception 'uninvited_gate_failed';
  end if;
  if (public.begin_tavern_checkout('Public Guest','public-test@example.invalid',1,'codex-test-next','public-test-reference',true,true,'test-terms',false,now()-interval '1 minute',30)->>'status')<>'first_access_windows_active' then
    raise exception 'atomic_public_gate_failed';
  end if;
  begin
    perform public.register_tavern_interest('Late Guest','late-test@example.invalid',1,'codex-test-next',null,now()-interval '1 minute');
  exception when raise_exception then
    if sqlerrm='first_access_closed' then closed_blocked:=true; else raise; end if;
  end;
  if closed_blocked is not true then raise exception 'late_first_access_was_not_blocked'; end if;

  -- De prijs die naar Stripe gaat moet uit dezelfde weekendrij komen als de prijs die
  -- de kalender toont, en wordt op de claim vastgezet voor latere controle.
  update public.tavern_seat_claims set status='expired' where email='uninvited-gate@example.invalid';
  update public.tavern_weekends set price_cents=234567 where id=full_weekend;
  priced_checkout:=public.begin_tavern_checkout('Price Guest','price-test@example.invalid',1,'codex-test-full','price-test-reference',true,true,'test-terms',false,clock_timestamp()-interval '1 minute',30);
  if priced_checkout->>'status'<>'payment_pending' or (priced_checkout->>'priceCents')::integer<>234567 then
    raise exception 'checkout_price_did_not_come_from_weekend';
  end if;
  select price_cents into stored_price from public.tavern_seat_claims where payment_reference='price-test-reference';
  if stored_price<>234567 then raise exception 'checkout_price_snapshot_was_not_stored'; end if;
end $$;

-- Waarom de fasechecks clock_timestamp() gebruiken en niet now(). Binnen één transactie
-- staat now() stil; clock_timestamp() loopt door. Een aanvraag die vóór een deadline
-- begint en daarna op de advisory lock wacht, zou met now() nog steeds als 'op tijd'
-- gelden. Deze controle bewijst het verschil in dezelfde sessie en toont daarna dat een
-- deadline die tijdens het wachten verstrijkt, ook echt sluit.
do $$
declare
  transactietijd timestamptz;
  kloktijd_na_wachten timestamptz;
  deadline timestamptz;
  te_laat boolean:=false;
begin
  transactietijd:=now();
  deadline:=clock_timestamp()+interval '300 milliseconds';
  perform pg_sleep(0.6);
  kloktijd_na_wachten:=clock_timestamp();
  if now()<>transactietijd then
    raise exception 'now_bleek_niet_bevroren';
  end if;
  if kloktijd_na_wachten<=transactietijd then
    raise exception 'clock_timestamp_liep_niet_door';
  end if;
  -- De deadline is tijdens het wachten verstreken. Met now() zou dit erdoor glippen.
  if now()>=deadline then
    raise exception 'proef_ongeldig_de_transactietijd_lag_al_na_de_deadline';
  end if;
  insert into public.tavern_weekends(slug,label,date_label,sort_order,capacity,starts_on,ends_on) values
    ('codex-test-clock','Test Clock','Test',900003,6,date '2027-03-05',date '2027-03-08');
  begin
    perform public.register_tavern_interest('Clock Guest','clock-test@example.invalid',1,'codex-test-clock',null,deadline);
  exception when raise_exception then
    if sqlerrm='first_access_closed' then te_laat:=true; else raise; end if;
  end;
  if te_laat is not true then
    raise exception 'deadline_die_tijdens_het_wachten_verstreek_hield_niet_tegen';
  end if;
end $$;

rollback;

-- Persoonlijke mediatoestemming. Draai dit blok alleen na `database/filming-consent.sql`,
-- in een testproject, nooit tegen productie. Alle gegevens hieronder zijn verzonnen en de
-- transactie wordt aan het eind teruggedraaid.
begin;

do $$
declare
  film_weekend uuid;
  stil_weekend uuid;
  film_claim uuid;
  stil_claim uuid;
  deelnemer uuid;
  tweede uuid;
  hash_een text:=repeat('1',64);
  hash_twee text:=repeat('2',64);
  voortgang_hash text:=repeat('3',64);
  uitnodiging jsonb;
  eerste jsonb;
  herhaling jsonb;
  status_v1 jsonb;
  status_v2 jsonb;
  telling jsonb;
  intrekking jsonb;
  dubbel_geweigerd boolean:=false;
  leeg_geweigerd boolean:=false;
begin
  -- weekend-01 komt uit de seed van `first-access.sql`; die rij laten we met rust.
  select id into film_weekend from public.tavern_weekends where slug='weekend-01';
  if film_weekend is null then raise exception 'draai_eerst_database_first_access_sql'; end if;
  insert into public.tavern_weekends(slug,label,date_label,sort_order,capacity)
    values('codex-test-stil','Test Quiet','Test',900102,6);
  select id into stil_weekend from public.tavern_weekends where slug='codex-test-stil';

  insert into public.tavern_media_agreements(version,document_reference,content_hash,legal_review_reference)
    values('codex-test-v1','/documents/codex-test-v1.pdf',repeat('a',64),'codex-test-review'),
          ('codex-test-v2','/documents/codex-test-v2.pdf',repeat('b',64),'codex-test-review');

  insert into public.tavern_seat_claims(name,email,party_size,assigned_weekend_id,status,consented_at)
    values('Film Booker','film-booker@example.invalid',2,film_weekend,'paid',now()) returning id into film_claim;
  insert into public.tavern_seat_claims(name,email,party_size,assigned_weekend_id,status,consented_at)
    values('Quiet Booker','quiet-booker@example.invalid',2,stil_weekend,'paid',now()) returning id into stil_claim;

  -- Weekend 01 vraagt een persoonlijke overeenkomst, Weekend 02 en elk ander weekend niet.
  if public.tavern_media_agreement_required('weekend-01') is not true then raise exception 'weekend_01_moet_verplicht_zijn'; end if;
  if public.tavern_media_agreement_required('weekend-02') is not false then raise exception 'weekend_02_mag_niet_verplicht_zijn'; end if;
  if public.register_tavern_media_participants(stil_claim,'[{"fullName":"Quiet Guest","email":"quiet@example.invalid","adultDeclared":true}]'::jsonb)->>'status'<>'not_required' then
    raise exception 'een_ongefilmd_weekend_werd_toch_in_de_flow_getrokken';
  end if;
  if exists(select 1 from public.tavern_media_participants where claim_id=stil_claim) then
    raise exception 'er_is_toch_een_deelnemer_aangemaakt_voor_een_ongefilmd_weekend';
  end if;

  -- Dezelfde deelnemer twee keer doorgeven levert één rij en dus één link op.
  perform public.register_tavern_media_participants(film_claim,
    '[{"fullName":"Film Guest","email":"film-guest@example.invalid","adultDeclared":true},
      {"fullName":"Film Guest","email":"film-guest@example.invalid","adultDeclared":true},
      {"fullName":"Second Guest","email":"second-guest@example.invalid","adultDeclared":true}]'::jsonb);
  if (select count(*) from public.tavern_media_participants where claim_id=film_claim)<>2 then
    raise exception 'dezelfde_deelnemer_kreeg_twee_rijen';
  end if;
  select id into deelnemer from public.tavern_media_participants where email='film-guest@example.invalid';
  select id into tweede from public.tavern_media_participants where email='second-guest@example.invalid';

  uitnodiging:=public.issue_tavern_media_invitation(deelnemer,hash_een,21);
  if uitnodiging->>'status'<>'invited' then raise exception 'uitnodigen_mislukte'; end if;

  -- Eén tokenhash kan maar bij één deelnemer horen.
  begin
    perform public.issue_tavern_media_invitation(tweede,hash_een,21);
  exception when unique_violation then dubbel_geweigerd:=true;
  end;
  if dubbel_geweigerd is not true then raise exception 'dezelfde_token_paste_bij_twee_deelnemers'; end if;
  perform public.issue_tavern_media_invitation(tweede,hash_twee,21);

  -- Een lege keuze is geen keuze en wordt geweigerd, niet als nee weggeschreven.
  begin
    perform public.record_tavern_media_consent(hash_een,'codex-test-v1',repeat('a',64),null,null);
  exception when raise_exception then
    if sqlerrm='consent_choice_required' then leeg_geweigerd:=true; else raise; end if;
  end;
  if leeg_geweigerd is not true then raise exception 'een_lege_keuze_werd_geaccepteerd'; end if;

  -- Een tekst die niet bij de versie hoort wordt geweigerd.
  if public.record_tavern_media_consent(hash_een,'codex-test-v1',repeat('f',64),true,true)->>'status'<>'agreement_text_mismatch' then
    raise exception 'een_afwijkende_tekst_werd_toch_vastgelegd';
  end if;

  eerste:=public.record_tavern_media_consent(hash_een,'codex-test-v1',repeat('a',64),true,null);
  if eerste->>'status'<>'recorded' then raise exception 'toestemming_werd_niet_vastgelegd'; end if;
  -- Niet beantwoord is geen advertentietoestemming, en wordt ook niet uit de kern afgeleid.
  if (select paid_advertising_consent from public.tavern_media_consents where audit_reference=eerste->>'auditReference') is not null then
    raise exception 'advertentietoestemming_werd_afgeleid_uit_de_gewone_toestemming';
  end if;

  -- Een tweede inzending maakt geen tweede rij en overschrijft de eerste niet.
  herhaling:=public.record_tavern_media_consent(hash_een,'codex-test-v1',repeat('a',64),false,true);
  if herhaling->>'status'<>'already_recorded' or herhaling->>'auditReference'<>eerste->>'auditReference' then
    raise exception 'een_tweede_inzending_was_niet_veilig';
  end if;
  if (select count(*) from public.tavern_media_consents where participant_id=deelnemer and withdrawn_at is null)<>1 then
    raise exception 'er_staan_twee_levende_toestemmingen_voor_dezelfde_versie';
  end if;

  -- Een inhoudelijk nieuwe versie vraagt opnieuw akkoord.
  status_v1:=public.get_tavern_media_agreement_state(hash_een,'codex-test-v1');
  status_v2:=public.get_tavern_media_agreement_state(hash_een,'codex-test-v2');
  if (status_v1->>'alreadyRecorded')::boolean is not true then raise exception 'de_bestaande_versie_werd_niet_herkend'; end if;
  if (status_v2->>'alreadyRecorded')::boolean is not false then raise exception 'oude_toestemming_gold_ook_voor_een_nieuwe_versie'; end if;

  -- De hoofdboeker ziet aantallen, en die aantallen horen bij één versie.
  update public.tavern_seat_claims set media_progress_token_hash=voortgang_hash,media_progress_expires_at=clock_timestamp()+interval '7 days' where id=film_claim;
  telling:=public.get_tavern_media_progress(voortgang_hash,'codex-test-v1');
  if (telling->>'completed')::integer<>1 or (telling->>'total')::integer<>2 then raise exception 'de_voortgangsteller_klopt_niet'; end if;
  if telling ? 'fullName' or telling ? 'email' or telling ? 'standardUseConsent' then
    raise exception 'de_voortgang_lekte_gegevens_van_deelnemers';
  end if;
  if (public.get_tavern_media_progress(voortgang_hash,'codex-test-v2')->>'completed')::integer<>0 then
    raise exception 'een_nieuwe_versie_telde_oude_toestemming_mee';
  end if;

  -- Intrekken wist niets: de rij blijft staan met een tijdstempel.
  intrekking:=public.withdraw_tavern_media_consent(hash_een,'codex-test-v1');
  if intrekking->>'status'<>'withdrawn' then raise exception 'intrekken_mislukte'; end if;
  if (select withdrawn_at from public.tavern_media_consents where audit_reference=eerste->>'auditReference') is null then
    raise exception 'de_intrekking_werd_niet_vastgelegd';
  end if;
  if (public.get_tavern_media_progress(voortgang_hash,'codex-test-v1')->>'completed')::integer<>0 then
    raise exception 'een_ingetrokken_toestemming_telde_nog_mee';
  end if;

  -- Een ingetrokken link bestaat niet meer, en een verlopen link doet niets.
  perform public.revoke_tavern_media_invitation(tweede,hash_twee);
  if public.get_tavern_media_agreement_state(hash_twee,'codex-test-v1')->>'status'<>'invalid_link' then
    raise exception 'een_ingetrokken_link_werkte_nog';
  end if;
  update public.tavern_media_participants set invitation_token_hash=hash_twee,invitation_expires_at=clock_timestamp()-interval '1 day' where id=tweede;
  if public.get_tavern_media_agreement_state(hash_twee,'codex-test-v1')->>'status'<>'link_expired' then
    raise exception 'een_verlopen_link_werd_niet_geweigerd';
  end if;
  if public.record_tavern_media_consent(hash_twee,'codex-test-v1',repeat('a',64),true,true)->>'status'<>'link_expired' then
    raise exception 'een_verlopen_link_kon_nog_toestemming_vastleggen';
  end if;
end $$;

rollback;
