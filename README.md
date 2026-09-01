# Video Generation

## 1. What this is

This is a pipeline that turns a validated `plan.json` into a rendered brand video for Pay Theory, using Revideo. The plan file is the only contract between an LLM (or a human) and the renderer: an LLM edits the plan's fields, never scene code, renderer code, or shell commands, and the renderer derives the actual video and a caption stub purely from that plan. This keeps every render reproducible and prevents copy or motion drift from creeping into code.

For the full canonical workflow and its rules, see `CLAUDE.md` at the repo root. This README is a friendlier front door to the same rules; if the two ever disagree, `CLAUDE.md` wins.

## 2. Quick start

Run these from the repo root, in order.

1. Install dependencies:

   ```sh
   pnpm install
   ```

   Done when: the command exits 0 and a `node_modules/` directory exists.

2. Check your local environment:

   ```sh
   bash scripts/doctor.sh
   ```

   Done when: the last line reads `N checks run, 0 failed`. If anything fails, see Troubleshooting below before continuing; renders will not work with a failing doctor check.

3. Scaffold a new video (defaults to the `hookStat` scene kind if you omit `--kind`):

   ```sh
   tsx scripts/new-video.ts my-first-video --kind hookStat
   ```

   Done when: you see `created videos/my-first-video/ (kind: hookStat)` and the directory `videos/my-first-video/` exists with `plan.json` and `brief.md` inside it.

4. Fill in the brief and edit the plan:

   Open `videos/my-first-video/brief.md` and describe the objective, audience, and notes. Open `videos/my-first-video/plan.json` and edit its fields (headline, stat, captions, timing) to match. Do not add fields the schema does not define; see `src/schemas/plan.ts` for what is allowed.

5. Render a draft:

   ```sh
   tsx scripts/render-plan.ts videos/my-first-video/plan.json --draft
   ```

   Done when: the command prints `done: out/my-first-video/draft-<ratio>.mp4` and that file exists. `<ratio>` matches whatever `ratio` your plan specifies (`4x5` or `9x16`).

If step 5 fails with `Operation not permitted`, you are likely inside a restricted sandbox; see Troubleshooting.

## 3. The workflow

The full loop, exactly as documented in `CLAUDE.md`:

```sh
tsx scripts/new-video.ts <slug> --kind hookStat
# Edit videos/<slug>/brief.md and videos/<slug>/plan.json.
tsx scripts/render-plan.ts videos/<slug>/plan.json --draft
# A human reviews the draft.
tsx scripts/approve.ts <slug>
tsx scripts/render-plan.ts videos/<slug>/plan.json --final
```

- `--draft` renders a single silent MP4 at the plan's `ratio` to `out/<slug>/draft-<ratio>.mp4`. Pass `--ratio 4x5` or `--ratio 9x16` to override the plan's ratio for a draft only; you cannot combine `--ratio` with `--final`.
- Human review is a required gate. Nothing moves from draft to final without a person confirming the draft. `tsx scripts/approve.ts <slug>` prints a render-QA reminder (run `qa-frames.ts`, build a contact sheet, check copy against `src/brand/brand.md`) and then writes `videos/<slug>/APPROVED`. `--final` refuses to render without that file present.
- `tsx scripts/approve.ts <slug> --revoke` deletes the approval file, putting the video back into draft-only state.
- `--final` always renders both `4x5` and `9x16` silent files; you cannot pass `--ratio` alongside `--final`.
- If `assets/music/` contains an MP3 or WAV file, a `--final` render also mixes that track into each ratio's output via `scripts/mix.sh`. With no music present the finals stay silent.
- `--final` always writes `out/<slug>/caption.txt`, a LinkedIn-post draft stub built from the plan's own captions and headlines. This happens on every final render and does not depend on music being present (see `scripts/render-plan.ts:202`). Note that `CLAUDE.md` describes the caption stub as conditional on music; the code is the authority here and the stub is unconditional.

## 4. Repo layout

| Directory | What lives there                                                                      |
| --------- | ------------------------------------------------------------------------------------- |
| `assets`  | Brand assets (logo, fonts), music, and library images/plates used by scenes.          |
| `briefs`  | Source brief material.                                                                |
| `docs`    | Runbooks and style/exemplar analysis documents.                                       |
| `scripts` | All pipeline and tooling scripts (`new-video.ts`, `render-plan.ts`, fixers, etc).     |
| `src`     | Schemas, scene code, brand tokens, and the Revideo project entry point.               |
| `tools`   | Supporting tooling outside the core render pipeline.                                  |
| `videos`  | One directory per video: its `plan.json`, `brief.md`, and (once approved) `APPROVED`. |

`out/` (rendered MP4s and caption stubs) and `.env` are gitignored; see `.gitignore`.

## 5. Common tasks

| Goal                                       | Command                                                                                                                                                    |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Run the test suite                         | `pnpm test`                                                                                                                                                |
| Type-check the project                     | `pnpm run typecheck`                                                                                                                                       |
| Lint                                       | `pnpm run lint`                                                                                                                                            |
| Run the environment doctor                 | `pnpm run doctor` (equivalent to `bash scripts/doctor.sh`)                                                                                                 |
| Run the render smoke test                  | `pnpm run smoke`                                                                                                                                           |
| QA sampled frames of a draft render        | `tsx scripts/qa-frames.ts out/<slug>/draft-<ratio>.mp4`                                                                                                    |
| Fix a still image (denoise/sharpen/etc)    | `tsx scripts/fix-image.ts <input> [output] [ops...] [--strength 0-100]`                                                                                    |
| Fix a rendered video (sharpen/denoise/etc) | `tsx scripts/fix-video.ts <input.mp4> [output.mp4] [ops...] [--strength 0-100]`                                                                            |
| Generate new vector art                    | See `docs/image-generation-runbook.md` for the full walkthrough of `scripts/generate-image.ts` (defaults to a dry run; costs money only with `--confirm`). |

`qa-frames.ts` accepts repeated `--ignore-region x,y,width,height` flags to exclude known logos or illustrations from its text-pixel check.

## 6. Scene kinds

Four scene kinds exist, selectable via `--kind` on `new-video.ts` (defaults to `hookStat`):

- **`hookStat`**: held headline beats on a drifting purple ground, closing on a stat lockup (value, label). No lower-third caption chip or persistent logo bug; the headline is the message.
- **`kenBurnsStory`**: held headline beats on the same drifting ground, with a contained still image (a finished social graphic) panning and zooming below them.
- **`typeBeats`**: staggered headline beats (up to 4) over a shared drifting ground, with word-by-word reveal and optional eyebrow, support line, accent, and chips per beat.
- **`statPunch`**: the payoff scene: one stat, one headline, one held silence, with an optional counting animation and an optional overshoot accent moment. A plan may contain more than one `statPunch`, but at most one of them may set `accentMoment: "overshoot"`.

`typeBeats` and `statPunch` share one "ground" and cannot be mixed in the same plan with the legacy `hookStat`/`kenBurnsStory` scenes; see `src/schemas/plan.ts` for the exact validation rules and `src/scenes/registry.ts` for how each kind is wired to its renderer.

## 7. Rules that will trip you up

- **Frame reproducibility.** Scene and component code must never call `Date.now()`, `Math.random()`, or `new Date()` without a fixed argument. Every value must come from the validated plan, a seeded value, or the Revideo timeline, or the same plan will render differently twice.
- **The sandbox blocks renders.** Revideo needs to launch Chrome and bind a Vite server; `tsx` needs its IPC pipe. Both fail inside a restricted sandbox. If a render or `tsx` command fails, don't assume it's a TypeScript or plan bug until you've tried it with the sandbox disabled.
- **The plan is the only editable surface.** An LLM should only ever edit `videos/<slug>/plan.json` fields already defined in `src/schemas/plan.ts`. It should never write Revideo scene code, renderer code, shell commands, or derived post copy directly.
- **Style-law violations get a stable record.** If you find a style-law violation during review, append it to `docs/style/exemplar-analysis.md` using a new, stable `R-` number. Never renumber or reuse an existing entry.

## 8. Troubleshooting

**`bash scripts/doctor.sh` fails.**
Read the `FAIL:` lines it prints; each names exactly what's missing (Node 20+, `pnpm`, `ffmpeg`/`ffprobe` on `PATH` or in `~/.local/bin`, a resolvable `@revideo/core`, required directories, or required scripts). Install or fix the specific thing named, then re-run the doctor until it prints `0 failed`.

**A render (`render-plan.ts`, `smoke.ts`) or `tsx` command fails with "Operation not permitted".**
This is almost always the sandbox, not your plan or code. Revideo needs to launch Chrome and bind a local Vite server, and `tsx` needs an IPC pipe; both are blocked in a restricted sandbox. Re-run the same command outside the sandbox (or with it disabled) before debugging anything else.

**A plan fails validation.**
`render-plan.ts` prints `plan failed validation (<N> error(s)): <path>` followed by one line per error, each naming the exact field path and what's wrong (word counts, missing captions, an em dash, overlapping caption or icon windows, a duration that doesn't add up, a scene that needs more time than its `durationSec` allows). Fix the named field in `videos/<slug>/plan.json` and re-run; the schema is `src/schemas/plan.ts` if you need the full rule.

## 9. License

See `LICENSES.md` for full provenance and licensing of vendored brand assets and fonts; it documents Pay Theory-owned logo assets (no third-party license) and Instrument Sans (SIL Open Font License 1.1) as the vendored typeface.
