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
 *
 * Optional `icons` array — small geometric motion accents that fade in,
 * drift gently, and fade out alongside the beat track.
 */

import { type Node, Path, Rect } from "@revideo/2d";
import {
  createSignal,
  easeOutExpo,
  easeOutQuad,
  waitFor,
  type ThreadGenerator,
} from "@revideo/core";

import { motion, palette } from "../brand/tokens";
import type { HookStatScene, MotionAccent } from "../schemas/plan";

import {
  Beat,
  DriftingGround,
  LogoEndCard,
  fitBeatsToBudget,
  frameFor,
  loadBrandFonts,
  runBeats,
  runEndCard,
  type Ratio,
  type TimedBeat,
} from "./sceneKit";

export const END_CARD_SEC = motion.endCardSec;

const ICON_PATHS: Record<string, string> = {
  arrowUp: "M -0.35 0.15 L 0 -0.4 L 0.35 0.15 M 0 -0.35 L 0 0.4",
  shield:
    "M 0 -0.4 L 0.35 -0.2 L 0.35 0.15 Q 0.1 0.4 0 0.45 Q -0.1 0.4 -0.35 0.15 L -0.35 -0.2 Z",
  lock: "M -0.22 -0.4 L -0.22 -0.12 L -0.35 -0.12 L -0.35 0.4 L 0.35 0.4 L 0.35 -0.12 L 0.22 -0.12 L 0.22 -0.4 M 0 0.08 L 0 0.24",
  dollar:
    "M 0 -0.42 L 0 0.42 M -0.22 -0.15 Q -0.3 -0.2 -0.3 0 Q -0.3 0.2 0.3 0.2 Q 0.32 0.2 0.32 0.32 Q 0.32 0.4 0.2 0.4 Q 0 0.4 -0.2 0.35 M 0.22 -0.35 Q 0.3 -0.38 0.3 -0.25 Q 0.3 -0.1 -0.3 -0.1 Q -0.32 -0.1 -0.32 -0.22 Q -0.32 -0.3 -0.2 -0.3 Q -0.05 -0.3 0.2 -0.25",
  chart:
    "M -0.38 0.42 L -0.38 -0.1 L -0.15 -0.3 L 0.1 0.1 L 0.35 -0.15 L 0.35 0.42 Z",
  circle: "M 0 -0.42 A 0.42 0.42 0 1 1 0 0.42 A 0.42 0.42 0 1 1 0 -0.42",
  diamond: "M 0 -0.42 L 0.42 0 L 0 0.42 L -0.42 0 Z",
};

/** Icon stroke weight in real pixels, before the `scale` divide. */
const ICON_STROKE_PX = 4;

function iconStroke(index: number): string {
  const strokes = [palette.accent, palette.tint, palette.white];
  return strokes[index % strokes.length];
}

function* runIcons(
  view: Node,
  icons: readonly MotionAccent[],
  frameWidth: number,
  frameHeight: number,
): ThreadGenerator {
  // Icons are scheduled against scene time, not against whatever the previous
  // lifecycle happened to advance. The fade-in is started with `yield` so the
  // drift overlaps it, which means the loop has to wait out `fadeIn` itself:
  // waiting only `hold + fadeOut` under-advanced the parent by one fade per
  // icon (a 5.5s window spent 5.15s), so every later icon drifted early.
  let sceneSec = 0;
  const sorted = [...icons].sort((a, b) => a.startSec - b.startSec);
  let drawn = 0;

  for (const icon of sorted) {
    const lead = Math.max(0, icon.startSec - sceneSec);
    yield* waitFor(lead);
    sceneSec += lead;

    const pathData = ICON_PATHS[icon.icon];
    if (!pathData) continue;

    const dwell = icon.endSec - icon.startSec;
    const fadeIn = Math.min(motion.fadeInSec * 0.5, dwell * 0.3);
    const fadeOut = Math.min(motion.fadeOutSec * 1.2, dwell * 0.25);
    const hold = Math.max(0, dwell - fadeIn - fadeOut);
    const clock = createSignal(0);
    const size = icon.size;
    // A `Path` derives its bounding box from its own data, so `width`/`height`
    // set the layout box and leave the drawn curve at unit size: that is why a
    // 120px icon rendered as a speck. `scale` is what actually resizes the
    // geometry, and the stroke weight is divided by it to land back on real
    // pixels.
    //
    // The drift lives on the wrapper, in real pixels. A node's own `x`/`y` are
    // read in its parent's space, so `scale` on the `Path` never magnified an
    // offset set on that same `Path`: a 0.12 unit drift was 0.12px of travel,
    // which is a still image.
    const driftX = size * 0.12;
    const driftY = size * 0.1;
    const restX = icon.x * frameWidth;
    const restY = icon.y * frameHeight;
    const node = (
      <Rect
        x={() => restX + Math.sin(clock() * 0.7) * driftX}
        y={() => restY + Math.cos(clock() * 0.55) * driftY}
        opacity={0}
      >
        <Path
          data={pathData}
          stroke={iconStroke(drawn)}
          lineWidth={ICON_STROKE_PX / size}
          lineCap="round"
          lineJoin="round"
          fill="transparent"
          scale={size}
        />
      </Rect>
    ) as Rect;
    drawn += 1;
    view.add(node);

    yield node.opacity(1, fadeIn, easeOutExpo);
    yield clock(dwell, dwell, (time: number) => time);
    yield* waitFor(fadeIn + hold);
    yield* node.opacity(0, fadeOut, easeOutQuad);
    node.remove();
    // fadeIn + hold + fadeOut is exactly `dwell`, so this lands on icon.endSec.
    sceneSec += fadeIn + hold + fadeOut;
  }
}

export interface HookStatProps {
  view: Node;
  scene: HookStatScene;
  ratio: Ratio;
  /**
   * Present only on a plan's final scene. The exemplar end card carries no CTA
   * text (L9), so the value is used purely as the "this is the last scene" flag
   * the composer already supplies.
   */
  endCardCta?: boolean;
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

  if (scene.icons && scene.icons.length > 0) {
    yield runIcons(view, scene.icons, frame.width, frame.height);
  }

  const isLast = Boolean(endCardCta);
  const budget = Math.max(
    1,
    scene.durationSec - (isLast ? motion.endCardSec : 0),
  );
  const beats = fitBeatsToBudget(beatsFor(scene), budget).map((beat) => {
    const node = Beat(frame, beat.content);
    view.add(node);
    return { node, durationSec: beat.durationSec };
  });

  // `runBeats` cross-dissolves consecutive beats and leaves the final beat's
  // fade-out running when it returns, so the end card below comes up while the
  // last headline is still going down.
  yield* runBeats(beats, {
    // Re-hue the ground across the beat's fade-in so the ground changes with
    // the text rather than on its own schedule (L7).
    onBeatStart: (index, durationSec) =>
      ground.rehue(index, Math.min(motion.fadeInSec, durationSec)),
  });

  if (isLast) {
    const endCard = LogoEndCard(frame);
    view.add(endCard);
    yield* runEndCard(endCard);
  }
}

export default hookStat;
