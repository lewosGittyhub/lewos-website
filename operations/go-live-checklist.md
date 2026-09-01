# Controlelijst voor livegang

Intern. Opgesteld 1 september 2026 op commit `069d515`.

Twee soorten controles staan hier door elkaar, en het verschil is belangrijk:

- **[lokaal]** — nu al na te gaan, en op 1 september 2026 ook nagegaan. Een test houdt het vast.
- **[na deploy]** — kan pas op de echte site, met `curl`. Zolang er niet gedeployed is, is
  hier niets over te zeggen. Vul het in met de uitkomst en de datum, niet met een verwachting.

Er is op dit moment **niets gedeployed en niets naar productie gemigreerd.** `origin/main`
staat nog op `9013051`; de branch `verwijder-dnd-merknaam` loopt daar tien commits op vooruit
en is niet gepusht.

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
| [lokaal] | `node --test tests/*.test.mjs` | **148 tests, 0 fouten** |
| [lokaal] | `node --check` op alle JS | schoon |
| [Codex] | `tests/database-integration.sql` op een wegwerpbranch, met `rollback` | **nog niet gedraaid sinds de laatste wijziging** |

Die laatste regel is geen formaliteit. De migratie is sinds de vorige Supabase-proef
gewijzigd: lege `search_path`, gekwalificeerde verwijzingen, en de herstelde telling van
deelnemers. Dat moet opnieuw langs een echte database voordat er iets naar productie gaat.

## 7. Productie

| | controle |
| --- | --- |
| [lokaal] | niets gepusht: `origin/main` staat op `9013051`, de branch heeft geen upstream |
| [lokaal] | `database/filming-consent.sql` is nergens uitgevoerd |
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
