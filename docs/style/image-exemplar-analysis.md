# Exemplar Image / Plate Spec

Pixel analysis of the 4 LinkedIn image posts Jimmy set as the bar. **All four are Pay Theory's own
posts** — our existing brand system, not an outside reference. Method: rendered each embed's
`img.main-image` alone in Chrome, screenshotted, measured with PIL (median-cut palette, saturated-ink
histogram, dark-pixel bboxes, per-row glyph bands, flat-tile Laplacian). Captures in `image-exemplars/`.

| #   | Share id            | Post                        | Frame | Rendering        | Ink coverage |
| --- | ------------------- | --------------------------- | ----- | ---------------- | ------------ |
| 1   | 7493019568718651392 | "Growth is math, not magic" | 4:5   | Photoreal 3D CGI | 10.6%        |
| 2   | 7488625701529604096 | "Every payments odyssey…"   | 1:1   | Flat vector      | **4.2%**     |
| 3   | 7480275917240672256 | "You build the software…"   | 1:1   | Photo composite  | 14.7%        |
| 4   | 7486080638282838017 | "A partner, not a vendor."  | 16:9  | Full-bleed photo | 89.9% (dark) |

## 1. Style laws (cross-post, implementable)

- **I1 — One purple ramp, 5 stops, zero second hue.** Every saturated pixel in all four sits at hue
  **258–268°**. Measured inks map onto `src/brand/tokens.ts`: `#1E053F`/`#2B1553` ≈ `ink`+`deepest`,
  `#652ED1` ≈ `primary #6C2BD9`, `#C4AAF3` ≈ `accent` @50%, `#EBE1FA` ≈ `tint`. Non-brand matter is
  **desaturated to S≤13** (p1's coins are grey, not gold). No second accent anywhere.
- **I2 — The ground is one continuous surface, never blocked panels.** p1 flat warm off-white
  `#F5F4F2`; p2 `tint` above one lavender `#C4AAF3` wave; p3 a soft diagonal gradient (TL `#FEFEFE`
  → TR `#D2C9E4`); p4 photo + even scrim. Nobody splits the frame into color blocks.
- **I3 — Dead flat finish: no grain, no glow, no bevel.** Mean |Laplacian| in flat tiles = 0.05 (p2),
  0.10 (p1), 0.41 (p3) — zero added texture. The set's only shadow is p1's single soft contact shadow
  under the coins. Never a shadow or glow on type.
- **I4 — One hero object, bottom-weighted, ≥25% of the frame empty above it.** p2 puts _nothing_ in
  the top 28.7% and holds ink coverage to 4.2%; p1's stacks occupy y 43%→72%. The object sits on a
  ground line — never floats mid-frame, never repeats into a pattern.
- **I5 — Type is heavy, tight, left-aligned into a 7–9% margin.** Headline glyph height **4.9–8.6% of
  frame width** (p3: 7.7–7.9% over 4 lines; p2: 4.9%). Weight **700–800** geometric grotesque,
  tracking ≈−0.02em, **line-height 0.93–1.10**. Column ≤77%W, ≤4 lines, ≤4 words/line. _Deliberately
  contradicts video law L3 ("never 700+") — stills carry weight, motion doesn't._
- **I6 — Eyebrow + rule are the only ornaments.** p2: caps eyebrow at **1.7%W** glyph height (0.34×
  headline), ~0.08em tracking, `primary`, 36px above the headline; then a short `primary` rule
  (~11%W × 6px) below it. p3 swaps the eyebrow for the wordmark. No badges, swooshes, or orbs.
- **I7 — Small copy is a 3-line block at ~1.7%W, leading 1.35** (p3: 13–14px glyphs at 24px pitch).
  Support is always ≥4× smaller than the headline — never a mid-size third tier.
- **I8 — A real wordmark, always, 4.6–7.7%W tall, full opacity.** Bottom-left (p1 y 91–95%, p2),
  top-left (p3 y 5–12.6%), bottom-center reversed white (p4). Margin 6–7%. Never a faded watermark.

**Premium vs. corporate-Memphis:** the tell is _subtraction_ — one object, one hue family, one ground,
one shadow, a quarter of the frame deliberately empty. The generic version adds a second accent,
floating shapes, a mesh behind the type, and fills the corners.

## 2. Per-post notes (all Pay Theory)

**#1 Growth is math (4:5, photoreal)** — CGI coin stacks in an exponential curve on a studio infinity
cove. Two purple marks only: headline `#1E053F`, and a hand-drawn `primary` curve + arrow over a thin
tick axis. 2 lines, cap 7.0%W, pitch 9.1%W (LH ≈0.93); caption y 82%, wordmark y 92%.

**#2 Payments odyssey (1:1, flat vector)** — the purest plate and the one to clone. Eyebrow → 3-line
headline → rule → boat + wave → wordmark. The boat is 4 shapes: `deepest` hull, `primary` sail, thin
mast, 2 arcs. A 4-point `primary` star with a dashed `accent` trail is the only flourish; no strokes
anywhere except that dashed path.

**#3 You build the software (1:1, photo composite)** — cutout photo bleeds off the bottom-right; type
owns the left 55%. Signature move: the 4-line headline **steps down the ramp per line** (`#260A47` →
`#3F1D7B` → `#462A90` → `accent`), so color carries emphasis instead of a second hue. Four rounded
compliance pills (h ≈4.9%W, radius = h/2, 1px `accent` border, transparent fill, shield glyph).

**#4 A partner, not a vendor (16:9, photo)** — full-bleed photo, even dark scrim (mean V ≈0.20),
inside a **~1.4% white keyline frame**. One centered white line at 4.9%W mixing upright + italic
("not a vendor" italic, single-storey `a`). The outlier — centered, 16:9, no purple: treat as a
photo-card variant, not the plate language.

## 3. For coded Revideo plates (`Plate.tsx`)

Draw back to front: (1) full-frame ground `Rect` — `tint`, or a 15° gradient `#FFFFFF`→`#DCC8F9`;
(2) optional horizon — one wave path in `accent`@50% filling the bottom 28–33%; (3) hero object group,
height 26–38% of frame, baseline y 72%, ≤6 filled paths in `deepest`/`primary`/`accent`, **no strokes**
except one 4px dashed `accent` trail; (4) a soft contact shadow (blur 24, y+8, `deepest`@10%) only for
photoreal objects; (5) text column anchored left at x = 8%W, capped at 70%W — caps eyebrow (1.7%W,
`primary`, letterSpacing 0.08em), headline (`Txt` weight 700, cap 5–8%W, lineHeight **0.95**, `ink`,
≤4 lines), rule (`Rect` 11%W × 6px, `primary`, 4%W below); (6) wordmark bottom-left, 5%W tall, 7%
margins, opacity 1.0. Hard asserts: top 25% holds no ink; every fill's hue ∈ [258, 268]; fills ≤ 5.

## 4. For Recraft vector generation

**Params:** `style: "vector_illustration"`, `substyle: "flat_2"`, `size: "1024x1024"` (or `1024x1280`
for 4:5), SVG output, palette pinned via `controls: { colors: [{rgb:[46,20,87]}, {rgb:[108,43,217]},
{rgb:[169,113,247]}, {rgb:[237,224,253]}], background_color: {rgb:[237,224,253]} }`.

> **Prompt template:** Flat vector illustration of `{ONE OBJECT}`, single centered object on a plain
> `{lavender|off-white}` background, geometric shapes only, solid fills, no outlines, no gradients, no
> shadows, no texture, monochromatic deep-purple and violet palette, generous empty space around the
> object, minimal editorial poster style, no text, no people, no floating decorative shapes.

Objects that fit: sailboat, compass rose, staircase, bridge, key, lock, ladder, signpost, stacked
coins, plug/socket, funnel, lighthouse. One noun, never a scene.

**Post-process every returned SVG:** (a) snap fills to the 5 tokens by nearest hue distance, delete any
fill outside 258–268°; (b) strip `<filter>`, `<linearGradient>`, `<radialGradient>`, and any `opacity`
in 0.05–0.95; (c) set every corner radius to 0 or a uniform 8px; (d) strip strokes, or normalize to 4px
round-cap `accent`; (e) merge to ≤6 top-level paths, reject at >12; (f) trim the viewBox to the object
and place it in code at 26–38% frame height, so Recraft never controls composition — I4/I5/I8 stay
owned by `Plate.tsx`.
