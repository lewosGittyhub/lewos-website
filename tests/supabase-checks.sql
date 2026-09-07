-- Supabase-eindcontrole. Draai dit ná de vier migraties, in een **ontwikkelomgeving**,
-- nooit tegen productie.
--
-- Waarom dit bestand naast `tests/database-integration.sql` bestaat: dat bestand controleert
-- het gedrag van de functies, en dat is op kale PostgreSQL al bewezen. Wat dáár níét in zit
-- is precies wat op Supabase anders kan zijn — de rechten die Supabase zélf uitdeelt, RLS,
-- en de rolverdeling tussen Robert en Nadine. Op 3 september 2026 beet dat verschil al een
-- keer: lokaal stond de teller op nul, op Supabase hadden `anon` en `authenticated` alle
-- rechten op alle drie de tabellen.
--
-- Alles draait in één transactie en rolt aan het eind terug. Elk testgegeven is verzonnen en
-- gebruikt `.invalid`, een gereserveerd domein dat per definitie niet bestaat. Er wordt geen
-- mail verstuurd, geen betaling gedaan en geen agenda aangeraakt — dit bestand praat alleen
-- met de database.
--
-- Slaagt alles, dan is de laatste regel `SUPABASE-CONTROLE GESLAAGD`. Faalt er iets, dan
-- stopt hij op die regel met een duidelijke melding.

begin;

do $$
declare
  t text; r text; n integer; ontbreekt text;
  v_claim uuid; v_deelnemer uuid; v_betaald uuid; v_week uuid; uit jsonb;
  ROBERT constant text := 'lewos.co@gmail.com';
  NADINE  constant text := 'accommodatie@example.invalid';
  VREEMDE constant text := 'niemand@example.invalid';
begin
  -- ── 1. RLS staat aan op elke tabel met gastgegevens ──────────────────────
  for t in select unnest(array['tavern_weekends','tavern_seat_claims','tavern_request_limits',
                               'lewos_admins','tavern_booking_participants','lewos_admin_actions'])
  loop
    if not exists (select 1 from pg_class c join pg_namespace ns on ns.oid=c.relnamespace
                   where ns.nspname='public' and c.relname=t and c.relrowsecurity) then
      raise exception 'RLS staat UIT op public.%', t;
    end if;
  end loop;
  raise notice 'OK  1. RLS staat aan op alle zes tabellen';

  -- ── 2. anon en authenticated hebben geen rechten op gastgegevens ─────────
  -- Dit is de controle die op Supabase anders kan uitpakken dan lokaal.
  for r in select unnest(array['anon','authenticated']) loop
    for t in select unnest(array['tavern_seat_claims','tavern_booking_participants',
                                 'lewos_admins','lewos_admin_actions']) loop
      if has_table_privilege(r, 'public.'||t, 'select') then
        raise exception 'rol % kan LEZEN uit public.% — Supabase deelt hier rechten uit die weg moeten', r, t;
      end if;
      if has_table_privilege(r, 'public.'||t, 'insert') or has_table_privilege(r, 'public.'||t, 'update')
         or has_table_privilege(r, 'public.'||t, 'delete') then
        raise exception 'rol % kan SCHRIJVEN in public.%', r, t;
      end if;
    end loop;
  end loop;
  raise notice 'OK  2. anon en authenticated kunnen niet bij gastgegevens';

  -- ── 3. De beheerfuncties zijn alleen voor service_role ───────────────────
  for t in select unnest(array['admin_bookings_in_range','admin_booking_detail',
                               'admin_reminder_payload','admin_remind_participant',
                               'admin_extend_participant','admin_release_participant',
                               'admin_decide_extra_nights']) loop
    if not exists (select 1 from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
                   where ns.nspname='public' and p.proname=t) then
      raise exception 'functie public.% bestaat niet — draaide admin.sql of stay-dates.sql wel?', t;
    end if;
    for r in select unnest(array['anon','authenticated']) loop
      if exists (select 1 from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
                 where ns.nspname='public' and p.proname=t
                   and has_function_privilege(r, p.oid, 'execute')) then
        raise exception 'rol % mag public.% uitvoeren', r, t;
      end if;
    end loop;
  end loop;
  raise notice 'OK  3. de beheerfuncties zijn niet aanroepbaar door anon of authenticated';

  -- ── 4. Standaardtermijnen: 60 invullen, 30 betalen ───────────────────────
  select pg_get_function_arguments(p.oid) into t from pg_proc p
    join pg_namespace ns on ns.oid=p.pronamespace
    where ns.nspname='public' and p.proname='begin_seat_hold';
  if t not like '%p_window_minutes integer DEFAULT 60%' then
    raise exception 'begin_seat_hold houdt geen 60 minuten aan: %', t;
  end if;
  select pg_get_function_arguments(p.oid) into t from pg_proc p
    join pg_namespace ns on ns.oid=p.pronamespace
    where ns.nspname='public' and p.proname='promote_seat_hold_to_payment';
  if t not like '%p_payment_window_minutes integer DEFAULT 30%' then
    raise exception 'promote_seat_hold_to_payment houdt geen 30 minuten aan: %', t;
  end if;
  raise notice 'OK  4. standaardtermijnen zijn 60 en 30 minuten';

  -- ── Testgegevens. Allemaal verzonnen, allemaal .invalid, alles rolt terug ─
  insert into public.lewos_admins(email,display_name,role) values
    (ROBERT,'TEST – Robert','admin'),
    (NADINE,'TEST – Nadine','accommodation')
    on conflict (email) do update set role=excluded.role;

  select id into v_week from public.tavern_weekends order by sort_order, slug limit 1;
  if v_week is null then raise exception 'geen weekend gevonden — draaide first-access.sql wel?'; end if;

  insert into public.tavern_seat_claims
    (name,email,party_size,requested_weekend_id,assigned_weekend_id,status,
     hold_expires_at,checkout_session_id,consented_at,dietary_notes)
    values('TEST – Familie Verzonnen','boeking@example.invalid',2,v_week,v_week,'payment_pending',
           now()-interval '3 hours','cs_test_verzonnen',now(),
           'Ana: severe peanut allergy, carries an EpiPen. Bram: vegetarian.')
    returning id into v_claim;

  insert into public.tavern_booking_participants(claim_id,full_name,email,amount_cents,status,checkout_session_url)
    values(v_claim,'TEST – Betaalde gast','betaald@example.invalid',202500,'paid',null)
    returning id into v_betaald;
  insert into public.tavern_booking_participants(claim_id,full_name,email,amount_cents,status,checkout_session_url)
    values(v_claim,'TEST – Wachtende gast','wacht@example.invalid',202500,'awaiting_payment',
           'https://example.invalid/pay/verzonnen')
    returning id into v_deelnemer;

  -- ── 5. Rollen: Nadine ────────────────────────────────────────────────────
  uit := public.admin_reminder_payload(NADINE, v_deelnemer);
  if uit->>'status' <> 'ready' then raise exception 'Nadine kan niet herinneren: %', uit; end if;

  uit := public.admin_extend_participant(NADINE, v_deelnemer, now()+interval '2 hours', 'TEST – verlenging');
  if uit->>'status' <> 'extended' then raise exception 'Nadine kan niet verlengen: %', uit; end if;

  begin
    uit := public.admin_release_participant(NADINE, v_deelnemer, 'TEST – mag niet');
    raise exception 'Nadine KON vrijgeven, en dat mag niet';
  exception when others then
    if sqlerrm <> 'requires_owner' then raise exception 'onverwachte fout bij Nadine-vrijgave: %', sqlerrm; end if;
  end;
  raise notice 'OK  5. Nadine mag herinneren en verlengen, niet vrijgeven';

  -- ── 6. Rollen: een vreemde mag niets ─────────────────────────────────────
  for t in select unnest(array['reminder','extend','release']) loop
    begin
      if t='reminder' then uit := public.admin_reminder_payload(VREEMDE, v_deelnemer);
      elsif t='extend' then uit := public.admin_extend_participant(VREEMDE, v_deelnemer, now()+interval '1 hour','TEST');
      else uit := public.admin_release_participant(VREEMDE, v_deelnemer,'TEST');
      end if;
      raise exception 'een vreemde kon % uitvoeren', t;
    exception when others then
      if sqlerrm <> 'not_an_administrator' then
        raise exception 'onverwachte fout bij vreemde, actie %: %', t, sqlerrm;
      end if;
    end;
  end loop;
  raise notice 'OK  6. een vreemde mag geen enkele beheeractie';

  -- ── 7. Deels betaalde groep blijft vastgehouden ──────────────────────────
  update public.tavern_seat_claims set hold_expires_at=now()-interval '2 hours' where id=v_claim;
  perform private.cleanup_tavern_claims();
  select status into t from public.tavern_seat_claims where id=v_claim;
  if t <> 'payment_pending' then
    raise exception 'de deels betaalde groep verviel automatisch naar %', t;
  end if;
  select count(*) into n from public.tavern_booking_participants where claim_id=v_claim and status='paid';
  if n <> 1 then raise exception 'de betaalde deelnemer is geraakt (% betaald)', n; end if;
  raise notice 'OK  7. een deels betaalde groep verliest niets automatisch';

  -- ── 8. Robert mag wél vrijgeven, en de betaalde plaats blijft ────────────
  uit := public.admin_release_participant(ROBERT, v_deelnemer, 'TEST – vrijgave door Robert');
  select count(*) into n from public.tavern_booking_participants where claim_id=v_claim and status='paid';
  if n <> 1 then raise exception 'de betaalde plaats verdween bij de vrijgave'; end if;
  raise notice 'OK  8. alleen Robert geeft vrij, en de betaalde plaats blijft staan';

  -- ── 9. Het publiek heeft geen enkele weg de database in ──────────────────
  -- De beschikbaarheid die bezoekers zien wordt in de Netlify-functie berekend, niet door
  -- een RPC. Er hoort dus géén functie te zijn die `anon` of `authenticated` mag aanroepen:
  -- alles loopt via `service_role`, achter de functies.
  --
  -- Dit is nadrukkelijk een Supabase-controle. PostgreSQL geeft EXECUTE standaard aan
  -- PUBLIC, en `anon` erft dat. Elke migratie moet dat dus expliciet intrekken; vergeet er
  -- één, dan staat die functie op het open internet. Lokaal valt dat niet op, want daar
  -- bestaat `anon` alleen omdat wij hem zelf aanmaken.
  ontbreekt := '';
  for r in select unnest(array['anon','authenticated']) loop
    -- Alleen onze eigen functies. Functies die bij een extensie horen (pgcrypto zet er
    -- tientallen in `public`) laten we staan: die dragen geen gastgegevens, en ze intrekken
    -- breekt de extensie.
    for t in select p.proname from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
             where ns.nspname='public' and has_function_privilege(r,p.oid,'execute')
               and not exists (select 1 from pg_depend d
                               where d.objid=p.oid and d.deptype='e')
             order by p.proname loop
      ontbreekt := ontbreekt || r || ' → ' || t || '; ';
    end loop;
  end loop;
  if ontbreekt <> '' then
    raise exception 'het publiek kan functies aanroepen: %', ontbreekt;
  end if;
  raise notice 'OK  9. anon en authenticated kunnen geen enkele functie aanroepen';

  -- ── 10. Het maandoverzicht draagt geen dieetgegevens, het detail wel ─────
  uit := public.admin_bookings_in_range(ROBERT, current_date-365, current_date+365);
  if uit::text ~* '(peanut|allerg|vegetarian|epipen)' then
    raise exception 'het maandoverzicht draagt dieetgegevens: %', left(uit::text,300);
  end if;
  uit := public.admin_booking_detail(ROBERT, v_claim);
  if uit->>'dietaryNotes' is null or uit->>'dietaryNotes' = '' then
    raise exception 'het beveiligde detail draagt de dieetgegevens niet meer';
  end if;
  begin
    uit := public.admin_booking_detail(VREEMDE, v_claim);
    raise exception 'een vreemde kon het detail opvragen';
  exception when others then
    if sqlerrm <> 'not_an_administrator' then raise exception 'onverwacht: %', sqlerrm; end if;
  end;
  raise notice 'OK 10. dieetgegevens alleen in het beveiligde detail, nooit in het maandoverzicht';

  raise notice '';
  raise notice 'SUPABASE-CONTROLE GESLAAGD';
end $$;

-- Niets blijft staan. Elk testgegeven hierboven verdwijnt met deze rollback.
rollback;
