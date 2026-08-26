/**
 * Shared visual furniture for the Pay Theory scene templates.
 *
 * Everything in here is layout/typography plumbing that both `hookStat` and
 * `kenBurnsStory` need. Contract code (`src/schemas`, `src/components`,
 * `src/brand`) is read-only from a template's point of view — this module is
 * where template-side compensation lives, and each compensation is commented
 * with the reason it exists.
 */

import { Img, Layout, Rect, Txt, type Node } from "@revideo/2d";

import { fonts, palette, safeAreas } from "../brand/tokens";
import LogoBug from "../components/LogoBug";

export type Ratio = keyof typeof safeAreas;

/**
 * Frame geometry derived from the brand safe-area tokens, expressed in the
 * centre-origin coordinate space Revideo scenes draw in.
 */
export interface Frame {
  readonly ratio: Ratio;
  readonly width: number;
  readonly height: number;
  /** Usable content width between the left/right safe-area margins. */
  readonly contentWidth: number;
  /** Top edge of the safe content band (centre-origin y). */
  readonly contentTop: number;
  /** Bottom edge of the safe content band — sits just above the caption zone. */
  readonly contentBottom: number;
}

/** Gap kept between the bottom of scene content and the top of the caption zone. */
const CAPTION_CLEARANCE = 28;

export function frameFor(ratio: Ratio): Frame {
  const { width, height, margins, captionZone } = safeAreas[ratio];
  return {
    ratio,
    width,
    height,
    contentWidth: width - margins.left - margins.right,
    contentTop: -height / 2 + margins.top,
    contentBottom: captionZone.y - height / 2 - CAPTION_CLEARANCE,
  };
}

/* ------------------------------------------------------------------ fonts */

/**
 * Instrument Sans is vendored under `assets/brand/fonts` but nothing in the
 * repo registers it with the browser, so `fonts.display.fallback` would silently
 * resolve to Helvetica in the renderer. Register both vendored weights as
 * `FontFace`s at module load: `document.fonts.add` runs synchronously before the
 * first frame is measured, and `@revideo/2d` already awaits `document.fonts.ready`
 * inside `Layout`/`Txt`, so the pending loads are waited on for us.
 */
let brandFontsPromise: Promise<unknown> | null = null;

export function loadBrandFonts(): Promise<unknown> {
  if (brandFontsPromise) {
    return brandFontsPromise;
  }

  if (typeof document === "undefined" || typeof FontFace === "undefined") {
    brandFontsPromise = Promise.resolve();
    return brandFontsPromise;
  }

  brandFontsPromise = Promise.all(
    fonts.display.files.map((file) => {
      const face = new FontFace(fonts.display.name, `url('/${file.path}')`, {
        weight: String(file.weight),
        style: "normal",
      });
      document.fonts.add(face);
      return face.load();
    }),
  );

  return brandFontsPromise;
}

// Start the download the moment any scene module is imported.
void loadBrandFonts();

/* ------------------------------------------------------------- text sizing */

/**
 * Average glyph advance as a fraction of font size for Instrument Sans at
 * display weights. Measured empirically against rendered frames; used to pick a
 * font size that lands inside a known line budget so blocks can be stacked
 * without waiting on a layout pass.
 */
const AVG_GLYPH_RATIO = 0.545;

export interface FittedText {
  readonly fontSize: number;
  readonly lines: number;
  readonly height: number;
}

export interface FitOptions {
  readonly base: number;
  readonly min: number;
  readonly maxLines: number;
  readonly lineHeightRatio?: number;
}

/**
 * Pick the largest font size at or below `base` whose estimated wrapped line
 * count fits `maxLines` inside `maxWidth`, and report the block height that
 * results. Deterministic, so callers can stack blocks by arithmetic.
 */
export function fitText(
  text: string,
  maxWidth: number,
  { base, min, maxLines, lineHeightRatio = 1.12 }: FitOptions,
): FittedText {
  const characters = Math.max(text.trim().length, 1);
  const longestWord = text
    .trim()
    .split(/\s+/u)
    .reduce((longest, word) => Math.max(longest, word.length), 1);

  let fontSize = base;
  for (let size = base; size >= min; size -= 2) {
    const estimatedLines = Math.max(
      1,
      Math.ceil((characters * AVG_GLYPH_RATIO * size) / maxWidth),
    );
    const longestWordFits = longestWord * AVG_GLYPH_RATIO * size <= maxWidth;
    if (estimatedLines <= maxLines && longestWordFits) {
      fontSize = size;
      break;
    }
    fontSize = size;
  }

  // Round with a 0.1-line tolerance. Without it a string of narrow glyphs
  // ("PCI Level 1" estimates at 1.09 lines) is budgeted two lines of height and
  // opens a dead gap under a block that actually renders on one.
  const lines = Math.min(
    maxLines,
    Math.max(
      1,
      Math.ceil((characters * AVG_GLYPH_RATIO * fontSize) / maxWidth - 0.1),
    ),
  );

  return { fontSize, lines, height: lines * fontSize * lineHeightRatio };
}

/* ---------------------------------------------------------------- blocks */

export interface TextBlockProps {
  readonly frame: Frame;
  /** Centre-origin y of the block's anchored edge. */
  readonly top: number;
  /** Which edge `top` refers to. Bottom-anchoring keeps copy off the caption zone. */
  readonly anchor?: "top" | "bottom";
  readonly fitted: FittedText;
  readonly text?: string;
  readonly fill?: string;
  readonly fontWeight?: number;
  readonly lineHeightRatio?: number;
  readonly opacity?: number;
  readonly children?: Node | Node[];
}

/**
 * A left-aligned, top-anchored text block sized by `fitText`.
 *
 * The outer `Rect` carries `layout` (so `Txt` wrapping works) but is itself
 * positioned absolutely, which keeps entrance animations on `y`/`opacity`/`scale`
 * free of the layout engine.
 */
export function TextBlock({
  frame,
  top,
  anchor = "top",
  fitted,
  text,
  fill = palette.white,
  fontWeight = 700,
  lineHeightRatio = 1.12,
  opacity = 1,
  children,
}: TextBlockProps): Rect {
  // Anchor by edge rather than centre. `fitText` only estimates the block
  // height, so anchoring on an edge keeps that estimate out of the position:
  // an under- or over-estimate changes the gap below the block, never the
  // alignment of the block itself.
  return (
    <Rect
      x={0}
      y={top}
      offset={[0, anchor === "top" ? -1 : 1]}
      width={frame.contentWidth}
      layout
      direction="column"
      alignItems="start"
      justifyContent="start"
      opacity={opacity}
    >
      <Txt
        text={text}
        width={frame.contentWidth}
        fill={fill}
        fontFamily={fonts.display.fallback}
        fontSize={fitted.fontSize}
        fontWeight={fontWeight}
        lineHeight={fitted.fontSize * lineHeightRatio}
        textAlign="left"
        textWrap
      >
        {children}
      </Txt>
    </Rect>
  ) as Rect;
}

/* ----------------------------------------------------------------- chrome */

/**
 * The vendored logomark is a solid `#600075` glyph — a dark plum that is *not*
 * in `palette` and reads as a smudge against `palette.deepest` (#2E1457).
 * `LogoBug` renders it bare at 68% opacity, so on every dark template frame the
 * bug would be effectively invisible. Compensate at the template layer by
 * seating the unmodified `LogoBug` node on a white chip at the node's own
 * coordinates (read off the node, not recomputed, so the two stay in sync).
 */
export function LogoBugOnChip(ratio: Ratio): Node {
  const bug = LogoBug({ ratio }) as Layout;
  const size = bug.width() as number;
  const chip = size + 30;

  return (
    <Rect
      x={bug.x()}
      y={bug.y()}
      width={chip}
      height={chip}
      radius={chip * 0.28}
      fill={palette.white}
      opacity={0.94}
    >
      <Img
        src={(bug as Img).src()}
        width={size * 0.82}
        height={size * 0.78}
        x={0}
        y={0}
      />
    </Rect>
  );
}

/** Thin accent rule used as the editorial kicker above a headline. */
export function AccentRule(frame: Frame, y: number): Rect {
  const width = frame.ratio === "9x16" ? 128 : 112;
  return (
    <Rect
      x={-frame.contentWidth / 2 + width / 2}
      y={y}
      width={width}
      height={10}
      radius={5}
      fill={palette.accent}
    />
  ) as Rect;
}

/**
 * Split a stat value so the final token can be emphasised in `palette.accent`
 * while the rest stays white. Works for "PCI Level 1" (accent on "1") and for
 * word-shaped values like "Crawl. Walk. Run." (accent on "Run.").
 */
export function splitStatValue(value: string): {
  head: string;
  tail: string;
} {
  const words = value.trim().split(/\s+/u);
  if (words.length === 1) {
    return { head: "", tail: words[0] };
  }
  return {
    head: `${words.slice(0, -1).join(" ")} `,
    tail: words[words.length - 1],
  };
}
