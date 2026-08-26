# Video Generation Repo — Revideo Short-Form Factory

## Context

`~/Claude/Video Generation` is blank. Goal: a well-put-together repo that generates high-quality short-form (15–60s) social videos — primarily Pay Theory GTM content for LinkedIn, built as a reusable video factory. All decisions below were made by Jimmy in interview (2026-08-26); Fable orchestrates only, subagents implement with explicit model routing.

**Locked decisions:**
- **Engine: Revideo** (MIT, free) — chosen over Remotion after research surfaced Remotion's BUSL license (~$100/mo company license for a company Pay Theory's size). Revideo is a Motion Canvas fork purpose-built for automated render pipelines.
- **Output:** 1080×1350 (4:5) default for LinkedIn feed + 9:16 secondary render, captions-first + music bed, MP4s to local `out/`
- **Content:** Claude writes scripts (paytheory-voice skills) or repurposes existing PT copy; visuals = motion graphics/kinetic text, product screen recordings, stills (Ken Burns)
- **Workflow:** draft render → Jimmy reviews → final render; human gate every video
- **Budget:** <$1/video, $0 recurring; AI b-roll is a future bolt-on slot only
- **Cadence:** 1–3/week. Quality bar: professionally designed, scroll-stopping hook (4–8 word on-screen hook, decision window ~2s, sound-off assumed), one clear message
- **Brand:** Source of truth is the Visual DNA card Jimmy provided (screenshots, 2026-08-26): palette `#6C2BD9` (primary purple), `#53259D` + `#2E1457` (deep anchors), `#1C0D36` (near-black ink), `#A971F7` (violet accent), `#EDE0FD` (lavender tint), `#FFFFFF`. Aesthetic contract, verbatim into `brand.md`: "Deep purple primary with violet accent and light lavender tint, generous white and off-white space, clean technical SaaS layouts, restrained editorial typography with ample negative space." Fonts: Halyard Display (headlines) / Halyard Text (body) — no font files on this machine, so ship a free metrically-similar stand-in tokenized for a one-line swap if real Halyard files arrive. Logo: white P logomark on deep purple (SVG found in aigtm).

**Machine inventory (verified by Explore agent):** ffmpeg 8.1.2 + ffprobe (`~/.local/bin`), yt-dlp, whisper-cli (whisper.cpp) — no video libs/GUI editors installed. Brand assets found: logomark SVG (`~/Claude/GitHub/aigtm/apps/demo/public/assets/pay-theory-logomark.svg`), 1080² logo PNG + palette doc (`~/Claude/Downloads-Archive/2026-06/`), animated avatar GIFs (`~/Claude/Documents/pay-theory-avatar/`), prior PT promo MP4s as style references (`~/Claude/Documents/paytheory_reel.mp4`, `~/Claude/Projects/transcripts/linkedin-ad-video-2026-07/`).

**Research findings baked in** (sources in research agent report): the cited YouTube exemplar is a generative kie.ai pipeline — its borrowable ideas are the cost-ledger + approve-before-spend skill pattern and QA-gating cheap artifacts before expensive steps, not its architecture. From `ryanwi/agentic-remotion-pipeline`: seconds-based `plan.json` (Zod) as the ONLY LLM output surface (Claude never writes renderer code), silent video render then two-pass ffmpeg loudnorm to −14 LUFS muxed without re-encoding. From `hassancs91/claude-faceless-shorts-creator`: `brand.md` style contract, HOOK→SETUP→REVEAL→LOOP beat grammar, frame-grab QA gate, normalized reusable media library.

## Repo design

```
Video Generation/
├── package.json                # Revideo + TS, pnpm
├── src/
│   ├── brand/
│   │   ├── tokens.ts           # both purples w/ roles, fonts, safe areas, logo paths
│   │   └── brand.md            # prose style contract for the script-writing step
│   ├── scenes/                 # Revideo scenes = templates
│   │   ├── hookStat.tsx        # kinetic-text stat callout
│   │   ├── listicleBeats.tsx   # N-beat text listicle
│   │   ├── screenDemo.tsx      # screen recording + zoom/pan + overlays
│   │   └── kenBurnsStory.tsx   # stills w/ pan/zoom
│   ├── components/             # Captions (word-timed pages), LogoBug, ProgressBar, EndCard
│   ├── schemas/plan.ts         # Zod: beats (hook/setup/reveal/loop), timings in seconds,
│   │                           #   per-scene props — the LLM↔renderer contract
│   └── project.ts
├── assets/
│   ├── brand/                  # ingested logos, fonts (woff2)
│   ├── music/                  # royalty-free beds, pre-normalized
│   └── library/                # reusable normalized clips/stills
├── briefs/                     # input: one .md brief per video
├── videos/<date>-<slug>/       # plan.json + script.md per video
├── out/<date>-<slug>/          # draft.mp4 → final-4x5.mp4, final-9x16.mp4, caption.txt
├── scripts/
│   ├── new-video.ts            # brief → scaffolded video dir
│   ├── render.ts               # draft (low-res, watermark) / final (both ratios)
│   ├── mix.sh                  # ffmpeg: music bed, 2-pass loudnorm −14 LUFS, mux no re-encode
│   └── doctor.sh               # preflight: ffmpeg/node/assets present (asserts counts, not exit codes)
├── docs/superpowers/specs/2026-08-26-video-factory-design.md
└── CLAUDE.md                   # pipeline how-to, model routing, review gate, plan.json rules
```

**Pipeline per video:** `briefs/x.md` → Claude (paytheory-voice + `brand.md`) writes `script.md` + `plan.json` (Zod-validated, beat grammar) → `pnpm draft <slug>` renders low-res watermarked 4:5 draft + frame grabs of the hook → Jimmy reviews → `pnpm final <slug>` renders both ratios silent, `mix.sh` adds music bed, `caption.txt` (LinkedIn post copy — its generation is an explicit pipeline step, PT-voice reviewed) written alongside.

**Captions are beat-timed, not word-timed** (Codex finding #1): `plan.json` carries validated `captions: {text, start, end}[]` intervals per scene — deterministic from the plan, no transcription involved. True word-level timing only arrives if recorded VO is added later (whisper-cli path), and is labeled a future feature.

**Ratio handling** (finding #4): scenes are authored against safe-area tokens for BOTH 4:5 and 9:16 (defined in `brand/tokens.ts`); no automatic recomposition is assumed — each template declares its per-ratio framing rules.

**Audio contract** (finding #5): finals render silent; `mix.sh` = two-pass loudnorm on the music bed, then mux with video stream copied (`-c:v copy`) and audio encoded AAC 48kHz stereo. Verification measures the OUTPUT file: LUFS −14 ±1, true peak ≤ −1 dBTP, correct codecs/sample rate/channels via ffprobe.

## Implementation (delegated; Fable orchestrates only)

Seating per Jimmy's cross-lineage rule (2026-08-26): **Codex writes system/infra code, Claude reviews; Claude (opus) writes design-heavy visual code, Codex gate-reviews.** Never the same lineage on both seats. Every task ends with a cross-lineage review gate before the next launches.

| # | Task | Implements | Reviews (gate) |
|---|---|---|---|
| 0 | **Feasibility spike (disposable, gate for everything else):** minimal Revideo project rendering beat-timed captions, a local image, at BOTH 1080×1350 and 1080×1920, headless via `renderVideo()`; confirm encode-quality controls (Revideo pre-1.0, no CRF controls per issue #401). Pass/fail criteria written before the run. | Claude sonnet (throwaway, already launched) | orchestrator verifies evidence |
| 1 | Scaffold: git init, pnpm, Revideo + TS, typecheck/lint, doctor.sh (counted preflight: N checks, 0 failed — never exit-code-only) | **Codex** gpt-5.6-terra med | Claude sonnet review |
| 2 | Brand kit: VENDOR assets into `assets/brand/`, `tokens.ts` (palette + per-ratio safe areas), `brand.md`, free Halyard stand-in woff2, `LICENSES.md` | Claude sonnet (asset curation, not infra) | **Codex** review |
| 3 | `schemas/plan.ts` (versioned, discriminated union, caption intervals + coverage/overlap/wpm validation, asset metadata, per-ratio framing) + Captions/shared components | **Codex** gpt-5.6-sol high (core contract correctness) | Claude opus review |
| 4 | **2 templates first** (HookStat, KenBurnsStory) w/ example plan.json each; other 2 deferred past task 6 | Claude opus (visual motion design) | **Codex** review |
| 5 | Pipeline scripts (new-video, render draft/final w/ APPROVED-marker enforcement + path allowlisting, mix.sh per audio contract) + caption.txt generation + repo CLAUDE.md | **Codex** gpt-5.6-terra med | Claude sonnet review |
| 6 | End-to-end proof: one real PT video through brief→draft→review→final | orchestrator + Jimmy | — |

Gate mechanics: reviewer gets the diff + the task's output contract, returns counted findings (BLOCKER/MAJOR/MINOR); BLOCKERs go back to the implementer before the next task starts; findings are hypotheses — orchestrator verifies before bouncing.

Order: **0 (gate)** → 1 → (2 ∥ 3) → 4 → 5 → 6. Each subagent prompt carries explicit paths, output contract, grounding rule, and stop conditions per the delegate skill. Music: task 5 sources 2–3 royalty-free beds with license records in `LICENSES.md` (or stubs with silence if licensing unclear — flag, don't guess).

**Kill-switch (Codex finding #2):** if the task-0 spike fails on captions, multi-format rendering, or encode quality, STOP and re-decide the engine (Remotion + license vs Motion Canvas) before any further build — do not silently absorb the cost. Revideo is pre-1.0 (0.11.0) with a small ecosystem; the spike exists to surface that risk for ~an hour of work instead of mid-build.

## Verification

- Task-0 spike: written pass/fail criteria checked BEFORE proceeding (captions render, both ratios render, quality acceptable on visual inspection)
- `doctor.sh` passes with counted assertions (N checks run, 0 failed — never exit-code-only); `pnpm typecheck && pnpm lint` clean
- `pnpm draft demo` yields a playable MP4 per template (ffprobe: resolution, duration, fps) **plus visual inspection of extracted representative frames in BOTH ratios** — dimensions alone can't catch cropped content or broken typography (Codex finding #4)
- Mixed final measured on the output file: −14 ±1 LUFS, true peak ≤ −1 dBTP, AAC 48kHz stereo, video stream bit-identical to the silent render (`-c:v copy`)
- Definition of done: one real PT topic taken through the full documented pipeline, Jimmy approves the draft, both final ratios + caption.txt land in `out/`, caption passes the paytheory-voice reviewer agent

## Advisory-review addendum (exit-gate cross-model review, adopted 2026-08-26)

- `plan.json` is the SINGLE source of truth; `script.md` and `caption.txt` are derived from it (regenerated on final render — kills script/plan and post-copy drift).
- `schemas/plan.ts` additionally validates: total duration vs sum of scenes, caption interval coverage + non-overlap, reading-speed floor (~180 wpm → min duration per caption), asset paths canonicalized + allowlisted under `assets/` and `videos/<slug>/`.
- `pnpm final <slug>` refuses to run unless `videos/<slug>/APPROVED` exists (written by an explicit `pnpm approve <slug>` after draft review).
- Mix loudness is a token: `MIX_TARGET_LUFS = -16` for music-only mixes (−14 reserved for future VO mixes); true peak ≤ −1 dBTP unchanged.
- Rejected: TTS voiceover now (captions-first was an explicit decision; future bolt-on), pre-abandoning Revideo over generator-function complexity (task-0 spike is the test).

## Codex validation record (2026-08-26)

Plan adversarially reviewed by Codex gpt-5.6-sol (high effort): 1 BLOCKER + 5 MAJOR findings, all six integrated above (beat-timed captions honesty, task-0 spike gate, schema versioning/discriminated union, 2-templates-first scoping, ratio-aware framing + visual frame checks, explicit audio codec contract, vendored assets + license records + counted preflight). Codex verdict: "Revise — then ship; rethink Revideo only if the task-0 spike fails."
