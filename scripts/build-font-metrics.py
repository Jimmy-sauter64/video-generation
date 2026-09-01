#!/usr/bin/env python3
"""Emit a static glyph-advance table for the vendored brand font.

Scene code needs to know how wide a word is before it draws it, because the
per-word headline reveal positions every word itself (a flex container would own
those positions and make a transform entrance impossible). Measuring at render
time is not an option: `measureText` returns different advances before and after
the webfont loads, which would make the same plan render two different videos.

So the advances are read from the font files once, here, and checked in as
`src/motion/instrument-metrics.json`. Regenerate after changing the vendored
fonts:

    python3 scripts/build-font-metrics.py

Requires fontTools with brotli support (woff2 decompression).
"""

from __future__ import annotations

import json
import pathlib
import sys

from fontTools.ttLib import TTFont

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
OUTPUT = REPO_ROOT / "src" / "motion" / "instrument-metrics.json"

# The two weights the fresh motion system sets type in: 500 support, 600
# headline. 400 and 700 are vendored but never used for layout (700 is banned by
# style law L3), so measuring them would ship dead data.
WEIGHTS = {
    "500": "assets/brand/fonts/instrument-sans-500.woff2",
    "600": "assets/brand/fonts/instrument-sans-600.woff2",
}

# Printable ASCII plus the punctuation the brand copy actually uses. Em and en
# dashes are deliberately absent: the plan schema rejects them.
CHARS = [chr(code) for code in range(0x20, 0x7F)] + ["‘", "’", "“", "”", "…", "°"]


def measure(path: pathlib.Path) -> dict:
    font = TTFont(str(path))
    upem = font["head"].unitsPerEm
    cmap = font.getBestCmap()
    hmtx = font["hmtx"]

    advances: dict[str, float] = {}
    for char in CHARS:
        glyph = cmap.get(ord(char))
        if glyph is None or glyph not in hmtx.metrics:
            continue
        advances[char] = round(hmtx.metrics[glyph][0] / upem, 5)

    if "space" in hmtx.metrics:
        space = hmtx.metrics["space"][0] / upem
    else:
        space = advances.get(" ", 0.26)

    os2 = font["OS/2"]
    hhea = font["hhea"]
    notdef = hmtx.metrics.get(".notdef", (int(0.55 * upem), 0))[0] / upem

    return {
        "advances": advances,
        "space": round(space, 5),
        "fallback": round(notdef, 5),
        "capHeight": round(getattr(os2, "sCapHeight", int(0.72 * upem)) / upem, 5),
        "xHeight": round(getattr(os2, "sxHeight", int(0.52 * upem)) / upem, 5),
        "ascender": round(hhea.ascent / upem, 5),
        "descender": round(hhea.descent / upem, 5),
    }


def main() -> int:
    weights = {}
    for weight, relative in WEIGHTS.items():
        path = REPO_ROOT / relative
        if not path.exists():
            sys.stderr.write(f"missing font file: {relative}\n")
            return 1
        weights[weight] = measure(path)

    # Vertical metrics are identical across the weights of one family; take the
    # headline weight as the reference so consumers have a single source.
    reference = weights["600"]
    payload = {
        "family": "Instrument Sans",
        "generatedBy": "scripts/build-font-metrics.py",
        "sources": WEIGHTS,
        "capHeight": reference["capHeight"],
        "xHeight": reference["xHeight"],
        "ascender": reference["ascender"],
        "descender": reference["descender"],
        "weights": {
            weight: {
                "advances": data["advances"],
                "space": data["space"],
                "fallback": data["fallback"],
            }
            for weight, data in weights.items()
        },
    }

    OUTPUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    counts = ", ".join(f"{weight}: {len(data['advances'])} glyphs" for weight, data in weights.items())
    sys.stdout.write(f"wrote {OUTPUT.relative_to(REPO_ROOT)} ({counts})\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
