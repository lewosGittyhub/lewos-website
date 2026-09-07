# Openstaande punten

Eén lijst, zodat niets tussen wal en schip valt. Bijgewerkt 6 september 2026.

**Regel voor dit bestand: hier staan geen antwoorden die ik niet heb.** Een punt blijft
staan tot Robert, de gestor of de verzekeraar het beantwoordt. Een plausibel klinkende
invulling is geen antwoord.

---

## Beslissingen voor Robert

| Punt | Stand nu | Waarom het wacht |
| --- | --- | --- |
| **18+-wegwijzer** | Voorstel ligt klaar, niets gebouwd | Featured weekenden zijn 18+, maar op `/tavern/` staat dat nergens — je leest het pas bij het afrekenen. Het voorstel voegt één kaartje en twee regels toe die zeggen wat je dan wél kunt doen. Geen "open weekenden" aangekondigd: die bestaan niet |
| **Mag Nadine extra nachten bevestigen?** | Ja, zo staat het nu | Zij is de accommodatie en weet of er een kamer vrij is. Wil je dit alleen zelf, dan is het één regel in `admin_decide_extra_nights` |
| **Mag Nadine betaaltermijnen verlengen?** | Ja, sinds 6 september 2026 | Stond eerst dicht. Robert heeft het herzien: zij weet als eerste of een gast nog onderweg is, en iemand laten omvallen op een termijn is duurder dan de beslissing zelf. **Vrijgeven blijft uitsluitend van Robert** — daar gaat een stoel terug naar de voorraad |
| **Aangevraagde nachten identiek oranje?** | Nu een tint lichter | Jij vroeg om mee-kleuren met het weekend; ik hield één tint verschil vast omdat ze nog niet bevestigd zijn. Identiek maken is één regel CSS |
| **Voorbeeldtekst op `/tavern/checkout/`** | *"Leave empty if none"* | Op die pagina betekent leeg laten juist "houd wat je bij je aanmelding zei". De regel eronder zegt dat wél. Eigen tekst voor die pagina? |

## Vragen voor de gestor

| Punt | Waarom het niet zelf in te vullen is |
| --- | --- |
| **Privé-Tavern en minderjarigen** | De voorwaarden zeggen alleen iets over *featured* weekenden. Wat er geldt voor een privé-Tavern staat nergens. `Briefing-boekingsformulier.md` §1.2/1.3 spreekt de voorwaarden bovendien tegen — vervalt die tekst, of geldt hij alleen voor privé? |
| **Is Fontecha verwerker of zelfstandig verantwoordelijke?** | Bepaalt of er een verwerkersovereenkomst bij hoort (art. 28 AVG). Een casa rural voert doorgaans een eigen wettelijke gastenregistratie en is dan zelfstandig — maar dat is een aanname, geen geverifieerd feit. Zie `privacy-concept-accommodatie.md`, punt 2 |
| **Bewaartermijn voor wat Fontecha krijgt** | Hun administratie, niet die van Lewos. Volgt uit het antwoord hierboven |
| **Verschillen tussen de bestaande voorwaarden en de nieuwe betaaltermijnen** | De 30/+60/+30-ladder, vrijgave alleen door Robert, en bevestiging per deelnemer staan niet in de huidige voorwaarden. Volledige lijst in `voorwaarden-verschillen.md`. **Moet vastliggen vóór de eerste betaling** |

## Af te spreken met Nadine

| Punt | Waarom het niet zelf in te vullen is |
| --- | --- |
| **Neemt de eerste geboekte stoel het hele weekend?** | Anders kan de Tavern nooit vier gasten halen: zij verhuurt de overige kamers en gast 2, 3 en 4 kunnen er niet meer bij. Voor Nadine is het geen kleinigheid — één stoel blokkeert een huis waar zij dat weekend meer aan had kunnen verdienen |
| **Wat als je bij vier niet komt?** | Geef je het weekend dan terug, en tot wanneer? Anders houd je een huis bezet voor een tafel die niet doorgaat |
| **Weekend 01 en 02 zijn vast** — de rest niet | Die twee zijn afgesproken vrijgehouden. Voor volgende weekenden geldt: wie het eerst boekt, heeft het |
| **Kerst en zomer** | Juist de themaweekenden die Robert wil, zijn de weken waarin Nadine het huis het duurst kan verhuren. Als hij die wil, nu afspreken en waarschijnlijk tegen een ander tarief |

## Vragen voor de verzekeraar (Mayte, Grupo Anben)

Vier stuks, nog niet gesteld:

1. Dekt de RC-polis deelnemers **onder de 18** als die ooit meekomen — en zo ja, onder welke
   voorwaarden (begeleiding, aparte vermelding)?
2. Geldt de dekking ook voor **extra nachten** vóór of ná het weekend, of alleen voor de
   weekenddagen zelf?
3. Verandert er iets aan de dekking bij een **privé-Tavern** met een andere groepssamenstelling?
4. Als er later **activiteiten** bij komen — wandelingen, kanoën, canyoning — met een externe
   aanbieder: verandert dat de dekking, en wat is er dan nodig? *Nog niet aan de orde, wel
   vóórdat het op de site komt.*

*In de AXA-polis (`AXA_poliza_RC_86694911.pdf`) staat niets over leeftijd: nul treffers op
`menor de edad`, `edad mínima`, `mayor de edad`, `18 años`, `niño`, `infantil`, `tutela`.
Dat betekent niet dat het gedekt is — het betekent dat de polis er niets over zegt.* 🟡

## Techniek die op iets anders wacht

| Punt | Waarop |
| --- | --- |
| Vier migraties op productie draaien | Robert; ze zijn lokaal getest (zie hieronder), maar niet op Supabase |
| Negen omgevingsvariabelen in Netlify | Robert; lijst in `deploy-mailroutering.md` |
| Netlify Forms voor `tavern-question` uitzetten | Pas ná de deploy én ná één echte vraag via de nieuwe route |
| Privacyverklaring bijwerken | Akkoord van Robert plus het antwoord van de gestor |
| Boeking met de hand invoeren in de beheeromgeving | Nodig als iemand telefonisch een Tavern-plek boekt: dat hoort niet in een agenda maar als echte boeking, met naam, voorwaarden en betaalstatus. Bestaat nog niet |
| Kalender op `/tavern/checkout/` | Vereist een leesendpoint dat een token omzet in het weekend; nieuwe SQL. Niet gebouwd |
| Mail aan de gast bij bevestigde of afgewezen extra nachten | Niet gebouwd; de status staat nu alleen in de beheeromgeving |

## De harde grens

De betaalpoort blijft dicht tot **alle vier** waar zijn:

- [ ] RC-polis actief
- [ ] Caución actief
- [ ] RECE0033T06 ingediend én registratiecode ontvangen
- [ ] Klantdocumenten af (precontractuele reisinformatie, boekingscontract, annulerings- en
      terugbetalingsvoorwaarden, minimumdeelnemersclausule, klachtenprocedure)

Er is geen checkout, geen betaalknop en geen "boek nu". `TAVERN_PAYMENTS_ENABLED` blijft uit.
