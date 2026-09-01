/**
 * `typeBeats` - staggered headline beats over the shared drifting ground.
 *
 * R-series choreography:
 *
 * - **R-1** each element rises 32px and scales 0.96 to 1 on `E.entrance`, with
 *   opacity finishing at 70% of the transform.
 * - **R-2** the headline reveals word by word at `STAGGER.base`, and the whole
 *   beat peels out in reversed order on `E.exit`, faster than it entered.
 * - **R-3** the next beat starts once the outgoing exit is 60% complete. There
 *   is no full frame cross dissolve; continuity is the persistent ground.
 * - **R-5** holds are the stillness, floored at `MIN_HOLD_SEC`.
 *
 * Timing is not invented here. `src/motion/timing.ts` is the single ledger the
 * plan schema also validates against, so a scene that parses always fits, and
 * the final beat's exit completes inside `durationSec` rather than bleeding into
 * the next scene or under the end card.
 *
 * The ground belongs to the composer (`sharedGround: true` in the registry), so
 * this generator only re-hues it, never creates or clocks it.
 *
 * Every node is absolutely positioned rather than parented to a flex container:
 * a layout child's `x`/`y` are computed by the layout engine, which would make a
 * transform entrance a no-op.
 */

import { Circle, Layout, type Node, Path, Rect, Txt } from "@revideo/2d";
import {
  waitFor,
  type SimpleSignal,
  type ThreadGenerator,
} from "@revideo/core";

import { motion, palette, typeScale, typeWeights } from "../brand/tokens";
import {
  crossOffset,
  delay,
  enterElement,
  exitGroup,
  holdStill,
  staggerWords,
} from "../motion/choreography";
import { chipRowY, pulseTrackY } from "../motion/idle";
import {
  buildChips,
  drawRule,
  sceneClock,
  travelingPulse,
} from "../motion/living";
import {
  beatEntranceSec,
  beatExitSec,
  beatSlotSec,
  distributeHolds,
  typeBeatsOverheadSec,
  type BeatShape,
} from "../motion/timing";
import { D, STAGGER } from "../motion/tokens";
import { fitMetric, fittedBlock, splitHeadline } from "../motion/textSplit";
import type { Beat as PlanBeat, TypeBeatsScene } from "../schemas/plan";

import { frameFor, type Frame } from "./sceneKit";
import { runSceneEndCard, smallTypeSize } from "./sharedGround";
import type { SceneContext } from "./registry";

/** Thin accent rule weight in px. The R-series calls for 2-3px hairlines. */
const RULE_WEIGHT = 3;

/** Width of a non-rule accent shape. */
function accentUnit(frame: Frame): number {
  return Math.round(frame.headlineSize * 0.7);
}

/**
 * How far the type column is indented so an accent can sit in the gutter beside
 * it.
 *
 * The gutter is carved out of the text column, never out of the 12% side margin:
 * `frame.textCenterX` already sits on the margin, so widening leftward would put
 * the accent outside the safe area. The indent is therefore the shape's own
 * width plus a hair of breathing room.
 */
function gutterIndent(
  frame: Frame,
  shape: NonNullable<PlanBeat["accent"]>["shape"],
): number {
  const clearance = Math.round(frame.headlineSize * 0.28);
  const width = shape === "rule" ? RULE_WEIGHT : accentUnit(frame);
  return width + clearance;
}

/** Standard vertical rhythm between blocks inside one beat. */
function blockGap(frame: Frame): number {
  return Math.round(frame.headlineSize * 0.34);
}

/** An accent, plus the axis it draws along when it is a rule. */
interface AccentBuild {
  readonly node: Layout;
  /**
   * Set for rules only. A rule extends itself along this axis on entry rather
   * than fading up in place, which is the difference between an underline that
   * appears and one that is drawn.
   */
  readonly ruleAxis?: "x" | "y";
}

/**
 * Build one accent shape.
 *
 * Shapes are drawn in the mid layer, in `palette.accent`, and are the only place
 * the violet is used. Path geometry is normalised to a unit box and scaled by
 * `scale`, not by `width`/`height`: a `Path` derives its bounding box from its
 * own data, so the size props set the layout box while leaving the drawn curve
 * at unit size, which renders a 120px icon as a 1px speck.
 */
function buildAccent(
  accent: NonNullable<PlanBeat["accent"]>,
  frame: Frame,
  columnLeft: number,
  columnWidth: number,
  headlineTop: number,
  headlineHeight: number,
  blockBottom: number,
): AccentBuild {
  const gap = blockGap(frame);
  const unit = accentUnit(frame);
  const shapeWidth = accent.shape === "rule" ? RULE_WEIGHT : unit;

  // Anchor point, in centre-origin coordinates, for the accent's own centre.
  let centerX = columnLeft + columnWidth * 0.15;
  let centerY = blockBottom + gap * 0.6;
  if (accent.anchor === "leftGutter") {
    // Sit flush against the safe-area edge the indent freed up, never past it.
    centerX = columnLeft - gutterIndent(frame, accent.shape) + shapeWidth / 2;
    centerY = headlineTop + headlineHeight / 2;
  } else if (accent.anchor === "rightEdge") {
    centerX = columnLeft + columnWidth - unit / 2;
    centerY = blockBottom + gap * 0.6 + unit / 2;
  }

  if (accent.shape === "rule") {
    const vertical = accent.anchor === "leftGutter";
    const width = vertical ? RULE_WEIGHT : Math.round(columnWidth * 0.3);
    const height = vertical ? Math.round(headlineHeight * 0.82) : RULE_WEIGHT;
    // A rule is anchored at the end it grows from, because `drawRule` scales it
    // along one axis: with the default centred offset the stroke would grow
    // outward from its own middle, which reads as a wipe from nowhere rather
    // than as a line being drawn.
    const rightAnchored = accent.anchor === "rightEdge";
    return {
      node: new Rect({
        x: vertical
          ? centerX
          : rightAnchored
            ? columnLeft + columnWidth
            : columnLeft,
        y: vertical ? headlineTop : centerY,
        offset: vertical ? [0, -1] : rightAnchored ? [1, 0] : [-1, 0],
        width,
        height,
        radius: RULE_WEIGHT / 2,
        fill: palette.accent,
        opacity: 0,
      }),
      ruleAxis: vertical ? "y" : "x",
    };
  }

  if (accent.shape === "dot") {
    const size = Math.round(frame.headlineSize * 0.22);
    return {
      node: new Circle({
        x: centerX,
        y: centerY + size / 2,
        width: size,
        height: size,
        fill: palette.accent,
        opacity: 0,
      }),
    };
  }

  const data =
    accent.shape === "bracket"
      ? "M 0.35 -0.5 L -0.45 -0.5 L -0.45 0.5 L 0.35 0.5"
      : "M -0.5 0.35 Q 0 -0.45 0.5 0.35";

  // The `scale` that sizes the path has to live on a node the entrance never
  // touches: `enterElement` tweens its target's scale channel to 1, which would
  // undo the sizing and collapse a 60px bracket to a 1px speck on the way in.
  // The wrapper takes the entrance; the `Path` inside it keeps the size.
  return {
    node: new Layout({
      x: centerX,
      y: centerY,
      opacity: 0,
      children: [
        new Path({
          scale: unit,
          data,
          stroke: palette.accent,
          // Stroke width is in the path's own unit space, so divide out the
          // scale to land on a real pixel weight.
          lineWidth: RULE_WEIGHT / unit,
          lineCap: "round",
          lineJoin: "round",
          fill: "transparent",
        }),
      ],
    }),
  };
}

interface PreparedBeat {
  /** Every node in the beat, in entrance order, for the reversed peel out. */
  readonly nodes: Layout[];
  readonly eyebrow?: Txt;
  readonly words: readonly Txt[];
  readonly support?: Txt;
  readonly accent?: Layout;
  readonly accentRuleAxis?: "x" | "y";
  /** Orbiting chips, in reading order. Empty when the beat carries none. */
  readonly chips: readonly Layout[];
  readonly shape: BeatShape;
}

function prepareBeat(
  beat: PlanBeat,
  eyebrowText: string | undefined,
  frame: Frame,
  clock: SimpleSignal<number>,
): PreparedBeat {
  const gap = blockGap(frame);
  const indent =
    beat.accent?.anchor === "leftGutter"
      ? gutterIndent(frame, beat.accent.shape)
      : 0;
  const columnLeft = frame.textCenterX - frame.textWidth / 2 + indent;
  const columnWidth = frame.textWidth - indent;

  const smallSize = smallTypeSize(frame);
  const eyebrowTracking = smallSize * typeScale.eyebrowTrackingEm;

  // Measure first, then place: the block is centred in the content band so a
  // two line beat and a four line beat both sit optically level, and the bottom
  // 37% of the frame stays empty (L6).
  const eyebrowFit = eyebrowText
    ? fitMetric(eyebrowText.toUpperCase(), {
        base: smallSize,
        min: smallSize,
        maxWidth: columnWidth,
        maxLines: 1,
        fontWeight: typeWeights.support,
        letterSpacing: eyebrowTracking,
      })
    : undefined;
  const headlineFit = fitMetric(beat.headline, {
    base: frame.headlineSize,
    min: frame.headlineMinSize,
    minIsAbsolute: true,
    maxWidth: columnWidth,
    fontWeight: typeWeights.headline,
  });
  const supportFit = beat.support
    ? fitMetric(beat.support, {
        base: smallSize,
        min: smallSize,
        maxWidth: columnWidth,
        maxLines: 2,
        fontWeight: typeWeights.support,
      })
    : undefined;

  const totalHeight =
    (eyebrowFit ? eyebrowFit.height + gap : 0) +
    headlineFit.height +
    (supportFit ? gap + supportFit.height : 0);
  const band = frame.contentBottom - frame.contentTop;
  let cursor = frame.contentTop + Math.max(0, (band - totalHeight) / 2);

  const nodes: Layout[] = [];

  let eyebrowNode: Txt | undefined;
  if (eyebrowText && eyebrowFit) {
    const built = fittedBlock(eyebrowText.toUpperCase(), columnLeft, cursor, {
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

  const headlineTop = cursor;
  const headline = splitHeadline(beat.headline, columnLeft, headlineTop, {
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
  if (beat.support && supportFit) {
    const built = fittedBlock(beat.support, columnLeft, cursor + gap, {
      base: smallSize,
      min: smallSize,
      maxWidth: columnWidth,
      maxLines: 2,
      fill: palette.tint,
      fontWeight: typeWeights.support,
    });
    supportNode = built.node;
    nodes.push(supportNode);
    cursor += gap + built.height;
  }

  let accentNode: Layout | undefined;
  let accentRuleAxis: "x" | "y" | undefined;
  if (beat.accent) {
    const built = buildAccent(
      beat.accent,
      frame,
      columnLeft,
      columnWidth,
      headlineTop,
      headline.height,
      cursor,
    );
    accentNode = built.node;
    accentRuleAxis = built.ruleAxis;
    nodes.push(accentNode);
  }

  // Chips live in the empty band under the content (L6), spread across the type
  // column. They arrive with the headline and then orbit, which is what turns
  // "Card, ACH, and cash together" from a claim into a picture of one.
  //
  // The floor they clear is the band's bottom edge or this beat's own bottom
  // edge, whichever is lower: a beat measuring taller than the band centres to
  // an overflow, and a chip stack budgeted against the nominal 63% line would
  // then be budgeted against a line the type has already crossed.
  const chips = beat.chips
    ? buildChips(
        beat.chips,
        {
          left: columnLeft,
          width: columnWidth,
          y: chipRowY(frame.contentBottom, frame.height),
          fontSize: smallSize,
          contentBottom: Math.max(frame.contentBottom, cursor),
          pulseTrackY: pulseTrackY(frame.contentBottom, frame.height),
        },
        clock,
      )
    : [];
  nodes.push(...chips);

  return {
    nodes,
    eyebrow: eyebrowNode,
    words: headline.words,
    support: supportNode,
    accent: accentNode,
    accentRuleAxis,
    chips,
    shape: {
      headline: beat.headline,
      holdSec: beat.holdSec,
      hasEyebrow: eyebrowNode !== undefined,
      hasSupport: supportNode !== undefined,
      hasAccent: accentNode !== undefined,
      chipCount: chips.length,
    },
  };
}

export function* typeBeats(context: SceneContext): ThreadGenerator {
  const scene = context.scene;
  if (scene.kind !== "typeBeats") {
    yield* waitFor(context.scene.durationSec);
    return;
  }

  const frame = context.frame ?? frameFor(context.ratio);
  const typed: TypeBeatsScene = scene;
  const isLast = context.isLast;

  // One clock for the whole scene, tweened linearly, drives every idle motion in
  // it. A signal rather than thread time so the chips' orbits are an ordinary
  // reactive dependency and recompute once per frame.
  const clock = sceneClock();
  yield clock.run(typed.durationSec);

  const prepared = typed.beats.map((beat, index) =>
    prepareBeat(
      beat,
      beat.eyebrow ?? (index === 0 ? typed.eyebrow : undefined),
      frame,
      clock.seconds,
    ),
  );
  for (const item of prepared) {
    const behind = new Set<Layout>([
      ...(item.accent ? [item.accent] : []),
      ...item.chips,
    ]);
    for (const node of item.nodes) {
      const target = behind.has(node)
        ? context.layers.mid
        : context.layers.fore;
      (target as Node).add(node);
    }
  }

  // The ledger the schema validated this plan against. `hasEyebrow` and friends
  // are read back off the prepared nodes, so the number computed here is the
  // number the beats below actually spend.
  const shapes = prepared.map((item) => item.shape);
  const overhead = typeBeatsOverheadSec(shapes, isLast);
  const holds = distributeHolds(
    shapes.map((shape) => shape.holdSec),
    typed.durationSec - overhead,
  );

  // The pulse crosses the track once per beat, each crossing lasting exactly
  // that beat's slot, so the dot arrives at the right edge as the beat hands
  // over. The slots come from the same ledger the loop below spends, so the
  // crossings can never drift out of step with the type.
  if (typed.pulse) {
    const slots = shapes.map((shape, index) =>
      beatSlotSec(shape, holds[index], index === shapes.length - 1),
    );
    // The pulse must be gone before the logomark rises (L9), and its own closing
    // fade costs `D.base`, so the last crossing gives that time back. Without
    // this the track would still be dissolving under the end card.
    const tail = (isLast ? motion.endCardSec : 0) + D.base;
    slots[slots.length - 1] = Math.max(0, slots[slots.length - 1] - tail);
    const pulse = travelingPulse({
      left: frame.textCenterX - frame.textWidth / 2,
      width: frame.textWidth,
      y: pulseTrackY(frame.contentBottom, frame.height),
      dotSize: Math.round(frame.headlineSize * 0.14),
    });
    (context.layers.back as Node).add(pulse.node);
    yield pulse.run(slots);
  }

  let spent = 0;
  for (const [index, item] of prepared.entries()) {
    const last = index === prepared.length - 1;

    if (typed.groundMotion === "shift" && context.ground) {
      // Re-hue on the beat boundary so the ground changes with the type rather
      // than on a schedule of its own (L7).
      yield context.ground.rehue(index, D.base);
    }

    if (item.eyebrow) {
      yield* enterElement(item.eyebrow, { dur: D.base });
    }
    if (item.accent) {
      // Runs alongside the headline; it is punctuation, not a step of its own.
      // A rule draws itself along its axis (R-1's transform, extended rather
      // than raised); every other shape takes the standard rise.
      yield delay(
        STAGGER.loose,
        item.accentRuleAxis
          ? drawRule(item.accent, item.accentRuleAxis, D.large)
          : enterElement(item.accent, { dur: D.base, dy: 16 }),
      );
    }

    if (item.chips.length > 0) {
      // Also alongside the headline, and also free of the budget: the chips are
      // a second reading of the same line, not a step after it.
      yield delay(
        STAGGER.loose,
        staggerWords(item.chips, { stagger: STAGGER.loose, dy: 14 }),
      );
    }

    // `beat.reveal` is 'word' by contract; the schema no longer offers the
    // deferred 'mask' and 'line' reveals.
    yield* staggerWords(item.words, { stagger: STAGGER.base });

    if (item.support) {
      yield* waitFor(STAGGER.loose);
      yield* enterElement(item.support, { dur: D.base });
    }
    spent += beatEntranceSec(item.shape);

    yield* holdStill(holds[index]);
    spent += holds[index];

    const exitSec = beatExitSec(item.shape);
    if (last) {
      // Nothing follows inside the scene, so the peel is played out in full:
      // an overlapping exit is what put live type under the logo end card.
      yield* exitGroup(item.nodes);
      spent += exitSec;
    } else {
      yield exitGroup(item.nodes);
      const lead = crossOffset(exitSec);
      yield* waitFor(lead);
      spent += lead;
    }
  }

  yield* runSceneEndCard(context, frame, typed.durationSec - spent, isLast);
}

export default typeBeats;
