# Verblijf en extra nachten

Gevraagd door Robert op 5 september 2026: *"dit moesten ze al aanklikken op de calender,
hetzelfde als booking.com of een vlucht boeken, van wanneer tot wanneer en dan door naar
gegevens."* Het tekstvak waarin een gast "twee nachten ervoor" typte is weg. Hij klikt nu
zijn aankomst en vertrek aan in dezelfde kalender waarin hij zijn weekend kiest.

---

## De regel waar alles aan hangt

**Het weekend is geboekt. De extra nachten zijn aangevraagd.**

Wij hebben geen beschikbaarheidsagenda van de accommodatie. Een aangeklikte nacht is dus
een vraag, geen reservering — en tot Fontecha hem bevestigt telt hij nergens mee als
verblijf: niet in de prijs, niet in Google Agenda, niet in de bevestiging aan de gast, niet
in het balkje in de maandkalender van de beheeromgeving.

Daarom staan `requested` en `confirmed` als twee aparte dingen naast elkaar in de database,
en niet als één veld dat van betekenis verandert.

| Kolom | Wat het is |
| --- | --- |
| `requested_arrival` / `requested_departure` | wat de gast heeft aangeklikt |
| `extra_nights_status` | `none` · `requested` · `confirmed` · `declined` |
| `arrival_date` / `departure_date` | wat de accommodatie heeft toegezegd. **Leeg = het weekend zelf.** |
| `extra_nights_decided_at` / `_by` | wie wanneer heeft beslist |
| `extra_nights` (bestond al) | vrije tekst van oudere boekingen; wordt niet gewist en niet meer ingetypt |

`arrival_date` en `departure_date` bestonden al sinds `admin.sql` maar werden nergens
gevuld. Dat zijn vanaf nu de bevestigde datums; er is geen tweede paar velden bijgekomen
dat hetzelfde probeert te zeggen.

---

## Waar het staat

| Bestand | Wat het doet |
| --- | --- |
| `assets/stay.js` | het rekenwerk: nachten tellen, aangevraagd tegenover bevestigd, en de teksten die daaruit volgen |
| `assets/weekend-calendar.js` | de kalender, gedeeld door `/tavern/` en `/tavern/book/` |
| `netlify/functions/_stay.mjs` | dezelfde rekenkern aan de serverkant, plus de wantrouwige laag over wat er uit een formulier komt |
| `database/stay-dates.sql` | de kolommen, `set_tavern_stay_request` en `admin_decide_extra_nights` |

`assets/stay.js` is met opzet de énige plek waar nachten geteld worden. De browser en de
Netlify-functies importeren allebei hiervandaan: een gast die drie nachten aanklikt en een
mail waarin er twee staan, is erger dan geen kalender.

> **Let op bij deployen.** `netlify/functions/_stay.mjs` importeert `../../assets/stay.js`
> — een bestand buiten de functiemap. De bundelaar volgt die import, maar controleer na de
> eerste deploy of `/api/first-access` en `/api/hold/promote` gewoon antwoorden. Doen ze
> dat niet met een module-fout, dan moet `assets/stay.js` mee in `included_files`.

---

## Wat de gast ziet

1. **Klik op een dag in een weekendblok** → dat weekend is gekozen, oranje. Aankomst en
   vertrek staan op de weekenddatums.
2. **Klik op een dag ervóór** → dat wordt de aankomstdag. **Erná** → de vertrekdag. Het
   bereik ertussen kleurt in.
3. **Klik nog eens op diezelfde dag**, of op *Only the weekend* → de aanvraag gaat weg.

De weekendnachten van het gekozen weekend zijn niet uit te zetten. Dat is het product.

**Een dag die je nog niet hebt aangeklikt is gewoon een datum.** Hij draagt geen rand en
licht op zodra je hem aanwijst. Dat was eerst anders: elke aanklikbare dag had een
streepjesrand, en dat waren er vijfenveertig tegelijk — een raster vol even luide vakjes
waarin je je eigen weekend kwijtraakte. De streepjes stonden op de verkeerde plek: ze
moesten "dit is een aanvraag" zeggen, maar stonden ook op alles wat niemand had gekozen.

**Wat je aanwijst wordt alvast getoond.** Ga je over een dag vóór het weekend, dan kleurt
het hele bereik tot daar in vóórdat je klikt.

**De nachten die je aanvraagt kleuren mee in hetzelfde oranje als het weekend**, zodat het
verblijf als één reeks leest — Robert, 5 september 2026. **Een tint lichter**, want ze zijn
aangevraagd en niet geboekt; dat verschil mag de kalender niet wegpoetsen. Verder staat het
in woorden: *Extra night — on request, not confirmed* in de legenda, *on request, subject to
availability* in het voorleeslabel van elk vakje, en onder de kalender:

> Extra nights are available on request only and depend on accommodation availability.

Die zin is letterlijk zoals Robert hem heeft vastgelegd en staat zichtbaar op de pagina,
niet in een placeholder — een placeholder verdwijnt zodra iemand begint te typen, precies
op het moment dat het voorbehoud telt.

## Het venster: wat je kunt aanklikken

Op 5 september 2026 bleek dat één klik ver vooruit een aanvraag van 54 nachten maakte en
een hele maand oranje kleurde. Zo werkt een datumkiezer bij een hotel niet: daar zijn dagen
die je niet kunt krijgen grijs en doen ze niets.

De grens is niet verzonnen — hij staat al op `/tavern/`:

> *"Depending on availability, you can extend your stay from the Monday before your Tavern
> weekend, or remain until Friday morning after it. Want to stay longer — or join us across
> two Tavern weekends? Ask us."*

Dus: **aankomen kan vanaf de maandag vóór het weekend, vertrekken tot en met de vrijdag
erna.** Daarbuiten is een dag zichtbaar maar niet aanklikbaar, en eronder staat wat je dan
wél kunt doen, met een link naar Robert.

**Het venster loopt nooit een ánder Tavern-weekend in.** Dat is dezelfde afspraak: twee
weekenden aaneen is op die pagina expliciet een gesprek, geen klik. In de praktijk knipt
dat het venster soms korter. Weekend 01 loopt tot en met donderdag 5 november en niet tot
vrijdag de 6e, omdat Weekend 02 die vrijdag begint. De zin onder de kalender noemt daarom
de datums die je écht kunt kiezen, niet de regel in het algemeen.

`tests/stay.test.mjs` houdt de code en die zin aan elkaar vast: verdwijnt de zin van de
pagina, dan valt de test om.

De maandnavigatie bladert onbeperkt vooruit en niet verder terug dan de huidige maand.

---

## Wat er waar terechtkomt

**Google Agenda.** De afspraak loopt van het *bevestigde* verblijf. Staat er een aanvraag
open, dan blijft de afspraak op de weekenddatums en staat de aanvraag alleen als regel in
de omschrijving: *"NOT part of this entry — extra nights still to be confirmed: …"* Een
agenda die een nacht toont die niemand heeft toegezegd, is een kamer die op de verkeerde
dag klaarstaat.

**De mail aan de accommodatie.** Twee blokken, en dat is het hele punt:

- *Confirmed booking / Reserva confirmada* — naam, aantal gasten, weekend, aankomst,
  vertrek, kenmerk.
- *NOT YET CONFIRMED — extra nights requested / TODAVÍA NO CONFIRMADO* — de aanvraag, met
  de vraag om te antwoorden.

Ze stonden eerst door elkaar, met "extra nachten" onder dezelfde kop als de aankomstdatum.
Dan leest een aanvraag als een afspraak.

De zin in dat tweede blok wordt **afgeleid uit de opgeslagen datums**, niet overgenomen uit
een tekstveld. Boekingen van vóór de kalender hebben geen datums maar wel de woorden van de
gast; die gaan mee als *"Requested (as written by the guest): …"*.

**De beheeromgeving.** Het maandoverzicht toont het bevestigde verblijf en zet er
`· extra nights requested` bij als er iets openstaat. In het detail staan *Arrival
(confirmed)* en *Departure (confirmed)* bij de feiten, en de aanvraag in een eigen blok
eronder met drie knoppen: **Confirm as requested**, **Confirm different dates**, **Decline**.

---

## Het oordeel van de accommodatie

- **Robert en Nadine mogen allebei beslissen.** Anders dan verlengen en vrijgeven, die
  alleen van Robert komen: dit is geen beslissing over geld of voorraad maar over de vraag
  of er een kamer vrij is, en dat weet de accommodatie. *Wil Robert dit alleen voor
  zichzelf, dan is dat één regel in `admin_decide_extra_nights`.*
- **Minder bevestigen dan gevraagd mag.** Eén van de twee nachten kan vrij zijn.
- **Meer bevestigen dan gevraagd kan niet.** Dat is geen bevestiging maar een nieuwe
  boeking, en die hoort niet uit een goedkeurknop te komen.
- **Elke beslissing wordt vastgelegd** in `lewos_admin_actions`, met wie, wat, wanneer en
  waarom.
- **Wijzigt de gast zijn datums na een bevestiging, dan vervalt die bevestiging** — hij
  ging over andere nachten. De status gaat terug naar `requested`, zichtbaar.

---

## De afrekenpagina

`/tavern/checkout/` heeft **geen** kalender. Die pagina kent alleen het uitnodigingstoken
en weet niet welk weekend erbij hoort; zonder de weekenddatums valt er geen eerlijke
kalender te tekenen. Het tekstvak is er wel weg — daar zou iemand datums typen die niets
veranderen. Er staat nu een blok dat zegt dat de aanvraag van de aanmelding blijft staan en
dat wijzigen per mail gaat.

*Wil je daar wél de kalender, dan is er een leesendpoint nodig dat een token omzet in het
weekend en de huidige aanvraag. Dat is een nieuwe RPC en dus nieuwe SQL die hier niet te
proeven is; daarom is het niet gebouwd.*

---

## Nog niet gedaan

- `database/stay-dates.sql` is **nooit tegen een database gedraaid**. Er is op deze machine
  geen PostgreSQL. Volgorde: `first-access.sql` → `admin.sql` → `stay-dates.sql`.
- Er is geen mail aan de gast wanneer de accommodatie bevestigt of afwijst. De status staat
  in de beheeromgeving; er gaat vanzelf niets uit.
- Er komt geen prijs bij een bevestigde extra nacht. Wat een nacht kost, weet de
  accommodatie; dat loopt buiten de site om.
