# Video Factory Operating Manual

From the repository root, run:

```sh
tsx scripts/new-video.ts <slug> --kind hookStat
# Edit videos/<slug>/brief.md and videos/<slug>/plan.json.
tsx scripts/render-plan.ts videos/<slug>/plan.json --draft
# A human reviews the draft.
tsx scripts/approve.ts <slug>
tsx scripts/render-plan.ts videos/<slug>/plan.json --final
```

`--final` renders both `4x5` and `9x16` silent files. When `assets/music/` has an MP3 or WAV, it also creates corresponding mixed finals and writes `out/<slug>/caption.txt`. Revoke approval with `tsx scripts/approve.ts <slug> --revoke`.

## Contract and review gates

`videos/<slug>/plan.json` is the only LLM-to-renderer surface. Do not have an LLM write Revideo scene code, renderer code, shell commands, or derived post copy; it edits the validated plan instead. The renderer derives video and the final caption stub from that plan, preventing drift.

Codex implements infrastructure and pipeline code. Claude designs scenes and visual motion. A cross-lineage review gate is required: Claude reviews Codex infrastructure; Codex reviews Claude scene work. Human approval is the required gate between draft and final.

## Render QA

Scene and component code must be frame-reproducible: never use `Date.now()`,
`Math.random()`, or `new Date()` without a fixed argument. Derive values from
the validated plan, a seeded value, or the Revideo timeline instead.

After drafting, run `tsx scripts/qa-frames.ts out/<slug>/draft-<ratio>.mp4`.
It checks sampled hook/mid/end frames for undersized text and text-like pixels
inside the 12% side margins; use repeated `--ignore-region x,y,width,height`
flags for known logos or illustrations, then inspect the flagged frame yourself.

Review the resulting contact sheet and confirm copy against `src/brand/brand.md`
before `tsx scripts/approve.ts <slug>`; its reminder records that review step
without replacing human judgment. For future style-law violations, append the
rule and precedent to `docs/style/exemplar-analysis.md` using a stable `R-`
number; never renumber existing entries.

## Local environment

Run `bash scripts/doctor.sh` first on every new machine. Renders and `tsx` need the sandbox disabled: Revideo needs Chrome and a Vite server bind, while `tsx` needs its IPC pipe. Do not diagnose those failures as a TypeScript or plan problem until running outside the restricted sandbox.

## Image & video fixing tools

Local (no API credits) image and video fixers in `scripts/`. Both shell out to
Pillow + OpenCV (images) or ffmpeg (video) — zero API calls.

### fix-image.ts — still image fixes

```sh
tsx scripts/fix-image.ts <input> [output] [ops...] [--strength 0-100]
```

Operations (chainable): `denoise` `sharpen` `contrast` `upscale` `restore`

- `denoise` — Non-local Means denoise (JPEG blocks, grain)
- `sharpen` — Unsharp mask
- `contrast` — Percentile-based auto contrast stretch
- `upscale` — 2x Lanczos upscale
- `restore` — denoise → contrast → sharpen (one-shot)

### fix-video.ts — rendered MP4 fixes

```sh
tsx scripts/fix-video.ts <input.mp4> [output.mp4] [ops...] [--strength 0-100]
```

Operations (chainable): `sharpen` `contrast` `denoise` `brighten` `fix-overscan`
`fix-margins` `restore`

- `sharpen` — ffmpeg unsharp mask
- `contrast` — Video eq brightness + contrast
- `denoise` — hqdn3d temporal/spatial denoise
- `brighten` — Gamma lift for dark frames
- `fix-overscan` — Crop 1% to remove encoding edge artifacts
- `fix-margins` — Crop 12% side margins (matches qa-frames.ts logic)
- `restore` — denoise → eq → brighten → sharpen

## Deferred backlog

- `listicleBeats` and `screenDemo` templates
- Visual QA of 9:16 final frames
- Royalty-cleared music sourcing and license records
- A CTA field in the plan schema

<!-- ASTRYX:START -->
Astryx v0.5.0 · 163 components
CLI: run every command as `pnpm exec astryx <cmd>` (shown below as `astryx ...`).

SETUP (once, in your app entry e.g. main.tsx) — without these, components render unstyled:
  import "@astryxdesign/core/reset.css";
  import "@astryxdesign/core/astryx.css";

WORKFLOW — discover, don't guess. Before writing UI:
1. `astryx build "<idea>"` — START HERE: returns a kit (closest [page] + [block]s + [component]s). No args = full playbook.
2. `astryx template <name> [--skeleton]` — scaffold the [page]/[block]s it named, or study their layout. Templates are reference code.
3. `astryx component <Name>` — props + examples for every component you use.

RULES:
- No <div> — components do all layout/spacing, page frame included.
- Frame first: read `astryx docs layout` before writing any page or screen — page frame, region widths, breakpoint behavior.
- Dense data = rows (Table, List/Item), never Card-wrapped list items; Card is for standalone widgets. Status = StatusDot/Token; Badge = counts only.
- Custom styling: component props first; else style/className with tokens — var(--color-*|--spacing-*|--radius-*). No raw hex/px. (No StyleX/Tailwind compiler here — don't use xstyle/utility classes.)
- Tokens for every value (`astryx docs tokens`). Brand/accent belongs in the theme (`astryx theme list` / `theme add <slug>`, or `astryx theme template` for a custom one) — never override --color-* in :root.
- SELF-CHECK before you finish: re-read the file and replace any raw <div>/<span> layout, imported .css/@apply, or hardcoded value (#hex, 16px) with the component or a token (var(--color-*|--spacing-*|…)). If unsure a component/prop exists, run `astryx component <Name>` / `astryx search "<thing>"`; don't hand-roll CSS.

MORE CLI:
  search "<query>"   find any component / hook / doc / template / block
  component --list   163 components by category
  template --list    page + block recipes
  docs <topic>       browser-support, cli-integrations, color, elevation, getting-started, icons, illustrations, internationalization, layout, migration, motion, principles, shape, spacing, styling-libraries, styling, theme, tokens, typography, working-with-ai
  swizzle <Name>     eject component source for deep customization
  upgrade --apply    run after any @astryxdesign/core bump
<!-- ASTRYX:END -->
