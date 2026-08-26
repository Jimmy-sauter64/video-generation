/**
 * `Plate` — a parametric, coded Pay Theory brand plate.
 *
 * This is the video-side implementation of the *image* spec in
 * `docs/style/image-exemplar-analysis.md` §3, cloning the grammar of exemplar
 * post #2 (`docs/style/image-exemplars/7488625701529604096.jpg`, the flat-vector
 * "Every payments odyssey…" plate the analysis calls "the purest plate and the
 * one to clone").
 *
 * ## What it draws, back to front (§3 draw order)
 *
 * 1. **Ground** — one continuous surface, never blocked panels (I2). `flat` is
 *    a `tint` field; `wave` adds one `accent`@50% wave band filling the bottom
 *    30%; `gradient` is a 15° `tint`→`accent`@45% ramp plus a fainter band.
 * 2. **Motifs** — 1–4 flat vector marks from the drawn library: a dashed route
 *    path, a four-point star, thin wave lines, a rounded-hull boat, and a
 *    compass-rose watermark at low opacity.
 * 3. **Hero object** — exactly one motif drawn large and bottom-weighted, its
 *    baseline on the ground line at 72% of plate height, group height 34–36% of
 *    plate height (§3 asks 26–38%), so nothing is drawn above 30% (I4).
 * 4. **Finish** — dead flat (I3): no grain, no glow, no bevel, no shadow. The
 *    drifting ground's grain lives in `sceneKit.DriftingGround` and stays there;
 *    a plate never adds texture of its own.
 *
 * ## What it deliberately does *not* draw
 *
 * §3 items (5) and (6) — the heavy eyebrow/headline/rule column and the
 * wordmark — are **omitted on purpose**. The analysis flags the split itself:
 * image law I5 ("type is heavy, 700–800") "deliberately contradicts video law
 * L3 (never 700+) — stills carry weight, motion doesn't". In a video the type is
 * the beat track, set at weight 600 by `sceneKit.Beat` on the drifting ground,
 * and the logo is the L9 end card. A plate that carried its own headline and
 * wordmark would put two type systems and two brand marks in one frame. So
 * `Plate` supplies the *illustration* half of the exemplar grammar and the scene
 * supplies the type half.
 *
 * ## Colour, determinism, motion
 *
 * - Every fill and stroke resolves through `plateLibrary`'s `GROUND_INKS` /
 *   `MOTIF_INKS` tables into a `src/brand/tokens.ts` palette key (I1). No hex
 *   literal appears below, and `white` is not a legal plate ink.
 * - All jitter is derived from `params.seed` through an FNV-1a hash feeding an
 *   LCG. No `Math.random`, no `Date.now` (the determinism lint enforces this for
 *   `src/components`). Verified: two consecutive draft renders of the odyssey
 *   plan decode to identical RGBA frames at t = 0.5s, 10.5s and 17.5s.
 * - Motion is slow drift and dash-offset only, plus staggered opacity
 *   entrances — nothing scales, rotates, or springs (L1).
 *
 * All geometry below is expressed as a fraction of the plate box, so the same
 * component composes at any size or aspect.
 */

import { Circle, Path, Rect, Gradient, type Node } from "@revideo/2d";
import {
  createSignal,
  easeOutExpo,
  linear,
  waitFor,
  type SimpleSignal,
  type ThreadGenerator,
} from "@revideo/core";

import { palette } from "../brand/tokens";
import {
  GROUND_INKS,
  MAX_MOTIFS,
  MOTIF_INKS,
  type MotifKind,
  type PlateInk,
  type PlateParams,
} from "../scenes/plateLibrary";

/* ------------------------------------------------------------ composition */

/** Top of the ground line, as a fraction of plate height. */
const BAND_TOP = 0.7;

/** Baseline the hero object stands on, as a fraction of plate height (§3). */
const HERO_BASELINE = 0.72;

/**
 * Nothing is drawn above this fraction of plate height.
 *
 * §3's hard assert is "top 25% holds no ink"; the exemplar itself holds its top
 * **28.7%** empty. Building to 30% keeps the assert true with margin even after
 * h264 chroma smearing pulls a dash or a star point upward by a pixel.
 */
const INK_CEILING = 0.3;

/** Seconds a plate's parts take to fade up, and the gap between them. */
const ENTER_SEC = 0.45;
const ENTER_STAGGER_SEC = 0.1;

/** Dashed-route travel, in px per second of scene time. */
const DASH_TRAVEL_PX_PER_SEC = 7;

/* ------------------------------------------------------------ determinism */

/** FNV-1a over the seed string, then an LCG — deterministic, lint-clean. */
function seededStream(seed: string): () => number {
  let state = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    state = (state ^ seed.charCodeAt(index)) >>> 0;
    state = Math.imul(state, 0x01000193) >>> 0;
  }
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

/* ----------------------------------------------------------------- colour */

function rgba(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function ink(token: PlateInk, alpha = 1): string {
  return alpha >= 1 ? palette[token] : rgba(palette[token], alpha);
}

/* ------------------------------------------------------------------ paths
 *
 * Every builder emits SVG path data whose bounding box is **exactly**
 * `w x h` centred on the origin. That matters: Revideo's `Path` sizes and
 * centres itself on its own profile bbox, so a path whose extremes are only
 * approached by a control point would be positioned off by the shortfall.
 * Each curve below therefore reaches its extremes at an on-curve endpoint.
 */

/** Rounded hull: flat deck, curved bottom, tips flaring up at the sides. */
function hullPath(w: number, h: number): string {
  const x = w / 2;
  const y = h / 2;
  return `M ${-x} ${-y} L ${x} ${-y} C ${0.44 * w} ${0.2 * h}, ${0.26 * w} ${y}, 0 ${y} C ${-0.26 * w} ${y}, ${-0.44 * w} ${0.2 * h}, ${-x} ${-y} Z`;
}

/** Sail: straight luff on the left (against the mast), curved leech bulging right. */
function sailPath(w: number, h: number): string {
  const x = w / 2;
  const y = h / 2;
  return `M ${-x} ${y} L ${-x} ${-y} C ${0.1 * w} ${-0.2 * h}, ${0.45 * w} ${0.15 * h}, ${x} ${y} Z`;
}

/** Four-point star with concave flanks — the exemplar's only flourish. */
function starPath(w: number, h: number): string {
  const x = w / 2;
  const y = h / 2;
  return [
    `M 0 ${-y}`,
    `C ${0.06 * w} ${-0.14 * h}, ${0.14 * w} ${-0.06 * h}, ${x} 0`,
    `C ${0.14 * w} ${0.06 * h}, ${0.06 * w} ${0.14 * h}, 0 ${y}`,
    `C ${-0.06 * w} ${0.14 * h}, ${-0.14 * w} ${0.06 * h}, ${-x} 0`,
    `C ${-0.14 * w} ${-0.06 * h}, ${-0.06 * w} ${-0.14 * h}, 0 ${-y}`,
    "Z",
  ].join(" ");
}

/** The horizon band: one soft wave along the top, flush to the plate bottom. */
function bandPath(w: number, h: number): string {
  const x = w / 2;
  const top = -h / 2;
  const amp = h * 0.22;
  return [
    `M ${-x} ${top + amp}`,
    `Q ${-0.3 * w} ${top}, ${-0.1 * w} ${top}`,
    `Q ${0.1 * w} ${top}, ${0.32 * w} ${top + amp}`,
    `Q ${0.44 * w} ${top + amp * 1.6}, ${x} ${top + amp * 1.2}`,
    `L ${x} ${h / 2}`,
    `L ${-x} ${h / 2}`,
    "Z",
  ].join(" ");
}

/** The dashed trail: bottom-left to top-right, dipping through the middle. */
function routePath(w: number, h: number): string {
  const x = w / 2;
  const y = h / 2;
  return `M ${-x} ${y} C ${-0.15 * w} ${0.42 * h}, ${0.12 * w} ${0.1 * h}, ${x} ${-y}`;
}

/** A single wave tick — the small tildes sitting in the exemplar's water. */
function tildePath(w: number, h: number): string {
  const x = w / 2;
  const y = h / 2;
  return `M ${-x} ${y} Q ${-0.25 * w} ${-y}, 0 0 Q ${0.25 * w} ${y}, ${x} ${-y}`;
}

/* ------------------------------------------------------------------- api */

export interface PlateProps extends PlateParams {
  /** Plate box, in px. Drawn centred on its parent's origin. */
  readonly width: number;
  readonly height: number;
}

export interface PlateHandle {
  /** Add this to the scene. */
  readonly node: Rect;
  /** Start the plate's drift clock. `yield` (not `yield*`) so it runs alongside. */
  run(durationSec: number): ThreadGenerator;
  /** Staggered opacity entrance for the motifs and hero (the ground is instant). */
  enter(): ThreadGenerator;
}

/* --------------------------------------------------------------- drawing */

interface Site {
  /** Plate-local geometry helpers, all in centre-origin px. */
  readonly width: number;
  readonly height: number;
  readonly clock: SimpleSignal<number>;
  /** Fraction of width → centre-origin x. */
  x(fraction: number): number;
  /** Fraction of height → centre-origin y. */
  y(fraction: number): number;
  /** Deterministic jitter in [-1, 1). */
  jitter(): number;
}

/** A slow sinusoid on the plate clock — the only positional motion allowed. */
function drift(
  site: Site,
  base: number,
  amplitudePx: number,
  periodSec: number,
  phase: number,
): () => number {
  return () =>
    base +
    amplitudePx *
      Math.sin((2 * Math.PI * site.clock()) / periodSec + phase * 2 * Math.PI);
}

function Ground(site: Site, params: PlateParams): Node {
  const inks = GROUND_INKS[params.ground];
  const group = (<Rect />) as Rect;

  group.add(
    <Rect width={site.width} height={site.height} fill={ink(inks.base)} />,
  );

  if (params.ground === "gradient") {
    // 15° ramp per I2/§3, expressed on the plate's own diagonal so the angle
    // holds at any aspect. The ramp is `accent` fading in over the `tint` floor,
    // which keeps the composite on the ramp instead of introducing a new hex.
    const radians = (15 * Math.PI) / 180;
    const length =
      (Math.abs(Math.cos(radians)) * site.width +
        Math.abs(Math.sin(radians)) * site.height) /
      2;
    const dx = Math.cos(radians) * length;
    const dy = Math.sin(radians) * length;
    group.add(
      <Rect
        width={site.width}
        height={site.height}
        fill={
          new Gradient({
            type: "linear",
            from: [-dx, -dy],
            to: [dx, dy],
            stops: [
              { offset: 0, color: ink("accent", 0) },
              { offset: 1, color: ink("accent", 0.45) },
            ],
          })
        }
      />,
    );
  }

  if (params.ground !== "flat" && "band" in inks) {
    const bandHeight = site.height * (1 - BAND_TOP);
    group.add(
      <Path
        data={bandPath(site.width, bandHeight)}
        y={site.y((1 + BAND_TOP) / 2)}
        fill={ink(inks.band, params.ground === "wave" ? 0.5 : 0.3)}
      />,
    );
  }

  return group;
}

/** One motif or hero object, already positioned. `hero` switches scale/role. */
function Motif(
  site: Site,
  kind: MotifKind,
  hero: boolean,
  order: number,
): Node {
  const group = (<Rect opacity={0} />) as Rect;
  const nudgeX = site.jitter() * site.width * 0.012;
  const nudgeY = site.jitter() * site.height * 0.012;
  const phase = site.jitter();
  const strokeWidth = Math.max(3, Math.round(site.width * 0.0055));

  switch (kind) {
    case "route": {
      // The one stroke the spec allows: a 4px dashed `accent`-ramp trail (§3).
      const width = site.width * 0.9;
      const height = site.height * (0.9 - 0.36);
      group.add(
        <Path
          data={routePath(width, height)}
          x={site.x(0.47) + nudgeX}
          y={site.y(0.63)}
          stroke={ink(MOTIF_INKS[kind].line, 0.5)}
          lineWidth={strokeWidth + 1}
          lineCap="round"
          lineDash={[14, 11]}
          lineDashOffset={() => -site.clock() * DASH_TRAVEL_PX_PER_SEC}
        />,
      );
      break;
    }

    case "star": {
      const height = site.height * (hero ? 0.36 : 0.15);
      // The hero star is set wider than the motif star: at 0.60 its lower point
      // tapered to a needle that read as a stand under the object, not a point.
      const width = height * (hero ? 0.68 : 0.6);
      const centreY = hero ? site.y(HERO_BASELINE - 0.18) : site.y(0.42);
      group.add(
        <Path
          data={starPath(width, height)}
          x={(hero ? site.x(0.52) : site.x(0.905)) + nudgeX}
          y={drift(site, centreY, hero ? 2.5 : 3, hero ? 10 : 9, phase)}
          fill={ink(MOTIF_INKS[kind].body)}
        />,
      );
      break;
    }

    case "waveLines": {
      const width = site.width * 0.085;
      const height = site.height * 0.022;
      const seats: readonly (readonly [number, number, number])[] = [
        [0.1, 0.88, 7],
        [0.23, 0.94, 9],
        [0.35, 0.83, 11],
      ];
      for (const [fx, fy, periodSec] of seats) {
        const localPhase = site.jitter();
        group.add(
          <Path
            data={tildePath(width, height)}
            x={drift(
              site,
              site.x(fx) + site.jitter() * site.width * 0.02,
              5,
              periodSec,
              localPhase,
            )}
            y={site.y(fy)}
            stroke={ink(MOTIF_INKS[kind].line, 0.3)}
            lineWidth={strokeWidth}
            lineCap="round"
          />,
        );
      }
      break;
    }

    case "boat": {
      // Four fills, no strokes: hull, sail, mast, and (hero only) nothing else.
      const hullWidth = site.width * (hero ? 0.3 : 0.16);
      const hullHeight = site.height * (hero ? 0.13 : 0.07);
      const sailWidth = site.width * (hero ? 0.1 : 0.055);
      const sailHeight = site.height * (hero ? 0.2 : 0.11);
      const baseline = hero ? HERO_BASELINE : 0.68;
      const deck = baseline - (hero ? 0.13 : 0.07);
      const centreX = (hero ? site.x(0.44) : site.x(0.24)) + nudgeX;
      const mastX = centreX + site.width * 0.01;
      const mastHeight = sailHeight + site.height * 0.03;
      const bob = drift(site, 0, 3, 6.5, phase);

      group.add(
        <Path
          data={hullPath(hullWidth, hullHeight)}
          x={centreX}
          y={() => site.y(baseline) - hullHeight / 2 + bob()}
          fill={ink(MOTIF_INKS[kind].hull)}
        />,
      );
      group.add(
        <Rect
          width={Math.max(3, Math.round(site.width * 0.006))}
          height={mastHeight}
          x={mastX}
          y={() => site.y(deck) + site.height * 0.01 - mastHeight / 2 + bob()}
          fill={ink(MOTIF_INKS[kind].mast)}
        />,
      );
      group.add(
        <Path
          data={sailPath(sailWidth, sailHeight)}
          x={mastX + sailWidth / 2}
          y={() => site.y(deck) - sailHeight / 2 + bob()}
          fill={ink(MOTIF_INKS[kind].sail)}
        />,
      );
      break;
    }

    case "compass": {
      // Hero: a legible rose standing on the ground line at the top of §3's
      // 26–38% band. Motif: a small watermark rose sunk into the water at the
      // right, sized to sit *entirely inside* the band — the first draft used a
      // 55%-tall watermark clipped by the plate edge, which read as a stray
      // spike rather than a compass.
      const diameter = site.height * (hero ? 0.38 : 0.3);
      const centreX = (hero ? site.x(0.48) : site.x(0.855)) + nudgeX;
      const centreY =
        (hero ? site.y(HERO_BASELINE) - diameter / 2 : site.y(0.85)) + nudgeY;
      const alpha = hero ? 1 : 0.36;
      const glide = drift(site, centreX, hero ? 2 : 4, hero ? 12 : 13, phase);

      group.add(
        <Circle
          width={diameter}
          height={diameter}
          x={glide}
          y={centreY}
          stroke={ink(MOTIF_INKS[kind].ring, 0.95 * alpha)}
          lineWidth={Math.max(2, Math.round(diameter * 0.026))}
        />,
      );
      group.add(
        <Circle
          width={diameter * 0.62}
          height={diameter * 0.62}
          x={glide}
          y={centreY}
          stroke={ink(MOTIF_INKS[kind].ring, 0.7 * alpha)}
          lineWidth={Math.max(2, Math.round(diameter * 0.018))}
        />,
      );
      group.add(
        <Path
          data={starPath(diameter * 0.94, diameter * 0.3)}
          x={glide}
          y={centreY}
          fill={ink(MOTIF_INKS[kind].rose, 0.45 * alpha)}
        />,
      );
      group.add(
        <Path
          data={starPath(diameter * 0.3, diameter * 0.94)}
          x={glide}
          y={centreY}
          fill={ink(MOTIF_INKS[kind].rose, alpha)}
        />,
      );
      break;
    }
  }

  group.opacity(0);
  group.zIndex(order);
  return group;
}

/* --------------------------------------------------------------- factory */

export function Plate(props: PlateProps): PlateHandle {
  const { width, height, ground, hero, motifs, seed } = props;
  const clock: SimpleSignal<number> = createSignal(0);
  const next = seededStream(seed);

  const site: Site = {
    width,
    height,
    clock,
    x: (fraction) => -width / 2 + fraction * width,
    y: (fraction) => -height / 2 + fraction * height,
    jitter: () => next() * 2 - 1,
  };

  const node = (<Rect width={width} height={height} clip />) as Rect;
  node.add(Ground(site, { seed, ground, hero, motifs }));

  // Motifs are added first and the hero last, so the hero always reads in front
  // (I4). The *entrance* order is the reverse: the hero fades up on the plate's
  // first frames and the motifs settle in behind it. Staggering the hero last
  // left the middle of a 0.6s plate-to-plate dissolve with no hero at all — the
  // outgoing object gone, the incoming one not yet arrived.
  const motifNodes: Rect[] = [];
  for (const [index, kind] of motifs.slice(0, MAX_MOTIFS).entries()) {
    const motif = Motif(site, kind, false, index + 1) as Rect;
    node.add(motif);
    motifNodes.push(motif);
  }
  const heroNode = Motif(site, hero, true, MAX_MOTIFS + 1) as Rect;
  node.add(heroNode);
  const entrances: Rect[] = [heroNode, ...motifNodes];

  return {
    node,
    *run(durationSec: number): ThreadGenerator {
      yield* clock(durationSec, durationSec, linear);
    },
    *enter(): ThreadGenerator {
      for (const group of entrances) {
        yield group.opacity(1, ENTER_SEC, easeOutExpo);
        yield* waitFor(ENTER_STAGGER_SEC);
      }
      yield* waitFor(ENTER_SEC);
    },
  };
}

/** Fraction of plate height that must stay free of ink (§3's first assert). */
export const PLATE_INK_CEILING = INK_CEILING;

export default Plate;
