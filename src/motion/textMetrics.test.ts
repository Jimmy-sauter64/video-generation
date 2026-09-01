/**
 * Placement contract for the per-word headline reveal.
 *
 * These tests replay the exact arithmetic `splitHeadline` performs (advance,
 * plus one space, per word) and assert the two properties the rendered frames
 * caught the estimate-based version violating: words must never collide, and a
 * line must never cross the text column, which sits inside the 12% side margins.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { typeScale, typeWeights } from "../brand/tokens";
import {
  CAP_HEIGHT_RATIO,
  SMALL_TYPE_CAP_FRACTION,
  SOFT_HYPHEN,
  fitMetric,
  fitSingleLine,
  headlineMinSizeFor,
  headlineSizeFor,
  measureText,
  smallTypeSizeFor,
  spaceWidth,
} from "./textMetrics";

/** The two shipped frames, from `safeAreas` and `frameFor`. */
const FRAMES = [
  { ratio: "4x5", width: 1080, height: 1350 },
  { ratio: "9x16", width: 1080, height: 1920 },
].map((frame) => ({
  ...frame,
  // frameFor: min(safe width, 70% of width) with 12% side margins.
  textWidth: Math.min(frame.width - 130 - 130, frame.width * 0.7),
  headlineSize: headlineSizeFor(frame.width, frame.height),
  headlineMinSize: headlineMinSizeFor(frame.width, frame.height),
}));

/** Undo the soft break so a wrapped block can be compared with its source. */
const rejoin = (lines: readonly string[]): string =>
  lines.join(" ").split(`${SOFT_HYPHEN} `).join("");

interface Placement {
  readonly line: string;
  readonly lineWidth: number;
  readonly minGap: number;
}

/** Lay a fitted block out exactly as `splitHeadline` does and report the geometry. */
function place(
  text: string,
  options: {
    base: number;
    min: number;
    minIsAbsolute?: boolean;
    maxWidth: number;
    maxLines?: number;
    fontWeight: number;
    letterSpacing?: number;
  },
): { fontSize: number; lines: readonly string[]; placements: Placement[] } {
  const fitted = fitMetric(text, options);
  const { fontWeight, letterSpacing = 0 } = options;
  const gap = spaceWidth(fitted.fontSize, fontWeight, letterSpacing);

  const placements = fitted.lines.map((line) => {
    const words = line.split(" ").filter((word) => word.length > 0);
    let cursor = 0;
    let previousEnd = Number.NEGATIVE_INFINITY;
    let minGap = Number.POSITIVE_INFINITY;
    for (const word of words) {
      if (Number.isFinite(previousEnd)) {
        minGap = Math.min(minGap, cursor - previousEnd);
      }
      const width = measureText(
        word,
        fitted.fontSize,
        fontWeight,
        letterSpacing,
      );
      previousEnd = cursor + width;
      cursor += width + gap;
    }
    return { line, lineWidth: Math.max(0, cursor - gap), minGap };
  });

  return { fontSize: fitted.fontSize, lines: fitted.lines, placements };
}

/**
 * Headlines spanning the schema's range: 2 to 8 words, narrow and wide glyph
 * mixes, and the 28 character word that the old character-count wrapper treated
 * as its ceiling.
 */
const HEADLINES = [
  "A gateway is not a strategy",
  "Payments are part of the product experience",
  "Card, ACH, and cash together",
  "Do you own your payments experience?",
  "Do you own it",
  "It is till fill jill lift till",
  "Warm women wove modern mall webs",
  "Reconciliationreportingandmerchant hierarchy across every merchant account",
  "Interoperabilityreconciliation matters",
  "Reconciliation transparency accountability interoperability merchandising infrastructure orchestration settlements",
  "A b c d e f g h",
];

test("headline words never collide and never leave the text column", () => {
  const collisions: string[] = [];
  const overflows: string[] = [];

  for (const frame of FRAMES) {
    for (const headline of HEADLINES) {
      const { placements, fontSize } = place(headline, {
        base: frame.headlineSize,
        min: frame.headlineMinSize,
        minIsAbsolute: true,
        maxWidth: frame.textWidth,
        fontWeight: typeWeights.headline,
      });
      const gap = spaceWidth(fontSize, typeWeights.headline);

      for (const placement of placements) {
        if (
          Number.isFinite(placement.minGap) &&
          placement.minGap < gap - 1e-6
        ) {
          collisions.push(
            `${frame.ratio} "${placement.line}" gap ${placement.minGap.toFixed(2)} < ${gap.toFixed(2)}`,
          );
        }
        if (placement.lineWidth > frame.textWidth + 1e-6) {
          overflows.push(
            `${frame.ratio} "${placement.line}" ${placement.lineWidth.toFixed(1)}px in ${frame.textWidth.toFixed(1)}px`,
          );
        }
      }
    }
  }

  assert.deepEqual(collisions, []);
  assert.deepEqual(overflows, []);
});

test("fitting never drops a word", () => {
  const lost: string[] = [];
  for (const frame of FRAMES) {
    for (const headline of HEADLINES) {
      const fitted = fitMetric(headline, {
        base: frame.headlineSize,
        min: frame.headlineMinSize,
        minIsAbsolute: true,
        maxWidth: frame.textWidth,
        fontWeight: typeWeights.headline,
      });
      if (rejoin(fitted.lines) !== headline) {
        lost.push(`${frame.ratio} "${rejoin(fitted.lines)}" != "${headline}"`);
      }
    }
  }
  assert.deepEqual(lost, []);
});

test("a multi-word stat value keeps every word on one line", () => {
  // "PCI Level 1" rendered as "PCI": the character-count fitter could not reach
  // one line, so it wrapped at the floor size and clipped to the line budget.
  const frame = FRAMES[0];
  for (const value of ["PCI Level 1", "100%", "$1.2M", "99.99% SLA"]) {
    const size = fitSingleLine(
      value,
      Math.round(frame.width * 0.17),
      frame.textWidth,
      typeWeights.headline,
    );
    const fitted = fitMetric(value, {
      base: size,
      min: size,
      maxWidth: frame.textWidth,
      maxLines: 1,
      fontWeight: typeWeights.headline,
    });
    assert.deepEqual(fitted.lines, [value]);
    assert.ok(
      measureText(value, size, typeWeights.headline) <= frame.textWidth,
      `${value} at ${size}px exceeds the column`,
    );
  }
});

test("a support line keeps its trailing word", () => {
  // The beat 3 support line lost its final "in." to the same clipping path.
  const frame = FRAMES[0];
  const text = "Reconciliation, reporting, and merchant hierarchy built in.";
  const size = smallTypeSizeFor(frame.headlineSize, frame.height);
  const fitted = fitMetric(text, {
    base: size,
    min: size,
    maxWidth: frame.textWidth,
    maxLines: 2,
    fontWeight: typeWeights.support,
  });
  assert.equal(fitted.lines.join(" "), text);
});

test("small type clears the frame QA cap-height floor in every ratio", () => {
  // qa-frames.ts fails a frame whose shortest text block is under 3% of frame
  // height. A caps eyebrow renders exactly its cap height, so that is the bound.
  //
  // Checking only 4:5 hid a real failure: the QA bar is a fraction of frame
  // height, so 9:16 needs a larger block than 4:5 at the same width, and the
  // headline-relative ceiling used to clamp it back to 62px, a 2.33% cap
  // height against a 3% bar.
  for (const frame of FRAMES) {
    const size = smallTypeSizeFor(frame.headlineSize, frame.height);
    const capPercent = ((size * CAP_HEIGHT_RATIO) / frame.height) * 100;

    assert.ok(
      capPercent >= SMALL_TYPE_CAP_FRACTION * 100 - 1e-9,
      `${frame.ratio} small type cap height is ${capPercent.toFixed(2)}% of frame height`,
    );
    assert.ok(
      capPercent >= 3,
      `${frame.ratio}: ${capPercent.toFixed(2)}% is under the 3% QA floor`,
    );
    // Still subordinate to the headline it sits under.
    assert.ok(
      size < frame.headlineSize,
      `${frame.ratio}: ${size}px is not smaller than the ${frame.headlineSize}px headline`,
    );
  }
});

test("a fitted headline clears the frame QA cap-height floor in every ratio", () => {
  // The same 3% bar qa-frames.ts applies to the shortest block on the frame.
  // The fitter used to treat `min` as advisory and shrink to 55% of it, which
  // set the eight word 9:16 headline at 52px, a 1.95% cap height. Long copy now
  // spends lines instead of points.
  const undersized: string[] = [];
  for (const frame of FRAMES) {
    for (const headline of HEADLINES) {
      const fitted = fitMetric(headline, {
        base: frame.headlineSize,
        min: frame.headlineMinSize,
        minIsAbsolute: true,
        maxWidth: frame.textWidth,
        fontWeight: typeWeights.headline,
      });
      const capPercent =
        ((fitted.fontSize * CAP_HEIGHT_RATIO) / frame.height) * 100;
      if (capPercent < 3) {
        undersized.push(
          `${frame.ratio} "${headline}" at ${fitted.fontSize}px is ${capPercent.toFixed(2)}% of frame height`,
        );
      }
    }
  }
  assert.deepEqual(undersized, []);
});

test("the eight-word 9:16 headline is set at or above the QA floor", () => {
  const frame = FRAMES[1];
  const headline = HEADLINES[9];
  const fitted = fitMetric(headline, {
    base: frame.headlineSize,
    min: frame.headlineMinSize,
    minIsAbsolute: true,
    maxWidth: frame.textWidth,
    fontWeight: typeWeights.headline,
  });
  const capPercent =
    ((fitted.fontSize * CAP_HEIGHT_RATIO) / frame.height) * 100;

  assert.ok(
    fitted.fontSize >= frame.headlineMinSize,
    `${fitted.fontSize}px is below the ${frame.headlineMinSize}px floor`,
  );
  assert.ok(
    capPercent >= 3,
    `${capPercent.toFixed(2)}% is under the 3% QA floor`,
  );
  // The floor is bought with lines, not with lost words.
  assert.equal(rejoin(fitted.lines), headline);
});

test("an unbreakable token is soft-broken instead of leaving the column", () => {
  // The schema caps a headline by word count, not by token length, so a valid
  // plan can carry a 40 character word. At the fitter's hard floor that measures
  // ~1,120px against a 756px column and used to be placed whole, straight
  // through the 12% side margin.
  const token = "A".repeat(40);
  const text = `Own ${token} today`;

  for (const frame of FRAMES) {
    const fitted = fitMetric(text, {
      base: frame.headlineSize,
      min: frame.headlineMinSize,
      minIsAbsolute: true,
      maxWidth: frame.textWidth,
      fontWeight: typeWeights.headline,
    });

    for (const line of fitted.lines) {
      const width = measureText(line, fitted.fontSize, typeWeights.headline);
      assert.ok(
        width <= frame.textWidth + 1e-6,
        `${frame.ratio} "${line}" is ${width.toFixed(1)}px in a ${frame.textWidth.toFixed(1)}px column`,
      );
    }
    assert.equal(rejoin(fitted.lines), text);
  }
});

test("soft-breaking leaves a token that already fits alone", () => {
  const frame = FRAMES[0];
  const fitted = fitMetric("A gateway is not a strategy", {
    base: frame.headlineSize,
    min: frame.headlineMinSize,
    minIsAbsolute: true,
    maxWidth: frame.textWidth,
    fontWeight: typeWeights.headline,
  });
  assert.ok(
    !fitted.lines.some((line) => line.endsWith(SOFT_HYPHEN)),
    `ordinary copy was hyphenated: ${fitted.lines.join(" / ")}`,
  );
});

test("measured advances match the independently measured render", () => {
  // sceneKit records "become your roadmap" spanning 770px at 72px, measured on a
  // rendered 4:5 frame. The table has to agree with the renderer, not just with
  // itself.
  const width = measureText("become your roadmap", 72, typeWeights.headline);
  assert.ok(
    Math.abs(width - 770) / 770 < 0.01,
    `table says ${width.toFixed(1)}px against a measured 770px`,
  );
});

test("line height stays on the brand ratio", () => {
  const fitted = fitMetric("A gateway is not a strategy", {
    base: 86,
    min: 65,
    maxWidth: 756,
    fontWeight: typeWeights.headline,
  });
  assert.equal(
    fitted.height,
    fitted.lines.length * fitted.fontSize * typeScale.lineHeight,
  );
});
