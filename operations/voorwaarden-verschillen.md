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
