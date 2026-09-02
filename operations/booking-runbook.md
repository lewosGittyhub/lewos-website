# Booking operations

## Before public booking opens

1. Keep `TAVERN_PAYMENTS_ENABLED` off until the final terms and travel PDFs are published and their reviewed version is compiled into the site.
2. Send First Access invitations only with `scripts/issue-first-access.mjs`. The sender refuses windows that would extend beyond public opening.
3. Run `scripts/audit-payment-reconciliation.mjs`. A clean result reports no unresolved attached checkout requiring intervention.
4. In Stripe, confirm that the production webhook is active for completed and expired Checkout Sessions.
5. Only then enable the payment gate. The database also refuses public opening while a private invitation window remains active.

The required database pre-release check is `tests/database-integration.sql`, executed after `database/first-access.sql` in one Supabase SQL transaction. A successful run returns no exception and ends with `rollback`; it must never leave test fixtures behind.

## If the reconciliation audit reports a problem

- `paid_webhook_missing`: do not release the seats. Verify the payment in Stripe and resend its completed Checkout event so the booking and confirmation email are completed normally.
- `expiry_webhook_missing`: verify the session is expired in Stripe and resend its expired Checkout event so the hold is released normally.
- `stripe_lookup_failed`: leave the seats reserved, verify Stripe/API availability and run the audit again.
- Never free an attached checkout only because its local timer has passed.

## Email delivery

- Receipt and confirmation emails use stable idempotency keys.
- Claims whose receipt was not recorded remain retryable without claiming more seats.
- Before sending private payment invitations, confirm the dry-run count and keep the explicit send guard enabled.

## Load and limits before opening

A local load test lives in `tests/load.test.mjs`. It drives about a hundred simultaneous
First Access requests against the function layer with a stand-in database that follows the
same rules as `database/first-access.sql`. It proves three things: seats are never handed
out twice, the rate limits answer with 429 instead of failing, and a database that drops
out returns 503 rather than leaving the request hanging. It touches no production data and
never contacts Stripe.

The limits the site itself enforces:

- Twelve requests per quarter of an hour per IP address, five per email address, on both
  First Access and checkout.
- Six seats per featured weekend, and a maximum of two active claims per email address.
- A party is never split: if the whole group does not fit, no seats are taken.

### Supabase — settle before the first invitation goes out

- **A Free Plan project is paused after seven days of low activity.** Supabase states it
  may pause projects on that plan to save resources. A paused database means First Access
  requests fail while the site looks fine. Move to a paid plan before traffic arrives.
- **Free Plan database backups cannot be downloaded.** Booking, payment and invoice records
  must be kept for the periods that accounting, tax and consumer law require, which the
  privacy statement promises. Arrange backups, and consider point-in-time recovery, before
  the first paid booking.
- Turn on SSL enforcement and network restrictions under the database settings.
- Source: https://supabase.com/docs/guides/platform/going-into-prod

### Netlify — check in the dashboard, the numbers depend on the plan

- The contact form posts to Netlify Forms, not to a function, so it is not covered by the
  load test above. Check the monthly submission quota on the current plan and switch on
  spam filtering and a notification, or the first spam wave silently eats the allowance.
- Check the function invocation and runtime quota, and the function timeout. The checkout
  function talks to Stripe and to Supabase within one request.
- Set a deploy and function-error notification so a failing booking function is noticed
  without a guest having to report it.

## Allergieën en dieetwensen opzoeken

*Toegevoegd 2 september 2026. Ze staan sinds die dag in eigen kolommen en niet meer
verstopt in het vrije berichtveld.*

`tavern_seat_claims` heeft er twee kolommen voor: `allergies` en `dietary_requirements`,
elk maximaal 500 tekens. Het veld `message` blijft bestaan voor overige opmerkingen en
is niet aangeraakt — bestaande aanvragen houden hun tekst precies zoals hij was, en bij
die rijen zijn de twee nieuwe kolommen `null`.

**De lijst die je vóór elk weekend nodig hebt**, in de SQL-editor van Supabase:

```sql
select c.name, c.email, c.party_size, c.allergies, c.dietary_requirements, c.message
  from public.tavern_seat_claims c
  join public.tavern_weekends w on w.id = c.assigned_weekend_id
 where w.slug = 'weekend-01'
   and c.status in ('first_access_held','payment_pending','paid')
 order by c.created_at;
```

**Wie iets doorgaf, krijgt het terug in zijn ontvangstbevestiging.** De mail herhaalt de
allergie en de dieetwens letterlijk, met de uitnodiging om te antwoorden als er iets niet
klopt. Dat is bewust: een typefout in een allergie hoort een gast zelf te kunnen zien,
niet pas de kok aan tafel.

**Twee dingen om te weten.**

- Een aanvraag die vóór 2 september is binnengekomen heeft deze kolommen leeg staan, ook
  als de gast zijn allergie destijds in het berichtveld schreef. Lees bij die rijen dus
  óók `message`. De query hierboven toont alle drie de kolommen, juist daarom.
- **De publieke checkout op `/tavern/book/` vraagt er niet naar.** Die weg loopt via
  `begin_tavern_checkout` en is bewust niet aangepast, omdat dat de betaalfunctie is.
  Zolang die pagina open staat kan iemand daar boeken zonder ooit een allergie te kunnen
  melden. Dat is een openstaand punt voor Robert, geen technische fout.

**Wat er gebeurt als iemand zich twee keer aanmeldt.** Er komt geen tweede claim en geen
tweede e-mail. Wél worden allergie, dieetwens en bericht bijgewerkt met wat er nieuw is
meegestuurd — een lege waarde overschrijft nooit wat er al staat. De pagina zegt dat er
niets verloren is gegaan. Praktisch: iemand die terugkomt omdat hij zijn allergie vergeten
was, hoeft niet met je te bellen; hij vult het formulier gewoon opnieuw in.

### Hoe de ontvangstbevestiging eruitziet

*Formaat gewijzigd op 2 september 2026.*

De mail herhaalt nu **alle drie** de velden die de gast heeft ingevuld — allergieën,
dieetwensen en overige opmerkingen — elk onder een eigen kopje, met de regeleindes van de
gast intact. Een veld dat leeg is gebleven krijgt geen kopje en laat geen lege regel achter.

**De mail gaat als HTML én als platte tekst de deur uit.** Dat is nieuw: hiervoor was hij
HTML-only. Een postvak dat geen HTML toont, of een schermlezer die de tekstversie pakt,
kreeg de allergie dan niet te zien. In de HTML wordt elke regel een `<br>`, in de tekst een
echte nieuwe regel met twee spaties ervoor zodat hij bij zijn kopje hoort.

Wat de gast leest:

```
Allergies:
  Peanuts - severe, carries an EpiPen
  Shellfish - moderate

Dietary requirements:
  Vegetarian
```

Eronder staat: *"If anything here is wrong or incomplete, reply to this email and we will
correct it."* Reageert iemand daarop, dan pas je het aan in Supabase — of je laat hem het
formulier opnieuw invullen, want een herhaalde aanmelding werkt de velden bij zonder een
tweede claim of een tweede mail te maken.

**Wat de gast schrijft wordt getoond, nooit uitgevoerd.** `<`, `>`, `&` en aanhalingstekens
worden ontsnapt vóórdat de regeleindes worden omgezet; die volgorde is wat het veilig houdt.
Vrije tekst komt nooit in de onderwerpregel of het ontvangstadres terecht.

**Alle vier de mails gaan nu als HTML én als tekst de deur uit** — ontvangstbevestiging,
betaalbevestiging, uitnodiging betaalvenster en media-overeenkomst. Ze lopen alle vier via
`resendPayload()` in `netlify/functions/_email.mjs`, en die weigert een mail zonder
tekstversie of met een regeleinde in de onderwerpregel. Komt er ooit een vijfde mail bij,
dan valt `tests/email.test.mjs` om zolang die niet langs dezelfde poortwachter loopt.

In de tekstversie van de twee mails met een knop staat de link als gewone URL, ingesprongen
onder de zin die hem aankondigt. Een postvak zonder HTML toont anders een knop zonder doel.

### Het operator-script

```bash
node scripts/guest-details.mjs --weekend weekend-01
```

Leest de keukenlijst uit: per boeking de naam, het aantal stoelen, en daaronder allergieën,
dieetwensen en overige opmerkingen — met de regeleindes van de gast intact. **Het script
schrijft nooit iets**, er zit dus geen poort omheen. `--json` geeft dezelfde gegevens als
JSON, bijvoorbeeld om door te geven aan de kok.

Onderaan staat hoeveel boekingen een allergie meldden. Staat er een waarschuwing over
aanvragen van vóór 2 september 2026, dan hebben die alles in het oude berichtveld staan —
lees bij die regels de *Notes* voordat je de keuken plant.

**Alle vier de gastpaden vullen dezelfde kolommen.** Het First Access-formulier op
`/tavern/`, de privéaanvraag op `/tavern/private/`, de publieke checkout op `/tavern/book/`
en het betaalvenster op `/tavern/checkout/` sturen de drie velden apart mee. Er is geen weg
meer waarop een allergie in een algemeen berichtveld belandt.

**Op `/tavern/checkout/` gelden ze als aanvulling.** Dat pad hervat een claim die er al is,
dus een leeg veld laat staan wat de gast bij zijn aanmelding invulde; alleen iets nieuws
overschrijft. Dat staat ook op de pagina zelf: *"Leaving a field empty never erases what you
told us before."* Praktisch: wie zijn allergie vergeten was kan hem daar alsnog toevoegen,
vlak voor hij betaalt.
