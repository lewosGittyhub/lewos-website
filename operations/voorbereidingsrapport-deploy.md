# Voorbereidingsrapport — branch `mailroutering-fontecha`

Opgesteld 6 september 2026, op commit `f3e198c`. **Niets gepusht, niets gedeployd.**
Dit rapport is bedoeld om gelezen te worden vóór er toestemming voor een deploy wordt gegeven.

---

## 1. De branch tegenover `origin/main`

**76 bestanden, 11.338 regels erbij, 315 eraf, in negen commits.**

| Onderdeel | Bestanden |
| --- | --- |
| `netlify/functions/` | 19 |
| `tests/` | 15 |
| `operations/` (interne documentatie) | 12 |
| `scripts/` (lokale testgereedschappen) | 8 |
| `database/` | 4 |
| `assets/` | 3 |
| Publieke pagina's | 6 |

De negen commits:

```
f3e198c  Repareer de integratiescripts zodat ze kunnen slagen
1190afc  Noteer de tiende omgevingsvariabele in de deployhandleiding
61c38ec  Laat privéafspraken geen voorraad meer blokkeren
923cd4c  Voeg werkafspraak gedeelde agenda toe
a42108b  Haal de derde kopie van "wil je langer blijven?" weg
c45d544  Zeg het pas als het waar wordt
c5320f3  Breng de kalender terug tot drie betekenissen
17df33c  Dicht twee gaten in de agendacontrole
dd06d64  Laat de site de gedeelde agenda lezen en het weekend blokkeren
cee1bca  Voeg boekingskalender, beheeromgeving en mailroutering toe
```

## 2. Zijn de eerdere wijzigingen behouden?

**`database/first-access.sql`: ja.** 666 regels, 140 erbij en 28 eraf tegenover `main`.
`dietary_notes` komt er 33 keer in voor, `merged_dietary_text` vijf keer. Dit is het bestand
dat op 5 september per ongeluk is teruggezet en daarna is hersteld; die herstelde inhoud
staat er nog.

**De privacywijzigingen: bewust nog niet toegepast.** `privacy/index.html` is tegenover
`main` **onveranderd** — dat is geen verlies maar de afspraak. Het voorstel staat als
reviewbaar concept in `operations/privacy-concept-accommodatie.md` (met de kant-en-klare
diff ernaast), met bovenaan: *"Status: concept. Niet gepubliceerd."*

> Dit blijft een openstaand punt. Zolang die zin niet gepubliceerd is, ontvangt de
> accommodatie gastgegevens die de gast nergens heeft kunnen lezen. Het concept wacht op
> jouw akkoord en bij voorkeur op één ronde langs een gestor.

## 3. Google Agenda: uitsluitend de aparte agenda

Gecontroleerd in de code, niet aangenomen:

- Het agenda-id komt op **één plek** binnen: `process.env.LEWOS_CALENDAR_ID` in
  `netlify/functions/_calendar.mjs` regel 42.
- Er is **geen terugvalwaarde**. Ontbreekt de variabele, dan geeft `calendarConfig()` `null`
  terug en wordt de agendastap overgeslagen en gelogd — er wordt niet stilletjes een andere
  agenda gekozen.
- Alle negen plekken die de agenda aanspreken gebruiken `config.calendarId`.
- Er staat **geen enkel vast agenda-id** in de repo. Een test bewaakt dat, samen met het
  e-mailadres van de accommodatie.

**Echt gecontroleerd tegen Google op 6 september 2026:** de afspraak die is aangemaakt kwam
terug met het nieuwe groepsagenda-id in het `organizer`-veld. Dat veld vult Google zelf, dus
dit is bewijs en geen aanname.

## 4. `LEWOS_ACCOMMODATION_EMAILS`

Gelezen op één plek (`accommodationAddresses()`), doorgegeven via `calendarConfig()`, en
gebruikt op drie plekken: de classificatie zelf, de bezette nachten, en de waarschuwingen in
de beheeromgeving.

De regel, op volgorde:

| Afspraak | Blokkeert | Reden in de code |
| --- | --- | --- |
| Van ons | nee | `eigen_afspraak` |
| Afgezegd, of op **Vrij** | nee | `geen_nachten` |
| Gemarkeerd `lewosSource = accommodation` | **ja** | `gemarkeerd_als_accommodatie` |
| Van een adres uit de variabele | **ja** | `accommodatie_adres` |
| Al het overige | nee | `niet_herkend` |

**Terugvalgedrag:** staat de variabele niet ingesteld, dan blokkeert alles wat niet van ons
is (`herkenning_niet_ingesteld`). Een lege instelling zet de bescherming dus niet
stilzwijgend uit.

Niet-herkende afspraken verdwijnen niet: ze komen als waarschuwing in de beheeromgeving
zodra ze een verkochte boeking raken, met de reden erbij. Ze blokkeren niets — zo afgesproken
op 6 september 2026, in afwachting van een expliciete bedrijfsregel.

## 5. De tien Netlify-variabelen

Alle tien: **scope Functions, alle deploy contexts** (`Same value for all deploy contexts`).
Geen enkele waarde staat hieronder, ook geen gedeeltelijke.

| Sleutel | Doel | Geheim? |
| --- | --- | --- |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | de agenda-aanroepen ondertekenen | **ja — geheim.** Bewaar de regeleindes als `\n` |
| `SUPABASE_JWT_SECRET` | inlogtokens van de beheeromgeving controleren | **ja — geheim.** Alleen nodig bij legacy HS256-tokens; tekent het project met moderne signing keys, dan blijft deze leeg |
| `SUPABASE_ANON_KEY` | de publiceerbare sleutel voor de inlogpagina | nee, publiceerbaar — maar niet tonen |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | het account dat de agenda aanspreekt | nee |
| `LEWOS_CALENDAR_ID` | wélke agenda | nee, wel een identificatie |
| `LEWOS_ACCOMMODATION_EMAILS` | welke agenda-afspraken van de accommodatie komen | nee, wél een persoonsgegeven |
| `FONTECHA_ACCOMMODATION_EMAIL` | postvak van de accommodatie | nee, wél een persoonsgegeven |
| `LEWOS_ADMIN_EMAILS` | wie de beheeromgeving in mag | nee, wél persoonsgegevens |
| `LEWOS_GENERAL_EMAIL` | postvak van Lewos | nee |
| `TAVERN_TIMEZONE` | tijdzone van de afspraken | nee — valt terug op `Europe/Madrid` |

Wat er misgaat als er één ontbreekt, staat per variabele in
`operations/deploy-mailroutering.md`. De scherpste: zonder
`FONTECHA_ACCOMMODATION_EMAIL` kan een betaalde boeking niet worden afgerond, en dat is met
opzet — een gast zonder bed mag niet stil misgaan.

## 6. De betaalpoort blijft dicht

Bevestigd in `netlify/functions/_booking-config.mjs`:

```js
export const paymentsAreEnabled=()=>process.env.TAVERN_PAYMENTS_ENABLED==="true"&&termsArePublished();
```

**Twee sloten, niet één.** Naast de schakelaar moet ook `termsArePublished()` waar zijn, en
die eist een gepubliceerd voorwaardennummer plús een voorwaardendocument plús een
reisinformatiedocument. Zolang die er niet zijn, staat de poort dicht ook als de schakelaar
per ongeluk aan gaat.

`TAVERN_PAYMENTS_ENABLED` blijft **uit** tot RC-polis, caución, RECE0033T06 mét
registratiecode én de klantdocumenten alle vier rond zijn.

## 7. Wat echt getest is, en wat nog nagebootst

### Echt uitgevoerd op 6 september 2026

| Wat | Uitkomst |
| --- | --- |
| **424 JS-tests** (`node --test tests/*.test.mjs`) | alle 424 geslaagd |
| **Vijf migraties op echte PostgreSQL 16.4**, verse database | alle vijf schoon |
| **Dezelfde vijf nog een keer** | schoon — dus idempotent, de dieetsamenvoeging verdubbelt niet |
| **`tests/database-integration.sql`** | alle controles geslaagd |
| **`scripts/integration-auth.mjs`** over HTTP | alle controles geslaagd |
| **`scripts/integration-booking.mjs`** over HTTP | alle controles geslaagd, twee keer herhaald |
| **Echte Google-agenda**: inloggen, lezen, naam en tijdzone, één afspraak aanmaken en teruglezen | geslaagd; tijdzone `Europe/Madrid` bevestigd |

### Nog nagebootst — niet tegen het echte systeem

- **Nadine's boekingen die nachten grijs maken**, de weekendblokkades, de beschikbaarheid op
  de site, het onderscheid herkend/niet-herkend. Werkt tegen een lokale nabootsing van
  Google Agenda. De ondertekening daarbij is wél echt.
- **Stripe.** Geen enkele echte betaling of webhook.
- **Resend.** Alle mail gaat naar een lokale outbox; er is niets verstuurd.

### Getest op PostgreSQL, niet op Supabase

De migraties draaiden op kale PostgreSQL 16.4. Daarmee is **niet** getest:

1. De standaardrechten die Supabase zelf uitdeelt. Op 3 september 2026 beet dat verschil al
   een keer: lokaal stond de teller op nul, op Supabase hadden `anon` en `authenticated`
   alle rechten op alle drie de tabellen.
2. PostgREST — of de RPC's over HTTP dezelfde handtekening vinden.
3. De gegevens die er al in staan.

**Draai `tests/database-integration.sql` daarom één keer op een Supabase-ontwikkelbranch
voordat dit naar productie gaat.**

## 8. De nieuwe logica zit niet in `origin/main`

Per bestand gecontroleerd. Geen van deze bestaat op `main`:

```
netlify/functions/_calendar.mjs        netlify/functions/house-availability.mjs
netlify/functions/_stay.mjs            netlify/functions/_dietary.mjs
assets/stay.js                         assets/weekend-calendar.js
database/stay-dates.sql                database/admin.sql
```

`origin/main` noemt `LEWOS_CALENDAR_ID` nergens. **Gevolg: de live site heeft op dit moment
geen agendakoppeling.** Er is dus nooit iets vanuit de site in een agenda geschreven, en het
zetten van de twee nieuwe variabelen verandert vandaag nog niets — er is geen code die ze
leest tot deze branch gedeployd is.

## 9. Bevindingen van vandaag

### A. Een herinnering zonder betaaldeadline geeft een misleidende foutmelding

Op een verse database gaf *"Nadine mag herinneren"* een **503 `admin_unavailable`**. De
werkelijke oorzaak staat alleen in het serverlog: `payment_request_deadline_missing`. De
herinneringsmail leest de deadline uit `claim.hold_expires_at`; is die leeg, dan mislukt het
opbouwen van de mail en vangt de handler dat af als "beheeromgeving niet beschikbaar".

**Waarom dit telt:** wie op *Herinneren* drukt en "admin unavailable" ziet, denkt dat het
systeem stuk is en probeert het opnieuw. In werkelijkheid ontbreekt er een deadline op die
deelnemer.

**Voorstel (niet uitgevoerd):** geef een 409 met een leesbare tekst — *"deze deelnemer heeft
nog geen betaaltermijn; stuur eerst het betaalverzoek"* — in plaats van een 503. Dit raakt
klantcommunicatie en geld, dus niet zonder jouw akkoord.

### B. Twee integratiescripts konden niet slagen

`scripts/integration-booking.mjs` deed vijf blokkeringen bij een limiet van vier per IP per
uur, en de kop verwees naar `/api/test/reset` om die limiet te wissen terwijl `resetLimits`
op `/api/test/clock` zit. Elke run viel daardoor ergens anders om, met steeds een andere
rode regel. **Hersteld** in `f3e198c`: het script zaait nu zelf opnieuw en wist de grens vóór
elke boeking. Twee opeenvolgende runs slagen volledig.

De herinneringscontrole in `integration-auth.mjs` toonde bij een mislukking geen statuscode.
Daardoor was bevinding A een half uur lang niet te herleiden. **Hersteld** — de status en het
antwoord komen er nu bij te staan.

### C. Een waarneming over de betaalmail — voor de gestor, niet voor mij

Toen de sitetest per ongeluk de lokale outbox meenam, viel op dat de betaalverzoekmail de
prijs toont zonder *"total price including taxes"* en zonder link naar de juridische
kennisgeving. Voor gepubliceerde pagina's bewaakt `tests/site.test.mjs` allebei; voor mails
staat die eis nergens vast.

Ik weet **niet** of dat verplicht is voor een e-mail, en ik ga dat niet zelf invullen. Het
hoort bij de vragen die toch al bij de gestor liggen over de voorwaarden en de betaaltrap.
Zet het daarbij, vóór de eerste echte betaalmail uitgaat.

### D. Mijn eigen fout, gemeld

Bij het vastleggen van de scriptreparatie heeft `git add -A` een reservemap met lokale
testdata meegenomen, inclusief een lokaal weggooi-JWT-geheim. Ontdekt doordat de testsuite
meteen op drie punten omviel. De commit is verbeterd vóórdat er iets mee gebeurde; de map
staat nergens meer in de acht commits en `.gitignore` dekt nu `.local-data*` in plaats van
alleen `.local-data/`. Er is niets gepusht geweest.

---

# Deploymentplan

## 1. Vereiste Netlify-instellingen

Vóór of tegelijk met de deploy, alle tien uit §5, **scope Functions, alle contexts**.
`TAVERN_PAYMENTS_ENABLED` blijft uit. Zet de twee nieuwe agenda-variabelen niet los van de
deploy — ze doen tot dat moment niets.

## 2. Volgorde

1. **Supabase eerst, op een ontwikkelbranch.** De vijf migraties in deze volgorde:
   `first-access.sql → filming-consent.sql → admin.sql → seat-holds.sql → stay-dates.sql`.
   Daarna `tests/database-integration.sql`. Slaagt dat niet, dan stopt alles hier.
2. **De tien variabelen zetten.**
3. **Migraties op de productiedatabase**, dezelfde volgorde.
4. **Pas dan pushen.** Een push naar de hoofdbranch gaat automatisch live — dus dit is het
   punt zonder weg terug, en het gebeurt alleen op jouw expliciete opdracht.
5. **Verificatie**, zie §4 hieronder.
6. **Netlify Forms voor `tavern-question` uitzetten** — pas nadat de vervangende route
   aantoonbaar werkt, niet ervoor.

## 3. Rollback

| Wat | Hoe terug |
| --- | --- |
| De site | Netlify → **Deploys** → de vorige deploy → *Publish deploy*. Dat is de snelste weg en werkt binnen een minuut |
| De code | `git revert` van de merge; niet `reset`, want de geschiedenis is dan al gedeeld |
| De database | **Hier is geen knop voor.** De migraties voegen toe en wijzigen; ze verwijderen niets. Terugdraaien betekent een herstelpunt van vóór de migratie. Maak dat herstelpunt vóór stap 3, anders is er geen weg terug |
| De agenda | Afspraken dragen `lewosSource = tavern-booking` en zijn daaraan te herkennen en te verwijderen. `scripts/sync-weekend-blocks.mjs` haalt weekendblokkades weg zodra er geen boekingen meer zijn |
| De betaalpoort | Stond dicht en blijft dicht; er valt niets terug te draaien |

**Het onomkeerbare deel is de database.** Zorg voor dat herstelpunt.

## 4. Controles na de deploy

**Google Agenda**
- `scripts/sync-weekend-blocks.mjs --dry-run` — kijk wat er zou komen vóór je hem zonder
  `--dry-run` draait.
- Zet één proefafspraak in de agenda vanaf Nadine's adres en controleer dat die nachten
  binnen vijf minuten grijs worden op de site.
- Zet één afspraak vanaf een ander adres en controleer dat die **niets** blokkeert en wél als
  waarschuwing in de beheeromgeving verschijnt.
- Verwijder daarna beide proefafspraken.

**Beschikbaarheid**
- `/api/house-availability?from=…&to=…` geeft `configured:true` en alleen datums, nooit
  titels.
- Faalt de agenda, dan hoort het antwoord `configured:false` te zijn — onbekend is niet vrij.
- Controleer dat een eigen boeking niet tegen zichzelf meetelt.

**Privacy**
- De beheeromgeving toont het gecombineerde dieetveld alleen achter de inlogcontrole; een
  vreemde krijgt 403.
- Het maandoverzicht draagt géén dieetgegevens.
- Er staat geen dieetgegeven in Google Agenda.
- **Het privacyconcept is nog niet gepubliceerd** — zie §2. Dit blijft openstaan.

**Betalingen**
- `TAVERN_PAYMENTS_ENABLED` is uit.
- De boekingspagina toont prijzen en verzamelt aanmeldingen, en biedt **geen** betaalknop.
- Er is geen checkout bereikbaar.

---

## Wat hierna nog openstaat

Dit rapport gaat over de techniek. Deze punten blokkeren de verkoop en staan los daarvan:

- **RECE0033T06 met registratiecode**, RC-polis, caución, klantdocumenten.
- **De gestor:** privé-Tavern en minderjarigen, is Fontecha verwerker of zelfstandig
  verantwoordelijke, de verschillen tussen de bestaande voorwaarden en de nieuwe
  betaaltrap — dat laatste blokkeert de eerste betaling — en nu ook bevinding C.
- **Mayte (Anben):** vier verzekeringsvragen, nog geen daarvan gesteld.
- **Nadine:** neemt de eerste geboekte stoel het hele weekend, wat als het minimum van vier
  niet gehaald wordt, en kerst en zomer.
- **De 18+-wegwijzer:** voorstel ligt er, niets gebouwd.
