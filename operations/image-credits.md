# Image credits and licences

Every image served from this site, where it came from, and under what terms. Not a public
page: `/operations/*` returns 404 on the live site and `robots.txt` disallows it. A test in
`tests/site.test.mjs` keeps it that way.

Nothing here is hotlinked. Every file is downloaded, cropped and re-encoded locally, then
committed to `tavern/assets/` or `assets/`.

## Photographs

| File | Subject | Source | Licence |
| --- | --- | --- | --- |
| `tavern/assets/tavern-asturias-hero.webp` | Panorama over an Asturian valley, used as the Tavern hero | Robert's own photograph, `IMG_1781.HEIC` | Owned by Lewos |
| `tavern/assets/tavern-asturias-hero-portrait.webp` | Upright crop of the same panorama, for narrow screens | Same original | Owned by Lewos |
| `tavern/assets/surroundings-house.webp` | Stone house with a tiled roof and covered porch | Robert's own photograph, `IMG_1725.HEIC` | Owned by Lewos |
| `tavern/assets/surroundings-walkers.webp` | Walkers on a mountain track with chamois above | Robert's own photograph, `IMG_4664`-series, file `IMG_4693.HEIC` | Owned by Lewos. The people are Robert's family; Robert confirmed on 29 August 2026 that they are fine with the photograph being published |
| `tavern/assets/surroundings-fire.webp` | Meat on a grill inside a stone hearth | Robert's own photograph, `IMG_4777.HEIC` | Owned by Lewos |
| `tavern/assets/surroundings-path.webp` | Stone path across a ravine below limestone peaks | Robert's own photograph, `IMG_4664.HEIC` | Owned by Lewos. One distant figure, turned away and not identifiable |
| `tavern/assets/surroundings-picos.webp` | The Picos de Europa above low cloud | Pexels, photographer credited there as Enrique, file `pexels-enrique72-33455263` | Pexels Licence |
| `tavern/assets/surroundings-coast.webp` | Asturian coastline from the air | Pexels, photographer credited there as Marcio Costa, file `pexels-marcio-costa-523841540-16388707` | Pexels Licence |
| `tavern/assets/surroundings-pasture.webp` | Misty limestone pasture with grazing cattle | Pexels, photo id `35657640` | Pexels Licence |
| `tavern/assets/surroundings-lake.webp` | Mountain lake with a footpath along the shore | Pexels, photo id `11855795` | Pexels Licence |

## Photographs of people

| File | Subject | Source | Permission |
| --- | --- | --- | --- |
| `tavern/assets/evan-game-master.jpg` | The Game Master | Supplied by Robert | Robert confirmed on 29 August 2026 that name, biography, photograph and the quoted line were seen and approved by the person himself |
| `assets/robert-founder-lewos.jpg` | Robert | Robert's own photograph | Owned by Lewos |

## Illustrations — origin not recorded

These were added before this file existed and their source is unknown to whoever writes
here. They are illustrations rather than photographic records, which the legal notice and
the booking terms already say. **What is missing is where they came from and under what
terms.** For a site that sells a package holiday that gap should be closed before opening.

- `tavern/assets/tavern-double-doors.webp`
- `tavern/assets/asturias-mountain-view.webp`
- `tavern/assets/bear-4x4-mountain-wide.webp`
- `tavern/assets/dice-character-sheet.webp`
- `tavern/assets/private-campaign-landscape.webp`
- `tavern/assets/tavern-party-journey-bear.webp`
- `tavern/assets/weekend-01-dark-dice.webp`

If they were generated, say by what and confirm the terms allow commercial use. If they
came from a stock library, name it and the licence. Do not guess: an unrecorded origin is
better written down as unrecorded than filled in with something plausible.

## Supplied but not used

| File | Why not |
| --- | --- |
| `IMG_1762.HEIC` | Not a photograph of a place at all: a picture of a RETA registration showing a tax number, a telephone number, an email address and a boarding pass. Never for publication. Flagged to Robert on 29 August 2026. |
| `7F0FAF19-…​.MP4` | Seventeen seconds of the stone houses, vertical, 31 MB. Robert decided on 29 August 2026 not to pursue it for the site. See the note below. |

Identifiable people are the one case where a licence is not enough. `IMG_4693` was set
aside at first for exactly that reason, and only used after Robert confirmed the walkers
are his family and are fine with it. Apply the same test to anything new: a stranger who
can be recognised does not go on a commercial site without their word.

## The video, and why it is not on the site

The clip shows the real houses and would be a genuine counterweight to the illustrations.
It is not published, for three reasons that all point the same way.

It is vertical, 1080 by 1920 — made for a phone feed, not for a page. Netlify is already
over its deploy credits for this cycle, and video is the heaviest thing a page can carry.
And the compression available on this machine cannot do it justice: without `ffmpeg`, the
only tool is `avconvert` with fixed presets, which gives either 540 by 960 at nearly ten
megabytes or 168 by 300 at half a megabyte. Neither is a video you would want to show
somebody who is deciding whether to spend two thousand euro.

Where it does belong is Instagram, where the format is right and the bandwidth is free.
If it should go on the site later, transcode it with `ffmpeg` on a machine that has it,
target about 720 by 1280 at a megabyte or two, add a poster image and `preload="none"`, and
never let it autoplay with sound.

## The Pexels Licence, checked at the source

Checked on https://www.pexels.com/license/ on 29 August 2026. In their own words: *"All
photos and videos on Pexels are free to use"* and *"Attribution is not required."*

The restrictions, none of which this site runs into:

- Do not sell unaltered copies, for example as a poster.
- Identifiable people may not appear in a bad light. These images contain no identifiable
  people.
- Do not imply endorsement by people or brands.
- Do not redistribute or sell the photos on other stock platforms.
- Do not use the photos as part of a trade mark. Keep them out of the logo.

Attribution is optional, and the site gives it anyway on the Tavern page. That is a choice,
not an obligation: it supports what the booking terms promise about real photographs having
a traceable origin.

## Before adding an image

1. Do not hotlink. Download it, and record it in the table above.
2. Check the licence at the source and write down which one it is, not just "free".
3. Give it an alt text that stands on its own for someone who cannot see it.
4. Do not caption an image with a place name unless you know it is correct. Pexels describes
   the coast photograph above as *"near Escamplero"*, and Escamplero lies inland near
   Oviedo. Their descriptions are not a reliable source for a location.
