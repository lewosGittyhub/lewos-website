# Resend — wat er via hun systeem gaat, en wat er nog geregeld moet worden

Intern. `/operations/*` geeft 404 en staat in `robots.txt`.

Opgesteld 1 september 2026 op commit `069d515`. Alles onder *Wat er feitelijk doorheen gaat*
komt uit de code van deze repo en is daar regel voor regel op nagelezen. Alles onder *Wat
Robert moet regelen* is een vraag, geen constatering: **ik heb Resend niet benaderd en kan
niets namens hen bevestigen.** Wat zij contractueel bieden moet uit hun eigen
verwerkersovereenkomst komen, niet uit dit document.

## De kern, in één alinea

Er lopen vier e-mailstromen via Resend. **Eén daarvan draait nu al live** — de
ontvangstbevestiging van First Access — en die stuurt naam en e-mailadres van een echte gast
naar een verwerker in de Verenigde Staten. De andere drie zitten achter een gesloten poort.
De verwerkersovereenkomst is dus geen toekomstig punt voor de mediaflow alleen; hij hoort er
nu al te zijn voor het formulier dat op de site staat.

## Wat er feitelijk doorheen gaat

| # | e-mail | code | persoonsgegevens | status |
| --- | --- | --- | --- | --- |
| 1 | Ontvangstbevestiging First Access | `netlify/functions/first-access.mjs:48` | naam, e-mailadres, gekozen weekend, aantal stoelen | **live** |
| 2 | Boekingsbevestiging na betaling | `netlify/functions/stripe-webhook.mjs:41` | naam, e-mailadres, aantal stoelen, weekendlabel, versie van de voorwaarden, plus twee PDF-bijlagen | achter de betaalpoort (dicht) |
| 3 | Uitnodiging privé-betaalvenster | `scripts/issue-first-access.mjs:34` | naam, e-mailadres, stoelen, weekendlabel, deadline, **en een checkout-token in de link** | achter de betaalpoort (dicht) |
| 4 | Uitnodiging Filming & Media Agreement | `scripts/issue-media-agreements.mjs:41` | volledige naam, e-mailadres, weekendlabel, versienummer, **en een persoonlijk toestemmingstoken in de link** | achter de mediapoort (dicht) |

Bij elke aanroep gaan daarnaast mee: het afzenderadres (`TAVERN_FROM_EMAIL`), een vast
`reply_to` van `lewos.co@gmail.com`, een onderwerpregel en de volledige HTML-inhoud van de
mail. Resend krijgt dus niet alleen de adressering maar ook de tekst.

**Twee van de vier bevatten een geheim in de linktekst.** Stromen 3 en 4 zetten een token in
de URL. De database bewaart alleen de sha256-hash daarvan, maar de mail zelf — en dus het
systeem van Resend, inclusief wat daar aan logging omheen zit — draagt de ruwe waarde. Wie
die mail of dat log kan lezen, kan de link openen. Dat verhoogt wat er van de
verwerkersovereenkomst gevraagd moet worden: niet alleen "verwerkt netjes", maar ook hoe lang
berichtinhoud bewaard blijft en wie daarbij kan.

**Er wordt geen nieuwsbrief of marketing via Resend verstuurd.** Alleen transactionele
berichten die volgen op een handeling van de gast zelf.

## Wat wij zelf vastleggen

- `tavern_seat_claims.receipt_email_sent_at` en `.receipt_email_provider_id` — het
  bericht-ID dat Resend teruggeeft, plus het tijdstip.
- `.invitation_sent_at` / `.invitation_email_provider_id` en
  `.confirmation_email_sent_at` / `.confirmation_email_provider_id` — idem.
- `tavern_media_participants.invitation_sent_at` / `.invitation_email_provider_id`.

Wij bewaren dus wél dat er een mail is gegaan en met welk ID, maar niet de inhoud. Hoe lang
Resend zelf het bericht en de metadata bewaart, weten wij niet en staat nergens in deze repo.
Dat is een van de vragen hieronder.

## Wat de privacyverklaring nu zegt

`/privacy/` noemt Resend bij naam en zegt: *"Transactional email is delivered by Resend,
which processes in the United States."* Voor de andere drie verwerkers staat er wél een
waarborgmechanisme bij — standaardcontractbepalingen, en bij Netlify en Stripe ook het
EU–VS Data Privacy Framework. **Bij Resend staat er bewust géén mechanisme**, omdat een
eerdere sessie heeft vastgesteld dat hun publieke beleid er geen noemt. Dat is de eerlijke
formulering en die moet zo blijven tot het tegendeel op papier staat. Vul daar niets in op
grond van een aanname.

## Wat Robert bij Resend moet regelen

Dit is de uitvraag. Geen enkel punt hieronder is een bewering over wat Resend biedt.

1. **Is er een verwerkersovereenkomst (DPA) in het account?** Bij veel aanbieders staat die
   onder de accountinstellingen als document dat je online accepteert. Kijk daar eerst;
   is hij er, dan is het een kwestie van accepteren en een kopie bewaren.
2. **Welk doorgiftemechanisme geldt** voor verwerking in de Verenigde Staten:
   standaardcontractbepalingen, het EU–VS Data Privacy Framework, of iets anders? Vraag om
   het stuk zelf, niet om een verwijzing.
3. **Welke subverwerkers** zetten zij in, en is er een meldingsplicht bij wijziging?
4. **Hoe lang bewaren zij de inhoud van een bericht**, en hoe lang de logs en metadata?
   Dit is de vraag die er voor ons het meest toe doet, vanwege de tokens in stromen 3 en 4.
5. **Wie binnen Resend kan bij berichtinhoud**, en onder welke voorwaarden?
6. **Verwijdering**: kunnen wij verwijdering van een bericht of van een adres vragen, en
   binnen welke termijn?
7. **Beveiliging**: welke technische en organisatorische maatregelen, en is er een
   certificering of auditrapport dat zij delen?
8. **Datalekken**: binnen welke termijn melden zij aan ons?
9. **Is er een EU-regio mogelijk** voor verzending of opslag? Dat zou vraag 2 een stuk
   eenvoudiger maken.

## Conceptbericht aan Resend

Kort houden; support-afdelingen antwoorden beter op een lijstje dan op een betoog.

> Subject: Data Processing Agreement and EU data transfer details
>
> Hello,
>
> I run a small business in Spain and use Resend for transactional email to customers in
> the EU. Before I continue, I need to have the data protection side in order under the
> GDPR.
>
> Could you point me to:
>
> 1. your Data Processing Agreement, and how I accept and keep a copy of it;
> 2. the transfer mechanism you rely on for processing in the United States (standard
>    contractual clauses, EU–U.S. Data Privacy Framework, or otherwise), and the document
>    itself;
> 3. your current list of sub-processors and how changes are notified;
> 4. how long message content, logs and metadata are retained, and whether that can be
>    shortened;
> 5. your security measures and any audit report or certification you share;
> 6. your breach notification timeline;
> 7. whether an EU processing or sending region is available.
>
> Thank you,
> Robert Neugebauer — Lewos

## Waar dit in het project thuishoort

- **De overeenkomst zelf**: níét in deze repository. Geen contracten of accountgegevens in
  git. Bewaar hem bij de andere bedrijfsdocumenten en noteer hier alleen dát hij er is, met
  de datum.
- **Het doorgiftemechanisme**: zodra het vaststaat, gaat het in `/privacy/`, in dezelfde zin
  waar nu alleen "processes in the United States" staat, en in de privacysectie van
  `/tavern/filming-agreement/`.
- **De bewaartermijn van Resend**: relevant voor de bewaarparagraaf, en voor de vraag hoe
  lang een uitnodigingslink praktisch gezien leesbaar blijft.
- **Deze checklist**: hier, met een datum en een uitkomst per punt zodra Robert antwoord heeft.

## Blokkade

**Geen enkele uitnodiging mag de deur uit voordat dit rond is.** Op dit moment houdt de
techniek dat ook tegen: `scripts/issue-media-agreements.mjs` weigert te draaien zolang
`mediaConsentIsEnabled()` onwaar is, en `scripts/issue-first-access.mjs` weigert zolang
`paymentsAreEnabled()` onwaar is. Allebei zijn ze dicht, en er zijn tests die dat vasthouden.
Maar dat is een technische rem, geen juridische afspraak — en **stroom 1 loopt daar volledig
buitenom**, want die zit aan het openstaande First Access-formulier. Als Robert de
verwerkersovereenkomst niet op korte termijn rond krijgt, is de eerlijke tussenoplossing om
die bevestigingsmail tijdelijk uit te zetten door `RESEND_API_KEY` in Netlify leeg te maken:
de functie slaat het versturen dan over en de aanmelding zelf blijft gewoon werken.
