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

## Harde grenzen — gelden voor allebei

Deze staan voluit in Roberts `CLAUDE.md` in `~/Downloads`. Kort:

- **Geen betaling mogelijk maken** zolang de reisbureauregistratie niet rond is: RC-polis
  actief · caución actief · RECE0033T06 ingediend én registratiecode ontvangen ·
  klantdocumenten definitief. Bouw geen checkout-omweg, geen "boek nu", geen betaalknop
  die de blokkade passeert.
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

14. **[Claude, na technische blokkade] Bouw een omgevings-slide voor de Tavern.**
   Gebruik Roberts twee aangeleverde beelden alleen na controle van commerciële
   licentie. Voeg extra aantoonbaar vrij bruikbare beelden toe van Asturias/Arriondas/
   Cangas de Onís, mountainbiken, waterscooters, Cangas Aventura en het Ponga-klimpark
   richting Viboli. Bewaar bron en licentie in een intern creditsbestand dat niet
   publiek wordt geserveerd; hotlink niet. Maak de slide responsief en toegankelijk
   (alt-teksten, toetsenbordbediening, pauze/volgende, geen autoplay met geluid).

1. **[Robert] Vul het fiscaal nummer aan in `legal/index.html`, blok `#provider`.** De
   structuur staat er; alleen het NIF/NIE ontbreekt nog, plus straks de toeristische
   registratiecode. Let op: dit komt daarmee in de git-geschiedenis te staan. Dat botst
   met de regel in je `CLAUDE.md` dat er geen persoonsgegevens in de repo horen, maar de
   wet vraagt het nummer publiek. Dat is een bewuste keuze die jij maakt, geen fout.
   Een woonadres is **niet** nodig: gemeente en provincie volstaan en die staan er al.
2. **[Open vraag voor Robert] Editie 3 en een kalenderweergave.** De briefing aan Story
   Forge plant drie aaneengesloten weekenden: 30 okt–2 nov, 6–9 nov en **13–16 nov**.
   De site en de seed in `database/first-access.sql` kennen alleen de eerste twee. In
   diezelfde briefing staat wel *"Elke stap gaat pas open als de vorige vol is"*, dus dit
   kan bewust zijn. Robert noemde daarnaast een open kalender voor alle weekenden; daar
   is in deze repo, in het dossier en in zijn eigen documenten niets over te vinden.
   Eerst uitvragen wat dat moet worden, dan pas bouwen. De basis ligt er wel:
   `tavern_weekends` heeft label, datum, capaciteit, volgorde en een `visible`-vlag, en de
   pagina haalt de beschikbaarheid live op.
3. **[Robert, met deskundige] Het wettelijke standaardinformatieformulier ontbreekt
   volledig.** Bij een pakketreis moet de reiziger vóór het boeken een formulier met
   gestandaardiseerde informatie krijgen (richtlijn 2015/2302 bijlage I, in Spanje via het
   TRLGDCU). `/travel-information/` kondigt het zelf aan, maar het bestaat nergens. Dit is
   geen tekst die wij erbij bedenken: de inhoud ligt wettelijk vast.
4. **[Robert] Gegevens van de insolventiegarantie in de precontractuele informatie.** Naam
   en volledige contactgegevens van de garantieverstrekker moeten erin. Nu staat er alleen
   dat ze nog volgen.
5. **[Wie het eerst kan] Doorgifte buiten de EU benoemen in de privacyverklaring.** Nodig
   zodra een verwerker buiten de EER verwerkt. Zoek eerst uit in welke regio de
   Supabase-instantie draait en wat Netlify, Stripe en Resend daarover zeggen. Niets over
   beweren voordat dat vaststaat.
6. **[Robert, extern] Verzekeringen en registratie.** RC- en caución-polis actief,
   RECE0033T06 ingediend, registratiecode binnen. Geen van beide assistenten kan dit.
7. **[Robert, extern] Definitieve klantdocumenten.** Precontractuele reisinformatie,
   boekingscontract, annulerings- en terugbetalingsvoorwaarden, minimumdeelnemers-
   clausule, klachtenprocedure — als definitieve PDF's.
8. **[Wie het eerst kan, na 6 en 7] Vul de bedrijfsgegevens in.** In `/terms/` en
   `/travel-information/` staan nu letterlijk *"To complete before sales"*-blokken:
   volledig adres, fiscaal nummer, telefoonnummer, toeristische registratiecode,
   bevoegde autoriteit en de insolventiegarantieverstrekker. Pas daarna mogen
   `PUBLISHED_TERMS_VERSION`, `PUBLISHED_TERMS_DOCUMENT` en
   `PUBLISHED_TRAVEL_DOCUMENT` in `netlify/functions/_booking-config.mjs` gevuld worden.
   Zolang die leeg zijn, is betalen technisch onmogelijk — dat is bewust zo.
9. **[Wie het eerst kan] Spaanstalige kopie van de reisinformatie** plus het wettelijke
   standaardinformatieformulier, zoals de pagina zelf aankondigt. Bij een Spaanse tekst
   hoort een Nederlandse vertaling voor Robert.
10. **[Open vraag voor Robert] `noindex` op `/terms/` en `/travel-information/`.** Beide
   staan nu op `noindex, nofollow` omdat ze concept zijn. Dat moet eraf op het moment
   dat ze definitief worden — zet dat niet stilzwijgend om.

## Logboek — nieuwste bovenaan

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

### 2026-08-29 · Claude · De drie bevindingen van Codex hersteld · TE CONTROLEREN

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
