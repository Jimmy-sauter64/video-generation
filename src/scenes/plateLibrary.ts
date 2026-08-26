/**
 * The coded-plate library: the string → plate-parameter mapping, plus the ink
 * declaration every plate is painted from.
 *
 * ## The plate-reference convention (why it looks like a file path)
 *
 * `src/schemas/plan.ts` is contract code and is never edited from the template
 * side. Its `assetPathSchema` requires a still's `src` to be a relative path
 * starting with `assets/` or `videos/`, so a bare `"plate:odyssey-ship"` marker
 * cannot pass `parsePlan`. The reserved convention is therefore:
 *
 * ```
 * assets/library/plate-<id>.plate
 * ```
 *
 * — a normal-looking relative asset path whose **extension is `.plate`**. Any
 * still whose `src` ends in `.plate` is drawn by `src/components/Plate.tsx`
 * from the parameters in `PLATE_LIBRARY` below; its `panFrom`/`panTo`/`zoomFrom`
 * /`zoomTo` fields are ignored (a coded plate's motion is internal drift, not a
 * Ken Burns move) but must still be present and valid, because the schema is
 * untouched.
 *
 * `scripts/render-plan.ts` is also contract code, and it `existsSync`-checks and
 * `ffprobe`s every still `src` before rendering. The referenced `.plate` files
 * therefore exist on disk as 1440x800 flat-`tint` PNG placeholders (PNG bytes,
 * `.plate` extension — ffprobe sniffs content, not the name). Nothing reads
 * their pixels; they exist only so the unmodified render CLI's probe succeeds.
 *
 * ## Ink declarations
 *
 * `GROUND_INKS` / `MOTIF_INKS` are the single source of truth for which palette
 * tokens a plate part may paint. `Plate.tsx` looks its colours up here rather
 * than naming hexes inline, and the §3 assert script counts distinct fills from
 * the same tables — so the assert measures the drawing, not a restatement of it.
 * Only `src/brand/tokens.ts` palette keys may appear (image law I1).
 */

import { palette, type Palette } from "../brand/tokens";

/** Chromatic palette keys a plate may paint. `white` is deliberately excluded:
 * every fill in a plate must sit on the one purple ramp (I1). */
export type PlateInk = Exclude<keyof Palette, "white">;

/** Continuous-ground variants (I2 — never blocked panels). */
export type GroundKind = "flat" | "wave" | "gradient";

/** The drawn motif library. Any one of these can also be the hero object. */
export type MotifKind = "route" | "star" | "waveLines" | "boat" | "compass";

export interface PlateParams {
  /** Deterministic seed for jitter and drift phases (slug/id derived). */
  readonly seed: string;
  readonly ground: GroundKind;
  /** The single hero object, bottom-weighted on the ground line (I4). */
  readonly hero: MotifKind;
  /** 1–4 supporting motifs; anything past the fourth is dropped. */
  readonly motifs: readonly MotifKind[];
}

export const GROUND_INKS = {
  flat: { base: "tint" },
  wave: { base: "tint", band: "accent" },
  gradient: { base: "tint", band: "accent" },
} as const satisfies Record<GroundKind, Readonly<Record<string, PlateInk>>>;

export const MOTIF_INKS = {
  route: { line: "primary" },
  star: { body: "primary" },
  waveLines: { line: "primary" },
  boat: { hull: "deepest", sail: "primary", mast: "deepest" },
  compass: { ring: "accent", rose: "primary" },
} as const satisfies Record<MotifKind, Readonly<Record<string, PlateInk>>>;

/** Hard cap on supporting motifs (the spec's "1–4 flat vector motifs"). */
export const MAX_MOTIFS = 4;

/** Every distinct palette token this plate will paint, in palette order. */
export function plateFillTokens(params: PlateParams): PlateInk[] {
  const used = new Set<PlateInk>(Object.values(GROUND_INKS[params.ground]));
  for (const kind of [params.hero, ...params.motifs.slice(0, MAX_MOTIFS)]) {
    for (const ink of Object.values(MOTIF_INKS[kind])) {
      used.add(ink);
    }
  }
  const order = Object.keys(palette) as (keyof Palette)[];
  return order.filter((key): key is PlateInk => used.has(key as PlateInk));
}

/**
 * The plate catalogue. Keys are plate ids; a still references one as
 * `assets/library/plate-<id>.plate`.
 *
 * The three odyssey plates are one family, exactly as the four exemplar posts
 * are: one ground language, one hue ramp, one hero apiece, and the same dashed
 * route running through all three so the cut reads as a continuing voyage.
 */
export const PLATE_LIBRARY: Readonly<Record<string, PlateParams>> = {
  "odyssey-ship": {
    seed: "odyssey-ship",
    ground: "wave",
    hero: "boat",
    motifs: ["compass", "route", "star", "waveLines"],
  },
  "odyssey-compass": {
    seed: "odyssey-compass",
    ground: "gradient",
    hero: "compass",
    motifs: ["route", "star", "waveLines"],
  },
  "odyssey-star": {
    seed: "odyssey-star",
    ground: "wave",
    hero: "star",
    motifs: ["compass", "route", "waveLines"],
  },
};

/** Extension that marks a still `src` as a coded plate rather than a bitmap. */
export const PLATE_REF_EXTENSION = ".plate";

/** Optional filename prefix, so the reference reads as a plate at a glance. */
const PLATE_REF_PREFIX = "plate-";

/** The canonical reference path for a plate id. */
export function plateRefFor(id: string): string {
  return `assets/library/${PLATE_REF_PREFIX}${id}${PLATE_REF_EXTENSION}`;
}

/** `assets/library/plate-odyssey-ship.plate` → `odyssey-ship`; else `null`. */
export function plateIdFromSrc(src: string): string | null {
  if (!src.endsWith(PLATE_REF_EXTENSION)) {
    return null;
  }
  const base = src.slice(src.lastIndexOf("/") + 1, -PLATE_REF_EXTENSION.length);
  return base.startsWith(PLATE_REF_PREFIX)
    ? base.slice(PLATE_REF_PREFIX.length)
    : base;
}

/**
 * Parameters for a still `src`, or `null` when the still is an ordinary image.
 *
 * An unknown plate id throws rather than silently falling back to the image
 * path: a typo in a plan would otherwise render as a missing-asset crash deep
 * inside Revideo instead of naming the id at the top of the render.
 */
export function plateParamsFor(src: string): PlateParams | null {
  const id = plateIdFromSrc(src);
  if (id === null) {
    return null;
  }
  const params = PLATE_LIBRARY[id];
  if (!params) {
    throw new Error(
      `unknown plate id "${id}" (from still src "${src}"); known ids: ${Object.keys(
        PLATE_LIBRARY,
      ).join(", ")}`,
    );
  }
  return params;
}
