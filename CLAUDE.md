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

## Deferred backlog

- `listicleBeats` and `screenDemo` templates
- Visual QA of 9:16 final frames
- Royalty-cleared music sourcing and license records
- A CTA field in the plan schema
