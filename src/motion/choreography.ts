/**
 * Choreography helpers: the generator level vocabulary every fresh-system scene
 * animates through.
 *
 * Each helper implements one R-series law and nothing else, so a scene reads as
 * a sequence of named gestures rather than a pile of tweens. Nodes handed to
 * these helpers must be absolutely positioned (never children of a `layout`
 * container): a layout child's `x`/`y` are computed by the layout engine, so a
 * transform entrance on one silently does nothing.
 */

import type { Layout, Txt } from "@revideo/2d";
import {
  all,
  delay,
  sequence,
  tween,
  waitFor,
  type ThreadGenerator,
} from "@revideo/core";
import type { TimingFunction } from "@revideo/core";

import { crossOffsetSec, exitSpanSec, staggerSpanSec } from "./timing";
import { D, E, STAGGER } from "./tokens";

export interface EnterOptions {
  /** Distance in px the node rises through. Never more than 15% of frame height (R-1). */
  readonly dy?: number;
  /** Starting scale. Never 0 (R-1). */
  readonly scale?: number;
  /** Transform duration in seconds; opacity finishes at 70% of it. */
  readonly dur?: number;
  /**
   * Easing for the scale channel only. Defaults to the entrance curve; the
   * one payoff moment per video passes `E.overshoot` here (R-4).
   */
  readonly scaleEase?: TimingFunction;
}

/**
 * The standard entrance (R-1): transform and opacity together, opacity first.
 *
 * The node is expected to already sit at its resting position with opacity 0.
 * It is pushed `dy` below and scaled down, then eased back on `E.entrance` over
 * `dur`, while opacity runs the same curve over `dur * 0.7` so the element is
 * fully solid before it stops moving. Total elapsed time is exactly `dur`.
 */
export function* enterElement(
  node: Layout,
  options: EnterOptions = {},
): ThreadGenerator {
  const {
    dy = 32,
    scale = 0.96,
    dur = D.base,
    scaleEase = E.entrance,
  } = options;

  const restY = node.y();
  node.y(restY + dy);
  node.scale(scale);
  node.opacity(0);

  yield* all(
    node.y(restY, dur, E.entrance),
    node.scale(1, dur, scaleEase),
    node.opacity(1, dur * 0.7, E.entrance),
  );
}

export interface ExitOptions {
  /** Distance in px the group lifts as it leaves. Negative rises (R-2). */
  readonly dy?: number;
  readonly dur?: number;
  readonly stagger?: number;
}

/**
 * Peel a group off the screen (R-2): reversed order, faster than it entered.
 *
 * Reversing means the element that arrived last leaves first, which reads as the
 * group peeling rather than dissolving. Nodes are removed once their tween ends.
 * Elapsed time is `dur + (nodes.length - 1) * stagger`; see `exitDuration`.
 */
export function* exitGroup(
  nodes: readonly Layout[],
  options: ExitOptions = {},
): ThreadGenerator {
  const { dy = -20, dur = D.quick, stagger = STAGGER.tight } = options;
  if (nodes.length === 0) {
    return;
  }

  const reversed = [...nodes].reverse();
  yield* sequence(stagger, ...reversed.map((node) => leaveOne(node, dy, dur)));
}

function* leaveOne(node: Layout, dy: number, dur: number): ThreadGenerator {
  const restY = node.y();
  yield* all(node.y(restY + dy, dur, E.exit), node.opacity(0, dur, E.exit));
  node.remove();
}

/**
 * Wall time an `exitGroup` with these settings occupies.
 *
 * Delegates to the timing ledger so the generators and the plan schema agree to
 * the millisecond about what an exit costs.
 */
export function exitDuration(
  count: number,
  dur: number = D.quick,
  stagger: number = STAGGER.tight,
): number {
  return exitSpanSec(count, dur, stagger);
}

export interface StaggerOptions {
  readonly stagger?: number;
  readonly dy?: number;
  readonly dur?: number;
}

/**
 * Per element entrance with a constant offset between starts (R-2).
 *
 * Used for the per-word headline reveal. Elapsed time is
 * `dur + (nodes.length - 1) * stagger`; see `staggerDuration`.
 */
export function* staggerWords(
  nodes: readonly Layout[],
  options: StaggerOptions = {},
): ThreadGenerator {
  const { stagger = STAGGER.base, dy = 18, dur = D.quick } = options;
  if (nodes.length === 0) {
    return;
  }

  yield* sequence(
    stagger,
    ...nodes.map((node) => enterElement(node, { dy, dur })),
  );
}

/** Wall time a `staggerWords` run with these settings occupies. */
export function staggerDuration(
  count: number,
  dur: number = D.quick,
  stagger: number = STAGGER.base,
): number {
  return staggerSpanSec(count, dur, stagger);
}

export interface CounterOptions {
  readonly dur?: number;
  readonly prefix?: string;
  readonly suffix?: string;
}

/**
 * Roll an integer counter from `from` to `to` on `E.counter`.
 *
 * The displayed value is always an integer, so the text never flickers through
 * a fractional frame. Callers should size the node against the final string
 * (`prefix + to + suffix`) so the type does not resize mid roll.
 */
export function* counterRoll(
  txtNode: Txt,
  from: number,
  to: number,
  options: CounterOptions = {},
): ThreadGenerator {
  const { dur = D.large, prefix = "", suffix = "" } = options;
  const start = Math.round(from);
  const end = Math.round(to);

  txtNode.text(`${prefix}${start}${suffix}`);
  yield* tween(dur, (value) => {
    const eased = E.counter(value);
    const current = Math.round(start + (end - start) * eased);
    txtNode.text(`${prefix}${current}${suffix}`);
  });
  txtNode.text(`${prefix}${end}${suffix}`);
}

/**
 * Hold the frame still for `sec` seconds (R-5). An alias for `waitFor` that
 * names the intent at the call site: every scene must end with real stillness.
 */
export function* holdStill(sec: number): ThreadGenerator {
  yield* waitFor(Math.max(0, sec));
}

/**
 * When the incoming beat may start, given the outgoing exit's duration (R-3).
 *
 * The next beat begins once the exit is 60% complete, so the two overlap
 * without either being legible on top of the other.
 */
export function crossOffset(outDur: number): number {
  return crossOffsetSec(outDur);
}

/** Re-exported so scenes can compose delayed gestures without a second import. */
export { delay };
