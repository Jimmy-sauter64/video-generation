/**
 * Living elements: the node-building half of the idle-motion vocabulary.
 *
 * Three motifs live here, and between them they are the whole answer to "the
 * slides do not move":
 *
 * - **the traveling pulse** - one bright dot crossing a hairline track, once per
 *   beat, entering at the left edge and leaving at the right. It is the piece's
 *   connective tissue: payments as packets in motion, handed from beat to beat
 *   and from scene to scene.
 * - **orbiting chips** - small labelled pills that arrive with the headline and
 *   then keep a slow elliptical drift.
 * - **the drawn rule** - an accent rule that draws itself along its own axis
 *   instead of fading up in place.
 *
 * Every one of them is driven by a `sceneClock`, a plain signal tweened linearly
 * across the scene, so the motion is a pure function of scene time and two
 * renders of the same plan produce identical frames. The arithmetic itself is in
 * `./idle.ts`, which is unit tested.
 *
 * Idle motion is applied to an *inner* node, never to the node an entrance or
 * exit touches: `enterElement` tweens its target's `y`, `scale`, and `opacity`,
 * so a reactive position on the same node would fight the tween. The wrapper
 * takes the entrance; the child carries the drift.
 */

import { Circle, Layout, Rect, Txt } from "@revideo/2d";
import {
  all,
  createSignal,
  delay,
  linear,
  type SimpleSignal,
  type ThreadGenerator,
} from "@revideo/core";

import { fonts, palette, typeWeights } from "../brand/tokens";
import { layoutChips, type ChipRowGeometry } from "./chipLayout";
import { idleOffsetAt } from "./idle";
import { D, E } from "./tokens";

export type { ChipRowGeometry } from "./chipLayout";

/* ------------------------------------------------------------------ clock */

/** A scene-relative clock in seconds, readable from any reactive signal. */
export interface SceneClock {
  readonly seconds: SimpleSignal<number>;
  /**
   * Advance the clock over `durationSec`. `yield` this (not `yield*`) so it runs
   * alongside the scene rather than consuming its budget.
   */
  run(durationSec: number): ThreadGenerator;
}

export function sceneClock(): SceneClock {
  const seconds: SimpleSignal<number> = createSignal(0);
  return {
    seconds,
    *run(durationSec: number): ThreadGenerator {
      const span = Math.max(0, durationSec);
      yield* seconds(span, span, linear);
    },
  };
}

/* ------------------------------------------------------------ drawn rule */

/**
 * Draw a rule along its own axis rather than fading it up (R-1's entrance, with
 * the transform changed from a rise to an extension).
 *
 * The node must be anchored at the end the stroke grows from - `offset` of
 * `[-1, 0]` for a horizontal rule, `[0, -1]` for a vertical one - otherwise the
 * scale grows outward from the middle and reads as a wipe from nowhere.
 */
export function* drawRule(
  node: Layout,
  axis: "x" | "y",
  dur: number = D.base,
): ThreadGenerator {
  const channel = axis === "x" ? node.scale.x : node.scale.y;
  channel(0);
  yield* all(
    node.opacity(1, dur * 0.5, E.entrance),
    channel(1, dur, E.entrance),
  );
}

/* -------------------------------------------------------- traveling pulse */

/** Track weight in px. The R-series calls hairlines 2-3px. */
const TRACK_WEIGHT = 2;

/** Track opacity. Present, never a graphic element in its own right. */
const TRACK_OPACITY = 0.2;

export interface PulseGeometry {
  /** Left end of the track, centre-origin x. */
  readonly left: number;
  readonly width: number;
  /** Centre-origin y of the track. */
  readonly y: number;
  /** Diameter of the bright rider dot in px. */
  readonly dotSize: number;
}

export interface TravelingPulse {
  /** Add this to a layer behind the type. */
  readonly node: Layout;
  /**
   * Cross the track once per entry in `segmentsSec`, each crossing taking that
   * many seconds. Elapsed time is `sum(segmentsSec) + D.base` for the closing
   * fade, so callers size the segments against the time the scene has before its
   * end card. The last rider stays lit through the boundary and goes out with
   * the track in that closing fade, so the hairline is never on screen alone.
   * `yield` this, not `yield*`.
   */
  run(segmentsSec: readonly number[]): ThreadGenerator;
}

export function travelingPulse(geometry: PulseGeometry): TravelingPulse {
  const { left, width, y, dotSize } = geometry;

  // Position along the track, 0 at the left end and 1 at the right. A signal
  // rather than a tweened `x` so the glow and the dot share one source of truth.
  const travel: SimpleSignal<number> = createSignal(0);

  const track = new Rect({
    x: left,
    y,
    offset: [-1, 0],
    width,
    height: TRACK_WEIGHT,
    radius: TRACK_WEIGHT / 2,
    fill: palette.tint,
    opacity: TRACK_OPACITY,
  });
  track.scale.x(0);

  const rider = new Layout({
    x: () => left + travel() * width,
    y,
    opacity: 0,
    children: [
      new Circle({
        width: dotSize * 3,
        height: dotSize * 3,
        fill: palette.accent,
        opacity: 0.22,
      }),
      new Circle({ width: dotSize, height: dotSize, fill: palette.white }),
    ],
  });

  const node = new Layout({ opacity: 0, children: [track, rider] });

  return {
    node,
    *run(segmentsSec: readonly number[]): ThreadGenerator {
      // Both yielded, so the track finishes drawing itself underneath the first
      // crossing instead of delaying it.
      yield node.opacity(1, D.base, E.entrance);
      yield track.scale.x(1, D.large, E.entrance);

      // The final crossing is handled differently: its rider stays lit all the
      // way to the boundary and goes out with the track in the closing fade
      // below. Fading it on its own left `D.base` of bare hairline on screen
      // while the beat was still exiting - a track with nothing riding it,
      // which reads as a leftover rule rather than as the pulse handing over.
      const crossings = segmentsSec.filter((seconds) => seconds > 0);

      for (const [index, seconds] of crossings.entries()) {
        const last = index === crossings.length - 1;
        travel(0);
        rider.opacity(0);
        const fade = Math.min(D.base, seconds * 0.25);
        yield* all(
          travel(1, seconds, E.standard),
          rider.opacity(1, fade, E.entrance),
          ...(last
            ? []
            : [
                delay(
                  Math.max(0, seconds - fade),
                  rider.opacity(0, fade, E.exit),
                ),
              ]),
        );
      }

      yield* node.opacity(0, D.base, E.exit);
      node.remove();
    },
  };
}

/* ------------------------------------------------------------------ chips */

/**
 * Build one labelled chip per entry in `labels`, placed by `layoutChips` and
 * each orbiting on its own slow ellipse.
 *
 * All of the arithmetic - packing, wrapping, and the margin budget that has to
 * account for the orbit each pill swings through - lives in `./chipLayout.ts`,
 * where it is unit tested. This function is only the node building.
 *
 * Each chip is a wrapper `Layout` (which takes the entrance and the exit peel)
 * around a pill `Rect` (which carries the reactive orbit). Chips are returned in
 * reading order; the caller adds them to a layer behind the type and includes
 * them in the beat's exit group.
 */
export function buildChips(
  labels: readonly string[],
  geometry: ChipRowGeometry,
  clock: SimpleSignal<number>,
): Layout[] {
  const layout = layoutChips(labels, geometry);

  return layout.chips.map((chip) => {
    const pill = new Rect({
      width: chip.width,
      height: chip.height,
      radius: Math.round(chip.height / 2),
      stroke: palette.accent,
      lineWidth: 2,
      // The orbit lives here, on the child the entrance never touches.
      position: () => idleOffsetAt(chip.orbit, clock()),
      children: [
        new Txt({
          text: chip.text,
          fill: palette.tint,
          fontFamily: fonts.display.fallback,
          fontSize: layout.fontSize,
          fontWeight: typeWeights.support,
          letterSpacing: layout.tracking,
          textWrap: false,
        }),
      ],
    });

    return new Layout({
      x: chip.x,
      y: chip.y,
      opacity: 0,
      children: [pill],
    });
  });
}
