# Mailroutering — welk bericht naar welk postvak

Gevraagd door Robert op 5 september 2026. Twee postvakken, en ze mogen nooit door elkaar
lopen. Beide staan als omgevingsvariabele in Netlify; er staat geen adres vast in de code
behalve dat van Lewos zelf.

| Variabele | Waarde | Krijgt |
| --- | --- | --- |
| `LEWOS_GENERAL_EMAIL` | `lewos.co@gmail.com` | alles wat geen gewone accommodatieboeking is |
| `FONTECHA_ACCOMMODATION_EMAIL` | het Gmail-adres van de accommodatie — **staat alleen in Netlify** | bevestigde boekingen en wat er nodig is om een kamer klaar te zetten |
| `LEWOS_ACCOMMODATION_EMAILS` | hetzelfde adres, en eventuele andere adressen waarmee de accommodatie in de gedeelde agenda schrijft — **alleen in Netlify** | bepaalt welke agenda-afspraken voorraad blokkeren |

Het account van de accommodatie bestaat sinds 5 september 2026. **Het adres staat bewust
nergens in deze repo** — niet in code, niet in een seed, niet in een test en niet in dit
document. Het is een persoonsgegeven van een derde, en een adres dat eenmaal in de
Git-geschiedenis staat krijg je er niet meer uit. Waar een test een adres nodig heeft, staat
er een verzonnen adres op `.invalid`.

`LEWOS_GENERAL_EMAIL` heeft `lewos.co@gmail.com` als standaardwaarde: staat de variabele
niet in Netlify, dan blijft dat gewoon het hoofdadres van Lewos. **`FONTECHA_ACCOMMODATION_EMAIL`
heeft bewust géén standaardwaarde** — het postvak van een derde partij hoort niet in een
repository, en dat account bestaat op 5 september 2026 nog niet. Er staat daarom nergens in
de code of in deze map een concreet adres voor Fontecha; het komt er pas in als Robert het
in Netlify zet. Zolang die variabele niet in Netlify staat, kan een betaalde boeking niet
worden afgerond: de webhook antwoordt met `accommodation_recipient_not_configured` en
Stripe blijft het proberen. Dat is de bedoeling. Een betaalde boeking waar de accommodatie
niets van weet, is een gast zonder bed, en dat mag niet stil misgaan.

## Wat waarheen gaat

**Naar Lewos (`LEWOS_GENERAL_EMAIL`)**

- Elke vraag via het formulier op `/contact/`. Dat liep tot 5 september 2026 via Netlify
  Forms, met de ontvanger in het Netlify-dashboard; nu langs `netlify/functions/contact.mjs`,
  met `reply_to` op het adres van de gast zodat beantwoorden één klik is.
- Een aanvraag voor een private Tavern — altijd, ook zonder bijzonderheden.
- Een aanmelding of boeking met iets in *Allergies & dietary requirements* (sinds
  5 september 2026 één veld), een verzoek om extra nachten of
  een opmerking in *Anything else* (daar komt een toegankelijkheidsvraag binnen).
- Geen bijzonderheden? Dan gaat er geen mail. Dat scheelt een leeg bericht per aanmelding.

**Naar de accommodatie (`FONTECHA_ACCOMMODATION_EMAIL`)**

- Alleen een **bevestigde, betaalde** boeking. Een First Access-aanmelding is dat niet:
  daar zijn stoelen vastgehouden, geen kamer geboekt.
- Inhoud in twéé blokken, sinds 5 september 2026. *Confirmed booking*: naam van de gast,
  aantal gasten, weekend, aankomstdatum, vertrekdatum, boekingskenmerk. En als er iets
  openstaat een apart blok *NOT YET CONFIRMED — extra nights requested*, met de vraag om
  te antwoorden. Ze stonden eerst door elkaar; dan leest een aanvraag als een afspraak.
  Zie `operations/verblijf-en-extra-nachten.md`. Elk gegeven staat er één keer, met het
  kopje in het Engels én het Spaans.
- **Niet**: het veld *Allergies & dietary requirements*, het vrije tekstveld, of het
  e-mailadres van de gast.
  Die gaan naar Lewos, want Lewos is de verkoper en het aanspreekpunt.

**Naar de gast**

- De ontvangstbevestiging bij aanmelding, en de boekingsbevestiging met de twee PDF's na
  betaling. Daar verandert niets aan; de meldingen hierboven komen er los naast.
- **De betaalherinnering**, sinds 6 september 2026 ook echt vanuit de beheeromgeving. Tot
  die dag legde de knop *Send reminder* alleen vast dát er herinnerd was en ging er niets de
  deur uit: het opbouwen van die mail zat alleen in de lokale testserver. Nu loopt hij langs
  dezelfde `sendEmail` in `netlify/functions/_email.mjs` als de rest van de boekingsflow.

  Inhoud: naam van de gast, **zijn eigen aandeel** (niet het groepstotaal), het weekend, het
  aantal gasten in de groep, de betaaltermijn en zijn eigen betaallink. **Niet**: allergieën
  en dieetwensen, het vrije tekstveld, of de gegevens van de andere deelnemers. Eén
  ontvanger per mail.

  De volgorde is: kijken óf het kan → versturen → pas dan vastleggen. Mislukt de verzending,
  dan staat er geen herinnering in het logboek die nooit is verstuurd, en meldt de
  beheeromgeving `reminder_not_sent` in plaats van "verstuurd".

  Kan er niet herinnerd worden, dan zegt de beheeromgeving waaróm: geen betaaltermijn
  (`no_payment_deadline`) of nog geen betaallink (`no_payment_link`). Allebei een 409 met een
  leesbare zin, nooit een 503.

## De melding aan de accommodatie, vertaald

De mail is tweetalig, Engels en Spaans in dezelfde regel. Hieronder staat wat er staat, in
het Nederlands, zodat Robert weet wat hij laat versturen.

| In de mail | In het Nederlands |
| --- | --- |
| *A Lewos Tavern booking is confirmed and paid. · Una reserva de The Lewos Tavern está confirmada y pagada.* | Een boeking voor The Lewos Tavern is bevestigd en betaald. |
| *Accommodation is needed for 3 guests. · Se necesita alojamiento para 3 huéspedes.* | Er is accommodatie nodig voor 3 gasten. |
| *Booking details / Datos de la reserva:* | Gegevens van de boeking: |
| *Guest name / Nombre del huésped* | Naam van de gast |
| *Number of guests / Número de huéspedes* | Aantal gasten |
| *Weekend / Fin de semana* | Weekend |
| *Arrival / Llegada* | Aankomst |
| *Departure / Salida* | Vertrek |
| *Extra nights requested / Noches adicionales solicitadas* | Gevraagde extra nachten |
| *Booking reference / Referencia de la reserva* | Boekingskenmerk |
| *Questions about this booking go to Robert at Lewos. · Las dudas sobre esta reserva van a Robert, en Lewos.* | Vragen over deze boeking gaan naar Robert bij Lewos. |

De Spaanse zinnen zijn bewust onpersoonlijk (*se necesita*, *las dudas van a*) in plaats van
*tú* of *usted*: zo hoeft er geen aanspreekvorm gekozen te worden die misschien niet past.

## Extra nachten

De site bood extra nachten al aan als *"available on request, subject to availability"*, maar
er was geen veld: zo'n verzoek belandde in *Anything else* en moest daar met de hand uit
gevist worden. Sinds 5 september 2026 is het een eigen veld op `/tavern/`, `/tavern/book/` en
`/tavern/checkout/`, met een eigen kolom `extra_nights` en dezelfde grens van 500 tekens als
allergieën en dieetwensen. Bewust vrije tekst en geen getal — *"twee nachten ervoor en een
erna"* is een normaal antwoord en een getal zou de helft daarvan weggooien.

Het veld belooft niets. Zichtbaar onder het veld staat, op alle drie de formulieren en
letterlijk zoals Robert hem heeft vastgelegd:

> Extra nights can be booked together with your stay, subject to accommodation availability. They are not included in the Tavern price and are paid separately to the accommodation upon arrival.

Die zin staat er als `<small class="field-hint">` en niet als placeholder: een placeholder
verdwijnt zodra iemand begint te typen, precies op het moment dat het voorbehoud telt. Een
test bewaakt allebei — dat de zin er letterlijk staat, en dat hij niet in een placeholder
verstopt zit.

## Hoe de scheiding wordt afgedwongen

Op drie plekken, want dit is de fout die je niet één keer wilt maken:

1. `readRecipients()` in `netlify/functions/_recipients.mjs` weigert twee gelijke adressen
   (`recipient_mixup`) en een adres dat geen adres is.
2. `resendPayload()` in `netlify/functions/_email.mjs` weigert elke mail die de twee
   postvakken samen als ontvanger heeft (`email_recipient_mixup`). Elke mail die Lewos
   verstuurt loopt langs die functie.
3. `tests/recipients.test.mjs`, plus de routeringstests in `tests/checkout.test.mjs`,
   `tests/first-access.test.mjs` en `tests/contact.test.mjs`, lezen de payload die
   daadwerkelijk naar Resend gaat. Die controleren onder meer dat het woord *Peanuts* nooit
   in een bericht aan de accommodatie voorkomt en dat geen enkele mail meer dan één
   ontvanger heeft.

## Welke test bewaakt welke afspraak

Robert heeft op 5 september 2026 zes controles gevraagd. Dit is waar ze staan.

| Afspraak | Test |
| --- | --- |
| Een vraag via het contactformulier gaat alleen naar Lewos | `tests/contact.test.mjs` — *a special question goes to Lewos and never to the accommodation* |
| Een bevestigde boeking gaat naar de accommodatie | `tests/checkout.test.mjs` — *a normal Tavern booking reaches Fontecha with what a room needs and nothing more* |
| Allergieën en dieetwensen gaan nooit naar de accommodatie | `tests/checkout.test.mjs` — *Fontecha never receives what belongs to Lewos* |
| Een verzoek om extra nachten vóór de betaling gaat naar Lewos | `tests/first-access.test.mjs` — *an extra-night request is something Lewos hears about* · `tests/checkout.test.mjs` — *an extra-night request before payment reaches nobody at the accommodation* |
| Extra nachten in een betaalde boeking staan in de melding aan de accommodatie | `tests/checkout.test.mjs` — *an extra-night request travels from the booking form to the accommodation* |
| De twee adressen komen nooit samen in één mail | `tests/recipients.test.mjs` — *no email can carry both mailboxes at once* · `tests/checkout.test.mjs` — *no email ever carries both mailboxes at once* |
| De gast houdt zijn bevestiging met de twee PDF's | `tests/checkout.test.mjs` — *the guest still receives the confirmation, whoever else is notified* |

## Voor de deploy

De volledige deploy-stappen, met de plek in het Netlify-dashboard, staan in
`operations/deploy-mailroutering.md`. Kort:

- [ ] `LEWOS_GENERAL_EMAIL` en `FONTECHA_ACCOMMODATION_EMAIL` staan in Netlify.
- [ ] `node --test tests/*.test.mjs` draait groen.
- [ ] `database/first-access.sql` is opnieuw uitgevoerd. Sinds 5 september 2026 zit daar de
      kolom `extra_nights` in, geven `register_tavern_interest`, `begin_tavern_checkout` en
      `begin_tavern_first_access_checkout` een parameter `p_extra_nights`, en geeft
      `confirm_tavern_payment` ook `arrivalDate` en `departureDate` terug. Zonder die
      migratie vallen die regels weg uit de melding aan de accommodatie — het weekendlabel
      draagt de datums dan nog wel als tekst.
- [ ] De ontvanger van het oude Netlify-formulier `tavern-question` mag uit het
      Netlify-dashboard. Het formulier post niet meer naar Netlify Forms; blijft de oude
      instelling staan, dan is er een postvak dat niets meer ontvangt en waar iemand later
      naar gaat zoeken.
- [ ] `operations/privacy-concept-accommodatie.md` is met Robert doorgenomen en de
      privacyverklaring is bijgewerkt. **Dit hoort vóór de eerste echte melding aan de
      accommodatie te gebeuren**, niet erna.

## Sinds 5 september 2026: aangevraagd is niet bevestigd

De aankomst- en vertrekdatum in de melding zijn het **bevestigde** verblijf. Zolang de
accommodatie niets heeft toegezegd zijn dat de weekenddatums, ook als de gast extra nachten
heeft aangeklikt. De aanvraag staat in een eigen blok eronder, en de zin daarin wordt
afgeleid uit de opgeslagen datums — niet uit een tekstveld dat iets anders kan zeggen.

Het antwoord van de accommodatie wordt in de beheeromgeving vastgelegd (**Confirm as
requested · Confirm different dates · Decline**). Pas dan schuift de aankomstdatum op, en
pas dan verandert de Google Agenda-afspraak mee.
