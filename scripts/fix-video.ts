/** Fix rendered MP4 videos — sharpen, contrast, denoise, brighten (local, no API credits). */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const USAGE = "usage: tsx scripts/fix-video.ts <input.mp4> [output.mp4] [ops...] [--strength 0-100] [--verbose]";
const ALL_OPS = ["sharpen", "contrast", "denoise", "brighten", "fix-overscan", "fix-margins", "restore"];

function fail(m: string): never { process.stderr.write(`${m}\n`); process.exit(1); }

const args = process.argv.slice(2);
const input = args.shift();
if (!input || !existsSync(resolve(input))) fail(`input not found: ${input}\n${USAGE}`);

let output: string | null = null;
const ops: string[] = [];
let strength = 50;
let verbose = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--strength") { strength = Math.min(100, Math.max(0, Number(args[++i]) || 50)); continue; }
  if (args[i] === "--verbose") { verbose = true; continue; }
  if (ALL_OPS.includes(args[i])) { ops.push(args[i]); continue; }
  if (!output) { output = args[i]; continue; }
  fail(`unknown arg: ${args[i]}\n${USAGE}`);
}

if (ops.length === 0) fail("at least one operation required\n" + USAGE);
if (!output) output = input.replace(/\.mp4$/u, "-fixed.mp4").replace(/(\.\w+)$/u, "-fixed$1");

const root = process.cwd();
const outPath = resolve(output);
const resultStr = execFileSync("python3", [
  resolve(root, "scripts/fix_video.py"),
  resolve(input), outPath, ...ops, "--strength", String(strength),
  ...(verbose ? ["--verbose"] : []),
], { encoding: "utf8" });

const lines = resultStr.trim().split("\n");
const result = JSON.parse(lines[lines.length - 1]);
if (result.success) {
  process.stdout.write(`fixed: ${output} (${result.width}x${result.height}, ${result.ops.join(" + ")})\n`);
} else {
  fail(`fix failed: ${result.error || "unknown error"}`);
}