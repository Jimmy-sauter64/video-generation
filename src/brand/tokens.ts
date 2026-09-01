/**
 * Pay Theory brand tokens for short-form video generation.
 *
 * Single source of truth for color, type, logo, and layout-safety values
 * used by scene/composition code. See src/brand/brand.md for the style
 * contract (voice, hook rules, caption defaults) these tokens implement.
 */

/** Brand color palette. All values are hex strings. */
export interface Palette {
  /** Primary brand purple — dominant UI/background color. */
  readonly primary: string;
  /** Darker anchor purple — secondary backgrounds, depth. */
  readonly deepAnchor: string;
  /** Deepest purple — high-contrast backgrounds behind captions/hooks. */
  readonly deepest: string;
  /** Near-black ink — body text on light surfaces. */
  readonly ink: string;
  /** Violet accent — sparing use for emphasis words/highlights. */
  readonly accent: string;
  /** Light lavender tint — off-white space, subtle fills. */
  readonly tint: string;
  /** Pure white — generous white space, text on dark. */
  readonly white: string;
}

export const palette: Palette = {
  primary: "#6C2BD9",
  deepAnchor: "#53259D",
  deepest: "#2E1457",
  ink: "#1C0D36",
  accent: "#A971F7",
  tint: "#EDE0FD",
  white: "#FFFFFF",
};

/** A single weighted font file for one family. */
export interface FontWeightFile {
  /** Numeric font-weight value (e.g. 500, 700). */
  readonly weight: number;
  /** Path to the woff2 file, relative to the repo root. */
  readonly path: string;
}

/** One font family: its display name and the weight files available. */
export interface FontFamily {
  /** CSS font-family name to register/use. */
  readonly name: string;
  /** Weight files available for this family, vendored under assets/brand/fonts. */
  readonly files: readonly FontWeightFile[];
  /** Generic fallback stack appended after the family name. */
  readonly fallback: string;
}

/**
 * Font configuration. `display` is the family used for all short-form on-screen
 * type (headline beats, support lines, eyebrows). It currently points to
 * Instrument Sans as a free OFL stand-in for Halyard — see brand.md for
 * rationale. Swapping to real Halyard is a one-line change: replace this
 * `display` object with the Halyard family/files and update the paths.
 */
export interface Fonts {
  readonly display: FontFamily;
}

export const fonts: Fonts = {
  display: {
    name: "Instrument Sans",
    fallback:
      "'Instrument Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif",
    files: [
      { weight: 400, path: "assets/brand/fonts/instrument-sans-400.woff2" },
      { weight: 500, path: "assets/brand/fonts/instrument-sans-500.woff2" },
      { weight: 600, path: "assets/brand/fonts/instrument-sans-600.woff2" },
      { weight: 700, path: "assets/brand/fonts/instrument-sans-700.woff2" },
    ],
  },
};

/**
 * Type weights, per the exemplar measurement in
 * `docs/style/exemplar-analysis.md` (L3): every headline in the reference set is
 * sentence case at 500–600. 700 is vendored for completeness but must not be
 * used for headline or body type — it is the "louder and denser than the bar"
 * tell the analysis calls out.
 */
export interface TypeWeights {
  /** Headline beats and stat values. */
  readonly headline: number;
  /** Support/subhead lines and letterspaced eyebrows. */
  readonly support: number;
}

export const typeWeights: TypeWeights = {
  headline: 600,
  support: 500,
};

/**
 * Type scale, normalised to frame width (L4). The headline is the only absolute
 * measure; everything else is a ratio of it, so a ratio change never desyncs the
 * hierarchy.
 */
export interface TypeScale {
  /** Headline font size as a fraction of frame width. */
  readonly headlineOfWidth: number;
  /** Support/subhead size as a multiple of the headline size. */
  readonly supportRatio: number;
  /** Letterspaced caps eyebrow size as a multiple of the headline size. */
  readonly eyebrowRatio: number;
  /** Eyebrow tracking, in em. */
  readonly eyebrowTrackingEm: number;
  /** Line height multiple, measured at 1.12–1.17 across all four exemplars. */
  readonly lineHeight: number;
  /** Upper bound on wrapped characters per line. */
  readonly wrapChars: number;
  /** Hard cap on lines in a single block. */
  readonly maxLines: number;
}

export const typeScale: TypeScale = {
  headlineOfWidth: 0.08,
  supportRatio: 0.55,
  eyebrowRatio: 0.42,
  eyebrowTrackingEm: 0.12,
  lineHeight: 1.15,
  wrapChars: 28,
  maxLines: 4,
};

/**
 * Motion constants (L1). Opacity is the only entrance and the only exit; the
 * easing names map exactly onto the measured CSS curves —
 * `easeOutExpo` is `cubic-bezier(0.16, 1, 0.3, 1)` and `easeInExpo` is
 * `cubic-bezier(0.7, 0, 0.84, 0)`.
 */
export interface Motion {
  /** Fade-in duration, seconds. Measured 0.60–0.80s. */
  readonly fadeInSec: number;
  /** Fade-out duration, seconds. Always ~half the fade-in. */
  readonly fadeOutSec: number;
  /** Held beat length, seconds. Measured 3.7–4.5s sustained. */
  readonly beatSec: number;
  /** Logo end card hold, seconds. Measured 2.5–4.0s. */
  readonly endCardSec: number;
}

export const motion: Motion = {
  fadeInSec: 0.7,
  fadeOutSec: 0.35,
  beatSec: 3.5,
  endCardSec: 3,
};

/** Vendored logo asset paths, relative to the repo root. */
export interface Logos {
  /** Single-color logomark (SVG), for small/compact placements. */
  readonly logomarkSvg: string;
  /**
   * The same logomark filled white, for placements on a deep background.
   * Identical geometry to `logomarkSvg`; only the fill differs.
   */
  readonly logomarkWhiteSvg: string;
  /** Full logo lockup, 1080x1080 PNG, for large/hero placements. */
  readonly logo1080Png: string;
}

export const logos: Logos = {
  logomarkSvg: "assets/brand/pay-theory-logomark.svg",
  logomarkWhiteSvg: "assets/brand/pay-theory-logomark-white.svg",
  logo1080Png: "assets/brand/pay-theory-logo-1080.png",
};

/** Pixel margins kept clear of platform UI chrome on every edge. */
export interface SafeAreaMargins {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

/** A rectangular zone expressed as pixel offsets from the frame's top-left. */
export interface Zone {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Safe-area and caption-zone spec for one video aspect ratio. */
export interface RatioSafeArea {
  readonly width: number;
  readonly height: number;
  readonly margins: SafeAreaMargins;
  /**
   * Lower-third caption zone.
   *
   * @deprecated The exemplar spec (L6/L10) leaves the bottom third empty and
   * ships no caption track, so no scene draws here any more. Retained only so
   * the deprecated `src/components/Captions.tsx` keeps type-checking.
   */
  readonly captionZone: Zone;
}

/**
 * Safe areas per supported aspect ratio.
 *
 * Side margins are **12% of frame width** per L5: the exemplars measure 12.4%
 * (v3) to 24% (v1) and never let type approach the edge. The previous ~7%
 * margins let a headline run 86% of the frame — nearly 20 points wider than any
 * reference video. Scenes additionally cap the text column at 70% of width.
 *
 * 9x16 (Reels/TikTok/Shorts) keeps its larger top/bottom insets (~15% top,
 * ~20% bottom) to clear platform UI chrome. 4x5 (feed) uses a 9% top inset and a
 * 12% bottom inset; scenes anchor content to the top 63% regardless (L6).
 */
export interface SafeAreas {
  readonly "4x5": RatioSafeArea;
  readonly "9x16": RatioSafeArea;
}

export const safeAreas: SafeAreas = {
  "4x5": {
    width: 1080,
    height: 1350,
    margins: {
      top: 122, // ~9% of 1350 — matches v3's 9% top anchor
      bottom: 162, // 12% of 1350
      left: 130, // 12% of 1080
      right: 130, // 12% of 1080
    },
    captionZone: {
      x: 130,
      y: 1080,
      width: 820, // 1080 - left - right
      height: 108, // 1350 - 1080 - bottom margin (162)
    },
  },
  "9x16": {
    width: 1080,
    height: 1920,
    margins: {
      top: 288, // 15% of 1920
      bottom: 384, // 20% of 1920
      left: 130, // 12% of 1080
      right: 130, // 12% of 1080
    },
    captionZone: {
      x: 130,
      y: 1400,
      width: 820, // 1080 - left - right
      height: 136, // 1920 - 1400 - bottom margin (384)
    },
  },
};

/**
 * Text column cap as a fraction of frame width (L5: "text occupies 55–70% of
 * frame width"). Scenes use `min(contentWidth, width * textColumnOfWidth)`.
 */
export const textColumnOfWidth = 0.7;

/**
 * Fraction of frame height that content may occupy, measured from the top.
 * v3 runs y 9%–63% and leaves the bottom 37% as pure negative space (L6).
 */
export const contentBottomOfHeight = 0.63;
