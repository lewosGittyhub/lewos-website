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
