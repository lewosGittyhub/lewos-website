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
  -- Sinds 4 september 2026 verkoopt de site rechtstreeks. Een claim zonder uitnodiging is
  -- alleen nog vastgelegde interesse en houdt de verkoop niet meer tegen; die stoelen tellen
  -- wel mee in de bezetting, dus overboeken kan er niet door ontstaan. Alleen een uitnodiging
  -- die al de deur uit is houdt zijn venster, want daaraan is een termijn beloofd.
  insert into public.tavern_seat_claims(name,email,party_size,assigned_weekend_id,status,consented_at)
    values('Uninvited Guest','uninvited-gate@example.invalid',1,next_weekend,'first_access_held',now());
  if public.tavern_public_booking_ready() is not true then
    raise exception 'losse_interesse_hield_de_verkoop_nog_tegen';
  end if;
  -- Dit weekend is op dit punt vol, dus de verkoop wordt geweigerd wegens stoelen. Het
  -- gaat er hier om dat de reden is veranderd: niet meer 'first_access_windows_active',
  -- maar gewoon 'not_available'. De poort is weg, de bezetting beschermt nog steeds.
  if (public.begin_tavern_checkout('Public Guest','public-test@example.invalid',1,'codex-test-next','public-test-reference',true,true,'test-terms',false,now()-interval '1 minute',30)->>'status')<>'not_available' then
    raise exception 'een_vol_weekend_gaf_niet_de_juiste_weigering';
  end if;
  if (public.begin_tavern_checkout('Public Guest','public-test2@example.invalid',1,'codex-test-next','public-test-reference-2',true,true,'test-terms',false,now()-interval '1 minute',30)->>'status')='first_access_windows_active' then
    raise exception 'losse_interesse_hield_de_verkoop_nog_tegen_via_de_poort';
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
  if stored_price is distinct from 234567 then raise exception 'checkout_price_snapshot_was_not_stored'; end if;
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


-- Allergieën en dieetwensen: eigen kolommen, niet in het bericht, niets afgekapt.
-- Robert, 2 september 2026: belangrijke informatie mag niet verborgen raken in één
-- algemeen berichtveld. Dit blok probeert dat echt uit in plaats van het na te lezen.
do $$
declare
  dieet_weekend uuid;
  dieet_claim jsonb;
  bewaarde_allergie text;
  bewaarde_dieet text;
  bewaard_bericht text;
  te_lang_geweigerd boolean:=false;
begin
  insert into public.tavern_weekends(slug,label,date_label,sort_order,capacity)
    values('codex-test-diet','Test Diet','Test',900010,6);
  select id into dieet_weekend from public.tavern_weekends where slug='codex-test-diet';

  dieet_claim:=public.register_tavern_interest('Diet Guest','diet-test@example.invalid',1,'codex-test-diet',
    'We arrive late on Friday.',now()+interval '1 hour',
    'Severe peanut allergy, carries an EpiPen','Vegetarian, no dairy');
  select allergies,dietary_requirements,message into bewaarde_allergie,bewaarde_dieet,bewaard_bericht
    from public.tavern_seat_claims where id=(dieet_claim->>'claimId')::uuid;
  if bewaarde_allergie is distinct from 'Severe peanut allergy, carries an EpiPen' then
    raise exception 'de_allergie_is_niet_bewaard_zoals_ingevuld';
  end if;
  if bewaarde_dieet is distinct from 'Vegetarian, no dairy' then
    raise exception 'de_dieetwens_is_niet_bewaard_zoals_ingevuld';
  end if;
  if bewaard_bericht is distinct from 'We arrive late on Friday.' then
    raise exception 'het_bericht_is_vervuild_met_de_andere_velden';
  end if;
  if position('peanut' in bewaard_bericht)>0 then
    raise exception 'de_allergie_werd_alsnog_in_het_bericht_geplakt';
  end if;

  -- Een aanvraag zonder de twee nieuwe velden hoort gewoon te werken: bestaande
  -- aanroepers mogen niet breken en de kolommen blijven dan leeg.
  dieet_claim:=public.register_tavern_interest('Plain Guest','plain-test@example.invalid',1,'codex-test-diet',
    null,now()+interval '1 hour');
  select allergies,dietary_requirements into bewaarde_allergie,bewaarde_dieet
    from public.tavern_seat_claims where id=(dieet_claim->>'claimId')::uuid;
  if bewaarde_allergie is not null or bewaarde_dieet is not null then
    raise exception 'een_aanvraag_zonder_de_nieuwe_velden_vulde_ze_toch';
  end if;

  -- Een herhaalde aanvraag mag nieuwe allergie-informatie niet weggooien, en een lege
  -- inzending mag nooit wissen wat er al staat. Gevonden bij de eindcontrole van
  -- 2 september 2026: dit ging eerst stil mis.
  dieet_claim:=public.register_tavern_interest('Diet Guest','diet-test@example.invalid',1,'codex-test-diet',
    null,now()+interval '1 hour','Severe peanut allergy, carries an EpiPen; also shellfish',null);
  if (dieet_claim->>'duplicate')<>'true' then
    raise exception 'de_tweede_aanvraag_gold_niet_als_duplicaat';
  end if;
  if (dieet_claim->>'detailsUpdated')<>'true' then
    raise exception 'de_bijgewerkte_allergie_werd_niet_gemeld';
  end if;
  select allergies,dietary_requirements,message into bewaarde_allergie,bewaarde_dieet,bewaard_bericht
    from public.tavern_seat_claims where id=(dieet_claim->>'claimId')::uuid;
  if bewaarde_allergie is distinct from 'Severe peanut allergy, carries an EpiPen; also shellfish' then
    raise exception 'de_aangevulde_allergie_is_niet_opgeslagen';
  end if;
  if bewaarde_dieet is distinct from 'Vegetarian, no dairy' then
    raise exception 'een_lege_inzending_wiste_de_bestaande_dieetwens';
  end if;
  if bewaard_bericht is distinct from 'We arrive late on Friday.' then
    raise exception 'een_lege_inzending_wiste_het_bestaande_bericht';
  end if;
  -- Nog een keer met precies dezelfde gegevens: dan valt er niets bij te werken.
  dieet_claim:=public.register_tavern_interest('Diet Guest','diet-test@example.invalid',1,'codex-test-diet',
    null,now()+interval '1 hour','Severe peanut allergy, carries an EpiPen; also shellfish',null);
  if (dieet_claim->>'detailsUpdated')<>'false' then
    raise exception 'een_ongewijzigde_inzending_meldde_toch_een_bijwerking';
  end if;
  if (select count(*) from public.tavern_seat_claims where email='diet-test@example.invalid')<>1 then
    raise exception 'er_ontstond_een_tweede_claim_voor_hetzelfde_adres';
  end if;

  -- De publieke checkout gaat pas open als er nergens nog een First Access-venster
  -- openstaat. Die poort is bewust globaal, zonder weekendfilter, en staat identiek in
  -- tavern_public_booking_ready(). De twee claims hierboven houden hem dicht, dus die
  -- sluiten we eerst -- net als bij de poortproef eerder in dit blok.
  update public.tavern_seat_claims set status='expired'
    where email in('diet-test@example.invalid','plain-test@example.invalid');

  -- Ook de publieke checkout bewaart de drie velden in hun eigen kolommen.
  dieet_claim:=public.begin_tavern_checkout('Checkout Guest','checkout-diet@example.invalid',1,'codex-test-diet',
    'ref-diet-1',true,true,'terms-test-v1',false,now()-interval '1 hour',40,
    'Peanuts - severe','Vegetarian','We arrive late.');
  if (dieet_claim->>'status')<>'payment_pending' then
    raise exception 'de_checkout_gaf_geen_hold_terug';
  end if;
  select allergies,dietary_requirements,message into bewaarde_allergie,bewaarde_dieet,bewaard_bericht
    from public.tavern_seat_claims where id=(dieet_claim->>'claimId')::uuid;
  if bewaarde_allergie is distinct from 'Peanuts - severe' or bewaarde_dieet is distinct from 'Vegetarian' or bewaard_bericht is distinct from 'We arrive late.' then
    raise exception 'de_checkout_bewaarde_de_drie_velden_niet_apart';
  end if;

  -- Het First Access-betaalvenster vult aan en wist nooit. Dit is het pad waarop iemand
  -- zijn vergeten allergie alsnog toevoegt, vlak voor hij betaalt.
  update public.tavern_seat_claims set checkout_token_hash=repeat('c',64),invitation_expires_at=now()+interval '1 hour',
    status='first_access_held',allergies='Peanuts',dietary_requirements='Vegetarian',message='Original note.'
    where id=(dieet_claim->>'claimId')::uuid;
  dieet_claim:=public.begin_tavern_first_access_checkout(repeat('c',64),'ref-fa-1',true,true,'terms-test-v1',false,40,
    'Peanuts and shellfish',null,null);
  if (dieet_claim->>'status')<>'payment_pending' then
    raise exception 'het_betaalvenster_gaf_geen_hold_terug';
  end if;
  select allergies,dietary_requirements,message into bewaarde_allergie,bewaarde_dieet,bewaard_bericht
    from public.tavern_seat_claims where id=(dieet_claim->>'claimId')::uuid;
  if bewaarde_allergie is distinct from 'Peanuts and shellfish' then
    raise exception 'de_aangevulde_allergie_kwam_niet_aan_bij_de_checkout';
  end if;
  if bewaarde_dieet is distinct from 'Vegetarian' or bewaard_bericht is distinct from 'Original note.' then
    raise exception 'een_leeg_veld_wiste_bestaande_gegevens_bij_de_checkout';
  end if;

  -- Te lang wordt geweigerd, niet stil afgekapt, en plaatst niemand.
  begin
    perform public.register_tavern_interest('Long Guest','long-test@example.invalid',1,'codex-test-diet',
      null,now()+interval '1 hour',repeat('p',501),null);
  exception when others then
    if sqlerrm='invalid_allergies' then te_lang_geweigerd:=true; else raise; end if;
  end;
  if not te_lang_geweigerd then
    raise exception 'een_allergie_van_501_tekens_werd_geaccepteerd';
  end if;
  if exists(select 1 from public.tavern_seat_claims where email='long-test@example.invalid') then
    raise exception 'een_geweigerde_aanvraag_plaatste_toch_een_rij';
  end if;
end $$;


-- Directe verkoop, ingevoerd op 4 september 2026. First Access is geen voorportaal meer:
-- bezoekers kopen rechtstreeks. Deze vier controles leggen vast wat daarbij mag en niet mag.
do $$
declare vk uuid; uitkomst jsonb; eerste jsonb; tweede jsonb; a text; d text;
begin
  insert into public.tavern_weekends(slug,label,date_label,sort_order,capacity)
    values('codex-test-verkoop','Verkoop','Test',900011,6);
  select id into vk from public.tavern_weekends where slug='codex-test-verkoop';

  -- Eerdere proeven in dit blok laten een lopende uitnodiging achter, en die houdt de
  -- publieke verkoop terecht tegen. Die sluiten we eerst: deze vier controles gaan over de
  -- directe verkoop, niet over het venster van een genodigde.
  update public.tavern_seat_claims set invitation_expires_at=now()-interval '1 minute'
    where checkout_token_hash is not null and invitation_expires_at>now();

  -- 1. Losse interesse houdt de verkoop niet meer tegen. Die stoelen tellen wel mee in de
  --    bezetting, dus overboeken kan er niet door ontstaan.
  insert into public.tavern_seat_claims(name,email,party_size,assigned_weekend_id,status,consented_at)
    values('Interesse','verkoop-interesse@example.invalid',1,vk,'first_access_held',now());
  if public.tavern_public_booking_ready() is not true then
    raise exception 'losse_interesse_blokkeert_de_verkoop_nog_steeds';
  end if;
  uitkomst:=public.begin_tavern_checkout('Koper Een','verkoop-een@example.invalid',2,'codex-test-verkoop',
    'verkoop-ref-1',true,true,'terms-test-v1',false,now()-interval '1 hour',40,
    'Peanuts','Vegetarian','Arriving late.');
  if (uitkomst->>'status')<>'payment_pending' then
    raise exception 'de_directe_verkoop_kwam_niet_door';
  end if;
  select allergies,dietary_requirements into a,d from public.tavern_seat_claims where id=(uitkomst->>'claimId')::uuid;
  if a is distinct from 'Peanuts' or d is distinct from 'Vegetarian' then
    raise exception 'de_directe_verkoop_bewaarde_allergie_of_dieet_niet';
  end if;

  -- 2. Twee keer klikken hervat dezelfde poging en pakt geen extra stoelen.
  eerste:=public.begin_tavern_checkout('Koper Twee','verkoop-twee@example.invalid',2,'codex-test-verkoop',
    'verkoop-ref-2',true,true,'terms-test-v1',false,now()-interval '1 hour',40,null,null,null);
  tweede:=public.begin_tavern_checkout('Koper Twee','verkoop-twee@example.invalid',2,'codex-test-verkoop',
    'verkoop-ref-3',true,true,'terms-test-v1',false,now()-interval '1 hour',40,
    'Shellfish',null,null);
  if (tweede->>'claimId')<>(eerste->>'claimId') then
    raise exception 'een_tweede_klik_maakte_een_tweede_stoelhold';
  end if;
  if (select count(*) from public.tavern_seat_claims where email='verkoop-twee@example.invalid')<>1 then
    raise exception 'een_tweede_klik_maakte_een_tweede_claim';
  end if;
  -- De hervatting mag nieuwe allergie-informatie niet weggooien.
  select allergies into a from public.tavern_seat_claims where id=(eerste->>'claimId')::uuid;
  if a is distinct from 'Shellfish' then
    raise exception 'de_hervatting_liet_de_nieuwe_allergie_vallen';
  end if;

  -- 3. Vol is vol: vier stoelen bezet, een groep van drie past niet meer.
  uitkomst:=public.begin_tavern_checkout('Koper Drie','verkoop-drie@example.invalid',3,'codex-test-verkoop',
    'verkoop-ref-4',true,true,'terms-test-v1',false,now()-interval '1 hour',40,null,null,null);
  if (uitkomst->>'status')<>'not_available' then
    raise exception 'een_te_grote_groep_kreeg_toch_stoelen';
  end if;
  if (uitkomst->>'remaining')::integer<>1 then
    raise exception 'het_aantal_vrije_stoelen_klopt_niet_in_de_weigering';
  end if;

  -- 4. Een uitgegeven uitnodiging houdt zijn venster: daaraan is een termijn beloofd.
  insert into public.tavern_seat_claims(name,email,party_size,assigned_weekend_id,status,consented_at,checkout_token_hash,invitation_expires_at)
    values('Genodigde','verkoop-genodigde@example.invalid',1,vk,'first_access_held',now(),repeat('f',64),now()+interval '2 hours');
  if public.tavern_public_booking_ready() is not false then
    raise exception 'een_lopende_uitnodiging_hield_de_verkoop_niet_tegen';
  end if;
  uitkomst:=public.begin_tavern_checkout('Koper Vier','verkoop-vier@example.invalid',1,'codex-test-verkoop',
    'verkoop-ref-5',true,true,'terms-test-v1',false,now()-interval '1 hour',40,null,null,null);
  if (uitkomst->>'status')<>'first_access_windows_active' then
    raise exception 'de_verkoop_liep_door_langs_een_lopende_uitnodiging';
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
  vol_claim uuid;
  registratie jsonb;
  te_veel jsonb;
  deelnemer uuid;
  tweede uuid;
  hash_een text:=repeat('1',64);
  hash_twee text:=repeat('2',64);
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
  insert into public.tavern_seat_claims(name,email,party_size,assigned_weekend_id,status,consented_at)
    values('Full Booker','full-booker@example.invalid',2,film_weekend,'paid',now()) returning id into vol_claim;

  -- Weekend 01 vraagt een persoonlijke overeenkomst, Weekend 02 en elk ander weekend niet.
  if public.tavern_media_agreement_required('weekend-01') is not true then raise exception 'weekend_01_moet_verplicht_zijn'; end if;
  if public.tavern_media_agreement_required('weekend-02') is not false then raise exception 'weekend_02_mag_niet_verplicht_zijn'; end if;
  if public.register_tavern_media_participants(stil_claim,'[{"fullName":"Quiet Guest","email":"quiet@example.invalid","adultDeclared":true}]'::jsonb)->>'status'<>'not_required' then
    raise exception 'een_ongefilmd_weekend_werd_toch_in_de_flow_getrokken';
  end if;
  if exists(select 1 from public.tavern_media_participants where claim_id=stil_claim) then
    raise exception 'er_is_toch_een_deelnemer_aangemaakt_voor_een_ongefilmd_weekend';
  end if;

  -- Dezelfde deelnemer twee keer doorgeven levert één rij en dus één link op. En, sinds de
  -- bevinding van Codex op 1 september 2026: een dubbele regel mag geen stoel kosten.
  -- `film_claim` heeft party_size 2. De lijst hieronder is drie regels lang maar bevat twee
  -- unieke gasten. Er werd op de lengte van de lijst geteld, dus dit werd geweigerd.
  registratie:=public.register_tavern_media_participants(film_claim,
    '[{"fullName":"Film Guest","email":"film-guest@example.invalid","adultDeclared":true},
      {"fullName":"Film Guest","email":"film-guest@example.invalid","adultDeclared":true},
      {"fullName":"Second Guest","email":"second-guest@example.invalid","adultDeclared":true}]'::jsonb);
  if registratie->>'status'<>'registered' then
    raise exception 'een_dubbele_regel_werd_geteld_als_extra_deelnemer: %', registratie->>'status';
  end if;
  if (registratie->>'added')::integer<>2 then
    raise exception 'verkeerd_aantal_toegevoegd: %', registratie->>'added';
  end if;
  if (select count(*) from public.tavern_media_participants where claim_id=film_claim)<>2 then
    raise exception 'dezelfde_deelnemer_kreeg_twee_rijen';
  end if;

  -- Maar méér unieke gasten dan stoelen blijft geweigerd, en er wordt dan niets geplaatst.
  te_veel:=public.register_tavern_media_participants(vol_claim,
    '[{"fullName":"Guest One","email":"one@example.invalid","adultDeclared":true},
      {"fullName":"Guest Two","email":"two@example.invalid","adultDeclared":true},
      {"fullName":"Guest Three","email":"three@example.invalid","adultDeclared":true}]'::jsonb);
  if te_veel->>'status'<>'too_many_participants' then
    raise exception 'drie_unieke_gasten_pasten_op_twee_stoelen: %', te_veel->>'status';
  end if;
  if (select count(*) from public.tavern_media_participants where claim_id=vol_claim)<>0 then
    raise exception 'een_geweigerde_registratie_plaatste_toch_deelnemers';
  end if;

  -- En een tweede aanroep mag het weekend niet alsnog overvullen. film_claim zit vol met
  -- twee gasten; een derde adres erbij hoort te stuiten op dezelfde grens.
  te_veel:=public.register_tavern_media_participants(film_claim,
    '[{"fullName":"Third Guest","email":"third-guest@example.invalid","adultDeclared":true}]'::jsonb);
  if te_veel->>'status'<>'too_many_participants' then
    raise exception 'een_tweede_aanroep_kon_het_weekend_overvullen: %', te_veel->>'status';
  end if;
  if (select count(*) from public.tavern_media_participants where claim_id=film_claim)<>2 then
    raise exception 'een_tweede_aanroep_voegde_er_toch_een_toe';
  end if;

  -- Dezelfde lijst nog een keer insturen verandert niets en is geen fout.
  registratie:=public.register_tavern_media_participants(film_claim,
    '[{"fullName":"Film Guest","email":"film-guest@example.invalid","adultDeclared":true}]'::jsonb);
  if registratie->>'status'<>'registered' or (registratie->>'added')::integer<>0 then
    raise exception 'een_herhaalde_inzending_was_niet_veilig: %', registratie;
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

  -- De grens tussen twee deelnemers, echt uitgeprobeerd. Dit is de belangrijkste regel van de
  -- hele flow: de token van A opent het record van A en verder niets. In de code staat dat er
  -- goed in — elke functie zoekt op de tokenhash en accepteert geen deelnemer-id van de
  -- aanroeper — maar nagelezen is niet hetzelfde als geprobeerd.
  if public.get_tavern_media_agreement_state(hash_een,'codex-test-v1')->>'participantId'<>deelnemer::text then
    raise exception 'de_token_van_a_opende_het_record_van_iemand_anders';
  end if;
  if public.get_tavern_media_agreement_state(hash_twee,'codex-test-v1')->>'participantId'<>tweede::text then
    raise exception 'de_token_van_b_opende_het_record_van_iemand_anders';
  end if;
  if public.get_tavern_media_agreement_state(hash_een,'codex-test-v1')->>'fullName'<>'Film Guest' then
    raise exception 'de_naam_bij_de_token_van_a_klopte_niet';
  end if;
  -- A heeft getekend, B niet. Dat mag bij B niets veranderd hebben.
  if (public.get_tavern_media_agreement_state(hash_twee,'codex-test-v1')->>'alreadyRecorded')::boolean is not false then
    raise exception 'de_toestemming_van_a_lekte_naar_het_record_van_b';
  end if;
  if (select count(*) from public.tavern_media_consents where participant_id=tweede)<>0 then
    raise exception 'er_stond_een_toestemming_bij_b_die_a_had_gegeven';
  end if;
  -- En B kan met zijn eigen token gewoon tekenen, zonder dat dat A raakt.
  if public.record_tavern_media_consent(hash_twee,'codex-test-v1',repeat('a',64),false,null)->>'status'<>'recorded' then
    raise exception 'b_kon_niet_tekenen_met_zijn_eigen_token';
  end if;
  if (select standard_use_consent from public.tavern_media_consents where participant_id=deelnemer and withdrawn_at is null) is not true then
    raise exception 'de_keuze_van_b_overschreef_die_van_a';
  end if;
  if (select standard_use_consent from public.tavern_media_consents where participant_id=tweede and withdrawn_at is null) is not false then
    raise exception 'de_keuze_van_b_werd_niet_als_eigen_keuze_vastgelegd';
  end if;

  -- Een inhoudelijk nieuwe versie vraagt opnieuw akkoord.
  status_v1:=public.get_tavern_media_agreement_state(hash_een,'codex-test-v1');
  status_v2:=public.get_tavern_media_agreement_state(hash_een,'codex-test-v2');
  if (status_v1->>'alreadyRecorded')::boolean is not true then raise exception 'de_bestaande_versie_werd_niet_herkend'; end if;
  if (status_v2->>'alreadyRecorded')::boolean is not false then raise exception 'oude_toestemming_gold_ook_voor_een_nieuwe_versie'; end if;

  -- De operator ziet aantallen, en die aantallen horen bij één versie. Geen token: in de
  -- operator-flow roept alleen service_role deze functie aan, met het claim-id.
  -- Twee deelnemers, allebei getekend: A gaf toestemming, B weigerde. Een weigering is óók
  -- een voltooide keuze, dus de teller staat op twee. Wie wat koos, komt hier niet uit.
  telling:=public.get_tavern_media_progress(film_claim,'codex-test-v1');
  if (telling->>'completed')::integer<>2 or (telling->>'total')::integer<>2 then raise exception 'de_voortgangsteller_klopt_niet'; end if;
  if telling ? 'fullName' or telling ? 'email' or telling ? 'standardUseConsent' then
    raise exception 'de_voortgang_lekte_gegevens_van_deelnemers';
  end if;
  if (public.get_tavern_media_progress(film_claim,'codex-test-v2')->>'completed')::integer<>0 then
    raise exception 'een_nieuwe_versie_telde_oude_toestemming_mee';
  end if;

  -- Intrekken wist niets: de rij blijft staan met een tijdstempel.
  intrekking:=public.withdraw_tavern_media_consent(hash_een,'codex-test-v1');
  if intrekking->>'status'<>'withdrawn' then raise exception 'intrekken_mislukte'; end if;
  if (select withdrawn_at from public.tavern_media_consents where audit_reference=eerste->>'auditReference') is null then
    raise exception 'de_intrekking_werd_niet_vastgelegd';
  end if;
  -- A trekt in. B heeft ook getekend, dus de teller hoort op één te blijven staan en niet
  -- op nul: intrekken raakt alleen de intrekker.
  if (public.get_tavern_media_progress(film_claim,'codex-test-v1')->>'completed')::integer<>1 then
    raise exception 'het_intrekken_door_a_raakte_ook_de_toestemming_van_b';
  end if;
  if (select withdrawn_at from public.tavern_media_consents where participant_id=tweede) is not null then
    raise exception 'de_intrekking_van_a_trok_ook_de_toestemming_van_b_in';
  end if;
  -- Een onbekende claim geeft geen tellingen terug.
  if public.get_tavern_media_progress('00000000-0000-4000-8000-000000000000'::uuid,'codex-test-v1')->>'status'<>'unknown_claim' then
    raise exception 'een_onbekende_claim_gaf_toch_een_telling';
  end if;

  -- Intrekken door de operator, zónder de tokenhash: dat is de weg die Robert bewandelt als
  -- iemand zijn link kwijt is. De vastgelegde keuze mag daar niet door veranderen.
  if public.revoke_tavern_media_participant_link(deelnemer)->>'status'<>'revoked' then
    raise exception 'de_operator_kon_een_link_niet_intrekken';
  end if;
  if public.get_tavern_media_agreement_state(hash_een,'codex-test-v1')->>'status'<>'invalid_link' then
    raise exception 'een_door_de_operator_ingetrokken_link_werkte_nog';
  end if;
  -- Nog een keer intrekken is geen fout, en het raakt de toestemming niet aan.
  if public.revoke_tavern_media_participant_link(deelnemer)->>'status'<>'no_active_link' then
    raise exception 'twee_keer_intrekken_was_niet_veilig';
  end if;
  if (select count(*) from public.tavern_media_consents where participant_id=deelnemer)<>1 then
    raise exception 'het_intrekken_van_een_link_wiste_de_toestemming';
  end if;
  -- En daarna kan er gewoon een nieuwe link uit.
  if public.issue_tavern_media_invitation(deelnemer,repeat('4',64),21)->>'status'<>'invited' then
    raise exception 'na_intrekken_kon_er_geen_nieuwe_link_worden_uitgegeven';
  end if;
  if public.get_tavern_media_agreement_state(repeat('4',64),'codex-test-v1')->>'status'<>'ready' then
    raise exception 'de_opnieuw_uitgegeven_link_werkte_niet';
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


-- ═══════════════════════════════════════════════════════════════════════════
--  Toegevoegd 6 september 2026: het verblijfsvenster, het samengevoegde
--  dieetveld en de beheerfuncties. Alles rolt terug.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Het venster waarin een gast mag kiezen ─────────────────────────────────
do $$
declare
  w public.tavern_weekends%rowtype;
  van date; tot date;
begin
  select * into w from public.tavern_weekends where slug='weekend-01';
  select s.van, s.tot into van, tot from private.stay_window(w) s;
  -- Weekend 01 loopt van vrijdag 30 oktober tot maandag 2 november.
  if van <> date '2026-10-26' then
    raise exception 'venster_begint_niet_op_de_maandag_ervoor: %', van;
  end if;
  -- **De wisseldag telt mee.** Weekend 02 begint vrijdag 6 november; jij vertrekt die
  -- ochtend om 09:30, zij komen om 16:00. Jouw laatste nacht is donderdag de 5e, hun
  -- eerste nacht is vrijdag de 6e. Die botsen niet, dus de 6e mag je vertrekdag zijn.
  if tot <> date '2026-11-06' then
    raise exception 'vrijdagochtend_is_geen_geldige_vertrekdag: %', tot;
  end if;

  select * into w from public.tavern_weekends where slug='weekend-02';
  select s.van, s.tot into van, tot from private.stay_window(w) s;
  -- Andersom net zo: aankomen op de dag dat het vorige weekend vertrekt.
  if van <> date '2026-11-02' then
    raise exception 'aankomen_op_de_wisseldag_kan_niet: %', van;
  end if;
end $$;

-- ── De aanvraag zelf: de grens staat in de database, niet alleen in de browser ──
do $$
declare
  weekend_id uuid;
  claim_id uuid;
  uitkomst jsonb;
  geweigerd boolean;
begin
  select id into weekend_id from public.tavern_weekends where slug='weekend-01';
  insert into public.tavern_seat_claims(name,email,party_size,assigned_weekend_id,status,consented_at)
    values('Venster Gast','venster-test@example.invalid',2,weekend_id,'first_access_held',now())
    returning id into claim_id;

  -- Vrijdagochtend 6 november moet kunnen.
  uitkomst:=public.set_tavern_stay_request(claim_id, date '2026-10-26', date '2026-11-06');
  if uitkomst->>'status' <> 'ok' then raise exception 'geldige_aanvraag_werd_geweigerd: %', uitkomst; end if;
  if (uitkomst->>'nightsAfter')::int <> 4 then
    raise exception 'de_nachten_na_het_weekend_kloppen_niet: %', uitkomst->>'nightsAfter';
  end if;

  -- Zaterdag de 7e niet: dan slaap je een nacht die van het volgende weekend is.
  geweigerd:=false;
  begin
    perform public.set_tavern_stay_request(claim_id, null, date '2026-11-07');
  exception when others then
    if sqlerrm='stay_departure_too_late' then geweigerd:=true; else raise; end if;
  end;
  if not geweigerd then raise exception 'een_nacht_van_het_volgende_weekend_kwam_erdoor'; end if;

  -- En vóór de maandag ervóór ook niet.
  geweigerd:=false;
  begin
    perform public.set_tavern_stay_request(claim_id, date '2026-10-25', null);
  exception when others then
    if sqlerrm='stay_arrival_too_early' then geweigerd:=true; else raise; end if;
  end;
  if not geweigerd then raise exception 'een_te_vroege_aankomst_kwam_erdoor'; end if;

  -- Het bevestigde verblijf blijft ondertussen het weekend zelf.
  if exists(select 1 from public.tavern_seat_claims
             where id=claim_id and (arrival_date is not null or departure_date is not null)) then
    raise exception 'een_aanvraag_gold_meteen_als_bevestigd_verblijf';
  end if;
  if (select extra_nights_status from public.tavern_seat_claims where id=claim_id) <> 'requested' then
    raise exception 'de_status_staat_niet_op_requested';
  end if;
end $$;

-- ── Allergieën en dieetwensen: één veld, bestaande gegevens behouden ───────
do $$
declare
  weekend_id uuid;
  oud_id uuid;
  detail jsonb;
  overzicht jsonb;
  admin_email text := 'lewos.co@gmail.com';
  geweigerd boolean;
begin
  select id into weekend_id from public.tavern_weekends where slug='weekend-01';

  -- Een boeking van vóór de samenvoeging: twee gevulde kolommen, `dietary_notes` leeg.
  insert into public.tavern_seat_claims(name,email,party_size,assigned_weekend_id,status,
      allergies,dietary_requirements,consented_at)
    values('Oude Boeking','oud-dieet@example.invalid',2,weekend_id,'paid',
      'Peanuts - severe','Vegetarian',now())
    returning id into oud_id;

  -- De samenvoeging plakt ze aan elkaar mét hun kopje, en verliest niets.
  if private.merged_dietary_text('Peanuts - severe','Vegetarian')
     <> E'Allergies: Peanuts - severe\nDietary requirements: Vegetarian' then
    raise exception 'de_samenvoeging_heeft_een_andere_vorm: %',
      private.merged_dietary_text('Peanuts - severe','Vegetarian');
  end if;
  if private.merged_dietary_text(null,null) is not null then
    raise exception 'twee_lege_velden_leveren_geen_null_op';
  end if;

  -- Het detailvenster toont één tekst met beide regels erin, en de oude velden staan er
  -- niet los naast — anders leest iemand dezelfde allergie twee keer.
  detail:=public.admin_booking_detail(admin_email, oud_id);
  if detail->>'dietaryNotes' is null or detail->>'dietaryNotes' not like '%Peanuts - severe%'
     or detail->>'dietaryNotes' not like '%Vegetarian%' then
    raise exception 'bestaande_dieetgegevens_zijn_verdwenen: %', detail->>'dietaryNotes';
  end if;
  if detail ? 'allergies' or detail ? 'dietary' then
    raise exception 'de_oude_velden_staan_er_nog_los_naast';
  end if;

  -- Het maandoverzicht draagt er niets van.
  overzicht:=public.admin_bookings_in_range(admin_email, date '2026-10-01', date '2026-11-30');
  if overzicht::text like '%Peanuts%' or overzicht::text like '%Vegetarian%' then
    raise exception 'het_maandoverzicht_draagt_gezondheidsgegevens_mee';
  end if;

  -- Een nieuwe aanmelding schrijft naar het nieuwe veld.
  perform public.register_tavern_interest('Nieuwe Gast','nieuw-dieet@example.invalid',2,'weekend-01',
    null, now()+interval '1 hour', null, null, null, 'Ana: peanut allergy. Bram: vegetarian.');
  if (select dietary_notes from public.tavern_seat_claims where email='nieuw-dieet@example.invalid')
     <> 'Ana: peanut allergy. Bram: vegetarian.' then
    raise exception 'het_gecombineerde_veld_kwam_niet_in_de_database';
  end if;

  -- En een lege waarde wist nooit wat er al stond.
  perform public.register_tavern_interest('Nieuwe Gast','nieuw-dieet@example.invalid',2,'weekend-01',
    null, now()+interval '1 hour', null, null, null, null);
  if (select dietary_notes from public.tavern_seat_claims where email='nieuw-dieet@example.invalid') is null then
    raise exception 'een_lege_waarde_wiste_het_dieetveld';
  end if;

  -- Te lang wordt geweigerd, niet afgekapt.
  geweigerd:=false;
  begin
    perform public.register_tavern_interest('Lange Tekst','lang-dieet@example.invalid',2,'weekend-01',
      null, now()+interval '1 hour', null, null, null, repeat('p',1001));
  exception when others then
    if sqlerrm='invalid_dietary_notes' then geweigerd:=true; else raise; end if;
  end;
  if not geweigerd then raise exception 'een_te_lang_dieetveld_kwam_erdoor'; end if;
end $$;

-- ── Het oordeel van de accommodatie over extra nachten ─────────────────────
do $$
declare
  weekend_id uuid;
  boeking_id uuid;
  uitkomst jsonb;
  geweigerd boolean;
begin
  select id into weekend_id from public.tavern_weekends where slug='weekend-01';
  insert into public.tavern_seat_claims(name,email,party_size,assigned_weekend_id,status,consented_at)
    values('Oordeel Gast','oordeel-test@example.invalid',2,weekend_id,'paid',now())
    returning id into boeking_id;
  perform public.set_tavern_stay_request(boeking_id, date '2026-10-28', date '2026-11-04');

  -- Een vreemde mag niet beslissen.
  geweigerd:=false;
  begin
    perform public.admin_decide_extra_nights('iemand.anders@example.invalid',boeking_id,'confirmed');
  exception when others then
    if sqlerrm='not_an_administrator' then geweigerd:=true; else raise; end if;
  end;
  if not geweigerd then raise exception 'een_vreemde_kon_extra_nachten_bevestigen'; end if;

  -- Méér bevestigen dan gevraagd kan niet.
  geweigerd:=false;
  begin
    perform public.admin_decide_extra_nights('lewos.co@gmail.com',boeking_id,'confirmed',
      date '2026-10-26', date '2026-11-04');
  exception when others then
    if sqlerrm='stay_more_than_requested' then geweigerd:=true; else raise; end if;
  end;
  if not geweigerd then raise exception 'er_kon_meer_bevestigd_worden_dan_gevraagd'; end if;

  -- Bevestigen zet het verblijf, en pas dán schuift de aankomstdatum op.
  uitkomst:=public.admin_decide_extra_nights('lewos.co@gmail.com',boeking_id,'confirmed');
  if uitkomst->>'status' <> 'ok' then raise exception 'bevestigen_lukte_niet: %', uitkomst; end if;
  if (select arrival_date from public.tavern_seat_claims where id=boeking_id) <> date '2026-10-28' then
    raise exception 'het_bevestigde_verblijf_is_niet_bijgewerkt';
  end if;
  if (select extra_nights_status from public.tavern_seat_claims where id=boeking_id) <> 'confirmed' then
    raise exception 'de_status_staat_niet_op_confirmed';
  end if;

  -- Wijzigt de gast daarna zijn datums, dan vervalt die bevestiging.
  perform public.set_tavern_stay_request(boeking_id, date '2026-10-29', date '2026-11-04');
  if (select extra_nights_status from public.tavern_seat_claims where id=boeking_id) <> 'requested'
     or (select arrival_date from public.tavern_seat_claims where id=boeking_id) is not null then
    raise exception 'een_gewijzigde_aanvraag_hield_de_oude_bevestiging';
  end if;

  -- Elke beslissing is vastgelegd.
  if (select count(*) from public.lewos_admin_actions
       where claim_id=boeking_id and action like 'extra_nights_%') = 0 then
    raise exception 'het_oordeel_is_niet_vastgelegd';
  end if;
end $$;

-- ── Geen dubbele handtekeningen na het toevoegen van parameters ────────────
do $$
declare naam text; aantal integer;
begin
  foreach naam in array array['register_tavern_interest','begin_tavern_checkout',
                              'begin_tavern_first_access_checkout','promote_seat_hold_to_payment']
  loop
    select count(*) into aantal from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname=naam;
    if aantal <> 1 then
      raise exception 'er_staan_% versies_van_%_naast_elkaar', aantal, naam;
    end if;
  end loop;
end $$;

rollback;

-- ── De laatste stoel vrijgeven ───────────────────────────────────────────────
--
-- Robert, 7 september 2026: `admin_release_participant` deed `party_size-1` zonder
-- ondergrens. Bij een boeking van één gast werd dat nul, en `party_size` moet tussen 1 en 12
-- liggen — de vrijgave brak af op de check-constraint en de beheeromgeving meldde
-- "beheeromgeving niet beschikbaar". Draai dit blok alleen in een testomgeving.
begin;
do $$
declare v_week uuid; v_claim uuid; v_deelnemer uuid; uit jsonb; v_status text; v_grootte integer;
begin
  insert into public.lewos_admins(email,display_name,role)
    values('lewos.co@gmail.com','TEST – Robert','admin')
    on conflict (email) do update set role=excluded.role;
  select id into v_week from public.tavern_weekends order by sort_order, slug limit 1;

  insert into public.tavern_seat_claims
    (name,email,party_size,requested_weekend_id,assigned_weekend_id,status,hold_expires_at,consented_at)
    values('TEST – Laatste stoel','laatste@example.invalid',1,v_week,v_week,'payment_pending',
           now()+interval '30 minutes',now())
    returning id into v_claim;
  insert into public.tavern_booking_participants(claim_id,full_name,email,amount_cents,status)
    values(v_claim,'TEST – Enige gast','enige@example.invalid',202500,'awaiting_payment')
    returning id into v_deelnemer;

  uit := public.admin_release_participant('lewos.co@gmail.com', v_deelnemer, 'TEST – laatste stoel');
  if uit->>'status' <> 'released' then
    raise exception 'de laatste stoel kon niet worden vrijgegeven: %', uit;
  end if;

  select status, party_size into v_status, v_grootte
    from public.tavern_seat_claims where id=v_claim;
  if v_grootte < 1 then raise exception 'party_size werd % — dat mag de constraint niet toelaten', v_grootte; end if;
  if v_status <> 'cancelled' then
    raise exception 'de lege boeking bleef staan als %, en houdt dan stoelen bezet', v_status;
  end if;

  raise notice 'OK  de laatste stoel vrijgeven geeft de hele boeking terug aan de voorraad';
end $$;
rollback;
