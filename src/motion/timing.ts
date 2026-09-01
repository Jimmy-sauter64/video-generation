/**
 * The timing ledger: one arithmetic model of what a scene's motion costs.
 *
 * The problem this solves is a split brain. The plan schema used to allow a flat
 * 0.7s of motion per beat while the generators actually spent an entrance, a
 * stagger proportional to the word count, and an exit, so a schema-valid plan
 * could overrun its own `durationSec` and bleed motion across the scene
 * boundary. Everything here is a pure function of data the plan already carries,
 * which lets `src/schemas/plan.ts` and the generators in `src/scenes/` compute
 * the identical number: the schema rejects what the generators cannot fit, and
 * the generators never have to invent a budget of their own.
 *
 * Nothing in this module reads the clock, the DOM, or the font. Word counts come
 * from the plan text, and every duration comes from `./tokens`.
 */

import { motion } from "../brand/tokens";
import { D, OVERLAP, STAGGER } from "./tokens";

/**
 * Floor a beat hold may be rescaled to. It matches `beat.holdSec`'s schema
 * minimum, so a plan that validates never has a hold squeezed below the value
 * its author asked for and the reader still gets time to read the line.
 */
export const MIN_HOLD_SEC = 2;

/**
 * Terminal stillness every scene must end with (R-5). `MIN_HOLD_SEC` is larger,
 * so a `typeBeats` scene satisfies this through its final hold.
 */
export const MIN_STILLNESS_SEC = 0.8;

/** Words in a headline, which is exactly the node count `splitHeadline` produces. */
export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/u).length;
}

/**
 * Wall time a `sequence` of `count` equal-length tasks occupies.
 *
 * `sequence` waits one further `stagger` after starting the final task before
 * joining, so a run of very short tasks is bounded below by `count * stagger`.
 */
function staggeredSpan(count: number, dur: number, stagger: number): number {
  return count <= 0
    ? 0
    : Math.max(count * stagger, dur + (count - 1) * stagger);
}

/** Wall time the per-word headline reveal occupies. */
export function staggerSpanSec(
  count: number,
  dur: number = D.quick,
  stagger: number = STAGGER.base,
): number {
  return staggeredSpan(count, dur, stagger);
}

/** Wall time the reversed peel-out of `count` nodes occupies. */
export function exitSpanSec(
  count: number,
  dur: number = D.quick,
  stagger: number = STAGGER.tight,
): number {
  return staggeredSpan(count, dur, stagger);
}

/** When the incoming beat may start, given the outgoing exit's span (R-3). */
export function crossOffsetSec(exitSpan: number): number {
  return exitSpan * OVERLAP;
}

/* --------------------------------------------------------------- typeBeats */

/** The shape of one beat, reduced to what its timing depends on. */
export interface BeatShape {
  readonly headline: string;
  readonly holdSec: number;
  readonly hasEyebrow: boolean;
  readonly hasSupport: boolean;
  readonly hasAccent: boolean;
  /**
   * Labelled orbiting chips on this beat. They enter alongside the headline, so
   * like the accent they cost no entrance time, but they are real nodes and the
   * reversed peel-out has to move every one of them.
   */
  readonly chipCount: number;
}

/** Nodes a beat puts on screen, which is what its exit peel has to move. */
export function beatNodeCount(beat: BeatShape): number {
  return (
    (beat.hasEyebrow ? 1 : 0) +
    countWords(beat.headline) +
    (beat.hasSupport ? 1 : 0) +
    (beat.hasAccent ? 1 : 0) +
    beat.chipCount
  );
}

/**
 * Entrance cost of one beat: the eyebrow, then the staggered headline, then the
 * support line after a `STAGGER.loose` breath. The accent enters alongside the
 * headline and therefore costs nothing.
 */
export function beatEntranceSec(beat: BeatShape): number {
  return (
    (beat.hasEyebrow ? D.base : 0) +
    staggerSpanSec(countWords(beat.headline)) +
    (beat.hasSupport ? STAGGER.loose + D.base : 0)
  );
}

/** Exit cost of one beat. */
export function beatExitSec(beat: BeatShape): number {
  return exitSpanSec(beatNodeCount(beat));
}

/**
 * Wall time one beat occupies inside the scene: its entrance, its hold, and the
 * share of its exit that is not overlapped by the next beat (R-3).
 *
 * This is exactly what the generator's own running total advances by, and it is
 * what the traveling pulse is handed so one crossing lines up with one beat.
 */
export function beatSlotSec(
  beat: BeatShape,
  holdSec: number,
  isFinalBeat: boolean,
): number {
  const exit = beatExitSec(beat);
  return (
    beatEntranceSec(beat) +
    holdSec +
    (isFinalBeat ? exit : crossOffsetSec(exit))
  );
}

/**
 * Motion overhead of a `typeBeats` scene: everything except the holds.
 *
 * Beats overlap, so an intermediate beat only owns `crossOffsetSec` of its exit
 * and the rest runs under the next beat's entrance (R-3). The final beat is the
 * exception: its exit is charged in full, because nothing follows it inside the
 * scene and letting it bleed past `durationSec` would drag motion into the next
 * scene or under the end card.
 */
export function typeBeatsOverheadSec(
  beats: readonly BeatShape[],
  isLast: boolean,
): number {
  if (beats.length === 0) {
    return isLast ? motion.endCardSec : 0;
  }
  const entrances = beats.reduce((sum, beat) => sum + beatEntranceSec(beat), 0);
  const crosses = beats
    .slice(0, -1)
    .reduce((sum, beat) => sum + crossOffsetSec(beatExitSec(beat)), 0);
  const finalExit = beatExitSec(beats[beats.length - 1]);
  return entrances + crosses + finalExit + (isLast ? motion.endCardSec : 0);
}

/** Smallest `durationSec` a `typeBeats` scene can be rendered in. */
export function typeBeatsRequiredSec(
  beats: readonly BeatShape[],
  isLast: boolean,
): number {
  const holds = beats.reduce(
    (sum, beat) => sum + Math.max(beat.holdSec, MIN_HOLD_SEC),
    0,
  );
  return typeBeatsOverheadSec(beats, isLast) + holds;
}

/* -------------------------------------------------------------- statPunch */

/** The shape of a `statPunch` scene, reduced to what its timing depends on. */
export interface StatPunchShape {
  readonly headline: string;
  readonly endStillnessSec: number;
  readonly hasEyebrow: boolean;
  readonly hasLabel: boolean;
  readonly hasSupport: boolean;
  readonly hasIcon: boolean;
}

/** Nodes a `statPunch` scene puts on screen, including the stat value itself. */
export function statPunchNodeCount(scene: StatPunchShape): number {
  return (
    (scene.hasEyebrow ? 1 : 0) +
    1 +
    (scene.hasLabel ? 1 : 0) +
    countWords(scene.headline) +
    (scene.hasSupport ? 1 : 0) +
    (scene.hasIcon ? 1 : 0)
  );
}

/**
 * Motion overhead of a `statPunch` scene: everything except the held stillness.
 *
 * The exit is always charged in full. A `statPunch` is normally the last scene,
 * and its content has to be off screen before the logo end card comes up: an
 * overlapping exit is what put the logomark on top of live headline type.
 */
export function statPunchOverheadSec(
  scene: StatPunchShape,
  isLast: boolean,
): number {
  const entrances =
    (scene.hasEyebrow ? D.base : 0) +
    D.large +
    (scene.hasLabel ? STAGGER.tight + D.base : 0) +
    staggerSpanSec(countWords(scene.headline)) +
    (scene.hasSupport ? STAGGER.loose + D.base : 0);
  return (
    entrances +
    exitSpanSec(statPunchNodeCount(scene)) +
    (isLast ? motion.endCardSec : 0)
  );
}

/** Smallest `durationSec` a `statPunch` scene can be rendered in. */
export function statPunchRequiredSec(
  scene: StatPunchShape,
  isLast: boolean,
): number {
  return (
    statPunchOverheadSec(scene, isLast) +
    Math.max(scene.endStillnessSec, MIN_STILLNESS_SEC)
  );
}

/* ------------------------------------------------------------ hold fitting */

/**
 * Spread `budget` across the beat holds, keeping their relative rhythm.
 *
 * Called with a budget the schema has already guaranteed is at least
 * `MIN_HOLD_SEC * beats.length`, so the floor below never has to steal time it
 * does not have. The residue lands on the last hold so the holds sum to the
 * budget exactly and the scene ends on its stated duration.
 */
export function distributeHolds(
  planned: readonly number[],
  budget: number,
): number[] {
  if (planned.length === 0) {
    return [];
  }
  const safeBudget = Math.max(0, budget);
  const floor = Math.min(MIN_HOLD_SEC, safeBudget / planned.length);
  const total = planned.reduce((sum, hold) => sum + hold, 0);

  const holds =
    total > 0
      ? planned.map((hold) => (hold / total) * safeBudget)
      : planned.map(() => safeBudget / planned.length);

  // Lift every hold to the floor, then take the time back from whatever is
  // above the floor, in proportion, so the rhythm survives the correction.
  let debt = 0;
  for (let index = 0; index < holds.length; index += 1) {
    if (holds[index] < floor) {
      debt += floor - holds[index];
      holds[index] = floor;
    }
  }
  if (debt > 0) {
    const slack = holds.reduce(
      (sum, hold) => sum + Math.max(0, hold - floor),
      0,
    );
    if (slack > 0) {
      const ratio = Math.max(0, (slack - debt) / slack);
      for (let index = 0; index < holds.length; index += 1) {
        holds[index] = floor + (holds[index] - floor) * ratio;
      }
    }
  }

  const residue = safeBudget - holds.reduce((sum, hold) => sum + hold, 0);
  holds[holds.length - 1] = Math.max(0, holds[holds.length - 1] + residue);
  return holds;
}
