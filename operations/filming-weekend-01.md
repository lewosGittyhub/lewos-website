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
- `/tavern/filming-agreement/` is the **draft** of the per-attendee agreement.
  `noindex, nofollow`, a draft banner on its face, no form, no script, no
  endpoint. It collects nothing. It exists so the text can be read and checked.
- `/tavern/book/` and `/tavern/checkout/` ask the person paying to confirm they
  have read that Weekend 01 is filmed. That is an acknowledgement only.

Filming consent is no longer taken at checkout at all. The old optional
checkbox recorded a permission with no version, no receipt and no evidence
behind it, and it sat on the same screen as the payment. `p_filming_consent`
now always receives `false` from both checkout paths; a client that sends
`filmingConsent:true` is ignored. Consent moves to the personal agreement.

## Before this agreement may be put in front of a guest

Robert, in this order:

1. Confirm the operational rules below, or correct them. They are on the draft
   page as working rules and are marked there as needing your confirmation.
2. Supply what is marked `to be inserted` on the draft page: tax identification
   number, full postal address, telephone, privacy contact address, retention
   period, the competent supervisory authority, and the full list of platforms.
   None of these may be guessed or copied out of a document found elsewhere.
3. Have a Spanish privacy and media lawyer review the whole agreement, and the
   withdrawal wording in particular, under Ley Orgánica 1/1982 and the GDPR.
4. Only then: the per-attendee flow below may be switched on. It is built and shut.

## Operational rules to confirm

These are on the draft page. Say yes, no or different to each.

- No filming in bedrooms, bathrooms, changing areas or other clearly private
  spaces. (Already fixed in `.internal/filming-consent-v1.1.md`.)
- Guests are told when filming is actively taking place.
- There are periods during the weekend when the cameras are down.
- A guest can ask for the camera to stop during a personal or sensitive
  conversation, and it stops.
- Meals are filmed selectively rather than continuously.
- The game table is the main expected filming location.
- Private conversations and sensitive disclosures are not published, even when
  they were recorded. This is an editing rule, not only a filming rule.
- Practical camera-free route or area for a guest who has not given permission.

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
