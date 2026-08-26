/**
 * `kenBurnsStory` — held headline beats on the drifting ground, with a contained
 * still plate below them.
 *
 * **Why the stills are not the ground.** The library stills are *finished social
 * graphics*: each one already carries a letterspaced eyebrow, a three-line
 * headline, a rule, and a Pay Theory logo lockup, with the illustration confined
 * to its lower band. The previous draft used them full-bleed at 2.8–3.6x zoom
 * under a scrim, which produced two failures at once — the baked headline was
 * sliced into giant unreadable letter fragments across the top of the opening
 * beats, and the frame carried two grounds (photo-ish artwork *and* the drifting
 * gradient) in violation of L7's single continuous ground.
 *
 * The fix follows the v2/Perplexity grammar in the analysis: the artwork is an
 * *object on the page*, not the page. Each still is pre-cropped to its clean
 * illustration region (`assets/library/*-plate.png`, see the crop table below)
 * and drawn inside one rounded, clipped plate that holds still while its
 * contents zoom and cross-dissolve. The drifting gradient is the only ground,
 * shared with `hookStat`, and headline beats always sit on that gradient — never
 * on top of artwork, so no scrim is needed and contrast is the same everywhere.
 *
 * Crops, all from the 2160x2700 originals (originals are never modified):
 *
 * | plate                              | source                              | ffmpeg filter                                    |
 * | ---------------------------------- | ----------------------------------- | ------------------------------------------------ |
 * | `paytheory-odyssey-ship-plate`     | `paytheory-odyssey-ship-portrait`   | `crop=1440:800:720:1520`                          |
 * | `paytheory-odyssey-plate`          | `paytheory-odyssey-portrait`        | `crop=1160:644:960:1660,scale=1440:800:flags=lanczos` |
 * | `paytheory-odyssey-v2-plate`       | `paytheory-odyssey-v2-portrait`     | `crop=1440:800:720:1500`                          |
 *
 * Every crop starts below the baked rule (y ≥ 1500) and stops above the logo
 * lockup (y ≤ 2330, x ≥ 720 where the lockup ends at x = 878), so no plate
 * contains type or a second brand mark. All three land on 1440x800 — one plate
 * aspect, so the container never changes shape mid-dissolve.
 *
 * Pan is expressed in [-1, 1] as a fraction of the crop's available overflow
 * *inside the plate*, so a value of ±1 lands exactly on the image edge and can
 * never expose the plate's backing.
 *
 * The plan's per-still `caption` is deliberately **not** drawn. L10 allows one
 * message on screen at a time, and the beat track already supplies it; the still
 * captions remain plan metadata and are what `scripts/render-plan.ts` writes
 * into the post-copy stub.
 */

import { Img, Rect, type Node } from "@revideo/2d";
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
  runBeats,
  runEndCard,
  type Frame,
  type Ratio,
  type TimedBeat,
} from "./sceneKit";

/**
 * Cross-dissolve between two stills, seconds.
 *
 * The outgoing still's zoom is extended by exactly this much so it is still
 * moving underneath while the incoming still rises — in the previous draft the
 * pan/zoom tween ended *at* the boundary and the frame sat frozen for the whole
 * 0.6s dissolve, which is the "motion stops dead" tell.
 */
const STILL_CROSSFADE_SEC = 0.6;

/** Aspect of the `-plate.png` crops (1440 x 800). */
const PLATE_ASPECT = 1440 / 800;

/**
 * Top edge of the plate as a fraction of frame height.
 *
 * Sits below the deepest four-line headline block (which bottoms out at 29% of
 * height on 4:5) and leaves ≥ 21% of the frame clear underneath, so the plate
 * reads as an inset object with margins rather than a band welded to the bottom
 * edge.
 */
const PLATE_TOP_OF_HEIGHT = 0.475;

/** Corner radius as a fraction of frame width. */
const PLATE_RADIUS_OF_WIDTH = 0.026;

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

interface Box {
  readonly width: number;
  readonly height: number;
}

interface PlateGeometry extends Box {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

/**
 * The plate shares the type column's width and left edge, so the artwork and the
 * headline sit on one grid instead of two.
 */
function plateGeometry(frame: Frame): PlateGeometry {
  const width = frame.textWidth;
  const height = Math.round(width / PLATE_ASPECT);
  const top = -frame.height / 2 + frame.height * PLATE_TOP_OF_HEIGHT;
  return {
    x: frame.textCenterX,
    y: top + height / 2,
    width,
    height,
    radius: Math.round(frame.width * PLATE_RADIUS_OF_WIDTH),
  };
}

interface CoverGeometry {
  readonly width: number;
  readonly height: number;
  readonly overflowX: number;
  readonly overflowY: number;
}

/**
 * Cover-fit an image of `natural` size into `box` at `zoom`, and report how much
 * of it hangs outside the box on each axis. Pan offsets are clamped to half that
 * overflow, which is what makes pan = ±1 mean "flush to the edge".
 */
function coverGeometry(
  box: Box,
  natural: AssetSize,
  zoom: number,
): CoverGeometry {
  const scale =
    Math.max(box.width / natural.width, box.height / natural.height) * zoom;
  const width = natural.width * scale;
  const height = natural.height * scale;
  return {
    width,
    height,
    overflowX: Math.max(0, width - box.width),
    overflowY: Math.max(0, height - box.height),
  };
}

function panOffset(overflow: number, pan: number): number {
  // pan = +1 pushes the image left/up so its right/bottom edge is flush.
  return (-Math.max(-1, Math.min(1, pan)) * overflow) / 2;
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

  // One continuous ground for the whole scene, identical to `hookStat`'s (L7).
  // `yield`, not `yield*`, so its clock runs for the scene's full duration
  // alongside everything below and never restarts at a beat boundary.
  const ground = DriftingGround(frame);
  view.add(ground.node);
  yield ground.run(scene.durationSec);

  const geometry = plateGeometry(frame);
  const plate = (
    <Rect
      x={geometry.x}
      y={geometry.y}
      width={geometry.width}
      height={geometry.height}
      radius={geometry.radius}
      // The crops are light lavender; backing the plate in `tint` means a
      // sub-pixel edge during a zoom shows plate colour, not the ground.
      fill={palette.tint}
      opacity={0}
      clip
    />
  ) as Rect;
  view.add(plate);

  const isLast = Boolean(endCardCta);
  const budget = Math.max(
    1,
    scene.durationSec - (isLast ? motion.endCardSec : 0),
  );
  const perStill = budget / scene.stills.length;

  function* stillSequence(): ThreadGenerator {
    let previous: Rect | undefined;

    for (const [index, still] of scene.stills.entries()) {
      const natural = assetSizes[still.src] ?? {
        width: geometry.width,
        height: geometry.height,
      };

      const from = coverGeometry(geometry, natural, still.zoomFrom);
      const to = coverGeometry(geometry, natural, still.zoomTo);

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
      plate.add(holder);

      // The zoom runs `STILL_CROSSFADE_SEC` past the still's own slot, so it is
      // still travelling underneath while the next still dissolves over it.
      yield all(
        img.size([to.width, to.height], perStill + STILL_CROSSFADE_SEC, linear),
        img.position(
          [
            panOffset(to.overflowX, still.panTo.x),
            panOffset(to.overflowY, still.panTo.y),
          ],
          perStill + STILL_CROSSFADE_SEC,
          linear,
        ),
      );

      if (index > 0) {
        yield* holder.opacity(1, STILL_CROSSFADE_SEC, easeOutExpo);
        // The outgoing still is fully covered now, so drop it rather than fade
        // it: two stacked fades would thin the plate for a few frames.
        previous?.remove();
        yield* waitFor(Math.max(0, perStill - STILL_CROSSFADE_SEC));
      } else {
        yield* waitFor(perStill);
      }

      previous = holder;
    }
  }

  // Stills and beats are two independent tracks over the same budget, and both
  // ride on the one ground.
  yield stillSequence();
  yield plate.opacity(1, motion.fadeInSec, easeOutExpo);

  const beats = fitBeatsToBudget(beatsFor(scene), budget).map((beat) => {
    // Top-anchored, not band-centred: the plate owns the lower half, so a
    // four-line beat centred in the content band would run into its top edge.
    const node = Beat(frame, beat.content, { anchorY: frame.contentTop });
    view.add(node);
    return { node, durationSec: beat.durationSec };
  });

  yield* runBeats(beats, {
    onBeatStart: (index, durationSec) =>
      ground.rehue(index, Math.min(motion.fadeInSec, durationSec)),
  });

  if (isLast) {
    const endCard = LogoEndCard(frame);
    view.add(endCard);
    // The plate clears as the logo arrives, so the card closes on the ground
    // alone exactly as `hookStat` does (L9) — and because `runBeats` left the
    // final headline still fading, all three moves overlap in one dissolve.
    yield plate.opacity(0, motion.fadeOutSec, easeInExpo);
    yield* runEndCard(endCard);
  }
}

export default kenBurnsStory;
