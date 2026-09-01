-- Persoonlijke toestemming voor de gefilmde editie. Draai dit ná `first-access.sql`:
-- het hangt aan `tavern_seat_claims` en `tavern_weekends`.
--
-- Niets hier opent een betaalroute. De betaalpoort staat in `_booking-config.mjs` en
-- wordt door dit bestand niet aangeraakt.
--
-- Tijd onder een slot: net als in `first-access.sql` gaat elke vergelijking met een
-- vervaltijd over `clock_timestamp()`, en leggen tijdstempels die alleen vastleggen
-- wanneer iets gebeurde `now()` vast.
--
-- Zoekpad: elke functie hieronder draait met `set search_path=''`, en élke verwijzing naar
-- een tabel, functie of `%rowtype` staat er voluit met zijn schema bij. Met
-- `search_path=public` bepaalt de aanroeper wat `public` betekent: wie een eigen schema
-- vóór `public` zet, krijgt zijn eigen tabel of functie uitgevoerd met de rechten van de
-- eigenaar van deze `security definer`-functies. Leeg is de enige veilige waarde.
-- `tests/media-database.test.mjs` bewaakt dat voor elke functie die er later bij komt.
create extension if not exists pgcrypto;
-- Het schema staat ook in `first-access.sql`; deze twee regels staan hier zodat dit bestand
-- niet stilletjes faalt als iemand het als eerste draait. Allebei idempotent.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Elke versie van de overeenkomst staat hier met de hash van de exacte tekst erbij.
-- Zonder die hash kun je later niet bewijzen wélke woorden iemand geaccepteerd heeft,
-- en dat is precies wat een toezichthouder vraagt.
create table if not exists public.tavern_media_agreements (
  version text primary key,
  document_reference text not null,
  content_hash text not null check (char_length(content_hash)=64),
  language text not null default 'en',
  legal_review_reference text not null,
  supersedes text references public.tavern_media_agreements(version),
  effective_from timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Eén rij per volwassen deelnemer. Alleen naam en e-mailadres: meer is niet nodig om
-- iemand zijn eigen link te sturen en zijn keuze aan hem terug te kunnen tonen. Geen
-- geboortedatum; of iemand volwassen is wordt verklaard, niet uitgerekend.
create table if not exists public.tavern_media_participants (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.tavern_seat_claims(id) on delete cascade,
  weekend_id uuid not null references public.tavern_weekends(id),
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  email text not null,
  adult_declared boolean not null default false,
  invitation_token_hash text check (invitation_token_hash is null or char_length(invitation_token_hash)=64),
  invitation_expires_at timestamptz,
  invitation_sent_at timestamptz,
  invitation_email_provider_id text,
  status text not null default 'pending' check (status in ('pending','invited','granted','declined','withdrawn','expired')),
  created_at timestamptz not null default now()
);

-- Eén rij per beslissing, per versie. Nooit overschrijven: een ingetrokken toestemming
-- blijft staan met een `withdrawn_at`, zodat later te zien is wat er wanneer gold.
create table if not exists public.tavern_media_consents (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.tavern_media_participants(id) on delete cascade,
  agreement_version text not null references public.tavern_media_agreements(version),
  agreement_content_hash text not null check (char_length(agreement_content_hash)=64),
  -- De kern-toestemming: beeld, stem en bijbehorende audio. Expliciet ja of nee,
  -- nooit leeg: een leeg vakje telt als nee en wordt hier als `false` vastgelegd.
  standard_use_consent boolean not null,
  -- Betaalde advertenties staan er bewust apart en nullable naast. `null` betekent
  -- "niet beantwoord", `false` betekent "gevraagd en geweigerd". Allebei geven geen
  -- toestemming: publicatie mag alleen bij `paid_advertising_consent is true`. Deze
  -- waarde mag nooit uit `standard_use_consent` worden afgeleid.
  paid_advertising_consent boolean,
  confirmation_method text not null default 'secure_link',
  -- `gen_random_uuid()` zit sinds PostgreSQL 13 in de kern. De vorige vorm gebruikte
  -- `gen_random_bytes()` uit pgcrypto, en die extensie staat op Supabase in het schema
  -- `extensions` — niet te vinden vanuit een functie met een lege `search_path`.
  audit_reference text unique not null default replace(gen_random_uuid()::text,'-',''),
  recorded_at timestamptz not null default now(),
  withdrawn_at timestamptz
);

-- Een tokenhash hoort bij precies één deelnemer. Het unieke index maakt dat een regel in
-- plaats van een belofte.
create unique index if not exists tavern_media_participants_token_idx on public.tavern_media_participants (invitation_token_hash) where invitation_token_hash is not null;
create index if not exists tavern_media_participants_claim_idx on public.tavern_media_participants (claim_id);
create index if not exists tavern_media_participants_expiry_idx on public.tavern_media_participants (invitation_expires_at) where invitation_token_hash is not null;
-- Eén levende toestemming per deelnemer per versie. Een tweede inzending botst hierop in
-- plaats van er een dubbele rij naast te zetten.
create unique index if not exists tavern_media_consents_live_idx on public.tavern_media_consents (participant_id, agreement_version) where withdrawn_at is null;
create index if not exists tavern_media_consents_participant_idx on public.tavern_media_consents (participant_id);

-- Geen enkele rol komt hier rechtstreeks bij. Alles loopt via de functies hieronder, en
-- die draaien als `security definer` met alleen `service_role` als aanroeper.
alter table public.tavern_media_agreements enable row level security;
alter table public.tavern_media_participants enable row level security;
alter table public.tavern_media_consents enable row level security;
revoke all on table public.tavern_media_agreements from public, anon, authenticated;
revoke all on table public.tavern_media_participants from public, anon, authenticated;
revoke all on table public.tavern_media_consents from public, anon, authenticated;

-- Alleen Weekend 01 kent een verplichte persoonlijke overeenkomst. Weekend 02 wordt niet
-- professioneel gefilmd; die gasten mogen hier nooit in terechtkomen. Dit staat als regel
-- in de database en niet alleen in de front-end, want een formulier is te omzeilen.
create or replace function public.tavern_media_agreement_required(p_weekend_slug text)
returns boolean language sql immutable set search_path='' as $$ select p_weekend_slug='weekend-01'; $$;
revoke all on function public.tavern_media_agreement_required(text) from public, anon, authenticated;
grant execute on function public.tavern_media_agreement_required(text) to service_role;

-- De hoofdboeker geeft de deelnemers door. Namen en e-mailadressen, meer niet.
create or replace function public.register_tavern_media_participants(p_claim_id uuid,p_participants jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare claim public.tavern_seat_claims%rowtype; weekend public.tavern_weekends%rowtype; entry jsonb; naam text; adres text; toegevoegd integer:=0; nog_te_plaatsen integer; al_geplaatst integer;
begin
  select * into claim from public.tavern_seat_claims where id=p_claim_id for update;
  if not found then return jsonb_build_object('status','unknown_claim'); end if;
  select * into weekend from public.tavern_weekends where id=claim.assigned_weekend_id;
  if not found then return jsonb_build_object('status','unknown_weekend'); end if;
  if not public.tavern_media_agreement_required(weekend.slug) then
    return jsonb_build_object('status','not_required','weekend',weekend.slug);
  end if;
  if jsonb_typeof(p_participants)<>'array' then raise exception 'invalid_participants'; end if;

  -- Eerst elke inzending nakijken, en pas daarna tellen. Een onbruikbare naam of een
  -- onbruikbaar adres is een fout in de aanroep; die hoort als zodanig terug te komen en
  -- niet als een verhaal over te veel deelnemers.
  for entry in select * from jsonb_array_elements(p_participants) loop
    naam:=trim(coalesce(entry->>'fullName',''));
    adres:=lower(trim(coalesce(entry->>'email','')));
    if char_length(naam)<2 or char_length(naam)>120 then raise exception 'invalid_participant_name'; end if;
    if adres !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'invalid_participant_email'; end if;
  end loop;

  -- Tellen gebeurt ná het ontdubbelen. Twee keer hetzelfde e-mailadres is één gast en mag
  -- geen tweede stoel kosten. Dit ging eerder mis: er werd op `jsonb_array_length` geteld,
  -- dus twee gasten met één dubbele regel werden geweigerd als 'too_many_participants'.
  -- Wat er al geregistreerd staat telt mee. Zonder dat zou een tweede aanroep met andere
  -- adressen het weekend alsnog kunnen overvullen: zes plus zes op zes stoelen.
  select count(*) into al_geplaatst from public.tavern_media_participants where claim_id=claim.id;
  select count(*) into nog_te_plaatsen from (
    select distinct lower(trim(item->>'email')) as email from jsonb_array_elements(p_participants) as item
  ) uniek
  where not exists(select 1 from public.tavern_media_participants bestaande
                   where bestaande.claim_id=claim.id and bestaande.email=uniek.email);
  if al_geplaatst+nog_te_plaatsen>claim.party_size then
    return jsonb_build_object('status','too_many_participants','expected',claim.party_size,'unique',al_geplaatst+nog_te_plaatsen);
  end if;

  for entry in select * from jsonb_array_elements(p_participants) loop
    naam:=trim(coalesce(entry->>'fullName',''));
    adres:=lower(trim(coalesce(entry->>'email','')));
    -- Twee keer dezelfde deelnemer doorgeven maakt geen tweede rij en geen tweede link.
    -- De eerste is hierboven al ingevoegd, dus de tweede vindt zichzelf terug en slaat over.
    if exists(select 1 from public.tavern_media_participants where claim_id=claim.id and email=adres) then continue; end if;
    insert into public.tavern_media_participants(claim_id,weekend_id,full_name,email,adult_declared)
      values(claim.id,weekend.id,naam,adres,coalesce((entry->>'adultDeclared')::boolean,false));
    toegevoegd:=toegevoegd+1;
  end loop;
  return jsonb_build_object('status','registered','claimId',claim.id,'added',toegevoegd,'expected',claim.party_size);
end; $$;
revoke all on function public.register_tavern_media_participants(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.register_tavern_media_participants(uuid,jsonb) to service_role;

-- De ruwe token verlaat de aanroepende functie nooit richting database: hier komt alleen
-- de sha256-hash binnen, net als bij de First Access-uitnodigingen.
create or replace function public.issue_tavern_media_invitation(p_participant_id uuid,p_token_hash text,p_window_days integer default 21)
returns jsonb language plpgsql security definer set search_path='' as $$
declare deelnemer public.tavern_media_participants%rowtype; weekend public.tavern_weekends%rowtype; vervalt timestamptz;
begin
  if p_token_hash is null or char_length(p_token_hash)<>64 then raise exception 'invalid_token_hash'; end if;
  select * into deelnemer from public.tavern_media_participants where id=p_participant_id for update;
  if not found then return jsonb_build_object('status','unknown_participant'); end if;
  if deelnemer.status='withdrawn' then return jsonb_build_object('status','participant_withdrawn'); end if;
  select * into weekend from public.tavern_weekends where id=deelnemer.weekend_id;
  if not public.tavern_media_agreement_required(weekend.slug) then return jsonb_build_object('status','not_required'); end if;
  if deelnemer.invitation_token_hash is not null and deelnemer.invitation_expires_at>clock_timestamp() then
    return jsonb_build_object('status','already_invited','participantId',deelnemer.id);
  end if;
  vervalt:=clock_timestamp()+make_interval(days=>greatest(1,least(p_window_days,60)));
  update public.tavern_media_participants
    set invitation_token_hash=p_token_hash,invitation_expires_at=vervalt,invitation_sent_at=null,invitation_email_provider_id=null,
        status=case when status in('granted','declined') then status else 'invited' end
    where id=deelnemer.id;
  return jsonb_build_object('status','invited','participantId',deelnemer.id,'fullName',deelnemer.full_name,'email',deelnemer.email,'expiresAt',vervalt,'weekend',weekend.slug,'weekendLabel',weekend.label||' · '||weekend.date_label);
end; $$;
revoke all on function public.issue_tavern_media_invitation(uuid,text,integer) from public, anon, authenticated;
grant execute on function public.issue_tavern_media_invitation(uuid,text,integer) to service_role;

create or replace function public.mark_tavern_media_invitation_sent(p_participant_id uuid,p_provider_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare gemarkeerd uuid;
begin
  update public.tavern_media_participants
    set invitation_sent_at=coalesce(invitation_sent_at,now()),invitation_email_provider_id=coalesce(invitation_email_provider_id,nullif(trim(p_provider_id),''))
    where id=p_participant_id and invitation_token_hash is not null and invitation_expires_at>clock_timestamp()
    returning id into gemarkeerd;
  if gemarkeerd is null then return jsonb_build_object('status','not_marked'); end if;
  return jsonb_build_object('status','marked','participantId',gemarkeerd);
end; $$;
revoke all on function public.mark_tavern_media_invitation_sent(uuid,text) from public, anon, authenticated;
grant execute on function public.mark_tavern_media_invitation_sent(uuid,text) to service_role;

-- Een link intrekken. Gebeurt bij een mislukte verzending, en als iemand zijn link kwijt is.
create or replace function public.revoke_tavern_media_invitation(p_participant_id uuid,p_token_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare ingetrokken uuid;
begin
  update public.tavern_media_participants
    set invitation_token_hash=null,invitation_expires_at=null,invitation_sent_at=null,invitation_email_provider_id=null,
        status=case when status='invited' then 'pending' else status end
    where id=p_participant_id and invitation_token_hash=p_token_hash
    returning id into ingetrokken;
  if ingetrokken is null then return jsonb_build_object('status','not_revoked'); end if;
  return jsonb_build_object('status','revoked','participantId',ingetrokken);
end; $$;
revoke all on function public.revoke_tavern_media_invitation(uuid,text) from public, anon, authenticated;
grant execute on function public.revoke_tavern_media_invitation(uuid,text) to service_role;

-- Intrekken door de operator. De variant hierboven eist de tokenhash en is bedoeld voor het
-- script, dat hem net zelf heeft aangemaakt: dat is een veiligheidscontrole tegen het
-- intrekken van de verkeerde link. Een operator die een kwijtgeraakte link intrekt heeft die
-- hash niet, en hoeft hem ook niet te hebben — hij werkt met service_role en met een
-- deelnemer-id dat hij uit zijn eigen lijst haalt.
--
-- De toestemming zelf blijft staan. Een link intrekken is niet hetzelfde als een keuze
-- intrekken; daar is `withdraw_tavern_media_consent` voor.
create or replace function public.revoke_tavern_media_participant_link(p_participant_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare deelnemer public.tavern_media_participants%rowtype;
begin
  select * into deelnemer from public.tavern_media_participants where id=p_participant_id for update;
  if not found then return jsonb_build_object('status','unknown_participant'); end if;
  if deelnemer.invitation_token_hash is null then
    return jsonb_build_object('status','no_active_link','participantId',deelnemer.id);
  end if;
  update public.tavern_media_participants
    set invitation_token_hash=null,invitation_expires_at=null,invitation_sent_at=null,invitation_email_provider_id=null,
        status=case when status='invited' then 'pending' else status end
    where id=deelnemer.id;
  return jsonb_build_object('status','revoked','participantId',deelnemer.id,'fullName',deelnemer.full_name);
end; $$;
revoke all on function public.revoke_tavern_media_participant_link(uuid) from public, anon, authenticated;
grant execute on function public.revoke_tavern_media_participant_link(uuid) to service_role;

-- Wat één link mag openen: precies één deelnemer, en alleen zijn eigen gegevens. Er komt
-- geen naam, geen e-mailadres en geen keuze van een andere gast uit deze functie.
create or replace function public.get_tavern_media_agreement_state(p_token_hash text,p_agreement_version text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare deelnemer public.tavern_media_participants%rowtype; weekend public.tavern_weekends%rowtype; huidige public.tavern_media_consents%rowtype;
begin
  if p_token_hash is null or char_length(p_token_hash)<>64 then return jsonb_build_object('status','invalid_link'); end if;
  select * into deelnemer from public.tavern_media_participants where invitation_token_hash=p_token_hash;
  if not found then return jsonb_build_object('status','invalid_link'); end if;
  if deelnemer.invitation_expires_at is null or deelnemer.invitation_expires_at<=clock_timestamp() then
    return jsonb_build_object('status','link_expired');
  end if;
  select * into weekend from public.tavern_weekends where id=deelnemer.weekend_id;
  if not public.tavern_media_agreement_required(weekend.slug) then return jsonb_build_object('status','not_required'); end if;
  -- Alleen een toestemming voor déze versie telt. Een oudere versie is inhoudelijk een
  -- andere tekst, en daar kan niemand ongevraagd aan gebonden worden.
  select * into huidige from public.tavern_media_consents
    where participant_id=deelnemer.id and agreement_version=p_agreement_version and withdrawn_at is null;
  return jsonb_build_object(
    'status','ready',
    'participantId',deelnemer.id,
    'fullName',deelnemer.full_name,
    'weekend',weekend.slug,
    'weekendLabel',weekend.label||' · '||weekend.date_label,
    'agreementVersion',p_agreement_version,
    'alreadyRecorded',huidige.id is not null,
    'standardUseConsent',huidige.standard_use_consent,
    'paidAdvertisingConsent',huidige.paid_advertising_consent,
    'auditReference',huidige.audit_reference,
    'recordedAt',huidige.recorded_at
  );
end; $$;
revoke all on function public.get_tavern_media_agreement_state(text,text) from public, anon, authenticated;
grant execute on function public.get_tavern_media_agreement_state(text,text) to service_role;

-- De inzending zelf. Idempotent: een tweede keer versturen levert dezelfde audit-referentie
-- op in plaats van een tweede rij of een stilzwijgende overschrijving.
create or replace function public.record_tavern_media_consent(p_token_hash text,p_agreement_version text,p_agreement_hash text,p_standard_use boolean,p_paid_advertising boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare deelnemer public.tavern_media_participants%rowtype; weekend public.tavern_weekends%rowtype; overeenkomst public.tavern_media_agreements%rowtype; bestaande public.tavern_media_consents%rowtype; nieuwe public.tavern_media_consents%rowtype;
begin
  if p_token_hash is null or char_length(p_token_hash)<>64 then return jsonb_build_object('status','invalid_link'); end if;
  -- Een lege keuze is geen keuze. De aanroeper moet expliciet ja of nee doorgeven.
  if p_standard_use is null then raise exception 'consent_choice_required'; end if;
  select * into overeenkomst from public.tavern_media_agreements where version=p_agreement_version;
  if not found then return jsonb_build_object('status','unknown_agreement_version'); end if;
  -- De tekst die de gast te zien kreeg moet de tekst zijn die is goedgekeurd.
  if overeenkomst.content_hash<>p_agreement_hash then return jsonb_build_object('status','agreement_text_mismatch'); end if;
  select * into deelnemer from public.tavern_media_participants where invitation_token_hash=p_token_hash for update;
  if not found then return jsonb_build_object('status','invalid_link'); end if;
  if deelnemer.invitation_expires_at is null or deelnemer.invitation_expires_at<=clock_timestamp() then
    return jsonb_build_object('status','link_expired');
  end if;
  if not deelnemer.adult_declared then return jsonb_build_object('status','adult_declaration_required'); end if;
  select * into weekend from public.tavern_weekends where id=deelnemer.weekend_id;
  if not public.tavern_media_agreement_required(weekend.slug) then return jsonb_build_object('status','not_required'); end if;
  select * into bestaande from public.tavern_media_consents
    where participant_id=deelnemer.id and agreement_version=p_agreement_version and withdrawn_at is null;
  if found then
    return jsonb_build_object('status','already_recorded','participantId',deelnemer.id,'auditReference',bestaande.audit_reference,'recordedAt',bestaande.recorded_at,'standardUseConsent',bestaande.standard_use_consent,'paidAdvertisingConsent',bestaande.paid_advertising_consent);
  end if;
  insert into public.tavern_media_consents(participant_id,agreement_version,agreement_content_hash,standard_use_consent,paid_advertising_consent)
    values(deelnemer.id,p_agreement_version,overeenkomst.content_hash,p_standard_use,p_paid_advertising)
    returning * into nieuwe;
  update public.tavern_media_participants set status=case when p_standard_use then 'granted' else 'declined' end where id=deelnemer.id;
  return jsonb_build_object('status','recorded','participantId',deelnemer.id,'auditReference',nieuwe.audit_reference,'recordedAt',nieuwe.recorded_at,'standardUseConsent',nieuwe.standard_use_consent,'paidAdvertisingConsent',nieuwe.paid_advertising_consent);
end; $$;
revoke all on function public.record_tavern_media_consent(text,text,text,boolean,boolean) from public, anon, authenticated;
grant execute on function public.record_tavern_media_consent(text,text,text,boolean,boolean) to service_role;

-- Intrekken. De oude rij blijft staan met een tijdstempel; er wordt niets weggegooid,
-- want juist het bewijs dát er ooit toestemming was moet controleerbaar blijven.
create or replace function public.withdraw_tavern_media_consent(p_token_hash text,p_agreement_version text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare deelnemer public.tavern_media_participants%rowtype; ingetrokken public.tavern_media_consents%rowtype;
begin
  if p_token_hash is null or char_length(p_token_hash)<>64 then return jsonb_build_object('status','invalid_link'); end if;
  select * into deelnemer from public.tavern_media_participants where invitation_token_hash=p_token_hash for update;
  if not found then return jsonb_build_object('status','invalid_link'); end if;
  update public.tavern_media_consents set withdrawn_at=now()
    where participant_id=deelnemer.id and agreement_version=p_agreement_version and withdrawn_at is null
    returning * into ingetrokken;
  if not found then return jsonb_build_object('status','nothing_to_withdraw'); end if;
  update public.tavern_media_participants set status='withdrawn' where id=deelnemer.id;
  return jsonb_build_object('status','withdrawn','participantId',deelnemer.id,'auditReference',ingetrokken.audit_reference,'withdrawnAt',ingetrokken.withdrawn_at);
end; $$;
revoke all on function public.withdraw_tavern_media_consent(text,text) from public, anon, authenticated;
grant execute on function public.withdraw_tavern_media_consent(text,text) to service_role;

-- De voortgang, voor de operator. Twee getallen: hoeveel deelnemers er geregistreerd staan
-- en hoeveel daarvan een levende toestemming voor déze versie hebben. Geen namen, geen
-- adressen, geen keuzes — ook de operator heeft die hier niet nodig, en wat een functie niet
-- teruggeeft kan ook niet per ongeluk ergens terechtkomen.
--
-- Er hoort geen token bij. In de operator-flow is er niemand aan wie een voortgangslink
-- gegeven wordt: alleen `service_role` mag deze functie aanroepen, en die sleutel zit in de
-- Netlify-omgeving en in het operatorscript.
drop function if exists public.get_tavern_media_progress(text,text);
create or replace function public.get_tavern_media_progress(p_claim_id uuid,p_agreement_version text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare claim public.tavern_seat_claims%rowtype; weekend public.tavern_weekends%rowtype; totaal integer; afgerond integer;
begin
  select * into claim from public.tavern_seat_claims where id=p_claim_id;
  if not found then return jsonb_build_object('status','unknown_claim'); end if;
  select * into weekend from public.tavern_weekends where id=claim.assigned_weekend_id;
  if not public.tavern_media_agreement_required(weekend.slug) then return jsonb_build_object('status','not_required','weekend',weekend.slug); end if;
  select count(*) into totaal from public.tavern_media_participants where claim_id=claim.id;
  -- Alleen een levende toestemming voor déze versie telt mee. Een nieuwe versie zet de
  -- teller dus terug, en dat is de bedoeling: die tekst heeft nog niemand gezien.
  select count(*) into afgerond from public.tavern_media_participants deelnemer
    where deelnemer.claim_id=claim.id
      and exists(select 1 from public.tavern_media_consents toestemming
                 where toestemming.participant_id=deelnemer.id
                   and toestemming.agreement_version=p_agreement_version
                   and toestemming.withdrawn_at is null);
  return jsonb_build_object('status','ready','expected',claim.party_size,'total',totaal,'completed',afgerond,'agreementVersion',p_agreement_version);
end; $$;
revoke all on function public.get_tavern_media_progress(uuid,text) from public, anon, authenticated;
grant execute on function public.get_tavern_media_progress(uuid,text) to service_role;

-- Verlopen links vervallen. De toestemming zelf blijft staan: die is het bewijs.
create or replace function private.cleanup_tavern_media_invitations()
returns void language plpgsql security definer set search_path='' as $$
begin
  update public.tavern_media_participants
    set invitation_token_hash=null,invitation_expires_at=null,
        status=case when status='invited' then 'expired' else status end
    where invitation_token_hash is not null and invitation_expires_at<=clock_timestamp();
end; $$;
revoke all on function private.cleanup_tavern_media_invitations() from public, anon, authenticated;

-- Verwijderen na de bewaartermijn. De termijn staat er bewust niet in: die is nog niet
-- bevestigd en mag niet verzonnen worden. Wie deze functie aanroept geeft hem mee, en dat
-- is een bewuste handeling die in het draaiboek hoort te staan.
create or replace function private.purge_tavern_media_records(p_retention interval)
returns jsonb language plpgsql security definer set search_path='' as $$
declare verwijderd integer;
begin
  if p_retention is null or p_retention<interval '1 day' then raise exception 'retention_period_required'; end if;
  delete from public.tavern_media_participants as deelnemer
    where deelnemer.created_at<clock_timestamp()-p_retention
      and not exists(select 1 from public.tavern_media_consents where participant_id=deelnemer.id and withdrawn_at is null);
  get diagnostics verwijderd=row_count;
  return jsonb_build_object('status','purged','participants',verwijderd);
end; $$;
revoke all on function private.purge_tavern_media_records(interval) from public, anon, authenticated;
