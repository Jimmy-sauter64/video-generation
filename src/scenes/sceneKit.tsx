/**
 * Shared visual furniture for the Pay Theory scene templates.
 *
 * This module implements the measured style laws in
 * `docs/style/exemplar-analysis.md`. Every helper here exists to make one of
 * those laws hard to break from a template:
 *
 * - **L1** — `runBeat` only ever tweens `opacity`. There is no transform,
 *   spring, or per-word entrance anywhere in this file.
 * - **L2/L4** — `fitHeadline` wraps to at most 4 balanced lines and shrinks the
 *   type rather than letting a line run long.
 * - **L3** — weights come from `typeWeights` (600 headline / 500 support); 700
 *   is never referenced.
 * - **L5** — `frameFor` caps the text column at 70% of frame width inside 12%
 *   side margins.
 * - **L6** — `frameFor().contentBottom` stops at 63% of frame height.
 * - **L7** — `DriftingGround` is the one continuous ground, driven by three
 *   independent sinusoids.
 * - **L9** — `LogoEndCard` is the logomark alone, centred, with no CTA.
 *
 * Contract code (`src/schemas`, `scripts`) is read-only from a template's point
 * of view; template-side compensation lives here and is commented with its
 * reason.
 */

import {
  Gradient,
  Img,
  Rect,
  Txt,
  brightness,
  grayscale,
  type Node,
} from "@revideo/2d";
import {
  createSignal,
  easeInExpo,
  easeOutExpo,
  linear,
  waitFor,
  type SimpleSignal,
  type ThreadGenerator,
} from "@revideo/core";

import {
  contentBottomOfHeight,
  fonts,
  logos,
  motion,
  palette,
  safeAreas,
  textColumnOfWidth,
  typeScale,
  typeWeights,
} from "../brand/tokens";

export { loadBrandFonts } from "../brand/fonts";

export type Ratio = keyof typeof safeAreas;

/* ------------------------------------------------------------------ frame */

/**
 * Frame geometry derived from the brand tokens, in the centre-origin
 * coordinate space Revideo scenes draw in.
 */
export interface Frame {
  readonly ratio: Ratio;
  readonly width: number;
  readonly height: number;
  /** Width of the type column — the narrower of the safe area and 70%W (L5). */
  readonly textWidth: number;
  /** Centre-origin x of the type column's centre, so a left-aligned block lands
   * exactly on the safe-area left margin. */
  readonly textCenterX: number;
  /** Top edge of the content band (centre-origin y). */
  readonly contentTop: number;
  /** Bottom edge of the content band: 63% of height, leaving the bottom third
   * empty (L6). */
  readonly contentBottom: number;
  /** Headline size — 8% of frame width (L4). */
  readonly headlineSize: number;
  /** Smallest headline size the fitter may shrink to — 6% of frame width, the
   * lowest glyph size measured across the four exemplars. */
  readonly headlineMinSize: number;
}

export function frameFor(ratio: Ratio): Frame {
  const { width, height, margins } = safeAreas[ratio];
  const safeWidth = width - margins.left - margins.right;
  const textWidth = Math.min(safeWidth, width * textColumnOfWidth);
  return {
    ratio,
    width,
    height,
    textWidth,
    textCenterX: -width / 2 + margins.left + textWidth / 2,
    contentTop: -height / 2 + margins.top,
    contentBottom: -height / 2 + height * contentBottomOfHeight,
    headlineSize: Math.round(width * typeScale.headlineOfWidth),
    headlineMinSize: Math.round(width * 0.06),
  };
}

/* ----------------------------------------------------------------- typography */

/**
 * Average glyph advance as a fraction of font size for Instrument Sans at
 * display weights.
 *
 * Re-measured 2026-08-26 against a rendered 4:5 frame: "become your roadmap"
 * (19 characters at 72px) spans 770px, i.e. 0.5628. The previous 0.545 was
 * measured at weight 700 and under-estimated weight 600, which let a headline
 * run 14px past the 70% column edge. 0.575 carries ~2% headroom so the fitter
 * errs toward the margin rather than through it.
 */
const AVG_GLYPH_RATIO = 0.575;

/** Greedy wrap into lines no wider than `maxChars`. */
function greedyWrap(words: readonly string[], maxChars: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current.length === 0 ? word : `${current} ${word}`;
    if (candidate.length <= maxChars || current.length === 0) {
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

/**
 * Wrap `text` into the fewest lines that fit `maxChars`, and make those lines as
 * even as possible.
 *
 * Evenness matters more than it sounds: a greedy wrap at the full column width
 * produces a long first line and a two-word orphan, which is exactly the "dense,
 * not editorial" look the analysis flags. Searching *upward* from the longest
 * word for the smallest width that still hits the minimum line count returns the
 * most balanced wrap available at that count. Returns `null` when the text
 * cannot fit `maxLines` — the fitter's signal to shrink the type.
 */
function balancedWrap(
  text: string,
  maxChars: number,
  maxLines: number,
): string[] | null {
  const words = text.trim().split(/\s+/u);
  const longestWord = words.reduce(
    (longest, word) => Math.max(longest, word.length),
    1,
  );
  if (longestWord > maxChars) {
    return null;
  }
  const atFullWidth = greedyWrap(words, maxChars);
  if (atFullWidth.length > maxLines) {
    return null;
  }
  for (let width = longestWord; width <= maxChars; width += 1) {
    const lines = greedyWrap(words, width);
    if (lines.length <= atFullWidth.length) {
      return lines;
    }
  }
  return atFullWidth;
}

/** Characters a line of `size` px type can hold in a `maxWidth` px column. */
function columnChars(maxWidth: number, size: number): number {
  return Math.min(
    typeScale.wrapChars,
    Math.max(1, Math.floor(maxWidth / (size * AVG_GLYPH_RATIO))),
  );
}

export interface FittedText {
  /** Chosen font size in px. */
  readonly fontSize: number;
  /** Pre-wrapped text; render with `textWrap="pre"` so the wrap is exact. */
  readonly text: string;
  readonly lines: number;
  /** Rendered block height at `typeScale.lineHeight`. */
  readonly height: number;
}

function measure(lines: string[], fontSize: number): FittedText {
  return {
    fontSize,
    text: lines.join("\n"),
    lines: lines.length,
    height: lines.length * fontSize * typeScale.lineHeight,
  };
}

export interface FitOptions {
  /** Starting (and maximum) font size. */
  readonly base: number;
  /** Floor the fitter may shrink to. */
  readonly min: number;
  /** Line budget; defaults to `typeScale.maxLines`. */
  readonly maxLines?: number;
  /** Column width in px. */
  readonly maxWidth: number;
}

/**
 * Set `text` at the largest size that still achieves the fewest lines the column
 * can manage, and return that wrap.
 *
 * Two competing goods: bigger type, and fewer/cleaner line breaks. Maximising
 * size alone breaks phrases mid-thought ("You sell / software, not / payments"),
 * and minimising lines alone shrinks the type past the bar. The rule here is the
 * one the exemplars follow — pick the line count first, then take the biggest
 * type that delivers it. Line count is monotonically non-increasing as the size
 * drops, so the count at `min` is the best available; the scan then walks down
 * from `base` and stops the moment that count is reached.
 *
 * The per-line character cap is the smaller of what the column holds at that
 * size and `typeScale.wrapChars` (28) — the analysis' upper bound. At 8% of
 * frame width the column only holds ~16 characters, so the column is normally
 * the binding constraint and 28 guards the smaller support sizes.
 */
export function fitText(text: string, options: FitOptions): FittedText {
  const { base, min, maxWidth, maxLines = typeScale.maxLines } = options;
  const clean = text.trim();

  const bestPossible = balancedWrap(
    clean,
    columnChars(maxWidth, min),
    maxLines,
  );

  if (bestPossible) {
    for (let size = base; size > min; size -= 2) {
      const lines = balancedWrap(clean, columnChars(maxWidth, size), maxLines);
      if (lines && lines.length <= bestPossible.length) {
        return measure(lines, size);
      }
    }
    return measure(bestPossible, min);
  }

  // Even at the floor size the text overruns the line budget. Wrap at the floor
  // and clip, so a line never runs past the column edge — an overflowing line is
  // a margin violation, a clipped one is a copy bug the frame QA will catch.
  const fallback = greedyWrap(
    clean.split(/\s+/u),
    columnChars(maxWidth, min),
  ).slice(0, maxLines);
  return measure(fallback, min);
}

/* ---------------------------------------------------------------- ground */

/** Handle onto the continuous background so a scene can re-hue it per beat. */
export interface Ground {
  readonly node: Node;
  /** Start the ground's clock. `yield` (not `yield*`) this so it runs alongside. */
  run(durationSec: number): ThreadGenerator;
  /** Subtle cross-dissolved re-hue at a beat boundary (L7). */
  rehue(index: number, seconds: number): ThreadGenerator;
}

interface DriftLayer {
  readonly color: string;
  readonly alpha: number;
  /** Centre as a fraction of frame width/height from the frame centre. */
  readonly centerX: number;
  readonly centerY: number;
  /** Drift amplitude as a fraction of frame width/height. */
  readonly amplitudeX: number;
  readonly amplitudeY: number;
  /** Sinusoid period in seconds. */
  readonly periodSec: number;
  /** Phase offset in radians. */
  readonly phase: number;
  /** Radius as a fraction of frame width. */
  readonly radius: number;
  /** Opacity the layer takes on alternating beats. */
  readonly rehueAlpha: number;
}

/**
 * Three overlapping radial fields on the purple ramp, each driven by its own
 * slow sinusoid at 8s / 9s / 11s with offset phases. The periods are pairwise
 * co-prime enough that the composite only repeats every ~13 minutes, so a 20s
 * video never shows a loop seam — that continuous drift is what the analysis
 * identifies as the difference between a living ground and the "cheap tell" of
 * flat purple (L7).
 */
const DRIFT_LAYERS: readonly DriftLayer[] = [
  {
    color: palette.primary,
    alpha: 0.85,
    centerX: -0.22,
    centerY: -0.3,
    amplitudeX: 0.16,
    amplitudeY: 0.1,
    periodSec: 8,
    phase: 0,
    radius: 0.92,
    rehueAlpha: 0.62,
  },
  {
    color: palette.deepAnchor,
    alpha: 0.9,
    centerX: 0.3,
    centerY: 0.08,
    amplitudeX: 0.13,
    amplitudeY: 0.14,
    periodSec: 9,
    phase: Math.PI * 0.66,
    radius: 1.05,
    rehueAlpha: 0.7,
  },
  {
    color: palette.deepest,
    alpha: 0.95,
    centerX: -0.05,
    centerY: 0.46,
    amplitudeX: 0.2,
    amplitudeY: 0.08,
    periodSec: 11,
    phase: Math.PI * 1.31,
    radius: 0.98,
    rehueAlpha: 0.88,
  },
];

/**
 * A frame-sized grain plate, generated once and cached.
 *
 * Wide, slow gradients quantise into visible contour bands once h264 gets hold
 * of them — the first draft showed clear stepping across the lower half of the
 * ground. Grain is the standard fix: a pixel of noise straddles the boundary
 * between two 8-bit levels, so the eye integrates the ramp instead of the step.
 * At 3.5% over `overlay` it is invisible as texture and decisive as a dither.
 *
 * Returns `null` outside a browser (type-checking, Node tooling), where the
 * scene is never drawn anyway.
 */
const grainCache = new Map<string, string | null>();

function grainDataUri(width: number, height: number): string | null {
  const key = `${width}x${height}`;
  const cached = grainCache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  if (typeof document === "undefined") {
    grainCache.set(key, null);
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    grainCache.set(key, null);
    return null;
  }

  const image = context.createImageData(width, height);
  // Deterministic LCG rather than Math.random: the plate must be identical on
  // every render so two passes of the same plan produce the same file.
  let seed = 0x2e1457;
  for (let index = 0; index < image.data.length; index += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const value = 96 + ((seed >>> 24) % 64);
    image.data[index] = value;
    image.data[index + 1] = value;
    image.data[index + 2] = value;
    image.data[index + 3] = 255;
  }
  context.putImageData(image, 0, 0);

  const uri = canvas.toDataURL("image/png");
  grainCache.set(key, uri);
  return uri;
}

function rgba(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function DriftingGround(frame: Frame): Ground {
  // A plain signal tweened linearly for the scene's whole duration is a more
  // dependable clock than reading thread time from inside a draw callback: it is
  // an ordinary reactive dependency, so every gradient centre below recomputes
  // once per frame without touching renderer internals.
  const clock: SimpleSignal<number> = createSignal(0);

  const root = (<Rect width={frame.width} height={frame.height} />) as Rect;

  // Opaque floor so no layer's alpha ever reveals the transparent project
  // background.
  root.add(
    <Rect width={frame.width} height={frame.height} fill={palette.ink} />,
  );

  const layerNodes = DRIFT_LAYERS.map((layer) => {
    const centerX = () =>
      frame.width * layer.centerX +
      frame.width *
        layer.amplitudeX *
        Math.sin((2 * Math.PI * clock()) / layer.periodSec + layer.phase);
    const centerY = () =>
      frame.height * layer.centerY +
      frame.height *
        layer.amplitudeY *
        Math.cos((2 * Math.PI * clock()) / layer.periodSec + layer.phase);

    const node = (
      <Rect
        width={frame.width}
        height={frame.height}
        opacity={layer.alpha}
        fill={
          new Gradient({
            type: "radial",
            from: () => [centerX(), centerY()],
            to: () => [centerX(), centerY()],
            fromRadius: 0,
            toRadius: frame.width * layer.radius,
            stops: [
              { offset: 0, color: rgba(layer.color, 1) },
              { offset: 0.55, color: rgba(layer.color, 0.55) },
              { offset: 1, color: rgba(layer.color, 0) },
            ],
          })
        }
      />
    ) as Rect;
    root.add(node);
    return node;
  });

  const grain = grainDataUri(frame.width, frame.height);
  if (grain) {
    root.add(
      <Img
        src={grain}
        width={frame.width}
        height={frame.height}
        opacity={0.035}
        compositeOperation="overlay"
      />,
    );
  }

  return {
    node: root,
    *run(durationSec: number): ThreadGenerator {
      yield* clock(durationSec, durationSec, linear);
    },
    *rehue(index: number, seconds: number): ThreadGenerator {
      // Alternate each layer between its two alphas on successive beats. The
      // shift is deliberately small — the ground should read as breathing, never
      // as a colour cut.
      const targets = layerNodes.map((node, layerIndex) => {
        const layer = DRIFT_LAYERS[layerIndex];
        const even = (index + layerIndex) % 2 === 0;
        return node.opacity(even ? layer.alpha : layer.rehueAlpha, seconds);
      });
      for (const target of targets) {
        yield target;
      }
      yield* waitFor(seconds);
    },
  };
}

/* ----------------------------------------------------------------- beats */

/** The content of one held headline beat. */
export interface BeatContent {
  /** Optional letterspaced caps eyebrow at 0.42x (L3's single caps exception). */
  readonly eyebrow?: string;
  /** The headline. Sentence case, 8 words or fewer. */
  readonly headline: string;
  /** Optional subhead at 0.55x. */
  readonly support?: string;
}

/**
 * Vertical anchor shared by every beat in a scene.
 *
 * All beats start at the same y so consecutive beats cross-fade *in place* —
 * L1 forbids motion, and a block centred per-beat would visibly jump between
 * beats of different line counts. The anchor centres a nominal **three-line**
 * block inside the content band: three lines is the median beat here and the
 * measured v3 headline, so the common two-line beat sits just above the optical
 * centre while the tallest beat still clears the empty bottom third.
 */
export function beatAnchorY(frame: Frame): number {
  const bandHeight = frame.contentBottom - frame.contentTop;
  const nominalBlock = 3 * frame.headlineSize * typeScale.lineHeight;
  return frame.contentTop + Math.max(0, (bandHeight - nominalBlock) / 2);
}

/**
 * Build one beat as a hidden node. Add it to the view, then play it with
 * `runBeat`.
 */
export function Beat(frame: Frame, content: BeatContent): Rect {
  const headline = fitText(content.headline, {
    base: frame.headlineSize,
    min: frame.headlineMinSize,
    maxWidth: frame.textWidth,
  });

  const eyebrowSize = Math.round(frame.headlineSize * typeScale.eyebrowRatio);
  const supportSize = Math.round(frame.headlineSize * typeScale.supportRatio);

  const children: Node[] = [];

  if (content.eyebrow) {
    children.push(
      (
        <Txt
          text={content.eyebrow.toUpperCase()}
          width={frame.textWidth}
          fill={palette.tint}
          fontFamily={fonts.display.fallback}
          fontSize={eyebrowSize}
          fontWeight={typeWeights.support}
          letterSpacing={eyebrowSize * typeScale.eyebrowTrackingEm}
          lineHeight={eyebrowSize * typeScale.lineHeight}
          textAlign="left"
          textWrap={false}
        />
      ) as Node,
    );
  }

  children.push(
    (
      <Txt
        text={headline.text}
        width={frame.textWidth}
        fill={palette.white}
        fontFamily={fonts.display.fallback}
        fontSize={headline.fontSize}
        fontWeight={typeWeights.headline}
        lineHeight={headline.fontSize * typeScale.lineHeight}
        textAlign="left"
        textWrap="pre"
      />
    ) as Node,
  );

  if (content.support) {
    const support = fitText(content.support, {
      base: supportSize,
      min: Math.round(supportSize * 0.8),
      maxWidth: frame.textWidth,
      maxLines: 2,
    });
    children.push(
      (
        <Txt
          text={support.text}
          width={frame.textWidth}
          fill={palette.tint}
          fontFamily={fonts.display.fallback}
          fontSize={support.fontSize}
          fontWeight={typeWeights.support}
          lineHeight={support.fontSize * typeScale.lineHeight}
          textAlign="left"
          textWrap="pre"
        />
      ) as Node,
    );
  }

  return (
    <Rect
      x={frame.textCenterX}
      y={beatAnchorY(frame)}
      offset={[0, -1]}
      width={frame.textWidth}
      layout
      direction="column"
      alignItems="start"
      justifyContent="start"
      gap={Math.round(frame.headlineSize * 0.34)}
      opacity={0}
    >
      {children}
    </Rect>
  ) as Rect;
}

/**
 * Hold one beat: fade in, hold, fade out, remove.
 *
 * Opacity is the only property touched (L1). `easeOutExpo` and `easeInExpo` are
 * exactly the measured curves `cubic-bezier(0.16, 1, 0.3, 1)` and
 * `cubic-bezier(0.7, 0, 0.84, 0)`.
 */
export function* runBeat(node: Rect, durationSec: number): ThreadGenerator {
  const fadeIn = Math.min(motion.fadeInSec, durationSec * 0.25);
  const fadeOut = Math.min(motion.fadeOutSec, durationSec * 0.15);
  yield* node.opacity(1, fadeIn, easeOutExpo);
  yield* waitFor(Math.max(0, durationSec - fadeIn - fadeOut));
  yield* node.opacity(0, fadeOut, easeInExpo);
  node.remove();
}

/* -------------------------------------------------------------- end card */

/**
 * The logo end card: the logomark alone, centred, no CTA, no URL (L9).
 *
 * The vendored logomark is a solid `#600075` glyph — a dark plum that is not in
 * `palette` and disappears against the purple ground. Rather than seat it on a
 * white chip (a chip is a second object competing with the mark), it is
 * neutralised and blown out to white with `grayscale` + `brightness`, which
 * preserves the glyph's alpha and produces the monochrome mark the exemplars
 * close on.
 */
export function LogoEndCard(frame: Frame): Rect {
  const size = Math.round(frame.width * 0.23);
  return (
    <Rect x={0} y={0} width={frame.width} height={frame.height} opacity={0}>
      <Img
        src={logos.logomarkSvg}
        width={size}
        height={Math.round(size * (296.7 / 309.9))}
        x={0}
        y={0}
        filters={[grayscale(1), brightness(24)]}
      />
    </Rect>
  ) as Rect;
}

/** Fade the end card up and hold it for `motion.endCardSec` total. */
export function* runEndCard(node: Rect): ThreadGenerator {
  yield* node.opacity(1, motion.fadeInSec, easeOutExpo);
  yield* waitFor(Math.max(0, motion.endCardSec - motion.fadeInSec));
}

/* ---------------------------------------------------------------- timing */

export interface TimedBeat {
  readonly content: BeatContent;
  readonly durationSec: number;
}

/**
 * Scale a beat list so it fills exactly `budgetSec`.
 *
 * The plan's caption windows carry the intended rhythm but leave small gaps
 * between cues; scaling to the budget keeps the rendered duration equal to
 * `plan.totalDurationSec` without asking the plan author to make the arithmetic
 * come out to the millisecond.
 */
export function fitBeatsToBudget(
  beats: readonly TimedBeat[],
  budgetSec: number,
): TimedBeat[] {
  const total = beats.reduce((sum, beat) => sum + beat.durationSec, 0);
  if (total <= 0 || beats.length === 0) {
    return [];
  }
  const factor = budgetSec / total;
  const scaled = beats.map((beat) => ({
    content: beat.content,
    durationSec: beat.durationSec * factor,
  }));
  // Push any floating-point residue into the last beat so the sum is exact.
  const scaledTotal = scaled.reduce((sum, beat) => sum + beat.durationSec, 0);
  const last = scaled[scaled.length - 1];
  scaled[scaled.length - 1] = {
    content: last.content,
    durationSec: last.durationSec + (budgetSec - scaledTotal),
  };
  return scaled;
}
