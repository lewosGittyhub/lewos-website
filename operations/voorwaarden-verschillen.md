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
