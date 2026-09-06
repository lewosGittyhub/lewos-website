# De beheeromgeving

Een afgeschermd overzicht van de boekingen voor Robert en Nadine. **Alleen lezen**: er zit
in deze eerste versie geen enkele knop om te annuleren, terug te betalen of een boeking te
wijzigen, en een test bewaakt dat er geen bijkomt.

`/admin/` · lokaal: `node scripts/local-admin-server.mjs` → http://127.0.0.1:8790/admin/

---

## Wie er binnenkomt, en hoe

Drie sloten achter elkaar. Ze doen alle drie iets anders, en ze staan er alle drie omdat
één ervan een keer verkeerd kan staan.

1. **De handtekening van het token.** `netlify/functions/_admin-auth.mjs` controleert dat
   het token echt van de identiteitsprovider komt — HS256 met `SUPABASE_JWT_SECRET`, of
   asymmetrisch via de JWKS van het project. `alg: none` wordt expliciet geweigerd, net als
   een verlopen token en een adres dat niet bevestigd is.
2. **De lijst in de functie.** Alleen adressen in `LEWOS_ADMIN_EMAILS`. Staat die
   variabele niet, dan gaat de deur op slot en niet open.
3. **De lijst in de database.** Elke leesfunctie in `database/admin.sql` controleert het
   adres nog eens tegen `public.lewos_admins` en gooit anders `not_an_administrator`.

Ingelogd zijn is dus niet genoeg, en dat is met opzet: iedereen met een Google-account kan
bij Supabase Auth een sessie krijgen. Toegang komt van de lijst, niet van de sessie.

**Waarom de browser niet rechtstreeks met de database praat.** Op 3 september 2026 zijn de
rechten van `anon` en `authenticated` op de tavern-tabellen expliciet ingetrokken. Die
beslissing is niet teruggedraaid. De browser praat met de functie, de functie praat met de
database via `service_role`, en die sleutel komt nooit in browsercode.

## Gezondheidsgegevens

*Allergies & dietary requirements* — sinds 5 september 2026 één veld, `dietary_notes`,
met terugval op de twee oude kolommen voor boekingen van daarvoor — komt **alleen** uit
`admin_booking_detail`, bij één opgevraagde
boeking. Het maandoverzicht geeft ze niet mee — niet verborgen in de browser, maar
simpelweg niet in het antwoord. Ze gaan ook nooit naar Google Agenda; `bookingEvent()` in
`netlify/functions/_calendar.mjs` neemt die velden niet eens aan.

## Wat je ziet

- **Maandkalender** met elke boeking over de volledige verblijfsduur, gastnaam en aantal
  personen, in kleur per betaalstatus. Elk label draagt ook tekst; kleur alleen is geen
  informatie.
- **Klikken op een dag** toont wie er die dag is, wie aankomt en wie vertrekt — met het
  aantal personen groot en het aantal boekingen eronder, omdat dat twee verschillende
  dingen zijn.
- **Deze week**: aankomsten, vertrekken en aanwezige gasten.
- **Het detail** van één boeking: naam, contact, kenmerk, aantal personen, weekend,
  aankomst, vertrek, extra nachten, boekingsstatus, betaalstatus, praktische opmerkingen,
  de deelnemers met hun eigen betaalstatus, en het berichtenoverzicht.

### Het berichtenoverzicht is bewust voorzichtig

Drie toestanden, en "verstuurd" is de smalste:

| | |
| --- | --- |
| **sent** | er staat een tijdstempel én een provider-id in de database |
| **prepared** | de flow zou dit bericht versturen, maar het is niet vastgelegd |
| **example** | er is niets klaargezet; dit is alleen het soort bericht dat hier hoort |

Tot deze migratie hadden de melding aan de accommodatie en die aan Lewos géén
verzendregistratie. Die zijn er nu (`accommodation_email_sent_at`,
`special_requirements_email_sent_at`) en de webhook vult ze. Lukt dat vastleggen niet, dan
blijft het bericht op *prepared* staan terwijl het wél verstuurd is — te weinig beweren is
hier de veilige kant.

## Lokaal draaien

```bash
node scripts/local-admin-server.mjs
```

```bash
node scripts/local-admin-server.mjs --reseed
```

De testgegevens staan in `.local-data/admin-bookings.json` (gitignored) en overleven een
herstart. `--reseed` zet ze terug.

**Wat lokaal echt is:** de autorisatie. Dezelfde functie, dezelfde drie sloten.
**Wat nagebootst is:** de identiteitsprovider en de database. In productie tekent Supabase
Auth het token na een magische link; lokaal tekent het script het met een geheim in
`.local-data/`, zodat er geen mail de deur uit hoeft. De database is een JSON-bestand
waarvan de twee leesfuncties `database/admin.sql` regel voor regel volgen.

Het inlogscherm biedt lokaal drie identiteiten, waaronder één die **niet** op de lijst
staat. Die hoort een 403 te krijgen; dat is er om te kunnen zien dat de weigering van de
autorisatie komt en niet van een ontbrekend token.

## Voor productie

- [ ] Supabase Auth aanzetten en beide adressen uitnodigen. Zet registratie dicht
      (`create_user:false` staat al in de aanvraag) zodat niemand zichzelf kan aanmelden.
- [ ] `LEWOS_ADMIN_EMAILS=lewos.co@gmail.com,accommodatie@example.invalid` in Netlify.
- [ ] `SUPABASE_ANON_KEY` in Netlify — dat is de publiceerbare sleutel, niet de service-key.
- [ ] `SUPABASE_JWT_SECRET` in Netlify, óf niets zetten als het project asymmetrisch tekent;
      dan wordt de JWKS gebruikt.
- [ ] `database/admin.sql` nalopen op een testdatabase en daarna draaien.
- [ ] Controleren dat `/admin/` niet in `sitemap.xml` staat en dat `robots.txt` hem weert.
      Dat is geen beveiliging, maar het scheelt ruis.
- [ ] De privacyverklaring: er komt een interne beheerweergave bij waarin gastgegevens
      worden ingezien. Dat hoort in dezelfde ronde als
      `operations/privacy-concept-accommodatie.md`, niet erna.
