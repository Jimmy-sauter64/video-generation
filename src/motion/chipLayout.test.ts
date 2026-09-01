import assert from "node:assert/strict";
import test from "node:test";

import {
  contentBottomOfHeight,
  safeAreas,
  textColumnOfWidth,
  typeScale,
  typeWeights,
} from "../brand/tokens";

import {
  CHIP_BAND_CLEARANCE_EM,
  layoutChips,
  type ChipRowGeometry,
} from "./chipLayout";
import { chipRowY, pulseTrackY } from "./idle";
import {
  fitMetric,
  headlineMinSizeFor,
  headlineSizeFor,
  smallTypeSizeFor,
} from "./textMetrics";

type Ratio = keyof typeof safeAreas;

/** The margin interval L5 keeps clear, plus the chip geometry inside it. */
function frameFixture(ratio: Ratio): {
  geometry: ChipRowGeometry;
  safeLeft: number;
  safeRight: number;
} {
  const { width, height, margins } = safeAreas[ratio];
  const safeWidth = width - margins.left - margins.right;
  const textWidth = Math.min(safeWidth, width * textColumnOfWidth);
  const textCenterX = -width / 2 + margins.left + textWidth / 2;
  const contentBottom = -height / 2 + height * contentBottomOfHeight;
  const headlineSize = headlineSizeFor(width, height);

  return {
    geometry: {
      left: textCenterX - textWidth / 2,
      width: textWidth,
      y: chipRowY(contentBottom, height),
      fontSize: smallTypeSizeFor(headlineSize, height),
      contentBottom,
      pulseTrackY: pulseTrackY(contentBottom, height),
    },
    safeLeft: -width / 2 + margins.left,
    safeRight: width / 2 - margins.right,
  };
}

/**
 * Bottom edge of the tallest beat block the schema can produce, measured the way
 * `prepareBeat` measures it: an eyebrow at the 24 character cap, a headline of
 * eight long words fitted against the column, and a two line support block, all
 * centred in the content band.
 *
 * The chips have to clear this, not a number typed into the test: the whole
 * point of the band budget is that it holds for the worst legal beat.
 */
function tallestBeatBottom(ratio: Ratio): number {
  const { width, height, margins } = safeAreas[ratio];
  const safeWidth = width - margins.left - margins.right;
  const columnWidth = Math.min(safeWidth, width * textColumnOfWidth);
  const contentTop = -height / 2 + margins.top;
  const contentBottom = -height / 2 + height * contentBottomOfHeight;
  const headlineSize = headlineSizeFor(width, height);
  const smallSize = smallTypeSizeFor(headlineSize, height);
  const gap = Math.round(headlineSize * 0.34);

  const eyebrow = fitMetric("PAYMENT OPERATIONS TODAY", {
    base: smallSize,
    min: smallSize,
    maxWidth: columnWidth,
    maxLines: 1,
    fontWeight: typeWeights.support,
    letterSpacing: smallSize * typeScale.eyebrowTrackingEm,
  });
  // Eight words, the schema's ceiling, each as long as the copy ever runs.
  const headline = fitMetric(
    "Reconciliation reconciliation reconciliation reconciliation reconciliation reconciliation reconciliation reconciliation",
    {
      base: headlineSize,
      min: headlineMinSizeFor(width, height),
      minIsAbsolute: true,
      maxWidth: columnWidth,
      fontWeight: typeWeights.headline,
    },
  );
  // Fourteen words, the support ceiling, which the fitter caps at two lines.
  const support = fitMetric(
    "Every payment every payout every refund every dispute reconciled in one ledger daily",
    {
      base: smallSize,
      min: smallSize,
      maxWidth: columnWidth,
      maxLines: 2,
      fontWeight: typeWeights.support,
    },
  );

  const totalHeight =
    eyebrow.height + gap + headline.height + gap + support.height;
  const band = contentBottom - contentTop;
  return contentTop + Math.max(0, (band - totalHeight) / 2) + totalHeight;
}

const RATIOS: Ratio[] = ["4x5", "9x16"];

/** Every label set the schema will hand `layoutChips`, worst cases included. */
const LABEL_SETS: readonly (readonly string[])[] = [
  ["Card"],
  ["Card", "ACH"],
  ["Card", "ACH", "Cash"],
  // 14 characters, the schema's ceiling, three times over.
  ["Reconciliation", "Reconciliation", "Reconciliation"],
  // The widest 14 characters the font can set: no real copy looks like this,
  // but the envelope must hold for it too.
  ["WWWWWWWWWWWWWW", "WWWWWWWWWWWWWW", "WWWWWWWWWWWWWW"],
];

test("the chip envelope stays inside the side margins on both ratios", () => {
  for (const ratio of RATIOS) {
    const { geometry, safeLeft, safeRight } = frameFixture(ratio);
    for (const labels of LABEL_SETS) {
      const layout = layoutChips(labels, geometry);
      assert.ok(
        layout.minX >= safeLeft - 1e-9,
        `${ratio} ${labels.length}x"${labels[0]}": minX ${layout.minX} is left of ${safeLeft}`,
      );
      assert.ok(
        layout.maxX <= safeRight + 1e-9,
        `${ratio} ${labels.length}x"${labels[0]}": maxX ${layout.maxX} is right of ${safeRight}`,
      );
    }
  }
});

test("the envelope budgets the orbit, not just the resting box", () => {
  for (const ratio of RATIOS) {
    const { geometry } = frameFixture(ratio);
    const layout = layoutChips(["Card", "ACH", "Cash"], geometry);
    const restingLeft = layout.chips.reduce(
      (edge, chip) => Math.min(edge, chip.x - chip.width / 2),
      Number.POSITIVE_INFINITY,
    );
    // The resting box sits strictly inside the reported envelope, which is the
    // whole point: the pre-fix layout put this edge on the margin itself.
    assert.ok(
      restingLeft - layout.minX > 0,
      `${ratio}: envelope ${layout.minX} did not clear resting edge ${restingLeft}`,
    );
    assert.ok(layout.minX >= geometry.left - 1e-9);
  }
});

test("a row that cannot fit one line wraps instead of overrunning", () => {
  const { geometry } = frameFixture("9x16");
  const single = layoutChips(["Card"], geometry);
  assert.equal(single.rowCount, 1);

  // Three chips at the schema's 14 character ceiling cannot share a line at any
  // size the shrink ladder will reach, so this set wraps whatever the budget.
  const wrapped = layoutChips(
    ["Reconciliation", "Reconciliation", "Reconciliation"],
    geometry,
  );
  assert.ok(
    wrapped.rowCount > 1,
    "three 14 character 9:16 chips do not fit one line",
  );
  const rows = new Set(wrapped.chips.map((chip) => Math.round(chip.y / 10)));
  assert.ok(rows.size > 1, "wrapped chips must sit on different baselines");
});

test("the chip stack stays inside the band under the content on both ratios", () => {
  for (const ratio of RATIOS) {
    const { geometry } = frameFixture(ratio);
    for (const labels of LABEL_SETS) {
      const layout = layoutChips(labels, geometry);
      const label = `${ratio} ${labels.length}x"${labels[0]}"`;
      // The clearance is measured at the size the stack was actually set at,
      // which is never larger than the size it was asked for.
      assert.ok(
        layout.minY >=
          geometry.contentBottom +
            layout.fontSize * CHIP_BAND_CLEARANCE_EM -
            1e-9,
        `${label}: stack top ${layout.minY} is above ${geometry.contentBottom} + clearance`,
      );
      assert.ok(
        layout.maxY <= geometry.pulseTrackY + 1e-9,
        `${label}: stack bottom ${layout.maxY} is below the pulse track ${geometry.pulseTrackY}`,
      );
    }
  }
});

test("the vertical envelope budgets the orbit, not just the row boxes", () => {
  for (const ratio of RATIOS) {
    const { geometry } = frameFixture(ratio);
    const layout = layoutChips(["Card", "ACH", "Cash"], geometry);
    const restingTop = layout.chips.reduce(
      (edge, chip) => Math.min(edge, chip.y - chip.height / 2),
      Number.POSITIVE_INFINITY,
    );
    const restingBottom = layout.chips.reduce(
      (edge, chip) => Math.max(edge, chip.y + chip.height / 2),
      Number.NEGATIVE_INFINITY,
    );
    assert.ok(
      restingTop - layout.minY > 0 && layout.maxY - restingBottom > 0,
      `${ratio}: envelope ${layout.minY}..${layout.maxY} did not clear the resting rows ${restingTop}..${restingBottom}`,
    );
  }
});

test("the stack clears the tallest beat the schema allows", () => {
  for (const ratio of RATIOS) {
    const { geometry } = frameFixture(ratio);
    // What `prepareBeat` hands `buildChips` for a beat that overflows the band.
    const floor = Math.max(geometry.contentBottom, tallestBeatBottom(ratio));
    const tall: ChipRowGeometry = { ...geometry, contentBottom: floor };
    for (const labels of LABEL_SETS) {
      const layout = layoutChips(labels, tall);
      const label = `${ratio} tall beat ${labels.length}x"${labels[0]}"`;
      assert.ok(
        floor > geometry.contentBottom,
        `${ratio}: the tallest legal beat must actually overflow the band`,
      );
      assert.ok(
        layout.minY >= floor + layout.fontSize * CHIP_BAND_CLEARANCE_EM - 1e-9,
        `${label}: stack top ${layout.minY} crowds the beat block ending at ${floor}`,
      );
      assert.ok(
        layout.maxY <= tall.pulseTrackY + 1e-9,
        `${label}: stack bottom ${layout.maxY} is below the pulse track ${tall.pulseTrackY}`,
      );
    }
  }
});

test("layout is deterministic and keeps reading order", () => {
  const { geometry } = frameFixture("4x5");
  const labels = ["Card", "ACH", "Cash"];
  const first = layoutChips(labels, geometry);
  const second = layoutChips(labels, geometry);
  assert.deepEqual(first, second);
  assert.deepEqual(
    first.chips.map((chip) => chip.text),
    ["CARD", "ACH", "CASH"],
  );
});

test("an empty label list places nothing", () => {
  const { geometry } = frameFixture("4x5");
  assert.deepEqual(layoutChips([], geometry).chips, []);
});
