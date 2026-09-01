/**
 * Quick SVG generator to visualize hull path geometry.
 * Run: tsx tools/visualize-hull.ts
 * Opens an SVG in the browser showing current vs proposed hull paths.
 */
import { writeFileSync } from "fs";

// ---- current symmetric hull ----
function currentHullPath(w: number, h: number): string {
  const x = w / 2;
  const y = h / 2;
  return `M ${-x} ${-y} L ${x} ${-y} C ${0.44 * w} ${0.2 * h}, ${0.26 * w} ${y}, 0 ${y} C ${-0.26 * w} ${y}, ${-0.44 * w} ${0.2 * h}, ${-x} ${-y} Z`;
}

// ---- proposed curled-prow hull ----
function curledHullPath(w: number, h: number): string {
  const x = w / 2;
  const y = h / 2;
  // Asymmetric: stern (left) is relatively flat, prow (right) curls up
  // Deck sits lower in the box to leave room for the curl
  return `M ${-x} ${-y*0.3} L ${0.35*w} ${-y*0.3} C ${0.45*w} ${-y*0.8}, ${0.55*w} ${-y*0.6}, ${0.6*w} ${-y*0.1} C ${0.6*w} ${y*0.3}, ${0.45*w} ${y*0.8}, 0 ${y*0.7} C ${-0.3*w} ${y*0.6}, ${-0.5*w} ${y*0.15}, ${-x} ${-y*0.3} Z`;
}

// ---- proposed simple curved prow ----
function simpleCurledHullPath(w: number, h: number): string {
  const x = w / 2;
  const y = h / 2;
  // Very simple asymmetric hull: deck from left to 70%, prow curls up, simple bottom curve
  return `M ${-x} ${-y*0.25} L ${0.25*w} ${-y*0.25} C ${0.35*w} ${-y*0.85}, ${0.4*w} ${-y*0.6}, ${0.45*w} ${-y*0.15} C ${0.5*w} ${y*0.25}, ${0.3*w} ${y*0.85}, 0 ${y*0.75} C ${-0.25*w} ${y*0.65}, ${-0.5*w} ${y*0.1}, ${-x} ${-y*0.25} Z`;
}

// ---- viking-style longboat ----
function vikingHullPath(w: number, h: number): string {
  const x = w / 2;
  const y = h / 2;
  // Long, low hull with a dramatic curled prow
  return `M ${-x} ${-y*0.2} L ${0.35*w} ${-y*0.2} C ${0.4*w} ${-y*0.7}, ${0.5*w} ${-y*0.8}, ${0.55*w} ${-y*0.25} C ${0.6*w} ${y*0.2}, ${0.4*w} ${y*0.9}, 0 ${y*0.8} C ${-0.3*w} ${y*0.7}, ${-0.55*w} ${y*0.1}, ${-x} ${-y*0.2} Z`;
}

// ---- sail paths ----
function currentSailPath(w: number, h: number): string {
  const x = w / 2;
  const y = h / 2;
  return `M ${-x} ${y} L ${-x} ${-y} C ${0.1 * w} ${-0.2 * h}, ${0.45 * w} ${0.15 * h}, ${x} ${y} Z`;
}

// Generate SVG
const W = 400;
const H = 160;
const colors = ["#2B1553", "#6C2BD9", "#C4AAF3", "#1E053F"];

const hulls = [
  { name: "Current (symmetric)", fn: currentHullPath, color: colors[0] },
  { name: "Curled prow", fn: curledHullPath, color: colors[1] },
  { name: "Simple curled", fn: simpleCurledHullPath, color: colors[2] },
  { name: "Viking longboat", fn: vikingHullPath, color: colors[3] },
];

const paths = hulls
  .map(
    (h, i) => `
  <!-- ${h.name} -->
  <g transform="translate(${i * W + 10}, 10)">
    <rect x="-${W / 2}" y="-${H / 2}" width="${W}" height="${H}" fill="none" stroke="#ddd" stroke-width="1" />
    <path d="${h.fn(W, H)}" fill="${h.color}" opacity="0.8" />
    <text x="${0}" y="${H / 2 + 18}" text-anchor="middle" font-family="system-ui" font-size="11" fill="#666">${h.name}</text>
  </g>`,
  )
  .join("\n");

const sailExamples = [
  { name: "Current sail", fn: currentSailPath, color: colors[1] },
];

const sailPaths = sailExamples
  .map(
    (s, i) => `
  <!-- ${s.name} -->
  <g transform="translate(${i * W + 10}, 190)">
    <rect x="-${W / 2}" y="-${H / 2}" width="${W}" height="${H}" fill="none" stroke="#ddd" stroke-width="1" />
    <path d="${s.fn(W, H)}" fill="${s.color}" opacity="0.8" />
    <text x="${0}" y="${H / 2 + 18}" text-anchor="middle" font-family="system-ui" font-size="11" fill="#666">${s.name}</text>
  </g>`,
  )
  .join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W * hulls.length + 20} 380" width="${W * hulls.length + 20}" height="380">
  <rect width="100%" height="100%" fill="white" />
  <text x="10" y="25" font-family="system-ui" font-size="14" font-weight="600" fill="#333">Hull geometry comparison (${W}×${H} box)</text>
  ${paths}
  ${sailPaths.length > 0 ? `<text x="10" y="185" font-family="system-ui" font-size="14" font-weight="600" fill="#333">Sail geometry</text>${sailPaths}` : ""}
</svg>`;

writeFileSync("/Users/jimmysauter64/Claude/Video Generation/tools/hull-comparison.svg", svg);
console.log("SVG written to tools/hull-comparison.svg");
console.log("Open it in a browser or VS Code to compare hull shapes.");