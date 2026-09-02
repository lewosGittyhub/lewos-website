# Controlelijst voor livegang

Intern. Opgesteld 1 september 2026 op commit `069d515`.

Twee soorten controles staan hier door elkaar, en het verschil is belangrijk:

- **[lokaal]** — nu al na te gaan, en op 1 september 2026 ook nagegaan. Een test houdt het vast.
- **[na deploy]** — kan pas op de echte site, met `curl`. Zolang er niet gedeployed is, is
  hier niets over te zeggen. Vul het in met de uitkomst en de datum, niet met een verwachting.

Er is op dit moment **niets gedeployed en niets naar productie gemigreerd.** `origin/main`
staat nog op `9013051`.

**Bijgewerkt 2 september 2026, gecontroleerd op `f6d31f0`.** De branch `verwijder-dnd-merknaam`
loopt achttien commits vóór op `origin/main` en **is inmiddels wél gepusht**:
`origin/verwijder-dnd-merknaam` staat op dezelfde commit als lokaal (`git rev-list --left-right
--count` geeft `0 0`). Dat is een feature-branch, geen deploy — die hangt aan de hoofdbranch, en
`origin/main` is onaangeroerd. **Wel te controleren in het Netlify-dashboard:** staan
branch-previews aan, dan is deze branch op een previewdomein leesbaar. Er is geen `netlify.toml`,
dus dat staat alleen in het dashboard en is hiervandaan niet vast te stellen. De `_redirects`
reist mee, dus de drie juridische routes geven daar ook 404.

## 1. De drie juridische routes geven 404

| | controle | hoe |
| --- | --- | --- |
| [lokaal] | zes geforceerde `404!`-regels in `_redirects`, twee per document | `tests/filming.test.mjs` |
| [lokaal] | `Disallow` voor alle drie in `robots.txt` | idem |
| [lokaal] | geen van de drie in `sitemap.xml` | idem |
| [na deploy] | `curl -I https://lewos.co/terms/` → **404** | handmatig |
| [na deploy] | `curl -I https://lewos.co/travel-information/` → **404** | handmatig |
| [na deploy] | `curl -I https://lewos.co/standard-information/` → **404** | handmatig |
| [na deploy] | er komt een échte 404-pagina terug, niet het document met een 404-status erboven | `curl` en kijk naar de body |
| [na deploy] | geen waarschuwing over `_redirects` in het Netlify-deploylog | dashboard |

Die laatste twee zijn geen formaliteit. Op 29 augustus 2026 stond `HANDOVER.md` live leesbaar
terwijl de regel er netjes in stond: Netlify serveert een bestaand bestand vóór een gewone
redirect. Het uitroepteken is wat het verschil maakt, en dat is alleen op de echte site te zien.

## 2. Geen publieke link naar een geblokkeerd document

| | controle | hoe |
| --- | --- | --- |
| [lokaal] | geen enkele uitgeleverde pagina linkt naar de drie routes | `tests/filming.test.mjs` |
| [lokaal] | de twee vinkjes in `/tavern/book/` en `/tavern/checkout/` beloven niet meer dat de gast de booking terms heeft gelezen | idem |
| [lokaal] | de drie bestanden zijn bewaard gebleven, niet uitgehold | idem |

De links *tussen* de drie documenten onderling blijven staan. Dat mag: die bestanden worden
niet uitgeleverd, en het scheelt werk als ze weer opengaan.

## 3. De betaalpoort blijft dicht

| | controle | hoe |
| --- | --- | --- |
| [lokaal] | `PUBLISHED_TERMS_VERSION`, `PUBLISHED_TERMS_DOCUMENT` en `PUBLISHED_TRAVEL_DOCUMENT` staan leeg in `netlify/functions/_booking-config.mjs` | `tests/filming.test.mjs`, `tests/media-database.test.mjs` |
| [lokaal] | `paymentsAreEnabled()` is daardoor onwaar, ongeacht welke Netlify-variabele er staat | `tests/booking-config.test.mjs` |
| [lokaal] | `/api/checkout` antwoordt 503 zolang die poort dicht is | `tests/checkout.test.mjs` |
| [lokaal] | `NODE_ENV=test` kan de poort niet openen op een publieke deploy | `tests/booking-config.test.mjs` |
| [na deploy] | `curl -sS -X POST https://lewos.co/api/checkout -d '{}'` → **503**, geen Stripe-sessie | handmatig |

De poort openen vraagt twee bewuste handelingen: die drie constanten vullen (codewijziging,
dus reviewbaar) én `TAVERN_PAYMENTS_ENABLED=true` in Netlify. Eén van de twee is niet genoeg.

## 4. De mediaflow is dicht en vraagt een geldige persoonlijke link

| | controle | hoe |
| --- | --- | --- |
| [lokaal] | zes constanten in `_media-config.mjs` staan leeg; poort dicht | `tests/media-consent.test.mjs` |
| [lokaal] | met de poort dicht: geen databaseaanroep, geen mail, niets opgeslagen | idem |
| [lokaal] | een dichte poort noemt geen enkele interne reden tegen de bezoeker | idem |
| [lokaal] | zonder geldige link blijft het formulierpaneel verborgen en staan alle velden uit | `tests/filming.test.mjs` |
| [lokaal] | een verlopen link geeft 410, een onbekende 404, een misvormde 400 — geen van drieën raakt de database | `tests/media-consent.test.mjs` |
| [lokaal] | Weekend 02 kan niet in de verplichte flow terechtkomen; dat staat in de database, niet alleen in het formulier | `tests/media-database.test.mjs` |
| [lokaal] | de mediapoort deelt geen code en geen variabele met de betaalpoort | idem |
| [na deploy] | `curl -sS "https://lewos.co/api/media-consent?token=$(python3 -c 'print("a"*40)')"` → **503** met een neutrale melding, zonder interne reden | handmatig |
| [na deploy] | `https://lewos.co/tavern/filming-agreement/` toont de tekst, géén invulbaar formulier | browser |

## 5. Geen onbevestigde bedrijfsgegevens gepubliceerd

| | controle | hoe |
| --- | --- | --- |
| [lokaal] | geen NIF, adres, telefoonnummer, registratiecode, garantieverstrekker of toezichthouder ingevuld die ANBEN nog moet leveren | met de hand nagelopen, zie *ANBEN* hieronder |
| [lokaal] | geen interne woorden op een pagina die een gast leest — `draft`, `concept`, `TODO`, `to be inserted`, `lawyer review`, `pending confirmation`, `not yet in force` | `tests/filming.test.mjs` |
| [lokaal] | de overeenkomst noemt de AEPD, `lewos.co@gmail.com` en de volledige kanalenlijst | idem |
| [lokaal] | nergens `irrevocable`, `in perpetuity`, `waive` of `forever` | idem |
| [na deploy] | steekproef op `/tavern/`, `/legal/`, `/privacy/` en `/tavern/filming-agreement/` | browser |

## 6. Tests

| | controle | uitkomst 1 september 2026 |
| --- | --- | --- |
| [lokaal] | `node --test tests/*.test.mjs` | **163 tests, 0 fouten** — zelf gedraaid op `f6d31f0`, 2 september 2026 |
| [lokaal] | `node --check` op alle JS | **26 bestanden schoon** — zelf gedraaid op `f6d31f0` |
| [database] | `tests/database-integration.sql` op een wegwerpbranch, met `rollback` | het logboek bevat twee items van 2 september die zo'n run beschrijven. **Hiervandaan niet te verifiëren**: geen `supabase`-CLI, geen `psql`, geen koppeling. Wie dit afvinkt moet het zelf hebben zien draaien. |

Die laatste regel is geen formaliteit. De migratie is sinds de vorige Supabase-proef
gewijzigd: lege `search_path`, gekwalificeerde verwijzingen, en de herstelde telling van
deelnemers. Dat moet opnieuw langs een echte database voordat er iets naar productie gaat.
Het uitvoerbare plan daarvoor staat in `operations/supabase-migration-testplan.md`: zeven
controles, de vijf verplichte gevallen, de rechten- en RLS-queries, en wat er moet gebeuren
als iets faalt.

## 6b. ~~Twee stukken die nog niet bestaan~~ — afgesloten

*Deze sectie was verouderd en is op 2 september 2026 gecorrigeerd, nagerekend op `f6d31f0`.*

Robert koos op 1 september de operator-flow, en daarmee zijn beide gaten dicht:

- `register_tavern_media_participants` **wordt wel aangeroepen**, door
  `scripts/media-participants.mjs:104`.
- De voortgangstoken **bestaat niet meer** en hoeft ook niet te bestaan: in de operator-flow
  leest Robert de teller zelf. `grep -c media_progress_token database/filming-consent.sql`
  geeft `0`.

## 6b-bis. Wat er wél nog ontbreekt: een test op `database/first-access.sql`

**Aangetoond op 2 september 2026.** Commit `f6d31f0` zet alle vijftien `SECURITY DEFINER`-functies
in `database/first-access.sql` op `set search_path=''` en kwalificeert alle verwijzingen. Ik heb
dat nagerekend en het klopt: 15 van 15 functies gepind, nul ongekwalificeerde verwijzingen, alle
`%rowtype` gekwalificeerd, 15 `revoke`s naar `public, anon, authenticated`, 14 `grant execute`
uitsluitend naar `service_role`, en `private.cleanup_tavern_claims()` terecht zonder grant.

**Maar geen enkele test bewaakt dat.** `tests/media-database.test.mjs` leest uitsluitend
`database/filming-consent.sql`. Wie in `first-access.sql` een `search_path=public` of een kale
tabelnaam terugzet, houdt alle 163 tests groen — en die fout valt dan pas op bij de eerste
aanroep in productie, met `relation ... does not exist`.

Tweede gat van dezelfde soort: `operations/supabase-migration-testplan.md` gaat over
`filming-consent.sql` en noemt `first-access.sql` alleen als voorwaarde vooraf. Stap 2 van dat
plan — *elke functie minstens één keer echt aanroepen* — bestaat niet voor deze vijftien.

## 6c. `PUBLIC_BOOKING_OPENS_AT`

| | controle | stand 1 september 2026 |
| --- | --- | --- |
| [lokaal] | huidige waarde | `2026-09-09T09:00:00Z` — **niet gewijzigd**, en te wijzigen alleen op uitdrukkelijke opdracht |
| [lokaal] | kan een eerdere datum de verkoop openen? | **nee** — `publicBookingIsOpen()` valt eerst over `paymentsAreEnabled()`, en die hangt aan drie lege constanten |
| [lokaal] | wat de datum wél doet | sluit het First Access-formulier: daarna `409 first_access_closed` |
| [lokaal] | wat er gebeurt als de variabele ontbreekt | het formulier antwoordt `503` voor de vaste weekenden |
| [Robert] | beslissing | **genomen op 2 september 2026: ongewijzigd laten** tot er een definitieve verkoopdatum is. Het gevolg is bewust aanvaard: staat de variabele in Netlify op 9 september, dan sluit First Access die dag terwijl er nog niet betaald kan worden. |
| [lokaal] | kan een datum de poort omzeilen? | **nee, uitgevoerd op `f6d31f0`**: de handler aangeroepen met `TAVERN_PAYMENTS_ENABLED=true`, een geldige termsversie en vijf datums (1970 · 9 september · zojuist · onzin · leeg), in beide modi `public` en `first_access`. Tien van de tien: `503 {"error":"checkout_not_open"}`. |

## 7. Productie

| | controle |
| --- | --- |
| [lokaal] | `origin/main` staat op `9013051` — onaangeroerd, geverifieerd op 2 september 2026 |
| [lokaal] | ⚠️ de feature-branch **is** gepusht naar `origin/verwijder-dnd-merknaam`; dat is geen deploy, maar de eerdere regel *"geen upstream"* klopte niet meer |
| [lokaal] | `database/filming-consent.sql` is **niet naar productie** gemigreerd. Over runs op tijdelijke databases: zie de regel in sectie 6 — hiervandaan niet te verifiëren. |
| [handmatig] | geen Netlify-variabele gewijzigd |
| [handmatig] | Robert geeft expliciet toestemming vóór een push, een deploy of een productiemigratie |

## Wat op ANBEN wacht

Zonder deze zes blijven de drie juridische routes dicht en de betaalpoort dicht. Ze mogen
niet worden ingevuld op basis van een aanname of een document dat elders is gevonden.

- fiscaal nummer (NIF/NIE)
- volledig bedrijfsadres
- telefoonnummer
- toeristische registratiecode
- gegevens van de RC- en insolventiegarantie (verstrekker, polisnummer, adres, telefoon)
- de bevoegde toezichthoudende instantie

Zodra ze binnen zijn: invullen in `/terms/`, `/travel-information/` en
`/standard-information/`, dan de zes `404!`-regels uit `_redirects` halen én de link naar
`/terms/` terugzetten in de twee vinkjes, en pas daarna de betaalpoort bespreken.

## Wat op de jurist wacht

De Filming & Media Agreement is inhoudelijk af en leest als een definitief document. Een
Spaanse privacy- en mediajurist moet er nog naar kijken, met de intrekkingsclausule als
eerste punt. **Dat staat nergens op de publieke pagina en hoort daar ook niet te staan.**
Zie `operations/filming-weekend-01.md`.
