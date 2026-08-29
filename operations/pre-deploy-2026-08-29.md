# Pre-deploy check, 29 August 2026

Everything below was run against the local release. Nothing was pushed, nothing was
deployed, and the payment gate was not touched.

Sixty-seven commits ahead of `origin/main`.

---

## ⚠️ One blocker. Do this before deploying, not after

**Set `PUBLIC_BOOKING_OPENS_AT` in Netlify first.**

The live version of `first-access.mjs` does not use that variable. The new one does, and if
it is missing every request for a featured weekend is answered with `503
booking_service_not_configured`. A visitor would see *"Seat registration is temporarily
unavailable"* where today they can claim seats. Private Tavern requests would still work,
which makes it worse: the form looks half alive and nobody notices for a day.

It takes an ISO timestamp, for example `2026-10-01T09:00:00Z`. It does two jobs at once: it
is the moment public booking may open, and the moment First Access sign-ups close. Set it to
a date that has not passed yet and First Access keeps accepting requests exactly as it does
today.

The other five variables the function needs — `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `RATE_LIMIT_SECRET`, `RESEND_API_KEY`, `TAVERN_FROM_EMAIL` —
are already used by the live version, so they exist.

## Second, and not a blocker: the database migration

Run `database/first-access.sql` in Supabase, ideally before the deploy. It adds `starts_on`,
`ends_on` and `price_cents` to the weekends, and `price_cents` to the seat claims.

If you deploy without it, nothing breaks. The calendar hides itself and the old dropdown
takes over, and the checkout — closed anyway — refuses rather than guessing a price. You
simply do not get the new calendar until the migration runs.

---

## What was checked, and what came out

| Check | Result |
| --- | --- |
| Node test suite, including the load test | **87 passing, 0 failing** |
| Payment gate | All three publication constants empty; checkout refuses. Deploying does not bring the sale closer |
| All 16 routes | Every one returns 200 |
| Internal links, all pages | **Zero broken** |
| Buttons and links without an accessible name | **Zero** |
| Missing files referenced by a page | **Zero** |
| Horizontal overflow at 375 px | **None on any page** |
| Console errors | Only `/api/first-access` 404, which is the Netlify function route that does not exist on a static local server |
| Language, single `h1`, heading order, form labels, image alt text | Clean on all 16 pages |
| Image origins recorded | Every image used by a page appears in `operations/image-credits.md` |
| Internal documents blocked from the public site | `/operations/*`, `HANDOVER.md`, `AGENTS.md`, `CLAUDE.md` all return 404 and are disallowed in `robots.txt` |
| Seat handling under load | 100 simultaneous requests hand out exactly six seats, never seven |
| Rate limits | 100 requests from one email → 95 refused with 429; from one address → 88 refused |
| Database unavailable | 50 requests → 50 clean 503s, no half-written claim |

## What goes live that is not there today

Four new public pages: `/tavern/private/`, `/terms/`, `/travel-information/` and
`/standard-information/`. The last three are drafts, carry `noindex`, and say on their own
face that they are not in force.

The Tavern page gets the new hero, the weekend calendar, the nine-photograph slideshow, and
copy that is roughly two hundred words shorter and several promises lighter.

Three functions changed: `first-access.mjs`, `create-checkout-session.mjs` and
`stripe-webhook.mjs`. One is new: `_booking-config.mjs`, which is the payment gate itself.

## What stays closed, on purpose

Paid booking. The three constants in `_booking-config.mjs` are empty and the checkout
refuses while they are, whatever the environment switch says. The legal blockers in
`HANDOVER.md` — the tourism registration, the guarantee, the standard information form's two
missing fields — are untouched by any deploy.

## Not verified

The release has not run on a Netlify preview environment; everything here was tested against
a local static server and the Node suite. The database migration has not been applied to
production. Colour contrast was judged by eye, not measured.
