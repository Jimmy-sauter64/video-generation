# Exemplar Motion-Design Spec

Frame-accurate analysis of the 4 LinkedIn videos Jimmy set as the quality bar. Method: pulled
the MP4s, `ffprobe` metadata, scene-detect for cut rhythm, pixel measurement of text bounding
boxes, per-frame contrast for fade curves.

| #   | Post                    | Frame           | Dur   | Hard cuts          | Beats |
| --- | ----------------------- | --------------- | ----- | ------------------ | ----- |
| 1   | Stripe / Krak Card      | 720x720 (1:1)   | 17.4s | 13 (all in 0–4.8s) | 9     |
| 2   | Stripe / Perplexity     | 1280x720 (16:9) | 39.0s | 0                  | 7     |
| 3   | AWS / Bedrock AgentCore | 720x900 (4:5)   | 15.0s | 0                  | 2     |
| 4   | AWS / AI Virtual League | 720x720 (1:1)   | 25.6s | 1 (final)          | 7     |

## 1. Style laws (cross-video, implementable)

**L1 — Opacity is the only entrance. No transforms.**
Zero of the four moves text in space: no slide, scale, spring, bounce, or per-word pop. Text
cross-fades in place. Fade IN **0.60–0.80s ease-out** (v3 measured 5%→28%→56%→72%→86%→98%→100%
over 0.75s); fade OUT **0.30–0.40s ease-in**, always ~half the in-duration. Implement as
`opacity` only: `cubic-bezier(0.16,1,0.3,1)` in, `cubic-bezier(0.7,0,0.84,0)` out.

**L2 — Max 8 words on screen, max 4 words per line, max 4 lines.**
Measured: v1 hook 6 words/2 lines; v3 headline 6 words/3 lines + 4-word subhead; v4 beats
2–11 words/2–4 lines. Wrap at 20–28 characters. Never one long line.

**L3 — Sentence case at medium weight. ALL CAPS only for a tiny eyebrow.**
Every headline is sentence case at 500–600 weight — never 700+, never caps. The one caps usage
is v3's eyebrow ("NEW IN AGENTCORE") at 0.42x headline size, ~0.12em tracking.

**L4 — Type scale, normalized to frame width (square/4:5).**
Headline font-size ≈ **8% of frame width** (86px @1080w) — measured glyph heights 6.0%W (v1),
7.5%W (v3), 8.1%W (v4). Support/subhead = **0.55x** headline; eyebrow = **0.42x**.
**line-height 1.15** — measured 1.12–1.17 in all four. Not tighter.

**L5 — Text occupies 55–70% of frame width; side margins ≥12%.**
Measured columns: v3 12.4%–79.9% (left-aligned, 20% right margin); v1 24%–76% and v2 21%–78%
(centered). Text never approaches the edge. Pick one alignment per video and hold it — left
(v3, v4) or centered (v1, v2), never mixed.

**L6 — Leave the bottom third empty.**
v3 puts all content in y 9%–63%, leaving the bottom 37% pure negative space. None of the four
fills the frame vertically. Negative space is the "cleanness" — a spend, not a leftover.

**L7 — One continuous ground; the background carries the motion, not the text.**
A single ground that never hard-switches: `#000000` (v1), warm off-white `#FAF7F4` (v2), or a
morphing gradient mesh (v3, v4). The gradient drifts continuously and re-hues _at_ each beat
boundary, cross-dissolved in sync with the text — v4 per-second means run `#530F79` → `#DDA5E8`
→ `#334637` → `#58177A` → `#292523`. That drift is why zero-cut videos still feel alive.

**L8 — Beats hold 3–4s. Cutting is a rare, contained special effect.**
Sustained beat length: 3.7s (v4), 4.5s (v2), 10.6s (v3, a single beat). v1 is the only cutter,
and it confines a 13-cut burst (0.10–0.35s/shot) to the first 4.8s, anchored by a match-cut —
the card holds identical center position and scale across every cut, so the eye never resets.
After 4.8s v1 stops cutting entirely.

**L9 — No persistent logo bug. The logo end card is the payoff.**
3 of 4 show no brand mark until the end (v3 excepted: small `aws` top-left, ~5% of width). Every
video ends on the logo **alone**, centered, same ground, held **2.5–4.0s** (10–23% of runtime).
No URL, CTA button, social handles, or tagline lockup.

**L10 — No caption track.**
No burned-in subtitles, lower-third band, or word-by-word captions anywhere. The headline text
_is_ the message, set in the optical middle. Sound-off works because the whole video is ~7
sentences, not because captions transcribe a voiceover.

**L11 — One accent mechanism, no second color.**
Neither AWS video introduces an accent hue. Emphasis is a translucent, achromatic **highlight
plate** wiping in behind a phrase (v4: "AWS Experts", "Win in your region") — entrance and
emphasis in one. v2 instead settles the final phrase last (grey → black over ~1.5s).

**L12 — Square or 4:5, not 9:16.** Three of four are 1:1 or 4:5; v2 is 16:9. No 9:16 anywhere.

## 2. Per-video notes

**v1 Stripe/Krak (1:1, 17.4s)** — Hook is 0 words: a red card dead-center against Mount Rushmore,
then 12 more locations match-cut at 0.1–0.35s. Black title card hard-cuts in at 1.30s ("Finally.
Krak Card / landed in the US"). Card hero on black at 4.8s. Three benefit lines fade one at a
time, ~1.1s each, 3–4 words. "Get your card today" over a slowly rotating 3D phone mockup. Logo
card 13.4–17.4s. The only video that cuts; the montage is its whole idea.

**v2 Stripe/Perplexity (16:9, 39.0s)** — Zero cuts in 39 seconds. Warm paper ground `#FAF7F4`,
dark light-serif type, centered. Hook builds word-by-word ("Ship" → "Ship with a team of agents
on Perplexity Computer."). ~60% of runtime is a real product screen recording, inset with margins
on the same ground rather than full-bleed — the UI reads as an object on a page. Closes on
`perplexity + stripe`.

**v3 AWS AgentCore (4:5, 15.0s)** — The most extreme and the cleanest. ONE static layout held 10.6
seconds. Left-aligned, top-anchored: small `aws` mark, letterspaced caps eyebrow, 3-line headline,
one-line subhead. Bottom 37% empty. The only motion in 15 seconds is the pastel gradient morphing
behind it plus the text fade. Proof that "no motion, held long, set well" clears this bar.

**v4 AWS Virtual League (1:1, 25.6s)** — 6 beats at ~3.7s each, white left-aligned type over a
gradient that re-hues per beat. Signature device is the highlight plate wiping in behind key
phrases, staggered line-by-line down a stacked list. Weakest moment is beat 3 (~8–11s): white text
on a light cyan/lime gradient, contrast marginal. Ends on centered `aws`.

## 3. Delta vs our current templates

Measured from `src/`: `fontWeight={700}` everywhere, `lineHeight` 1.04–1.08, `LogoBug` persistent
at `opacity 0.68`, `Captions` pinned to `captionZone`, `hookStat` base 92px / value 168px.

| Ours today                                   | Exemplar bar                              | Change                                                                                                                                                                                                      |
| -------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fontWeight 700` on captions, hooks, EndCard | 500–600, never 700+                       | Drop to **500** body / **600** headline. Instrument Sans 500 is already vendored; 700 becomes unused.                                                                                                       |
| `lineHeight` 1.04–1.08                       | 1.12–1.17 measured                        | Raise to **1.15**. Our type is currently set tighter than any exemplar — it reads dense, not editorial.                                                                                                     |
| "Kinetic text" (springs, transforms)         | Opacity-only, zero transforms             | **Delete all transform/spring entrances.** Replace with 0.7s ease-out fade in, 0.35s ease-in fade out. This is the single biggest gap.                                                                      |
| Lower-third `Captions` in `captionZone`      | No caption track in any of the four       | **Cut the caption track.** Move the message into 3–4 held headline beats set in the optical middle.                                                                                                         |
| `LogoBug` persistent at 0.68 opacity         | No persistent bug in 3 of 4               | **Remove the corner bug.** Let the logo end card be the only brand moment. (Or: small top-left mark at ≤5% width, v3-style, opacity 1.0 — a faded corner bug reads as a watermark, which none of them use.) |
| Flat `deepest` #2E1457 background            | Living ground that re-hues per beat       | Add a **slow gradient mesh** drifting across the purple ramp (`deepest`→`primary`→`deepAnchor`), re-huing at each beat boundary, cross-faded with the text. Static flat purple is the "cheap" tell.         |
| 9x16 safe areas (15%/20% insets) defined     | Nobody shipped 9:16                       | Make **1:1 and 4:5 the primary outputs** for LinkedIn; keep 9x16 for TikTok/Reels only.                                                                                                                     |
| Hook 92px base on 1080 (8.5%W)               | 8%W                                       | Close enough — **keep**. This one already matches.                                                                                                                                                          |
| `EndCard` with CTA text at `fontWeight 700`  | Logo alone, 2.5–4s, no CTA                | **Strip the EndCard to the logomark**, centered on the same ground, held **3.0s**. Move any CTA into a text beat _before_ it.                                                                               |
| Side margins ~7% (`safeAreas` 76px/1080)     | ≥12% observed, text column 55–70%W        | **Widen to 12%** and cap the text column at 70% of width. Our 7% margin lets type run 86% of the frame — nearly 20 points wider than any exemplar.                                                          |
| `accent` #A971F7 for emphasis                | Achromatic highlight plate, no accent hue | Emphasis via a **translucent plate wiping in behind the phrase**, not a color swap. Keeps the "one accent, rare" rule honest.                                                                               |

**Net:** our templates are louder and denser than the bar — heavier weight, tighter leading,
narrower margins, moving text, a persistent watermark, flat background. The exemplars win on
restraint: fewer words, held longer, set smaller in more space, on a ground that moves so the
type doesn't have to.
