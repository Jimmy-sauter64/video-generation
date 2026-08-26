/** Render a validated plan.json to an MP4. */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { renderVideo } from "@revideo/renderer";
import {
  RENDER_RATIOS,
  parsePlan,
  type Plan,
  type Ratio,
} from "../src/schemas/plan";
import { safeAreas } from "../src/brand/tokens";

const USAGE =
  "usage: tsx scripts/render-plan.ts <path-to-plan.json> [--ratio 4x5|9x16] [--draft|--final]";
interface Args {
  planPath: string;
  ratio?: Ratio;
  draft: boolean;
  final: boolean;
}
function fail(message: string, details: string[] = []): never {
  process.stderr.write(`${message}\n`);
  for (const detail of details) process.stderr.write(`  - ${detail}\n`);
  process.exit(1);
}
function parseArgs(argv: string[]): Args {
  let planPath: string | undefined;
  let ratio: Ratio | undefined;
  let draft = false;
  let final = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--draft") draft = true;
    else if (arg === "--final") final = true;
    else if (arg === "--ratio") {
      const value = argv[index + 1];
      if (!value || !(RENDER_RATIOS as readonly string[]).includes(value))
        fail(`--ratio must be one of ${RENDER_RATIOS.join(", ")}\n${USAGE}`);
      ratio = value as Ratio;
      index += 1;
    } else if (arg.startsWith("--")) fail(`unknown flag ${arg}\n${USAGE}`);
    else if (!planPath) planPath = arg;
    else fail(`unexpected argument ${arg}\n${USAGE}`);
  }
  if (!planPath) fail(USAGE);
  if (draft && final)
    fail(`--draft and --final cannot be used together\n${USAGE}`);
  return { planPath, ratio, draft, final };
}
function probeSize(absolutePath: string): { width: number; height: number } {
  const output = execFileSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-of",
      "csv=p=0",
      absolutePath,
    ],
    { encoding: "utf8" },
  ).trim();
  const [width, height] = output.split(",").map(Number);
  if (!Number.isFinite(width) || !Number.isFinite(height))
    fail(`ffprobe returned no dimensions for ${absolutePath}`);
  return { width, height };
}
function collectAssetSizes(
  plan: Plan,
  root: string,
): Record<string, { width: number; height: number }> {
  const sizes: Record<string, { width: number; height: number }> = {};
  for (const scene of plan.scenes) {
    if (scene.kind !== "kenBurnsStory") continue;
    for (const still of scene.stills) {
      if (sizes[still.src]) continue;
      const absolute = resolve(root, still.src);
      if (!existsSync(absolute)) fail(`still not found: ${still.src}`);
      sizes[still.src] = probeSize(absolute);
    }
  }
  return sizes;
}
function findMusic(musicDir: string): string | undefined {
  if (!existsSync(musicDir)) return undefined;
  const track = readdirSync(musicDir)
    .sort()
    .find((file) => /\.(mp3|wav)$/iu.test(file));
  return track ? resolve(musicDir, track) : undefined;
}
function writeCaptionStub(plan: Plan, outDir: string): void {
  const captions = plan.scenes.flatMap((scene) => [
    ...scene.captions.map((caption) => caption.text),
    ...(scene.kind === "kenBurnsStory"
      ? scene.stills.map((still) => still.caption)
      : []),
  ]);
  writeFileSync(
    resolve(outDir, "caption.txt"),
    `REVIEW BEFORE POSTING (run paytheory-voice)\n\n${plan.title}\n\nLinkedIn-post draft:\n${captions.map((text) => `- ${text}`).join("\n")}\n`,
    "utf8",
  );
}
async function main(): Promise<void> {
  const {
    planPath,
    ratio: ratioOverride,
    draft,
    final,
  } = parseArgs(process.argv.slice(2));
  if (!draft && !final)
    process.stdout.write(
      "no mode flag given: rendering a draft (use --final for the approved deliverable)\n",
    );
  const root = process.cwd();
  const absolutePlanPath = resolve(root, planPath);
  if (!existsSync(absolutePlanPath))
    fail(`plan not found: ${absolutePlanPath}`);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(absolutePlanPath, "utf8"));
  } catch (error) {
    fail(`plan is not valid JSON: ${(error as Error).message}`);
  }
  const parsed = parsePlan(raw);
  if (!parsed.success)
    fail(
      `plan failed validation (${parsed.errors.length} error(s)): ${planPath}`,
      parsed.errors,
    );
  if (final && ratioOverride)
    fail("--final always renders both ratios; remove --ratio");
  const basePlan = parsed.data;
  if (final && !existsSync(resolve(root, "videos", basePlan.slug, "APPROVED")))
    fail(
      `final render requires approval: tsx scripts/approve.ts ${basePlan.slug}`,
    );
  const plan: Plan = ratioOverride
    ? { ...basePlan, ratio: ratioOverride }
    : basePlan;
  const outDir = resolve(root, "out", plan.slug);
  mkdirSync(outDir, { recursive: true });
  const assetSizes = collectAssetSizes(plan, root);
  const ratios: readonly Ratio[] = final ? RENDER_RATIOS : [plan.ratio];
  const music = final ? findMusic(resolve(root, "assets", "music")) : undefined;
  for (const ratio of ratios) {
    const { width, height } = safeAreas[ratio];
    // "-silent" is only an intermediate for the music mix; with no music the
    // rendered file IS the final deliverable and gets the canonical name.
    // "-silent" is only an intermediate for the music mix; with no music the
    // rendered file IS the final deliverable and gets the canonical name.
    // Anything that is not an approved --final render is a draft — a bare
    // invocation must never produce a final-named file (approval bypass).
    const outFile: `${string}.mp4` = final
      ? music
        ? `final-${ratio}-silent.mp4`
        : `final-${ratio}.mp4`
      : `draft-${ratio}.mp4`;
    process.stdout.write(
      `rendering ${plan.slug} · ${ratio} · ${plan.totalDurationSec}s · ${plan.scenes.length} scene(s) → out/${plan.slug}/${outFile}\n`,
    );
    await renderVideo({
      projectFile: resolve(root, "src/project.tsx"),
      variables: { plan: { ...plan, ratio }, assetSizes },
      settings: {
        outFile,
        outDir,
        logProgress: true,
        projectSettings: { size: { x: width, y: height }, background: null },
      },
    });
    if (music) {
      const finalFile = `final-${ratio}.mp4`;
      process.stdout.write(`mixing ${music} → out/${plan.slug}/${finalFile}\n`);
      execFileSync(
        "bash",
        [
          resolve(root, "scripts", "mix.sh"),
          resolve(outDir, outFile),
          music,
          resolve(outDir, finalFile),
        ],
        { stdio: "inherit" },
      );
    }
    process.stdout.write(`done: out/${plan.slug}/${outFile}\n`);
  }
  if (final) {
    writeCaptionStub(plan, outDir);
    process.stdout.write(`done: out/${plan.slug}/caption.txt\n`);
  }
}
await main();
