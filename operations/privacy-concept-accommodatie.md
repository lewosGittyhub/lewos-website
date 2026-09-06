# Concept: de accommodatie in de privacyverklaring

**Status: concept. Niet gepubliceerd.** `privacy/index.html` is niet aangepast. Dit bestand
bevat de voorgestelde tekst zodat Robert hem eerst kan lezen. Pas na zijn akkoord — en, gezien
punt 4 hieronder, bij voorkeur na één ronde langs een gestor — gaat hij de pagina in.

Aanleiding: sinds 5 september 2026 gaat er bij een bevestigde boeking een melding naar
`FONTECHA_ACCOMMODATION_EMAIL`. De privacyverklaring noemt Netlify, Supabase, Stripe en Resend
als ontvangers, maar de accommodatie nog niet. Zolang die zin er niet staat, ontvangt een
partij gastgegevens die de gast nergens heeft kunnen lezen.

Er zit een tweede correctie in dit concept die niets met Fontecha te maken heeft: het
vragenformulier liep tot vandaag via Netlify Forms en loopt nu via een eigen functie. De
huidige tekst klopt daardoor niet meer.

---

## Wijziging 1 — sectie *What we collect*

**Nu:**

> When you join First Access or book, we collect your name, email address, chosen weekend,
> group size, payment and booking status, the confirmations made during booking and anything
> you choose to tell us.

**Voorstel:** één opsommingspunt erbij, omdat er sinds vandaag een veld voor extra nachten op
het formulier staat.

> When you join First Access or book, we collect your name, email address, chosen weekend,
> group size, any extra nights you ask for, payment and booking status, the confirmations made
> during booking and anything you choose to tell us.

---

## Wijziging 2 — sectie *Where it goes*, eerste zin

**Nu:**

> Questions sent through the contact form are delivered through Netlify, the company that
> hosts this website.

**Voorstel:** dit klopt niet meer sinds het formulier langs een eigen functie loopt.

> Questions sent through the contact form are delivered to Lewos by email through Resend.
> Netlify hosts this website and runs the code that handles the form.

---

## Wijziging 3 — sectie *Where it goes*, nieuwe alinea

Onderaan die sectie toe te voegen, vóór de zin *"We do not sell your details…"*:

> To arrange your stay we share part of your booking with the accommodation where the Tavern
> weekend takes place, Complejo Rural de Fontecha in Asturias, Spain. They receive your name,
> the size of your party, which weekend you booked, your arrival and departure dates, and any
> extra nights you asked for — what they need to prepare a room for you. They do not receive
> your email address, your allergies, your dietary requirements, or anything else you told us.
> Those stay with Lewos, and Lewos remains your contact for everything about your booking:
> general questions, dietary requirements, accessibility and anything unusual all go to
> lewos.co@gmail.com. Fontecha is in Spain, so this part of your booking does not leave the
> European Economic Area.

---

## Wijziging 4 — sectie *Where in the world it goes*

Geen wijziging nodig. Fontecha zit in Asturië; er gaat door deze melding niets extra's buiten
de EER. De laatste zin van wijziging 3 zegt dat al met zoveel woorden.

---

## Wijziging 5 — sectie *Where it goes*, wie het bij Lewos zelf kan inzien

*Toegevoegd 6 september 2026.* Sinds 5 september is er een beveiligde beheeromgeving op
`/admin/`. Twee met naam genoemde beheerders — Robert namens Lewos en Nadine namens de
accommodatie — kunnen daar een boeking openen en zien dan ook het veld
*Allergies & dietary requirements*. Dat is nieuwe verwerking die de verklaring nog nergens
noemt, en het is bovendien het gevoeligste veld dat we hebben.

Toe te voegen na de alinea uit wijziging 3:

> Inside Lewos, your booking is visible to named people only. Two named administrators can
> open a booking to prepare your weekend; everyone else is refused, and signing in is not by
> itself enough. What you tell us about allergies and dietary requirements is shown only on
> that individual booking, never in shared overviews and never in a calendar.

Dat is geen belofte die we nog moeten waarmaken maar een beschrijving van wat er staat: de
toegang hangt aan een lijst met adressen, het maandoverzicht draagt die gegevens niet, en
`bookingEvent()` neemt ze niet eens aan. Op 6 september 2026 is dat met echte verzoeken
gecontroleerd — zie `scripts/integration-auth.mjs`.

---

## Wijziging 6 — één veld in plaats van twee

*Toegevoegd 6 september 2026.* Allergieën en dieetwensen zijn op het formulier samengevoegd
tot één veld. De voorgestelde zin in wijziging 3 noemt ze los van elkaar
(*"your allergies, your dietary requirements"*) en blijft daarmee kloppen — hij zegt wat
Fontecha **niet** krijgt, en dat is nog steeds allebei. **Geen wijziging nodig.**

Wel een aandachtspunt voor de gestor: het gaat hier om gezondheidsgegevens (artikel 9 AVG).
Dat was met twee velden ook al zo en verandert niet door de samenvoeging, maar het is de
reden dat dit veld nergens anders opduikt dan in het beveiligde detailvenster.

---

## Wijziging 7 — aangevraagd verblijf is niet bevestigd verblijf

*Toegevoegd 6 september 2026.* De zin in wijziging 3 zegt dat Fontecha *"your arrival and
departure dates, and any extra nights you asked for"* krijgt. Sinds de kalender met datums
is dat preciezer geworden en de tekst hoort dat te volgen:

> They receive your name, the size of your party, which weekend you booked, the arrival and
> departure dates of your confirmed stay, and separately any extra nights you have asked
> for, so that they can tell us whether those nights are free.

Waarom dit ertoe doet: de melding aan de accommodatie draagt twee verschillende dingen — een
bevestigd verblijf en een openstaande vraag. Ze staan in de mail ook in twee aparte blokken.
Eén zin die ze op één hoop gooit, beschrijft niet wat er gebeurt.

---

## Wat hier bewust níét staat

1. **Geen woord over maaltijden.** Wie er kookt en of dieetwensen ooit alsnog naar Fontecha
   moeten, weet ik niet en verzin ik niet. Zolang de code die gegevens niet verstuurt, staat
   er in de verklaring ook niets over. Gaan ze later wél mee, dan moet deze alinea eerst mee
   veranderen — anders staat er iets onwaars op de pagina.
2. **Geen juridische kwalificatie van Fontecha.** De verklaring noemt Netlify, Supabase,
   Stripe en Resend "providers [that] process the information only to provide those services
   to Lewos" — dat is de omschrijving van een verwerker. Of Fontecha een *verwerker* is (dan
   hoort er een verwerkersovereenkomst bij, artikel 28 AVG) of een **zelfstandige
   verwerkingsverantwoordelijke** met een eigen gastenadministratie, weet ik niet. Een hotel
   of casa rural voert doorgaans een eigen wettelijk verplichte gastenregistratie en is dan
   zelfstandig verantwoordelijk — maar dat is een aanname, geen geverifieerd feit, en het
   bepaalt wél welk papier eronder hoort. **Dit is de vraag voor de gestor.** De voorgestelde
   tekst hierboven zegt daarom alleen wát er gedeeld wordt en waarom, en plakt er geen etiket
   op; die zin blijft kloppen, welk antwoord de gestor ook geeft.
3. **Geen bewaartermijn voor wat Fontecha krijgt.** Dat is hun administratie, niet die van
   Lewos. Zodra bekend is wat er onder punt 2 geldt, hoort er mogelijk een zin bij.

## Wat er daarna nog moet

- [ ] Robert leest dit en zegt of de tekst klopt.
- [ ] Punt 2 hierboven voorleggen aan de gestor; het antwoord bepaalt of er nog een
      verwerkersovereenkomst met Fontecha bij hoort.
- [ ] Pas dán de wijzigingen in `privacy/index.html` doorvoeren. De patch
      `privacy-concept-accommodatie.diff` dekt wijziging 1, 2 en 3; **wijziging 5 en 7 staan
      er nog niet in** omdat de formulering van 5 (wie mag inzien) en 7 (aangevraagd tegenover
      bevestigd) eerst langs Robert en de gestor hoort. Zeg je er ja op, dan werk ik de patch
      bij zodat hij alles in één keer doet.
- [ ] De melding aan de accommodatie gaat pas echt de deur uit als de betaalpoort opengaat.
      Tot die tijd is er geen gast wiens gegevens al gedeeld zijn, dus deze volgorde kan.
