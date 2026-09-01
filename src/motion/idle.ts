/**
 * Idle motion arithmetic: the maths behind "nothing is ever fully still".
 *
 * The reference piece this system is calibrated against never freezes a frame.
 * Elements arrive crisply and then keep a slow secondary motion - a chip orbits,
 * a shield breathes, a stat headline slides a hair sideways - so the composition
 * reads as alive rather than as a slide.
 *
 * Everything here is a pure function of a scene-relative time in seconds, so the
 * same frame index always produces the same offset. No clock, no randomness, no
 * DOM: the node-building half lives in `./living.ts` and the numbers are unit
 * tested under `node --test`.
 */

/** One slow elliptical idle path. */
export interface IdleSpec {
  /** Half-width of the ellipse in px. */
  readonly amplitudeX: number;
  /** Half-height of the ellipse in px. */
  readonly amplitudeY: number;
  /** Seconds for one full revolution. Always slow enough to read as drift. */
  readonly periodSec: number;
  /** Phase offset in radians, so sibling elements never move in lockstep. */
  readonly phase: number;
}

/**
 * Offset of an idling element at `seconds`, as `[dx, dy]` in px.
 *
 * A cosine on x and a sine on y traces an ellipse rather than a line, which is
 * what makes a labelled chip read as orbiting instead of sliding.
 */
export function idleOffsetAt(
  spec: IdleSpec,
  seconds: number,
): [number, number] {
  const theta = (2 * Math.PI * seconds) / spec.periodSec + spec.phase;
  return [spec.amplitudeX * Math.cos(theta), spec.amplitudeY * Math.sin(theta)];
}

/**
 * Orbit periods for the chip row, in seconds.
 *
 * Deliberately close together and deliberately not commensurate: three chips on
 * one period would pulse as a group, which reads as a loop. At these lengths the
 * composite pattern does not repeat inside any video this system renders.
 */
const CHIP_PERIODS_SEC = [6.7, 8.3, 9.9] as const;

/**
 * Idle path for the `index`th chip, sized against `unit` (the chip's own type
 * size).
 *
 * Amplitude is intentionally tiny - about a quarter of a cap height - because a
 * chip that travels far enough to notice is a chip competing with the headline.
 */
export function chipOrbit(index: number, unit: number): IdleSpec {
  const slot = index % CHIP_PERIODS_SEC.length;
  return {
    amplitudeX: unit * 0.22,
    amplitudeY: unit * 0.16,
    periodSec: CHIP_PERIODS_SEC[slot],
    phase: (2 * Math.PI * slot) / CHIP_PERIODS_SEC.length,
  };
}

/**
 * A one-sided lateral drift: always between 0 and `amplitude`, never negative.
 *
 * The stat lockup drifts on this rather than on a plain sinusoid for a safe-area
 * reason. The type column already starts on the 12% left margin (L5), so a
 * symmetric drift would carry the largest type in the system out through the
 * margin for half of every cycle. Raised cosine keeps the motion smooth, starts
 * and ends at rest, and only ever moves inward.
 */
export function driftInward(
  amplitude: number,
  periodSec: number,
  seconds: number,
): number {
  const theta = (2 * Math.PI * seconds) / periodSec;
  return amplitude * 0.5 * (1 - Math.cos(theta));
}

/**
 * A slow breathing scale multiplier centred on 1.
 *
 * Used by the `statPunch` icon so the shield keeps a pulse after it lands.
 * `depth` is a fraction, and 0.03 (3%) is the ceiling the design brief allows.
 */
export function breathAt(
  depth: number,
  periodSec: number,
  seconds: number,
): number {
  return 1 + depth * Math.sin((2 * Math.PI * seconds) / periodSec);
}

/**
 * Where the traveling-pulse track sits, in centre-origin y.
 *
 * The content band stops at 63% of frame height (L6) and everything below is
 * deliberately empty. The pulse lives in that empty band, low enough to read as
 * a separate register from the type and high enough to stay well clear of the
 * frame edge.
 */
export function pulseTrackY(contentBottom: number, height: number): number {
  const frameBottom = height / 2;
  return contentBottom + (frameBottom - contentBottom) * 0.42;
}

/**
 * Where a chip row sits, in centre-origin y: in the same empty band as the
 * pulse but above it, so the two motifs never collide.
 */
export function chipRowY(contentBottom: number, height: number): number {
  const frameBottom = height / 2;
  return contentBottom + (frameBottom - contentBottom) * 0.14;
}

