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
