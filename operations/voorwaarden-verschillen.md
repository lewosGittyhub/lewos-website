# Verschillen tussen de gebouwde flow en de gepubliceerde voorwaarden

Vastgelegd voor juridische controle vóór livegang. **Niets hiervan blokkeert het lokaal
bouwen en testen**, en er is geen letter juridische tekst gewijzigd. Dit bestand is de lijst
die langs de gestor moet.

Stand: 5 september 2026. De betaalpoort staat dicht, dus geen van deze verschillen raakt op
dit moment een echte klant.

---

## 1. De reserveringstermijn: 40 minuten tegenover 60 + 30

**Wat er staat.** `terms/index.html` §*Temporary seat hold and confirmation*: *"When checkout
begins, the complete group is held for up to 40 minutes while payment is completed."*
Datzelfde getal staat in `netlify/functions/_booking-config.mjs` als `CHECKOUT_HOLD_MINUTES`.

**Wat er nu gebouwd is.** Er lopen twee paden naast elkaar:

| Pad | Termijn | Klopt met de voorwaarden? |
| --- | --- | --- |
| First Access (`/tavern/checkout/`) | 40 minuten, één betaler | ja, ongewijzigd |
| Groepsboeking (`/tavern/book/`) | 60 min invullen, dan 30 min betalen | **nee, niet beschreven** |

**Waarom het afwijkt.** Vier mensen die ieder hun eigen aandeel betalen halen veertig
minuten niet. Robert heeft op 5 september 2026 gekozen voor zestig minuten invullen en
dertig minuten betalen.

**Wat de gestor moet beoordelen.** Of de voorwaarden een tweede, langere termijn moeten
beschrijven, en hoe die zich verhoudt tot de herroepingsbepalingen. `tests/site.test.mjs`
bewaakt op dit moment allebei de getallen en valt om zodra iemand er één verandert zonder de
ander.

## 2. De totale termijn kan oplopen tot twee uur

Bij gedeeltelijke betaling krijgen de onbetaalde deelnemers eenmalig zestig minuten extra en
daarna nog dertig. De stoelen blijven in die tijd geblokkeerd. De voorwaarden kennen geen
verlenging; ze noemen alleen de veertig minuten.

## 3. Onbetaalde plaatsen komen bij gedeeltelijke betaling nooit automatisch vrij

Besloten door Robert en niet meer ter discussie. Na twee uur komen ze op *Actie nodig* te
staan en beslist Robert. De voorwaarden zeggen hier niets over.

**Het gevolg dat de gestor moet wegen.** Een featured weekend heeft zes stoelen en vereist
volgens `terms/index.html` §*Cancellation by Lewos* minstens **vier betaalde gasten** — een
eis per wéékend, niet per groep (`tavern_weekends.minimum_players`). Een groep van vier met
één betaler blokkeert dus vier van de zes stoelen voor onbepaalde tijd, terwijl het weekend
zelf vier betaalde gasten nodig heeft om door te gaan. De blokkeerregel kan het weekend van
zijn eigen minimum af houden. De beheeromgeving waarschuwt hiervoor per weekend.

## 4. Iedere deelnemer betaalt zijn eigen aandeel

De voorwaarden gaan uit van één boeker die voor de hele groep betaalt. Nu betaalt iedere
deelnemer zijn eigen €2.025 via een eigen betaallink, en is bevestiging per persoon.

**De vraag voor de gestor.** Wie is de contractspartij bij een *viaje combinado* als vier
mensen apart betalen: de aanmelder, of alle vier afzonderlijk? Dat bepaalt wie mag annuleren,
wie recht heeft op terugbetaling en aan wie de precontractuele informatie moet worden
verstrekt. **Niet zelf beantwoord.**

## 5. Onaangeraakt gebleven

- `terms/index.html`, `travel-information/index.html`, `standard-information/index.html`:
  geen letter gewijzigd. Ze dragen nog hun conceptaanduiding.
- De Spaanse tekst in `/travel-information/#es` is niet aangeraakt.
- De betaalpoort staat nog dicht (`PUBLISHED_TERMS_VERSION` is leeg).

## Voor de review

- [ ] Punt 1 en 2: moet er een tweede termijn in de voorwaarden?
- [ ] Punt 3: mag een blokkering zonder einddatum, en hoe verhoudt zich dat tot het minimum
      van vier betaalde gasten per weekend?
- [ ] Punt 4: wie is de contractspartij? Bepaalt ook of iedere deelnemer de precontractuele
      informatie apart moet krijgen.
- [ ] Pas daarna de voorwaarden bijwerken en `tests/site.test.mjs` meeveranderen.

---

## Aanvulling 9 september 2026 — kruiscontrole van de drie documenten

De vier punten hierboven gaan over de flow tegenover de voorwaarden. Deze aanvulling komt uit
een vergelijking van `terms/`, `travel-information/` en `standard-information/` onderling en met
de verkooppagina. Opnieuw is er geen letter juridische tekst gewijzigd.

### 6. De weekenden heten sinds 8 september anders op de site dan in de documenten

De verkooppagina en de database noemen ze **The Halloween Table** en **The Autumn Table**.
`travel-information/index.html` noemt ze nog **Weekend 01** en **Weekend 02**; de andere twee
documenten noemen ze niet bij naam.

Dit is op 8 september ontstaan met de hernoeming. Een gast die op de site "The Halloween Table"
koopt en in de precontractuele informatie "Weekend 01" leest, kan de twee niet aan elkaar
koppelen. De datums kloppen wel en zijn ondubbelzinnig, dus het is te herstellen door de namen
bij te werken — maar dat raakt juridische tekst en gaat dus langs de gestor.

### 7. Filmen ontbreekt volledig in de precontractuele informatie

Dit is het zwaarste punt van deze aanvulling.

`travel-information/index.html` noemt filmen **nul keer**. `standard-information/index.html`
ook nul keer. `terms/index.html` behandelt het wel, onder *Age, filming and personal data*.

Op de verkooppagina staat intussen: *"Weekend 01 is a professionally filmed edition. A
professional videographer captures selected parts…"* en zelfs *"Because filming is part of what
this Halloween Table is, every attendee…"*. Filmen wordt daar dus gepresenteerd als een
wezenlijk kenmerk van het pakket, niet als bijzaak.

De precontractuele informatie is juist het document dat de voornaamste kenmerken van de
reisdiensten moet beschrijven vóórdat de reiziger gebonden is. Staat daar niets over filmen,
terwijl de site het als essentie verkoopt, dan mist die informatie een kenmerk dat de keuze van
een gast kan bepalen. Er hangt bovendien een gegevensbeschermingskant aan: er is een volledige
toestemmingsstroom gebouwd (`database/filming-consent.sql`, `/tavern/filming-agreement/`), maar
die begint pas ná de boeking.

**Vraag voor de gestor.** Moet het gefilmde karakter van weekend 01 in de precontractuele
informatie en in het standaardformulier staan, en zo ja in welke bewoording? En moet de
toestemming vóór of ná het sluiten van de overeenkomst worden gevraagd?

### 8. De precontractuele informatie beschrijft één betaling, de flow doet er zes

`travel-information/index.html` zegt: *"Payment is made in one amount through Stripe. A group
booking becomes binding after successful payment."*

Gebouwd is: iedere deelnemer betaalt zijn eigen €2.025 via een eigen betaallink, en bevestiging
gaat per persoon. Dit is punt 4 hierboven, maar het staat dus óók in het document met de
strengste eisen. Wie punt 4 beantwoordt, moet deze zin meenemen.

### 9. Een Fontecha-verwijzing in Tavern-materiaal

`terms/index.html` bevat: *"Photographs of the actual location are published on the Tavern's
Instagram channel and by the accommodation itself on @fontecha_asturias."*

`CLAUDE.md` §5.3 stelt als harde grens: *"Community Lodge / The Lewos Tavern staat volledig los
van Fonteca. Nooit vermengen, nooit koppelen, geen Fonteca-referenties in Tavern- of Community
Lodge-materiaal."*

Dat botst. Het kan een bewuste uitzondering zijn — gasten doorverwijzen naar echte foto's van de
locatie is eerlijk en nuttig — maar het staat wel in de boekingsvoorwaarden, en dat is
Tavern-materiaal. **Besluit van Robert, geen juridische vraag.**

### Wat er níét mis bleek

- Prijs: €2.025 per persoon, consistent in alle documenten en op de site.
- Minimum van vier betaalde gasten: consistent tussen `travel-information` en de gebouwde flow.
- Datums, aankomst- en vertrektijden: consistent.
- "a professional Game Master" in enkelvoud blijft kloppen; er zijn twee spelleiders, maar elk
  weekend heeft er één.
- Alle drie de documenten dragen zichtbaar hun conceptaanduiding en staan live op 200, wat klopt:
  lezen mag, eraan gebonden zijn niet.

### Aangevuld op de reviewlijst

- [ ] Punt 6: weekendnamen gelijktrekken met de site.
- [ ] Punt 7: filmen opnemen in de precontractuele informatie en mogelijk in het
      standaardformulier, en bepalen wanneer toestemming gevraagd moet worden.
- [ ] Punt 8: de zin over één betaling herzien, samen met punt 4.
- [ ] Punt 9: besluit over de Fontecha-verwijzing in de voorwaarden.

---

## Aanvulling 9 september 2026 (tweede) — wat er zonder gestor is rechtgezet

**Aanleiding.** Robert op 9 september 2026: er is voorlopig geen geld voor een gestor. Die
komt pas nadat er drie weekenden zijn georganiseerd; daarna wordt alles officieel gemaakt.
Tot die tijd moeten de documenten er staan en zo goed mogelijk kloppen.

**De grens die dit níét verschuift.** Betere documenten openen de verkoop niet.
`CLAUDE.md` §5.1 blijft gelden: verkopen mag pas als RC-polis en caución actief zijn, de
RECE0033T06-registratiecode binnen is én de klantdocumenten af zijn. De betaalpoort blijft
dicht: `PUBLISHED_TERMS_VERSION` is leeg, `TAVERN_PAYMENTS_ENABLED` staat niet op Production,
en alle drie de documenten dragen hun conceptaanduiding.

**Het onderscheid dat is aangehouden.** Rechtgezet is alleen wat *feitelijk onjuist* was: het
document beschreef iets anders dan wat er gebouwd is. Dat kan zonder jurist, want het maakt de
tekst waar in plaats van onwaar, en het geeft de reiziger méér informatie, nooit minder. Niet
aangeraakt is alles waar een juridisch oordeel aan hangt: wie de contractspartij is, of een
blokkering zonder einddatum mag, en hoe de termijnen zich tot het herroepingsrecht verhouden.

### Wel gewijzigd

| Punt | Bestand | Was | Is |
| --- | --- | --- | --- |
| 1, 2, 3 | `terms/` §*Temporary seat hold* | alleen 40 minuten | beide paden beschreven: 40 minuten bij één betaler; 60 + 30 minuten bij eigen aandelen, met één verlenging tot maximaal twee uur, en de mededeling dat onbetaalde stoelen niet automatisch vrijkomen maar door Lewos worden beoordeeld |
| 6 | `travel-information/` (EN + ES) | Weekend 01 / Weekend 02 | The Halloween Table / The Autumn Table |
| 7 | `travel-information/` (EN + ES) | filmen kwam nul keer voor | een punt onder *Main characteristics* dat beschrijft dat The Halloween Table een gefilmde editie is, dat iedere gast de Filming & Media Agreement persoonlijk invult, dat niemand namens een ander tekent, dat herkenbaar promotioneel gebruik en betaalde advertenties elk apart toestemming vragen die geweigerd mag worden, en dat The Autumn Table niet gefilmd is |
| 8 | `travel-information/` (EN + ES) | "Payment is made in one amount through Stripe" | iedere deelnemer betaalt zijn eigen €2.025 via een eigen betaallink, en de bevestiging gaat naar iedere deelnemer die betaald heeft |

De datumstempel van `terms/` is meegegaan van 2026-08-28 naar 2026-09-09. De Spaanse versie van
`travel-information/` is per punt meegeschreven, zodat de belofte bovenaan die sectie waar blijft:
er wordt niets toegevoegd of weggelaten.

### Correctie op punt 7 van de eerste aanvulling

Punt 7 stelde dat filmen ook in `standard-information/` ontbreekt. Dat is geen gebrek. Dat
formulier heeft een tekst die de wet zelf voorschrijft; het beschrijft geen enkel kenmerk van
een specifiek pakket, van geen enkele aanbieder. Er is dan ook niets aan gewijzigd. Filmen
hoort in de precontractuele informatie, en daar staat het nu.

### Niet gewijzigd, en waarom

- **Punt 4 — wie is de contractspartij.** Onbeantwoord. Er staat nu beschreven *hoe* er
  betaald wordt, niet *wie* er tekent. Dat verschil is bewust: het eerste is een feit, het
  tweede een juridisch oordeel.
- **Punt 9 — de Fontecha-verwijzing in `terms/`.** Onaangeraakt. Dit botst met `CLAUDE.md` §5.3,
  maar het weghalen haalt ook eerlijke informatie weg bij een gast die foto's van de echte
  locatie zoekt. Besluit van Robert.
- **De open velden.** Volledig adres, fiscaal nummer, telefoon en toeristische registratie
  blijven leeg. Die zijn er nog niet (registratiecode) of horen niet in de repo
  (`CLAUDE.md` §5.4). Ze staan als "to complete" in de tekst, waar ze horen.
- **`standard-information/`.** Geen letter gewijzigd.

### De lijst voor de gestor, straks

- [x] Punt 1, 2 en 3: de voorwaarden beschrijven nu wél beide termijnen. **Blijft open:** of een
      blokkering zonder einddatum toelaatbaar is, en hoe twee uur zich verhoudt tot het minimum
      van vier betaalde gasten per weekend.
- [ ] Punt 4: wie is de contractspartij? Bepaalt ook of iedere deelnemer de precontractuele
      informatie apart moet krijgen. **Niet zelf beantwoord.**
- [x] Punt 6: weekendnamen gelijkgetrokken.
- [x] Punt 7: filmen staat in de precontractuele informatie. **Blijft open:** of de toestemming
      vóór of ná het sluiten van de overeenkomst gevraagd moet worden.
- [x] Punt 8: de zin over één betaling is herzien.
- [ ] Punt 9: besluit over de Fontecha-verwijzing. **Van Robert, geen juridische vraag.**
- [ ] Twee vragen die al in `standard-information/` stonden: verandert Richtlijn (EU) 2026/1024
      dit wettelijke formulier, en moet de registratiecode in commerciële communicatie staan?

474 tests groen na de wijziging. `tests/site.test.mjs` bewaakt nog steeds dat `terms/` het getal
uit `CHECKOUT_HOLD_MINUTES` noemt en dat de boekingspagina 60 en 30 minuten noemt.
