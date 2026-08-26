/**
 * Heuristic frame QA for rendered videos.
 *
 * False positives are possible: near-white/near-black logos, line art, UI
 * screenshots, and high-contrast illustrations can resemble text. Exclude a
 * known non-text rectangle with repeated --ignore-region x,y,width,height
 * flags (pixel coordinates in the source frame); excluded pixels are not
 * measured for either text height or side margins.
 */
import {execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {homedir} from 'node:os';
import {resolve} from 'node:path';

const USAGE = 'usage: tsx scripts/qa-frames.ts <video.mp4> [--frames hook,mid,end] [--ignore-region x,y,width,height]';
const FRAME_NAMES = ['hook', 'mid', 'end'] as const;
type FrameName = (typeof FRAME_NAMES)[number];
interface Region { x: number; y: number; width: number; height: number; }
interface Args { videoPath: string; frames: FrameName[]; ignored: Region[]; }
interface Dimensions { width: number; height: number; duration: number; }
interface FrameResult { name: FrameName; heightFailed: boolean; marginFailed: boolean; }

function fail(message: string): never { process.stderr.write(`${message}\n`); process.exit(1); }
function ffmpegBinary(name: 'ffmpeg' | 'ffprobe'): string {
  const local = resolve(homedir(), '.local', 'bin', name);
  return existsSync(local) ? local : name;
}
function parseRegion(value: string): Region {
  const [x, y, width, height] = value.split(',').map(Number);
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0)
    fail(`invalid --ignore-region ${value}; expected x,y,width,height with positive width and height`);
  return {x, y, width, height};
}
function parseArgs(argv: string[]): Args {
  let videoPath: string | undefined;
  let frames: FrameName[] = [...FRAME_NAMES];
  const ignored: Region[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--frames') {
      const value = argv[index + 1];
      if (!value) fail(USAGE);
      const selected = value.split(',');
      if (selected.length === 0 || selected.some((name) => !FRAME_NAMES.includes(name as FrameName)))
        fail(`--frames must be a comma-separated subset of ${FRAME_NAMES.join(',')}\n${USAGE}`);
      frames = [...new Set(selected)] as FrameName[];
      index += 1;
    } else if (arg === '--ignore-region') {
      const value = argv[index + 1];
      if (!value) fail(USAGE);
      ignored.push(parseRegion(value));
      index += 1;
    } else if (arg.startsWith('--')) fail(`unknown flag ${arg}\n${USAGE}`);
    else if (!videoPath) videoPath = arg;
    else fail(`unexpected argument ${arg}\n${USAGE}`);
  }
  if (!videoPath) fail(USAGE);
  return {videoPath, frames, ignored};
}
function probe(videoPath: string): Dimensions {
  const output = execFileSync(ffmpegBinary('ffprobe'), [
    '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'csv=p=0', videoPath,
  ], {encoding: 'utf8'}).trim();
  const [width, height, duration] = output.split(/[\s,]+/u).map(Number);
  if (![width, height, duration].every(Number.isFinite) || width <= 0 || height <= 0 || duration <= 0)
    fail(`ffprobe returned invalid dimensions or duration for ${videoPath}`);
  return {width, height, duration};
}
function frameTime(name: FrameName, duration: number): number {
  if (name === 'hook') return Math.min(0.5, duration / 2);
  if (name === 'mid') return duration / 2;
  return Math.max(0, duration - Math.min(0.5, duration / 2));
}
function extractFrame(videoPath: string, dimensions: Dimensions, seconds: number): Buffer {
  const raw = execFileSync(ffmpegBinary('ffmpeg'), [
    '-v', 'error', '-ss', seconds.toFixed(3), '-i', videoPath, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1',
  ], {maxBuffer: dimensions.width * dimensions.height * 4 + 1024});
  const expected = dimensions.width * dimensions.height * 4;
  if (raw.length !== expected) fail(`ffmpeg returned ${raw.length} bytes for a ${dimensions.width}x${dimensions.height} RGBA frame (expected ${expected})`);
  return raw;
}
function ignoredAt(x: number, y: number, regions: readonly Region[]): boolean {
  return regions.some((region) => x >= region.x && x < region.x + region.width && y >= region.y && y < region.y + region.height);
}
function luma(red: number, green: number, blue: number): number { return red * 0.2126 + green * 0.7152 + blue * 0.0722; }
function isDarkFrame(raw: Buffer): boolean {
  let total = 0;
  const pixels = raw.length / 4;
  for (let index = 0; index < raw.length; index += 4) total += luma(raw[index], raw[index + 1], raw[index + 2]);
  return total / pixels < 128;
}
function textMask(raw: Buffer, dimensions: Dimensions, ignored: readonly Region[]): Uint8Array {
  const mask = new Uint8Array(dimensions.width * dimensions.height);
  const darkFrame = isDarkFrame(raw);
  for (let y = 0; y < dimensions.height; y += 1) for (let x = 0; x < dimensions.width; x += 1) {
    if (ignoredAt(x, y, ignored)) continue;
    const offset = (y * dimensions.width + x) * 4;
    const value = luma(raw[offset], raw[offset + 1], raw[offset + 2]);
    if ((darkFrame && value >= 220) || (!darkFrame && value <= 35)) mask[y * dimensions.width + x] = 1;
  }
  return mask;
}
function textRows(mask: Uint8Array, dimensions: Dimensions): boolean[] {
  const rows: boolean[] = [];
  for (let y = 0; y < dimensions.height; y += 1) {
    let pixels = 0;
    for (let x = 0; x < dimensions.width; x += 1) pixels += mask[y * dimensions.width + x];
    // A few anti-aliased glyph pixels form a row; a near-full-width band is not text.
    rows.push(pixels >= 3 && pixels <= dimensions.width * 0.8);
  }
  return rows;
}
function textBlockHeights(rows: readonly boolean[]): number[] {
  const heights: number[] = [];
  let start = -1;
  let gap = 0;
  for (let y = 0; y < rows.length; y += 1) {
    if (rows[y]) { if (start < 0) start = y; gap = 0; continue; }
    if (start < 0) continue;
    gap += 1;
    if (gap > 2) { heights.push(y - gap + 1 - start); start = -1; gap = 0; }
  }
  if (start >= 0) heights.push(rows.length - gap - start);
  return heights.filter((height) => height > 0);
}
function marginXs(mask: Uint8Array, dimensions: Dimensions): number[] {
  const sideWidth = Math.ceil(dimensions.width * 0.12);
  const xs = new Set<number>();
  for (let y = 0; y < dimensions.height; y += 1) for (let x = 0; x < dimensions.width; x += 1) {
    if ((x < sideWidth || x >= dimensions.width - sideWidth) && mask[y * dimensions.width + x]) xs.add(x);
  }
  return [...xs].sort((a, b) => a - b);
}
function reportFrame(name: FrameName, raw: Buffer, dimensions: Dimensions, ignored: readonly Region[]): FrameResult {
  const mask = textMask(raw, dimensions, ignored);
  const heights = textBlockHeights(textRows(mask, dimensions));
  const minimum = heights.length === 0 ? undefined : Math.min(...heights);
  const percent = minimum === undefined ? undefined : minimum / dimensions.height * 100;
  let heightFailed = false;
  if (percent === undefined) process.stdout.write(`${name}: WARN no text-like block detected; inspect frame manually\n`);
  else if (percent < 3) { heightFailed = true; process.stdout.write(`${name}: FAIL minimum text block ${percent.toFixed(2)}% of frame height (< 3.0% support floor)\n`); }
  else if (percent < 5.2) process.stdout.write(`${name}: WARN minimum text block ${percent.toFixed(2)}% of frame height (< 5.2% headline floor; heuristic)\n`);
  else process.stdout.write(`${name}: PASS minimum text block ${percent.toFixed(2)}% of frame height\n`);
  const xs = marginXs(mask, dimensions);
  const marginFailed = xs.length > 0;
  if (marginFailed) process.stdout.write(`${name}: FAIL text-like pixels in outer 12% columns at x=${xs.join(',')}\n`);
  else process.stdout.write(`${name}: PASS no text-like pixels in outer 12% columns\n`);
  return {name, heightFailed, marginFailed};
}
function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const videoPath = resolve(process.cwd(), args.videoPath);
  if (!existsSync(videoPath)) fail(`video not found: ${args.videoPath}`);
  const dimensions = probe(videoPath);
  process.stdout.write(`QA ${args.videoPath} (${dimensions.width}x${dimensions.height}, ${dimensions.duration.toFixed(2)}s)\n`);
  const results = args.frames.map((name) => reportFrame(name, extractFrame(videoPath, dimensions, frameTime(name, dimensions.duration)), dimensions, args.ignored));
  const failed = results.reduce((count, result) => count + Number(result.heightFailed) + Number(result.marginFailed), 0);
  const checks = results.length * 2;
  process.stdout.write(`${checks} checks, ${failed} failed\n`);
  if (failed > 0) process.exitCode = 1;
}
main();
