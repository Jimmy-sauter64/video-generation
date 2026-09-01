/**
 * `statPunch` - the payoff scene: one number, one headline, one held silence.
 *
 * R-series behaviour:
 *
 * - **R-1** every element rises and scales in on `E.entrance`, opacity first.
 * - **R-2** the headline arrives word by word at `STAGGER.base`, and the whole
 *   scene peels out in reversed order before the end card.
 * - **R-4** when the plan marks this scene `accentMoment: "overshoot"`, the stat
 *   value's scale channel (and only the scale channel) uses `E.overshoot`. The
 *   plan schema allows one such scene per video, so this is the single payoff
 *   moment; `settle` keeps the standard entrance curve.
 * - **R-5** the scene holds `endStillnessSec` of genuine stillness plus whatever
 *   slack the budget leaves, and the last scene then holds the logo end card.
 *
 * Timing comes from `src/motion/timing.ts`, the same ledger the plan schema
 * validates against, so the exit always completes before the end card rises.
 *
 * The ground belongs to the composer (`sharedGround: true`), so nothing here
 * creates or clocks it.
 */

import { Layout, Path, type Node, Txt } from "@revideo/2d";
import {
  waitFor,
  type SimpleSignal,
  type ThreadGenerator,
} from "@revideo/core";

import { motion, palette, typeScale, typeWeights } from "../brand/tokens";
import {
  counterRoll,
  enterElement,
  exitGroup,
  holdStill,
  staggerWords,
} from "../motion/choreography";
import {
  breathAt,
  driftInward,
  idleOffsetAt,
  pulseTrackY,
} from "../motion/idle";
import { sceneClock, travelingPulse } from "../motion/living";
import {
  MIN_STILLNESS_SEC,
  exitSpanSec,
  statPunchNodeCount,
  statPunchOverheadSec,
  type StatPunchShape,
} from "../motion/timing";
import { D, E, STAGGER } from "../motion/tokens";
import {
  fitMetric,
  fitSingleLine,
  fittedBlock,
  splitHeadline,
} from "../motion/textSplit";
import type { StatPunchScene } from "../schemas/plan";

import { frameFor, type Frame } from "./sceneKit";
import { runSceneEndCard, smallTypeSize } from "./sharedGround";
import type { SceneContext } from "./registry";

/**
 * Unit-box icon geometry, the same normalised path vocabulary `hookStat` uses.
 * Kept local so the legacy template stays frozen.
 */
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

/** Stroke weight for the icon, in px, before the unit-box scale is divided out. */
const ICON_STROKE_PX = 4;

/**
 * Idle vocabulary for the payoff frame.
 *
 * The reference piece never lets its closing stat sit still: the headline slides
 * a hair laterally while the surrounding marks keep their own slow orbit. These
 * are the smallest amplitudes that read as alive at 30fps and the longest
 * periods that still complete visible travel inside a 7 second scene.
 */
const STAT_DRIFT_OF_WIDTH = 0.012;
const STAT_DRIFT_PERIOD_SEC = 9;
const ICON_ORBIT_PERIOD_SEC = 7.4;
const ICON_BREATH_DEPTH = 0.03;
const ICON_BREATH_PERIOD_SEC = 5.5;

/** Final displayed stat string, used for sizing so the type never resizes. */
function statDisplayText(scene: StatPunchScene): string {
  const { value, countTo, prefix = "", suffix = "" } = scene.stat;
  if (countTo === undefined) {
    return value;
  }
  return `${prefix}${Math.round(countTo)}${suffix}`;
}

interface StatLayout {
  readonly nodes: Layout[];
  readonly stat: Txt;
  readonly eyebrow?: Txt;
  readonly label?: Txt;
  readonly words: readonly Txt[];
  readonly support?: Txt;
  readonly icon?: Layout;
}

/**
 * Place the eyebrow / stat / label / headline / support stack inside the content
 * band.
 *
 * The stat is the largest type in the system and must never wrap or be clipped,
 * so its size is solved directly from the string's own width and then reduced,
 * if needed, until the whole stack fits the band above 63% of frame height (L6).
 * Width is never at risk: every block is fitted to the 70% text column inside
 * the 12% side margins (L5).
 */
function buildLayout(
  scene: StatPunchScene,
  frame: Frame,
  clock: SimpleSignal<number>,
): StatLayout {
  const gap = Math.round(frame.headlineSize * 0.34);
  const columnLeft = frame.textCenterX - frame.textWidth / 2;
  const columnWidth = frame.textWidth;
  const band = frame.contentBottom - frame.contentTop;

  const smallSize = smallTypeSize(frame);
  const eyebrowTracking = smallSize * typeScale.eyebrowTrackingEm;
  const statText = statDisplayText(scene);

  const smallFit = (text: string, maxLines: number, letterSpacing = 0) =>
    fitMetric(text, {
      base: smallSize,
      min: smallSize,
      maxWidth: columnWidth,
      maxLines,
      fontWeight: typeWeights.support,
      letterSpacing,
    });

  const eyebrowFit = scene.eyebrow
    ? smallFit(scene.eyebrow.toUpperCase(), 1, eyebrowTracking)
    : undefined;
  const labelFit = smallFit(scene.stat.label, 2);
  const headlineFit = fitMetric(scene.headline, {
    base: frame.headlineSize,
    min: frame.headlineMinSize,
    minIsAbsolute: true,
    maxWidth: columnWidth,
    fontWeight: typeWeights.headline,
  });
  const supportFit = scene.support ? smallFit(scene.support, 2) : undefined;

  const fixedHeight =
    (eyebrowFit ? eyebrowFit.height + gap : 0) +
    labelFit.height +
    gap +
    headlineFit.height +
    (supportFit ? gap + supportFit.height : 0) +
    gap;

  // Largest one-line size the column allows, then shrunk until the stack fits
  // the band. The old code asked the wrapper for a one-line fit and silently
  // took its clipped answer, which is how "PCI Level 1" rendered as "PCI".
  const statCeiling = Math.round(frame.width * 0.17);
  const statFloor = Math.round(frame.width * 0.08);
  let statSize = fitSingleLine(
    statText,
    statCeiling,
    columnWidth,
    typeWeights.headline,
  );
  while (
    statSize > statFloor &&
    fixedHeight + statSize * typeScale.lineHeight > band
  ) {
    statSize -= 2;
  }
  const statHeight = statSize * typeScale.lineHeight;

  const totalHeight = fixedHeight + statHeight;
  let cursor = frame.contentTop + Math.max(0, (band - totalHeight) / 2);

  const nodes: Layout[] = [];

  let eyebrowNode: Txt | undefined;
  if (scene.eyebrow) {
    const built = fittedBlock(scene.eyebrow.toUpperCase(), columnLeft, cursor, {
      base: smallSize,
      min: smallSize,
      maxWidth: columnWidth,
      maxLines: 1,
      fill: palette.tint,
      fontWeight: typeWeights.support,
      letterSpacing: eyebrowTracking,
    });
    eyebrowNode = built.node;
    nodes.push(eyebrowNode);
    cursor += built.height + gap;
  }

  const statBlock = fittedBlock(statText, columnLeft, cursor, {
    base: statSize,
    min: statSize,
    maxWidth: columnWidth,
    maxLines: 1,
    fill: palette.white,
    fontWeight: typeWeights.headline,
  });
  nodes.push(statBlock.node);
  cursor += statBlock.height;

  // The label is what the number means. Without it the frame reads as a bare
  // string; it sits directly under the value, tight, so the two read as one
  // lockup rather than two stacked blocks.
  const labelBlock = fittedBlock(
    scene.stat.label,
    columnLeft,
    cursor + gap * 0.25,
    {
      base: smallSize,
      min: smallSize,
      maxWidth: columnWidth,
      maxLines: 2,
      fill: palette.accent,
      fontWeight: typeWeights.support,
    },
  );
  nodes.push(labelBlock.node);
  cursor += gap * 0.25 + labelBlock.height + gap;

  // The value and its label drift together, so the lockup slides as one object
  // rather than coming apart. `driftInward` is one-sided on purpose: the column
  // already starts on the 12% left margin, so a symmetric drift would carry the
  // largest type in the system out through the safe area for half of every
  // cycle. `x` is untouched by the entrance and the exit, which only move `y`,
  // `scale`, and `opacity`, so the reactive value never fights a tween.
  const driftAmplitude = Math.round(frame.width * STAT_DRIFT_OF_WIDTH);
  const driftX = () =>
    columnLeft + driftInward(driftAmplitude, STAT_DRIFT_PERIOD_SEC, clock());
  statBlock.node.x(driftX);
  labelBlock.node.x(driftX);

  const headline = splitHeadline(scene.headline, columnLeft, cursor, {
    base: frame.headlineSize,
    min: frame.headlineMinSize,
    minIsAbsolute: true,
    maxWidth: columnWidth,
    fill: palette.white,
    fontWeight: typeWeights.headline,
  });
  nodes.push(...headline.words);
  cursor += headline.height;

  let supportNode: Txt | undefined;
  if (scene.support) {
    const built = fittedBlock(scene.support, columnLeft, cursor + gap, {
      base: smallSize,
      min: smallSize,
      maxWidth: columnWidth,
      maxLines: 2,
      fill: palette.tint,
      fontWeight: typeWeights.support,
    });
    supportNode = built.node;
    nodes.push(supportNode);
  }

  let iconNode: Layout | undefined;
  const iconSpec = scene.icon;
  if (iconSpec && ICON_PATHS[iconSpec.icon]) {
    // A `Path` derives its bounding box from its own data, so `width`/`height`
    // set the layout box and leave the drawn curve at unit size: that is why a
    // 120px shield rendered as a 6px speck. `scale` is what actually resizes
    // the geometry, and the stroke weight is divided by it to land back on real
    // pixels.
    //
    // That `scale` has to live on a node the entrance never touches:
    // `enterElement` tweens its target's scale channel to 1, which would undo
    // the sizing and leave the icon invisible again. The wrapper takes the
    // entrance; the `Path` inside it keeps the size.
    //
    // The idle motion goes on the `Path`, not on the wrapper, for the same
    // reason the sizing does: the wrapper's `scale` and `y` belong to the
    // entrance. The shield therefore keeps a slow orbit and a 3% breath after it
    // lands instead of freezing, and the stroke weight stays pinned to the
    // nominal size so the outline does not breathe with it.
    const orbitRadius = iconSpec.size * 0.06;
    iconNode = new Layout({
      x: iconSpec.x * frame.width,
      y: iconSpec.y * frame.height,
      opacity: 0,
      children: [
        new Path({
          scale: () =>
            iconSpec.size *
            breathAt(ICON_BREATH_DEPTH, ICON_BREATH_PERIOD_SEC, clock()),
          position: () =>
            idleOffsetAt(
              {
                amplitudeX: orbitRadius,
                amplitudeY: orbitRadius * 0.75,
                periodSec: ICON_ORBIT_PERIOD_SEC,
                phase: 0,
              },
              clock(),
            ),
          data: ICON_PATHS[iconSpec.icon],
          stroke: palette.accent,
          lineWidth: ICON_STROKE_PX / iconSpec.size,
          lineCap: "round",
          lineJoin: "round",
          fill: "transparent",
        }),
      ],
    });
  }

  return {
    nodes,
    stat: statBlock.node,
    eyebrow: eyebrowNode,
    label: labelBlock.node,
    words: headline.words,
    support: supportNode,
    icon: iconNode,
  };
}

export function* statPunch(context: SceneContext): ThreadGenerator {
  const scene = context.scene;
  if (scene.kind !== "statPunch") {
    yield* waitFor(context.scene.durationSec);
    return;
  }

  const frame = context.frame ?? frameFor(context.ratio);
  const typed: StatPunchScene = scene;
  const isLast = context.isLast;

  // One clock for the scene drives the stat's lateral drift and the icon's
  // orbit; tweened linearly, so both are pure functions of scene time.
  const clock = sceneClock();
  yield clock.run(typed.durationSec);

  const layout = buildLayout(typed, frame, clock.seconds);
  for (const node of layout.nodes) {
    (context.layers.fore as Node).add(node);
  }
  if (layout.icon) {
    (context.layers.mid as Node).add(layout.icon);
  }

  const shape: StatPunchShape = {
    headline: typed.headline,
    endStillnessSec: typed.endStillnessSec,
    hasEyebrow: layout.eyebrow !== undefined,
    hasLabel: layout.label !== undefined,
    hasSupport: layout.support !== undefined,
    hasIcon: layout.icon !== undefined,
  };
  const overhead = statPunchOverheadSec(shape, isLast);
  const exitSec = exitSpanSec(statPunchNodeCount(shape));
  const entrancesSec = overhead - exitSec - (isLast ? motion.endCardSec : 0);

  // The pulse arrives here from the previous scene on the same track, at the
  // same height, and crosses once over the live part of the scene. It gives back
  // its own closing fade plus the end card so the track is gone before the
  // logomark rises (L9).
  const stillness = Math.max(MIN_STILLNESS_SEC, typed.durationSec - overhead);
  if (typed.pulse) {
    const pulse = travelingPulse({
      left: frame.textCenterX - frame.textWidth / 2,
      width: frame.textWidth,
      y: pulseTrackY(frame.contentBottom, frame.height),
      dotSize: Math.round(frame.headlineSize * 0.14),
    });
    (context.layers.back as Node).add(pulse.node);
    yield pulse.run([Math.max(0, entrancesSec + stillness - D.base)]);
  }

  if (layout.eyebrow) {
    yield* enterElement(layout.eyebrow, { dur: D.base });
  }

  if (layout.icon) {
    // Punctuation for the number, not a step of its own.
    yield enterElement(layout.icon, { dur: D.large, dy: 20 });
  }

  const { countFrom, countTo, prefix, suffix } = typed.stat;
  const scaleEase =
    typed.accentMoment === "overshoot" ? E.overshoot : E.entrance;
  if (countFrom !== undefined && countTo !== undefined) {
    // The counter is its own motion; it rises into place while it rolls.
    yield enterElement(layout.stat, { dur: D.large, dy: 24, scaleEase });
    yield* counterRoll(layout.stat, countFrom, countTo, {
      dur: D.large,
      prefix,
      suffix,
    });
  } else {
    yield* enterElement(layout.stat, {
      dur: D.large,
      dy: 24,
      // R-4: the once-per-video payoff overshoots on scale only. Position and
      // opacity stay on the standard entrance curve so nothing wobbles.
      scale: 0.9,
      scaleEase,
    });
  }

  if (layout.label) {
    yield* waitFor(STAGGER.tight);
    yield* enterElement(layout.label, { dur: D.base, dy: 20 });
  }

  yield* staggerWords(layout.words, { stagger: STAGGER.base });

  if (layout.support) {
    yield* waitFor(STAGGER.loose);
    yield* enterElement(layout.support, { dur: D.base });
  }

  // R-5: real stillness of the type. The ledger reserved the minimum, and every
  // second the scene has beyond its overhead is added to the hold rather than
  // left as dead air somewhere else. Only the type is still: the pulse, the
  // drifting stat lockup, and the breathing icon keep the frame alive.
  yield* holdStill(stillness);

  // Played out in full: the content must be gone before the logomark rises.
  const nodes = layout.icon ? [...layout.nodes, layout.icon] : layout.nodes;
  yield* exitGroup(nodes);

  const remaining = typed.durationSec - entrancesSec - stillness - exitSec;
  yield* runSceneEndCard(context, frame, remaining, isLast);
}

export default statPunch;
