/** Fix still images — denoise, sharpen, contrast, upscale (local, no API credits). */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const USAGE = "usage: tsx scripts/fix-image.ts <input> [output] [ops...] [--strength 0-100]";
const ALL_OPS = ["denoise", "sharpen", "contrast", "upscale", "restore"];

function fail(m: string): never { process.stderr.write(`${m}\n`); process.exit(1); }

const args = process.argv.slice(2);
const input = args.shift();
if (!input || !existsSync(resolve(input))) fail(`input not found: ${input}\n${USAGE}`);

let output: string | null = null;
const ops: string[] = [];
let strength = 50;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--strength") { strength = Math.min(100, Math.max(0, Number(args[++i]) || 50)); continue; }
  if (/-./u.test(args[i]) && !output) { output = args[i]; continue; }
  if (ALL_OPS.includes(args[i])) { ops.push(args[i]); continue; }
  if (!output && !args[i].startsWith("--")) { output = args[i]; continue; }
  fail(`unknown arg: ${args[i]}\n${USAGE}`);
}

if (ops.length === 0) fail("at least one operation required\n" + USAGE);
if (!output) {
  const ext = input.includes(".") ? input.split(".").pop() : "png";
  output = input.replace(`.${ext}`, `-fixed.${ext}`);
}

const root = process.cwd();
const python = execFileSync("python3", [
  resolve(root, "scripts/fix_image.py"),
  resolve(input), resolve(output), ...ops, "--strength", String(strength),
], { encoding: "utf8" });

const lines = python.trim().split("\n");
const result = JSON.parse(lines[lines.length - 1]);
if (result.success) {
  process.stdout.write(`fixed: ${output} (${result.width}x${result.height}, ${result.ops.join(" + ")})\n`);
} else {
  fail(`fix failed: ${result.error || "unknown error"}`);
}