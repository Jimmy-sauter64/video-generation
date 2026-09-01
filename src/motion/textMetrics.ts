/**
 * Metric-accurate text measurement and wrapping. Pure arithmetic: no DOM, no
 * `@revideo/2d`, no clock.
 *
 * The per-word headline reveal (R-2) needs every word to be an independently
 * transformable node, which rules out a flex container: a layout child's `x`/`y`
 * are computed by the layout engine, so a transform entrance on one is silently
 * a no-op. Each word is therefore positioned by arithmetic, and that arithmetic
 * has to match what the font actually draws.
 *
 * The first pass estimated every glyph at one average advance. That is adequate
 * for choosing a line break and wrong for placing a word: the error is per
 * character and signed, so it compounds along a line. Narrow words closed their
 * gap to zero ("Doyou", "Paymentsare") and wide ones ran past the column.
 * Advances now come from `instrument-metrics.json`, generated from the vendored
 * font files by `scripts/build-font-metrics.py` and checked in. That keeps
 * placement exact and still deterministic: no `measureText`, whose advances
 * differ before and after the webfont loads, and therefore no chance of two
 * renders of one plan disagreeing.
 *
 * Wrapping lives here too rather than reusing `sceneKit.fitText`. `fitText`
 * wraps by character count against a 28-character cap and, when the text will
 * not fit its line budget, clips the overflow. That silently dropped real copy:
 * "PCI Level 1" rendered as "PCI", and a support line lost its trailing "in.".
 * Here a block that will not fit is made smaller, never shorter. `fitText` is
 * left untouched for the legacy `hookStat` and `kenBurnsStory` templates.
 *
 * Keeping this module free of `@revideo/2d` is deliberate: it is what lets
 * `textMetrics.test.ts` assert real spacing and column containment under
 * `node --test`, where the browser bundle cannot be loaded.
 */

import { typeScale } from "../brand/tokens";
import metrics from "./instrument-metrics.json";

type WeightKey = keyof typeof metrics.weights;
type WeightTable = (typeof metrics.weights)[WeightKey];

/** Cap height as a fraction of font size, from the vendored font's OS/2 table. */
export const CAP_HEIGHT_RATIO = metrics.capHeight;

function weightTable(fontWeight: number): WeightTable {
  const key = String(fontWeight) as WeightKey;
  return metrics.weights[key] ?? metrics.weights["600"];
}

/** Advance width of one character, in em. */
function advanceOf(char: string, table: WeightTable): number {
  if (char === " ") {
    return table.space;
  }
  const advances = table.advances as Record<string, number>;
  return advances[char] ?? table.fallback;
}

/** Width of `text` at `fontSize`, in px. */
export function measureText(
  text: string,
  fontSize: number,
  fontWeight: number,
  letterSpacing = 0,
): number {
  const table = weightTable(fontWeight);
  let em = 0;
  let glyphs = 0;
  for (const char of text) {
    em += advanceOf(char, table);
    glyphs += 1;
  }
  // Tracking adds one gap after every glyph, including the last; that trailing
  // gap is real width the renderer reserves, so it is counted.
  return em * fontSize + letterSpacing * glyphs;
}

/** Width of the space that separates two words, in px. */
export function spaceWidth(
  fontSize: number,
  fontWeight: number,
  letterSpacing = 0,
): number {
  return weightTable(fontWeight).space * fontSize + letterSpacing;
}

/* ------------------------------------------------------------------ wrapping */

/** Marker appended to every soft-break chunk except the last. */
export const SOFT_HYPHEN = "-";

/**
 * Split a token that is wider than the column into chunks that are not.
 *
 * The fitter shrinks rather than breaks, and it only reaches here when even the
 * absolute floor size cannot fit the token: a single 40 character word measures
 * ~1,120px against a 756px column, and the last-resort wrap used to place it
 * whole, straight through the 12% side margin. The schema caps headlines by word
 * count, not by token length, so this is reachable from a valid plan.
 *
 * The split is deterministic (greedy, left to right, by measured advance) and
 * each chunk but the last ends in a visible hyphen, so the break reads as
 * typography rather than as a typo. A token that already fits is returned
 * unchanged, which is every real case.
 */
function softBreak(
  word: string,
  fontSize: number,
  fontWeight: number,
  maxWidth: number,
  letterSpacing: number,
): string[] {
  if (measureText(word, fontSize, fontWeight, letterSpacing) <= maxWidth) {
    return [word];
  }

  const chunks: string[] = [];
  let current = "";
  for (const char of word) {
    const candidate = `${current}${char}`;
    const width = measureText(
      `${candidate}${SOFT_HYPHEN}`,
      fontSize,
      fontWeight,
      letterSpacing,
    );
    if (current.length > 0 && width > maxWidth) {
      chunks.push(`${current}${SOFT_HYPHEN}`);
      current = char;
    } else {
      current = candidate;
    }
  }
  if (current.length > 0) {
    chunks.push(current);
  }
  return chunks;
}

/**
 * Greedy wrap by measured width. Never drops a word; a word wider than the
 * column gets a line to itself and the caller shrinks the type. Only the
 * last-resort pass passes `breakLongWords`, once shrinking has been exhausted.
 */
function greedyWrap(
  words: readonly string[],
  fontSize: number,
  fontWeight: number,
  maxWidth: number,
  letterSpacing: number,
  breakLongWords = false,
): string[] {
  const lines: string[] = [];
  let current = "";
  const source = breakLongWords
    ? words.flatMap((word) =>
        softBreak(word, fontSize, fontWeight, maxWidth, letterSpacing),
      )
    : words;
  for (const word of source) {
    const candidate = current.length === 0 ? word : `${current} ${word}`;
    if (
      current.length === 0 ||
      measureText(candidate, fontSize, fontWeight, letterSpacing) <= maxWidth
    ) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current.length > 0) {
    lines.push(current);
  }
  return lines;
}

/** Widest single word, in px. A block cannot be set narrower than this. */
function widestWord(
  words: readonly string[],
  fontSize: number,
  fontWeight: number,
  letterSpacing: number,
): number {
  return words.reduce(
    (widest, word) =>
      Math.max(widest, measureText(word, fontSize, fontWeight, letterSpacing)),
    0,
  );
}

/** Steps the balance search takes between the widest word and the full column. */
const BALANCE_STEPS = 24;

/**
 * Wrap into the fewest lines the column allows, then even those lines out.
 *
 * Evenness is not cosmetic: a greedy wrap at full column width produces a long
 * first line and a two word orphan, which is the "dense, not editorial" look the
 * exemplar analysis flags. Re-wrapping at progressively narrower widths and
 * keeping the narrowest that still hits the minimum line count returns the most
 * balanced wrap available at that count.
 *
 * Returns `null` when the text will not fit `maxLines` at this size, which is
 * the fitter's signal to shrink rather than to clip.
 */
function balancedWrap(
  words: readonly string[],
  fontSize: number,
  fontWeight: number,
  maxWidth: number,
  maxLines: number,
  letterSpacing: number,
): string[] | null {
  const widest = widestWord(words, fontSize, fontWeight, letterSpacing);
  if (widest > maxWidth) {
    return null;
  }
  const atFullWidth = greedyWrap(
    words,
    fontSize,
    fontWeight,
    maxWidth,
    letterSpacing,
  );
  if (atFullWidth.length > maxLines) {
    return null;
  }

  for (let step = 0; step <= BALANCE_STEPS; step += 1) {
    const width = widest + ((maxWidth - widest) * step) / BALANCE_STEPS;
    const lines = greedyWrap(words, fontSize, fontWeight, width, letterSpacing);
    if (lines.length <= atFullWidth.length) {
      return lines;
    }
  }
  return atFullWidth;
}

export interface FitResult {
  readonly fontSize: number;
  readonly lines: readonly string[];
  /** Rendered block height at `typeScale.lineHeight`. */
  readonly height: number;
}

export interface FitInput {
  /** Starting (and maximum) font size. */
  readonly base: number;
  /** Preferred floor. The fitter goes below it only to avoid losing words. */
  readonly min: number;
  /**
   * Make `min` a floor no copy may cross. Headline blocks set it: their `min` is
   * `headlineMinSizeFor`, which already carries the frame's cap-height QA floor,
   * so shrinking past it renders a headline `scripts/qa-frames.ts` fails.
   *
   * Blocks whose size the caller has already solved — small type via
   * `smallTypeSizeFor`, the stat value via `fitSingleLine` — leave it off and
   * keep the shrink-to-fit last resort. Those callers pass `base === min` and
   * budget the block's height from the fit, so buying the floor with an extra
   * line would push the eyebrow onto two lines and collapse the stat hierarchy
   * rather than fix anything: their floor is enforced where their size is
   * chosen, not here.
   */
  readonly minIsAbsolute?: boolean;
  /** Column width in px. Nothing is ever placed past this. */
  readonly maxWidth: number;
  /** Line budget; defaults to `typeScale.maxLines`. */
  readonly maxLines?: number;
  readonly fontWeight: number;
  readonly letterSpacing?: number;
}

/**
 * Set `text` at the largest size that achieves the fewest lines the column can
 * manage.
 *
 * Two competing goods: bigger type, and fewer line breaks. Maximising size alone
 * breaks phrases mid-thought; minimising lines alone shrinks the type past the
 * bar. The rule the exemplars follow is to pick the line count first, then take
 * the biggest type that delivers it.
 *
 * If the copy will not fit the line budget even at `min`, the size keeps
 * dropping to an absolute floor. Losing a word is a content bug no reviewer can
 * catch from the plan; type a couple of points smaller is visible and
 * recoverable.
 *
 * Under `minIsAbsolute` that trade is inverted: the block spends lines rather
 * than points, because `min` is then the cap height `scripts/qa-frames.ts`
 * measures. Shrinking to 55% of it set a schema-valid eight word 9:16 headline
 * at 52px, a 1.95% cap height against a 3% floor, so the frame failed QA for
 * type too small to read. Either way no word is ever lost.
 */
export function fitMetric(text: string, input: FitInput): FitResult {
  const {
    base,
    min,
    minIsAbsolute = false,
    maxWidth,
    maxLines = typeScale.maxLines,
    fontWeight,
    letterSpacing = 0,
  } = input;
  const words = text
    .trim()
    .split(/\s+/u)
    .filter((word) => word.length > 0);
  const measured = (size: number, lines: readonly string[]): FitResult => ({
    fontSize: size,
    lines,
    height: lines.length * size * typeScale.lineHeight,
  });

  if (words.length === 0) {
    return measured(base, []);
  }

  const bestPossible = balancedWrap(
    words,
    min,
    fontWeight,
    maxWidth,
    maxLines,
    letterSpacing,
  );

  if (bestPossible) {
    for (let size = base; size > min; size -= 1) {
      const lines = balancedWrap(
        words,
        size,
        fontWeight,
        maxWidth,
        maxLines,
        letterSpacing,
      );
      if (lines && lines.length <= bestPossible.length) {
        return measured(size, lines);
      }
    }
    return measured(min, bestPossible);
  }

  // The line budget cannot hold this copy at the preferred floor.
  const hardFloor = minIsAbsolute ? min : Math.max(8, Math.floor(min * 0.55));
  for (let size = min - 1; size >= hardFloor; size -= 1) {
    const lines = balancedWrap(
      words,
      size,
      fontWeight,
      maxWidth,
      maxLines,
      letterSpacing,
    );
    if (lines) {
      return measured(size, lines);
    }
  }
  // Last resort: honour the column, exceed the line budget, keep every word.
  // A token still wider than the column at the hard floor is soft-broken here
  // rather than pushed through the side margin.
  return measured(
    hardFloor,
    greedyWrap(words, hardFloor, fontWeight, maxWidth, letterSpacing, true),
  );
}

/**
 * Largest size at or below `base` that sets `text` on one line inside
 * `maxWidth`.
 *
 * Used for the stat value, which is a single token by contract and must never
 * wrap or be clipped. Solved directly from the string's em width rather than
 * searched, so it cannot return a clipped answer.
 */
export function fitSingleLine(
  text: string,
  base: number,
  maxWidth: number,
  fontWeight: number,
): number {
  const em = measureText(text, 1, fontWeight);
  if (em <= 0) {
    return base;
  }
  return Math.max(8, Math.min(base, Math.floor(maxWidth / em)));
}

/* ------------------------------------------------------------- small type */

/**
 * Smallest font size whose cap height clears `fraction` of the frame height.
 *
 * `scripts/qa-frames.ts` fails a frame whose shortest text block measures under
 * 3% of frame height, and it measures rendered ink rather than font size. A
 * letterspaced caps eyebrow draws neither ascenders nor descenders, so its ink
 * is exactly the cap height: at the nominal 0.42x ratio that came to 1.93% and
 * failed. Sizing small type off the font's real cap height is what makes the
 * floor hold whatever letters the copy happens to use.
 */
export function minCapSize(frameHeight: number, fraction: number): number {
  return Math.ceil((frameHeight * fraction) / CAP_HEIGHT_RATIO);
}

/**
 * Fraction of frame height a small type block's cap height must clear.
 *
 * 3.2% is the QA floor of 3% plus enough headroom to survive the measurement,
 * which only counts pixels at luma 220 or brighter and therefore reads a
 * slightly shorter block than the geometry implies.
 */
export const SMALL_TYPE_CAP_FRACTION = 0.032;

/**
 * Largest a small block may be relative to the headline it sits under, so it
 * stays visibly subordinate.
 */
export const SMALL_TYPE_MAX_RATIO = 0.72;

/**
 * Font size for eyebrows, support lines, and stat labels.
 *
 * The brand ratio (0.55x the headline) is the starting point; the cap-height
 * floor raises it when the frame needs it. The result is capped at
 * `SMALL_TYPE_MAX_RATIO` of the headline so the block stays visibly
 * subordinate: smaller, weight 500 against the headline's 600, and set in
 * `palette.tint` rather than white.
 *
 * The floor is applied to every small block rather than to the eyebrow alone
 * because a lowercase line that happens to carry no descender (a stat label such
 * as "in an isolated environment") is barely taller than a caps line: which
 * letters a line contains must not decide whether the frame passes QA.
 *
 * The floor also outranks the ceiling. The QA bar is a fraction of frame
 * height, so a 9:16 frame needs a bigger block than a 4:5 one at the same
 * width; letting the headline-relative ceiling clamp the floor away is what set
 * 9:16 small type at 62px, a 2.33% cap height against the 3% bar. The ceiling
 * stays satisfiable because `headlineSizeFor` grows the headline to keep it so.
 */
export function smallTypeSizeFor(
  headlineSize: number,
  frameHeight: number,
): number {
  const fromRatio = Math.round(headlineSize * typeScale.supportRatio);
  const floor = minCapSize(frameHeight, SMALL_TYPE_CAP_FRACTION);
  const ceiling = Math.round(headlineSize * SMALL_TYPE_MAX_RATIO);
  const preferred = Math.min(
    Math.max(fromRatio, floor),
    Math.max(fromRatio, ceiling),
  );
  return Math.max(preferred, floor);
}

/** Headline size as a fraction of frame width, before the height floor. */
const HEADLINE_MIN_OF_WIDTH = 0.06;

/**
 * Headline size for a frame (L4: 8% of frame width), raised when the frame is
 * tall enough that 8% leaves no small-type size which both clears the QA floor
 * and stays under `SMALL_TYPE_MAX_RATIO`.
 *
 * At 1080x1350 the width rule already wins, so 4:5 is unchanged. At 1080x1920
 * the QA floor asks for an 86px small block, which needs a 120px headline above
 * it; sizing type purely off width is what made the taller frame illegible by
 * the same measure that passed the shorter one.
 */
export function headlineSizeFor(
  frameWidth: number,
  frameHeight: number,
): number {
  const fromWidth = Math.round(frameWidth * typeScale.headlineOfWidth);
  const forSmallType = Math.ceil(
    minCapSize(frameHeight, SMALL_TYPE_CAP_FRACTION) / SMALL_TYPE_MAX_RATIO,
  );
  return Math.max(fromWidth, forSmallType);
}

/**
 * Smallest size the headline fitter may shrink to: 6% of frame width, the
 * lowest glyph size measured across the exemplars, but never below the frame's
 * own small-type floor.
 */
export function headlineMinSizeFor(
  frameWidth: number,
  frameHeight: number,
): number {
  return Math.max(
    Math.round(frameWidth * HEADLINE_MIN_OF_WIDTH),
    minCapSize(frameHeight, SMALL_TYPE_CAP_FRACTION),
  );
}
