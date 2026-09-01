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
 * **Coded plates.** A still may instead be *drawn* rather than photographed. Any
 * still whose `src` ends in `.plate` — by convention
 * `assets/library/plate-<id>.plate` — is rendered by `src/components/Plate.tsx`
 * from the parameters in `src/scenes/plateLibrary.ts`, which is also where the
 * convention is documented and why it is spelled as a file path (the plan schema
 * in `src/schemas/plan.ts` is contract code and only accepts relative
 * `assets/`/`videos/` paths, so a `plate:` marker could never validate). A coded
 * plate ignores the still's `panFrom`/`panTo`/`zoomFrom`/`zoomTo`: a flat vector
 * plate has no grain or detail to reveal, so a Ken Burns move on one is just
 * scaling clean edges. Its motion is internal instead — a travelling dash
 * offset and a few pixels of drift on each motif — which keeps the frame alive
 * through a hold without touching the plate's geometry.
 *
 * The plan's per-still `caption` is deliberately **not** drawn. L10 allows one
 * message on screen at a time, and the beat track already supplies it; the still
 * captions remain plan metadata and are what `scripts/render-plan.ts` writes
 * into the post-copy stub.
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

import { Plate } from "../components/Plate";
import { motion, palette } from "../brand/tokens";
import type { KenBurnsStoryScene } from "../schemas/plan";

import { plateParamsFor } from "./plateLibrary";
import {
  Beat,
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
 */
const STILL_CROSSFADE_SEC = 0.6;

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
  endCardCta?: boolean;
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
 * Plate fills the full frame (Stripe-style) so the illustration IS the page.
 * The plate's own ground (tint/wave/gradient) becomes the scene background,
 * and white headline beats sit on a subtle gradient overlay for contrast.
 */
function plateGeometry(frame: Frame): PlateGeometry {
  return {
    x: 0,
    y: 0,
    width: frame.width,
    height: frame.height,
    radius: 0,
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
  const geometry = plateGeometry(frame);

  // Full-frame plate: the coded illustration IS the page (Stripe/AWS-style).
  // No separate DriftingGround — the plate's own ground (tint/wave/gradient)
  // acts as the scene background.
  const plate = (
    <Rect
      x={0}
      y={0}
      width={frame.width}
      height={frame.height}
      fill={palette.tint}
      opacity={0}
    />
  ) as Rect;
  view.add(plate);

  // Subtle gradient overlay from deep purple (top) → transparent (middle)
  // so white headline beats have contrast against the plate's light tint ground.
  const scrim = (
    <Rect
      x={0}
      y={0}
      width={frame.width}
      height={frame.height}
      opacity={0}
      fill={
        new Gradient({
          type: "linear",
          from: [0, -frame.height / 2],
          to: [0, frame.height / 2],
          stops: [
            { offset: 0, color: `rgba(30, 5, 63, 1)` },
            { offset: 0.35, color: `rgba(30, 5, 63, 0.6)` },
            { offset: 0.55, color: `rgba(30, 5, 63, 0)` },
          ],
        })
      }
    />
  ) as Rect;
  view.add(scrim);

  const isLast = Boolean(endCardCta);
  const budget = Math.max(
    1,
    scene.durationSec - (isLast ? motion.endCardSec : 0),
  );
  const perStill = budget / scene.stills.length;

  function* stillSequence(): ThreadGenerator {
    let previous: Rect | undefined;

    for (const [index, still] of scene.stills.entries()) {
      const holder = (<Rect opacity={index === 0 ? 1 : 0} />) as Rect;
      plate.add(holder);

      const plateParams = plateParamsFor(still.src);

      if (plateParams) {
        const coded = Plate({
          ...plateParams,
          width: geometry.width,
          height: geometry.height,
        });
        holder.add(coded.node);
        // The drift clock is `yield`ed so it keeps ticking for the rest of the
        // scene rather than blocking the slot, and the motifs fade up on the
        // same frames the holder dissolves in.
        yield coded.run(scene.durationSec);
        yield coded.enter();
      } else {
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
        holder.add(img);

        // The zoom runs `STILL_CROSSFADE_SEC` past the still's own slot, so it
        // is still travelling underneath while the next still dissolves over it.
        yield all(
          img.size(
            [to.width, to.height],
            perStill + STILL_CROSSFADE_SEC,
            linear,
          ),
          img.position(
            [
              panOffset(to.overflowX, still.panTo.x),
              panOffset(to.overflowY, still.panTo.y),
            ],
            perStill + STILL_CROSSFADE_SEC,
            linear,
          ),
        );
      }

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

  // Stills cross-dissolve in the background while drift clocks run, then the
  // plate reveals with the scrim so the illustration is full-frame when beats begin.
  yield stillSequence();
  yield all(
    plate.opacity(1, motion.fadeInSec, easeOutExpo),
    scrim.opacity(1, motion.fadeInSec, easeOutExpo),
  );

  // Beat positioning: top-anchored since the full-bleed plate fills the frame.
  // The scrim overlay provides contrast for white text against tint backgrounds.
  const beats = fitBeatsToBudget(beatsFor(scene), budget).map((beat) => {
    const node = Beat(frame, beat.content, { anchorY: frame.contentTop });
    view.add(node);
    return { node, durationSec: beat.durationSec };
  });

  yield* runBeats(beats);

  if (isLast) {
    const endCard = LogoEndCard(frame);
    view.add(endCard);
    // The plate and scrim clear together as the logo arrives.
    yield all(
      plate.opacity(0, motion.fadeOutSec, easeInExpo),
      scrim.opacity(0, motion.fadeOutSec, easeInExpo),
    );
    yield* runEndCard(endCard);
  }
}

export default kenBurnsStory;
