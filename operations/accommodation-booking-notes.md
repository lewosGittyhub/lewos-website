# Accommodation booking — agreed direction

## Confirmed rules

- A Tavern booking always includes the fixed Tavern weekend (Friday–Monday).
- Optional extended stay runs from Monday 15:00 before the weekend until Friday 10:00 after it.
- The accommodation capacity is capped at 12 guests at the same time.
- If no suitable accommodation is available, show “Request availability”; do not take payment until confirmed.

### Noted, but deliberately not built (Robert, 7 September 2026)

The cabin layout (Dobra, Bulnes, Covadonga, Astur), letting guests pick bedrooms, and the
extra-night rates of 100 EUR per apartment and 130 EUR for an alternative house are recorded
here as the intended direction. **None of it is implemented, and none of it should be.**

The rule that is built, and that stays: an extra night is `on request` and carries no price
until the accommodation confirms it. Introducing a per-room inventory or a published
extra-night rate is a separate decision, and one that touches money — so it does not happen
as a side effect of a booking change.

## Email and calendar direction

- `lewos.co@gmail.com`: general Lewos and special questions. Already public on the site.
- The accommodation mailbox: booking and accommodation questions, and the technical
  website/calendar connection. **The address itself lives only in Netlify**, in
  `FONTECHA_ACCOMMODATION_EMAIL` and `LEWOS_ACCOMMODATION_EMAILS` — not in this repository.
  It is a third party's address and this repository is public.
- **One calendar, not two.** `Lewos – Tavern & huis`, shared between Lewos and the
  accommodation, is the only calendar the site reads or writes.

  An earlier version of this document described a second, separate availability calendar for
  the accommodation. Robert set that aside on 7 September 2026: with two calendars they drift
  apart, and the moment they do is exactly the moment a weekend gets sold twice. Whoever
  writes first has the nights; the site reads that one calendar and blocks accordingly.

## Still to confirm

- Which rooms are available for each Tavern date — handled by asking the accommodation, not
  by an inventory in the site.
- Final Google account creation and calendar sharing.
- The exact booking-flow implementation for extra nights and accommodation inventory.
