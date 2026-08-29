# Overdracht — gedeeld werkdossier

Dit bestand is de enige waarheid over wie wat gedaan heeft, waarom, en wat er nog moet
gebeuren. Twee assistenten werken om beurten aan deze repo: **Codex** (ChatGPT) en
**Claude** (Claude Code). Ze zitten niet in elkaars gesprek. Dit bestand is de
overdracht.

## Werkwijze — altijd in deze volgorde

1. **Lees dit bestand voordat je iets aanraakt.** Begin bij het bovenste logboekitem.
2. **Staat het bovenste item op `TE CONTROLEREN` en is het van de ánder?** Dan is dat je
   eerste taak. Controleer het echt — code lezen, tests draaien, aannames narekenen —
   en zet het op `GECONTROLEERD` met je naam en wat je nagelopen hebt. Vind je iets
   fout, schrijf dat op en herstel het; verzwijg het niet.
3. **Staat het bovenste item op `TE CONTROLEREN` en is het van jezelf?** Dan wacht het op
   de ander. Ga verder met iets uit *Openstaand* dat er niet aan raakt.
4. **Werk daarna één punt uit *Openstaand* af**, van boven naar beneden, tenzij Robert
   iets anders vraagt.
5. **Voeg bovenaan het logboek een nieuw item toe** volgens het sjabloon onderaan. Elk
   item benoemt: wat, waarom, hoe de ander het kan controleren, en wat er nu volgt.
6. **Commit je werk op de huidige feature-branch.** Nooit pushen, nooit naar `main`,
   tenzij Robert er expliciet om vraagt. Robert wil eerst de diff zien.

Kun je iets niet controleren — geen Node, geen database, geen toegang — dan schrijf je
dat op als *niet geverifieerd* en zet je het in *Openstaand* voor de ander. Nooit
"getest" schrijven als je het niet hebt gedraaid.

## Wie kan wat

| | Codex (ChatGPT) | Claude (Claude Code) |
| --- | --- | --- |
| Node.js aanwezig | ja, in eigen omgeving | **nee, staat niet op deze Mac** |
| `node --test tests/*.test.mjs` | kan draaien | kan niet draaien |
| Supabase / echte Postgres-proef | kan draaien (rollback-transactie) | geen toegang |
| Code lezen, schrijven, redeneren | ja | ja |
| Git op deze Mac | ja | ja |
| python3 | ja | ja |

**Gevolg:** wat Claude aan code verandert, moet Codex natesten voordat het als
geverifieerd geldt. Wat Codex verandert, kan Claude nalezen en op logica, juridische
grenzen en inhoud controleren, maar niet uitvoeren.

## Harde grenzen — gelden voor allebei

Deze staan voluit in Roberts `CLAUDE.md` in `~/Downloads`. Kort:

- **Geen betaling mogelijk maken** zolang de reisbureauregistratie niet rond is: RC-polis
  actief · caución actief · RECE0033T06 ingediend én registratiecode ontvangen ·
  klantdocumenten definitief. Bouw geen checkout-omweg, geen "boek nu", geen betaalknop
  die de blokkade passeert.
- **Prijs is €2.025 p.p. all-in, drie nachten.** Op de Engelse pagina's geschreven als
  `€2,025`. Elke andere prijs is een fout.
- **Geen verzonnen feiten in publieke teksten.** Geen namen, reviews, statistieken of
  edities die niet vaststaan. De Dungeon Master mag genoemd worden als *"a dedicated
  Dungeon Master"*, zonder naam of credentials.
- **Geen persoonsgegevens of geheimen in de repo.** Geen NIE, adres, API-key, bankgegeven
  — ook niet in commit-berichten.
- **Geen Fonteca-verwijzingen** in Tavern- of Community Lodge-materiaal.
- Canonical en links wijzen altijd naar `lewos.co`, nooit `lewos.com`.

## Openstaand

Bovenaan staat wat als eerste moet. Haal een punt weg zodra het af én gecontroleerd is.

1. **[Codex] Draai de volledige testsuite op de wijziging van 29 aug (Claude).** Claude
   kon niet testen: geen Node op deze Mac. Nodig: `node --test tests/*.test.mjs`, plus
   `database/first-access.sql` gevolgd door `tests/database-integration.sql` in één
   Supabase-transactie die eindigt op `rollback`. Let specifiek op de nieuwe test
   *"the Stripe session and the database hold expire together"* en op
   `confirm_tavern_payment` met de grace van 5 minuten, en op de nieuwe test
   *"internal working documents are never served from the public site"*.
2. **[Codex] Controleer de gracemarge zelf in de database.** Scenario: hold verlopen,
   betaling met `p_paid_at` 2 minuten ná `hold_expires_at` → moet `paid` opleveren, niet
   `expired`. En: `p_paid_at` 10 minuten erna → moet `expired` blijven.
3. **[Robert, extern] Verzekeringen en registratie.** RC- en caución-polis actief,
   RECE0033T06 ingediend, registratiecode binnen. Geen van beide assistenten kan dit.
4. **[Robert, extern] Definitieve klantdocumenten.** Precontractuele reisinformatie,
   boekingscontract, annulerings- en terugbetalingsvoorwaarden, minimumdeelnemers-
   clausule, klachtenprocedure — als definitieve PDF's.
5. **[Wie het eerst kan, na 3 en 4] Vul de bedrijfsgegevens in.** In `/terms/` en
   `/travel-information/` staan nu letterlijk *"To complete before sales"*-blokken:
   volledig adres, fiscaal nummer, telefoonnummer, toeristische registratiecode,
   bevoegde autoriteit en de insolventiegarantieverstrekker. Pas daarna mogen
   `PUBLISHED_TERMS_VERSION`, `PUBLISHED_TERMS_DOCUMENT` en
   `PUBLISHED_TRAVEL_DOCUMENT` in `netlify/functions/_booking-config.mjs` gevuld worden.
   Zolang die leeg zijn, is betalen technisch onmogelijk — dat is bewust zo.
6. **[Wie het eerst kan] Spaanstalige kopie van de reisinformatie** plus het wettelijke
   standaardinformatieformulier, zoals de pagina zelf aankondigt. Bij een Spaanse tekst
   hoort een Nederlandse vertaling voor Robert.
7. **[Open vraag voor Robert] `noindex` op `/terms/` en `/travel-information/`.** Beide
   staan nu op `noindex, nofollow` omdat ze concept zijn. Dat moet eraf op het moment
   dat ze definitief worden — zet dat niet stilzwijgend om.

## Logboek — nieuwste bovenaan

### 2026-08-29 · Claude · Stripe-vervaltijd gelijkgetrokken met de stoelhold · TE CONTROLEREN

**Wat**
- `netlify/functions/_booking-config.mjs`: nieuwe constante `CHECKOUT_HOLD_MINUTES=40`.
- `netlify/functions/create-checkout-session.mjs`: de Stripe-sessie vervalt nu op
  `CHECKOUT_HOLD_MINUTES*60` seconden in plaats van een losse `1800`, en beide
  RPC-aanroepen krijgen `p_hold_minutes:CHECKOUT_HOLD_MINUTES` in plaats van `40`.
- `database/first-access.sql`: `confirm_tavern_payment` accepteert een betaling tot
  5 minuten ná `hold_expires_at`.
- `tavern/index.html`: `"First-access price for the opening editions"` vervangen door
  `"All-in: three nights, every meal, transfers"`.
- `tavern/book/index.html`: `€2.025` → `€2,025`.
- `tests/site.test.mjs`: twee nieuwe tests, *"the Stripe session and the database hold
  expire together"* en *"internal working documents are never served from the public
  site"*.
- `_redirects` en `robots.txt`: `HANDOVER.md`, `AGENTS.md`, `CLAUDE.md` en `/operations/`
  geven nu een 404 op de publieke site en staan op `Disallow`.

**Waarom**
- De Stripe-sessie verviel na 30 minuten terwijl de stoelhold 40 minuten duurde, en de
  gepubliceerde voorwaarden beloven 40. In dat gat van 10 minuten gaf de hervat-route in
  `begin_tavern_first_access_checkout` de opgeslagen `checkout_session_url` terug — een
  Stripe-link die al dood was — en maakte géén nieuwe sessie aan, omdat
  `create-checkout-session.mjs` bij een bestaande `checkoutUrl` meteen `resumed:true`
  teruggeeft. De gast kon niet verder tot Stripe's `expired`-webhook binnenkwam. Geen
  geld- of stoelprobleem, wel een dode betaallink op een pagina die een duur weekend
  verkoopt. Eén constante lost het op en houdt code en voorwaarden gelijk.
- De grace van 5 minuten hoort bij die wijziging. De database-hold begint een moment
  vóór Stripe's `expires_at` wordt berekend, dus een betaling in de laatste seconden kan
  een tijdstempel net ná de hold dragen. Stripe accepteert nooit een betaling op een
  verlopen sessie, dus de marge vangt alleen klokverschil op. Een al vrijgegeven stoel
  valt nog steeds af op de statuscontrole ervóór.
- De prijsregel `"First-access price for the opening editions"` impliceert dat de prijs
  later omhoog gaat. Dat staat nergens vast en leest als urgentie. Weggehaald; de nieuwe
  tekst zegt alleen wat er in zit, en dat is elders al onderbouwd.
- `€2.025` naast `€2,025` op twee Engelse pagina's is een slordigheid die op een
  boekingspagina duur oogt. `tests/site.test.mjs` accepteerde beide (`/€2[.,]025/`).
- Netlify publiceert de repo-root, dus `operations/booking-runbook.md` was al publiek
  leesbaar op `lewos.co/operations/booking-runbook.md` — inclusief de namen van
  omgevingsvariabelen en de werkwijze rond vastgelopen betalingen. Dat is geen geheim,
  maar het hoort niet op de site. `HANDOVER.md` en de twee instructiebestanden zouden
  hetzelfde probleem geven. Nu geblokkeerd, met een test die het blokkeren afdwingt voor
  elk markdown-bestand dat er later bij komt.

**Hoe te controleren**
- `node --test tests/*.test.mjs` — Claude kon dit niet draaien, er staat geen Node op
  deze Mac. De nieuwe test controleert dat de Stripe-vervaltijd en de databasehold uit
  dezelfde constante komen, dat er geen los getal meer in staat, en dat de belofte van
  40 minuten in `/tavern/book/` en `/terms/` daarmee overeenkomt.
- In Supabase: betaling 2 minuten ná `hold_expires_at` moet `paid` geven, 10 minuten
  erna nog steeds `expired`. Zie *Openstaand* punt 2.
- Handmatig: `grep -n "CHECKOUT_HOLD_MINUTES" netlify/functions/*.mjs` moet vier regels
  geven en `grep -n "1800" netlify/functions/create-checkout-session.mjs` niets.
- Na de eerstvolgende deploy: `lewos.co/operations/booking-runbook.md` en
  `lewos.co/HANDOVER.md` moeten 404 geven.

**Niet geverifieerd**
- De testsuite is niet gedraaid. De nieuwe testregels zijn wel met python3 tegen de
  echte bestandsinhoud nagerekend; de patronen matchen. Dat is geen vervanging voor
  `node --test`.

**Wat nu volgt**
- Codex: *Openstaand* 1 en 2.
- Daarna wacht alles op de externe punten 3 en 4, die alleen Robert kan afronden.

---

## Sjabloon voor een nieuw logboekitem

```
### JJJJ-MM-DD · <Codex|Claude> · <korte titel> · TE CONTROLEREN

**Wat**      welke bestanden, welke wijziging
**Waarom**   het probleem, niet de oplossing herhaald
**Hoe te controleren**  concrete commando's of scenario's
**Niet geverifieerd**   wat je zelf niet hebt kunnen draaien
**Wat nu volgt**        wie is aan zet en waarmee
```

Bij controle: zet `TE CONTROLEREN` om naar `GECONTROLEERD door <naam>, <datum>` en zet
er direct onder wat je hebt nagelopen en wat de uitkomst was. Ook als alles klopte.
