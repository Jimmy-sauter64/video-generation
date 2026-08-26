# Pay Theory Brand Kit — Style Contract

This is the style contract for anyone writing scripts, scenes, or copy for
Pay Theory short-form video. Tokens referenced here live in
`src/brand/tokens.ts`; vendored assets live in `assets/brand/`.

## Aesthetic (verbatim)

> Deep purple primary with violet accent and light lavender tint, generous
> white and off-white space, clean technical SaaS layouts, restrained
> editorial typography with ample negative space.

Treat that line as the brief for every frame. If a layout looks cramped,
loud, or decorative rather than technical and editorial, it's off-brand.

## Color usage roles

- **`palette.deepest` (#2E1457)** — backgrounds for hook/title cards and any
  frame carrying a caption, where maximum contrast against white text
  matters most. Also the default background behind full-bleed logo
  placements.
- **`palette.primary` (#6C2BD9)** — the default background/UI color for
  everything else: body scenes, panels, chart/UI mockup chrome. This is the
  "dominant" purple — most frames should read as this color, not the
  deepest one.
- **`palette.deepAnchor` (#53259D)** — a secondary/mid background for
  layering depth (e.g. a card or panel sitting on top of a `primary`
  background) without jumping all the way to `deepest`.
- **`palette.accent` (#A971F7)** — sparingly, for emphasis words, key
  numbers, active states, or a single highlighted UI element per frame.
  Never use accent as a full-frame background or for body text — it exists
  to draw the eye to one thing.
- **`palette.tint` (#EDE0FD)** — off-white space: light-mode backgrounds,
  subtle fills, dividers. Pairs with `ink` text for any light-surface frame.
- **`palette.white` / `palette.ink`** — white is the default text color on
  dark (`primary`/`deepAnchor`/`deepest`) backgrounds; ink is the default
  text color on light (`tint`/`white`) backgrounds. Don't mix.

Rule of thumb: purple dominant, violet rare, lavender for breathing room.

## Font stand-in rationale

Halyard (the reference brand typeface) is not freely licensable, so this kit
uses **Instrument Sans** (OFL 1.1) as the stand-in for `fonts.display`.
Chosen over Public Sans and Inter because:

- It has the geometric, slightly condensed character and confident
  weight contrast Halyard has at display sizes — it holds up as bold,
  short-form on-screen type (hooks, headlines, big numbers) without
  looking like a generic UI/body font blown up.
- Public Sans reads more like a government/institutional UI font at
  display size — correct but flat, lacks personality for a hook.
- Inter is excellent for UI text but is extremely common (used
  everywhere) and slightly narrow-shouldered at large display weights
  compared to Instrument Sans's more assertive display presence.

All four published weights are vendored — 400/500/600/700 (the family does not
ship 800/900). Use **600 for headline beats and stat values, 500 for support
lines and eyebrows**, per `typeWeights` in `tokens.ts`. Do not synthesize a fake
bold via CSS `font-weight` beyond what is vendored.

**700 is vendored but must not be used for on-screen video type.**
`docs/style/exemplar-analysis.md` L3 measured every headline across the four
reference videos at 500–600 and never above; 700 is the single loudest
contributor to our old templates reading "denser than the bar". (This paragraph
replaced a "use 700 for hooks/headlines" instruction on 2026-08-26.)

Swapping to real Halyard later is a one-line change in `tokens.ts`: replace
the `fonts.display` object with Halyard's family name and file paths — every
consumer reads through `fonts.display`, nothing else needs to change.

## Hook rules

- **4–8 word on-screen hook**, first thing visible, no ramp-up.
- **Sound-off assumed** — the hook and every key beat must land from
  on-screen text alone; audio is a bonus, never a dependency.
- **One idea per video.** If a script needs "and" to describe its point,
  split it into two videos.
- Hooks live on a `deepest`-background card with white text for maximum
  contrast in the first frame — this is the one moment full contrast is
  worth prioritizing over the "purple dominant" rule above.

## Caption styling defaults

> **Superseded 2026-08-26.** There is no caption track any more. Per
> `docs/style/exemplar-analysis.md` L10, none of the four reference videos burns
> in subtitles or a lower-third band; a plan's `captions` array is now rendered
> as **held headline beats** in the optical middle (`Beat`/`runBeat` in
> `src/scenes/sceneKit.tsx`), not as a chip. The rules below are kept as a
> record of the retired treatment and describe `src/components/Captions.tsx`,
> which is deprecated and unused.

- **Bold** — always use `fonts.display` weight 700, never a thin/regular
  weight for captions.
- **White text on a deep background** — white on `palette.deepest` (or
  `primary` if deepest is already in use elsewhere in frame) for maximum
  contrast; never place captions directly on `tint` or `white`.
- **High contrast, no low-opacity overlays** — if captions sit over video
  content rather than a flat color card, back them with a solid or
  near-solid `deepest` panel, not a translucent gradient.
- **Position** — captions live inside each ratio's `captionZone` from
  `safeAreas` in `tokens.ts`, which is guaranteed clear of platform UI
  chrome (share/like rail, caption stack, profile bar) for both 4:5 and
  9:16.
