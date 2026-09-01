# Overdracht — gedeeld werkdossier

Dit bestand is de enige waarheid over wie wat gedaan heeft, waarom, en wat er nog moet
gebeuren. Twee assistenten werken om beurten aan deze repo: **Codex** (ChatGPT) en
**Claude** (Claude Code). Ze zitten niet in elkaars gesprek. Dit bestand is de
overdracht.

## Openstaande vragen aan de ander

Kort blok, bewust bovenaan. Hier staat alleen wat de één van de ánder nodig heeft om verder
te kunnen. Beantwoord? Dan haal je de vraag hier weg en zet je het antwoord in het logboek.
Het lange logboek hieronder is naslag, geen postvak.

**Van Claude aan Codex, 29 augustus 2026 — Spaanse juridische termen.**
Klopt de woordkeus in `/travel-information/#es`? Concreet *viaje combinado* ·
*penalización adecuada y justificable basada en las pérdidas reales, los ahorros y la
reventa* · *entidad garante frente a la insolvencia* · *soporte duradero* · *la reserva
puede cederse a otro viajero*. Gebruikt het TRLGDCU deze termen zelf, of heb ik een
gangbare vertaling gekozen waar de wet een vaste term heeft? Ik heb die tekst geschreven en
kan mijn eigen vertaling niet goedkeuren.

**Van Claude aan Codex, 29 augustus 2026 — reikwijdte van artikel 153.**
Eist dat artikel vervoer *"met tijden"* ook voor een transfer die wij zelf regelen, of
alleen voor lijnvluchten en treinen? Ik heb aankomst vanaf 16:00 en vertrek na het ontbijt
toegevoegd omdat ik het eerste lees. Te ruim gelezen? Zeg het.

**Wacht op Robert, niet op Codex.** `PUBLIC_BOOKING_OPENS_AT` staat op 2026-09-09T09:00:00Z
en sluit het aanmeldformulier over elf dagen, zeven weken vóór het weekend van 30 oktober.
En of `/tavern/book/` dicht moet tot de verkoop open mag.

**Bevestiging van Robert, 1 september 2026:** Weekend 02 wordt niet professioneel gefilmd.
Lewos kan vooraf incidenteel vragen of een gast vrijwillig in een specifieke foto of korte
video wil verschijnen; weigeren heeft geen gevolgen voor deelname. Herkenbare promotionele
publicatie vereist vooraf specifieke toestemming. Betaalde advertenties blijven afzonderlijk
optioneel.

## Actuele stand — 29 augustus 2026

- De betaalpoort blijft dicht tot de externe papieren en regelingen definitief zijn. Tot die tijd kunnen bezoekers alleen reserveringsinformatie achterlaten; er wordt niet betaald.
- `/tavern/book/` hoeft daarom nu niet publiek toegankelijk te zijn. De lokale tekstwijziging in commit `e90016b` verduidelijkt dat er geen betaling of betaalgegevens worden gevraagd; die commit staat nog niet op `main`.
- `origin/main` is lokaal voor het laatst gecontroleerd op commit `9013051`. Deze regel is een lokale overdracht en is nog niet gepusht.
- Communicatie tussen assistenten loopt uitsluitend asynchroon via deze repository en `HANDOVER.md`: schrijven → committen → pushen → bij een volgende controle lezen. Er is geen directe chat-, status- of bevestigingsverbinding.


## Werkwijze — altijd in deze volgorde

1. **Lees dit bestand voordat je iets aanraakt.** Begin bij *Openstaande vragen aan de
   ander* helemaal bovenaan, daarna het bovenste logboekitem. Staat er een vraag van de
   ander open, dan beantwoord je die eerst — daar wacht iemand op.
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
| Node.js aanwezig | ja, in eigen omgeving | ja, sinds 29 aug 2026 in `~/.local/node` |
| `node --test tests/*.test.mjs` | kan draaien | kan draaien |
| Beeldbewerking (sharp, WebP) | ja | ja |
| Supabase / echte Postgres-proef | kan draaien (rollback-transactie) | **geen toegang** |
| Code lezen, schrijven, redeneren | ja | ja |
| Git op deze Mac | ja | ja |
| python3 | ja | ja |

**Lokale preview.** `python3 -m http.server` weigert te starten met de werkmap ergens in
`~/Documents`: macOS blokkeert `os.getcwd()` daar voor dat proces, met
`PermissionError: [Errno 1] Operation not permitted`. Werkende omweg: kopieer de site naar
een map buiten `~/Documents` (bijvoorbeeld onder `/private/tmp`) en serveer die.

**Gevolg:** allebei kunnen de testsuite draaien, dus dat is geen scheidslijn meer. Wat
alleen Codex kan is de echte databaseproef tegen Supabase. Verder blijft gelden dat de
ander controleert: niemand keurt zijn eigen werk goed.

## Er is geen live verbinding tussen ons

Wij kunnen elkaar niet bereiken. Geen berichten, geen opdrachten, geen statusinformatie.
De repo is de hele overdracht, en Robert is de enige die iets van de één bij de ander krijgt.

Daarom, en dit geldt voor allebei:

- **Schrijf nooit dat je de ander iets hebt gestuurd, dat de ander "actief" of "bezig" is,
  of dat de ander iets aan jou heeft bevestigd.** Dat kun je niet weten. Het is geen
  slordige formulering maar een verzonnen feit, en daarmee valt het onder dezelfde regel
  als een verzonnen spelleider of een verzonnen editie.
- **Rapporteer alleen wat je zelf hebt gecontroleerd**, en zeg erbij hoe. "Ik heb `curl`
  gedraaid op deze acht routes" is een controle. "Het staat goed" is dat niet.
- **Noem bij elke uitspraak over de stand van de repo of de site het commit-nummer waar je
  tegenaan hebt gekeken**, en haal dat vers op met `git fetch`. Zonder dat nummer is een
  statusrapport binnen een halfuur onjuist zonder dat iemand het merkt.
- **Wacht niet op een antwoord van de ander.** Zet je vraag in *Openstaande vragen aan de
  ander* bovenaan en ga verder met iets anders. De ander leest het bij zijn volgende sessie.

Dit is op 29 augustus 2026 misgegaan: er werd gemeld dat Claude een opdracht had ontvangen,
actief was en een rapport had teruggestuurd. Daar was niets van waar, en het bijbehorende
statusoverzicht noemde een commit die op dat moment al achterhaald was. Dezelfde dag meldde
Claude vier bestanden als afgeschermd op grond van een test die dat niet kon vaststellen.
Twee keer hetzelfde patroon: zekerheid uitspreken over iets wat niet gecontroleerd is.

## Harde grenzen — gelden voor allebei

Deze staan voluit in Roberts `CLAUDE.md` in `~/Downloads`. Kort:

- **Geen betaling mogelijk maken** zolang de reisbureauregistratie niet rond is: RC-polis
  actief · caución actief · RECE0033T06 ingediend én registratiecode ontvangen ·
  klantdocumenten definitief. Bouw geen checkout-omweg, geen "boek nu", geen betaalknop
  die de blokkade passeert.
- **Nooit een maat beloven die een gast kan natellen.** Robert, 29 augustus: *"als ze tien
  meter gaan tellen is het misschien twaalf of dertien meter."* Afstanden, aantallen
  huisgenoten, loopminuten — houd het feit, laat het getal weg. Een test in
  `tests/site.test.mjs` weigert elke afstand in meters of kilometers op een publieke
  pagina. Dit geldt ook voor beloftes die je onderweg zelf verzint om een andere op te
  lossen.
- ✅ **Bevestigd door Robert op 29 augustus 2026: de wandelaars op `IMG_4693` zijn zijn
  familie en vinden publicatie prima.** Dat beeld staat daarom in de diavoorstelling. De
  regel eronder blijft wel staan: een herkenbare vreemde gaat niet op een commerciële site
  zonder diens woord.
- ✅ **Besloten door Robert op 29 augustus 2026: de video komt niet op de site.** Verticaal,
  te zwaar, en zonder ffmpeg niet fatsoenlijk te comprimeren. Instagram is de plek. Niet
  opnieuw voorstellen.
- ✅ **Bevestigd door Robert op 29 augustus 2026: het stenen pand op `IMG_1725` is een van
  de slaapplekken.** Het bijschrift *"Where you sleep"* mag daarom staan. Wel *"one of the
  houses"*, want een gast slaapt niet per se in díé.
- ✅ **Bevestigd door Robert op 29 augustus 2026: dat gasten te eten krijgen is een feit; waar
  het vandaan komt doet er niet toe.** Beschrijf op de site dus wát er inbegrepen is, en
  nooit hoe of waar het bereid wordt. Dat is nu tijdelijk geregeld en verandert als er een
  kok en een eigen keuken komen — een zin over de keuken zou dan meteen onjuist worden.
- **Een bijschrift beschrijft de foto, het belooft geen dienst.** Zodra er staat wat een
  gast krijgt, of hoe een maaltijd wordt gemaakt, is het een belofte die niemand tegen de
  keuken heeft gehouden. Een test in `tests/site.test.mjs` weigert dat soort formuleringen
  in de sfeersectie.
- **Prijs is €2.025 p.p. all-in, drie nachten.** Op de Engelse pagina's geschreven als
  `€2,025`. Elke andere prijs is een fout.
- **Geen verzonnen feiten in publieke teksten.** Geen namen, reviews, statistieken of
  edities die niet vaststaan.
  - ✅ **Bevestigd door Robert op 29 augustus 2026: de Game Master is rond.** Naam,
    biografie, foto en het spelerscitaat op `tavern/index.html` zijn door de betrokkene
    zelf gezien en goedgekeurd. Dit vervangt de oudere aantekening in Roberts
    `CLAUDE.md` (§5.2, stand 21 augustus) dat de persoon nog niet bekend was. **Niet
    opnieuw als risico opvoeren.** Verandert de tekst over hem, dan is dat wel weer een
    vraag aan Robert.
  - ✅ **Bevestigd door Robert op 29 augustus 2026: `Complejo Rural de Fontecha` mag bij
    naam genoemd worden** en er mag naar gelinkt worden; dat is met de accommodatie
    afgestemd. De regel in Roberts `CLAUDE.md` (§5.3) over het gescheiden houden van
    Fonteca gaat over iets anders en slaat niet op deze locatievermelding.
- **Geen persoonsgegevens of geheimen in de repo.** Geen NIE, adres, API-key, bankgegeven
  — ook niet in commit-berichten.
- **Geen Fonteca-verwijzingen** in Tavern- of Community Lodge-materiaal.
- Canonical en links wijzen altijd naar `lewos.co`, nooit `lewos.com`.

## Openstaand

Bovenaan staat wat als eerste moet. Haal een punt weg zodra het af én gecontroleerd is.

*Bijgewerkt 29 augustus 2026. Vijf punten die al uitgevoerd waren zijn eruit gehaald — 17
release, 18 brede ronde, 19 best-effort, 20 media en 21 juridische status; alle vijf staan
in het logboek. De lijst loopt nu op volgorde van urgentie: eerst wat de deploy tegenhoudt,
dan wat de verkoop tegenhoudt, dan de open vragen.*

**Toegevoegd 1 september 2026 — de gefilmde editie.** Bewust zonder nummer: de genummerde
lijst hieronder verwijst intern naar zijn eigen nummers ("na 7 en 8", "pas na 3–9") en die
mogen niet verschuiven. Qua urgentie horen deze drie tussen 1 en 2.

- **[Robert] Beantwoord de vier vragen rond de gefilmde editie.** Wordt Weekend 02 wel of
  niet professioneel gefilmd · de acht ontbrekende gegevens op `/tavern/filming-agreement/`
  (fiscaal nummer, volledig adres, telefoon, privacy-contactadres, bewaartermijn, bevoegde
  toezichthouder, platformlijst) · de operationele filmregels bevestigen of corrigeren · de
  overeenkomst met de videograaf. Alles staat uitgeschreven in
  `operations/filming-weekend-01.md`.
- **[Robert, extern] Spaanse privacy- en mediajurist over de Filming & Media Agreement.**
  De conceptpagina staat er, `noindex` en zonder formulier. Zonder die review mag hij niet
  naar een gast toe. Let vooral op de intrekkingsclausule: Spaans portretrecht laat
  toestemming intrekken, dus er staat nergens *irrevocable* of *in perpetuity*, en een test
  houdt dat zo.
- ~~**[Wie het eerst kan, na die twee] Bouw de per-deelnemer-flow.**~~ **Gebouwd op
  1 september 2026 en dicht.** Migratie, functies, poort, e-mailsjabloon en tests staan er;
  de mediapoort in `netlify/functions/_media-config.mjs` houdt alles gesloten tot de zes
  instellingen bewust gevuld zijn. Zie het bovenste logboekitem en
  `operations/filming-weekend-01.md`. Wat er nu nog moet gebeuren staat hieronder.
- **[Robert, na de juridische review] Zet de mediaflow aan.** Zeven Netlify-variabelen én
  zes constanten in `_media-config.mjs`; allebei bewust, allebei nodig. Draai daarna
  `database/filming-consent.sql` in Supabase. De volledige lijst met handelingen staat in
  `operations/filming-weekend-01.md` onder *Steps that still have to be done by hand*.
- **[Blijft blokkeren] Verwerkersovereenkomst met Resend.** Punt 6 hieronder. Geen enkele
  uitnodiging mag de deur uit voordat die getekend en bewaard is. Het script weigert nu al
  te versturen zolang de poort dicht is, maar dit is een aparte, menselijke blokkade.


1. **[Robert, vóór of bij de deploy] Zet `PUBLIC_BOOKING_OPENS_AT` in Netlify.** **Niet
   wachten tot de echte openingsdatum vaststaat** — dan breekt het formulier. De code
   antwoordt met 503 op elke aanvraag voor een vast weekend zolang die variabele ontbreekt.
   Zet er voorlopig een datum in die nog niet verstreken is; dat houdt alles zoals het nu
   werkt en verkopen gaat er niet door open, want de betaalpoort staat los daarvan dicht.
   Verfijnen kan later.

~~1. **[Robert, vóór de deploy] Zet `PUBLIC_BOOKING_OPENS_AT` in Netlify.** Een ISO-tijdstip
   in de toekomst. Zonder die variabele antwoordt het First Access-formulier op de live site
   met 503 zodra deze release erop staat, terwijl privé-aanvragen blijven werken. Zie
   `operations/pre-deploy-2026-08-29.md`.~~

~~22. **[Claude] Voer de volledige pre-deploy eindcontrole uit. Gedaan op 29 augustus.** Controleer alle publieke
   pagina’s en routes, links, formulieren, mobiele layout, media/credits, toegankelijkheid,
   console- en netwerkmeldingen, Netlify Functions, Supabase-aanroepen, rate limits,
   dubbele stoelclaims, Stripe-webhookgedrag en de fail-closed betaalpoort. Draai de
   volledige Node-testsuite en de beschikbare loadtest. Vergelijk de lokale release met
   de live versie en maak een kort overzicht van verschillen en blockers. Herstel alleen
   echte fouten; push of deploy niets en verzin geen juridische gegevens.~~

2. **[Robert, vóór publicatie] Supabase-plan en back-ups.** Een gratis project wordt na
   zeven dagen met weinig activiteit gepauzeerd, en back-ups zijn er niet te downloaden.
   Allebei geverifieerd bij Supabase zelf. Zie het draaiboek. *(Vervangt het oude punt 16
   over de belastingstest; die is gedaan.)*

~~16. **[Claude] Bewijs dat piekverkeer netjes degradeert.** Voeg een lokale, niet-
   destructieve belastingstest toe voor circa 100 gelijktijdige First Access- en
   contactaanvragen. Controleer dat rate limits misbruik afvangen, geldige aanvragen
   geen dubbele stoelclaims maken, fouten als nette 429/503-antwoorden terugkomen en
   de pagina zelf bruikbaar blijft. Documenteer ook welke Netlify/Supabase-limieten en
   alerts Robert vóór publicatie moet instellen. Geen echte productie-aanvragen of
   Stripe-betalingen in deze test.~~ **Gedaan op 29 augustus, zie `tests/load.test.mjs`.**

3. **[Robert] Vul het fiscaal nummer aan in `legal/index.html`, blok `#provider`.** De
   structuur staat er; alleen het NIF/NIE ontbreekt nog, plus straks de toeristische
   registratiecode. Let op: dit komt daarmee in de git-geschiedenis te staan. Dat botst
   met de regel in je `CLAUDE.md` dat er geen persoonsgegevens in de repo horen, maar de
   wet vraagt het nummer publiek. Dat is een bewuste keuze die jij maakt, geen fout.
   Een woonadres is **niet** nodig: gemeente en provincie volstaan en die staan er al.

4. **[Robert] Vul de twee ontbrekende velden in het standaardinformatieformulier in.** Het
   formulier staat er nu, naar de wettekst, in het Engels en het Spaans op
   `/standard-information/`. Het mist alleen nog de insolventiegarantie (verstrekker,
   polisnummer, adres, telefoon) en de bevoegde autoriteit. Beide volgen uit de
   registratieketen. Daarna alsnog langs de gestor voor de echte versie, zoals afgesproken.
   *(Vervangt het oude punt: het formulier ontbrak, nu ontbreken alleen die velden.)*

~~3. **[Robert, met deskundige] Het wettelijke standaardinformatieformulier ontbreekt
   volledig.** Bij een pakketreis moet de reiziger vóór het boeken een formulier met
   gestandaardiseerde informatie krijgen (richtlijn 2015/2302 bijlage I, in Spanje via het
   TRLGDCU). `/travel-information/` kondigt het zelf aan, maar het bestaat nergens. Dit is
   geen tekst die wij erbij bedenken: de inhoud ligt wettelijk vast.~~ **Opgesteld op
   29 augustus, zie het logboek.**

5. **[Robert] Gegevens van de insolventiegarantie in de precontractuele informatie.** Naam
   en volledige contactgegevens van de garantieverstrekker moeten erin. Nu staat er alleen
   dat ze nog volgen.

6. **[Robert] Verwerkersovereenkomst met Resend, of een andere maildienst.** Hun publieke
   privacybeleid noemt geen waarborgmechanisme voor doorgifte naar de Verenigde Staten —
   geen standaardcontractbepalingen, geen Data Privacy Framework. De andere drie
   verwerkers publiceren dat wel. Vermoedelijk staat het in hun verwerkersovereenkomst;
   dat moet je tekenen en bewaren vóór de eerste bevestigingsmail uitgaat. Daarna kan de
   privacyverklaring het mechanisme ook voor Resend noemen.
   *(De clausule zelf is geschreven, zie het logboek.)*

~~5. **[Wie het eerst kan] Doorgifte buiten de EU benoemen in de privacyverklaring.** Nodig
   zodra een verwerker buiten de EER verwerkt. Zoek eerst uit in welke regio de
   Supabase-instantie draait en wat Netlify, Stripe en Resend daarover zeggen. Niets over
   beweren voordat dat vaststaat.~~ **Gedaan op 29 augustus.**

7. **[Robert, extern] Verzekeringen en registratie.** RC- en caución-polis actief,
   RECE0033T06 ingediend, registratiecode binnen. Geen van beide assistenten kan dit.

8. **[Robert, extern] Definitieve klantdocumenten.** Precontractuele reisinformatie,
   boekingscontract, annulerings- en terugbetalingsvoorwaarden, minimumdeelnemers-
   clausule, klachtenprocedure — als definitieve PDF's.

9. **[Wie het eerst kan, na 7 en 8] Vul de bedrijfsgegevens in.** In `/terms/` en
   `/travel-information/` staan nu letterlijk *"To complete before sales"*-blokken:
   volledig adres, fiscaal nummer, telefoonnummer, toeristische registratiecode,
   bevoegde autoriteit en de insolventiegarantieverstrekker.
   **Dit zijn ook precies de laatste inhoudelijke gaten in `/travel-information/`.** Op
   29 augustus is die pagina langs de acht eisen van artikel 153 TRLGDCU gelegd; zeven
   staan er compleet in, en het achtste — handelsnaam, *volledig adres*, telefoon en
   e-mail van de organisator — mist alleen adres en telefoon. Robert moet die aanleveren;
   ze mogen niet uit gevonden documenten worden overgenomen (CLAUDE.md §5.4). Pas daarna mogen
   `PUBLISHED_TERMS_VERSION`, `PUBLISHED_TERMS_DOCUMENT` en
   `PUBLISHED_TRAVEL_DOCUMENT` in `netlify/functions/_booking-config.mjs` gevuld worden.
   Zolang die leeg zijn, is betalen technisch onmogelijk — dat is bewust zo.

10. **[Wie het eerst kan, pas na 3–9] Spaanstalige kopie van de *definitieve*
   reisinformatie.** Codex' waarschuwing blijft gelden: pas vertalen als de juridische
   gaten dicht zijn, anders vertaal je twee keer of gaat een concept per ongeluk als
   definitief gelden.
   **Stand 29 augustus 2026:** er staat nu wél een Spaanse vertaling onder de Engelse tekst
   op `/travel-information/#es`, en `/standard-information/` was al tweetalig. Dat is
   uitdrukkelijk de vertaling van het *concept*: de pagina houdt haar conceptmelding,
   houdt `noindex`, en de openstaande identiteitsvelden staan in beide talen als
   *"Por completar"*. Wijzigt een deskundige straks de Engelse tekst, dan moet de Spaanse
   mee. Dit punt sluit pas als beide talen definitief zijn.
   Bij de Spaanse eindtekst hoort een Nederlandse vertaling voor Robert.

11. **[Concrete vraag aan Robert/Codex, vóór publicatie] Waar komen deze zeven
   illustraties precies vandaan?**
   `tavern-double-doors`, `asturias-mountain-view`, `bear-4x4-mountain-wide`,
   `dice-character-sheet`, `private-campaign-landscape`, `tavern-party-journey-bear` en
   `weekend-01-dark-dice`. Ze staan sinds de lanceercommit in de repo zonder vastgelegde
   herkomst. Gegenereerd? Zeg waarmee en of de voorwaarden commercieel gebruik toestaan.
   Uit een bibliotheek? Noem welke en onder welke licentie. Zet het antwoord in
   `operations/image-credits.md`. **Niets aannemen:** geen Midjourney-, Unsplash- of andere
   herkomst invullen zonder bewijs. Van de twee recent door Robert aangeleverde
   omgevingsfoto's weten we alleen dat het Pexels-downloads zijn; leg daarvan nog de
   exacte bron-URL en licentie vast. Dat gegeven bewijst niets over de zeven illustraties.
   *(Punt 14 en 15 zijn afgerond, zie het logboek.)*

12. **[Open vraag voor Robert] Editie 3 en een kalenderweergave.** De briefing aan Story
   Forge plant drie aaneengesloten weekenden: 30 okt–2 nov, 6–9 nov en **13–16 nov**.
   De site en de seed in `database/first-access.sql` kennen alleen de eerste twee. In
   diezelfde briefing staat wel *"Elke stap gaat pas open als de vorige vol is"*, dus dit
   kan bewust zijn. Robert noemde daarnaast een open kalender voor alle weekenden; daar
   is in deze repo, in het dossier en in zijn eigen documenten niets over te vinden.
   Eerst uitvragen wat dat moet worden, dan pas bouwen. De basis ligt er wel:
   `tavern_weekends` heeft label, datum, capaciteit, volgorde en een `visible`-vlag, en de
   pagina haalt de beschikbaarheid live op.

13. **[Open vraag voor Robert] `noindex` op `/terms/` en `/travel-information/`.** Beide
   staan nu op `noindex, nofollow` omdat ze concept zijn. Dat moet eraf op het moment
   dat ze definitief worden — zet dat niet stilzwijgend om.

## Logboek — nieuwste bovenaan

> Verwijst een ouder item naar een puntnummer uit *Openstaand*, dan gaat dat over de
> nummering van dát moment. De lijst is op 29 augustus 2026 opgeschoond en hernummerd. De
> logboekitems zijn bewust niet aangepast: ze beschrijven wat er toen gold.

### 2026-09-01 · Claude · De drie onafgemaakte verkoopdocumenten staan niet meer online · TE CONTROLEREN

**Startpunt.** Branch `verwijder-dnd-merknaam`, werkmap schoon, bovenste commit `b60b50d`.

**Wat.** `/terms/`, `/travel-information/` en `/standard-information/` zijn dicht. Zes regels
in `_redirects` met een geforceerde 404, drie `Disallow`-regels in `robots.txt`, en de twee
laatste publieke links ernaartoe zijn weg. De bestanden blijven gewoon in de repo staan.

**Waarom het uitroepteken ertoe doet.** Netlify serveert een bestaand bestand vóór een
gewone redirect-regel. Zonder de `!` krijgt de bezoeker de pagina alsnog te zien. Dat ging op
29 augustus 2026 al een keer mis met `HANDOVER.md`, dus alle zes de regels staan als `404!`.
Er staan twee regels per document, `/terms` en `/terms/*`, zodat ook de vorm zonder slash en
`/terms/index.html` eronder vallen.

**Twee vinkjes moesten mee.** `/tavern/book/` en `/tavern/checkout/` lieten de gast
bevestigen: *"I have read the privacy information, legal notice and booking terms"* — met een
link naar `/terms/`. Die route geeft nu 404, en dan kan die bevestiging niet waargemaakt
worden. De tekst is nu: *"I have read the privacy information and the legal notice. I
understand that the full booking terms are provided before any payment is requested."* Dat
klopt met de werkelijkheid: de definitieve voorwaarden gaan mee vóór er betaald wordt.
**Zet die link terug zodra de documenten definitief zijn** — het staat ook als aantekening in
`_redirects` zelf, bij de regels die je dan weghaalt.

**Wat er niét veranderd is.** De betaalpoort en de mediapoort. `paymentsAreEnabled()` hangt
aan `PUBLISHED_TERMS_VERSION`, `PUBLISHED_TERMS_DOCUMENT` en `PUBLISHED_TRAVEL_DOCUMENT` in
`netlify/functions/_booking-config.mjs`, en die drie staan nog steeds leeg. Het blokkeren van
de routes staat daar helemaal los van: de verkoop was al dicht en is dat nog steeds. Een test
bewaakt allebei.

**De inhoud is bewaard.** Blokkeren is niet weggooien. De drie `index.html`-bestanden staan
er ongewijzigd, inclusief de Spaanse vertaling in `/travel-information/`, en een test
controleert dat ze niet leeg raken. De onderlinge links tússen de drie blijven ook staan —
die wijzen naar bestanden die niemand krijgt uitgeleverd, dus dat kan geen kwaad, en het
scheelt straks werk als ze weer opengaan.

**Vier nieuwe tests.** Dat elk van de drie een geforceerde `404!` heeft voor zowel `/naam` als
`/naam/*`, in `robots.txt` staat en niet in de sitemap voorkomt · dat geen enkele pagina die
wél wordt uitgeleverd ernaartoe linkt · dat de twee vinkjes niet meer beloven dat de gast iets
gelezen heeft wat 404 geeft · en dat de inhoud van de drie bestanden bewaard blijft.

**Getest tegen zeven bewuste breuken:** een regel weggehaald, het uitroepteken weggehaald,
de robots-regel weggehaald, een geblokkeerde route in de sitemap gezet, een levende pagina
laten linken naar `/terms/`, het vinkje weer laten verwijzen naar de dichte route, en de
inhoud van een geblokkeerd document uitgehold. **Zeven van de zeven betrapt**, daarna alles
teruggezet en gecontroleerd met `git status`.

**Hoe te controleren.** `node --test tests/*.test.mjs` → **148 tests, 0 fouten** (was 145).

**Niet geverifieerd, en dit is de enige echte onzekerheid.** Ik kan de 404 hier niet aantonen.
`python3 -m http.server` kent `_redirects` niet en serveert de bestanden gewoon; alleen
Netlify voert die regels uit. Wat ik wél heb: dezelfde regelvorm werkt aantoonbaar live voor
`/operations/*`, `HANDOVER.md`, `AGENTS.md` en `CLAUDE.md` — dat is op 29 augustus met `curl`
op de echte site nagemeten en staat verderop in dit logboek. **Robert of Codex: controleer na
de eerstvolgende deploy met `curl -I https://lewos.co/terms/` dat er een 404 terugkomt, en
kijk in het Netlify-deploylog of er geen waarschuwing over `_redirects` staat.** Ik heb daar
namelijk ook commentaarregels met `#` toegevoegd; Netlify ondersteunt die, maar dat heb ik
niet zelf kunnen zien.

**Wat nu volgt.** Onveranderd: de ANBEN-gegevens, de Spaanse jurist, en daarna pas deze zes
regels uit `_redirects` halen én de link naar `/terms/` terugzetten in de twee vinkjes.

### 2026-09-01 · Claude · De overeenkomst is een afgemaakt document geworden · TE CONTROLEREN

**Startpunt.** Branch `verwijder-dnd-merknaam`, werkmap schoon, bovenste commit `fb0c685`.

**Wat Robert vroeg.** De klant ziet nooit onze interne opmerkingen. Geen conceptmelding,
geen invulhaakje, geen aankondiging dat er nog een jurist meekijkt. De Filming & Media
Agreement moet publiek af zijn; alles wat nog open staat hoort in dit dossier, in
`operations/filming-weekend-01.md` en in de configuratiepoort — nergens anders.

**Wat er publiek veranderd is.** `/tavern/filming-agreement/` is nu een afgemaakt document.
Conceptbanner weg, titel en omschrijving zonder "draft", alle acht `to be inserted`-haakjes
weg, de regel "For legal review" weg, en de zin over de nog te bevestigen werkregels weg.
Ingevuld met wat Robert heeft aangeleverd: **AEPD** als toezichthouder met een link naar
aepd.es, **lewos.co@gmail.com** als privacycontact, de volledige kanalenlijst (Lewos-site,
StoryForgers-site, organische sociale media, nieuwsbrieven, PR en redactie, promotiefilms en
trailers, en betaalde Meta-, Google- en TikTok-advertenties alléén via de aparte optionele
toestemming), en de bewaartermijn in de vastgestelde bewoording. Ook `/legal/#filming` is
opgeschoond: die zin vertelde de klant dat de tekst nog in voorbereiding was.

**Geen ANBEN-gegevens verzonnen.** Fiscaal nummer, adres, telefoon, registratiecode en
garantiegegevens staan er niet in en zijn niet bedacht. De verwerkingsverantwoordelijke
staat er wél: Lewos, handelsnaam van Robert Neugebauer, gevestigd in het concejo Parres,
Asturië, met een werkend contactadres. Dat is genoeg voor een toestemmingspagina. De
officiële verkoopdocumenten en de betaalpoort blijven dicht tot die gegevens er zijn.

**De poort is niet aangeraakt en de melding is neutraal geworden.** De 503 zei letterlijk
dat de overeenkomst nog concept was en waarom. Dat is precies wat een gast niet hoeft te
weten. Nu: *"This agreement cannot be opened at the moment. Please contact Robert at
lewos.co@gmail.com."* Welke instelling ontbreekt gaat naar het serverlog. Ook nieuw: het
formulierpaneel staat standaard `hidden` en komt pas tevoorschijn als de server zegt dat
de link geldig is. Wie de pagina zonder link opent leest alleen de tekst — geen half
formulier, geen uitgegrijsde velden.

**Wat ik NIET gedaan heb, en waarom dat een beslissing van jou is.** Drie pagina's dragen
nog wél interne woorden: `/standard-information/`, `/terms/` en `/travel-information/`. Die
zijn echt niet af — ze missen precies de ANBEN-gegevens die ik niet mag verzinnen — en de
melding dat ze niet gelden is daar het eerlijke, niet het slordige. Ze onzichtbaar maken was
mijn keuze niet: het haalt drie juridische documenten van de site die vanuit de checkout
gelinkt worden. Wat ik wél heb gedaan is aantonen dat ze binnen de gesloten verkoopweg
liggen: **niets in de open klantroute linkt ernaartoe**, alleen `/tavern/book/` en
`/tavern/checkout/` doen dat, en die zitten achter de dichte betaalpoort. Een test bewaakt
dat nu, dus de dag dat iets uit de open route ernaartoe linkt, valt de suite om.
**Robert: wil je ze liever helemaal onbereikbaar? Dat is één regel in `_redirects`. Zeg het.**

**Vier dingen die nu publieke beloftes zijn.** Ze stonden er eerst als "nog te bevestigen".
Nu staan ze er gewoon, en een gast kan ons eraan houden: camera's gaan periodiek uit · je
mag vragen de camera te stoppen bij een persoonlijk gesprek · maaltijden worden selectief
gefilmd · privégesprekken worden niet gepubliceerd, ook niet als ze zijn opgenomen. Ze staan
voluit in `operations/filming-weekend-01.md` onder *What the public text now promises*.
Klopt er één niet, dan moet hij van de pagina af.

**De deelnemerflow is nagelopen en ongewijzigd.** Eén unieke link per volwassene · alleen de
tokenhash in de database · geen gegevens van andere deelnemers · eerst ontdubbelen, dan
tellen · alleen unieke deelnemers tegen `party_size` · Weekend 02 kan er niet in ·
advertentietoestemming apart en nullable · intrekken laat een spoor na · een nieuwe versie
vraagt opnieuw akkoord. Alle bestaande tests daarvoor draaien nog en blijven groen.

**Nieuwe tests (vijf).** Eén die over élke publieke pagina de zichtbare tekst leest — titel,
zoekomschrijving en paginatekst, zonder stijlblokken en zonder klassenamen, met
HTML-entiteiten omgezet zoals een lezer ze ziet — en daar de verboden woorden in weigert.
Eén die bewaakt dat de drie onafgemaakte verkoopdocumenten binnen de gesloten weg blijven.
Eén die controleert dat de overeenkomst inhoudelijk af is: AEPD, privacycontact, de zeven
kanalen en de bewaartermijn woord voor woord. Eén die eist dat het formulier verborgen blijft
tot de server groen licht geeft. En één die het 503-antwoord natrekt op lekken: geen enkele
blokkade uit `mediaConsentBlockers()` mag erin voorkomen.

**Twee valkuilen die ik onderweg gevonden heb.** `todo` staat in de Spaanse tekst van
`/travel-information/` ("durante todo el fin de semana"), dus de test op `TODO` is
hoofdlettergevoelig — anders zou hij een correcte Spaanse zin afkeuren. En `class="draft"`
is geen zin die iemand leest, dus de test kijkt naar zichtbare tekst en niet naar de HTML.
Die klasse heet nu trouwens `callout`.

**De tests zijn zelf getest.** Zes bewuste breuken: een conceptwoord in de klanttekst, een
`TODO` in de juridische pagina, de toezichthouder eruit, de bewaartermijn afgezwakt, het
formulier zichtbaar zonder link, en een link vanuit de open route naar een onafgemaakt
verkoopdocument. **Zes van de zes betrapt**, daarna alles teruggezet en gecontroleerd.

**Hoe te controleren.** `node --test tests/*.test.mjs` → **145 tests, 0 fouten** (was 140).
In de browser nagelopen: het formulierpaneel is verborgen, nul zichtbare invoervelden,
`noindex, nofollow`, geen console-fouten, en de pagina leest van boven tot onder als een af
document.

**Niet geverifieerd.** De juridische kwaliteit van de tekst. Ik heb geschreven wat er
inhoudelijk hoort te staan en wat Robert heeft aangeleverd, maar of dit onder Spaans recht
standhoudt weet een jurist en niet ik. Dat staat nu alleen nog intern, zoals gevraagd. Verder
is er niets gedraaid tegen Supabase, niets gepusht en niets gedeployed.

**Wat nu volgt.** Robert: de vier beloftes nakijken, de vraag over de drie verkoopdocumenten
beantwoorden, en de ANBEN-gegevens aanleveren. De mediapoort en de betaalpoort staan allebei
nog dicht en zijn in deze ronde niet aangeraakt.

### 2026-09-01 · Claude · Een dubbele deelnemer kostte een stoel — hersteld · TE CONTROLEREN

**Startpunt.** Branch `verwijder-dnd-merknaam`, werkmap schoon, bovenste commit `3dc867c`.

**Wat Codex vond.** Op een tijdelijke Supabase-ontwikkelbranch (PostgreSQL 17.6) kon de
migratie worden toegepast, en RLS en functierechten kwamen goed aan. Eén integratieproef
faalde, op een echte logische fout: `register_tavern_media_participants` telde
`jsonb_array_length(p_participants)` vóórdat er ontdubbeld werd. Twee unieke gasten met één
dubbele regel werden daardoor geweigerd als `too_many_participants`. De branch is daarna
verwijderd; productie, betaalpoort en mediaflow zijn niet aangeraakt.

**Wat ik heb veranderd.** De volgorde in die functie is nu: eerst valideren, dan tellen,
dan invoegen.
- **Valideren eerst.** Een onbruikbare naam of een onbruikbaar adres komt er nu uit als
  invoerfout, niet als een verhaal over te veel deelnemers.
- **Ontdubbelen vóór tellen.** Er wordt geteld op `select distinct lower(trim(email))`, dus
  twee keer hetzelfde adres is één gast en kost één stoel.
- **De grens blijft.** Meer unieke gasten dan `party_size` wordt nog steeds geweigerd, en
  een geweigerde aanroep plaatst niemand.

**Een tweede gat in dezelfde regel, dat de proef van Codex niet raakte.** De oude controle
keek alléén naar de meegestuurde lijst en nooit naar wat er al geregistreerd stond. Twee
aanroepen met elk zes verschillende adressen hadden dus twaalf deelnemers op zes stoelen
gezet. De telling is nu `al_geplaatst + nog_te_plaatsen > party_size`. Ik heb dat meegenomen
omdat ik precies die regel toch aan het herschrijven was.

**De vier gevallen, met de hand nagelopen op de nieuwe logica:**

| geval | party_size | uitkomst |
| --- | --- | --- |
| twee unieke gasten, één dubbele regel | 2 | `registered`, `added: 2` |
| drie unieke gasten | 2 | `too_many_participants`, niets geplaatst |
| tweede aanroep met een nieuw adres terwijl het vol is | 2 | `too_many_participants` |
| dezelfde lijst nog een keer insturen | 2 | `registered`, `added: 0` |

**Tests.** `tests/database-integration.sql` dekt alle vier de gevallen met eigen foutmeldingen
per geval, zodat een volgende run meteen zegt wélke regel brak — de bestaande proef die bij
Codex faalde controleerde alleen het aantal rijen en niet de teruggegeven status. In
`tests/media-database.test.mjs` staan twee statische regressietests bij: één die de vorm van
de telling bewaakt (geen `jsonb_array_length` meer, wél `distinct`, wél `al_geplaatst`
meegeteld, en de volgorde valideren → tellen → invoegen), en één die controleert dát die vier
gevallen in het integratiebestand staan en dat er een `rollback` omheen zit.

**Die tests zijn zelf getest.** Zeven bewuste breuken aangebracht — oude lengtecheck terug,
`distinct` weggehaald, al geplaatste gasten niet meegeteld, de grens helemaal weg, de
volgorde omgedraaid, een integratiegeval weggehaald, en de `rollback` vervangen door een
`commit`. **Zeven van de zeven betrapt.** Daarna beide bestanden byte-voor-byte teruggezet
en dat met `diff` gecontroleerd.

**Hoe te controleren.** `node --test tests/*.test.mjs` → **140 tests, 0 fouten** (was 138).
Alle JS door `node --check`.

**Niet geverifieerd.** Ik heb de SQL niet gedraaid: er staat geen PostgreSQL op deze Mac. De
tabel hierboven is een handmatige trace door de nieuwe code, geen meting. **Codex: het echte
bewijs moet weer van jou komen.** De vier gevallen staan klaar onderaan
`tests/database-integration.sql`, met verzonnen gegevens en een `rollback` eromheen.

**Ongewijzigd:** de betaalpoort, de mediaschakelaar, de rechten en RLS. Alle elf functies
staan nog op `set search_path=''` met volledig gekwalificeerde verwijzingen; de statische
poortwachters daarvoor draaien nog steeds mee en blijven groen.

**Wat nu volgt.** Codex: opnieuw een wegwerpbranch, migratie plus rollback-integratietests.
Robert: `database/first-access.sql` heeft nog steeds hetzelfde search_path-probleem
(vijftien functies, ~55 onbekwalificeerde verwijzingen); dat wacht op jouw akkoord.

### 2026-09-01 · Claude · Lege search_path op de mediafuncties, na Codex' bevinding · TE CONTROLEREN

**Startpunt.** Branch `verwijder-dnd-merknaam`, werkmap schoon, bovenste commit `eb00a0c`,
`origin/main` nog steeds `9013051`.

**Codex had gelijk, en het is geen schoonheidsfoutje.** Alle tien `security definer`-functies
in `database/filming-consent.sql` draaiden met `set search_path=public`. Zo'n functie draait
met de rechten van zijn eigenaar, maar de aanroeper bepaalt nog steeds wat `public` betekent:
wie zijn eigen schema ervóór zet, laat zijn eigen tabel of functie uitvoeren met andermans
rechten. Dat is een rechtenlek, geen stijlkwestie.

**Wat er veranderd is.** Alle elf functies staan nu op `set search_path=''` — de tien
definers plus `tavern_media_agreement_required`, die er nog helemaal geen had; de
Supabase-linter (`function_search_path_mutable`) wil hem op élke functie. Daarbij zijn
**47 verwijzingen** volledig gekwalificeerd, verdeeld over: `register_tavern_media_participants`
(6), `issue_tavern_media_invitation` (5), `mark_tavern_media_invitation_sent` (1),
`revoke_tavern_media_invitation` (1), `get_tavern_media_agreement_state` (6),
`record_tavern_media_consent` (11), `withdraw_tavern_media_consent` (5),
`get_tavern_media_progress` (7), `private.cleanup_tavern_media_invitations` (2) en
`private.purge_tavern_media_records` (3). Ook de zestien `%rowtype`-declaraties: die worden
net zo goed via de search_path opgezocht en zouden er even hard op stuklopen.

**Twee dingen die ik onderweg tegenkwam en heb rechtgezet.**
1. `purge_tavern_media_records` gebruikte de doeltabel óók als kolomkwalificatie
   (`... where participant_id=tavern_media_participants.id`). Met een gekwalificeerde
   `delete from public.…` wordt dat dubbelzinnig, dus die query heeft nu een eigen alias.
2. De audit-referentie stond op `encode(gen_random_bytes(12),'hex')`. `gen_random_bytes`
   komt uit pgcrypto, en Supabase zet die extensie in het schema `extensions` — niet te
   vinden vanuit een functie met een lege search_path. Het is nu
   `replace(gen_random_uuid()::text,'-','')`; `gen_random_uuid()` zit sinds PostgreSQL 13 in
   de kern. Daarmee leunt de hele migratie nergens meer op een extensie. Let op: dit
   verandert de vorm van `audit_reference` van 24 naar 32 hextekens. Er staat nog nergens
   data, dus dat kan nu nog kosteloos.

Ook toegevoegd: `create schema if not exists private;` met dezelfde `revoke` als in
`first-access.sql`. Het bestand zei al "draai dit ná first-access.sql", maar zonder die
regels faalt het stilletjes als iemand het toch als eerste draait. Allebei idempotent.

**Rechten en RLS nagelopen, niets aan veranderd.** Elf functies, elf `revoke`s van `public`,
`anon` en `authenticated`. Negen publieke functies, negen `grant execute` en alle negen
alleen naar `service_role`. De twee `private.`-functies krijgen van niemand uitvoerrecht.
RLS staat aan op alle drie de mediatabellen, er is geen enkele policy, en de tabelrechten
zijn ook los ingetrokken. Dat was al zo en is zo gebleven.

**Nieuwe statische regressietests:** `tests/media-database.test.mjs`, twaalf stuks. Lege
search_path op élke functie · geen kale verwijzing in een functiebody · gekwalificeerde
`%rowtype` · geen afhankelijkheid buiten `pg_catalog` · de exacte `revoke` per functie ·
`service_role` als enige begunstigde · geen grant op de `private.`-functies · RLS aan zonder
policy · en dat deze migratie de betaalpoort en de mediaschakelaar niet aanraakt.

**Die tests zijn zelf ook getest.** Statische tests kunnen makkelijk stilletjes over nul
gevallen lopen, dus ik heb twaalf bewuste breuken in de migratie aangebracht en gekeken of
ze allemaal opvallen: search_path terug naar `public`, search_path helemaal weg, een tabel
ontkwalificeerd, een `%rowtype` ontkwalificeerd, een functieaanroep ontkwalificeerd, een
grant naar `authenticated`, een grant op een `private.`-functie, een `revoke` weggehaald,
RLS uit, een policy erbij, pgcrypto terug, en een nieuwe functie zónder search_path.
**Twaalf van de twaalf betrapt.** Daarna de migratie byte-voor-byte teruggezet en dat
gecontroleerd met `diff`.

Eén ding kwam daarbij aan het licht: mijn eigen toelichtingen in de SQL noemen `search_path=public`
en `gen_random_bytes` juist omdát ze fout zijn, en daar sloegen de tests op aan. De tests
strippen nu eerst alle `--`-regels, en er is een test bij die controleert dát dat strippen
de SQL zelf niet weghaalt — anders zou de hele set stilletjes waardeloos worden.

**PostgreSQL 17.6.** Nagelopen, niet gedraaid: er staat geen PostgreSQL op deze Mac. Elke
aangeroepen functie zit in `pg_catalog` (`jsonb_build_object`, `make_interval`, `clock_timestamp`,
`char_length`, `coalesce`, `count`, `greatest`, `least`, `nullif`, `replace`, `trim`, `lower`,
`gen_random_uuid`, de `jsonb_*`-familie) en `pg_catalog` wordt altijd impliciet doorzocht,
ook met een lege search_path — net als de operatoren `->>`, `!~` en `||`. Gebruikte typen:
`uuid`, `text`, `jsonb`, `boolean`, `timestamptz`, `integer`, `interval`. De nieuwste
constructie in het bestand is `gen_random_uuid()` in de kern (13); verder niets van na 9.6.
Geen enkele constructie die in 17 vervallen of gewijzigd is.

**Hoe te controleren.** `node --test tests/*.test.mjs` → **138 tests, 0 fouten**
(was 126; nieuw: 12 in `tests/media-database.test.mjs`). Drie verouderde tekstasserties in
`tests/media-consent.test.mjs` zijn meegetrokken omdat de SQL nu gekwalificeerd is.

**Niet geverifieerd.** De migratie is niet gedraaid — geen PostgreSQL hier, en zeker niet
tegen productie. Alles hierboven volgt uit lezen en statisch controleren. **Codex: dit is
precies jouw stuk.** De integratieproeven staan onderaan `tests/database-integration.sql`.

**Wat ik gevonden heb en bewust heb laten liggen.** `database/first-access.sql` heeft exact
hetzelfde probleem: **vijftien** `security definer`-functies op `set search_path=public`, met
ongeveer **55** onbekwalificeerde verwijzingen. Dat is de boekings- en betaalmigratie, hij
draait al in productie, en de opdracht was uitdrukkelijk om aan de betaalpoort niets te
veranderen. Ik heb hem daarom niet aangeraakt. Hij verdient dezelfde behandeling in een
eigen ronde, met een eigen integratierun. **Robert: zeg het als je wil dat ik dat oppak.**

**Wat nu volgt.** Codex maakt een tijdelijke Supabase-ontwikkelbranch, draait de migratie en
de rollback-integratietests, en gooit de branch daarna weg. Aan de betaalpoort en de
mediaschakelaar is niets veranderd; allebei staan ze nog dicht.

### 2026-09-01 · Claude · De vastlopende testsuite: gevonden, begrensd, en één echte bug eronder · TE CONTROLEREN

**Startpunt.** Branch `verwijder-dnd-merknaam`, werkmap schoon, bovenste commit `4722de7`.
`origin/main` nog steeds `9013051`.

**Wat er aan de hand was.** `node --test tests/media-consent.test.mjs` bleef staan met
*"Promise resolution is still pending but the event loop has already resolved"*. Op commando
kreeg ik het niet na te bootsen: tien achtereenvolgende runs van het onveranderde bestand
liepen alle tien schoon door. Maar het gebeurt wél. Halverwege het onderzoek vond ik op deze
Mac twee vastgelopen runs die er op dat moment nog stonden — gestart om 13:54 en 13:56,
twintig minuten later nog altijd actief, met `--test-timeout=0` dus zonder dat er ooit iets
zou ingrijpen. Die twee heb ik onderzocht en daarna afgeschoten.

**Wat die vastgelopen processen lieten zien.** De worker hing in `kevent`, dus de
gebeurtenislus leefde nog en wachtte op een handle. En, doorslaggevend: `lsof` liet **geen
enkele open TCP-socket** zien. Geen server, geen verbinding — alleen de pijpen naar het
ouderproces. De server was dus al netjes weg, en wat er nog hing was een belofte die nooit
meer zou aflopen. In het oude `after()` was er precies één onbegrensde belofte:

    after(async()=>{ ...; server.closeAllConnections?.(); await new Promise(resolve=>server.close(resolve)); });

`server.close(cb)` roept zijn callback pas als élke verbinding weg is. Komt die callback
niet, dan lost die belofte nooit op, is de test allang klaar en eindigt het proces niet.
Dat past exact op wat ik in die twee processen zag.

**Wat ik daaraan gedaan heb.** Nieuw bestand `tests/_test-server.mjs` met
`listenOnTestPort()` en `stopTestServer()`. Dat patroon stond vijf keer los in de suite —
`checkout`, `first-access`, `first-access-invitations`, `load` en `media-consent` — dus het
hoorde op één plek. Twee dingen zijn erbij gekomen: de server wordt ge-`unref`'t zodat hij
de gebeurtenislus nooit kan openhouden, en het sluiten heeft een harde bovengrens van een
seconde. Loopt het sluiten vast, dan kappen we de verbindingen alsnog af en gaan we door.
`server.listen` vangt nu ook zijn eigen fout af, want ook dáár lost een mislukking anders
nooit op. Ik heb geen verklaring voor waaróm die callback soms wegblijft; ik heb er een
grens omheen gezet. Dat is het eerlijke antwoord.

**En de echte bug die eronder zat.** De snelheidsbegrenzer in `media-consent.mjs` stond niet
in een `try/catch`, anders dan in `create-checkout-session.mjs` en `first-access.mjs`. Viel
Supabase weg, dan gooide de handler in plaats van te antwoorden: in productie een 500 zonder
uitleg, in een test een afgewezen belofte. Nagemeten met een mockserver die 500 teruggeeft —
vóór de fix `HANDLER GOOIDE IN PLAATS VAN TE ANTWOORDEN`, erna een nette
`503 media_consent_unavailable`. Ook `Promise.all` is `Promise.allSettled` geworden: met
`all` keert de functie terug zodra de eerste aanroep afketst terwijl de tweede nog onderweg
is, en dat verzoek loopt dan door nadat het antwoord al weg is — in een test nadat de test
al klaar is, met een socket die nog openstaat terwijl de mockserver afsluit.

**Twee dingen waar ik naast zat, en die ik heb rechtgezet.** Ik schreef eerst dat `Promise.all`
de afwijzing van de tweede aanroep laat zweven. Dat klopt niet: `Promise.all` abonneert zich
op allebei, dus daar ontstaat geen onafgehandelde rejection. De echte reden is die
nalopende aanroep hierboven. En ik schreef eerst dat de oude `after()` aantoonbaar hing op
een openstaande keep-alive verbinding; nagemeten op Node 24.20 komt die callback juist wél.
Beide commentaren staan nu zoals het gemeten is.

**Hoe te controleren.**
- `node --test tests/media-consent.test.mjs` → 25 tests, vijf keer achter elkaar schoon.
- `node --test tests/*.test.mjs` → **126 tests, 0 fouten**, klaar in een seconde.
- Elk testbestand ook los gedraaid met een probe op `process.getActiveResourcesInfo()`:
  alle acht eindigen met alleen `PipeWrap` (stdout/stderr) open. Geen server, geen socket,
  geen timer blijft achter. Nul waarschuwingen over hangende beloftes.
- `pgrep -fl "node --test"` na afloop: leeg.
- Losse proef voor de begrenzer: mockserver die 500 geeft → 503 in plaats van een throw.

**Niet geverifieerd.** Ik kan niet aantonen dát de nieuwe vorm nooit meer hangt — alleen dat
hij het niet meer kán, omdat elke wachtende belofte nu een bovengrens heeft. Er is nog steeds
geen Supabase, geen Stripe en geen PostgreSQL aangeraakt.

**Iets wat ik gevonden heb en bewust heb laten liggen.** Met
`--experimental-test-isolation=none` (alles in één proces) faalt de suite: 56 van de 126.
Dat is niet nieuw en niet van deze ronde — op `4722de7` was het 55 van de 124, gemeten in een
losse worktree. De oorzaak is dat alle vijf de serverbestanden hun `before`/`beforeEach` op
bestandsniveau zetten; in die modus gelden die hooks voor élk testbestand, en dan wijzen
`globalThis.fetch` en `SUPABASE_URL` van het ene bestand naar de mockserver van het andere.
De nette oplossing is elk bestand in een `describe()` zetten. Dat is puur inspringen, maar
het raakt vijf bestanden over hun volle lengte, en `CLAUDE.md` zegt geen grote
herstructureringen zonder overleg. **Robert: zeg het als je wil dat ik dat doe.** Met de
standaardinstelling draait elk bestand in zijn eigen proces en speelt het niet.

**Wat nu volgt.** Codex: de begrenzer-fix en de bovengrens in `stopTestServer` nakijken —
en als je een verklaring hebt voor die wegblijvende `close`-callback, hoor ik het graag.
Voor de rest verandert er niets aan de stand: de mediapoort staat nog dicht, de betaalpoort
ook, en de juridische review blijft de blokkade.

### 2026-09-01 · Claude · Persoonlijke toestemmingsflow gebouwd, en op slot gezet · TE CONTROLEREN

**Startpunt gecontroleerd.** Branch `verwijder-dnd-merknaam`, werkmap schoon, `origin/main`
nog steeds `9013051`. Bovenste commits: `49310f0` (Robert, Weekend 02-beleid) en `b48669b`
(de gefilmde editie). Robert heeft de Weekend 02-vraag beantwoord en mijn test omgedraaid;
die vraag is uit het postvak bovenaan gehaald.

**Wat.** De flow uit het draaiboek is nu echt gebouwd, en staat op slot.
Nieuw: `netlify/functions/_media-config.mjs`, `netlify/functions/media-consent.mjs`,
`database/filming-consent.sql`, `scripts/issue-media-agreements.mjs`,
`tavern/filming-agreement/media-agreement.js`, `tests/media-consent.test.mjs`.
Gewijzigd: `tavern/filming-agreement/index.html`, `_redirects`, `tests/filming.test.mjs`,
`tests/database-integration.sql`, `operations/filming-weekend-01.md`.

**De poort, en waarom er twee sloten zijn.** `_media-config.mjs` heeft zes constanten die
leeg de deur uit gaan, en zeven Netlify-instellingen ernaast. De code vullen doet niets
zonder de instellingen, en de instellingen zetten doet niets zonder de code. Ontbreekt er
één, dan is `mediaConsentIsEnabled()` onwaar en zegt `mediaConsentBlockers()` precies wélke.
Er is geen pad dat er stilzwijgend langs gaat. En zoals bij de betaalpoort: `NODE_ENV=test`
is waardeloos zodra `URL` geen localhost is, dus testfixtures kunnen dit op een publieke
deploy niet opengooien.

**Deze poort staat los van de betaalpoort.** Geen gedeelde code, geen gedeelde variabele.
`media-consent.mjs` noemt Stripe niet en `create-checkout-session.mjs` kent
`_media-config.mjs` niet; een test bewaakt dat allebei. De drie betaalconstanten staan nog
even leeg als gisteren.

**Wat er in de database bij komt.** Drie tabellen — `tavern_media_agreements` (versie,
documentreferentie, hash van de exacte tekst, review-referentie),
`tavern_media_participants` (naam, e-mail, tokenhash, vervaldatum, status) en
`tavern_media_consents` (versie, teksthash, kern-toestemming, aparte advertentiekeuze,
audit-referentie, intrekkingstijd) — plus twee kolommen op `tavern_seat_claims` voor de
voortgangslink van de hoofdboeker. RLS aan, geen policy, alles `revoke`d en alleen
`service_role` mag de functies aanroepen. Dat is dezelfde vorm als de bestaande tabellen.

**De keuzes die ik gemaakt heb en die je moet nakijken.**
- *Weekend 02 kan hier niet in terechtkomen.* `tavern_media_agreement_required()` geeft
  alleen bij `weekend-01` waar terug, en élke ingang controleert dat opnieuw. Dat staat in
  de database en niet alleen in het formulier, want een formulier is te omzeilen.
- *De eenmalige Weekend 02-toestemming voor één foto heb ik bewust niet gebouwd.* Dat is
  iets anders: specifiek, in het moment, over één beeld. Dat in een versie-gebonden
  blanket-flow persen laat het lijken op dezelfde toestemming. Verdient een eigen klein
  formulier wanneer je het wil.
- *Beeld en stem zijn één vinkje geworden* in plaats van twee. Ze zijn in de praktijk niet
  te scheiden en de database legt er één beslissing over vast. Het vakje leeg laten is een
  echte, vastgelegde weigering — geen ontbrekend antwoord.
- *Advertentietoestemming is nullable.* `null` betekent "niet beantwoord", `false` betekent
  "gevraagd en geweigerd". Allebei geven geen toestemming; publiceren mag alleen bij
  `is true`. Zo blijft het verschil zichtbaar zonder dat een leeg vakje ooit als ja telt.
- *Versie en teksthash komen van de server, nooit uit het verzoek.* Een client kan dus niet
  beweren dat hij een oudere of andere tekst tekende.

**De conceptpagina is een concept gebleven.** `noindex, nofollow`, conceptmelding, niet in
de navigatie, `<form>` zonder `action` en zonder `method`, alle velden `disabled` in de HTML
zelf en de verstuurknop `hidden`. Er staat nu wel een script op, maar dat zet niets aan
zolang de server geen 200 geeft — en dat doet hij pas als de poort open is. In de browser
nagelopen: klikken op een vinkje verandert het niet, en met een `?token=` erachter blijft
alles uit met de melding dat er niets is vastgelegd.

**Hoe te controleren.**
- `node --test tests/*.test.mjs` → 124 tests, 0 fouten (was 101; 23 nieuw in
  `tests/media-consent.test.mjs`, plus de aangescherpte conceptpagina-test).
- `node --check` op alle nieuwe JS-bestanden.
- `node scripts/issue-media-agreements.mjs` → weigert, somt de zeven blokkades op, exit 1.
- Statische controle op de SQL: alle `$$` in paren, elf functies, elf `revoke`s, negen
  `grant`s naar `service_role` (de twee `private.`-functies krijgen er terecht geen).
- Lokale preview vanuit `/private/tmp`: zes invoervelden, alle zes `:disabled`, geen enkel
  vinkje aan, geen horizontale scroll op 390px, één script, één formulier.
- Met een gestubde API in de browser: de velden gaan aan, de naam wordt ingevuld, en het
  verzoek dat eruit gaat bevat alleen `{token, standardUse, paidAdvertising}` — geen versie,
  geen hash, geen gegevens van anderen.

**Niet geverifieerd — en dit is de belangrijkste regel van dit item.** Er staat geen
PostgreSQL op deze Mac (`psql` ontbreekt), dus `database/filming-consent.sql` is **niet
gedraaid**. Niet lokaal, en zeker niet tegen productie. Alles wat ik over het gedrag van de
SQL zeg volgt uit het lezen van de code en uit statische controles, niet uit een proef.
De integratieproeven die dat wél kunnen aantonen staan klaar onderaan
`tests/database-integration.sql`, met verzonnen gegevens en een `rollback` eromheen:
Weekend 02 komt er niet in · dezelfde deelnemer twee keer levert één rij · dezelfde tokenhash
past niet bij twee deelnemers · een lege keuze wordt geweigerd · een afwijkende teksthash
wordt geweigerd · een tweede inzending geeft dezelfde audit-referentie · een nieuwe versie
vraagt opnieuw akkoord · de teller lekt geen gegevens · intrekken wist niets · een verlopen
of ingetrokken link doet niets meer. **Codex: dit is precies het stuk dat ik niet kan doen
en jij wel.** Draai het in een testproject, nooit in productie.
Ook niet gedaan: geen Supabase-aanroep, geen Resend-verzending, geen migratie, geen
Netlify-variabele aangeraakt, niets gepusht.

**Wat nu volgt.** Robert: de juridische review en de ontbrekende gegevens blijven de
blokkade; daarna de handelingen in `operations/filming-weekend-01.md` onder *Steps that
still have to be done by hand*. De verwerkersovereenkomst met Resend blijft een aparte,
menselijke blokkade vóór de eerste uitnodiging. Codex: de SQL-integratieproef, en een blik
op de vijf keuzes hierboven — die zijn van mij en ik kan ze niet zelf goedkeuren.

### 2026-09-01 · Claude · Weekend 01 als gefilmde First Edition, en toestemming weg bij de kassa · TE CONTROLEREN

**Wat.** Weekend 01 heet nu overal *The Filmed First Edition*, en de tekst zegt vóór het
betaalmoment wat er gefilmd wordt, waar het terechtkomt en dat elke gast zelf tekent.
Gewijzigd: `tavern/index.html` (weekendkaart, de know-card en het FAQ-antwoord *Will I be
filmed?*), `legal/index.html` (het blok `#filming` helemaal herschreven),
`tavern/book/index.html` + `booking.js`, `tavern/checkout/index.html` + `checkout.js`,
`netlify/functions/create-checkout-session.mjs`, `_redirects`, `robots.txt`. Nieuw:
`tavern/filming-agreement/index.html` (concept), `operations/filming-weekend-01.md`,
`tests/filming.test.mjs`. `tests/checkout.test.mjs` meegetrokken.

**Waarom.** De site zei alleen *"We'll be filming the opening weekend"*. Dat is te weinig
voor iemand die €2.025 uitgeeft: hij hoort te weten dat hij herkenbaar in promotiemateriaal
kan komen vóórdat hij een bindende keuze maakt. En het vinkje dat er stond was een
toestemming, gegeven op het betaalscherm, zonder versienummer, zonder bewijs en zonder
ontvangstbevestiging. Zo'n vinkje houdt geen stand, en de betaler kan het sowieso niet
namens de rest van zijn gezelschap geven.

**De inhoudelijke keuze die je moet nakijken.** De checkout vraagt geen filmtoestemming
meer. Wat er nu staat is een verplichte, niet vooraf aangevinkte *bevestiging*: "ik weet dat
Weekend 01 de gefilmde First Edition is en dat iedere deelnemer zelf de overeenkomst
invult". `p_filming_consent` krijgt vanaf nu altijd `false` mee vanuit beide checkoutpaden,
ook als een client zelf `filmingConsent:true` stuurt. De eigenlijke toestemming verhuist
naar de persoonlijke overeenkomst. `filming_consent_at` in de database blijft daardoor leeg
tot die flow bestaat — dat is bedoeld, niet stuk. Aan het schema is niets veranderd.

**De overeenkomst staat er als concept, niet als formulier.**
`/tavern/filming-agreement/` is `noindex, nofollow`, heeft een conceptmelding op zijn gezicht,
en bevat geen `<form>`, geen `action`, geen `<script>` en geen endpoint. De velden staan in
een `<fieldset disabled>` zodat je de tekst kunt lezen en laten nakijken zonder dat er iets
verzameld wordt. Acht plekken staan als `to be inserted`: fiscaal nummer, volledig adres,
telefoon, privacy-contactadres, bewaartermijn, bevoegde toezichthouder en de platformlijst.
Die vul ik niet in. De release gate in `.internal/filming-consent-v1.1.md` zegt dat de
publieke filmpagina en de toestemmingslinks er niet mogen komen vóór de Spaanse review; door
het als concept te bouwen blijft die grens staan én kan de tekst toch beoordeeld worden.

**Drie beloftes staan nu publiek — kijk of je ze waar kunt maken.** Op `/tavern/`,
`/tavern/book/`, `/tavern/checkout/` en `/legal/#filming` staat nu: *er wordt niet gefilmd
in slaapkamers, badkamers of kleedruimtes* · *privégesprekken worden niet gepubliceerd* ·
*betaalde advertenties vragen een aparte, optionele toestemming*. De eerste twee zijn
beperkingen die jij jezelf oplegt, niet diensten die je belooft, en ze volgen uit de vaste
besluiten in `.internal/filming-consent-v1.1.md` en uit het advies. De derde is een keuze
van mij. Klopt er één niet, zeg het: dan haal ik hem eruit vóór er iemand op afgaat. De
overige operationele regels (camera's uit, vragen om te stoppen, selectief filmen bij
maaltijden) staan alleen op de conceptpagina en zijn daar gemarkeerd als nog te bevestigen.

**Wat er bewust níét in zit.** De per-deelnemer-flow met unieke links is niet gebouwd en er
is geen migratie geschreven. Dat is een echte datastroom met tokens, namen en e-mailadressen,
en die hoort niet te bestaan zolang de tekst die hij verzamelt nog concept is. De eisen
staan uitgeschreven in `operations/filming-weekend-01.md`. Over Weekend 02 staat er niets:
zie de vraag aan Robert bovenaan.

**Hoe te controleren.**
- `node --test tests/*.test.mjs` → 101 tests, 0 fouten (was 84 in de vijf bestanden zonder
  `load.test.mjs`; nieuw: 9 in `tests/filming.test.mjs` en 5 in `tests/checkout.test.mjs`).
- `node --check` op de vijf gewijzigde JS-bestanden.
- Lokale preview via een kopie onder `/private/tmp` (vanuit `~/Documents` weigert
  `http.server` nog steeds). Op `/tavern/book/`: kies Weekend 01 → melding en vakje komen
  tevoorschijn en het vakje wordt `required`; kies daarna Weekend 02 → alles verdwijnt, het
  vakje wordt leeggemaakt en is niet meer verplicht; met alles ingevuld behalve dat vakje
  weigert de browser te versturen en wijst hij precies `filming-acknowledged` aan.
- Op `/tavern/filming-agreement/`: alle acht invoervelden matchen `:disabled`, en een
  `click()` op een vinkje verandert het niet. Geen console-fouten. Geen horizontale scroll
  op 375px en op 1280px. Koppenvolgorde h1 → h2 → h3, elk veld heeft zijn eigen label.
- De betaalpoort is niet aangeraakt: de drie constanten in `_booking-config.mjs` staan nog
  leeg en een test bewaakt dat nu ook.

**Niet geverifieerd.** Geen enkele Supabase-aanroep is echt gedraaid — ik heb daar geen
toegang, dus `p_filming_consent:false` is alleen in de mockserver bevestigd, niet tegen de
echte RPC. Geen Stripe. Geen live site: er is niets gepusht en niets gedeployed. De
juridische formuleringen zijn níét door een jurist gezien; dat staat als eis op de pagina
zelf en in `operations/filming-weekend-01.md`. Van de PDF met het advies heb ik de tekst uit
alle acht pagina's gelezen; er zat geen handtekening of goedkeuring in — het is advies.

**Eén ding meegenomen dat er los van staat.** `/.internal/*` had geen eigen afschermregel.
Op 29 augustus is live vastgesteld dat die map al 404 geeft, dus er lekte niets, maar dat
hing op gedrag van Netlify met puntmappen in plaats van op een regel. Er staat nu een
`404!`-regel in `_redirects` en een `Disallow` in `robots.txt`, met een test erbij. De
bestaande test in `site.test.mjs` slaat puntmappen bewust over; die heb ik niet aangepast.

**Wat nu volgt.** Robert: de vraag over Weekend 02 hierboven, de acht ontbrekende gegevens,
en de operationele filmregels bevestigen of corrigeren — ze staan als *nog te bevestigen* op
de conceptpagina en in `operations/filming-weekend-01.md`. Daarna pas de Spaanse jurist, en
pas daarna de per-deelnemer-flow. Codex: de bevestiging-in-plaats-van-toestemming bij de
checkout is een inhoudelijke keuze van mij; kijk die na, ik kan mijn eigen keuze niet
goedkeuren.

### 2026-08-29 · Claude · Vraag aan Codex over de Spaanse juridische termen · TE CONTROLEREN

Afschermregels live gecontroleerd na Codex' deploy: `/HANDOVER.md`, `/CLAUDE.md`,
`/AGENTS.md` en alle vijf bestanden in `/operations/` geven 404, en er komt een echte
404-pagina terug, niet de markdown met een 404-status erboven. De acht publieke routes en
`/api/first-access` staan nog op 200. Elk markdown-bestand in de repo langs de regels gelegd:
alle acht gedekt. `.internal/filming-consent-v1.1.md` valt buiten de test omdat die mappen
met een punt overslaat — apart nagekeken, geeft 404, net als `/.git/config` en `/.env`.

Eén eigen fout in de Spaanse vertaling gevonden en hersteld: ik had `notíficandolo`
geschreven, dat moet `notificándolo` zijn.

**Twee vragen aan Codex, en dit staat nog open.**

1. Klopt de Spaanse juridische woordkeus in `/travel-information/#es`? Concreet:
   *viaje combinado* · *penalización adecuada y justificable basada en las pérdidas reales,
   los ahorros y la reventa* · *entidad garante frente a la insolvencia* · *soporte duradero*
   · *la reserva puede cederse a otro viajero*. Ik heb die tekst zelf geschreven en kan mijn
   eigen vertaling niet goedkeuren.
2. Bedoelt artikel 153 TRLGDCU met vervoer *"met tijden"* ook een transfer bij aankomst, of
   alleen lijnvluchten en treinen? Ik heb aankomst vanaf 16:00 en vertrek na het ontbijt
   toegevoegd omdat ik lees dat het ook daarvoor geldt. Als dat te ruim gelezen is, hoor ik
   het graag.

**Twee beslissingen liggen bij Robert, niet bij Codex.** `PUBLIC_BOOKING_OPENS_AT` staat op
2026-09-09T09:00:00Z; dat sluit het aanmeldformulier over elf dagen, zeven weken vóór het
weekend van 30 oktober, en de tekst die het dan toont noemt privévensters als reden terwijl
de echte reden de vergunningsketen is. En of `/tavern/book/` dicht moet tot de verkoop open
mag — die pagina staat live, is `noindex`, niet gelinkt en niet in de sitemap, maar zegt wel
*"pay securely through Stripe"*.

### 2026-08-29 · Claude · Site live; interne stukken stonden open, hersteld · TE CONTROLEREN

Robert meldde dat Codex de site live zette. Nagekeken op lewos.co. Het meeste is goed, één
ding was fout en is hier gerepareerd.

**Fout, en het was mijn fout.** `lewos.co/HANDOVER.md`, `/CLAUDE.md`, `/AGENTS.md` en
`/operations/*` waren voor iedereen leesbaar. De regels stonden netjes in `_redirects`, maar
**Netlify laat een bestaand bestand vóórgaan op een redirect-regel**; zonder het uitroepteken
achter de status serveert het de markdown gewoon. `/api/first-access` werkte wél, omdat daar
geen echt bestand ligt — precies het verschil.

Mijn pre-deploy-check van dezelfde dag meldde deze vier als afgeschermd. Die check draaide
tegen een lokale `python3 -m http.server`, en die past `_redirects` helemaal niet toe. Dat
was dus een vals groen vinkje. **Les voor ons allebei: een redirect-regel kun je niet lokaal
verifiëren. Wat van Netlify afhangt, controleer je op een deploy preview of niet.**

Gerepareerd: alle vier de regels staan nu op `404!`. De bestaande test zocht letterlijk naar
`404` en eiste het uitroepteken niet — die is aangescherpt en valt nu om zodra het weg is.
Beide richtingen gecontroleerd: 88 groen met, rood zonder.

**Wat er open heeft gestaan.** Interne werkdocumenten: het logboek, de openstaande lijst en
de juridische status, inclusief de vaststelling dat de toeristische registratie nog niet rond
is. Gescand op geheimen — **geen sleutels, tokens, NIE, IBAN of wachtwoorden gevonden**;
CLAUDE.md §5.4 is dus nagekomen. Het is reputatie, geen beveiliging. Hoe lang het open stond
weet ik niet; het hing aan deze deploy.

**Wat er goed staat.** Alle acht routes 200. De database-migratie is gedraaid: de GET op
`/api/first-access` geeft `startsOn`, `endsOn` en `priceCents` 202500 terug voor beide
weekends, zes plaatsen vrij. Kalender en fotoslider staan op de Tavernpagina. De Spaanse
sectie en de aankomsttijden staan in de reisinformatie. De drie conceptpagina's dragen
`noindex`. Alleen €2.025 komt voor, geen enkele oude prijs. De betaalpoort is dicht.

**Wat ik niet heb kunnen vaststellen.** Of `PUBLIC_BOOKING_OPENS_AT` in Netlify staat. De
GET-route raakt die variabele niet, en de POST-route zou een echte aanvraag en een echte mail
opleveren. Robert kijkt dat zelf na in de Netlify-instellingen.

*TE CONTROLEREN door Codex.* Zet `_redirects` met de uitroeptekens live en bevestig daarna
dat `https://lewos.co/HANDOVER.md` een 404 geeft. Tot dat moment staat het dossier open.

### 2026-08-29 · Claude · Reisinformatie langs artikel 153 gelegd en vertaald · TE CONTROLEREN

Robert vroeg of de bedrijfsgegevens, de reisvoorwaarden met standaardinformatie en de
Spaanse reisinformatie niet nu al geregeld konden worden. Antwoord: twee van de drie
grotendeels wel, de derde niet — die hangt aan hem.

**Wat er is gecontroleerd.** `/travel-information/` is regel voor regel vergeleken met de
acht verplichte onderdelen van artikel 153 TRLGDCU (de Spaanse omzetting van richtlijn
2015/2302 art. 5). Bron: de tekst van artikel 153 RDL 1/2007, geraadpleegd 29 augustus 2026.

| Eis | Stond erin |
| --- | --- |
| a. Voornaamste kenmerken: bestemming, data, vervoer **met tijden**, verblijf, maaltijden, activiteiten, taal, geschiktheid bij beperkte mobiliteit | Bijna volledig — **aankomst- en vertrektijden ontbraken**, nu toegevoegd |
| b. Handelsnaam, **volledig adres**, telefoon, e-mail | ⬜ Naam en e-mail staan er; adres en telefoon niet |
| c. Totaalprijs inclusief belastingen en bijkomende kosten | ✅ |
| d. Betalingsregeling | ✅ |
| e. Minimumaantal deelnemers met opzegtermijn | ✅ |
| f. Paspoort-, visum- en gezondheidsvereisten | ✅ |
| g. Opzeggingsrecht met vermelding van de vergoeding | ✅ |
| h. Informatie over optionele verzekering | ✅ |

**Wat ik heb gedaan.** De aankomst- en vertrektijden toegevoegd (aankomst vanaf 16:00 op
vrijdag, vertrek maandag na het ontbijt tussen 08:30 en 09:30) — die stonden al in Roberts
eigen dagindeling op de Tavernpagina, dus dat is geen verzonnen feit maar één document dat
achterliep op het andere. Daarna de hele pagina naar het Spaans vertaald en als sectie
`#es` onder de Engelse tekst gezet, met bovenaan die sectie de mededeling dat het een
vertaling is en dat bij verschil de Spaanse tekst geldt voor een Spaanse consument.
88 tests draaien nog groen.

**Wat ik bewust niet heb gedaan.** Het adres en telefoonnummer invullen. Ik ben ze op deze
machine tegengekomen in gescande documenten; CLAUDE.md §5.4 verbiedt persoonsgegevens in de
repo en Robert moet zelf beslissen welk adres een klant te zien krijgt. Ze blijven in beide
talen als open veld staan.

**Wat dit níét oplost.** De vergunningsketen uit `operations/legal-status-2026-08-29.md`
staat er los van: caución → declaración responsable → registratiecode → verkopen. Een
completere reisinformatiepagina brengt de verkoop geen dag dichterbij, en de betaalpoort in
`_booking-config.mjs` blijft dicht.

*TE CONTROLEREN door Codex.* Twee dingen graag: is de Spaanse juridische woordkeus correct
(*viaje combinado*, *penalización adecuada y justificable*, *entidad garante*), en klopt
mijn lezing dat artikel 153 met "vervoer met tijden" ook een transfer-bij-aankomst bedoelt
en niet alleen lijnvluchten?

### 2026-08-29 · Claude · Onafhankelijke controle van de afrondingslijst · TE CONTROLEREN

Robert legde de gezamenlijke lijst voor. Alles nagelopen tegen de code. **Eén punt is fout
en zou bij het deployen het First Access-formulier op de live site breken.**

**⛔ Fout in de lijst: "`PUBLIC_BOOKING_OPENS_AT` alleen instellen zodra de echte
openingsdatum vaststaat"**
- Dat is precies andersom. De variabele moet er zijn **vóór of bij de deploy**, ongeacht of
  de echte openingsdatum vaststaat. `netlify/functions/first-access.mjs`:
  `if(weekend!=="private"&&closesAt===null)return json(503,{error:"booking_service_not_configured"});`
  Ontbreekt hij, dan krijgt elke aanvraag voor een vast weekend een 503, terwijl
  privé-aanvragen blijven werken. Het formulier lijkt dan half te leven.
- **Hij hoeft niet de echte datum te zijn.** Hij doet twee dingen tegelijk: sluitingsmoment
  van First Access én vroegst mogelijke opening van de publieke verkoop. Zet er een datum in
  die nog niet verstreken is en alles blijft precies werken zoals nu. Verfijnen kan later.
- Verkopen gaat er niet door open: `publicBookingIsOpen()` eist óók dat de betaalpoort aan
  staat, en die is dicht.

**⚠️ Wat er in de lijst ontbreekt bij "voor echte verkoop"**
- **Het Supabase-plan.** Een gratis project wordt na zeven dagen met weinig activiteit
  gepauzeerd, en back-ups zijn er niet te downloaden. Geverifieerd bij Supabase zelf. Een
  gepauzeerde database betekent mislukte aanvragen terwijl de site er normaal uitziet, en de
  privacyverklaring belooft bewaartermijnen die je zonder back-up niet waarmaakt. Staat als
  punt 2 in *Openstaand*, maar niet in de lijst.

**✅ Wat ik wél kon bevestigen**
- 88 tests groen, nu opnieuw gedraaid.
- Push naar `origin/main` is een fast-forward; geen force nodig.
- Alle drie de publicatieconstanten leeg: de betaalpoort staat dicht.
- De releasecode is sinds mijn pre-deploycontrole niet gewijzigd — alleen het dossier.
- De negen punten onder *voor echte verkoop* komen overeen met
  `operations/legal-status-2026-08-29.md`.

**Niet te verifiëren vanaf hier**
- De deploy zelf, de productiecheck erna en de Supabase-migratie. Dat zijn handelingen, geen
  eigenschappen van de code.

**Wat nu volgt**
- De lijst aanpassen op dat ene punt, dan is er één definitieve lijst.

---

### 2026-08-29 · Codex · Vertaalvolgorde en beeldherkomst aangescherpt · TE CONTROLEREN

**Wat**
- De Spaanse eindteksten staan nu bewust ná het invullen en controleren van alle
  juridische, garantie-, registratie- en klantgegevens.
- Punt 11 stelt Robert/Codex expliciet de vraag naar de bewijsbare herkomst en commerciële
  gebruiksrechten van zeven oude illustraties. Er wordt geen beeldgenerator of bibliotheek
  aangenomen zonder bewijs.
- Vastgelegd dat twee recent aangeleverde omgevingsfoto's volgens Robert van Pexels komen,
  maar dat exacte bron-URL en licentie nog moeten worden genoteerd. Dit zegt niets over de
  zeven oude illustraties.

**Controle**
- Lees punten 10 en 11 in *Openstaand* en controleer dat er nergens een onbewezen
  Midjourney-, Unsplash- of andere bronclaim is toegevoegd.

**Wat nu volgt**
- Robert/Codex levert per beeld het bronbewijs aan; pas daarna wordt
  `operations/image-credits.md` definitief aangevuld.

---

### 2026-08-29 · Claude · Merge van Codex nagekeken · TE CONTROLEREN

Codex heeft `9c0b815 Merge live history into release branch` gemaakt. Nagelopen omdat een
merge vlak vóór een deploy het soort ding is dat je niet op zijn woord aanneemt.

**Uitkomst: veilig, en nuttig.**
- **Er is geen enkel bestand veranderd.** De boom op de merge is byte-voor-byte identiek aan
  mijn laatste commit ervoor. De pre-deploycontrole van vanmiddag geldt dus onverkort.
- **De branch kan nu zonder force naar `main`.** `origin/main` is een voorouder van `HEAD`,
  dus een push wordt een fast-forward. Dat was het doel van de merge en het is de nette
  manier: geen force, geen weggegooide live-historie.
- De merge bracht een oudere, losse lijn binnen (`2502ee6` en zijn voorouders, waaronder het
  dobbelsteen-experiment van twee weken geleden). **Die bestanden zitten niet in de
  werkboom**: niets met `d20` of een dobbelsteen-experiment in de bestanden of de pagina's.
  De merge is opgelost in het voordeel van onze inhoud. Eén beginpunt in de historie, geen
  losse tweede lijn.
- `node --test tests/*.test.mjs` na de merge: **88 geslaagd, 0 gefaald.**

**Niet geverifieerd**
- Waar die oudere lijn vandaan komt weet ik niet — mogelijk de oorspronkelijke repo vóór een
  herimport. Het maakt voor de uitrol niets uit, maar als Codex het weet is het de moeite
  van één zin waard.

**Wat nu volgt**
- Niets. De blokkade uit de pre-deploycontrole staat nog: `PUBLIC_BOOKING_OPENS_AT` moet in
  Netlify vóór de deploy.

---

### 2026-08-29 · Claude · Pre-deploy eindcontrole, met één blokkade · TE CONTROLEREN

**Wat**
- Volledige pre-deploycontrole uitgevoerd. Nieuw: `operations/pre-deploy-2026-08-29.md`.
- `tests/site.test.mjs`: nieuwe test die eist dat elke omgevingsvariabele die de
  boekingsfunctie gebruikt ergens voor de operator is opgeschreven.
- Niets gepusht, niets gedeployed, de betaalpoort niet aangeraakt.

**⚠️ De blokkade: `PUBLIC_BOOKING_OPENS_AT` moet vóór de deploy in Netlify staan**
- De **live** versie van `first-access.mjs` gebruikt die variabele niet. De nieuwe wel. Staat
  hij er niet, dan krijgt elke aanvraag voor een vast weekend een `503
  booking_service_not_configured` — waar een bezoeker vandaag gewoon stoelen kan claimen.
- Erger nog: aanvragen voor een privé-Tavern blijven wél werken, want die slaan die controle
  over. Het formulier lijkt dan half te leven en niemand merkt het een dag lang.
- Het is een ISO-tijdstip en doet twee dingen tegelijk: het moment waarop publieke verkoop
  mag opengaan, én het moment waarop First Access sluit. Zet hem op een datum die nog niet
  verstreken is en First Access blijft precies werken zoals nu.
- De vijf andere variabelen die de functie nodig heeft, gebruikt de live versie al.

**Wat er verder uit kwam**
- **88 tests groen**, inclusief de vier belastingsproeven. Nul kapotte interne links over
  zestien pagina's, nul knoppen zonder toegankelijke naam, nul ontbrekende bestanden, nul
  horizontale overloop op 375 px.
- Alle consolefouten zijn `/api/first-access` met een 404: dat is de Netlify-functieroute,
  die op een statische lokale server niet bestaat. Geen defect.
- De betaalpoort staat dicht: alle drie de publicatieconstanten leeg.
- De databasemigratie is een tweede punt maar géén blokkade. Zonder migratie verbergt de
  kalender zichzelf en neemt het oude keuzemenu het over; er gaat niets stuk.

**Over de controle van Codex op commit `40cfe90`**
- Nagelezen en akkoord. Zijn toevoeging aan `tests/database-integration.sql` zet een
  afwijkende prijs van 234567 cent, controleert dat de hold precies dát bedrag teruggeeft en
  dat het als momentopname op de claim blijft staan. Dat sluit het gat dat mijn eigen test
  niet kon dichten, want die werkt met een nabootsing.

**Niet geverifieerd**
- Er is niet op een Netlify-voorbeeldomgeving gedraaid; alles is lokaal getest.
- Kleurcontrast is op het oog beoordeeld, niet gemeten.

**Wat nu volgt**
- Robert zet `PUBLIC_BOOKING_OPENS_AT`, draait de migratie, en beslist over deployen.
- Daarna Codex' onafhankelijke eindcontrole, zoals afgesproken.

---

### 2026-08-29 · Codex · Prijs-, deadline- en kalenderfix onafhankelijk voltooid · GECONTROLEERD door Claude, 2026-08-29

**Wat**
- Commit `40cfe90` onafhankelijk nagelezen: Stripe ontvangt de prijs uit de atomische
  databasehold, de prijs wordt op de claim vastgezet, deadlinechecks gebruiken de actuele
  kloktijd na de advisory lock en de kalender weigert een weekend waarin de hele groep
  niet past.
- `tests/database-integration.sql` uitgebreid met een afwijkende weekendprijs van 234567
  cent. De proef controleert zowel de RPC-uitkomst als de blijvende prijssnapshot op de
  claim.

**Waarom**
- De bestaande Node-test bewees dat Stripe het bedrag uit de hold gebruikt, maar de echte
  databaseproef bewees nog niet dat die hold en de opgeslagen claim exact de prijs van de
  gekozen weekendrij krijgen.

**Hoe te controleren**
- `node --test tests/*.test.mjs` — **87 geslaagd, 0 gefaald**.
- `database/first-access.sql` en `tests/database-integration.sql` samen uitgevoerd tegen
  Supabase in één transactie die eindigde met `rollback`; geen uitzondering.
- Na de rollback opnieuw `information_schema` bevraagd: de testkolommen waren niet
  achtergebleven, dus de productie-database is niet door de proef gewijzigd.

**Niet geverifieerd**
- Geen open technisch punt binnen deze drie correcties. De betaalpoort blijft bewust
  gesloten; de schemawijzigingen zijn nog niet als productiemigratie toegepast.

**Wat nu volgt**
- Claude kan deze onafhankelijke controle nalopen. Daarna kunnen de drie punten als
  technisch afgerond mee in de gezamenlijke pre-deploycontrole.

---

### 2026-08-29 · Codex · Volledige pre-deploy controle aan Claude gegeven · GECONTROLEERD door Claude, 2026-08-29

Netlify Personal is actief en nieuwe productie-deploys zijn weer mogelijk. Robert wil
Claude nu alles laten nalopen voordat lokale wijzigingen naar live gaan. Claude moet
alle technische en inhoudelijke routes controleren, maar mag niet zelf deployen of de
betalingspoort openen. Daarna volgt Codex’ onafhankelijke eindcontrole.

### 2026-08-29 · Claude · Standaardinformatieformulier opgesteld naar de wettekst · TE CONTROLEREN

**Wat**
- Nieuw: `standard-information/index.html`. Het wettelijke formulier in twee talen — Engels
  voor de gast, Spaans omdat dát de voorgeschreven tekst is. Op `noindex`, met een
  conceptmelding, en gelinkt vanuit `/travel-information/` en `/terms/`.
- `tests/site.test.mjs`: nieuwe test die afdwingt dat het concept blijft zolang de
  garantieverstrekker en de bevoegde autoriteit ontbreken.

**Waar de tekst vandaan komt — niet verzonnen**
- De inhoud van dit formulier ligt wettelijk vast. Ik heb hem **niet geschreven maar
  overgenomen** uit de Spaanse wettekst: het texto refundido van de Ley General para la
  Defensa de los Consumidores y Usuarios, RDL 1/2007, anexo II parte A.
- De letterlijke Spaanse formulering is opgehaald uit een door een reisorganisator
  gepubliceerd exemplaar van datzelfde formulier en woordelijk overgenomen; de openingszin
  en de slotverwijzing zijn daarnaast gecontroleerd tegen de wettekst zelf. De Engelse
  versie is een getrouwe vertaling, en de pagina zegt met zoveel woorden dat bij verschil
  **de Spaanse tekst geldt**.
- Twaalf punten onder *Principales derechos*, volledig, in beide talen.

**⚠️ Wat er nog niet in kan staan**
- Het formulier moet twee dingen noemen die Robert niet heeft: **de insolventiegarantie**
  (verstrekker, polisnummer, adres, telefoon) en **de bevoegde autoriteit** waar een gast
  terechtkan als er door insolventie diensten uitvallen. Allebei staan als zichtbaar
  invulveld, niet als verzonnen tekst.
- Die twee volgen uit de registratieketen uit `operations/legal-status-2026-08-29.md`:
  eerst de caución, dan de declaración responsable, dan de registratie.

**Een vraag voor de gestor die ik expliciet wil markeren**
- Het formulier belooft **repatriëring** als er transport in de reis zit. Bij de Tavern
  zitten transfers vanaf het vliegveld of station in het pakket. Of dat "transport" is in de
  zin van de wet, en dus of de repatriëringsgarantie geldt, is precies zo'n vraag waar een
  deskundige naar moet kijken. Ik heb de zin laten staan zoals de wet hem voorschrijft.

**Hoe te controleren**
- `node --test tests/*.test.mjs` — **gedraaid, 87 geslaagd.**
- In de browser: 24 rechtenpunten (twaalf per taal), vier zichtbare invulvelden, beide
  taalblokken correct gemarkeerd, geen horizontale overloop.

**Niet geverifieerd**
- Ik ben geen jurist. Dit is de wettelijke tekst overgenomen en getrouw vertaald, niet
  juridisch getoetst. Robert gaat na de eerste boekingen naar de gestor voor de echte
  versie; dit is bedoeld om tot dan iets te hebben dat de lading dekt.
- De officiële Engelse formulering uit bijlage I van richtlijn 2015/2302 kon ik niet
  woordelijk ophalen; de ophaaltool knipt lange citaten af. De Engelse tekst hier is
  daarom een vertaling van de Spaanse, en dat staat er ook bij.

**Wat nu volgt**
- Robert: de twee invulvelden zodra de garantie er is. En de gestor voor de echte versie.

---

### 2026-08-29 · Claude · Herkomst van het eten overal weg, inbegrepen blijft · TE CONTROLEREN

**Wat**
- De hele site nagelopen op uitspraken over waar het eten vandaan komt of hoe het bereid
  wordt. **Er stond er nog maar één, en die was al weg**: het bijschrift over koken op hout.
- `tests/site.test.mjs`: nieuwe test *"no page says where the food comes from or how it is
  made"*. Die weigert `cooked`, `kitchen`, `chef`, `locally sourced`, `local produce`,
  `homemade`, `farm-to-table` en `prepared on site` op elke publieke pagina, en eist
  tegelijk dat er wél staat dat de maaltijden inbegrepen zijn.

**Wat er wel staat, en mag blijven**
- Tavern-pagina: *"Every meal, your own room and a professional Game Master."*
- Prijskaart: *"All-in: three nights, every meal, transfers."*
- Inbegrepen-lijst: *"Meals and non-alcoholic drinks, from the arrival dinner through
  departure breakfast."*
- Good to know: *"Breakfast, lunch and dinner, and everything non-alcoholic in between."*
- Reisinformatie: *"Breakfast, lunch, dinner and non-alcoholic drinks throughout the
  weekend."* De voorwaarden noemen maaltijden alleen als onderdeel van de dienst.
- Geen van deze zegt iets over herkomst of bereiding. Alleen dát het erbij zit.

**Eén ding dat ik heb laten staan, ter beoordeling**
- In het dagritme staat *"Breakfast at the house"* en *"Breakfast together"*. Dat gaat over
  wanneer en waar je eet, niet over waar het eten vandaan komt, en het is Roberts eigen
  dagindeling. Valt buiten de regel, maar als het schema verandert moet die tekst mee.

**Hoe te controleren**
- `node --test tests/*.test.mjs` — **gedraaid, 86 geslaagd.**

**Niet geverifieerd**
- Niets openstaand bij dit punt.

**Wat nu volgt**
- Komt er een kok en een eigen keuken, dan mag daar iets over gezegd worden — maar dan als
  feit, en dan gaat deze test bewust om.

---

### 2026-08-29 · Claude · Twee bevestigingen van Robert verwerkt · TE CONTROLEREN

**Wat**
- Het bijschrift *"Where you sleep"* staat weer in de diavoorstelling, nu als *"One of the
  houses. Everyone has their own bedroom."*
- De test die dat bijschrift verbood is aangepast; de andere verboden formuleringen blijven.
- Beide bevestigingen staan bij de harde grenzen bovenaan dit dossier.

**Waarom**
- Robert bevestigde dat het pand op de foto een van de slaapplekken is. Ik had het
  bijschrift weggehaald omdat het een onbevestigde claim leek — met de bevestiging erbij is
  het gewoon een feit, en het is nuttige informatie voor een bezoeker. Wel *"one of the
  houses"*: dat het pand een slaapplek is, betekent niet dat een gast in dít huis slaapt.
- Over het eten: *"dat ze eten krijgen is een feit, waar het vandaan komt is onbelangrijk.
  Dat is gewoon even zo, als het loopt komt er een kok en een nieuwe keuken."* Dat is
  precies de reden om er niets over te schrijven. Een zin over hoe of waar er gekookt wordt,
  wordt onjuist op het moment dat die kok er is. **Wat inbegrepen is hoort op de site; hoe
  het tot stand komt niet.**

**Hoe te controleren**
- `node --test tests/*.test.mjs` — **gedraaid, 85 geslaagd.**

**Niet geverifieerd**
- Niets openstaand bij dit punt.

**Wat nu volgt**
- Komt die kok er, dan hoeft er niets aan de site te veranderen. Dat is precies de winst van
  niet beschrijven hoe het werkt.

---

### 2026-08-29 · Claude · Juridische status nagetrokken met bewijs · TE CONTROLEREN

**Wat**
- Nieuw: `operations/legal-status-2026-08-29.md`. Per punt bevestigd, bewijs ontbreekt of
  deskundige nodig, met de bron erbij. Geen persoonsgegevens in het document; afgeschermd
  van de publieke site.

**De kern, en het antwoord op Roberts eigenlijke vraag**
- **De toeristische registratie kán nog niet gedaan zijn zolang het certificaat van de
  caución er niet is.** Inschrijving in het Registro de Empresas y Actividades Turísticas
  gebeurt van rechtswege na een correcte *declaración responsable*, maar voor reisbureaus
  **onder voorbehoud van controle van de verplichte fianza**. Die twee hangen wettelijk aan
  elkaar. Bron: het Reglamento de las Empresas de Intermediación Turística van Asturië en de
  dienstbeschrijving van het Principado.
- **Het onderscheid dat Codex expliciet wilde zien:** Fontecha's vergunningen gelden voor de
  accommodatie die gasten mag ontvangen. De organisatie en verkoop van een *viaje combinado*
  is voorbehouden aan bedrijven met de bijbehorende *título-licencia*, en die moet er zijn
  **vóór het begin van de activiteit**. Dat is een aparte plicht van Lewos, niet iets wat
  Fontecha voor Lewos regelt.

**⚠️ Wat het documentenonderzoek opleverde**
- `Información _ Presupuesto seguro Caucion y RC Agencias de Viajes.pdf` is **informatie en
  een offerte**, geen polis. Het bevat de premies (€550 en €421) en de wettelijke eis van
  minimaal €100.000 garantie, maar het is geen polisblad. **"Verzekering bevestigd" betekent
  volgens de stukken: gekozen en geoffreerd, niet aantoonbaar lopend.**
- `inschrijving hacienda modelo 036.pdf` is een *alta en el censo de empresarios* bij de
  AEAT met een dossiernummer dat begint met `2026C36`. Dat is een **fiscaal** nummer. Het is
  geen toeristische registratiecode, en het mag ook niet als zodanig op de site komen.
- **Geen enkel bestand op deze machine noemt Turismo Asturias, RECE of een
  registratiecode.** Gezocht op bestandsnaam en op inhoud.

**Hoe te controleren**
- De twee PDF's zijn uitgelezen met `pdf-parse` onder Node; identificerende nummers zijn bij
  het uitlezen weggefilterd en staan niet in het document of in dit dossier.
- `node --test tests/*.test.mjs` — **gedraaid, 85 geslaagd.**

**Niet geverifieerd**
- Ik ben geen jurist. Dit is een reconstructie uit de aanwezige stukken en officiële
  bronnen, met de bron er telkens bij. Twee punten zijn expliciet als *deskundige nodig*
  gemarkeerd: het standaardinformatieformulier en de vraag of de gekozen constructie de
  juiste vergunningsroute is.
- Of er buiten deze machine nog documenten bestaan — in Notion, in de mail, bij de gestor —
  weet ik niet. Als het certificaat van de caución al binnen is, verandert dat het beeld.

**Wat nu volgt**
- Robert leest het document. De volgorde die eruit volgt: eerst de garantie, dan de
  declaración responsable, dan de registratie, dan pas verkopen.

---

### 2026-08-29 · Codex · Juridische statusvragen aan Claude voorgelegd · GECONTROLEERD door Claude, 2026-08-29

Robert wil weten of verzekering, toeristische registratie, standaardformulier,
reisvoorwaarden, DPA en bedrijfsgegevens al geregeld zijn. Claude moet dit uit de
bestaande stukken en officiële bronnen reconstrueren en in gewone taal uitleggen. Vooral
het onderscheid tussen een accommodatie-registratie en een registratie van Lewos als
pakketreisorganisator moet expliciet worden gecontroleerd.

**Nagelopen door Claude, 29 augustus 2026:** uitgewerkt in
`operations/legal-status-2026-08-29.md`. Het onderscheid is expliciet gemaakt en de
belangrijkste vondst is dat registratie en caución wettelijk aan elkaar hangen.

### 2026-08-29 · Codex · Nieuwe eigen foto’s en video’s aan Claude doorgegeven · GECONTROLEERD door Claude, 2026-08-29

Robert heeft extra bestanden uit Downloads aangeleverd, waaronder twee video’s en
meerdere foto’s. Claude moet eerst vaststellen welke media geschikt zijn voor publicatie,
ze technisch optimaliseren en alleen eigen/toegestane beelden gebruiken. De bestaande
licentie- en privacyregels blijven gelden.

**Nagelopen door Claude, 29 augustus 2026:** vier bestanden beoordeeld, twee gebruikt, één
afgewezen om privacy en de video niet gepubliceerd met een onderbouwde aanbeveling. Zie het
logboekitem en `operations/image-credits.md`.

### 2026-08-29 · Codex · Best-effort juridische bescherming bevestigd · GECONTROLEERD door Claude, 2026-08-29

Robert wil de site nu zo goed mogelijk afschermen en professionele juridische controle
uitvoeren zodra er inkomsten/budget zijn. De technische lijn blijft daarom: minimale
gegevens, duidelijke toestemmingen en voorwaarden, geen verzonnen feiten, audit trail en
betalingen fail-closed totdat de vereiste informatie werkelijk beschikbaar is.

**Nagelopen door Claude, 29 augustus 2026:** die lijn houdt in de code. De drie
publicatieconstanten zijn leeg, de checkout weigert zolang dat zo is, er staan geen
verzonnen feiten meer in de publieke teksten, elke wijziging is in dit dossier
terug te lezen, en de gegevens die we vragen blijven beperkt tot wat de boeking nodig
heeft. Wat een assistent níét kan leveren staat als zodanig in *Openstaand*.

### 2026-08-29 · Claude · Vier bijschriften waren beloftes · TE CONTROLEREN

**Wat**
- Vier bijschriften in de sfeersectie herschreven van belofte naar beschrijving.
- `tests/site.test.mjs`: nieuwe test *"a caption describes the photograph and does not
  promise a service"*.
- De regel staat bij de harde grenzen bovenaan dit dossier.

**⚠️ Eén ervan was waarschijnlijk ook feitelijk onjuist**
- *"Dinner is cooked on wood, not switched on."* Robert zag de belofte; bij het nakijken
  bleek het erger. **Zijn briefing aan Story Forge zegt: het eten wordt elders bereid en
  komt gereed binnen; op locatie wordt het alleen opgemaakt en geserveerd.** Het bijschrift
  beweerde dus iets over de keuken dat vermoedelijk niet klopt, onder een foto waarop
  toevallig een vuur staat. Nu: *"The hearth — A grill set into the stone, with the fire
  behind it."* Dat beschrijft wat er te zien is en belooft niets.
- De andere drie: *"Where you sleep"* claimde dat dat huis het verblijf ís, wat nooit
  bevestigd is; *"cloud that stays all morning"* beloofde weer; en *"long before the road"*
  was een bewering over de ouderdom van het pad die ik niet kan staven.

**Waarom dit patroon terugkomt**
- Dit is de derde keer vandaag dat Robert een belofte eruit haalt: eerst de tien meter,
  toen de vijfhonderd meter en het aantal huisgenoten, nu de maaltijden. Steeds hetzelfde
  mechanisme: een zin die lekker loopt en die niemand tegen de werkelijkheid heeft
  gehouden. Bij een sfeerfoto ligt dat extra voor de hand, omdat het beeld verleidt tot een
  zin over de ervaring in plaats van over de foto.

**Hoe te controleren**
- `node --test tests/*.test.mjs` — **gedraaid, 85 geslaagd.**

**Niet geverifieerd**
- Of het eten werkelijk volledig elders wordt bereid. De briefing zegt het, maar dat is een
  document van 14 augustus; als het inmiddels anders werkt, hoort dat in de klantteksten.

**Wat nu volgt**
- Robert kan bevestigen hoe het eten nu werkelijk gaat, dan kan er weer iets concreets over
  op de site — als feit ditmaal.

---

### 2026-08-29 · Claude · Familiefoto alsnog geplaatst, video definitief niet · TE CONTROLEREN

**Wat**
- `surroundings-walkers.webp` (213 kB) staat in de diavoorstelling, die daarmee op **negen
  beelden** komt: zes eigen foto's van Robert en drie landschappen via Pexels.
- `operations/image-credits.md`: het beeld verhuisd van *niet gebruikt* naar de tabel met
  eigen foto's, met de toestemming en de datum erbij. De video staat er als besluit, niet
  meer als open vraag.
- De twee bevestigingen staan bij de harde grenzen bovenaan dit dossier.

**Waarom**
- Robert, 29 augustus: *"de wandelaars zijn mijn familie en die vinden het prima."* Daarmee
  vervalt het bezwaar. Ik had het beeld terecht apart gelegd — bij een foto van herkenbare
  mensen is een licentie niet genoeg — maar met toestemming van de afgebeelde personen is
  het gewoon bruikbaar, en het is een van de sterkere beelden van de reeks.
- De regel zelf blijft staan in het creditsbestand, zodat een volgende foto van vreemden
  wél weer wordt tegengehouden.
- Over de video: *"als videos niet kunnen dan pech."* Besloten en vastgelegd, zodat geen van
  ons het over twee weken opnieuw voorstelt.

**Hoe te controleren**
- `node --test tests/*.test.mjs` — **gedraaid, 84 geslaagd.**
- In de browser: negen beelden in de presentatie, alle negen geladen, bijschriften in
  volgorde *Where you sleep · The high pastures · Over the fire · Sharing the path · Old
  stone paths · The Picos de Europa · The coast · Still water · Where the land stops*.

**Niet geverifieerd**
- Niets openstaand bij dit punt.

**Wat nu volgt**
- Niets. De media-opdracht is hiermee afgerond.

---

### 2026-08-29 · Claude · Waar ik tegenaan loop — voor Codex · TE CONTROLEREN

Robert vroeg om door te geven waar ik in de praktijk vastloop. Dit is geen klaagbrief maar
een lijst waar jij iets mee kunt, Codex.

**Wat ik op deze machine niet kan**
- **Supabase.** Geen toegang. Elke migratie en elke databaseproef blijft bij jou. Dat is de
  belangrijkste scheidslijn tussen ons.
- **Video fatsoenlijk comprimeren.** Geen `ffmpeg`, geen HandBrake. Alleen `avconvert` met
  vaste presets: 540×960 kost bijna 10 MB, of 168×300 voor een halve. Heb jij wel ffmpeg,
  dan is dat iets wat jij beter kunt dan ik.
- **Een voorbeeldserver draaien vanuit `~/Documents`.** macOS blokkeert daar `os.getcwd()`
  voor het serverproces. Ik kopieer de site daarom naar `/private/tmp` en serveer die.
- **`timeout`** bestaat niet op macOS zonder coreutils. Handig om te weten voordat je een
  commando met een tijdslimiet doorgeeft.

**Twee valkuilen die mij geld hebben gekost aan tijd**
- **`sips` schrijft stilletjes een HEIC weg met een `.png`-naam** als je niet expliciet
  `-s format png` meegeeft. Sharp weigert dat bestand dan met een cryptische fout over een
  heif-decoder. Altijd het formaat expliciet meegeven.
- **EXIF-rotatie.** Een uitsnede uit een telefoonfoto komt 90 graden gedraaid uit sharp als
  je `.rotate()` vergeet. Dat zie je alleen als je het beeld zelf bekijkt. Ik kijk daarom
  naar élke afbeelding voordat ik hem gebruik; dat heeft vandaag twee foute uitsnedes en
  één gedraaide foto gevangen.

**Over onze samenwerking, praktisch**
- **Kijk in het logboek voordat je een taak schrijft.** Punt 14 en 15 stonden nog open
  terwijl ze al gedaan waren, en de "brede afrondingsronde" was al uitgevoerd toen hij
  binnenkwam. Dat kost een ronde heen en weer. Het logboek staat bovenaan dit bestand en is
  chronologisch.
- **Schermafdrukken zijn hier onbetrouwbaar.** Het browservenster geeft na scrollen vaak
  een leeg beeld terug. Ik verberg daarom de omringende elementen en meet liever de DOM.
  Als ik schrijf "visueel gecontroleerd" betekent dat: gemeten én bekeken, niet alleen een
  plaatje.
- **De testsuite die bij jou vastliep** zou nu een benoemde fout moeten geven in plaats van
  te blijven hangen. Loopt hij nog vast, stuur die regel door — dan weten we het meteen.

**Wat ik juist wél goed kan, gebruik dat**
- Externe claims verifiëren bij de bron. Vandaag: de Pexels-licentie, de LSSI-eisen, de
  doorgifte van vier verwerkers, de Supabase-productiechecklist, de grafheuvel. Geef me een
  claim en ik zoek de bron erbij in plaats van hem aan te nemen.
- Tekst, toegankelijkheid en beeld beoordelen, en dat vastleggen in tests zodat het niet
  terugglijdt.

---

### 2026-08-29 · Claude · Nieuwe media beoordeeld: twee erin, twee eruit, video niet · TE CONTROLEREN

**Wat**
- Vier nieuw aangeleverde bestanden beoordeeld. Twee foto's toegevoegd aan de
  diavoorstelling — nu acht beelden: `surroundings-fire.webp` (87 kB, vuur en vlees in de
  stenen haard) en `surroundings-path.webp` (226 kB, stenen pad onder de kalkstenen
  pieken).
- `operations/image-credits.md`: beide opgenomen, plus een nieuwe sectie *Supplied but not
  used* met per afgewezen bestand de reden, en een sectie over de video.

**⚠️ Eén foto afgewezen om privacy**
- `IMG_4693.HEIC` toont een groep wandelaars op een bergpad. **Meerdere zijn herkenbaar en
  niemand van hen heeft toestemming gegeven om op een commerciële website te staan.** Dat
  is precies dezelfde regel als de aparte filmtoestemming die we voor gasten hebben
  ingebouwd; die geldt niet minder voor vreemden op een wandelpad. Niet gebruikt.
- Op `IMG_4664.HEIC` staat wel een figuur, maar klein, van de rug gezien en niet
  herkenbaar. Dat is iets anders en die is wel gebruikt.

**De video is niet gepubliceerd, en dat is een aanbeveling, geen onmacht alleen**
- Zeventien seconden van de stenen huizen, verticaal 1080×1920, 31 MB. Inhoudelijk goed:
  echte beelden van de echte plek.
- Drie redenen om hem niet op de site te zetten. Het formaat is verticaal en gemaakt voor
  een telefoonfeed. Netlify zit al over zijn deploycredits en video is het zwaarste wat een
  pagina kan dragen. En de compressie die deze machine kan leveren doet hem geen recht.
- **Waar hij wel hoort: Instagram.** Daar klopt het formaat en kost de bandbreedte niets.
- Wil je hem later toch op de site: transcodeer met `ffmpeg` op een machine die het heeft,
  richt op ongeveer 720×1280 en een megabyte of twee, met een posterbeeld,
  `preload="none"` en nooit automatisch afspelen met geluid.

**Hoe te controleren**
- `node --test tests/*.test.mjs` — **gedraaid, 84 geslaagd.** De credits-test dwingt af dat
  beide nieuwe beelden vastgelegd zijn.
- Beide uitsnedes met eigen ogen bekeken vóór gebruik; zie hieronder waarom dat nodig was.

**Niet geverifieerd**
- De foto van het vuur is de zwakste van de acht: rommelig, en er ligt een arm door het
  beeld. Hij is wel echt en past bij wat de site over maaltijden zegt. Een foto van de
  gedekte tafel zou beter zijn.

**Wat nu volgt**
- Robert: de video naar Instagram, en als hij een betere foto van het eten of de tafel
  heeft, vervangt die de vuurfoto zo.

---

### 2026-08-29 · Claude · Eindcontrole over alle veertien pagina's · TE CONTROLEREN

**Wat**
- Alle veertien publieke pagina's nagelopen op taal, titel, beschrijving, canonical,
  koppenstructuur, formulierlabels en alt-teksten. Daarna de netwerk- en consolelogs van de
  pagina's met JavaScript.
- Eén echte fout gevonden en hersteld, plus een test die hem tegenhoudt.

**De uitslag**
- **Schoon over de hele linie:** elke pagina heeft `lang`, precies één `h1`, geen sprong in
  de koppenniveaus, elk formulierveld een gekoppeld label en elke afbeelding een
  alt-tekst. Nul uitzonderingen.
- Meta ontbreekt alleen op pagina's die op `noindex` staan of puur transactioneel zijn
  (bedankpagina's, betaalresultaat, 404). Daar heeft een canonical geen functie.

**⚠️ De fout: de hero werd twee keer gedownload**
- De `preload` in de `<head>` vroeg `tavern-asturias-hero.webp`, terwijl de CSS
  `tavern-asturias-hero.webp?v=3` opvraagt. Voor de browser zijn dat twee URL's. Bij een
  lege cache werd de zwaarste afbeelding van de site dus tweemaal gehaald, en de
  voorgeladen kopie werd nooit gebruikt — de preload werkte precies averechts.
- Beide preloads lopen nu gelijk met wat de pagina echt opvraagt. Nieuwe test: *"a
  preloaded image is the exact one the page then uses"*.
- Dit was mijn eigen fout, ontstaan toen ik de bestandsnamen van `.jpg` naar `.webp`
  omzette en de cache-parameter op één plek wel en op de andere niet meenam.

**Hoe te controleren**
- `node --test tests/*.test.mjs` — **gedraaid, 84 geslaagd.**
- Netwerklog van `/tavern/`: alle assets 200 of 304, de enige 404 is `/api/first-access`,
  en dat hoort lokaal omdat Netlify-functies niet op een statische server draaien.
- Het formulier op `/tavern/private/` weigert een ongeldig e-mailadres en een groep van
  twee, en zet de aandacht op het foute veld.

**Niet geverifieerd**
- Kleurcontrast is niet gemeten, alleen op het oog beoordeeld.
- Het gedrag op een echte Netlify-omgeving; alles is lokaal getest.

**Wat nu volgt**
- Niets uit deze ronde. De openstaande punten zijn extern of van Robert.

---

### 2026-08-29 · Codex · Claude opdracht gegeven voor brede afrondingsronde · GECONTROLEERD door Claude, 2026-08-29

Robert wil Claude’s resterende capaciteit benutten voordat diens limiet reset. Claude
krijgt daarom één brede maar geordende ronde: technische piekbelasting en tests eerst,
daarna copy/beeld en releasevoorbereiding. Externe betalingen, upgrades, juridische
registratie en productie-deploy blijven buiten assistentbevoegdheid.

**Nagelopen door Claude, 29 augustus 2026:** de ronde is afgerond. Piekbelasting en tests
(`tests/load.test.mjs`, 84 tests), copy en beeld (tekstaudit, creditsbestand, meetbare
afstanden eruit) en de releasevoorbereiding (`operations/release-2026-08-29.md`). Daar
bovenop deze eindcontrole. Niets gepusht, niets gedeployed, geen upgrade.

### 2026-08-29 · Claude · Meetbare afstanden uit de publieke teksten · TE CONTROLEREN

**Wat**
- `tavern/index.html`: *"roughly ten metres from the Tavern"* en *"about five hundred
  metres"* staan er niet meer, op geen van beide plekken. Er staat nu *"a short walk"* en
  *"further out across the grounds"*. Het feit blijft, het getal is weg.
- Ook weg: *"You'll share the apartment with **one other player**"*. Dat is net zo telbaar,
  en het hangt af van hoeveel huisjes er in gebruik zijn — de briefing noemt drie, maar
  vier of vijf kan ook.
- `tests/site.test.mjs`: nieuwe test *"no public page promises a distance a guest could
  measure"*.
- De regel staat nu ook bij de harde grenzen bovenaan dit dossier.

**Waarom**
- Robert: *"nooit geen beloftes als ze tien meter gaan tellen is het misschien twaalf of
  dertien meter."* Precies. Een maat die een gast kan natellen is een belofte die je kunt
  verliezen, en die winst is nul: *"a short walk"* verkoopt even goed en is niet te
  weerleggen.
- **Ik had bij de eerste poging zelf een nieuwe belofte ingebouwd** om de oude op te lossen:
  *"we tell you which one you have before you book."* Dat is precies dezelfde fout in een
  ander jasje — een toezegging doen die Robert misschien niet kan waarmaken, zeker niet
  tijdens First Access als de groep nog niet rond is. Die zin is er weer uit voordat hij
  ergens heen ging.

**Hoe te controleren**
- `node --test tests/*.test.mjs` — **gedraaid, 83 geslaagd.**
- `grep -rniE "metres|meters|kilometer" --include="*.html" .` geeft niets.

**Niet geverifieerd**
- Of *"others from the same table"* klopt met hoeveel huisjes je in de praktijk gebruikt.
  Weet Robert dat zeker, dan mag het getal terug — maar dan als vaststaand feit, niet als
  ongeveer.

**Wat nu volgt**
- Dit valt binnen de release-kandidaat; het releasedocument hoeft niet aangepast, de
  wijziging staat erin als correctie.

---

### 2026-08-29 · Claude · Release-kandidaat klaargezet, niet gepusht · TE CONTROLEREN

**Wat**
- Nieuw: `operations/release-2026-08-29.md`. Wat een bezoeker erbij krijgt, wat bewust
  dicht blijft, wat er gecontroleerd is, en in welke volgorde het moet gebeuren.
- **Niet gepusht, niet gedeployed, geen Netlify-upgrade.** Zoals gevraagd.

**De release**
- Vijftig commits vóór op `origin/main`, 57 bestanden, ongeveer 4.000 regels erbij.
- Drie nieuwe publieke pagina's: `/tavern/private/`, `/terms/` en `/travel-information/`.
  De laatste twee zijn concept en staan op `noindex`.
- Veertien nieuwe beeldbestanden; de Tavern-assets wegen samen 1,5 MB, allemaal uitgesteld
  geladen behalve de hero.

**Vijf controles vóór ik dit een kandidaat noemde**
1. **Betalen blijft onmogelijk.** De drie publicatieconstanten zijn leeg; de checkout
   weigert zolang dat zo is. Deployen brengt de verkoop dus geen stap dichterbij, en dat is
   precies de bedoeling.
2. Geen teststeiger, geen nagebootste API, geen `localhost`-verwijzing buiten `tests/`.
   Het stubje dat de kalender lokaal zichtbaar maakt zit alleen in de preview, niet in de
   repo.
3. De conceptpagina's staan alle vier op `noindex`.
4. Geen persoonsgegevens, fiscale nummers of sleutels in de hele boom.
5. `console.log` staat alleen in de twee operatorscripts, waar het de uitvoer ís.
- Plus: `node --test tests/*.test.mjs` → **82 geslaagd, 0 gefaald.**

**Volgorde die ertoe doet**
- **Eerst de migratie in Supabase, dan pas deployen** — of accepteer dat de kalender
  verborgen blijft. Zonder `starts_on`, `ends_on` en `price_cents` verbergt de kalender
  zichzelf en neemt het oude keuzemenu het over; de checkout weigert in plaats van een
  prijs te gokken. Er gaat niets stuk, de functie verschijnt alleen niet.

**Niet geverifieerd**
- De release is niet op een testomgeving van Netlify gedraaid; er is lokaal getest met een
  statische server en met de suite.

**Wat nu volgt**
- Robert beslist over pushen. Netlify Free staat op 302,9 van 300 credits, dus een nieuwe
  productie-deploy vraagt de volgende cyclus of zijn eigen upgrade. Geen betaalkaart of
  planwijziging namens hem.
- Los daarvan: de juridische blokkades staan nog overeind en worden door geen enkele
  deploy opgelost.

---

### 2026-08-29 · Codex · Productie-release en Netlify-limiet doorgegeven · GECONTROLEERD door Claude, 2026-08-29

Robert wil de lokale verbeteringen binnenkort als één gecontroleerde release live zetten.
Claude moet de wijzigingen bundelen en testen, maar niet zelf pushen of Netlify upgraden.
Netlify Free heeft 302,9 van 300 credits gebruikt door eerdere deploys; de huidige
gepubliceerde versie blijft online met operationele credits. Voor een nieuwe deploy vóór
15 september 2026 is Roberts eigen Netlify-upgrade nodig.

**Nagelopen door Claude, 29 augustus 2026:** kandidaat klaargezet en gecontroleerd, zie het
item hierboven. Niet gepusht, niet gedeployed, geen upgrade namens Robert.

### 2026-08-29 · Claude · Doorgifte buiten de EU benoemd in de privacyverklaring · TE CONTROLEREN

**Wat**
- `privacy/index.html`: nieuwe sectie *Where in the world it goes* met per verwerker het
  land en het waarborgmechanisme, plus de mogelijkheid een kopie van die waarborg op te
  vragen.
- `tests/site.test.mjs`: nieuwe test die eist dat de verklaring zowel de doorgifte als het
  mechanisme noemt, en alle vier de verwerkers.

**Waarom, en wat er geverifieerd is**
- Artikel 13 lid 1 onder f van de AVG vraagt om de doorgifte én de waarborg waarop die
  rust. De verklaring noemde de verwerkers al bij naam maar zei niets over waar ze
  verwerken. Alle vier zijn nagekeken bij de bron, niet uit het hoofd:
  - **Netlify** (VS): standaardcontractbepalingen van de Europese Commissie **en**
    gecertificeerd onder het EU–VS Data Privacy Framework.
  - **Supabase**: verwerkt mogelijk in de **Verenigde Staten en Singapore**, onder diezelfde
    standaardcontractbepalingen.
  - **Stripe**: Europese handelaren contracteren met de Ierse entiteiten; voor doorgifte
    verder gebruiken zij standaardcontractbepalingen en het Data Privacy Framework.
  - **Resend** (Plus Five Five, Inc., VS): verwerkt in de Verenigde Staten.

**⚠️ Wat opviel bij Resend**
- Hun publieke privacybeleid **noemt geen enkel waarborgmechanisme**. Geen
  standaardcontractbepalingen, geen Data Privacy Framework — alleen dat er "adequate
  controls" zijn. Dat is voor de andere drie wel netjes gepubliceerd.
- Waarschijnlijk staat het in hun verwerkersovereenkomst en niet in het privacybeleid,
  maar dat is niet vast te stellen zonder die overeenkomst. In de verklaring staat daarom
  alleen het feit — dat zij in de Verenigde Staten verwerken — en geen mechanisme dat ik
  niet kan staven. Als nieuw punt in *Openstaand* gezet.

**Hoe te controleren**
- `node --test tests/*.test.mjs` — **gedraaid, 82 geslaagd.**
- Bronnen: stripe.com/legal/privacy-center · supabase.com/privacy · netlify.com/privacy ·
  resend.com/legal/privacy-policy, alle vier op 29 augustus 2026.

**Niet geverifieerd**
- In welke regio Roberts eigen Supabase-instantie draait. Voor de verklaring maakt dat
  niet uit: Netlify, Stripe en Resend verwerken sowieso buiten de EER, dus de clausule is
  hoe dan ook nodig. Voor de keuze van de regio zelf is het wel relevant.
- Ik ben geen jurist. Dit is nauwkeurig opgeschreven wat de verwerkers zelf publiceren.

**Wat nu volgt**
- Robert tekent de verwerkersovereenkomst met Resend, of kiest een verwerker die het
  mechanisme wel publiceert.

---

### 2026-08-29 · Claude · Feitelijke dubbelingen weg en een creditsbestand · TE CONTROLEREN

**Wat**
- `tavern/index.html`: drie plekken waar dezelfde feiten voor de derde of vierde keer
  stonden. *three nights* van 6 naar 5, *every meal* van 5 naar 3, *non-alcoholic* van 3
  naar 2, en de pagina van 2364 naar 2294 woorden.
  - De FAQ *"What's included?"* somde de hele lijst opnieuw op; hij verwijst nu naar de
    lijst hogerop en noemt alleen wat daar níét in staat: het welkomstgeschenk en dat de
    reis naar Asturië niet is inbegrepen.
  - De FAQ *"How do I get there?"* en het blok *Getting here* vertelden allebei het hele
    transferverhaal; de FAQ is teruggebracht tot het verschil.
  - Het blok *Food* herhaalde de maaltijdenregel uit de inbegrepen-lijst.
- Nieuw: `operations/image-credits.md` — per beeld de herkomst en de licentie. Staat in de
  repo maar niet op de site: `/operations/*` geeft 404 en `robots.txt` sluit het uit.
- `tests/site.test.mjs`: nieuwe test *"every image on the site is written down in the
  credits file"*.

**Waarom**
- Item 15 vroeg expliciet om de doublures over nachten, maaltijden en transfers. Ik had
  eerder alleen de sfeerherhaling aangepakt; dit is het feitelijke deel.
- Item 14 vroeg om een intern creditsbestand. Dat ontbrak. Nu ligt per beeld vast waar het
  vandaan komt, en de nieuwe test laat een beeld zonder herkomst omvallen in plaats van het
  stil te laten meeglijden.

**⚠️ Wat het opschrijven aan het licht bracht**
- **Zeven illustraties in `tavern/assets/` hebben geen vastgelegde herkomst.** De
  taverne-deuren, de dobbelstenen, de beer, de campagnelandschappen. Ze dateren van vóór
  dit bestand en niemand hier weet waar ze vandaan komen. Voor een site die een pakketreis
  verkoopt hoort dat dicht vóór publicatie: zijn ze gegenereerd, dan met welk gereedschap
  en staan de voorwaarden commercieel gebruik toe; komen ze uit een bibliotheek, dan welke
  en onder welke licentie. Ik heb niets ingevuld wat ik niet weet.
- **Twee bestanden zijn foto's van mensen**, geen illustraties: die van de Game Master en
  die van Robert. Die staan nu apart, met de toestemming erbij zoals Robert die op
  29 augustus bevestigde.

**Hoe te controleren**
- `node --test tests/*.test.mjs` — **gedraaid, 81 geslaagd.**
- `grep -c "" operations/image-credits.md` en de 404-regel in `_redirects`.

**Niet geverifieerd**
- De herkomst van die zeven illustraties. Dat is een vraag aan Robert of Codex, geen
  aanname die ik ga invullen.

**Wat nu volgt**
- Openstaand 14 en 15 zijn hiermee afgerond; de herkomstvraag staat als nieuw punt.

---

### 2026-08-29 · Claude · Piekbelasting getest en de limieten vastgelegd · TE CONTROLEREN

**Wat**
- Nieuw bestand `tests/load.test.mjs`: vier proeven met ongeveer honderd gelijktijdige
  aanvragen tegen de First Access-functie, met een nabootsing van de database die dezelfde
  regels volgt als `database/first-access.sql`. Raakt geen productiegegevens en komt niet
  bij Stripe.
- `operations/booking-runbook.md`: nieuwe sectie *Load and limits before opening*.

**Wat de proeven aantonen**
- Honderd verschillende bezoekers die tegelijk hetzelfde weekend vragen: er worden
  **precies zes** stoelen vergeven, geen zeven, en niemand krijgt een serverfout. De rest
  krijgt een alternatief of belangstelling voor later.
- Honderd aanvragen van één e-mailadres: vijf komen door, **vijfennegentig krijgen een
  nette 429**. Dat adres houdt hooguit één claim over.
- Honderd aanvragen vanaf één IP-adres: twaalf komen door, achtentachtig krijgen 429.
- Database weg: **alle vijftig aanvragen krijgen 503** met `booking_service_unavailable`,
  en er blijft geen halve claim achter.

**Wat de proeven níét aantonen**
- Het gedrag van PostgreSQL zelf onder gelijktijdige transacties. Dat is de rollbacktest in
  Supabase die Codex draait; deze test dekt de functielaag en het contract ertussen.
- Het contactformulier. Dat post naar **Netlify Forms**, niet naar een functie, dus het is
  lokaal niet te belasten. Dat staat als zodanig in het draaiboek.

**⚠️ Twee bevindingen die Robert vóór publicatie moet regelen — geverifieerd bij Supabase**
- **Een Supabase-project op het gratis plan wordt gepauzeerd na zeven dagen met weinig
  activiteit.** Een gepauzeerde database betekent dat First Access-aanvragen mislukken
  terwijl de site er normaal uitziet. Precies het scenario van een rustige week vlak voor
  de verkoop opengaat.
- **Op het gratis plan kun je geen back-up downloaden.** De privacyverklaring belooft dat
  boekings-, betaal- en factuurgegevens bewaard blijven zolang de wet dat eist. Dat is met
  een niet-downloadbare back-up niet hard te maken.
- Bron: https://supabase.com/docs/guides/platform/going-into-prod

**Hoe te controleren**
- `node --test tests/*.test.mjs` — **gedraaid, 80 geslaagd** (was 76; vier nieuwe).
- De verwachte aantallen in de test zijn hard: 95 en 88 keer 429, precies 6 stoelen. Gaat
  er iets aan de limieten schuiven, dan valt de test om in plaats van stilletjes mee te
  bewegen.

**Niet geverifieerd**
- De Netlify-quota. Die verschillen per plan; het draaiboek noemt welke je moet nakijken
  in het dashboard in plaats van een getal te beweren dat morgen anders is.

**Wat nu volgt**
- Robert: het Supabase-plan, vóór de eerste uitnodiging de deur uit gaat.

---

### 2026-08-29 · Claude · Tekst ingekort en ontdaan van AI-ritme · TE CONTROLEREN

**Wat**
- Negen passages op `tavern/index.html` herschreven en één op `index.html`. De pagina gaat
  van **2491 naar 2364 woorden**; de hoogte van 18.240 naar 12.884 px, deels door de
  schuifpresentatie van eerder.

**Wat er weg is, en waarom**
- **De "niet X maar Y"-constructie.** *"You do not simply play the adventure. You become
  part of it."* stond in de hero, en op de homepage stond de tweelingzin *"An adventure
  you don't just play — you become part of it."* Dat is de meest herkenbare
  AI-formulering die er is. Er staan nu feiten: *"Three nights, six players, one table.
  Every meal, your own room and a professional Game Master."*
- **Opgestapelde fragmenten.** *"The room is built. The table is in it. The fire is lit.
  The campaign is written."* — vier korte zinnen achter elkaar leest als een generator.
  Nu twee.
- **Oplopende opsommingen.** *"The tale is given room to breathe, to twist, to deepen and
  to draw you all the way in."* is geschrapt, net als *"There is only the table, the story
  and one question: what will your party do next?"*
- **Herhaling geteld en teruggebracht.** *fire* van 4 naar 2, *party* van 20 naar 14,
  *first* van 32 naar 25, *outside world* van 3 naar 1. Het slotblok herhaalde de
  openingssectie bijna woordelijk en is ingekort.
- **Eén sfeerzin vervangen door een feit.** De hook op de eerste weekendkaart was *"The
  first table. The first fire. Your only chance to be there when it begins."* — drie keer
  hetzelfde beeld plus urgentie. Nu: *"The opening weekend. Halloween falls on the
  Saturday."* Dat klopt: 30 oktober 2026 is een vrijdag, dus 31 oktober is de zaterdag van
  editie 1. Staat ook zo in Roberts briefing aan Story Forge.
- **"We are genuinely delighted that he is coming..."** is stijf en zegt niets. Nu: *"He
  comes to Asturias to run the opening weekend."*

**Wat bewust is blijven staan**
- *table* komt nog 24 keer voor. Dat is een tafelspel; de meeste keren zijn functioneel en
  verschillend. *first* staat er 25 keer, waarvan 8 als productnaam *First Access*.
- De mythische toon zelf is niet weggehaald. De opmerking ging over herhaling en over
  formuleringen die als machinewerk lezen, niet over sfeer. Die verkoopt een weekend van
  €2.025; die weghalen zou het middel erger maken dan de kwaal.
- **Er zijn geen claims bijgekomen** over lokale partners of activiteiten, zoals gevraagd.

**Hoe te controleren**
- `node --test tests/*.test.mjs` — **gedraaid, 76 geslaagd.**
- Pagina in de browser doorlopen op 1000 px; hero, manifest, weekendkaart en slotblok
  tonen de nieuwe tekst.

**Niet geverifieerd**
- Of dit ver genoeg gaat. Dit is een oordeel over toon, geen meting. De vriend die het
  opmerkte is de beste toets.

**Wat nu volgt**
- Robert leest het na en zegt of het genoeg is of dat er nog een ronde overheen moet.

---

### 2026-08-29 · Codex · Feedback over herhaling en echtheid doorgezet · GECONTROLEERD door Claude, 2026-08-29

Roberts vriend vindt de site visueel sterk, maar signaleert herhaling en te veel
AI-achtige formuleringen. De locatie-, verblijf- en activiteiteninformatie is inmiddels
wel concreter en er staan echte, gecrediteerde sfeerfoto’s. Claude moet nu de copy
inkorten en feitelijker maken; er mogen geen onbevestigde claims over lokale partners of
activiteiten bijkomen.

**Nagelopen door Claude, 29 augustus 2026:** uitgevoerd, zie het item hierboven. De
herhaling is geteld voor en na, en er is geen enkele claim bijgekomen.

### 2026-08-29 · Claude · Sfeersectie wordt een schuifpresentatie · TE CONTROLEREN

**Wat**
- De zes beelden staan niet meer naast elkaar maar als één presentatie: één foto met
  bijschrift tegelijk, die om de drie seconden doorschuift. Pijlen links en rechts,
  stippen eronder, vegen op een telefoon, en de pijltjestoetsen op een toetsenbord.
- Nieuw bestand `tavern/surroundings.js`. De slotalinea met de herkomst is op verzoek van
  Robert verwijderd.
- `tests/site.test.mjs`: nieuwe test *"the photograph slider can be steered and does not
  move under the reader"*.

**Waarom / hoe**
- **Het schuiven zelf zit in CSS, niet in JavaScript.** Het spoor is een gewone
  horizontale scroller met `scroll-snap`. Daardoor werkt vegen ook als het script niet
  laadt; de knoppen sturen datzelfde spoor aan. Zonder script blijven alle zes foto's
  gewoon bereikbaar.
- **Automatisch doorschuiven stopt zodra de bezoeker zelf stuurt** — klik, veeg, scrol of
  toets — en komt niet meer terug. Iets dat onder je vinger wegbeweegt terwijl je kijkt is
  vervelender dan een presentatie die stilstaat. Verder staat het stil buiten beeld, in
  een verborgen tabblad, en zolang de muis of het toetsenbord erop staat. Wie beweging
  heeft uitgezet in zijn systeeminstellingen krijgt helemaal geen automatisch verloop.
- **De slotregel is weg, maar één zin eruit is verhuisd naar de inleiding:** *"These are
  photographs of the region, not of the Tavern itself."* Die doet echt werk — de
  beeldclausule in de voorwaarden belooft dat er echte foto's bestaan én dat een beeld
  geen beschrijving van het verblijf is. Naamsvermelding is bij Pexels niet verplicht, dus
  het schrappen daarvan mag.

**Hoe te controleren**
- `node --test tests/*.test.mjs` — **gedraaid, 76 geslaagd.**
- In de browser gemeten: vanaf stip 0 na zeven seconden vanzelf op stip 2; één klik op
  volgende brengt hem op 3; daarna zeven seconden wachten en hij staat nog steeds op 3.
  Op 375 px schuift het spoor mee met een veeg en volgen de stippen; geen horizontale
  overloop op de pagina.

**Niet geverifieerd**
- Echt vegen met een vinger is niet getest, alleen de schuifpositie die een veeg
  oplevert. Het onderliggende mechanisme is standaard browsergedrag.

**Wat nu volgt**
- De twee bijschriften wachten nog op Robert: is het stenen huis het verblijf, en waar is
  de luchtfoto genomen.

---

### 2026-08-29 · Claude · Sfeersectie over Asturië, met licentiecontrole · TE CONTROLEREN

**Wat**
- Nieuwe sectie *"And when the dice are down."* op `tavern/index.html`, na Fontecha: drie
  foto's met bijschriften — het huis, de Picos de Europa en de kust — plus een regel die
  benoemt dat het echte foto's zijn en waar ze vandaan komen.
- Drie nieuwe bestanden in `tavern/assets/`: `surroundings-house.webp` (101 kB),
  `surroundings-picos.webp` (64 kB), `surroundings-coast.webp` (87 kB).
- `tests/site.test.mjs`: nieuwe test *"the surroundings are real photographs, credited and
  described"*.

**Licentie — geverifieerd, niet aangenomen**
- Bron gecontroleerd op https://www.pexels.com/license/. Letterlijk: *"All photos and
  videos on Pexels are free to use"* en *"Attribution is not required."* De beperkingen
  gaan over doorverkoop, merkgebruik en gesuggereerde sponsoring; geen daarvan raakt deze
  toepassing. Codex' voorzichtigheid was terecht als houding, maar de licentie staat dit
  gebruik gewoon toe.
- Er staat tóch een naamsvermelding onder de sectie. Dat kost niets en het versterkt de
  positie die we vandaag in de voorwaarden hebben ingenomen: dit zijn echte foto's, met
  een herkomst.

**⚠️ Belangrijk voor Robert — persoonsgegevens tussen het aangeleverde beeld**
- Een van de vijf bestanden, `IMG_1762.HEIC` in `~/Downloads`, is **geen sfeerbeeld maar
  een foto van een RETA-inschrijving** met NIE, telefoonnummer, e-mailadres en een
  instapkaart in beeld. Die is **niet** gebruikt en hoort nergens op de site of in de
  repo. Het bestand is niet aangeraakt of verplaatst; Robert is erover ingelicht.
- Dat nummer is ook **niet** gebruikt om *Openstaand* punt 1 in te vullen. Wat er publiek
  komt te staan beslist Robert zelf, niet een assistent die het ergens tegenkwam.

**Hoe te controleren**
- `node --test tests/*.test.mjs` — **gedraaid, 75 geslaagd.**
- Visueel op 1100 × 780 en 375 × 812: drie tegels van 4:3, geen horizontale overloop.
- Twee dingen zaten er eerst naast en zijn hersteld: de tegels werden 675 px hoog omdat
  het `height`-attribuut van de afbeelding won van de opgegeven verhouding, en de
  automatische uitsnede koos bij het huis de lucht in plaats van het huis.

**Niet geverifieerd — vraag aan Robert**
- **De bijschriften.** Ik weet niet zeker of de stenen woning op `IMG_1725.HEIC` het
  daadwerkelijke verblijf is; het bijschrift zegt nu *"Where you sleep"*. Klopt dat niet,
  dan moet het bijschrift veranderen — dat is precies het soort claim waar we vandaag de
  hele dag streng op zijn geweest.
- Van de luchtfoto weet ik niet welke kustplaats het is; het bijschrift blijft daarom
  algemeen bij *"The coast"*.

**Uitgebreid, later dezelfde dag**
- Op verzoek van Robert van drie naar **zes** beelden: er kwamen een mistige bergweide met
  vee, een hooggelegen meer met wandelpad en een kliffenkust bij. Alle drie via Pexels
  opgehaald, samen 576 kB voor de hele sectie, allemaal uitgesteld geladen.
- **Plaatsnamen bewust uit de bijschriften gehouden.** Pexels' eigen omschrijving van
  Roberts kustfoto zegt *"near Escamplero"*, en Escamplero ligt landinwaarts bij Oviedo.
  Hun beschrijvingen zijn dus geen betrouwbare bron voor een locatie. De bijschriften
  zeggen daarom wat er te zien is; de plaatsnamen — Covadonga, Ponga, Ribadesella,
  Gijón — staan in de inleidende zin als feit over Asturië, niet gekoppeld aan een
  specifieke foto. Zo kan geen enkel beeld een plaats claimen die niet klopt.
- De slotregel zegt nu ook expliciet: *"They show Asturias, not the Tavern itself."*
- Eén uitsnede is overgedaan: bij het meer sneed ik uit het midden terwijl het water
  onderin zit, waardoor het meer vrijwel verdween.

**Wat nu volgt**
- Robert bevestigt of weerlegt die twee bijschriften.

---

### 2026-08-29 · Codex · Omgevingsbeelden als volgende Claude-opdracht · GECONTROLEERD door Claude, 2026-08-29

Robert wil een visuele slide voor een indruk van Asturias en activiteiten rond de
Tavern. De aangeleverde internetbeelden zijn niet automatisch vrijgegeven voor
commercieel gebruik; licentiecontrole en credits zijn daarom onderdeel van de opdracht.
Claude bouwt dit pas na de technische testblokkade en zonder de verkoopbeveiliging te
omzeilen.

**Nagelopen door Claude, 29 augustus 2026:** gebouwd, zie het item hierboven. De
licentie is bij Pexels zelf gecontroleerd en staat dit gebruik toe. Eén aangeleverd
bestand bleek persoonsgegevens te bevatten en is niet gebruikt.

### 2026-08-29 · Claude · Hangende suite onderzocht, en de netwerkval gedicht · TE CONTROLEREN

**Wat**
- `tests/checkout.test.mjs`, `tests/first-access.test.mjs`,
  `tests/first-access-invitations.test.mjs`: de onderschepping van `fetch` laat niets meer
  door naar het echte netwerk. Alles wat niet expliciet naar de lokale mockserver wordt
  omgeleid, faalt nu meteen met `test_reached_the_network: <url>`. De `after`-haken sluiten
  de mockserver echt af, inclusief openstaande verbindingen, en wachten dat af.
- `tests/database-integration.sql`: een tweede controleblok dat in één sessie bewijst
  waaróm de fasechecks `clock_timestamp()` gebruiken — `now()` staat stil binnen de
  transactie, `clock_timestamp()` loopt door — en daarna aantoont dat een deadline die
  tijdens het wachten verstrijkt de aanvraag ook echt tegenhoudt.

**Waarom**
- **Ik kan het vastlopen niet reproduceren.** `node --test tests/checkout.test.mjs` liep
  hier viermaal achter elkaar in onder de seconde: 24 tests, alle geslaagd, ook met
  `--test-concurrency=1`. De volledige suite doet 74 in één seconde. Zelfde binary
  (`~/.local/node/bin/node`, v24.20.0), zelfde commit.
- Wat wél opviel: de mockserver luistert op poort 0, dus een poortconflict kan het niet
  zijn — maar de oude onderschepping stuurde elk niet-herkend verzoek door naar het echte
  internet. In een omgeving zonder netwerktoegang blijft zo'n verzoek hangen tot een
  time-out, en dan lijkt de suite stil te staan zonder te zeggen waarop. Dat is de enige
  plausibele oorzaak die ik in de code kon vinden, en die is nu weg: zo'n verzoek faalt
  direct en noemt de URL.
- Daarnaast sloot `server.close()` zonder te wachten en zonder open verbindingen te
  verbreken. Dat houdt een Node-proces aan het eind in leven. Ook dat is gedicht.

**Hoe te controleren — voor Codex**
- Draai `node --test tests/*.test.mjs` opnieuw. Loopt het nog vast, dan noemt de fout nu
  de URL waarop het stukloopt; stuur die regel door, dan weten we het meteen.
- Draai `database/first-access.sql` gevolgd door `tests/database-integration.sql`. Het
  nieuwe blok is de aantoonbare regressietest voor de tijdrace waar je om vroeg. Hij duurt
  ongeveer een seconde langer door een korte `pg_sleep`.

**Niet geverifieerd**
- Of dit de oorzaak bij jou was. Ik heb een reële valkuil weggenomen, geen bewezen
  diagnose gesteld.

**Wat nu volgt**
- Openstaand 1, 2 en 3 waren al hersteld in `40cfe90`; ze staan hieronder afgesloten met
  de verwijzing daarheen.

---

### 2026-08-29 · Codex · Verkoopgereedheid opnieuw beoordeeld · GECONTROLEERD door Claude, 2026-08-29

**Uitkomst**
- **Nog geen betaalde verkoop vrijgeven.** De technische poort werkt correct en houdt
  betalingen dicht, maar de RC/caución/RECE0033T06-route, definitieve klantdocumenten,
  wettelijke standaardinformatie, garantiegegevens en ontbrekende openbare
  bedrijfsgegevens zijn nog niet afgerond.
- De drie reparaties van Claude zijn in code en statische regressietests aanwezig. De
  volledige integratiesuite hangt echter in `checkout.test.mjs`; zie openstaand punt 0.
- Tot beide groepen punten zijn gesloten mag de site wel marketing, First Access en
  vragen verzamelen, maar geen betaalde boeking accepteren.

**Voor Claude**
- Los punt 0 op en laat de hele Node-suite groen eindigen.
- Bouw geen omweg om `_booking-config.mjs`: de drie lege publicatieconstanten blijven
  leeg totdat Robert de externe stukken werkelijk heeft.
- Daarna alleen technische voorbereiding en visuele verbetering; verzin geen juridische
  nummers, garanties of documentinhoud.

**Nagelopen door Claude, 29 augustus 2026:** eens met de uitkomst — geen betaalde verkoop
vrijgeven. Punt 0 onderzocht, zie het item hierboven; niet reproduceerbaar, maar de meest
plausibele oorzaak is weggenomen. Punt 1, 2 en 3 waren al hersteld in `40cfe90` en zijn
daarom uit *Openstaand* gehaald; de databaseproef erover blijft bij Codex.

### 2026-08-29 · Claude · De drie bevindingen van Codex hersteld · GECONTROLEERD door Codex, 2026-08-29

Codex heeft de gewijzigde betaalfunctie, SQL-functies, kalenderlogica en regressietests
nagelezen. De volledige Node-suite is groen. De echte Supabase-rollbacktest is aangevuld
met een afwijkende prijs en bevestigt dat die prijs zowel uit de hold terugkomt als op de
claim wordt vastgezet; de rollback liet geen schema- of testdata achter.

**Wat**
- **P0 prijsverschil.** `create-checkout-session.mjs` rekent niet langer de vaste
  `202500` af. Het bedrag komt uit de hold, die het uit dezelfde weekendrij haalt als de
  prijs die de bezoeker zag. Staat er een onmogelijk bedrag in — geen geheel getal, of
  buiten €10 tot €10.000 per persoon — dan gaat er niets naar Stripe, worden de stoelen
  weer vrijgegeven en volgt een 503.
- **Prijs vastgelegd op de claim.** `tavern_seat_claims` krijgt `price_cents`. Bij het
  vasthouden van stoelen wordt de geldende prijs erin gezet, en bij hervatten telt die
  vastgelegde prijs, niet een intussen gewijzigde. Zo blijft na te gaan wat er met deze
  gast is afgesproken.
- **P0 deadline-race.** Zestien tijdvergelijkingen in `database/first-access.sql` gebruiken
  nu `clock_timestamp()` in plaats van `now()`: alle vergelijkingen met een deadline of
  vervaltijd, plus de drie plekken waar we zelf een vervaltijd uitrekenen. De tijdstempels
  die alleen vastleggen wanneer iets gebeurde blijven `now()`.
- **P1 kalender-fit.** Een weekend geldt in de kalender als onbeschikbaar zodra de hele
  groep er niet meer bij past, niet pas als de laatste stoel weg is. De automatische
  voorselectie kijkt naar hetzelfde, en een eerder gekozen weekend wordt losgelaten zodra
  de groep te groot wordt. De reden staat in het label: *"only 2 of 6 seats free, not
  enough for 3"*. De prijsregel toont geen totaal meer voor een groep die niet past.
- Vier nieuwe tests, en drie bestaande omgedraaid: die eisten `now()` en eisen nu
  `clock_timestamp()`.

**Waarom**
- Codex' drie bevindingen waren alle drie terecht. Het prijspunt was ik zelf aan het
  repareren toen zijn controle binnenkwam — Robert stelde dezelfde vraag bijna
  gelijktijdig: *"de site moet niet zeggen dat het 2000 euro kost en dan 9000 afboeken."*
- De ondergrens en bovengrens op de prijs vangen een typefout in Supabase op. Eén nul te
  veel maakt van €2.025 ineens €20.250; dat bereikt Stripe nu niet.

**Hoe te controleren**
- `node --test tests/*.test.mjs` — **gedraaid, 74 geslaagd, 0 gefaald.**
- In de browser met een weekend met nog twee vrije stoelen: bij twee personen klikbaar,
  bij drie geblokkeerd met de reden in het label.
- Nieuwe tests bewijzen dat er geen vast bedrag meer in de betaalfunctie staat, dat het
  bedrag uit de hold als `unit_amount` naar Stripe gaat, en dat acht soorten onmogelijke
  prijs de betaling stoppen in plaats van hem te versturen.

**Niet geverifieerd — voor Codex**
- De SQL is niet tegen Supabase gedraaid. Nodig: opnieuw uitvoeren met de rollbacktest,
  en de twee-verbindingenproef die Codex zelf voorstelde — een First Access-transactie die
  vóór de deadline begint maar het slot pas erna krijgt, moet nu alsnog geweigerd worden.
- Controleer ook dat `price_cents` op de claim wordt vastgelegd en bij hervatten voorgaat.

**Wat nu volgt**
- Na die databaseproef is er geen technisch punt meer open uit de controle van Codex.

---

### 2026-08-29 · Codex · Controle van Claude-ronde tot d6954df · GECONTROLEERD door Claude, 2026-08-29

**Wat**
- De volledige wijzigingsreeks `614d6c4..d6954df` gelezen en gecontroleerd.
- `node --test tests/*.test.mjs`: **70 tests geslaagd, 0 gefaald**.
- `database/first-access.sql` plus `tests/database-integration.sql` uitgevoerd in één
  echte Supabase-transactie met `rollback`; geen testgegevens achtergelaten.
- Extra databaseproef: betaling 2 minuten na `hold_expires_at` werd `paid`, 10 minuten
  erna bleef `expired`; kalenderdatums en de standaardprijs van 202500 cent werkten.
- Privacygrondslagen, AEPD-klachtroute en de notitie over het wettelijke
  standaardinformatieformulier vergeleken met officiële AEPD/LSSI/BOE-bronnen. Geen
  concrete nieuwe juridische regressie gevonden; de al genoemde externe gaten blijven.

**Waarom / gevonden**
- **P0 prijsverschil:** de UI leest `price_cents`, Stripe rekent nog altijd de vaste
  literal `202500`. Een gewijzigde weekendprijs kan daardoor anders worden getoond dan
  geïncasseerd.
- **P0 deadline-race:** de checks staan na de advisory lock, maar PostgreSQL `now()`
  blijft de transactiestarttijd. Een aanvraag die vóór de deadline start en op de lock
  wacht, kan daarna nog met de oude tijd worden beoordeeld. Gebruik `clock_timestamp()`
  voor de fasechecks onder de lock.
- **P1 kalender-fit:** kalenderknoppen en automatische selectie kijken alleen of er ten
  minste één stoel vrij is; het menu kijkt terecht of de volledige groep past. Daardoor
  kan een groep van drie visueel een weekend met twee vrije stoelen kiezen. De server
  overboekt niet, maar de UI moet dit eerder en eerlijk aangeven.
- De gedeelde holdconstant van 40 minuten, de vijf minuten bevestigingsmarge, de nieuwe
  privé-route, verborgen-toestandenfix, WebP-afbeeldingen en receipt/privacywijzigingen
  zijn in deze controle technisch consistent bevonden.

**Hoe te controleren**
- Voeg een afwijkende `price_cents` toe in een test en bewijs dat exact dat bedrag als
  Stripe `unit_amount` wordt verstuurd én als snapshot op de claim staat.
- Test de deadline met twee databaseverbindingen waarbij de First Access-transactie vóór
  de deadline begint maar pas erna de advisory lock krijgt.
- Test een groep van drie tegen een weekend met twee vrije stoelen in de kalender.
- Draai daarna opnieuw de volledige Node-suite en de Supabase rollbacktest.

**Niet geverifieerd**
- Visuele browsercontrole van elke nieuwe kalendertoestand is in deze Codex-ronde niet
  herhaald; Claude heeft desktop en mobiel eerder zelf bekeken.
- De nieuwe databasekolommen zijn nog niet naar productie gemigreerd en niets uit deze
  ronde is naar `main` gepusht of live gezet.

**Wat nu volgt**
- Claude of Codex herstelt eerst de drie technische punten hierboven. Daarna volgt een
  nieuwe onafhankelijke controle vóór enige publicatie.

**Nagelopen door Claude, 29 augustus 2026:** alle drie de punten nagerekend in de code en
alle drie terecht bevonden. Hersteld; zie het logboekitem hierboven. De twee database-
proeven die Codex voorstelt kan Claude niet draaien en staan als open punt terug bij hem.

---

### 2026-08-29 · Claude · Twee ontbrekende verplichtingen in de privacyverklaring · GECONTROLEERD door Codex, 2026-08-29

Codex heeft de tekst, de afwezigheid van trackers, de volledige testsuite en de genoemde
officiële AEPD-grondslagen gecontroleerd. Geen concrete regressie gevonden; doorgifte
buiten de EER blijft terecht openstaan.

**Wat**
- `privacy/index.html`: nieuwe sectie *On what basis* met per doel de grondslag, en in
  *Your rights* de klachtmogelijkheid bij de Agencia Española de Protección de Datos of
  bij de toezichthouder van het eigen land.

**Waarom**
- De AVG schrijft allebei voor: artikel 13 lid 1 onder c vraagt de grondslag per
  verwerking, artikel 13 lid 2 onder f de klachtroute. De verklaring beschreef wel wát er
  gebeurt en waarom, maar niet op welke grondslag, en noemde de klachtroute niet.
- De rest van de verklaring is juist goed: verwerkers staan bij naam (Netlify, Supabase,
  Stripe, Resend), bewaartermijnen zijn per soort gegeven beschreven, en er wordt niets
  verkocht of met adverteerders gedeeld.
- Nagekeken en bevestigd: **er staat geen enkele tracker, analytics- of cookiescript op de
  site.** Daarmee is een cookiebanner niet nodig en vervalt dat hele hoofdstuk.

**Hoe te controleren**
- `node --test tests/*.test.mjs` — **gedraaid, 70 geslaagd**.
- `grep -rniE "gtag|analytics|hotjar|matomo|cookie" --include="*.html" --include="*.js" .`
  geeft niets.

**Niet geverifieerd**
- Doorgifte buiten de EU is nog niet benoemd. Zie *Openstaand* punt 6.

**Wat nu volgt**
- De drie nieuwe punten in *Openstaand* zijn de echte juridische gaten. De rest van de
  site dekt zichzelf inmiddels goed af tegen misleiding.

---

### 2026-08-29 · Claude · Smal aantalveld met een totaalvakje ernaast · TE CONTROLEREN

**Wat**
- `tavern/index.html`: het veld *How many of you?* is smal geworden (112 px, 96 px op een
  telefoon) met daarnaast een vakje **Total** in dezelfde stijl als de invoervelden.
- `tavern/first-access.js`: dat vakje toont het totaalbedrag voor de ingevulde groep. De
  regel onder de kalender houdt alleen de prijs per persoon; de twee vullen elkaar aan in
  plaats van hetzelfde te herhalen.
- `tests/site.test.mjs`: nieuwe test *"the party size sits next to a total that follows
  it"*.

**Waarom**
- Een breed getallenveld voor een cijfer van één teken is verspilde ruimte, en het
  totaalbedrag hoort naast het aantal te staan waar het bij hoort.
- Het vakje is een `<output>` en geen `<input>` of `<div>`. Dat is precies waar dat
  element voor bedoeld is: een schermlezer meldt de nieuwe waarde zodra die verandert, en
  het wordt niet als formulierveld meegestuurd. Een test bewaakt dat er geen `name` op komt.
- De labels zijn ongelijk lang, dus de twee velden lijnen uit op hun **onderkant**. Op
  `align-items: start` zakte het invoerveld weg onder het prijsvakje omdat *How many of
  you?* over twee regels breekt.
- Past de groep niet in het weekend, of levert de database geen prijs, dan staat er
  *Enter a number* of *On request* in plaats van een bedrag. Nooit een totaal voor een
  boeking die niet kan.

**Hoe te controleren**
- `node --test tests/*.test.mjs` — **gedraaid, 70 geslaagd**.
- In de browser op 820 × 660 en op 375 × 812: bij 2 personen staat er €4,050, bij 4
  personen €8,100, de onderkanten van beide velden liggen gelijk en er is geen
  horizontale overloop.

**Niet geverifieerd**
- Niets openstaand bij dit punt.

**Wat nu volgt**
- Robert beslist welke weekenden hij wil draaien.

---

### 2026-08-29 · Claude · Prijs bij het gekozen weekend, meelopend met de groep · TE CONTROLEREN

**Wat**
- `database/first-access.sql`: `tavern_weekends` krijgt `price_cents integer not null
  default 202500 check (price_cents > 0)`, en `get_tavern_availability` geeft dat mee als
  `priceCents`.
- `tavern/first-access.js`: de regel onder de kalender toont nu ook de prijs. Zonder
  ingevuld aantal: *"€2,025 per person, including taxes."* Met een aantal ingevuld:
  *"€4,050 for 2 guests — €2,025 each, including taxes."* Het aantalveld werkt de regel
  meteen bij.
- `tests/site.test.mjs`: nieuwe test *"the price shown with a weekend comes from the
  database and follows the party size"*.

**Waarom**
- Robert wil dat bezoekers zien wat het voor hún groep kost, niet alleen per persoon.
- **De prijs staat bewust in de database en niet in het script.** Hij stond al op twee
  plekken — in de HTML en in `create-checkout-session.mjs` — en een derde kopie is precies
  hoe er straks weer een verouderde prijs blijft hangen. De test verbiedt nu ook letterlijk
  dat het bedrag in het script terugkomt.
- De kolom hangt per weekend, niet globaal, omdat de plannen een seizoenseditie met een
  andere prijs noemen.
- **De prijs zit niet in de seed.** Die insert draait bij elke migratie opnieuw met
  `on conflict do update`; zou de prijs erin staan, dan zou een prijs die Robert zelf in
  Supabase aanpast bij de volgende migratie stilletjes teruggezet worden. Een test bewaakt
  dat.
- Levert de API geen prijs, dan zwijgt de regel erover in plaats van iets te gokken. En bij
  een groep die niet in het weekend past, verschijnt geen totaalbedrag — alleen de prijs
  per persoon.

**Hoe te controleren**
- `node --test tests/*.test.mjs` — **gedraaid, 69 geslaagd**.
- In de browser doorlopen met 1, 2, 4 en 7 personen: bij 1 staat er één bedrag, bij 2 en 4
  het totaal plus de prijs per persoon, en bij 7 — meer dan de zes stoelen — valt hij terug
  op alleen de prijs per persoon.

**Niet geverifieerd**
- De migratie staat nog steeds open bij Codex; nu met drie kolommen erbij in plaats van
  twee.

**Wat nu volgt**
- Robert beslist welke weekenden hij wil draaien.

---

### 2026-08-29 · Claude · Vakjes leeg, het aantal stoelen groot eronder · TE CONTROLEREN

**Wat**
- `tavern/index.html` en `tavern/first-access.js`: in de dagvakjes staat nu alleen de
  datum, gecentreerd. Alle aanduidingen van stoelen in de cel zijn weg — eerst het
  pilletje *"6 vrij"*, daarna de zes bolletjes.
- De regel onder de kalender is groter en vet: Poppins 700, oplopend van 1,05 tot
  1,22 rem, in crème in plaats van beige. Daar staat *"Chosen: Weekend 01 · 30 Oct to
  2 Nov 2026 — 6 of 6 seats free."* De aanhef was eerst *Chosen*; op verzoek van Robert
  is dat *Selected weekend* geworden.
- `tests/site.test.mjs`: de test heet nu *"a day cell shows only its date, and the seat
  count is read out below"* en bewaakt dat er geen meter of pilletje terugkomt.

**Waarom**
- Drie pogingen, en dit is de derde: een getal in de cel, toen zes segmenten, toen zes
  bolletjes. Robert vond ze alle drie niet werken, en achteraf is dat ook te verklaren —
  een vakje van 38 tot 46 pixels is simpelweg te klein voor iets naast een datum. Alles
  wat je erin propt, concurreert met het enige dat er hoort te staan.
- Het aantal stoelen is niet onbelangrijk, het staat alleen op de verkeerde plek. Onder
  de kalender is er ruimte voor een volledige zin, en die kan groot en vet. Het staat
  bovendien nog steeds in het `aria-label` en de tooltip van elke weekendknop, dus wie
  zweeft of laat voorlezen krijgt het per weekend te horen.

**Hoe te controleren**
- `node --test tests/*.test.mjs` — **gedraaid, 68 geslaagd**.
- In de browser nagemeten: de regel staat op 16,8 px met gewicht 700, en er staat geen
  enkel restant van de meter of het pilletje meer in de opgebouwde kalender.

**Niet geverifieerd**
- Niets openstaand bij dit punt.

**Wat nu volgt**
- Robert beslist welke weekenden hij wil draaien.

---

### 2026-08-29 · Claude · Stoelen als bolletjes in plaats van een getal · ACHTERHAALD, zie het item hierboven

**Wat**
- `tavern/index.html` en `tavern/first-access.js`: het pilletje *"6 vrij"* op de vrijdag
  van elk weekend is vervangen door zes bolletjes in twee rijtjes van drie. Ingekleurd is
  bezet, open is nog vrij. Bij twee stoelen of minder kleuren ze goud, bij het gekozen
  weekend wit op oranje, bij een vol weekend vlak gevuld.
- `tests/site.test.mjs`: nieuwe test *"seat availability is shown as one dot per seat,
  with a text alternative"*.

**Waarom**
- Een getal moet je lezen; een rij bolletjes zie je. Bij het aftasten van een kalender
  met veel weekenden scheelt dat echt.
- **Eerste poging was een balkje van zes segmenten en die is verworpen.** Op ware grootte
  waren de segmenten ongeveer vier pixels breed en las het als een streepjespatroon, niet
  als telbare stoelen. Bolletjes in een raster van drie bij twee zijn op desktop 10 × 10
  px en op mobiel 8 × 8 px — dat telt wel.
- De bolletjes staan op `aria-hidden`, want een rij vormpjes zegt niets tegen een
  schermlezer. Het aantal staat voluit in het `aria-label` van de knop, en sinds deze
  wijziging ook in een `title` zodat het bij zweven als tekst verschijnt.
- Bij een tafel groter dan acht stoelen worden de bolletjes te klein om te tellen. Dan
  valt de weergave terug op een getal; dat is eerlijker dan een raster dat niets zegt.

**Hoe te controleren**
- `node --test tests/*.test.mjs` — **gedraaid, 68 geslaagd**.
- In de browser met een nagebootst antwoord waarin weekend 02 nog twee stoelen vrij heeft:
  30 oktober toont zes open bolletjes, 6 november vier ingekleurde en twee open. Op
  mobiel past de meter binnen de cel van 38 × 44 px zonder overloop.

**Niet geverifieerd**
- Niets openstaand bij dit punt.

**Wat nu volgt**
- Robert beslist welke weekenden hij wil draaien.

---

### 2026-08-29 · Claude · Eigen privé-pagina en een beeldclausule · TE CONTROLEREN

**Wat**
- Nieuw: `tavern/private/index.html` en `tavern/private/private.js`. Een eigen pagina voor
  privé-aanvragen met naam, e-mail, aantal spelers (4–12), gewenste periode, het verhaal
  achter de vraag en toestemming. Opgenomen in `sitemap.xml`.
- `tavern/index.html`: de knop *"Plan a private Tavern →"* en de regel onder de kalender
  wijzen allebei naar die pagina. De schakelaar in het formulier van vanmiddag is weg —
  één route in plaats van twee bedieningen voor hetzelfde.
- `legal/index.html`: nieuwe sectie *Images on this website*. `terms/index.html`: nieuwe
  sectie *Images and descriptions*.
- `tavern/index.html`, Fontecha-sectie: een regel dat de accommodatie zelf foto's
  publiceert, met een knop met Instagram-icoon naar
  `instagram.com/fontecha_asturias`. Diezelfde bron staat nu ook in beide juridische
  teksten.
- `tests/site.test.mjs`: de test over de privé-route beschrijft de nieuwe opzet.

**Waarom**
- De privé-aanvraag hoort een eigen plek met eigen uitleg, niet een regel in een menu of
  een omschakelende stand van hetzelfde formulier.
- De pagina gebruikt **de bestaande aanvraagfunctie** met `weekend: 'private'`; die route
  is al beproefd en kent al de ondergrens van vier spelers en de snelheidslimieten. De
  gewenste periode gaat mee in het berichtveld, want de server kent geen apart veld
  daarvoor en dat wilde ik er niet voor openbreken.
- Een deel van het beeldmateriaal op de site is niet fotografisch. Zonder iets erover te
  zeggen kan een gast zich met recht misleid noemen. **Let wel: een disclaimer repareert
  een misleidend beeld niet.** Onder Europees recht helpt kleine lettertjes je niet als
  een afbeelding wezenlijk iets anders belooft dan je levert. Wat wél beschermt is dat er
  echte foto's te vinden zijn, en dat de illustraties de plek niet mooier maken dan hij
  is. Vandaar dat de verwijzing naar het account van de accommodatie er ook staat: dat is
  het inhoudelijke deel, de clausule is het formele deel.

**Hoe te controleren**
- `node --test tests/*.test.mjs` — **gedraaid, 67 geslaagd**. Twee tests vielen onderweg
  om en deden precies hun werk: de nieuwe pagina miste de `[hidden]`-beschermregel, en de
  test over de privé-knop beschreef nog de oude schakelaar.
- In de browser bekeken op 1100 × 800: de privé-pagina toont de zeven velden, geen
  horizontale overloop; de Instagram-knop bij Fontecha wijst naar het juiste account,
  opent in een nieuw tabblad met `rel="noopener noreferrer"`.

**Niet geverifieerd**
- Het formulier op de privé-pagina is niet echt verstuurd; de functie draait lokaal niet.
  Codex kan dat natesten met een echte aanvraag die op `private_inquiry` uitkomt.

**Wat nu volgt**
- Robert beslist welke weekenden hij wil draaien.

---

### 2026-08-29 · Claude · Keuzemenu wordt uitleesveld, privé-Tavern krijgt eigen route · TE CONTROLEREN

**Wat**
- `tavern/index.html`: het keuzemenu *Which weekend?* zit nu in een omhulsel
  `data-weekend-field` dat visueel wordt weggeklapt zodra de kalender werkt. Wat de gast
  ziet is de regel *"Chosen: Weekend 01 · 30 Oct to 2 Nov 2026 — 6 of 6 seats free."*
  Nieuw: een knop *"Planning a private Tavern for 4 to 12 players? →"* en een toelichting
  die alleen in privé-modus verschijnt.
- `tavern/first-access.js`: schakelt tussen twee standen. In privé-modus verdwijnt de
  kalender, komt de toelichting tevoorschijn, loopt het aantal deelnemers van 4 tot 12 en
  heet de knop *Send my request →*. Terugschakelen herstelt alles inclusief het eerder
  gekozen weekend.
- `tests/site.test.mjs`: nieuwe test *"the weekend menu becomes a read-out and a private
  Tavern has its own route"*.

**Waarom**
- Robert wil geen keuzemenu meer naast de kalender; het hoeft alleen te tonen wat er
  gekozen is. En een privé-Tavern hoort een eigen ingang te hebben in plaats van een
  regel in een lijst met weekenden.
- **Het menu is weggeklapt, niet weggehaald.** Twee redenen. Het blijft het veld dat
  verstuurd en door de browser gevalideerd wordt, en het is de terugval als de database
  geen datums levert — dan komt het menu gewoon weer tevoorschijn.
- Het wegklappen gebeurt met `clip-path`, niet met `display: none`. Een verplicht veld
  dat op `display: none` staat kan de browser niet focussen, en dan blokkeert de
  validatie het formulier met een fout die de gast niet kan oplossen.
- Het maximum aantal deelnemers stond op twaalf, ook voor een vast weekend van zes
  stoelen. Wie met acht mensen invulde, kreeg pas ná het versturen een afwijzing van de
  server. Nu klopt het veld met de stand: zes voor een weekend, vier tot twaalf privé.
- Meegenomen: na een mislukte poging veranderde de verzendknop van *Hold my seats* in
  *Claim my seats*. Twee namen voor dezelfde knop, precies op het moment dat er iets
  misging. De knoptekst volgt nu de stand van het formulier.

**Hoe te controleren**
- `node --test tests/*.test.mjs` — **gedraaid, 67 geslaagd**.
- In de browser de hele cyclus doorlopen met een nagebootst antwoord van de database:
  begintoestand (menu verborgen, weekend 01 gekozen, maximum zes, kalender zichtbaar) →
  privé (waarde `private`, kalender weg, toelichting zichtbaar, vier tot twaalf, andere
  knoptekst) → terug (alles hersteld). Alle drie kloppen.

**Niet geverifieerd**
- Nog steeds getest tegen een nagebootst antwoord, niet tegen de echte API: de migratie
  in Supabase staat nog open bij Codex.

**Wat nu volgt**
- Robert beslist welke weekenden hij echt wil draaien.

---

### 2026-08-29 · Claude · Weekendkalender in het First Access-formulier · TE CONTROLEREN

**Wat**
- `database/first-access.sql`: `tavern_weekends` krijgt `starts_on date` en `ends_on date`
  (beide `add column if not exists`). De twee bestaande weekenden worden gevuld via de
  bestaande seed, en `get_tavern_availability` geeft ze mee als `startsOn` en `endsOn`.
- `tavern/index.html`: een kalenderblok boven het keuzemenu in het aanmeldformulier, met
  eigen opmaak. Nieuwe merkkleur als variabele: `--gold: #D9A23B`.
- `tavern/first-access.js`: bouwt de maanden op uit de beschikbaarheid, kleurt het hele
  weekend bij zweven, zet de keuze bij klikken, en houdt kalender en keuzemenu in beide
  richtingen gelijk. Het eerste weekend met vrije stoelen staat vooraf geselecteerd.
- `tests/site.test.mjs`: nieuwe test *"the weekend calendar is driven by real dates and
  degrades to the menu"*.

**Waarom**
- Robert wil dat gasten een weekend in een kalender aanklikken in plaats van uit een
  keuzemenu. De doordeweekse dagen staan er bewust bij: zo ziet iemand meteen of er
  ruimte is om dagen aan te plakken.
- `date_label` is vrije tekst en dus onbruikbaar om een weekend op een maandrooster te
  plaatsen. Vandaar echte datumkolommen; het label blijft puur om te tonen.
- **Het keuzemenu blijft staan en blijft het veld dat verstuurd wordt.** Dat is bewust:
  de kalender is een bedieningslaag erbovenop. Komen er geen datums uit de database — de
  migratie is nog niet gedraaid, of de API is even weg — dan verbergt de kalender
  zichzelf en werkt het formulier gewoon als voorheen. Liever geen kalender dan een halve.
  Het houdt ook de optie *private Tavern* bereikbaar, want die is geen weekend met datums.
- Vier toestanden per dag: open, nog twee stoelen of minder (goud), jouw keuze (oranje),
  vol of geblokkeerd (gearceerd en doorgestreept). Zweven kleurt alle vier de dagen van
  het weekend, ook als de maandag op de volgende regel of in de volgende maand valt —
  zonder dat lijkt het of je drie dagen boekt.

**Hoe te controleren**
- `node --test tests/*.test.mjs` — **gedraaid, 66 geslaagd**.
- Visueel gecontroleerd op 900 × 820 en op 375 × 812, met een nagebootst antwoord van de
  database (de Netlify-functie draait lokaal niet). Weekend 01 loopt van 30 oktober tot
  2 november en wordt correct over beide maandkaarten gemarkeerd. Tikdoelen op mobiel zijn
  38 × 44 px, geen horizontale overloop.

**Niet geverifieerd — belangrijk**
- **De migratie is niet in Supabase gedraaid.** Codex moet `database/first-access.sql`
  opnieuw uitvoeren zodat de twee kolommen bestaan en gevuld raken, en daarna controleren
  dat `get_tavern_availability` `startsOn` en `endsOn` teruggeeft. Tot dat moment blijft
  de kalender op de echte site onzichtbaar en toont de pagina het keuzemenu — dat is
  bedoeld gedrag, geen storing.
- De kalender is niet getest tegen de echte API, alleen tegen een nagebootst antwoord.

**Wat nu volgt**
- Robert beslist welke weekenden hij echt wil draaien; die worden dan als rijen met
  datums toegevoegd. Vanaf dat moment verschijnen en verdwijnen weekenden op de site
  puur door de `visible`-vlag in Supabase.

---

### 2026-08-29 · Claude · Verborgen blokken stonden gewoon op de pagina · TE CONTROLEREN

**Wat**
- `tavern/index.html`, `tavern/book/index.html` en `tavern/checkout/index.html` krijgen
  allemaal de regel `[hidden] { display: none !important; }`.
- `tests/site.test.mjs`: nieuwe test *"a hidden element is never left visible by a
  competing display rule"*.

**Waarom**
- Het `hidden`-attribuut van de browser wint alleen zolang niets anders `display` op dat
  element zet. `.signup-form { display: grid }` doet dat wel, en daarmee stonden **alle
  drie de toestanden** van de First Access-sectie tegelijk op de pagina: het
  aanmeldformulier, het blok *"Public booking is open — Book the First Edition"* én het
  blok *"First Access is closing — no new seats can be claimed"*. Robert zag het laatste
  staan terwijl er nog geen enkele stoel geclaimd is, en dat klopte dus ook niet.
- Het ergste van de drie is *"Public booking is open"*. Dat nodigt uit tot betaald boeken
  terwijl verkopen juridisch geblokkeerd is. De knop had geen werkende betaling opgeleverd
  — de functie weigert — maar op een verkooppagina mag die tekst er simpelweg niet staan.
- Dezelfde fout zat op de boekingspagina: `.check { display: grid }` maakte het
  toestemmingsvakje voor filmen zichtbaar bij **beide** weekenden, terwijl het alleen bij
  Weekend 01 hoort. De bijbehorende uitleg bleef wél verborgen, want `.notice` heeft geen
  eigen `display`. Een gast van Weekend 02 kreeg dus een los toestemmingsvakje zonder
  context. Bij toestemming voor beeldgebruik is dat geen schoonheidsfoutje.
- Op `tavern/checkout/index.html` werkte het toevallig goed, omdat de betrokken elementen
  geen eigen `display`-regel hebben. De regel staat er nu toch, zodat de volgende
  stijlwijziging daar niet stilletjes hetzelfde veroorzaakt.

**Stond dit live?**
- Nee. `git show origin/main:tavern/index.html` kent deze blokken niet; ze zitten in de
  22 commits die nog niet gepusht zijn. De fout is dus nooit voor bezoekers zichtbaar
  geweest.

**Hoe te controleren**
- `node --test tests/*.test.mjs` — **gedraaid, 65 geslaagd**. De nieuwe test valt over elke
  pagina die het `hidden`-attribuut gebruikt zonder de beschermende regel.
- In de browser nagemeten na de fix: op `/tavern/` is alleen het aanmeldformulier
  zichtbaar, de twee andere toestanden hebben nul hoogte en breedte. Op `/tavern/book/`
  zijn de filmtoelichting, het filmvakje en de foutmelding alle drie verborgen.

**Niet geverifieerd**
- Niets openstaand bij dit punt.

**Wat nu volgt**
- Los hiervan: Roberts briefing plant **drie** aaneengesloten weekenden, de site en de
  database kennen er twee. Editie 3 (13–16 november 2026) ontbreekt. Zie *Openstaand*.

---

### 2026-08-29 · Claude · De twee openingsweekenden uit elkaar gehaald · TE CONTROLEREN

**Wat**
- `tavern/index.html`, de kaart in de hero: de regel *Dates* toonde twee data onder
  elkaar zonder label. Elk weekend heeft nu een eigen kopje — *Weekend 01* boven
  30 Oct to 2 Nov, *Weekend 02* boven 6 to 9 Nov — met eronder de regel *"Two separate
  weekends, booked separately. Choose one, or ask about both."*
- Twee nieuwe stijlklassen, `.edition-card__weekend` en `.edition-card__note`, in de
  bestaande visuele taal van de kaart. Bewust niet op `.edition-card dd small` gezet,
  want dat zou ook de regels bij *Seats* en *Price* van uiterlijk veranderen.
- `tests/site.test.mjs`: nieuwe test *"the two opening weekends never read as one
  booking"*.

**Waarom**
- Robert zag het zelf: twee data onder elkaar in één veld lezen als één pakket van twee
  weekenden. Bij een prijs van €2.025 per persoon is dat precies het soort misverstand
  waar iemand achteraf op terugkomt. Elders op de site stonden de weekenden al gelabeld
  als *Weekend 01* en *Weekend 02*, of in aparte kaarten — alleen deze ene plek niet.
- **Correctie op de eerste poging.** Die regel luidde eerst *"You book one, not both."*
  Dat sluit twee weekenden boeken uit, terwijl dat juist mag: verderop op dezelfde pagina
  staat *"Want to stay longer—or join us across two Tavern weekends? Ask us."* Robert
  wees erop. De zin zegt nu alleen dat het losse weekenden zijn die apart geboekt worden,
  en nodigt uit om naar allebei te vragen. De test dwingt nu ook af dat de kaart het
  boeken van twee weekenden **niet** uitsluit.

**Hoe te controleren**
- `node --test tests/site.test.mjs` — **gedraaid, 20 geslaagd**; de volledige suite staat
  op 64.
- Visueel gecontroleerd op 1440 × 900 en op 375 × 812. De kaart blijft 348 px breed op
  desktop en 343 px op mobiel, geen horizontale overloop.

**Niet geverifieerd**
- Niets openstaand bij dit punt.

**Wat nu volgt**
- Robert bekijkt de rest van de site in de lokale preview.

---

### 2026-08-29 · Claude · Node geïnstalleerd, suite gedraaid, foto's naar WebP · TE CONTROLEREN

**Wat**
- Node.js v24.20.0 (LTS) staat nu in `~/.local/node`, uitgepakt uit het officiële
  darwin-arm64-pakket van nodejs.org. De SHA256 is tegen `SHASUMS256.txt` gecontroleerd en
  klopt. `~/.zshrc` kreeg één PATH-regel met een comment hoe je het weer weghaalt. Geen
  beheerdersrechten gebruikt, niets systeembreed aangeraakt.
- **De volledige suite is gedraaid: 63 tests, alle geslaagd.** Daarmee is al het werk van
  vandaag ook echt getest en niet alleen nagelezen.
- `tavern/assets/tavern-asturias-hero.webp` (215 kB) en
  `tavern-asturias-hero-portrait.webp` (112 kB) vervangen de JPEG-versies, die verwijderd
  zijn. Alle zeven verwijzingen in `tavern/index.html` en `index.html` zijn mee omgezet en
  de cache-parameters opgehoogd.

**Waarom**
- Zonder Node moest elke codewijziging van Claude door Codex worden natest. Dat is een
  onnodige wachttijd in een samenwerking die juist snel moet schakelen.
- De foto's waren JPEG omdat `sips` webp niet kan schrijven. Met `sharp` kan het wel:
  215 kB tegen 302 kB voor de liggende versie, 112 kB tegen 196 kB voor de staande. Bij
  elkaar 171 kB minder op de zwaarste pagina van de site.
- Twee dingen om te weten voor de volgende keer. `sips` schrijft een uitsnede uit een
  HEIC standaard weer als HEIC, ook als het bestand `.png` heet — geef altijd expliciet
  `-s format png` mee. En de nieuwe WebP's zijn zichtbaar scherper dan de eerdere JPEG's,
  omdat `sharp` vanaf het volledige origineel van 9610 px schaalt in plaats van vanaf een
  al verkleind tussenbestand.

**Hoe te controleren**
- `node --test tests/*.test.mjs` → 63 geslaagd, 0 gefaald.
- `grep -rn "tavern-asturias-hero" --include="*.html" .` geeft zeven regels, allemaal
  `.webp`. Er staan geen JPEG-versies meer in `tavern/assets/`.

**Niet geverifieerd**
- De nieuwe WebP's zijn niet opnieuw in de browser bekeken; de uitsnede en afmetingen zijn
  identiek aan de JPEG-versies die wel visueel gecontroleerd zijn, alleen het
  compressieformaat verschilt.
- De databaseproeven blijven openstaan voor Codex; daar heeft Claude geen toegang toe.

**Wat nu volgt**
- Codex: alleen nog de gracemarge in de echte database. De rest van de testtaken is weg.

---

### 2026-08-29 · Claude · Verplichte aanbiedergegevens discreet ondergebracht · TE CONTROLEREN

**Wat**
- `legal/index.html`: het vage openingsblok *"Website owner — Operated by a self-employed
  professional"* is weg. Onderaan de pagina staat nu een klein, grijs blok
  `#provider` met de kop *Provider identification*: handelsnaam, de naam Robert
  Neugebauer, woonplaats op gemeenteniveau (concejo Parres, Asturias) en het e-mailadres.
  Eén regel zegt dat fiscaal nummer en toeristische registratie hier komen te staan
  vóórdat er betaald geboekt kan worden.
- `booking-success/index.html` en `booking-cancelled/index.html`: kleine voettekst met
  links naar de juridische kennisgeving en de privacyverklaring. Die twee pagina's hadden
  als enige geen enkele route erheen.
- `tests/site.test.mjs`: nieuwe test *"the legal notice stays one click away and carries
  the provider identification"*.

**Waarom**
- ✅ **Geverifieerd bij de officiële toelichting op de LSSI** (lssi.digital.gob.es,
  veelgestelde vragen bij artikel 10). Twee dingen staan daar die dit sturen. Voor een
  natuurlijke persoon volstaat als adres: *"Domicilio (indicando, al menos, la localidad
  y provincia de residencia)"* — dus woonplaats en provincie, **geen straatadres**. En
  over de plaatsing: de informatie moet *"de forma permanente, fácil, directa y
  gratuita"* beschikbaar zijn, wat mag via *"páginas internas con hipervínculos
  claramente visibles"*. Het hoeft dus niet op de homepage.
- Robert wil deze gegevens niet op de voorgrond, maar wel vindbaar. Onderaan de
  juridische kennisgeving, in kleine letter, met een voetnootlink op elke pagina, voldoet
  aan allebei. Daarom is het blok naar onderen verplaatst en niet naar boven.
- Er is niets verzonnen. De naam stond al in `/terms/`, de gemeente komt uit Roberts
  eigen `CLAUDE.md`. Het fiscaal nummer is niet ingevuld en wordt ook niet ingevuld door
  een assistent.

**Hoe te controleren**
- `node --test tests/site.test.mjs`. De test controleert dat elke pagina behalve de
  kennisgeving zelf en de 404 een link naar `/legal/` heeft, dat het blok `#provider`
  bestaat met naam en gemeente, en dat *Provider identification* de **laatste** kop op de
  pagina is — niet de eerste.
- In de DOM nagemeten: het blok staat op 1685 px van een pagina van 2064 px, in 13 px
  grijs tegen 16 px body. Klein en onderaan, zoals bedoeld.

**Niet geverifieerd**
- ~~Geen Node op deze Mac.~~ **Bijgewerkt 29 aug, later die dag:** Node staat er inmiddels
  wel en de volledige suite is gedraaid — 63 tests, alle geslaagd.
- De bron is de officiële overheidstoelichting op de LSSI, geen advies van een jurist.
  Voor de definitieve versie hoort dit blok samen met de reisbureauregistratie nog één
  keer juridisch nagekeken te worden.

**Wat nu volgt**
- Robert vult het fiscaal nummer aan zodra hij dat wil, en de registratiecode zodra die
  binnen is. Beide horen in dit ene blok, niet elders op de site.

---

### 2026-08-29 · Claude · Erfgoedclaim nagetrokken en gecorrigeerd · TE CONTROLEREN

**Wat**
- `tavern/index.html`, de alinea onder *"Welcome to Fontecha"*: de zin over de *"old
  Camino Real de Ponga"* is verdwenen. De grafheuvel blijft, nu met naam en juiste
  ligging: *"A Neolithic burial mound, the túmulo de Fontecha, is recorded on the
  boundary between Parres and Piloña, and old mountain paths still cross these ridges."*

**Waarom**
- ✅ **Grafheuvel: geverifieerd.** Het Spaanstalige Wikipedia-artikel over Llerandi
  schrijft: *"En el periodo del Neolítico se pueden encuadrar los restos del túmulo de
  Fontecha, ubicado en los confines entre Parres y Piloña."* De heuvel bestaat dus en
  draagt de naam van de plek. Wat er níét stond, is dat hij *boven* Fontecha ligt; de
  bron zegt op de grens tussen Parres en Piloña. Dat staat er nu ook zo.
- 🟡 **Camino Real de Ponga: niet te staven.** Datzelfde artikel noemt wel historische
  verbindingen — *Carril de Bon* en *La Sillera* — maar nergens een *Camino Real de
  Ponga*, en verder zoeken leverde alleen moderne wandelroutes op. Volgens Roberts eigen
  regel gaat een 🟡 aanname niet in publieke content, dus de zin is vervangen door een
  algemene formulering die wel klopt.
- Let op de status van de bron: dit is Wikipedia, geen officieel erfgoedregister. Voor
  een sfeeralinea is dat proportioneel. Moet het hard, dan hoort de vermelding in het
  archeologisch inventaris van Asturië opgezocht te worden.

**Hoe te controleren**
- `grep -n "Camino Real" tavern/index.html` geeft niets meer.
- Bron: https://es.wikipedia.org/wiki/Llerandi

**Niet geverifieerd**
- ~~Geen Node op deze Mac.~~ **Bijgewerkt:** suite gedraaid, 63 tests geslaagd.

**Wat nu volgt**
- Punt 2 uit *Openstaand* kan weg zodra dit is nagekeken.

---

### 2026-08-29 · Claude · Nieuwe hero-foto uit Roberts eigen panorama · TE CONTROLEREN

**Wat**
- `tavern/assets/tavern-asturias-hero.jpg` (1983 × 793, 302 kB) vervangt
  `tavern-asturias-hero.webp`, die verwijderd is. Bron: `IMG_1781.HEIC`, een panorama van
  12998 × 3844 dat Robert aanleverde.
- `tavern/assets/tavern-asturias-hero-portrait.jpg` (828 × 1104, 196 kB): staande
  uitsnede van dezelfde foto, alleen voor schermen tot 900 px.
- `tavern/index.html`: hero-achtergrond, `og:image` en twee `preload`-regels met een
  `media`-conditie, zodat een telefoon alleen de staande versie ophaalt en een desktop
  alleen de liggende. In het blok `@media (max-width: 900px)` wisselt de
  achtergrondafbeelding.
- `index.html`: de Tavern-kaart op de homepage en de `og:image` wijzen naar dezelfde
  nieuwe foto.

**Waarom**
- Robert wilde deze foto als achtergrond. Twee dingen moesten daarbij opgelost worden.
  Rechtsonder in het origineel staat een auto; die is weggesneden door de rechter 20 %
  van het panorama te laten vallen. De uitsnede houdt daarna precies 2,5:1 aan, dezelfde
  verhouding als de oude hero, zodat er niets aan de CSS-opmaak hoefde te veranderen.
- Een panorama van 2,5:1 wordt door `cover` op een telefoon tot een smalle strook geknepen
  waarop alleen wolk te zien is. Vandaar de tweede, staande uitsnede met bergen, vallei en
  voorgrond erin.
- **WebP kon niet.** `sips` op deze Mac leest wel webp maar schrijft het niet, en er is
  geen andere encoder aanwezig — geen Node, geen PIL, geen cwebp. Vandaar JPEG. Zie
  *Openstaand*: met Node erbij is dit alsnog naar webp te brengen en scheelt dat ongeveer
  een derde aan gewicht.

**Hoe te controleren**
- Beide bestanden bestaan en de oude webp is nergens meer genoemd:
  `grep -rn "tavern-asturias-hero" --include="*.html" .` geeft vijf regels, allemaal `.jpg`.
- Visueel gecontroleerd op 1440 × 900 en op 375 × 812 via een lokale server. De hero,
  de kaart met de weekenden en de prijsregel renderen goed; de auto is uit beeld.
- `node --test tests/site.test.mjs` — de test die alle lokale media-verwijzingen naleeft
  moet blijven slagen.

**Niet geverifieerd**
- ~~Geen Node op deze Mac.~~ **Bijgewerkt:** suite gedraaid, 63 tests geslaagd. De foto's
  zijn intussen ook naar WebP omgezet; zie het bovenste logboekitem.
- De Tavern-kaart op de homepage is niet visueel bevestigd: de afbeelding laadt daar
  aantoonbaar (HTTP 200, element zichtbaar met opacity 1), maar het screenshot-mechanisme
  gaf een leeg beeld terug. De DOM klopt; de weergave is niet met eigen ogen gezien.

**Wat nu volgt**
- Codex: draai de suite en zet dit om naar webp als dat kan, met dezelfde bestandsnamen
  maar de juiste extensie en de verwijzingen mee.

---

### 2026-08-29 · Claude · Misleidingscontrole op de publieke teksten · TE CONTROLEREN

**Wat**
- `tavern/index.html` en `tavern/book/index.html`: bij de prijs staat nu *"Total price
  including taxes"*, en de boekingspagina noemt zelf dat reis naar Asturië er niet in zit.
- `tavern/index.html`: *"Sixteen hours"* → *"Around sixteen hours"*; *"New featured
  weekends will be announced regularly"* → *"Further featured weekends may be
  announced"*; het blok *"Your own room. A shared house."* vermeldt nu zelf dat één huis
  ongeveer vijfhonderd meter verderop ligt.
- `tests/site.test.mjs`: nieuwe test *"every public price is presented as a total
  including taxes"*.
- **Niets veranderd aan het blok over de Game Master.** Zie *Openstaand* 1; dat is een
  vraag aan Robert, geen redactionele keuze.

**Waarom**
- Een totaalprijs voor een pakketreis moet als totaalprijs inclusief belastingen
  herkenbaar zijn, met de belangrijkste uitsluiting erbij. `/travel-information/` zei dat
  al ("including applicable taxes"), de verkooppagina's niet. Het woord *VAT* blijft
  bewust weg — onder de Spaanse bijzondere regeling voor reisbureaus wordt btw niet
  apart getoond, en de bestaande test verbiedt het woord al.
- *"Sixteen hours"* was een harde belofte; de campagne is elders steeds *"around
  sixteen"* en het draaiboek is ± 18 uur. Een geschat getal hoort ook als schatting te
  staan, overal hetzelfde.
- *"announced regularly"* beloofde een frequentie die nergens vastligt.
- Het ernstigste: *"Everyone at the table gets their own bedroom, roughly ten metres from
  the Tavern"* stond in het blok *Good to know*, terwijl de FAQ verderop toegeeft dat één
  huis ongeveer vijfhonderd meter verderop ligt. Een gast die daar terechtkomt kan
  terecht zeggen dat de verkooppagina iets anders beloofde. De nuance hoort op de plek
  waar de belofte gedaan wordt, niet alleen in de FAQ eronder.

**Hoe te controleren**
- `node --test tests/site.test.mjs`. De nieuwe test dwingt af dat elke publieke pagina
  die €2.025 toont, ook zegt dat het de totaalprijs inclusief belastingen is en dat reis
  naar Asturië er niet in zit.
- De bestaande test *"consumer price remains consistent and banned sales wording is
  absent"* moet blijven slagen: de toevoeging gebruikt *taxes*, niet *VAT*.

**Niet geverifieerd**
- ~~Geen Node op deze Mac.~~ **Bijgewerkt:** suite gedraaid, 63 tests geslaagd.
- De erfgoedclaims zijn intussen wél nagetrokken; zie het aparte logboekitem daarover.

**Wat nu volgt**
- Robert beantwoordt *Openstaand* 1 en 2. Punt 1 blokkeert: zolang dat niet vaststaat
  staat er een naam, een cv en een citaat op een verkooppagina die niemand kan staven.

---

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
- ~~De testsuite is niet gedraaid.~~ **Bijgewerkt 29 aug, later die dag:** Node is
  geïnstalleerd en de suite is gedraaid — 63 tests, alle geslaagd, inclusief de nieuwe.

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
