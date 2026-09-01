/**
 * Chip-row arithmetic: where a row of labelled pills sits, and how wide it is
 * once every pill is swinging through its own orbit.
 *
 * This is the pure half of `buildChips` in `./living.ts`, split out for the same
 * reason `./idle.ts` is split out: it is the part that can be wrong by a
 * measurable number of pixels, so it is the part that is unit tested.
 *
 * The law it exists to keep is L5, the 12% side margins. A chip row that is
 * merely packed to the type column is *not* inside the margins, because the
 * chips do not stay where they are packed: every pill carries a `chipOrbit`,
 * whose x amplitude is added to the resting box on both sides. Budgeting the
 * resting bounds alone let the leftmost 4:5 chip reach x = -421.1 against a
 * -410 margin, and let a 9:16 row overrun to x = 599.5. The layout here budgets
 * the *animated envelope* — resting bounds plus orbit amplitude — and reports
 * `minX`/`maxX` so a test can assert the whole envelope, not the rest pose.
 *
 * When the measured labels cannot fit that budget on one line the row wraps
 * deterministically (greedy, in reading order) and the stack is centred on the
 * row's optical centre. Only if a single pill is still wider than the budget
 * does the type size come down, one pixel at a time: the side margin is a hard
 * style law, the small-type floor is a QA preference, and a pill through the
 * margin is the worse failure of the two. The schema's 14-character, two-word
 * chip cap keeps real copy far away from that last resort.
 *
 * The same argument runs vertically. A wrapped stack centred on the chip row's
 * y is not contained by anything: on 9:16 the two-row envelope measured 141.2
 * to 508.7 against a content band that ends at 249.6, so the stack's top edge
 * climbed ~108px into the type. `ChipRowGeometry` therefore carries the band's
 * bottom edge and the pulse track's y, and the stack is budgeted into the empty
 * band between them — envelope again, not rest pose: row extent plus the
 * alternating lift plus each pill's vertical orbit amplitude.
 *
 * When that envelope will not fit, it shrinks in a fixed order: the inter-row
 * gap comes down to `CHIP_ROW_GAP_MIN_EM`, then the type comes down a pixel at a
 * time to `MIN_CHIP_FONT_SIZE`, then the stack is forced onto one row at the
 * tightest padding. Two tradeoffs are deliberate. The content band outranks the
 * pulse track: when nothing fits, the stack is anchored under the band's
 * clearance and the overrun is allowed to hang toward the track, because
 * colliding with the type is the worse failure. And the margin law outranks the
 * vertical budget in turn — the forced single row is only taken if its
 * horizontal envelope still clears the margins.
 */

import { typeScale, typeWeights } from "../brand/tokens";

import { chipOrbit, type IdleSpec } from "./idle";
import { measureText } from "./textMetrics";

/**
 * Chip tracking, in ems.
 *
 * Deliberately looser than body copy and much tighter than the eyebrow's. The
 * eyebrow's 0.27em is affordable on one line of the frame; on three pills at the
 * small-type floor it adds ~150px of pure air and is the difference between a
 * row that fits the type column and one whose pills collide.
 */
const CHIP_TRACKING_EM = 0.08;

/** Horizontal padding inside a chip, and the gap between chips, in ems. */
const CHIP_PAD_X_EM = 0.55;
const CHIP_GAP_EM = 0.55;

/** Vertical padding inside a chip, in ems. */
const CHIP_PAD_Y_EM = 0.34;

/** Vertical gap between stacked chip rows, in ems. */
const CHIP_ROW_GAP_EM = 0.3;

/** Tightest that gap may be squeezed before the type size comes down. */
const CHIP_ROW_GAP_MIN_EM = 0.12;

/**
 * Baseline step applied to alternating chips, in ems.
 *
 * Under a third of a chip height, so the pills still read as one line, and part
 * of the vertical envelope the band budget has to hold.
 */
const CHIP_LIFT_EM = 0.28;

/**
 * Clearance the stack keeps below the content band's bottom edge, in ems.
 *
 * Exported so the containment test asserts against the same number the layout
 * places against rather than a copy of it.
 */
export const CHIP_BAND_CLEARANCE_EM = 0.2;

/** Smallest type size the last-resort shrink may reach. */
const MIN_CHIP_FONT_SIZE = 12;

/** Slack allowed when comparing a measured edge against a budget, in px. */
const EDGE_EPSILON = 1e-9;

export interface ChipRowGeometry {
  /** Left edge of the column the chips are spread across, centre-origin x. */
  readonly left: number;
  readonly width: number;
  /** Centre-origin y of the row's optical centre. */
  readonly y: number;
  /** Type size inside the chip. Always the frame's small-type floor. */
  readonly fontSize: number;
  /**
   * The lowest edge the stack must stay below: the content band's bottom (L6),
   * or the beat block's own bottom when a tall beat has overflowed the band.
   */
  readonly contentBottom: number;
  /** Centre-origin y of the traveling-pulse track: the stack's soft floor. */
  readonly pulseTrackY: number;
}

/** One pill, placed. Positions are centre-origin centres, as Revideo wants. */
export interface PlacedChip {
  /** The label as it is set: upper case. */
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly orbit: IdleSpec;
}

export interface ChipLayout {
  /** Chips in reading order. */
  readonly chips: readonly PlacedChip[];
  /** The size the chips were actually set at; normally `geometry.fontSize`. */
  readonly fontSize: number;
  /** Letter spacing in px at `fontSize`. */
  readonly tracking: number;
  readonly rowCount: number;
  /** Leftmost x any chip reaches at any point in its orbit. */
  readonly minX: number;
  /** Rightmost x any chip reaches at any point in its orbit. */
  readonly maxX: number;
  /** Topmost y any chip reaches at any point in its orbit. */
  readonly minY: number;
  /** Bottommost y any chip reaches at any point in its orbit. */
  readonly maxY: number;
}

/** Greedy packing of `widths` into rows no wider than `available`. */
function packRows(
  widths: readonly number[],
  gap: number,
  available: number,
): number[][] {
  const rows: number[][] = [];
  let current: number[] = [];
  let used = 0;

  widths.forEach((chipWidth, index) => {
    const cost = current.length === 0 ? chipWidth : gap + chipWidth;
    // A row always takes at least one chip, so an over-wide pill gets its own
    // line rather than an empty one above it.
    if (current.length > 0 && used + cost > available) {
      rows.push(current);
      current = [index];
      used = chipWidth;
      return;
    }
    current.push(index);
    used += cost;
  });

  if (current.length > 0) {
    rows.push(current);
  }
  return rows;
}

function rowWidthOf(
  row: readonly number[],
  widths: readonly number[],
  gap: number,
): number {
  return (
    row.reduce((sum, index) => sum + widths[index], 0) +
    gap * Math.max(0, row.length - 1)
  );
}

/** One rung of the deterministic shrink ladder. */
interface SolveOptions {
  readonly fontSize: number;
  /** Inter-row gap in ems; the first thing the vertical budget squeezes. */
  readonly rowGapEm: number;
  /** Force every pill onto one row at the tightest padding: the last rung. */
  readonly singleRow: boolean;
}

/**
 * Solve the chip row at one rung of the ladder.
 *
 * Padding shrinks toward `CHIP_PAD_X_EM / 2` while it is what keeps the row off
 * one line; beyond that the row wraps. Both are preferred to shrinking the type,
 * which the caller only reaches for when a single pill will not fit at all.
 */
function solveAt(
  texts: readonly string[],
  geometry: ChipRowGeometry,
  { fontSize, rowGapEm, singleRow }: SolveOptions,
): ChipLayout {
  const { left, width, y } = geometry;
  const tracking = fontSize * CHIP_TRACKING_EM;
  const textWidths = texts.map((text) =>
    measureText(text, fontSize, typeWeights.support, tracking),
  );
  const orbits = texts.map((_, index) => chipOrbit(index, fontSize));

  // The full animated envelope, not the rest pose: a chip is as wide as its box
  // plus the orbit it swings through on either side of it (L5).
  const maxOrbitX = orbits.reduce(
    (widest, orbit) => Math.max(widest, orbit.amplitudeX),
    0,
  );
  const available = Math.max(1, width - maxOrbitX * 2);
  const gap = fontSize * CHIP_GAP_EM;

  const widthsAt = (padX: number): number[] =>
    textWidths.map((textWidth) => Math.round(textWidth + padX * 2));

  const minPadX = fontSize * (CHIP_PAD_X_EM / 2);
  let padX = singleRow ? minPadX : fontSize * CHIP_PAD_X_EM;
  while (
    padX > minPadX &&
    packRows(widthsAt(padX), gap, available).length > 1
  ) {
    padX = Math.max(minPadX, padX - 1);
  }

  const chipWidths = widthsAt(padX);
  const rows = singleRow
    ? [texts.map((_, index) => index)]
    : packRows(chipWidths, gap, available);

  const chipHeight = Math.round(
    fontSize * typeScale.lineHeight + fontSize * CHIP_PAD_Y_EM * 2,
  );
  const rowGap = Math.round(fontSize * rowGapEm);
  const blockHeight =
    rows.length * chipHeight + Math.max(0, rows.length - 1) * rowGap;

  // The vertical envelope, the mirror of the horizontal one: the block plus the
  // alternating lift plus the orbit each pill swings through above and below it.
  const lift = fontSize * CHIP_LIFT_EM;
  const maxOrbitY = orbits.reduce(
    (tallest, orbit) => Math.max(tallest, orbit.amplitudeY),
    0,
  );
  const halfEnvelope = blockHeight / 2 + lift + maxOrbitY;
  // Sit on the row's optical centre when the band allows it, and slide into the
  // band when it does not. The clearance under the content band is the floor of
  // the two clamps, so an envelope too tall for the band overruns toward the
  // pulse track rather than back up into the type.
  const bandTop = geometry.contentBottom + fontSize * CHIP_BAND_CLEARANCE_EM;
  const centerY = Math.max(
    bandTop + halfEnvelope,
    Math.min(geometry.pulseTrackY - halfEnvelope, y),
  );
  const blockTop = centerY - blockHeight / 2;

  const placed: PlacedChip[] = new Array<PlacedChip>(texts.length);
  rows.forEach((row, rowIndex) => {
    const rowY = blockTop + chipHeight / 2 + rowIndex * (chipHeight + rowGap);
    const rowWidth = rowWidthOf(row, chipWidths, gap);
    // Centre the packed row inside the orbit-inset column. Even spacing across
    // the full column looks correct on paper and is wrong in practice: chip
    // widths differ, so equal *centres* give unequal gaps, and the widest pair
    // overlaps while the narrowest pair floats apart.
    let cursor = left + maxOrbitX + Math.max(0, (available - rowWidth) / 2);

    for (const index of row) {
      const chipWidth = chipWidths[index];
      // Step the baseline so the row reads as a scatter of nodes rather than as
      // a segmented control. The step is under a third of a chip height, so the
      // pills stay visibly on one line.
      const step = (index % 2 === 0 ? -1 : 1) * lift;
      placed[index] = {
        text: texts[index],
        x: cursor + chipWidth / 2,
        y: rowY + step,
        width: chipWidth,
        height: chipHeight,
        orbit: orbits[index],
      };
      cursor += chipWidth + gap;
    }
  });

  const minX = placed.reduce(
    (edge, chip) =>
      Math.min(edge, chip.x - chip.width / 2 - chip.orbit.amplitudeX),
    Number.POSITIVE_INFINITY,
  );
  const maxX = placed.reduce(
    (edge, chip) =>
      Math.max(edge, chip.x + chip.width / 2 + chip.orbit.amplitudeX),
    Number.NEGATIVE_INFINITY,
  );

  return {
    chips: placed,
    fontSize,
    tracking,
    rowCount: rows.length,
    minX,
    maxX,
    minY: centerY - halfEnvelope,
    maxY: centerY + halfEnvelope,
  };
}

/**
 * Place `labels` as a chip row inside `geometry`, guaranteeing that the animated
 * envelope stays inside `[left, left + width]` horizontally and, wherever the
 * band allows it, inside `(contentBottom, pulseTrackY)` vertically.
 *
 * Labels are set in caps. Chips come back in reading order, so the caller can
 * add them to the beat's exit group unchanged.
 */
export function layoutChips(
  labels: readonly string[],
  geometry: ChipRowGeometry,
): ChipLayout {
  const texts = labels.map((label) => label.toUpperCase());
  if (texts.length === 0) {
    const empty = geometry.contentBottom;
    return {
      chips: [],
      fontSize: geometry.fontSize,
      tracking: geometry.fontSize * CHIP_TRACKING_EM,
      rowCount: 0,
      minX: geometry.left,
      maxX: geometry.left + geometry.width,
      minY: empty,
      maxY: empty,
    };
  }

  const right = geometry.left + geometry.width;
  const fitsAcross = (layout: ChipLayout): boolean =>
    layout.minX >= geometry.left - EDGE_EPSILON &&
    layout.maxX <= right + EDGE_EPSILON;
  // `solveAt` already pins the top edge under the band's clearance, so the only
  // vertical budget that can still be missed is the pulse track below.
  const fitsDown = (layout: ChipLayout): boolean =>
    layout.maxY <= geometry.pulseTrackY + EDGE_EPSILON;

  let fontSize = geometry.fontSize;
  let rowGapEm = CHIP_ROW_GAP_EM;
  let layout = solveAt(texts, geometry, {
    fontSize,
    rowGapEm,
    singleRow: false,
  });

  // Rung one: close the gap between stacked rows, which costs nothing but air.
  if (!fitsDown(layout)) {
    rowGapEm = CHIP_ROW_GAP_MIN_EM;
    layout = solveAt(texts, geometry, { fontSize, rowGapEm, singleRow: false });
  }

  // Rung two, and the only rung the horizontal budget uses: come down a pixel at
  // a time. Smaller type is narrower as well as shorter, so this rung often
  // unwraps the stack on its own.
  while (
    fontSize > MIN_CHIP_FONT_SIZE &&
    (!fitsAcross(layout) || !fitsDown(layout))
  ) {
    fontSize -= 1;
    layout = solveAt(texts, geometry, { fontSize, rowGapEm, singleRow: false });
  }

  // Rung three: one row at the tightest padding, taken only if it still clears
  // the side margins - L5 outranks the band budget the same way it outranks the
  // small-type floor.
  if (!fitsDown(layout)) {
    const single = solveAt(texts, geometry, {
      fontSize,
      rowGapEm,
      singleRow: true,
    });
    if (fitsAcross(single) && single.maxY < layout.maxY) {
      layout = single;
    }
  }
  return layout;
}
