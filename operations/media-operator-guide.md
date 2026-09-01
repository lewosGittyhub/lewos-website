# Deelnemers en links beheren — gebruiksaanwijzing voor de operator

Intern. `/operations/*` geeft 404 en staat in `robots.txt`.

Robert koos op 1 september 2026 de operator-flow: **jij voert de deelnemers in, niemand
anders.** Er is geen pagina waar een gast de naam en het e-mailadres van een ander kan
invoeren, en die komt er ook niet. Alles loopt via één script met de service_role-sleutel.

    node scripts/media-participants.mjs <opdracht> [opties]

## Wat je nodig hebt

In je omgeving: `SUPABASE_URL` en `SUPABASE_SERVICE_ROLE_KEY`. Voor het versturen van
uitnodigingen ook `RESEND_API_KEY`, `TAVERN_FROM_EMAIL` en `URL`.

**Die service_role-sleutel omzeilt alle beveiliging in de database.** Zet hem niet in een
bestand dat in git kan belanden, plak hem niet in een chat, en draai dit script niet op een
computer die je niet vertrouwt.

## Twee remmen, en waarom ze er zijn

**De mediapoort.** Zolang `mediaConsentIsEnabled()` onwaar is, weigert elke schrijfactie. Dat
is geen formaliteit: zolang de overeenkomst niet is goedgekeurd hoort er geen naam of
e-mailadres van een gast in die tabellen te staan. `list` mag wel altijd, want zonder lijst
kun je niets nakijken.

**`--commit`.** Elke schrijfactie is standaard een droogloop. Zonder die vlag zie je wat er
zou gebeuren en verandert er niets.

## De vier opdrachten

### `list --claim <uuid>`

De gastenlijst bij één boeking: id, status, of er een link openstaat, naam en adres. Dit is
de enige plek waar namen en adressen te zien zijn, en jij bent de enige die hier komt.

    node scripts/media-participants.mjs list --claim 8f3a...c21

### `register --claim <uuid> --file <deelnemers.json>`

Voert de deelnemers in. Het bestand is een JSON-lijst:

```json
[
  {"fullName": "Voornaam Achternaam", "email": "iemand@voorbeeld.nl", "adultDeclared": true},
  {"fullName": "Tweede Gast",         "email": "tweede@voorbeeld.nl", "adultDeclared": true}
]
```

`adultDeclared` moet op `true` staan. Weekend 01 is voor volwassenen, en de database weigert
een toestemming zonder die verklaring; het script controleert het vooraf zodat je er niet pas
achter komt als een gast op zijn link klikt.

Drie dingen die de database zelf regelt, en waar je niet omheen kunt werken:

- **Dubbele adressen tellen één keer.** Twee regels met hetzelfde e-mailadres leveren één
  deelnemer en één link op.
- **Wie er al staat telt mee.** Een tweede aanroep kan de boeking niet alsnog overvullen.
- **Meer unieke deelnemers dan stoelen wordt geweigerd, en dan wordt er níéts geplaatst** —
  geen halve lijst.

Draai eerst zonder `--commit`. Dan pas met.

### `revoke --participant <uuid> [--commit]`

Trekt de persoonlijke link van één deelnemer in. Gebruik dit als iemand zijn link kwijt is,
of als hij bij de verkeerde terecht is gekomen.

**De vastgelegde keuze verandert hier niet van.** Een link intrekken is iets anders dan een
toestemming intrekken; dat laatste doet de deelnemer zelf, of jij op zijn verzoek. Twee keer
intrekken is veilig en meldt gewoon dat er geen link meer openstond.

Na het intrekken geef je een nieuwe uit met het uitnodigingsscript.

### `progress --claim <uuid>`

    4 of 6 guests have completed the Filming & Media Agreement.

Twee getallen, verder niets — geen namen, geen keuzes. Ook jij hebt die hier niet nodig, en
wat een functie niet teruggeeft kan ook niet per ongeluk ergens terechtkomen. Wil je weten wie
er nog moet: `list` toont de status per deelnemer.

De teller hoort bij één versie van de overeenkomst. Komt er een nieuwe versie, dan staat hij
op nul — dat is de bedoeling, want die tekst heeft dan nog niemand gezien.

## Uitnodigingen versturen

Dat is een ander script:

    node scripts/issue-media-agreements.mjs            # droogloop
    node scripts/issue-media-agreements.mjs --send     # vraagt ook MEDIA_AGREEMENT_SEND_CONFIRM

Het maakt per deelnemer een token van 32 willekeurige bytes, bewaart alleen de sha256-hash, en
zet de ruwe waarde in de link in de mail. Mislukt het versturen, dan trekt het de token meteen
weer in — een link die niemand heeft ontvangen blijft niet leven.

**De mail gaat naar één deelnemer en noemt niemand anders.**

## De volgorde

1. `list` — kijk wat er al staat.
2. `register` zonder `--commit`, dan met.
3. `list` — controleer wat erin staat.
4. `issue-media-agreements.mjs` zonder `--send`, dan met.
5. `progress` — volg wie er klaar is.
6. `revoke` + opnieuw uitnodigen als iemand zijn link kwijt is.

## Wat een deelnemer wél en niet kan

Met zijn eigen link: zijn eigen overeenkomst bekijken, toestemming geven of weigeren, en zijn
keuze intrekken. Verder niets. Hij kan geen deelnemer toevoegen, geen ander record openen en
geen lijst opvragen — die functies bestaan niet op de publieke route, en de functies die het
wél kunnen zijn alleen aanroepbaar met de service_role-sleutel.

Een verlopen, ingetrokken of onbekende link geeft geen toegang en raakt de database niet aan.

## Voordat je dit voor het eerst echt gebruikt

De mediapoort staat dicht, en dat hoort zo tot:

- een Spaanse privacy- en mediajurist de overeenkomst heeft nagekeken;
- de verwerkersovereenkomst met Resend rond is — zie
  `operations/resend-processor-agreement.md`;
- `database/filming-consent.sql` op een wegwerpdatabase is getest — zie
  `operations/supabase-migration-testplan.md` — en daarna in productie is gedraaid;
- de zes instellingen uit `operations/filming-weekend-01.md` bewust zijn gevuld.

Tot die tijd weigert dit script elke schrijfactie, en dat is geen storing.
