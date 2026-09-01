# Weekend 01 — the filmed First Edition: what still has to be arranged

Internal. Not served: `/operations/*` returns 404 and robots.txt disallows it.

This file covers the things the website cannot do by itself. The consent design,
the record-keeping and the release gate are in `.internal/filming-consent-v1.1.md`
and are not repeated here. This is the work list that hangs off it.

Source for the legal reasoning: written advice from Robert's adviser, received
1 September 2026 (`Agreement_Media_Lewos.pdf`, eight pages, read in full). It is
advice and a recommended structure, not a signed agreement. Every legal
formulation it suggests still needs a Spanish privacy and media lawyer.

## What is on the site now, and what it is not

- `/tavern/` names Weekend 01 as The Filmed First Edition, says what is captured,
  where it may appear, and that every attendee signs personally. Public.
- `/legal/#filming` carries the full disclosure, the excluded uses, the separate
  paid-advertising permission and the withdrawal wording. Public, `noindex`.
- `/tavern/filming-agreement/` is the per-attendee agreement, written as a finished
  document. `noindex, nofollow` — it belongs to a personal link, not to a search
  result. It names the AEPD as supervisory authority, `lewos.co@gmail.com` as the
  privacy contact, the full list of channels, and the retention wording. **Nothing
  on it tells a guest anything about our own preparation**, and it collects nothing
  while the gate below is shut: the form panel stays hidden and every field is
  disabled in the HTML itself.
- `/tavern/book/` and `/tavern/checkout/` ask the person paying to confirm they
  have read that Weekend 01 is filmed. That is an acknowledgement only.

Filming consent is no longer taken at checkout at all. The old optional
checkbox recorded a permission with no version, no receipt and no evidence
behind it, and it sat on the same screen as the payment. `p_filming_consent`
now always receives `false` from both checkout paths; a client that sends
`filmingConsent:true` is ignored. Consent moves to the personal agreement.

## What the public text now promises — internal only

The page reads as finished, so everything on it is a promise. Read this list once and
say if any of it is wrong; a guest can hold us to all of it.

- No filming in bedrooms, bathrooms, changing areas or other clearly private spaces.
- Guests are told when filming is actively taking place.
- There are periods during the weekend when the cameras are down.
- A guest can ask for the camera to stop during a personal or sensitive conversation.
- Meals are filmed selectively rather than continuously.
- The game table is the main expected filming location.
- Private conversations and sensitive disclosures are not published, even if recorded.
- Withdrawal costs nothing and has no effect on the booking.
- Paid advertising on Meta, Google and TikTok only with the separate optional consent.
- Material in which a guest is recognisable may appear on: the Lewos website, the
  StoryForgers website, official organic social media, newsletters, PR and editorial
  publications, promotional films and trailers.

## Still open, and deliberately not on the public page

None of this is visible to a guest. It lives here, in `HANDOVER.md` and in the
configuration gate, and nowhere else.

1. **A Spanish privacy and media lawyer has not reviewed this text.** That review is
   still required before the gate is opened, with the withdrawal clause under
   Ley Orgánica 1/1982 and the GDPR as the first thing to check. The page says nothing
   about it, because a guest has no business reading about our own preparation.
2. **The ANBEN identity data is still missing**: tax identification number, full postal
   address, telephone, tourism registration code and the insolvency guarantee. None of
   it may be invented. The consent page works without it — it names the controller,
   where Lewos is established, and a working contact address — but the **official sales
   documents and the payment gate stay closed** until those details land.
3. **The three statutory sales documents are blocked**: `/standard-information/`,
   `/terms/` and `/travel-information/`. Robert decided on 1 September 2026 that they may
   not be readable online at all while they still say they are not in force and still miss
   the ANBEN details. Six forced `404!` rules in `_redirects`, three `Disallow` lines in
   `robots.txt`, no sitemap entry, and no link to them from any page that is served. The
   files themselves are kept in the repository, unchanged, for the day they are finished.
   The two confirmation checkboxes in `/tavern/book/` and `/tavern/checkout/` no longer
   point at `/terms/`; they now say the full booking terms are provided before any payment
   is requested. **When these documents go live again, remove those six lines and put the
   `/terms/` link back in both checkboxes** — the reminder is in `_redirects` as well.
4. **The operational rules above became public promises.** They were "to be confirmed"
   before; they are now printed. If one of them is wrong it has to come off the page.

## One rule that is not on the public page

A practical camera-free route or area for a guest who has not given permission. This is
an arrangement on the ground rather than a term of the agreement, so it belongs in the
crew briefing and not in the text a guest signs. It still has to exist on the weekend
itself: a guest who declined and then has nowhere to sit has been given a choice on paper
and not in practice.

## The agreement with the videographer

The guests' permissions only settle the guests' rights. They say nothing about
who owns the footage. A separate written agreement with the videographer has to
give the Lewos entity:

- commercial copyright and licensing rights wide enough for the intended use —
  ideally an assignment where Spanish law allows it, otherwise a broad licence;
- the right to store, edit, crop, shorten, combine, reproduce and publish;
- use across the agreed channels: Lewos and StoryForgers websites, official
  organic social media, newsletters, PR and editorial, promotional films;
- handover and security of the raw files, and how long each party keeps them;
- deletion obligations and incident reporting;
- confidentiality, permitted instructions and subcontractors;
- **no independent publication by the videographer** — not on a portfolio, not
  on their own social media — without Lewos's approval and without the relevant
  participant permissions actually covering it.

Also confirm ownership and licences for the final edit, and for any music in it.
If a drone is used: AESA operator registration, category, flight-zone
restrictions, pilot requirements and insurance, all before the first flight.

## The per-attendee flow

Built on 1 September 2026 and **shut**. Nothing runs until the gate below is opened.

    reservation → lead booker supplies the attendees → every adult attendee gets their own
    link → each completes the agreement personally → the organiser sees only progress,
    for example "4 of 6 guests have completed the Filming & Media Agreement."

### The gate — `netlify/functions/_media-config.mjs`

Two locks, and both have to be turned on purpose. Six constants live in the code and ship
empty; six settings live in Netlify. A code change alone does nothing, and a Netlify change
alone does nothing. `mediaConsentIsEnabled()` is false unless all of it lines up, and
`mediaConsentBlockers()` names exactly what is missing. Nothing degrades silently.

| Netlify setting | What it is | Must match |
| --- | --- | --- |
| `TAVERN_MEDIA_CONSENT_ENABLED` | the deliberate on-switch, `true` | — |
| `MEDIA_AGREEMENT_VERSION` | the approved version identifier | `PUBLISHED_MEDIA_AGREEMENT_VERSION` in the code |
| `MEDIA_AGREEMENT_DOCUMENT_URL` | the immutable document reference | — |
| `MEDIA_AGREEMENT_HASH` | sha256 of the exact approved text | — |
| `MEDIA_PRIVACY_CONTACT` | the confirmed privacy contact address | — |
| `MEDIA_RETENTION_PERIOD` | the confirmed retention period | — |
| `MEDIA_LEGAL_REVIEW_REFERENCE` | reference to the Spanish legal review | — |

The other variables the flow uses are the ones the site already has: `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `RATE_LIMIT_SECRET`, `URL`, `RESEND_API_KEY` and
`TAVERN_FROM_EMAIL`. `NODE_ENV` and `RESEND_API_URL` exist for the local test server only;
as with the payment gate, `NODE_ENV=test` is worthless unless `URL` is localhost, so test
fixtures can never open the gate on a public deploy. `MEDIA_AGREEMENT_SEND_CONFIRM` is the
extra hand-typed confirmation the invitation script demands before it will send anything.

**This gate is not the payment gate.** They share no code and no variable. Opening the media
flow cannot make a payment possible, and paying cannot record media consent. A test holds
both apart.

### What the migration adds — `database/filming-consent.sql`

Run it **after** `first-access.sql`. It has not been run anywhere; there is no production
migration behind this work.

Tables:

- `tavern_media_agreements` — one row per version: `version`, `document_reference`,
  `content_hash` (sha256 of the exact text), `language`, `legal_review_reference`,
  `supersedes`, `effective_from`.
- `tavern_media_participants` — one row per adult attendee: `claim_id`, `weekend_id`,
  `full_name`, `email`, `adult_declared`, `invitation_token_hash`, `invitation_expires_at`,
  `invitation_sent_at`, `invitation_email_provider_id`, `status`. Name and email only —
  no date of birth, no address, nothing the flow does not need.
- `tavern_media_consents` — one row per decision: `participant_id`, `agreement_version`,
  `agreement_content_hash`, `standard_use_consent`, `paid_advertising_consent`,
  `confirmation_method`, `audit_reference`, `recorded_at`, `withdrawn_at`.

Two columns on the existing `tavern_seat_claims`: `media_progress_token_hash` and
`media_progress_expires_at`, for the organiser's counts-only link.

Functions, all `security definer`, all revoked from `public`/`anon`/`authenticated` and
granted to `service_role` only: `tavern_media_agreement_required`,
`register_tavern_media_participants`, `issue_tavern_media_invitation`,
`mark_tavern_media_invitation_sent`, `revoke_tavern_media_invitation`,
`get_tavern_media_agreement_state`, `record_tavern_media_consent`,
`withdraw_tavern_media_consent`, `get_tavern_media_progress`, plus
`private.cleanup_tavern_media_invitations` and `private.purge_tavern_media_records`.

### How the seat count works

`register_tavern_media_participants` deduplicates on email address **before** it counts, and
it counts what is already registered along with what is being submitted. The rule is:
already registered + new unique addresses must not exceed `party_size`.

That order matters, and it was wrong at first. The check used to be
`jsonb_array_length(p_participants) > claim.party_size`, which counts raw list items. A lead
booker with two guests who submitted one of them twice was refused with
`too_many_participants`. Codex found it on a throwaway Supabase branch on 1 September 2026.

Counting what is already stored closes a second hole in the same check: it only ever looked
at the payload, so calling the function twice with six different addresses each time would
have put twelve participants on a six-seat claim.

More unique guests than seats is still refused, and a refused call inserts nothing. Sending
the same list twice is safe and reports `added: 0`. The four cases are proven in
`tests/database-integration.sql`; `tests/media-database.test.mjs` keeps the shape from
regressing.

### Search path — why every reference carries its schema

Every function in `database/filming-consent.sql` runs with `set search_path=''`, and every
table, function and `%rowtype` in a function body is written out with its schema
(`public.tavern_media_participants`, `public.tavern_media_agreement_required(...)`).

This matters because these are `SECURITY DEFINER` functions: they run with the rights of
their owner, not of the caller. With `set search_path=public` the caller still decides what
`public` resolves to — put your own schema in front of it and your table or your function
gets used, with the owner's rights. Supabase's current guidance is an empty search path plus
fully-qualified names, and that is what this migration does. `pg_catalog` is always searched
implicitly, so the built-ins (`now()`, `jsonb_build_object()`, `count()`, `gen_random_uuid()`)
keep working.

One consequence worth remembering: nothing here may depend on an extension. The audit
reference used to be `encode(gen_random_bytes(12),'hex')`, and `gen_random_bytes` comes from
pgcrypto, which Supabase installs in the `extensions` schema — unreachable from a function
with an empty search path. It is now `replace(gen_random_uuid()::text,'-','')`, which is core
PostgreSQL from version 13 onwards.

`tests/media-database.test.mjs` guards all of this statically, including for functions that
are added later: an empty search path on every function, a schema on every reference, the
exact `revoke` per function, `service_role` as the only grantee, no grant at all on the two
`private.` functions, RLS on and no policy. Those guards were checked against twelve
deliberate breakages and caught all twelve.

**Still open, and not part of this work:** `database/first-access.sql` has the same pattern —
fifteen `SECURITY DEFINER` functions on `set search_path=public` with roughly fifty-five
unqualified references. That is the booking and payment migration and it is already applied,
so it was left alone here. It deserves the same treatment in its own round, with its own
integration run.

### Row level security

RLS is enabled on all three new tables and **no policy is created**, which is the same
shape as the existing tables: with RLS on and no policy, `anon` and `authenticated` can read
and write nothing at all. `service_role` bypasses RLS, and only the Netlify functions hold
that key. Every table also has an explicit `revoke all` for `public`, `anon` and
`authenticated` so a future policy cannot quietly hand out access that was never intended.
If Supabase ever needs a policy here, write it deny-by-default and never expose
`tavern_media_participants` or `tavern_media_consents` to a browser-side key.

### How a token works, and how it is revoked

A token is 32 bytes from `randomBytes`, base64url encoded. Only its sha256 hash reaches the
database; there is no column that could hold a raw token, and the hash columns refuse
anything that is not 64 characters. A unique partial index makes one hash belong to exactly
one participant. Every lookup is by hash, so a link opens that participant's own agreement
and nothing else.

Revoking is `revoke_tavern_media_invitation(participant, hash)`: it clears the hash and the
expiry, which makes the link stop existing rather than merely stop working. The invitation
script calls it automatically when an email fails, so a token nobody received is never left
live. Links also expire on their own after `MEDIA_INVITATION_WINDOW_DAYS` (21), and
`private.cleanup_tavern_media_invitations()` sweeps expired links and expired organiser
links. The consent itself is never touched by that sweep — it is the evidence.

### How a new agreement version works

Consent is stored against a version and the hash of the exact text. A new version is a new
row in `tavern_media_agreements` and a new `MEDIA_AGREEMENT_VERSION` in Netlify plus a new
`PUBLISHED_MEDIA_AGREEMENT_VERSION` in the code. From that moment, everyone's earlier
consent stops counting: `get_tavern_media_agreement_state` reports `alreadyRecorded: false`
and the organiser's counter drops back, because nobody has seen the new words yet. Old
consent is not deleted and not migrated — it stays as the record of what applied before.
`record_tavern_media_consent` also refuses a submission whose text hash does not match the
version it claims, so a stale page cannot record consent to text nobody approved.

### How withdrawal is recorded

`withdraw_tavern_media_consent` sets `withdrawn_at` on the live consent row and moves the
participant to `withdrawn`. Nothing is deleted: the row stays, so it remains provable that
permission existed, when it started and when it ended. The partial unique index only covers
rows where `withdrawn_at is null`, so a participant can give permission again afterwards
without the history being overwritten. There is no fee, no penalty and no cancellation cost
attached to withdrawal anywhere in the code.

### Retention and deletion

The retention period is **not** in the code, because it is not confirmed. Filling it in
would be inventing it. `private.purge_tavern_media_records(interval)` takes the period as an
argument and refuses anything under a day, and it never deletes a participant who still has
a live consent — that record is the evidence and outlives the invitation. Once Robert and
the lawyer confirm the period, put it in `MEDIA_RETENTION_PERIOD`, write it into the
agreement page in place of the `to be inserted` marker, and schedule the purge here.

### Steps that still have to be done by hand, later

**Supabase** — run `database/filming-consent.sql` against the project (it is idempotent);
confirm RLS is on and no policy exists on the three new tables; insert the approved version
into `tavern_media_agreements` with its real content hash and legal review reference;
schedule `private.cleanup_tavern_media_invitations()`; schedule
`private.purge_tavern_media_records()` only once the retention period is confirmed.

**Netlify** — set the seven media variables above, only after the legal review; the
`/api/media-consent` route is already in `_redirects` and answers 503 until then.

**Resend** — nothing new is wired up: the invitation reuses the existing integration. The
open point about the processor agreement with Resend is still a blocker for production use;
no invitation may go out before it is signed and stored. Send with
`node scripts/issue-media-agreements.mjs` for a dry run, and only then `--send` together
with `MEDIA_AGREEMENT_SEND_CONFIRM=SEND_MEDIA_AGREEMENTS_NOW`.

**The page** — `/tavern/filming-agreement/` stays `noindex, nofollow`, keeps its draft
banner and is not linked from any navigation. Its fields are disabled in the HTML itself,
so without the gate open there is nothing to fill in and nothing to send.

## Two gaps between the reservation and the invitation

Found on 1 September 2026 by checking which RPCs the application actually calls against
which the migration defines. Both are holes in the path *towards* the flow; the flow itself
is complete and tested on the database side.

**1. Nothing calls `register_tavern_media_participants`.** The function exists, is tested in
`tests/database-integration.sql`, and does exactly what it should. But no Netlify function
and no script invokes it, so there is no way for the attendees to get into the system in the
first place.

**2. Nothing issues a progress token.** `tavern_seat_claims.media_progress_token_hash` is read
by `get_tavern_media_progress` and cleared by the cleanup function, but no code ever mints one
and stores its hash. The integration test sets it with a plain `update`. So the counter —
*"4 of 6 guests have completed the Filming & Media Agreement"* — works, but cannot be handed
to anyone.

**Both wait on the same unanswered question, which is why neither was built:** who is allowed
to submit the attendees, and how do they prove it? Two workable answers, and it is Robert's
call, not ours:

- *The operator does it.* Robert collects the names himself and runs a script, the way
  `scripts/issue-first-access.mjs` already works. No new public route, no new authentication,
  nothing extra to secure. The progress counter then becomes something Robert looks at, and
  the organiser token is only needed if he wants to send the lead booker a link.
- *The lead booker does it.* A page where the person who paid types in the attendees. That
  needs its own token — a third kind, next to the participant link and the progress link —
  and a decision about what happens when they change the list after invitations have gone out.

The first is much smaller and can be built in an afternoon. The second is nicer for the guest
and is a real feature with its own security surface. **Nothing should be built until Robert
picks one**, because the choice determines who can put a stranger's name and email address
into the database.

Until then the media flow is complete from the invitation onwards, and empty before it.

## Weekend 02 — answered

Robert settled it on 1 September 2026 in commit `49310f0`: Weekend 02 is **not** planned as
a professionally filmed edition. There is no compulsory media agreement for it. Lewos may
ask a guest in advance whether they would like to appear in one specific photo or short
video; saying no changes nothing about taking part. Recognisable promotional use needs that
specific permission beforehand, and paid advertising stays separately optional.

That distinction is enforced, not merely written down. `tavern_media_agreement_required()`
returns true only for `weekend-01`, and every entry point in the migration checks it, so a
Weekend 02 guest cannot be registered as a participant, cannot be invited and cannot be
recorded as consenting through this flow.

The one-off permission for a single Weekend 02 photo or video is deliberately **not** built
here. It is a different thing — specific, asked in the moment, about one named image — and
squeezing it into a versioned blanket-agreement flow would make it look like the same
consent. When Robert wants it, it should get its own small, specific form.
