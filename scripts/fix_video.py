#!/usr/bin/env python3
"""
fix_video.py — Post-render MP4 fixer using ffmpeg + Python.

Operations (applied via ffmpeg filtergraph, chainable):
  sharpen     Unsharp mask (5:5:0.8:0.05)
  contrast    Video eq: contrast + brightness adjustment
  denoise     hqdn3d temporal/spatial denoise
  brighten    Lift shadows, boost midtones
  fix-margins Crop out edge artifacts (12% inner margin crop)
  fix-overscan Crop 1% from each edge to fix encoding edge artifacts

Usage:
  python3 scripts/fix_video.py <input.mp4> <output.mp4> [op...] [--strength 0-100]

Examples:
  python3 scripts/fix_video.py draft-4x5.mp4 fixed-4x5.mp4 sharpen denoise
  python3 scripts/fix_video.py draft-4x5.mp4 fixed-4x5.mp3 restore
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile


def _ffmpeg():
    """Resolve ffmpeg binary."""
    local = os.path.expanduser("~/.local/bin/ffmpeg")
    if os.path.isfile(local):
        return local
    return "ffmpeg"


def _ffprobe():
    local = os.path.expanduser("~/.local/bin/ffprobe")
    if os.path.isfile(local):
        return local
    return "ffprobe"


def probe(path: str) -> dict:
    """Return {width, height, duration, codec} from ffprobe."""
    cmd = [
        _ffprobe(), "-v", "error",
        "-show_entries", "stream=width,height,codec_name:format=duration",
        "-of", "json", path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    data = json.loads(result.stdout)
    stream = data.get("streams", [{}])[0] if data.get("streams") else {}
    fmt = data.get("format", {})
    return {
        "width": int(stream.get("width", 0)),
        "height": int(stream.get("height", 0)),
        "codec": stream.get("codec_name", "h264"),
        "duration": float(fmt.get("duration", 0)),
    }


# Operation -> (ffmpeg filter string, strength-scaling lambda)
OPERATIONS: dict = {}


def reg(name):
    """Decorator to register an operation."""
    def wrap(fn):
        OPERATIONS[name] = fn
        return fn
    return wrap


@reg("sharpen")
def op_sharpen(strength: float) -> str:
    """Unsharp mask. strength 0–100 → amount 0.0–1.0."""
    amount = strength / 100.0
    return f"unsharp=5:5:{amount:.2f}:5:5:0.0"


@reg("contrast")
def op_contrast(strength: float) -> str:
    """Brightness + contrast adjustment."""
    b = (strength / 100.0) * 0.05  # 0–0.05 brightness
    c = 1.0 + (strength / 100.0) * 0.2  # 1.0–1.2 contrast
    return f"eq=brightness={b:.3f}:contrast={c:.3f}"


@reg("denoise")
def op_denoise(strength: float) -> str:
    """hqdn3d: temporal + spatial denoise."""
    s = strength / 10.0  # 0–10
    return f"hqdn3d={s:.1f}:{s:.1f}:{s:.1f}:{s:.1f}"


@reg("brighten")
def op_brighten(strength: float) -> str:
    """Lift shadows, boost gamma for dark frames."""
    gamma = 1.0 - (strength / 100.0) * 0.25  # 1.0 → 0.75 (brighter)
    return f"eq=gamma={gamma:.3f}:gamma_weight=0.7"


@reg("fix-overscan")
def op_fix_overscan(_strength: float) -> str:
    """Crop 1% from each edge to fix encoding border artifacts."""
    return "crop=iw*0.98:ih*0.98"


@reg("fix-margins")
def op_fix_margins(_strength: float) -> str:
    """Crop 12% from sides (mimics qa-frames margin check)."""
    return "crop=iw*0.76:ih"


@reg("restore")
def op_restore(strength: float) -> str:
    """Combined: denoise → contrast → brighten → sharpen."""
    denoise_s = strength / 10.0
    c = 1.0 + (strength / 100.0) * 0.15
    b = (strength / 100.0) * 0.03
    gamma = 1.0 - (strength / 100.0) * 0.2
    amount = strength / 100.0 * 0.6
    return (
        f"hqdn3d={denoise_s:.1f}:{denoise_s:.1f}:{denoise_s:.1f}:{denoise_s:.1f},"
        f"eq=brightness={b:.3f}:contrast={c:.3f}:gamma={gamma:.3f}:gamma_weight=0.7,"
        f"unsharp=5:5:{amount:.2f}:5:5:0.0"
    )


def main():
    parser = argparse.ArgumentParser(description="Post-render MP4 fixer")
    parser.add_argument("input", help="Input MP4 path")
    parser.add_argument("output", help="Output MP4 path (use .mp4 or .mp3)")
    parser.add_argument("ops", nargs="+", choices=list(OPERATIONS.keys()),
                        help="Operations to apply in order")
    parser.add_argument("--strength", type=float, default=50.0,
                        help="Operation strength 0-100 (default: 50)")
    parser.add_argument("--verbose", action="store_true",
                        help="Print ffmpeg output")
    args = parser.parse_args()

    if not os.path.isfile(args.input):
        print(f"ERROR: input not found: {args.input}", file=sys.stderr)
        sys.exit(1)

    info = probe(args.input)
    print(f"  input: {info['width']}x{info['height']} | {info['codec']} | {info['duration']:.1f}s", file=sys.stderr)

    filter_parts = []
    for op_name in args.ops:
        print(f"  → {op_name} (strength={args.strength:.0f})", file=sys.stderr)
        filter_str = OPERATIONS[op_name](args.strength)
        filter_parts.append(filter_str)

    filtergraph = ",".join(filter_parts)

    # Preserve original codec and quality
    vcodec = "libx264" if info["codec"] in ("h264", "libx264") else info["codec"]
    cmd = [
        _ffmpeg(), "-y",
        "-i", args.input,
        "-vf", filtergraph,
        "-c:v", vcodec,
        "-crf", "18",
        "-preset", "slow",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "128k",
        args.output,
    ]

    if args.verbose:
        proc = subprocess.run(cmd)
    else:
        proc = subprocess.run(cmd, capture_output=True, text=True)

    if proc.returncode != 0:
        err = proc.stderr.strip()[-500:] if proc.stderr else "unknown error"
        print(f"ERROR: ffmpeg failed: {err}", file=sys.stderr)
        sys.exit(1)

    out_size = os.path.getsize(args.output)
    in_size = os.path.getsize(args.input)
    print(f"  done: {_fmt(in_size)} → {_fmt(out_size)}", file=sys.stderr)
    print(json.dumps({
        "success": True,
        "width": info["width"],
        "height": info["height"],
        "duration": info["duration"],
        "inputBytes": in_size,
        "outputBytes": out_size,
        "ops": args.ops,
        "filtergraph": filtergraph,
        "output": args.output,
    }))


def _fmt(b: int) -> str:
    if b < 1024:
        return f"{b}B"
    if b < 1024 * 1024:
        return f"{b / 1024:.0f}KB"
    return f"{b / 1024 / 1024:.1f}MB"


if __name__ == "__main__":
    main()