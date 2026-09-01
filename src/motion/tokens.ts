/**
 * Motion tokens for the fresh visual system.
 *
 * These implement the R-series laws in `docs/style/exemplar-analysis.md`:
 * durations, stagger steps, beat overlap, and the seven named easing curves.
 * Nothing here reads wall-clock time or randomness; every value is a constant
 * so two renders of the same plan produce the same frames.
 */

import type { TimingFunction } from "@revideo/core";

/**
 * Named durations in seconds.
 *
 * `micro` and `quick` are the exit and per-word register, `base` the standard
 * element entrance, `large` the payoff entrance (counter rolls, stat values),
 * and `scene` the longest single gesture a scene may spend.
 */
export const D = {
  micro: 0.15,
  quick: 0.25,
  base: 0.4,
  large: 0.6,
  scene: 0.8,
} as const;

/**
 * Stagger steps in seconds (R-2). `base` is the default for headline words,
 * `tight` for dense groups and every exit, `loose` for the gap between two
 * distinct blocks such as a headline and its support line.
 */
export const STAGGER = {
  tight: 0.05,
  base: 0.08,
  loose: 0.14,
} as const;

/**
 * Fraction of an outgoing exit that must elapse before the incoming beat may
 * start (R-3). Full frame cross dissolves are banned; the overlap plus the
 * persistent ground carry continuity instead.
 */
export const OVERLAP = 0.6;

function mapRange(from: number, to: number, value: number): number {
  return from + (to - from) * value;
}

/** Clamp to [0, 1], mapping a non-finite input to 0 rather than propagating NaN. */
export function clampUnit(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return value <= 0 ? 0 : value >= 1 ? 1 : value;
}

/**
 * Build a Revideo `TimingFunction` from a CSS style cubic bezier.
 *
 * `@revideo/core` ships named easings but no bezier factory, so the curve is
 * evaluated here. `x(t)` is inverted with a fixed five step Newton Raphson
 * iteration seeded at `t = x`; the iteration count is fixed rather than
 * tolerance driven so the result is bit identical on every render. The input is
 * clamped to [0, 1] but the output is not, which is what lets the overshoot
 * curve travel past 1 before settling.
 */
export function cubicBezier(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): TimingFunction {
  // The x control points must stay inside the unit interval. Outside it the
  // curve is no longer a function of x (it doubles back), the Newton Raphson
  // inversion below stops converging, and the easing silently animates
  // backwards. y is deliberately left unclamped: values above 1 are what make
  // the overshoot curve overshoot.
  x1 = clampUnit(x1);
  x2 = clampUnit(x2);

  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  const sampleX = (t: number): number => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number): number => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number): number => (3 * ax * t + 2 * bx) * t + cx;

  const solveT = (x: number): number => {
    let t = x;
    for (let iteration = 0; iteration < 5; iteration += 1) {
      const slope = slopeX(t);
      if (slope === 0) {
        break;
      }
      t -= (sampleX(t) - x) / slope;
    }
    return t;
  };

  return (value: number, from = 0, to = 1): number =>
    mapRange(from, to, sampleY(solveT(clampUnit(value))));
}

/**
 * The easing vocabulary.
 *
 * `entrance` and `exit` are the R-1 and R-2 curves verbatim. `overshoot` is the
 * R-4 payoff curve and must appear at most once per video; the plan schema
 * enforces that by allowing a single `accentMoment: "overshoot"` scene.
 */
export const E = {
  entrance: cubicBezier(0.16, 1, 0.3, 1),
  exit: cubicBezier(0.55, 0, 1, 0.45),
  standard: cubicBezier(0.2, 0, 0, 1),
  decel: cubicBezier(0.05, 0.7, 0.1, 1),
  accel: cubicBezier(0.3, 0, 0.8, 0.15),
  overshoot: cubicBezier(0.34, 1.56, 0.64, 1),
  counter: cubicBezier(0.25, 1, 0.3, 1),
} as const;
