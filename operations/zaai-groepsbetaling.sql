-- Testdata voor de scenario's uit operations/testplan-groepsbetaling.md
--
-- ALLEEN op de preview-branch `rece-migratie-test`. Nooit op productie.
--
-- Toegevoegd op 10 september 2026. Het testplan beschreef elf scenario's die allemaal
-- aannemen dat er een groepsboeking in de database staat, en er stond geen enkele stap die
-- die boeking maakt. Gevolg: elf keer `not_found` en `unknown_payment`, en niets bewezen.
-- Dit bestand dicht dat gat.
--
-- Alles wat hier wordt aangemaakt begint met "TEST - " en gebruikt @example.invalid, een
-- domein dat per definitie niet bestaat. De betaalkenmerken zijn met opzet herkenbaar en
-- vast, zodat de scenario's ze letterlijk kunnen gebruiken in plaats van ze eerst op te
-- moeten zoeken.
--
--   Anna      tav_aaaa...a1
--   Bram      tav_bbbb...b2
--   Chloe     tav_cccc...c3
--   Diederik  tav_dddd...d4
--
-- Onderaan staat het opruimblok. Draai dat na de scenario's, want deze data hoort niet
-- blijvend in een database te staan -- ook niet in een preview.

-- ── Zaaien ────────────────────────────────────────────────────────────────────

with w as (
  -- Het eerste gefilmde weekend, want de scenario's rond de filmerkenning hangen daaraan.
  -- Bestaat weekend-01 niet, dan het eerste weekend dat er is.
  select id, coalesce(price_cents, 202500) as prijs
    from public.tavern_weekends
   order by (slug = 'weekend-01') desc, starts_on
   limit 1),

c as (
  insert into public.tavern_seat_claims
    (name, email, party_size, assigned_weekend_id, status, consented_at,
     hold_phase, hold_expires_at, dietary_notes)
  -- consented_at is not null en heeft géén default. Vergeet die niet.
  select 'TEST - Anna', 'anna@example.invalid', 4, w.id, 'payment_pending', now(),
         'payment', now() + interval '30 minutes', 'TEST - noten bij Chloe'
    from w
  returning id),

d as (
  insert into public.tavern_booking_participants
    (claim_id, full_name, email, amount_cents, status, payment_reference)
  select c.id, v.naam, v.adres, (select prijs from w), 'awaiting_payment', v.ref
    from c, (values
    ('TEST - Anna','anna@example.invalid','tav_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1'),
    ('TEST - Bram','bram@example.invalid','tav_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb2'),
    ('TEST - Chloe','chloe@example.invalid','tav_ccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc3'),
    ('TEST - Diederik','diederik@example.invalid','tav_ddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd4')
  ) v(naam, adres, ref)
  returning claim_id, full_name, payment_reference)

select claim_id as "claim-id", full_name as gast, payment_reference as kenmerk
  from d
 order by full_name;

-- ── Wat er nu staat ───────────────────────────────────────────────────────────
-- Draai dit los om de stand te zien, ook later in de sessie.

select c.id as "claim-id", c.status as boeking, c.hold_phase as fase,
       c.hold_expires_at as "betalen tot", w.slug as weekend,
       count(p.id) as deelnemers,
       count(p.id) filter (where p.status = 'paid') as betaald
  from public.tavern_seat_claims c
  left join public.tavern_weekends w on w.id = c.assigned_weekend_id
  left join public.tavern_booking_participants p on p.claim_id = c.id
 where c.email like '%@example.invalid'
 group by c.id, c.status, c.hold_phase, c.hold_expires_at, w.slug
 order by c.id;

-- ── Opruimen ──────────────────────────────────────────────────────────────────
-- Draai dit ná de scenario's. De deelnemers verdwijnen mee door de cascade op claim_id,
-- maar ze staan er expliciet bij: een cascade is een aanname en dit is een controle.

-- delete from public.tavern_booking_participants
--  where claim_id in (select id from public.tavern_seat_claims
--                      where email like '%@example.invalid');
-- delete from public.tavern_seat_claims where email like '%@example.invalid';
--
-- select count(*) as "resterende testclaims" from public.tavern_seat_claims
--  where email like '%@example.invalid';
