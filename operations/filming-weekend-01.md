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
4. Only then: the per-attendee flow below can be built and switched on.

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

## The per-attendee flow, when it is allowed to exist

Not built. It is a real data flow with tokens, names and email addresses, and it
must not exist while the text it collects is still a draft. What it needs:

    reservation → lead booker supplies the attendees → every adult attendee gets
    their own link → each completes the agreement personally → the organiser sees
    only progress, for example "4 of 6 guests have completed the agreement"

Requirements for whoever builds it:

- one unguessable token per attendee, stored as a hash, never in plain text —
  the existing `checkout_token_hash` pattern in `database/first-access.sql` is
  the model, including the unique partial index and the expiry column;
- a link opens exactly one attendee's own agreement; no attendee can read or
  change another attendee's data;
- a second submission on the same link updates that attendee's record and never
  creates a duplicate, and never silently overwrites a withdrawal;
- the optional paid-advertising choice is stored as its own boolean and is never
  derived from any other checkbox;
- a blank choice is stored as no permission;
- the organiser view shows counts only, not other guests' answers;
- the agreement version and a reference are stored with every record, so it can
  be shown later which exact text a person accepted;
- no long-term storage of raw IP addresses;
- use the existing Supabase and Netlify Functions patterns and the existing mail
  provider; do not add a new external service for this.

No migration has been written for this on purpose. The tables would sit unused
in production while the legal text is still a draft, and the record fields are
already specified in `.internal/filming-consent-v1.1.md` under "Minimum records".
Write the migration when step 4 above is reached, not before.

## Open question

Is Weekend 02 professionally filmed or not? The advice is that offering a
genuinely non-filmed alternative makes the consent for Weekend 01 considerably
easier to defend — but only if it is true. Nothing in this repository states it
either way, so nothing about Weekend 02 has been put on the site. A test
(`tests/filming.test.mjs`) refuses any such claim until Robert answers.
