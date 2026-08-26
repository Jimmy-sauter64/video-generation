/**
 * Brand font registration.
 *
 * The Instrument Sans weights are vendored under `assets/brand/fonts`, but
 * nothing in the repo hands them to the browser, so `fonts.display.fallback`
 * would silently resolve to Helvetica inside the renderer. Register every
 * vendored weight as a `FontFace` on first call: `document.fonts.add` runs
 * synchronously before the first frame is measured, and `@revideo/2d` already
 * awaits `document.fonts.ready` inside `Layout`/`Txt`, so the pending loads are
 * waited on for us.
 *
 * Registration lives in `src/brand/` — next to the tokens that name the files —
 * rather than in a scene module, so a template never owns the brand's I/O.
 * Import it from `src/project.tsx` or from a scene.
 */

import { fonts } from "./tokens";

let brandFontsPromise: Promise<unknown> | null = null;

/**
 * Register every vendored brand weight exactly once and resolve when the files
 * have loaded. Safe to call from any number of scenes; the work is memoised.
 */
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

export default loadBrandFonts;
