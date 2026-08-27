#!/usr/bin/env python3
"""
fix_image.py — Local image fixer using Pillow + OpenCV.

Operations (chainable, applied in order):
  denoise     Remove JPEG artifacts / blocky noise (Non-local Means)
  sharpen     Mild smart unsharp mask
  contrast    Auto-stretch contrast (percentile-based)
  upscale     2x upscale via Lanczos
  restore     denoise + contrast + sharpen (one-shot)

Usage:
  python3 scripts/fix_image.py <input> <output> [op...] [--strength 0-100]

Examples:
  python3 scripts/fix_image.py assets/photo.png assets/photo-clean.png denoise sharpen
  python3 scripts/fix_image.py assets/photo.png assets/photo-2x.png upscale restore
"""

import argparse
import sys
import os

try:
    import cv2
    import numpy as np
    HAVE_CV2 = True
except ImportError:
    HAVE_CV2 = False

try:
    from PIL import Image, ImageEnhance, ImageFilter
    HAVE_PIL = True
except ImportError:
    HAVE_PIL = False


def _ensure_opencv():
    if not HAVE_CV2:
        print("ERROR: OpenCV (cv2) is required for this operation. Install with: pip install opencv-python", file=sys.stderr)
        sys.exit(1)


def _ensure_pil():
    if not HAVE_PIL:
        print("ERROR: Pillow is required for this operation. Install with: pip install Pillow", file=sys.stderr)
        sys.exit(1)


def op_denoise(img: np.ndarray, strength: float) -> np.ndarray:
    """Non-local Means denoise — removes JPEG blocks while preserving edges."""
    _ensure_opencv()
    h = max(1, strength * 0.3)
    return cv2.fastNlMeansDenoisingColored(img, None, h, h, 7, 21)


def op_sharpen(img: np.ndarray, strength: float) -> np.ndarray:
    """Unsharp mask — mild smart sharpen."""
    _ensure_opencv()
    blurred = cv2.GaussianBlur(img, (0, 0), 1.0)
    amount = strength / 50.0  # 0.0–2.0 range
    return cv2.addWeighted(img, 1.0 + amount, blurred, -amount, 0)


def op_contrast(img: np.ndarray, strength: float) -> np.ndarray:
    """Percentile-based auto contrast stretch."""
    _ensure_opencv()
    p_low = max(0, 5 - strength * 0.05)     # 5% → 0%
    p_high = max(95, 100 - strength * 0.05) # 95% → 100%
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    low, high = np.percentile(l, [p_low, p_high])
    l = np.clip((l - low) * (255.0 / max(1, high - low)), 0, 255).astype(np.uint8)
    merged = cv2.merge([l, a, b])
    return cv2.cvtColor(merged, cv2.COLOR_LAB2BGR)


def op_upscale(img: np.ndarray, _strength: float) -> np.ndarray:
    """2x upscale via Lanczos interpolation."""
    _ensure_opencv()
    h, w = img.shape[:2]
    return cv2.resize(img, (w * 2, h * 2), interpolation=cv2.INTER_LANCZOS4)


def op_restore(img: np.ndarray, strength: float) -> np.ndarray:
    """Combined: denoise → contrast → sharpen."""
    img = op_denoise(img, strength)
    img = op_contrast(img, strength * 0.6)
    img = op_sharpen(img, strength * 0.4)
    return img


OPERATIONS = {
    "denoise": op_denoise,
    "sharpen": op_sharpen,
    "contrast": op_contrast,
    "upscale": op_upscale,
    "restore": op_restore,
}


def main():
    parser = argparse.ArgumentParser(description="Local image fixer")
    parser.add_argument("input", help="Input image path")
    parser.add_argument("output", help="Output image path")
    parser.add_argument("ops", nargs="+", choices=list(OPERATIONS.keys()),
                        help="Operations to apply (in order)")
    parser.add_argument("--strength", type=float, default=50.0,
                        help="Operation strength 0-100 (default: 50)")
    args = parser.parse_args()

    if not os.path.isfile(args.input):
        print(f"ERROR: input not found: {args.input}", file=sys.stderr)
        sys.exit(1)

    raw = cv2.imread(args.input)
    if raw is None:
        # Try Pillow fallback
        _ensure_pil()
        pil_img = Image.open(args.input).convert("RGB")
        raw = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)

    img = raw.copy()
    for op_name in args.ops:
        print(f"  → {op_name} (strength={args.strength:.0f})", file=sys.stderr)
        img = OPERATIONS[op_name](img, args.strength)

    cv2.imwrite(args.output, img, [cv2.IMWRITE_PNG_COMPRESSION, 6])
    in_size = os.path.getsize(args.input)
    out_size = os.path.getsize(args.output)
    h, w = img.shape[:2]
    print(f"  done: {w}x{h} | {_fmt(in_size)} → {_fmt(out_size)}", file=sys.stderr)
    print(json.dumps({"success": True, "width": w, "height": h, "inputBytes": in_size,
                      "outputBytes": out_size, "ops": args.ops, "output": args.output}))


def _fmt(b: int) -> str:
    if b < 1024:
        return f"{b}B"
    if b < 1024 * 1024:
        return f"{b / 1024:.0f}KB"
    return f"{b / 1024 / 1024:.1f}MB"


if __name__ == "__main__":
    import json
    main()