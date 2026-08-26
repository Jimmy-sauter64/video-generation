/**
 * `kenBurnsStory` — held headline beats over a continuously moving still.
 *
 * The still sequence *is* this template's ground (L7): each image is
 * cover-fitted and panned/zoomed across its slice of the scene, cross-fading
 * into the next, so the background never stops moving and the type never has to.
 * Headline beats cross-fade in place on top of it, on the same grid and at the
 * same weights as `hookStat` (L1–L6).
 *
 * Pan is expressed in [-1, 1] as a fraction of the crop's available overflow, so
 * a value of ±1 lands exactly on the image edge and can never expose the frame
 * background.
 *
 * The plan's per-still `caption` is deliberately **not** drawn. L10 allows one
 * message on screen at a time, and the caption track already supplies it; the
 * still captions remain plan metadata and are what `scripts/render-plan.ts`
 * writes into the post-copy stub.
 */

import { Gradient, Img, Rect, type Node } from "@revideo/2d";
import {
  all,
  easeInExpo,
  easeOutExpo,
  linear,
  waitFor,
  type ThreadGenerator,
} from "@revideo/core";

import { motion, palette } from "../brand/tokens";
import type { KenBurnsStoryScene } from "../schemas/plan";

import {
  Beat,
  DriftingGround,
  LogoEndCard,
  fitBeatsToBudget,
  frameFor,
  loadBrandFonts,
  runBeat,
  runEndCard,
  type Frame,
  type Ratio,
  type TimedBeat,
} from "./sceneKit";

const CROSSFADE_SEC = 0.6;

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
  /** Present only on a plan's final scene; the end card itself carries no CTA. */
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

/**
 * Vertical scrim over the artwork.
 *
 * The exemplars set white type on grounds they control; ours is a photograph
 * whose luminance varies across the pan, and v4's weakest measured moment is
 * exactly this failure (white type over a light gradient, marginal contrast).
 * A gradient scrim is the smallest intervention that guarantees contrast — a
 * flat rect leaves a hard horizontal seam that reads as a compositing error, and
 * a per-beat plate would be a second entrance mechanism, which L1 forbids.
 */
function Scrim(frame: Frame): Rect {
  return (
    <Rect
      width={frame.width}
      height={frame.height}
      fill={
        new Gradient({
          type: "linear",
          from: [0, -frame.height / 2],
          to: [0, frame.height / 2],
          // Calibrated against rendered frames: at 0.78/0.52/0.16 the type band
          // measured YAVG 98 against white at 235 — about 6.2:1, legible but
          // still letting the illustration compete with the headline. These
          // stops put the band near YAVG 80 (~7:1) so the artwork reads as
          // ground rather than as subject.
          stops: [
            { offset: 0, color: "rgba(28, 13, 54, 0.86)" },
            { offset: 0.5, color: "rgba(28, 13, 54, 0.6)" },
            { offset: 1, color: "rgba(28, 13, 54, 0.2)" },
          ],
        })
      }
    />
  ) as Rect;
}

/** Beats come straight from the caption track, in chronological order. */
function beatsFor(scene: KenBurnsStoryScene): TimedBeat[] {
  return [...scene.captions]
    .sort((left, right) => left.startSec - right.startSec)
    .map((cue) => ({
      content: { headline: cue.text },
      durationSec: Math.max(0.5, cue.endSec - cue.startSec),
    }));
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

  // The drifting ground sits under the stills so a crossfade gap is never black,
  // and so the end card closes on the same living ground as `hookStat`.
  const ground = DriftingGround(frame);
  view.add(ground.node);
  yield ground.run(scene.durationSec);

  const stage = (
    <Rect width={frame.width} height={frame.height} clip />
  ) as Rect;
  view.add(stage);

  const scrim = Scrim(frame);
  view.add(scrim);

  const isLast = Boolean(endCardCta);
  const budget = Math.max(
    1,
    scene.durationSec - (isLast ? motion.endCardSec : 0),
  );
  const perStill = budget / scene.stills.length;

  function* stillSequence(): ThreadGenerator {
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

      // The pan/zoom runs for the still's whole slice; the crossfade rides on
      // top of it.
      yield all(
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

      if (index > 0) {
        yield* holder.opacity(1, CROSSFADE_SEC, easeOutExpo);
        yield* waitFor(Math.max(0, perStill - CROSSFADE_SEC));
      } else {
        yield* waitFor(perStill);
      }
    }
  }

  // Stills and beats are two independent tracks over the same budget.
  yield stillSequence();

  const beats = fitBeatsToBudget(beatsFor(scene), budget);
  for (const [index, beat] of beats.entries()) {
    const node = Beat(frame, beat.content);
    view.add(node);
    yield ground.rehue(index, Math.min(motion.fadeInSec, beat.durationSec));
    yield* runBeat(node, beat.durationSec);
  }

  if (isLast) {
    const endCard = LogoEndCard(frame);
    view.add(endCard);
    // Clear the artwork as the logo arrives so the card closes on the ground
    // alone, exactly as `hookStat` does (L9).
    yield stage.opacity(0, motion.fadeOutSec, easeInExpo);
    yield scrim.opacity(0, motion.fadeOutSec, easeInExpo);
    yield* runEndCard(endCard);
  }
}

export default kenBurnsStory;
