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

Noteer het e-mailadres dat het account krijgt. Dat ziet eruit als
`lewos-tavern-agenda@lewos-agenda.iam.gserviceaccount.com`.

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
