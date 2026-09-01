/**
 * Recraft SVG cleaner: strip C2PA metadata, preserveAssets.
 * Run: tsx scripts/clean-recraft-svgs.ts
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { execSync } from "child_process";

const SRC = resolve(process.cwd(), "assets/library/recraft");
const OUT = resolve(process.cwd(), "assets/library/recraft/clean");
mkdirSync(OUT, { recursive: true });

const files = execSync(`ls -1 "${SRC}"/*.svg`, { encoding: "utf-8" })
  .trim().split("\n")
  .map((f) => f.replace(/^.*\//, ""));

function stripMetadata(svg: string): string {
  // Remove C2PA manifest blocks
  let out = svg.replace(/<c2pa:manifest>[\s\S]*?<\/c2pa:manifest>/g, "");
  out = out.replace(/<metadata>[\s\S]*?<\/metadata>/g, "");
  out = out.replace(/xmlns:c2pa="[^"]*"/g, "");
  // Remove preserveAspectRatio="none" — we want proper fitting
  out = out.replace(/preserveAspectRatio="none"/g, 'preserveAspectRatio="xMidYMid meet"');
  // Strip any remaining /* xml */ comments
  out = out.replace(/<!--[\s\S]*?-->/g, "");
  return out;
}

for (const file of files) {
  const srcPath = resolve(SRC, file);
  const raw = readFileSync(srcPath, "utf-8");
  const cleaned = stripMetadata(raw);
  const outPath = resolve(OUT, file);
  writeFileSync(outPath, cleaned);
  const before = raw.length;
  const after = cleaned.length;
  console.log(`${file}: ${before} → ${after} bytes (${((1 - after / before) * 100).toFixed(0)}% reduction)`);
}

console.log(`\nDone. ${files.length} SVGs cleaned → ${OUT}`);
console.log("\nNext: wire these into the plate system.");