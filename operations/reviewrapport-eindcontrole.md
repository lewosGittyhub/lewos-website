# Reviewrapport — eindcontrole `mailroutering-fontecha`

6 september 2026, commit `119ca44`. **Niets gepusht, niets gedeployd, geen productiegegevens
aangeraakt.** Elf commits, 77 bestanden, 11.647 regels erbij tegenover `origin/main`.

---

## 1. Lokaal afgerond

**De echte fout is weg.** *Herinnering sturen* gaf `503 admin_unavailable` wanneer de boeking
geen betaaltermijn had. Dat is nu een eigen uitkomst op drie niveaus, die met elkaar
overeenkomen:

| Laag | Wat er verandert |
| --- | --- |
| `database/admin.sql` | `admin_remind_participant` kijkt naar `hold_expires_at` en geeft `no_deadline` terug. Die controle staat **vóór** het vastleggen, dus er komt geen herinnering in het logboek die nooit verstuurd is |
| `netlify/functions/admin-actions.mjs` | vertaalt dat naar **409** met één vaste tekst, en vangt dezelfde fout ook op als hij wordt opgegooid in plaats van teruggegeven |
| `scripts/local-admin-server.mjs` | geeft dezelfde uitkomst, vóór het opbouwen van de mail |

De melding luidt:

> *"This guest has no payment deadline yet, so there is nothing to remind them about. Send the
> payment request first, or use Extend to set a deadline."*

**Er wordt geen termijn verzonnen** en er is geen enkele mail verstuurd — alles ging naar de
lokale postbus. Vier tests bewaken het, waaronder één die controleert dat de SQL-functie zelf
geen `hold_expires_at` zet.

Verder afgerond: het merkteken- en herkenningsmodel voor de agenda, de gedeelde
kalendercomponent, het samengevoegde dieetveld, de beheeromgeving, de mailroutering, en de
twee integratiescripts die eerder niet konden slagen.

## 2. Echt getest

Alles hieronder is vandaag uitgevoerd, niet overgenomen uit een eerdere sessie.

| Wat | Uitkomst |
| --- | --- |
| **428 JS-tests** | alle 428 geslaagd |
| **Vijf migraties op echte PostgreSQL 16.4**, verse database | alle vijf schoon |
| **Dezelfde vijf nog een keer** | schoon — idempotent |
| **`tests/database-integration.sql`** | alle controles geslaagd |
| **Gelijktijdige stoelclaims** — twaalf verbindingen, elk twee stoelen, op een weekend van zes | **3 toegekend, 9 geweigerd, 0 fouten.** Precies zes stoelen vast, geen oververkoop, geen slotconflict |
| **`no_deadline` tegen echte SQL** | geeft `no_deadline` en legt géén herinnering vast |
| **`scripts/integration-booking.mjs`** over HTTP | alle controles geslaagd |
| **`scripts/integration-auth.mjs`** over HTTP | alle controles geslaagd, op verse én gevulde database |
| **Echte Google-agenda, alleen-lezen** | naam *Lewos – Tavern & huis*, tijdzone **Europe/Madrid**, rol `writer`, groepsagenda bevestigd |

De gelijktijdigheidstest bevestigt wat de code belooft: `begin_seat_hold` neemt
`pg_advisory_xact_lock` vóór het tellen, en dat houdt onder echte parallelle druk.

**De agenda is alleen gelezen.** De TEST-afspraak van 5 januari 2027 staat er nog, ongewijzigd;
er is vandaag niets aangemaakt, gewijzigd of verwijderd.

### De gevraagde controles, punt voor punt

- **`first-access.sql` intact** — 666 regels, `dietary_notes` 33 keer. Het op 5 september
  herstelde werk staat er nog.
- **Privacy-patch** — `privacy/`, `legal/` en `terms/` zijn tegenover `main` **onveranderd**.
  Het voorstel staat als concept in `operations/privacy-concept-accommodatie.md`. Dat is de
  afspraak, geen verlies. **Het blijft openstaan.**
- **Boekingen gaan naar de aparte groepsagenda** — het id komt op één plek binnen
  (`LEWOS_CALENDAR_ID`), zonder terugvalwaarde, en er staat geen vast agenda-id in de repo.
- **Casa Cepa kan in de primaire agenda blijven** — de code kent geen `primary`, roept nooit
  `calendarList` aan, en vraagt alleen de scope `calendar.events`. Daarmee kan het
  serviceaccount uitsluitend bij agenda's die expliciet met hem gedeeld zijn. Zolang je
  primaire agenda niet met hem gedeeld is, blijft Casa Cepa buiten bereik. **Zie bevinding C.**
- **Nadines adres** — overal `accommodatie@example.invalid`, met één m in "accomodation",
  op alle vijf plekken gelijk. Geen tikfoutvariant. **Zie bevinding B.**
- **Allergieën en dieetwensen** — komen niet in `_calendar.mjs` voor en niet in
  `admin_bookings_in_range` (het maandoverzicht). Wel in `admin_booking_detail`, achter de
  inlogcontrole; een vreemde krijgt daar 403.

## 3. Nog gesimuleerd

**Als afzonderlijk niet-bewezen te beschouwen:**

- **Supabase Auth.** Niet getest. De inlogcontrole draaide tegen een zelf ondertekend token
  op een nagebootste server, niet tegen Supabase.
- **Stripe.** Niet getest. Geen betaling, geen webhook, geen echte sessie.
- **Supabase zelf.** De migraties draaiden op kale PostgreSQL 16.4. Niet getest: de
  standaardrechten die Supabase uitdeelt (dat verschil beet op 3 september al een keer),
  PostgREST, en de gegevens die er al in staan.
- **Resend.** Alle mail ging naar een lokale postbus; er is niets verstuurd.
- **De agendaketen in bedrijf.** Nadines boekingen die nachten grijs maken, de
  weekendblokkades en de beschikbaarheid op de site draaien tegen een nabootsing. De
  ondertekening daarbij is echt, en het lezen van de echte agenda is los bewezen.

## 4. Resterende fouten en openstaande punten

### A. De herinneringsmail wordt in productie nergens verstuurd — **niet gerepareerd**

`netlify/functions/_payment-request.mjs` bouwt zowel het betaalverzoek als de herinnering,
maar wordt **alleen door de lokale testserver geïmporteerd.** Geen enkele Netlify-functie
gebruikt hem. `admin_remind_participant` legt alleen vast dát er herinnerd is.

**Gevolg:** wie in de beheeromgeving op *Herinneren* drukt, krijgt "reminded" te zien terwijl
er niets de deur uit gaat.

Dit hoort waarschijnlijk bij de betaalstroom die nog niet is aangesloten omdat de betaalpoort
dicht staat. **Maar het moet af zijn vóórdat die poort opengaat**, anders staat er een knop
die liegt. Ik heb het niet zelf aangesloten: dat raakt klantcommunicatie en geld.

### B. Nadines e-mailadres staat op vijf plekken in de repo

Onder meer als seed-regel in `database/admin.sql`. Dat is een persoonsgegeven van een derde
in een repo op GitHub — harde grens 4 uit `CLAUDE.md`. Het stond er al vóór deze branch.

Nu het adres ook als `LEWOS_ACCOMMODATION_EMAILS` in Netlify komt, zijn er bovendien twee
bronnen van waarheid. **Voorstel:** haal de seed uit `admin.sql` en laat `LEWOS_ADMIN_EMAILS`
die rol vervullen. Ik heb dit niet gedaan — het raakt wie er in de beheeromgeving komt, en
dat wil ik niet stilzwijgend veranderen.

### C. Staat je primaire agenda nog gedeeld met het serviceaccount?

De code kan Casa Cepa niet raken zolang je primaire agenda niet met
`lewos-calendar@lewos-automation.iam.gserviceaccount.com` gedeeld is. Of dat zo is, kan ik
niet zien zonder je persoonlijke agenda te lezen, en dat heb je niet gevraagd.

**Kijk zelf even** in de instellingen van je primaire agenda. Staat het serviceaccount daar
nog bij van de oude opzet, haal het er dan af.

### D. De betaalmail zonder prijsvermelding — voor de gestor

De betaalverzoekmail toont de prijs zonder *"total price including taxes"* en zonder link naar
de juridische kennisgeving. Voor gepubliceerde pagina's bewaakt `tests/site.test.mjs` allebei;
voor mails staat die eis nergens vast. Ik weet niet of het verplicht is en vul dat niet zelf in.

### E. Nog steeds open, ongewijzigd

De 18+-wegwijzer, privé-Tavern en minderjarigen, de verzekeringsvragen aan Mayte, de
verschillen tussen de bestaande voorwaarden en de nieuwe betaaltrap, en de vier vragen aan
Nadine. Hier zijn geen antwoorden voor verzonnen.

## 5. Vereiste Netlify-variabelen

Tien, alle **scope Functions, alle deploy contexts**. Geen waarden hieronder.

| Sleutel | Doel | Geheim? |
| --- | --- | --- |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | de agenda-aanroepen ondertekenen | **ja.** Regeleindes als `\n` |
| `SUPABASE_JWT_SECRET` | inlogtokens controleren | **ja** |
| `SUPABASE_ANON_KEY` | publiceerbare sleutel voor de inlogpagina | nee, wel niet tonen |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | het account dat de agenda aanspreekt | nee |
| `LEWOS_CALENDAR_ID` | wélke agenda — het groepsagenda-id | nee |
| `LEWOS_ACCOMMODATION_EMAILS` | welke afspraken van de accommodatie komen | nee, wél persoonsgegeven |
| `FONTECHA_ACCOMMODATION_EMAIL` | postvak van de accommodatie | nee, wél persoonsgegeven |
| `LEWOS_ADMIN_EMAILS` | wie de beheeromgeving in mag | nee, wél persoonsgegevens |
| `LEWOS_GENERAL_EMAIL` | postvak van Lewos | nee |
| `TAVERN_TIMEZONE` | tijdzone — valt terug op `Europe/Madrid` | nee |

`TAVERN_PAYMENTS_ENABLED` blijft **uit**. De poort heeft twee sloten: naast die schakelaar
eist `termsArePublished()` een gepubliceerd voorwaardennummer plus twee documenten.

## 6. Voorwaarden vóór livegang

**Zakelijk en juridisch — deze blokkeren de verkoop:**

1. RC-polis actief · caución actief · **RECE0033T06 ingediend én registratiecode ontvangen**.
2. Klantdocumenten af: precontractuele reisinformatie, boekingscontract, annulerings- en
   terugbetalingsvoorwaarden, minimumdeelnemersclausule, klachtenprocedure.
3. De gestor over de verschillen tussen de bestaande voorwaarden en de nieuwe betaaltrap —
   **dit blokkeert de eerste betaling.**
4. Het privacyconcept gelezen, waar nodig aangepast, en gepubliceerd.

**Technisch, vóór de deploy:**

5. `tests/database-integration.sql` één keer op een **Supabase-ontwikkelbranch** — de rechten
   die Supabase zelf uitdeelt zijn hier niet getest.
6. Een **herstelpunt van de database** vóór de migraties. Dit is het enige onomkeerbare deel;
   de site rol je in een minuut terug, de database niet.
7. De tien variabelen gezet.
8. Bevinding A opgelost óf de knop *Herinneren* verborgen, vóórdat de betaalpoort opengaat.

**Na de deploy:**

9. `scripts/sync-weekend-blocks.mjs --dry-run` vóór de echte run.
10. Eén proefafspraak vanaf Nadines adres (moet blokkeren) en één vanaf een ander adres (mag
    niets blokkeren, moet wél als waarschuwing verschijnen). Beide daarna weghalen.
11. Netlify Forms voor `tavern-question` uitzetten — pas nadat de vervangende route
    aantoonbaar werkt.
