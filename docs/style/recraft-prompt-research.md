# Recraft Prompt Research: Stripe + AWS Exemplar-Informed Generation

## Findings from Recraft API & Prompt Engineering Research

### Key API Parameters (Recraft v4.1 Vector)

| Parameter | What it does | Recommended for us |
|---|---|---|
| `model` | `recraftv4_1_vector` (or via OpenRouter: `recraft/recraft-v4.1-vector`) | V4.1 vector — better prompt adherence, cleaner SVGs |
| `controls.colors` | Array of `{rgb: [R,G,B]}` — preferred palette colors | Our 4 brand stops: deep purple, primary, accent, tint |
| `controls.background_color` | Single `{rgb: [R,G,B]}` background preference | `tint` (#EDE0FD) for consistency with plate ground |
| `size` | `"1024x1024"` or `w:h` format | 1024x1024 for square, 1024x1280 for 4:5 |
| `response_format` | `url` or `b64_json` | b64_json for direct pipeline use |

### Stripe Illustration Language (what makes it work)

From analysis of Stripe's visual system (Play Studio redesign, Stripe Press, hero images):

1. **Geometric abstraction** — objects are reduced to essential geometry, never literal
2. **Gradient confidence** — signature Blurple expanded into warm gradients (yellow→magenta→orange), "color is the clearest expression of optimism"
3. **Macro + micro** — the same system tells global-scale stories and single-data-point stories
4. **Bleed and interaction** — shapes interact with the frame edge, type, and each other; nothing sits in isolation
5. **Organics within systems** — organic gradient waves, 3D globes, and spheres within an otherwise structured grid
6. **"Smooth transitions, no harsh masking"** — gradients blend between stops, never a hard line

Key difference from our current approach: Stripe's objects *are the page*, not inset on it. The illustration fills the canvas and the type sits within or beside it. Stripe's illustrations communicate concepts through abstraction rather than literal depiction.

### AWS Illustration Language (what makes it work)

From analysis of AWS architecture icons, hero images, and brand guidelines:

1. **Icon-like precision** — every element is a distinct, recognizable shape with clear semantics
2. **Structural clarity** — diagrams and illustrations show relationships between elements (flows, connections, containment)
3. **Orange + blue palette** — distinctive #FF9900 orange anchors the system
4. **Isometric depth** — 3D isometric service icons give visual hierarchy within flat layouts
5. **Simplified complexity** — complex infrastructure reduced to ~12 icon families with consistent styling (rounded rects, specific colors per service category)
6. **Diagrammatic storytelling** — AWS illustrations show *how things connect*, not just what things look like

### Best Prompt Engineering Practices (Recraft)

From Recraft's prompt engineering guide and community testing:

1. **Start with the subject, then the style, then the constraints** — most reliable ordering
2. **Be literal about what NOT to include** — "no text, no people, no gradients, no shadows" works
3. **Let V4.1 do composition** — the model has "design taste" — don't over-specify layout; describe the *feeling* instead
4. **Use controls for palette, prompt for everything else** — the `controls` block handles colors; the prompt handles subject, style, composition
5. **Avoid negative prompting on v4 models** — they handle `no` directives better than v3
6. **Short prompts work better than long ones** on V4.1 Utility; V4.1 Pro handles more detail

### What Changes for Our Odyssey Prompts

**Old approach:**
> "Flat vector illustration of {ONE OBJECT}, single centered object on a plain {lavender|off-white} background, geometric shapes only, solid fills, no outlines, no gradients, no shadows, no texture, monochromatic deep-purple and violet palette, generous empty space around the object, minimal editorial poster style, no text, no people, no floating decorative shapes."

**New approach (Stripe-inspired):**
> "Flat vector illustration of {ONE OBJECT}, bold geometric composition filling the frame, grounded on a single horizon line, smooth flat fills, no outlines, monochromatic deep-purple and violet palette with lavender background, minimal and confident, editorial poster style, generous negative space above the object, no text, no people, no floating decorative shapes, no shadows, no texture — as if illustrating a concept for a premium fintech brand"

**AWS-inspired variant:**
> "Flat vector illustration of {ONE OBJECT}, simplified to its essential geometric form, precise clean shapes like an architectural diagram, structural and confident, flat purple and violet palette on tint background, no outlines, no shadows, no texture, iconographic clarity, generous negative space, no text, no people, modern infrastructure brand style"

### Price Comparison (Actual)*

| Model | Cost/image | Text-to-Image? | Notes |
|---|---|---|---|
| recraft/recraft-v4-styles-vector | $0.055 ($0.005 req + $0.05 img) | **No** — input reference required | Image-to-image only |
| recraft/recraft-v4.1-vector | $0.08 | **Yes** | Cheapest text-to-image vector — used for v2 generation |
| recraft/recraft-v4-vector | $0.08 | **Yes** | Same price as v4.1 |
| recraft/recraft-v4-styles-pro-vector | $0.125 | No — input reference only | Pro quality but image-to-image |
| recraft/recraft-v4.1-pro-vector | $0.30 | Yes | Best quality at 3x cost |

*Prices as of Aug 2026, OpenRouter image endpoint.

### Final Generation Results (10 SVGs, $0.80 total)

Stripe + AWS-inspired prompts applied to all 10 objects using `recraft/recraft-v4.1-vector`:

| Object | Old paths (v1) | New paths (v2) | Δ | Verdict |
|---|---|---|---|---|
| Lighthouse | 16 | **4** | -12 | Standout — essential geometric form |
| Handshake | 16 | **5** | -11 | Excellent — simplified to shapes |
| Compass Rose | 38 | **22** | -16 | Much cleaner, still over 12-path cap |
| Star + Route | 48 | **14** | -34 | Huge improvement, usable |
| Bridge | 27 | **15** | -12 | Cleaner arched form |
| Coins | 15 | 12 | -3 | At the 12-path cap |
| Staircase | 16 | 13 | -3 | Marginal |
| Key | 9 | 8 | -1 | ≈ same |
| Signpost | 12 | 11 | -1 | ≈ same |
| Sailboat | 7 | **16** | +9 | Regressed — overcomplicated |

**Key findings:**
- "Bold geometric composition" + "generous negative space above" = cleaner results
- "Iconographic precision" + "simplified to essential geometric form" = dramatic path reduction
- `controls` palette pinning works, but v4.1 returns `rgb()` instead of hex — post-process script updated to handle `rgb()` snapping
- Cheapest text-to-image vector model is `recraft/recraft-v4.1-vector` at $0.08/image ($0.80 for 10)
- V4.1 has better prompt adherence than v4-styles but costs slightly more

