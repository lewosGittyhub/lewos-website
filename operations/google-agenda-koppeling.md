# De gedeelde Lewos-agenda koppelen

Een bevestigde, betaalde Tavern-boeking wordt één afspraak in de agenda **Lewos**, die
eigendom is van `lewos.co@gmail.com` en gedeeld met Nadine. Nadine krijgt géén aparte
afspraak en géén uitnodiging: ze ziet hem doordat de agenda met haar gedeeld is.

De code staat klaar en is getest. Wat er nog ontbreekt is een sleutel, en die kan alleen
Robert maken — er is op deze Mac geen `gcloud`, geen Google-sessie en geen bestaande
Google-koppeling om te hergebruiken. Dat is nagekeken, niet aangenomen.

---

## Wat Robert doet, eenmalig

Log overal in als **lewos.co@gmail.com**. Alles hieronder is gratis; er hoeft geen
betaalde dienst aan.

### 1. Een project

`console.cloud.google.com` → projectkiezer bovenaan → **New project** → naam bijvoorbeeld
`lewos-agenda` → **Create**. De eerste keer vraagt Google akkoord op de voorwaarden van
Google Cloud; dat akkoord geef jij, niet ik.

### 2. De Calendar API aanzetten

**APIs & Services → Library** → zoek *Google Calendar API* → **Enable**.

### 3. Een serviceaccount

**IAM & Admin → Service Accounts → Create service account**. Naam bijvoorbeeld
`lewos-tavern-agenda`.

Bij stap 2 en 3 van dat formulier ("Grant this service account access to project" en
"Grant users access") **sla je alles over**. Die rollen gaan over Google Cloud zelf en
hebben niets met de agenda te maken. Toegang tot de agenda regel je in stap 5, door hem
te delen — precies zoals je hem met Nadine deelt.

Noteer het e-mailadres dat het account krijgt. De vorm is
`<naam>@<project>.iam.gserviceaccount.com`.

**Het account dat Lewos in gebruik heeft is
`lewos-calendar@lewos-automation.iam.gserviceaccount.com`.** Dat is af te lezen aan het veld
`client_email` in het sleutelbestand, en aan de maker van elke afspraak die de koppeling zelf
in de agenda zet. Tot 8 september 2026 stond hier een ander adres als voorbeeld, wat makkelijk
te verwarren was met de echte waarde.

### 4. Een sleutel

Klik het serviceaccount aan → tabblad **Keys** → **Add key → Create new key → JSON →
Create**. Er wordt een `.json`-bestand gedownload.

**Bewaar dat bestand buiten de repo.** Bijvoorbeeld in `~/Documents/lewos-sleutels/`. Zet
het niet in de projectmap; `.gitignore` vangt de gebruikelijke namen af, maar daar wil je
niet van afhankelijk zijn. Deel de inhoud met niemand, ook niet in een chat.

### 5. De agenda delen met dat account

Google Agenda → hover over de agenda **Lewos** in de linkerlijst → de drie puntjes →
**Settings and sharing** → **Share with specific people or groups** → **Add people** →
plak het e-mailadres van het serviceaccount → rechten op **Make changes to events** →
**Send**.

Meer dan dat heeft het niet nodig. Geen *Make changes and manage sharing*: dan zou het
account de agenda ook kunnen weggeven of verwijderen.

### 6. Het agenda-ID ophalen

Op diezelfde pagina, helemaal onderaan onder **Integrate calendar**, staat **Calendar ID**.
Voor een gedeelde agenda ziet dat eruit als
`c_1a2b3c4d5e6f@group.calendar.google.com`. Kopieer die precies.

---

## De proef draaien

Het script leest de sleutel uit het gedownloade JSON-bestand. De sleutel komt daarmee niet
in de broncode, niet in de shell-geschiedenis en niet in een chat terecht.

```bash
SLEUTEL=~/Documents/lewos-sleutels/lewos-agenda.json AGENDA='PLAK_HIER_HET_CALENDAR_ID' bash -c '
  export GOOGLE_SERVICE_ACCOUNT_EMAIL=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))[\"client_email\"])" "$SLEUTEL")
  export GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))[\"private_key\"])" "$SLEUTEL")
  export LEWOS_CALENDAR_ID="$AGENDA"
  node scripts/local-booking-test.mjs
'
```

Draai dat vanuit de repo-root. Het script:

1. doet een aanmelding via de échte `first-access`-handler;
2. laat de échte Stripe-webhook een betaalde boeking bevestigen;
3. controleert eerst welke agenda het te pakken heeft — naam, tijdzone en of het
   schrijfrecht heeft — en stopt als dat niet klopt;
4. maakt één afspraak aan;
5. leest hem terug uit Google Agenda en toont de link.

Alles daarvóór is lokaal: Supabase is een mockserver in hetzelfde proces, Stripe wordt
nooit aangeroepen, en de mails worden wél opgebouwd maar verlaten deze machine niet. Er is
een harde controle dat `SUPABASE_URL` op `127.0.0.1` staat.

Wil je eerst zien wat er zou gebeuren, zonder iets aan te maken:

```bash
node scripts/local-booking-test.mjs --dry-run
```

**Opnieuw draaien maakt geen tweede afspraak.** Het afspraak-id is afgeleid van het
boekingskenmerk, dat in het script vastligt; een tweede run werkt dezelfde afspraak bij.

---

## Daarna: in Netlify

Zodra de proef klopt, horen dezelfde drie waarden in Netlify te staan, zodat een echte
bevestigde boeking vanzelf in de agenda komt:

> **Site configuration → Environment variables**, scope `Functions`, alle deploy contexts

| Sleutel | Waarde |
| --- | --- |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `…@….iam.gserviceaccount.com` uit het JSON-bestand |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | het veld `private_key` uit het JSON-bestand, inclusief `-----BEGIN PRIVATE KEY-----` |
| `LEWOS_CALENDAR_ID` | het Calendar ID uit stap 6 |
| `LEWOS_ACCOMMODATION_EMAILS` | het adres waarmee Nadine boekingen invoert; meerdere mag, gescheiden door komma's |

Optioneel: `TAVERN_TIMEZONE` (standaard `Europe/Madrid`).

Staan die drie er niet, dan slaat de webhook de agenda over en logt hij dat — een boeking
loopt er dus niet op stuk. Staan ze er wél en gaat het schrijven mis, dán geeft de webhook
een 500 en probeert Stripe het opnieuw: een boeking die niet in de agenda staat, bestaat
voor Nadine niet.

---

## Aankomst- en vertrektijd

De afspraak gebruikt de tijden die op de site staan (`travel-information/index.html`):
aankomst vanaf **16:00**, vertrek na het ontbijt, om **09:30**. Tijdzone `Europe/Madrid`.
Ze staan als constante in `netlify/functions/_calendar.mjs`, op één plek.

Let op: die tijden zijn op de site vastgelegd voor een aankomst op **vrijdag** en een
vertrek op **maandag**. Robert heeft op 5 september 2026 bevestigd dat ze ook gelden voor
de testboeking van donderdag tot dinsdag. Komt er ooit een boeking met een ander patroon,
dan is dit de plek om erover na te denken in plaats van de tijden stil te hergebruiken.

---

# Eén agenda, twee mensen (6 september 2026)

Afgesproken met Robert. Er komt **geen tweede agenda en geen synchronisatie**. Er is één
agenda, eigendom van `lewos.co@gmail.com`, gedeeld met Nadine. Zij ziet hem in haar eigen
Google Calendar, hij in de zijne, en de site leest en schrijft dezelfde lijst.

Twee agenda's die elkaar bijhouden lopen vroeg of laat uit de pas, en juist op dát moment
verkoop je een weekend twee keer.

## De regel

**Wie het eerst boekt, heeft het.** Boekt Nadine een weekend vol, dan gaat dat weekend van
de site af. Boekt er een gast, dan is dat weekend uit haar markt.

Robert is niet de eigenaar van het huis. Een aangekondigd weekend is een voornemen, geen
gereserveerd huis — tot er geboekt is.

## Hoe de site weet wat van wie is

Alles wat de site schrijft draagt een merkteken:

```
extendedProperties.private.lewosSource = "tavern-booking"
```

**Alles zonder dat merkteken is van Nadine en betekent: die nachten zijn bezet.** Meer
logica is er niet, en dat is met opzet. Kamers tellen of titels uitlezen gaat een keer fout
op een manier die niemand merkt.

## Wat er in de agenda komt

| Afspraak | Wanneer | Waarom |
| --- | --- | --- |
| Eén per bevestigde boeking | bij betaling | Nadine ziet wie er komt en met hoeveel |
| **Eén blokkade per weekend met minstens één geboekte stoel** | `scripts/sync-weekend-blocks.mjs` | Zonder deze staat een weekend met één boeking maar deels in de agenda, en een leeg weekend helemaal niet. Dan verhuurt Nadine het huis eroverheen |

De blokkade verdwijnt weer als er geen boekingen meer zijn. Het script is idempotent:
tweemaal draaien verandert niets.

## Nachten, niet dagen

Alles rekent in **nachten**. Een vertrekdag is de ochtend waarop je weggaat en telt zelf
niet mee. Daardoor klopt de wisseldag vanzelf: Nadine's gast vertrekt vrijdag om 09:30, de
Tavern komt vrijdag om 16:00 — dezelfde datum, geen gedeeld bed.

Een hele-dagafspraak in Google eindigt op een datum die er níét bij hoort. Wie dat mist,
blokkeert standaard één nacht te veel. `tests/house-calendar.test.mjs` bewaakt dat.

## Wat Robert nog moet doen

**Afgehandeld op 6 september 2026.** Er staat nu een eigen agenda *Lewos — Tavern & huis*
(`...@group.calendar.google.com`), eigendom van het Lewos-account en gedeeld met Nadine, met
*Wijzigingen aanbrengen in afspraken*. De persoonlijke agenda wordt niet meer gebruikt voor
automatische boekingen. Het id staat in `LEWOS_CALENDAR_ID` en niet in deze repo.

Wat nog moet:

1. **Zet `LEWOS_ACCOMMODATION_EMAILS`** op het adres waarmee Nadine haar boekingen invoert.
   Zonder die variabele blokkeert elke vreemde afspraak voorraad — ook je tandarts. Zie
   "Wat telt als bezet" hieronder.
2. **Eén keer `scripts/sync-weekend-blocks.mjs --dry-run`** draaien om te zien wat er zou
   komen, en pas daarna zonder `--dry-run`.

## Wat telt als bezet

Sinds de koppeling op een eigen agenda staat, mag daar ook gewoon iets persoonlijks in. Dus
blokkeert niet meer alles wat er staat. De regel, in volgorde:

| Afspraak | Blokkeert | Waarom |
| --- | --- | --- |
| Van ons (`lewosSource = tavern-booking`) | nee | staat al in onze eigen administratie; dubbel tellen zou een weekend tegen zijn eigen boeking blokkeren |
| Afgezegd, of op **Vrij** gezet | nee | er slaapt niemand |
| Gemaakt vanaf een adres uit `LEWOS_ACCOMMODATION_EMAILS` | **ja** | dit is een boeking van de accommodatie |
| Handmatig gemarkeerd `lewosSource = accommodation` | **ja** | voor een boeking die telefonisch binnenkomt |
| Al het overige | nee | privéafspraak of onherkenbaar |

**Uitzondering, en met opzet:** staat `LEWOS_ACCOMMODATION_EMAILS` niet ingesteld, dan
blokkeert álles wat niet van ons is. Een lege instelling zou anders stilzwijgend de hele
bescherming uitzetten. Een gemiste verkoop bel je recht; twee groepen voor hetzelfde bed
niet.

Een afspraak die nachten beslaat maar niet is meegeteld, verdwijnt niet: hij komt als
waarschuwing in de beheeromgeving zodra hij een verkochte boeking raakt, met de reden erbij.

## Hoe snel een boeking van Nadine doorkomt

Twee verschillende snelheden, en dat is met opzet:

- **Wat de bezoeker grijs ziet** komt uit een eindpunt dat vijf minuten onthoudt. Een
  boeking van Nadine kan dus tot vijf minuten later pas grijs worden op de site.
- **De controle bij het opslaan van een aanvraag leest de agenda rechtstreeks.** Geen cache.
  Zou die wél cachen, dan kon er vijf minuten lang een nacht doorheen glippen die zij net
  had geboekt — precies het venster waarin je dubbel verkoopt.

Dus: het beeld kan even achterlopen, de grens nooit.

## Wat er niet automatisch gebeurt

Een agenda-item verandert **nooit** een boeking, een betaling of een stoel. Botst er iets —
Nadine boekt over een verkocht weekend heen — dan komt dat als **waarschuwing** bovenaan in
de beheeromgeving te staan, met de titel van haar afspraak en de nachten die botsen. Een
mens lost dat op.

Kan de agenda niet gelezen worden, dan blokkeert de site niets en belooft ze niets: extra
nachten blijven op aanvraag, zoals vóór deze koppeling. **Onbekend is nooit "vrij".**

## Lokaal proberen

`scripts/local-admin-server.mjs` bootst Google na, met de afspraken in
`.local-data/calendar.json`. Zet daar met de hand een "boeking van Nadine" in en ververs de
site: die nachten worden grijs, en een weekend dat zij helemaal heeft geboekt verdwijnt.
De echte agenda wordt daarbij nooit aangeraakt.
