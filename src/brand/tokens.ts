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
 * Font configuration. `display` is the family used for bold short-form
 * on-screen type (hooks, headlines, captions). It currently points to
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
      { weight: 500, path: "assets/brand/fonts/instrument-sans-500.woff2" },
      { weight: 700, path: "assets/brand/fonts/instrument-sans-700.woff2" },
    ],
  },
};

/** Vendored logo asset paths, relative to the repo root. */
export interface Logos {
  /** Single-color logomark (SVG), for small/compact placements. */
  readonly logomarkSvg: string;
  /** Full logo lockup, 1080x1080 PNG, for large/hero placements. */
  readonly logo1080Png: string;
}

export const logos: Logos = {
  logomarkSvg: "assets/brand/pay-theory-logomark.svg",
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
   * Lower-third caption zone, guaranteed to sit fully inside `margins`.
   * Expressed in absolute frame pixels.
   */
  readonly captionZone: Zone;
}

/**
 * Safe areas per supported aspect ratio.
 *
 * 9x16 (Reels/TikTok/Shorts) carries larger top/bottom insets (~15% top,
 * ~20% bottom) to clear platform UI chrome (status bar, caption/share
 * stack, profile/CTA rail). 4x5 (feed) carries modest insets (~7%) since
 * feed placements have little to no overlaid UI.
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
      top: 95, // ~7% of 1350
      bottom: 95, // ~7% of 1350
      left: 76, // ~7% of 1080
      right: 76, // ~7% of 1080
    },
    captionZone: {
      x: 76,
      y: 1080, // lower third, above bottom margin
      width: 928, // 1080 - left - right
      height: 175, // 1350 - 1080 - bottom margin (95)
    },
  },
  "9x16": {
    width: 1080,
    height: 1920,
    margins: {
      top: 288, // 15% of 1920
      bottom: 384, // 20% of 1920
      left: 76, // ~7% of 1080
      right: 76, // ~7% of 1080
    },
    captionZone: {
      x: 76,
      y: 1400, // lower third, above bottom margin
      width: 928, // 1080 - left - right
      height: 136, // 1920 - 1400 - bottom margin (384)
    },
  },
};
