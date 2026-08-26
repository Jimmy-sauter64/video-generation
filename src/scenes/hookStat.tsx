/**
 * `hookStat` — held headline beats on a drifting purple ground.
 *
 * Frame grammar, per `docs/style/exemplar-analysis.md`: one continuous ground
 * that carries all the motion, and 3–5 headline beats that cross-fade in place
 * on top of it. No lower-third caption chip, no persistent logo bug, no
 * transforms — the headline *is* the message (L10), and the logo end card is the
 * only brand moment (L9).
 *
 * Beat order is derived from the plan without any schema change:
 *
 * 1. `hook` — the opening beat, held from 0 to the first caption cue.
 * 2. `captions[]` — one held headline beat per cue, in chronological order.
 * 3. `stat` — the closing beat, set as the v3 eyebrow/headline/subhead lockup:
 *    `stat.label` as the letterspaced caps eyebrow, `stat.value` as the
 *    headline, `supportingLine` as the 0.55x subhead.
 * 4. the logo end card, on the final scene only.
 */

import { type Node } from "@revideo/2d";
import { type ThreadGenerator } from "@revideo/core";

import { motion } from "../brand/tokens";
import type { HookStatScene } from "../schemas/plan";

import {
  Beat,
  DriftingGround,
  LogoEndCard,
  fitBeatsToBudget,
  frameFor,
  loadBrandFonts,
  runBeat,
  runEndCard,
  type Ratio,
  type TimedBeat,
} from "./sceneKit";

export const END_CARD_SEC = motion.endCardSec;

export interface HookStatProps {
  view: Node;
  scene: HookStatScene;
  ratio: Ratio;
  /**
   * Present only on a plan's final scene. The exemplar end card carries no CTA
   * text (L9), so the value is used purely as the "this is the last scene" flag
   * the composer already supplies.
   */
  endCardCta?: string;
}

/** Turn a validated hookStat scene into an ordered list of held beats. */
function beatsFor(scene: HookStatScene): TimedBeat[] {
  const cues = [...scene.captions].sort(
    (left, right) => left.startSec - right.startSec,
  );

  const beats: TimedBeat[] = [
    {
      content: { headline: scene.hook },
      // The hook owns everything before the first cue; fall back to a nominal
      // beat when a plan starts its caption track at 0.
      durationSec:
        cues.length > 0 && cues[0].startSec > 0
          ? cues[0].startSec
          : motion.beatSec,
    },
    ...cues.map((cue) => ({
      content: { headline: cue.text },
      durationSec: Math.max(0.5, cue.endSec - cue.startSec),
    })),
    {
      content: {
        eyebrow: scene.stat.label,
        headline: scene.stat.value,
        support: scene.supportingLine,
      },
      durationSec: motion.beatSec,
    },
  ];

  return beats;
}

export function* hookStat({
  view,
  scene,
  ratio,
  endCardCta,
}: HookStatProps): ThreadGenerator {
  yield loadBrandFonts();

  const frame = frameFor(ratio);

  const ground = DriftingGround(frame);
  view.add(ground.node);
  // `yield` (not `yield*`) so the ground's clock runs alongside the beats for
  // the scene's whole duration — the drift never pauses between beats.
  yield ground.run(scene.durationSec);

  const isLast = Boolean(endCardCta);
  const budget = Math.max(
    1,
    scene.durationSec - (isLast ? motion.endCardSec : 0),
  );
  const beats = fitBeatsToBudget(beatsFor(scene), budget);

  for (const [index, beat] of beats.entries()) {
    const node = Beat(frame, beat.content);
    view.add(node);
    // Re-hue the ground across the beat's fade-in so the ground changes with
    // the text rather than on its own schedule (L7).
    yield ground.rehue(index, Math.min(motion.fadeInSec, beat.durationSec));
    yield* runBeat(node, beat.durationSec);
  }

  if (isLast) {
    const endCard = LogoEndCard(frame);
    view.add(endCard);
    yield* runEndCard(endCard);
  }
}

export default hookStat;
