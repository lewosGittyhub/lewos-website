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
