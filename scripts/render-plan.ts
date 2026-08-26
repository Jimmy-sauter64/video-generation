/**
 * Render a validated plan.json to an MP4.
 *
 *   tsx scripts/render-plan.ts <path-to-plan.json> [--ratio 4x5|9x16] [--draft]
 *
 * The plan is the only input surface: it is parsed with `parsePlan` and the
 * render aborts with the aggregated errors if it fails. The parsed plan is
 * handed to the renderer through `variables`, where `src/project.tsx` reads it.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
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
  "usage: tsx scripts/render-plan.ts <path-to-plan.json> [--ratio 4x5|9x16] [--draft]";

interface Args {
  planPath: string;
  ratio?: Ratio;
  draft: boolean;
}

function fail(message: string, details: string[] = []): never {
  process.stderr.write(`${message}\n`);
  for (const detail of details) {
    process.stderr.write(`  - ${detail}\n`);
  }
  process.exit(1);
}

function parseArgs(argv: string[]): Args {
  let planPath: string | undefined;
  let ratio: Ratio | undefined;
  let draft = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--draft") {
      draft = true;
    } else if (arg === "--ratio") {
      const value = argv[index + 1];
      if (!value || !(RENDER_RATIOS as readonly string[]).includes(value)) {
        fail(`--ratio must be one of ${RENDER_RATIOS.join(", ")}\n${USAGE}`);
      }
      ratio = value as Ratio;
      index += 1;
    } else if (arg.startsWith("--")) {
      fail(`unknown flag ${arg}\n${USAGE}`);
    } else if (!planPath) {
      planPath = arg;
    } else {
      fail(`unexpected argument ${arg}\n${USAGE}`);
    }
  }

  if (!planPath) {
    fail(USAGE);
  }

  return { planPath, ratio, draft };
}

/**
 * Probe a still's natural pixel size so the Ken Burns template can cover-fit it
 * without waiting on an in-browser image load. Determinism beats a runtime read.
 */
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

  const [width, height] = output.split(",").map((value) => Number(value));
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    fail(`ffprobe returned no dimensions for ${absolutePath}`);
  }
  return { width, height };
}

function collectAssetSizes(
  plan: Plan,
  root: string,
): Record<string, { width: number; height: number }> {
  const sizes: Record<string, { width: number; height: number }> = {};

  for (const scene of plan.scenes) {
    if (scene.kind !== "kenBurnsStory") {
      continue;
    }
    for (const still of scene.stills) {
      if (sizes[still.src]) {
        continue;
      }
      const absolute = resolve(root, still.src);
      if (!existsSync(absolute)) {
        fail(`still not found: ${still.src}`);
      }
      sizes[still.src] = probeSize(absolute);
    }
  }

  return sizes;
}

async function main(): Promise<void> {
  const {
    planPath,
    ratio: ratioOverride,
    draft,
  } = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const absolutePlanPath = resolve(root, planPath);

  if (!existsSync(absolutePlanPath)) {
    fail(`plan not found: ${absolutePlanPath}`);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(absolutePlanPath, "utf8"));
  } catch (error) {
    fail(`plan is not valid JSON: ${(error as Error).message}`);
  }

  const parsed = parsePlan(raw);
  if (!parsed.success) {
    fail(
      `plan failed validation (${parsed.errors.length} error(s)): ${planPath}`,
      parsed.errors,
    );
  }

  const plan: Plan = ratioOverride
    ? { ...parsed.data, ratio: ratioOverride }
    : parsed.data;
  const ratio = plan.ratio;
  const { width, height } = safeAreas[ratio];

  const outDir = resolve(root, "out", plan.slug);
  mkdirSync(outDir, { recursive: true });

  const outFile = `${draft ? "draft" : "final"}-${ratio}.mp4` as const;
  const assetSizes = collectAssetSizes(plan, root);

  process.stdout.write(
    `rendering ${plan.slug} · ${ratio} · ${plan.totalDurationSec}s · ${plan.scenes.length} scene(s) → out/${plan.slug}/${outFile}\n`,
  );

  await renderVideo({
    projectFile: resolve(root, "src/project.tsx"),
    variables: { plan, assetSizes },
    settings: {
      outFile,
      outDir,
      logProgress: true,
      projectSettings: {
        // `RenderVideoUserProjectSettings` exposes only range/background/size/
        // exporter — there is no resolutionScale or fps lever here, so a draft
        // renders at full frame size. See the note in the report.
        size: { x: width, y: height },
        background: null,
      },
    },
  });

  process.stdout.write(`done: out/${plan.slug}/${outFile}\n`);
}

await main();
