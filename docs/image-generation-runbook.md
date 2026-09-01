# Image Generation Runbook

This is the start-to-finish process for generating brand-correct plate images
for Pay Theory videos, using `scripts/generate-image.ts` and
`scripts/clean-recraft-svgs.ts`. It replaces the old manual process of
hand-pasting prompts into Recraft via OpenRouter's web UI and hand-editing
the ledger.

Read this whole document before you spend any money. Everything here is
grounded in `docs/style/recraft-prompt-research.md`,
`docs/style/image-exemplar-analysis.md`, `docs/style/exemplar-analysis.md`,
and `src/brand/brand.md`. If something here conflicts with those files,
those files win; ask Jimmy.

## 1. One-time setup

1. Clone the repo and install dependencies:
   ```sh
   git clone <repo-url>
   cd "Video Generation"
   pnpm install
   ```
2. Run the environment doctor. This checks node, pnpm, ffmpeg, ffprobe, and
   the required directories exist before you try to render anything:
   ```sh
   bash scripts/doctor.sh
   ```
3. Create a local `.env` file in the repo root with your own OpenRouter key:
   ```sh
   echo 'OPENROUTER_API_KEY=your-own-key-here' > .env
   ```
   `.env` is already listed in `.gitignore`, so it will never be committed or
   pushed. Use your own OpenRouter account and your own key. Never send your
   key to Jimmy, never paste it into a chat or prompt, and never commit it.
   If a key ever leaks, rotate it in OpenRouter immediately.
4. Export the key into your shell before running the generate script with
   `--confirm` (the script reads `process.env.OPENROUTER_API_KEY`; it does
   not load `.env` for you):
   ```sh
   export OPENROUTER_API_KEY=$(grep OPENROUTER_API_KEY .env | cut -d= -f2)
   ```

## 2. The prompt formula that works

`docs/style/recraft-prompt-research.md` tested two prompt variants against
the old baseline prompt across 10 objects. Both cut path counts sharply
because they replace vague, decorative language with two specific phrases:
"bold geometric composition" and "simplified to essential geometric form."
Those phrases tell the model to commit to a small number of large shapes
instead of accreting decorative detail, which is what drives the SVG path
count down.

**Stripe-inspired variant** (the default in `generate-image.ts`):

> Flat vector illustration of `{ONE OBJECT}`, bold geometric composition
> filling the frame, grounded on a single horizon line, smooth flat fills, no
> outlines, monochromatic deep-purple and violet palette with lavender
> background, minimal and confident, editorial poster style, generous
> negative space above the object, no text, no people, no floating
> decorative shapes, no shadows, no texture, as if illustrating a concept for
> a premium fintech brand

**AWS-inspired variant** (`--variant aws`):

> Flat vector illustration of `{ONE OBJECT}`, simplified to its essential
> geometric form, precise clean shapes like an architectural diagram,
> structural and confident, flat purple and violet palette on tint
> background, no outlines, no shadows, no texture, iconographic clarity,
> generous negative space, no text, no people, modern infrastructure brand
> style

Measured results from the research doc (10 objects, `recraft/recraft-v4.1-vector`):

| Object       | Old paths | New paths | Verdict                        |
| ------------ | --------- | --------- | ------------------------------ |
| Lighthouse   | 16        | 4         | Standout                       |
| Handshake    | 16        | 5         | Excellent                      |
| Star + Route | 48        | 14        | Huge improvement, still usable |
| Bridge       | 27        | 15        | Cleaner arched form            |
| Coins        | 15        | 12        | At the cap                     |
| Sailboat     | 7         | 16        | Regressed, overcomplicated     |

The sailboat regression is the reminder that these prompts are not a
guarantee. Some objects still come back overcomplicated; that is what the
QA step in section 5 is for.

## 3. Model and cost

`scripts/generate-image.ts` always calls `recraft/recraft-v4.1-vector`, the
cheapest text-to-image vector model on OpenRouter, at **$0.08 per image**.

From `docs/style/recraft-prompt-research.md`'s price table:

| Model                                | Cost/image | Text-to-image?                         |
| ------------------------------------ | ---------- | -------------------------------------- |
| recraft/recraft-v4-styles-vector     | $0.055     | No, image-to-image only                |
| **recraft/recraft-v4.1-vector**      | **$0.08**  | **Yes, cheapest text-to-image vector** |
| recraft/recraft-v4-vector            | $0.08      | Yes                                    |
| recraft/recraft-v4-styles-pro-vector | $0.125     | No, image-to-image only                |
| recraft/recraft-v4.1-pro-vector      | $0.30      | Yes, 3x cost                           |

Do not switch models without checking with Jimmy first; the script hardcodes
`recraft/recraft-v4.1-vector` for this reason.

## 4. Running the scripts

Generation is always dry-run by default. Nothing is sent over the network
and nothing is charged until you pass `--confirm`.

```sh
# Dry run: prints the prompt, model, size, and cost. No network call.
tsx scripts/generate-image.ts lighthouse:"a lighthouse"

# Multiple objects in one batch, still a dry run:
tsx scripts/generate-image.ts key:"a key" lock:"a padlock"

# Actually generate (spends real money):
tsx scripts/generate-image.ts lighthouse:"a lighthouse" --confirm
```

Full usage:

```sh
tsx scripts/generate-image.ts --help
```

Each `slug:description` pair produces one SVG at
`assets/library/recraft/<slug>.svg` and one ledger entry appended to
`assets/library/recraft/ledger.json`. The script never rewrites or reorders
existing ledger entries; it only appends. It prints a running total as it
goes and a grand total at the end, so a multi-image batch always shows you
what you just spent.

After generating, run the post-processor to strip C2PA metadata and other
cruft Recraft embeds in the raw SVG:

```sh
tsx scripts/clean-recraft-svgs.ts
```

This reads every SVG in `assets/library/recraft/` and writes cleaned copies
to `assets/library/recraft/clean/`. Use the cleaned copy, not the raw one,
when wiring an object into the plate system.

## 5. QA bar

`docs/style/recraft-prompt-research.md` sets a **12-path cap**: Recraft's
output SVGs must merge to at most 12 top-level paths, per
`docs/style/image-exemplar-analysis.md` section 4 ("merge to <=6 top-level
paths, reject at >12"). `generate-image.ts` counts `<path>` elements in the
returned SVG and tells you right away whether you are over the cap.

If a result is over 12 paths:

1. First try regenerating with the same prompt. Recraft is not
   deterministic; a second try at the same $0.08 sometimes lands under the
   cap when the first did not.
2. If it regenerates over the cap twice, try the other prompt variant
   (`--variant aws` if you started with the default, or vice versa).
3. If it is still over the cap after that, stop and escalate to Jimmy (see
   section 7). Do not keep spending on the same object past two or three
   tries.

Beyond the path count, check every generated object against the style laws
before it goes anywhere near a video:

- **Palette**: every fill must sit on the purple ramp defined in
  `src/brand/tokens.ts` (`deepest`, `primary`, `accent`, `tint`). No second
  hue, ever. `image-exemplar-analysis.md` law I1.
- **One object, no scene**: a single noun, never a composition of multiple
  objects or a background scene.
- **No text, no people, no gradients, no shadows, no texture**: these are
  explicit negatives in the prompt; if Recraft ignores one, that generation
  fails QA regardless of path count.
- **No outlines/strokes** except where the plate system itself adds a
  dashed accent trail in code (`Plate.tsx` owns that, not the generated
  SVG).

Also read `src/brand/brand.md` before approving anything. If you find a
violation that is not already covered by an existing rule, do not just
patch around it silently. Append a new dated rule and precedent to
`docs/style/exemplar-analysis.md` using the next stable `R-` number, and
never renumber existing entries (see `CLAUDE.md`).

## 6. Worked example: end to end for one object

Generating a "stacked coins" plate:

```sh
# 1. Set your key (once per shell session)
export OPENROUTER_API_KEY=$(grep OPENROUTER_API_KEY .env | cut -d= -f2)

# 2. Dry run first, always
tsx scripts/generate-image.ts coins:"stacked coins"

# Review the printed prompt, model, and cost. If it looks right:

# 3. Generate for real
tsx scripts/generate-image.ts coins:"stacked coins" --confirm
```

Expected output includes a path count and a pass/fail note against the
12-path cap, plus the running and total cost ($0.08 for one image). Then:

```sh
# 4. Post-process
tsx scripts/clean-recraft-svgs.ts
```

Check `assets/library/recraft/ledger.json` to confirm one new entry was
appended with `"prompt-slug": "coins"`, and open
`assets/library/recraft/clean/coins.svg` to eyeball it against section 5's
QA bar before using it in a plate.

## 7. When a generation is bad

Use this order of operations, cheapest option first:

1. **Regenerate** (same prompt, same variant) when the result is close but
   noisy, has a stray extra shape, or is marginally over the path cap. Most
   variance is just resampling; a second $0.08 roll often fixes it.
2. **Adjust the prompt** (switch `--variant`, or tighten the object
   description, e.g. "a single lighthouse" instead of "a lighthouse on a
   cliff") when the object is structurally wrong: it includes a scene
   instead of one object, uses a second hue, or consistently comes back
   over the path cap on both variants.
3. **Escalate to Jimmy** when:
   - An object fails QA after 2-3 regeneration and prompt-adjustment
     attempts (do not keep spending past this point).
   - You are unsure whether something violates brand style and the object
     is going into a real video, not a test.
   - The OpenRouter API returns an error you cannot explain (auth failure,
     rate limit, unexpected response shape).
   - You think a _new_ style rule needs to be written into
     `docs/style/exemplar-analysis.md` rather than just applied case by
     case.

Never spend past a hard blocker hoping it resolves itself. A stuck object at
$0.08 a try is cheap to escalate and expensive to keep guessing at.
