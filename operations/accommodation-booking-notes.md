# Accommodation booking — agreed direction

## Confirmed rules

- A Tavern booking always includes the fixed Tavern weekend (Friday–Monday).
- Optional extended stay runs from Monday 15:00 before the weekend until Friday 10:00 after it.
- The accommodation capacity is capped at 12 guests at the same time.
- Extra nights can be selected together with the Tavern weekend. The site checks the shared
  calendar at submission and confirms them immediately when every selected night is free.
- Extra nights are not part of the Tavern price and are not charged through Stripe. The guest
  pays the accommodation separately upon arrival.
- If the shared calendar cannot be read, or a selected night is occupied, the site does not
  confirm those extra nights. The weekend booking may continue without them and the guest is
  told to choose another range or contact Lewos.

### Noted, but deliberately not built (Robert, 7 September 2026)

The cabin layout (Dobra, Bulnes, Covadonga, Astur), letting guests pick bedrooms, and the
extra-night rates of 100 EUR per apartment and 130 EUR for an alternative house are recorded
here as the intended direction. **None of it is implemented, and none of it should be.**

The old `on request` rule remains only for historic/open requests already in the database.
New bookings use the shared calendar check described above. No per-room inventory is
invented: the calendar is the availability source, and the accommodation still collects
the separate arrival payment.

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
