/**
 * Turning fitted text into Revideo nodes.
 *
 * All the arithmetic (advances, wrapping, size fitting, the small-type floor)
 * lives in `./textMetrics`, which imports no browser code and is unit tested
 * under `node --test`. This module is only the node-building half: it takes the
 * wrap that module chose and places one `Txt` per word, absolutely positioned,
 * hidden, and anchored top left, which is the state `enterElement` expects.
 *
 * Words are placed by arithmetic rather than by a flex container because a
 * layout child's `x`/`y` are computed by the layout engine, which would make the
 * transform entrance R-1 calls for a silent no-op.
 */

import { Txt } from "@revideo/2d";

import { fonts, typeScale } from "../brand/tokens";
import {
  fitMetric,
  measureText,
  spaceWidth,
  type FitInput,
} from "./textMetrics";

export {
  CAP_HEIGHT_RATIO,
  fitMetric,
  fitSingleLine,
  measureText,
  minCapSize,
  smallTypeSizeFor,
  spaceWidth,
  type FitInput,
  type FitResult,
} from "./textMetrics";

export interface BlockOptions extends Omit<FitInput, "fontWeight"> {
  readonly fill: string;
  /** Numeric weight. Never 700 (L3). */
  readonly fontWeight: number;
}

export interface SplitHeadline {
  /** One hidden `Txt` per word, in reading order, ready for `staggerWords`. */
  readonly words: readonly Txt[];
  readonly fontSize: number;
  readonly lineCount: number;
  readonly height: number;
  /** Widest rendered line, in px. Never exceeds `maxWidth`. */
  readonly width: number;
}

/**
 * Split `text` into per word nodes laid out from the block's top left corner at
 * (`left`, `top`) in the scene's centre origin coordinate space.
 *
 * The nodes are unparented; the caller adds them to the layer it wants.
 */
export function splitHeadline(
  text: string,
  left: number,
  top: number,
  options: BlockOptions,
): SplitHeadline {
  const { fill, fontWeight, letterSpacing = 0 } = options;
  const fitted = fitMetric(text, options);
  const lineHeight = fitted.fontSize * typeScale.lineHeight;
  const gap = spaceWidth(fitted.fontSize, fontWeight, letterSpacing);
  const words: Txt[] = [];
  let widest = 0;

  fitted.lines.forEach((line, lineIndex) => {
    let cursor = 0;
    for (const word of line.split(" ").filter((part) => part.length > 0)) {
      words.push(
        new Txt({
          text: word,
          x: left + cursor,
          y: top + lineIndex * lineHeight,
          offset: [-1, -1],
          fill,
          fontFamily: fonts.display.fallback,
          fontSize: fitted.fontSize,
          fontWeight,
          lineHeight,
          letterSpacing: letterSpacing === 0 ? undefined : letterSpacing,
          textWrap: false,
          opacity: 0,
        }),
      );
      cursor +=
        measureText(word, fitted.fontSize, fontWeight, letterSpacing) + gap;
    }
    widest = Math.max(widest, Math.max(0, cursor - gap));
  });

  return {
    words,
    fontSize: fitted.fontSize,
    lineCount: fitted.lines.length,
    height: fitted.height,
    width: widest,
  };
}

export interface FittedBlock {
  readonly node: Txt;
  readonly fontSize: number;
  readonly height: number;
  readonly width: number;
}

/**
 * One fitted, hidden, top left anchored text block: eyebrows, support lines,
 * stat values, and stat labels, which animate as a single unit rather than word
 * by word.
 *
 * Rendered with `textWrap="pre"` so the browser cannot re-wrap the block
 * somewhere other than where it was measured.
 */
export function fittedBlock(
  text: string,
  left: number,
  top: number,
  options: BlockOptions,
): FittedBlock {
  const { fill, fontWeight, letterSpacing = 0 } = options;
  const fitted = fitMetric(text, options);
  const lineHeight = fitted.fontSize * typeScale.lineHeight;
  const width = fitted.lines.reduce(
    (widest, line) =>
      Math.max(
        widest,
        measureText(line, fitted.fontSize, fontWeight, letterSpacing),
      ),
    0,
  );

  const node = new Txt({
    text: fitted.lines.join("\n"),
    x: left,
    y: top,
    offset: [-1, -1],
    width: options.maxWidth,
    fill,
    fontFamily: fonts.display.fallback,
    fontSize: fitted.fontSize,
    fontWeight,
    lineHeight,
    letterSpacing: letterSpacing === 0 ? undefined : letterSpacing,
    textAlign: "left",
    textWrap: "pre",
    opacity: 0,
  });

  return { node, fontSize: fitted.fontSize, height: fitted.height, width };
}
