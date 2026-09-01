/**
 * Generate brand-correct Recraft SVGs via OpenRouter and log them to the ledger.
 *
 * Uses the Stripe-inspired or AWS-inspired prompt formula from
 * docs/style/recraft-prompt-research.md, pins the brand palette through the
 * `controls` block, and calls `recraft/recraft-v4.1-vector` (the cheapest
 * text-to-image vector model on OpenRouter, $0.08/image as of Aug 2026).
 *
 * COST SAFETY: this script defaults to a dry run. It prints the resolved
 * prompt, model, size, and cost for every requested image WITHOUT calling
 * the API. Pass --confirm to actually spend money.
 *
 * Reads the API key from OPENROUTER_API_KEY. Never hardcode, log, or echo it.
 *
 * See docs/image-generation-runbook.md for the full walkthrough.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { palette } from "../src/brand/tokens";

const USAGE = `usage: tsx scripts/generate-image.ts <slug:description> [<slug:description> ...] [options]

Each <slug:description> pair generates one image:
  slug         kebab-case name, used for the output file and ledger entry
  description  the single object to illustrate, e.g. "stacked coins"

Options:
  --variant stripe|aws   Prompt formula to use (default: stripe)
  --size WxH              Image size, e.g. 1024x1024 or 1024x1280 (default: 1024x1024)
  --confirm               Actually call the API and spend money (default: dry run, no network call)
  --force                 Overwrite an existing SVG at assets/library/recraft/<slug>.svg
  --help                  Show this message

Examples:
  tsx scripts/generate-image.ts lighthouse:"a lighthouse"
  tsx scripts/generate-image.ts key:"a key" lock:"a padlock" --variant aws --confirm

Without --confirm, nothing is sent over the network and no money is spent.
Set OPENROUTER_API_KEY in a local .env before using --confirm (see
docs/image-generation-runbook.md). Never commit that file or paste the key
into a prompt or chat.`;

const MODEL = "recraft/recraft-v4.1-vector";
const COST_PER_IMAGE = 0.08;
const LIBRARY_DIR = resolve(process.cwd(), "assets/library/recraft");
const LEDGER_PATH = resolve(LIBRARY_DIR, "ledger.json");
// OpenRouter's unified image endpoint. Verified against
// https://openrouter.ai/docs/features/multimodal/image-generation on 2026-09-01:
// the path is /api/v1/images with no /generations suffix, `size` is accepted as
// a shorthand for output dimensions, and the image comes back base64 encoded in
// data[0].b64_json (SVG markup is UTF-8 base64 encoded there, not a raw string).
const OPENROUTER_IMAGE_ENDPOINT = "https://openrouter.ai/api/v1/images";

const PROMPT_TEMPLATES: Record<"stripe" | "aws", (object: string) => string> = {
  stripe: (object) =>
    `Flat vector illustration of ${object}, bold geometric composition filling the frame, ` +
    `grounded on a single horizon line, smooth flat fills, no outlines, monochromatic ` +
    `deep-purple and violet palette with lavender background, minimal and confident, ` +
    `editorial poster style, generous negative space above the object, no text, no people, ` +
    `no floating decorative shapes, no shadows, no texture, as if illustrating a concept for ` +
    `a premium fintech brand`,
  aws: (object) =>
    `Flat vector illustration of ${object}, simplified to its essential geometric form, ` +
    `precise clean shapes like an architectural diagram, structural and confident, flat ` +
    `purple and violet palette on tint background, no outlines, no shadows, no texture, ` +
    `iconographic clarity, generous negative space, no text, no people, modern infrastructure ` +
    `brand style`,
};

interface ImageItem {
  slug: string;
  description: string;
}

interface Args {
  items: ImageItem[];
  variant: "stripe" | "aws";
  size: string;
  confirm: boolean;
  force: boolean;
}

interface LedgerEntry {
  timestamp: string;
  model: string;
  "prompt-slug": string;
  cost: number;
  "output-file": string;
  paths: number;
}

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function printHelp(): never {
  process.stdout.write(`${USAGE}\n`);
  process.exit(0);
}

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function parseArgs(argv: string[]): Args {
  if (argv.includes("--help") || argv.includes("-h")) printHelp();

  const items: ImageItem[] = [];
  let variant: "stripe" | "aws" = "stripe";
  let size = "1024x1024";
  let confirm = false;
  let force = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--confirm") {
      confirm = true;
    } else if (arg === "--force") {
      force = true;
    } else if (arg === "--variant") {
      const value = argv[index + 1];
      if (value !== "stripe" && value !== "aws")
        fail(`--variant must be stripe or aws\n${USAGE}`);
      variant = value;
      index += 1;
    } else if (arg === "--size") {
      const value = argv[index + 1];
      if (!value || !/^\d+x\d+$/.test(value))
        fail(`--size must look like 1024x1024\n${USAGE}`);
      size = value;
      index += 1;
    } else if (arg.startsWith("--")) {
      fail(`unknown flag ${arg}\n${USAGE}`);
    } else {
      const separator = arg.indexOf(":");
      if (separator === -1)
        fail(`expected <slug:description>, got "${arg}"\n${USAGE}`);
      const slug = arg.slice(0, separator);
      const description = arg.slice(separator + 1).trim();
      if (!slugPattern.test(slug))
        fail(
          `slug "${slug}" must use lowercase letters, numbers, and single hyphens`,
        );
      if (!description) fail(`empty description for slug "${slug}"`);
      items.push({ slug, description });
    }
  }

  if (items.length === 0)
    fail(`at least one <slug:description> is required\n${USAGE}`);
  return { items, variant, size, confirm, force };
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace("#", "");
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return [r, g, b];
}

/**
 * Palette pinned per docs/style/image-exemplar-analysis.md section 4:
 * deepest, primary, accent as the allowed fills; tint as the background.
 */
function buildControls() {
  return {
    colors: [
      { rgb: hexToRgb(palette.deepest) },
      { rgb: hexToRgb(palette.primary) },
      { rgb: hexToRgb(palette.accent) },
      { rgb: hexToRgb(palette.tint) },
    ],
    background_color: { rgb: hexToRgb(palette.tint) },
  };
}

function countPaths(svg: string): number {
  const matches = svg.match(/<path[\s>]/g);
  return matches ? matches.length : 0;
}

function readLedger(): LedgerEntry[] {
  if (!existsSync(LEDGER_PATH)) return [];
  const raw = readFileSync(LEDGER_PATH, "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed))
    fail(`${LEDGER_PATH} does not contain a JSON array`);
  return parsed as LedgerEntry[];
}

function appendLedgerEntry(entry: LedgerEntry): void {
  const entries = readLedger();
  entries.push(entry);
  writeFileSync(LEDGER_PATH, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
}

async function requestSvg(
  apiKey: string,
  prompt: string,
  size: string,
): Promise<{ svg: string; cost: number }> {
  const response = await fetch(OPENROUTER_IMAGE_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      prompt,
      size,
      style: "vector_illustration",
      substyle: "flat_2",
      controls: buildControls(),
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    fail(
      `OpenRouter request failed: ${response.status} ${response.statusText}\n${body}`,
    );
  }

  const payload = (await response.json()) as {
    data?: Array<{ b64_json?: string; media_type?: string }>;
    usage?: { cost?: number };
  };
  const first = payload.data?.[0];
  if (!first) fail("OpenRouter response had no image data");
  if (!first.b64_json) fail("OpenRouter response contained no b64_json image");

  // The response reports what was actually billed. Log that in the ledger rather
  // than the estimate, so the running spend total stays true if pricing moves.
  const cost = payload.usage?.cost ?? COST_PER_IMAGE;
  const svg = Buffer.from(first.b64_json, "base64").toString("utf8");

  if (!svg.trimStart().startsWith("<svg") && !svg.includes("<svg")) {
    fail(
      `Expected SVG markup but got media_type "${first.media_type ?? "unknown"}". ` +
        `Check that ${MODEL} is still a vector model on OpenRouter.`,
    );
  }

  return { svg, cost };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const promptFor = PROMPT_TEMPLATES[args.variant];

  if (!args.confirm) {
    process.stdout.write(
      `DRY RUN: no network call, no money spent. Pass --confirm to actually generate.\n\n`,
    );
    let runningTotal = 0;
    for (const item of args.items) {
      const prompt = promptFor(item.description);
      runningTotal += COST_PER_IMAGE;
      process.stdout.write(
        `slug: ${item.slug}\n` +
          `model: ${MODEL}\n` +
          `size: ${args.size}\n` +
          `prompt: ${prompt}\n` +
          `estimated cost: $${COST_PER_IMAGE.toFixed(2)} (running total: $${runningTotal.toFixed(2)})\n\n`,
      );
    }
    process.stdout.write(
      `Total for ${args.items.length} image(s): $${runningTotal.toFixed(2)}\n`,
    );
    return;
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    fail(
      "OPENROUTER_API_KEY is not set. Add it to a local .env (never commit it) " +
        "and see docs/image-generation-runbook.md for setup.",
    );
  }

  let runningTotal = 0;
  for (const item of args.items) {
    const outputPath = resolve(LIBRARY_DIR, `${item.slug}.svg`);
    if (existsSync(outputPath) && !args.force) {
      fail(
        `${outputPath} already exists. Pass --force to overwrite, or choose a different slug.`,
      );
    }

    const prompt = promptFor(item.description);
    process.stdout.write(`generating ${item.slug}...\n`);
    const { svg, cost } = await requestSvg(apiKey, prompt, args.size);
    writeFileSync(outputPath, svg, "utf8");

    const paths = countPaths(svg);
    const entry: LedgerEntry = {
      timestamp: new Date().toISOString(),
      model: MODEL,
      "prompt-slug": item.slug,
      cost,
      "output-file": `assets/library/recraft/${item.slug}.svg`,
      paths,
    };
    appendLedgerEntry(entry);

    runningTotal += cost;
    process.stdout.write(
      `wrote ${entry["output-file"]} (${paths} paths, ${paths > 12 ? "OVER the 12-path cap, see runbook QA step" : "within the 12-path cap"})\n` +
        `billed $${cost.toFixed(3)}, running total: $${runningTotal.toFixed(2)}\n\n`,
    );
  }

  process.stdout.write(
    `Done. ${args.items.length} image(s) generated, total cost $${runningTotal.toFixed(2)}.\n` +
      `Next: tsx scripts/clean-recraft-svgs.ts\n`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  fail(`unexpected error: ${message}`);
});
