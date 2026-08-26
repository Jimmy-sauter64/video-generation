/**
 * `kenBurnsStory` — stills with a pan/zoom move per still.
 *
 * Each still is cover-fitted to the frame, then panned and zoomed across its
 * slice of the scene duration using the plan's `panFrom`/`panTo` and
 * `zoomFrom`/`zoomTo`. Pan is expressed in [-1, 1] as a fraction of the crop's
 * available overflow, so a value of ±1 lands exactly on the image edge and can
 * never expose the frame background.
 *
 * The still's own `caption` renders as an editorial kicker in the upper safe
 * area, on a solid `deepest` chip so it reads over light artwork. The scene's
 * beat-timed caption track keeps the caption zone to itself.
 */

import { Gradient, Img, Rect, Txt, type Node } from "@revideo/2d";
import {
  all,
  easeInOutSine,
  easeOutCubic,
  linear,
  waitFor,
  type ThreadGenerator,
} from "@revideo/core";

import { fonts, palette } from "../brand/tokens";
import Captions from "../components/Captions";
import EndCard from "../components/EndCard";
import type { KenBurnsStoryScene, KenBurnsStill } from "../schemas/plan";

import {
  LogoBugOnChip,
  fitText,
  frameFor,
  loadBrandFonts,
  type Frame,
  type Ratio,
} from "./sceneKit";

const END_CARD_SEC = 2;
const END_CARD_FADE_SEC = 0.4;
const CROSSFADE_SEC = 0.5;

/** Natural pixel dimensions of a still, probed by the render CLI. */
export interface AssetSize {
  readonly width: number;
  readonly height: number;
}

export interface KenBurnsStoryProps {
  view: Node;
  scene: KenBurnsStoryScene;
  ratio: Ratio;
  /** `src` → natural size, supplied through render variables. */
  assetSizes?: Record<string, AssetSize>;
  endCardCta?: string;
}

interface CoverGeometry {
  readonly width: number;
  readonly height: number;
  readonly overflowX: number;
  readonly overflowY: number;
}

/**
 * Cover-fit an image of `natural` size into `frame` at `zoom`, and report how
 * much of it hangs outside the frame on each axis. Pan offsets are clamped to
 * half that overflow, which is what makes pan = ±1 mean "flush to the edge".
 */
function coverGeometry(
  frame: Frame,
  natural: AssetSize,
  zoom: number,
): CoverGeometry {
  const scale =
    Math.max(frame.width / natural.width, frame.height / natural.height) * zoom;
  const width = natural.width * scale;
  const height = natural.height * scale;
  return {
    width,
    height,
    overflowX: Math.max(0, width - frame.width),
    overflowY: Math.max(0, height - frame.height),
  };
}

function panOffset(overflow: number, pan: number): number {
  // pan = +1 pushes the image left/up so its right/bottom edge is flush.
  return (-Math.max(-1, Math.min(1, pan)) * overflow) / 2;
}

function StillKicker(frame: Frame, still: KenBurnsStill): Rect {
  const fitted = fitText(still.caption, frame.contentWidth - 72, {
    base: frame.ratio === "9x16" ? 46 : 44,
    min: 30,
    maxLines: 2,
    lineHeightRatio: 1.2,
  });
  const chipHeight = fitted.height + 44;

  return (
    <Rect
      x={0}
      y={frame.contentTop + 118 + chipHeight / 2}
      width={frame.contentWidth}
      height={chipHeight}
      radius={20}
      fill={palette.deepest}
      opacity={0}
      layout
      alignItems="center"
      justifyContent="start"
      padding={[22, 30]}
      gap={22}
      clip
    >
      <Rect width={8} height={fitted.height} radius={4} fill={palette.accent} />
      <Txt
        text={still.caption}
        width={frame.contentWidth - 100}
        fill={palette.white}
        fontFamily={fonts.display.fallback}
        fontSize={fitted.fontSize}
        fontWeight={700}
        lineHeight={fitted.fontSize * 1.2}
        textAlign="left"
        textWrap
      />
    </Rect>
  ) as Rect;
}

export function* kenBurnsStory({
  view,
  scene,
  ratio,
  assetSizes = {},
  endCardCta,
}: KenBurnsStoryProps): ThreadGenerator {
  yield loadBrandFonts();

  const frame = frameFor(ratio);

  // Deepest base so any brief gap between stills is brand-coloured, never black.
  view.add(
    <Rect width={frame.width} height={frame.height} fill={palette.deepest} />,
  );

  const stage = (
    <Rect width={frame.width} height={frame.height} clip />
  ) as Rect;
  view.add(stage);

  // A scrim keeps the kicker and the logo bug legible over light artwork. It has
  // to be a gradient: a flat rect leaves a hard horizontal seam across the frame
  // that reads as a compositing error rather than as depth.
  const scrimHeight = frame.height * 0.34;
  view.add(
    <Rect
      y={-frame.height / 2 + scrimHeight / 2}
      width={frame.width}
      height={scrimHeight}
      fill={
        new Gradient({
          type: "linear",
          from: [0, -scrimHeight / 2],
          to: [0, scrimHeight / 2],
          stops: [
            { offset: 0, color: "rgba(28, 13, 54, 0.38)" },
            { offset: 0.62, color: "rgba(28, 13, 54, 0.16)" },
            { offset: 1, color: "rgba(28, 13, 54, 0)" },
          ],
        })
      }
    />,
  );

  view.add(LogoBugOnChip(ratio));

  yield Captions({ parent: view, ratio, captions: scene.captions });

  const endCardBudget = endCardCta ? END_CARD_SEC : 0;
  const stillsBudget = Math.max(0.5, scene.durationSec - endCardBudget);
  const perStill = stillsBudget / scene.stills.length;

  for (const [index, still] of scene.stills.entries()) {
    const natural = assetSizes[still.src] ?? {
      width: frame.width,
      height: frame.height,
    };

    const from = coverGeometry(frame, natural, still.zoomFrom);
    const to = coverGeometry(frame, natural, still.zoomTo);

    const img = (
      <Img
        src={still.src}
        width={from.width}
        height={from.height}
        x={panOffset(from.overflowX, still.panFrom.x)}
        y={panOffset(from.overflowY, still.panFrom.y)}
        smoothing
      />
    ) as Img;

    const holder = (<Rect opacity={index === 0 ? 1 : 0}>{img}</Rect>) as Rect;
    stage.add(holder);

    const kicker = StillKicker(frame, still);
    view.add(kicker);

    const move = all(
      img.size([to.width, to.height], perStill, linear),
      img.position(
        [
          panOffset(to.overflowX, still.panTo.x),
          panOffset(to.overflowY, still.panTo.y),
        ],
        perStill,
        linear,
      ),
    );

    // The pan/zoom runs for the still's whole slice; the crossfade and kicker
    // ride on top of it.
    yield move;

    let spent = 0;
    if (index > 0) {
      yield* holder.opacity(1, CROSSFADE_SEC, easeInOutSine);
      spent += CROSSFADE_SEC;
    }

    yield* kicker.opacity(0.95, 0.36, easeOutCubic);
    spent += 0.36;

    yield* waitFor(Math.max(0, perStill - spent - 0.3));
    yield* kicker.opacity(0, 0.3, easeOutCubic);
    kicker.remove();
  }

  if (endCardCta) {
    const endCard = (
      <Rect opacity={0}>{EndCard({ ratio, cta: endCardCta })}</Rect>
    ) as Rect;

    endCard.add(
      <Txt
        text="paytheory.com"
        y={frame.height * 0.3}
        fill={palette.accent}
        fontFamily={fonts.display.fallback}
        fontSize={ratio === "9x16" ? 38 : 36}
        fontWeight={500}
        textAlign="center"
      />,
    );

    view.add(endCard);
    yield* endCard.opacity(1, END_CARD_FADE_SEC, easeOutCubic);
    yield* waitFor(END_CARD_SEC - END_CARD_FADE_SEC);
  }
}

export default kenBurnsStory;
