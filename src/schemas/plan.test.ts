import assert from "node:assert/strict";
import test from "node:test";

import { parsePlan } from "./plan";

test("accepts a typeBeats plan within its motion budget", () => {
  const result = parsePlan({
    schemaVersion: "1",
    slug: "type-beats-contract",
    title: "Type Beats Contract",
    ratio: "4x5",
    totalDurationSec: 11,
    scenes: [
      {
        kind: "typeBeats",
        durationSec: 11,
        captions: [],
        beats: [
          { headline: "Payments become easier for families", holdSec: 3 },
          { headline: "Teams reconcile every dollar clearly", holdSec: 3 },
        ],
      },
    ],
  });

  assert.equal(result.success, true);
});

test("accepts the established hookStat icon names", () => {
  const result = parsePlan({
    schemaVersion: "1",
    slug: "hook-icon-contract",
    title: "Hook Icon Contract",
    ratio: "4x5",
    totalDurationSec: 10,
    scenes: [
      {
        kind: "hookStat",
        durationSec: 10,
        captions: [],
        hook: "Payments fit the product experience",
        stat: { value: "100%", label: "payment visibility" },
        supportingLine: "Keep every transaction visible.",
        icons: [
          {
            icon: "shield",
            x: 0,
            y: 0,
            startSec: 0,
            endSec: 5,
            size: 100,
          },
        ],
      },
    ],
  });

  assert.equal(result.success, true);
});

test("rejects plans that mix shared-ground and legacy scenes", () => {
  const result = parsePlan({
    schemaVersion: "1",
    slug: "mixed-ground-contract",
    title: "Mixed Ground Contract",
    ratio: "4x5",
    totalDurationSec: 20,
    scenes: [
      {
        kind: "typeBeats",
        durationSec: 10,
        captions: [],
        beats: [
          { headline: "Payments become easier for families", holdSec: 3 },
        ],
      },
      {
        kind: "hookStat",
        durationSec: 10,
        captions: [],
        hook: "Payments fit the product experience",
        stat: { value: "100%", label: "payment visibility" },
        supportingLine: "Keep every transaction visible.",
      },
    ],
  });

  assert.equal(result.success, false);
});

test("rejects a final statPunch whose motion overruns its duration", () => {
  // The overrun Codex measured: 3.80s of scene against roughly 2.35s of
  // entrances and exit, before the 3s end card and the 0.8s of stillness are
  // reserved at all. The old rule only compared endStillnessSec + endCardSec,
  // so this parsed and then bled motion past the scene boundary.
  const result = parsePlan({
    schemaVersion: "1",
    slug: "stat-punch-overrun",
    title: "Stat Punch Overrun",
    ratio: "4x5",
    totalDurationSec: 13.8,
    scenes: [
      {
        kind: "typeBeats",
        durationSec: 10,
        captions: [],
        beats: [
          { headline: "Payments become easier for families", holdSec: 3 },
        ],
      },
      {
        kind: "statPunch",
        durationSec: 3.8,
        captions: [],
        eyebrow: "One clear view",
        stat: { value: "100%", label: "payment visibility" },
        headline: "See every payment in one place",
        support: "Keep every transaction visible.",
        endStillnessSec: 0.8,
      },
    ],
  });

  assert.equal(result.success, false);
  assert.equal(
    result.success === false &&
      result.errors.some((error) => error.includes("statPunch needs")),
    true,
  );
});

test("accepts the same statPunch once its duration covers the ledger", () => {
  const scenes = (statPunchDurationSec: number) => [
    {
      kind: "typeBeats",
      durationSec: 10,
      captions: [],
      beats: [{ headline: "Payments become easier for families", holdSec: 3 }],
    },
    {
      kind: "statPunch",
      durationSec: statPunchDurationSec,
      captions: [],
      eyebrow: "One clear view",
      stat: { value: "100%", label: "payment visibility" },
      headline: "See every payment in one place",
      support: "Keep every transaction visible.",
      endStillnessSec: 0.8,
    },
  ];

  const result = parsePlan({
    schemaVersion: "1",
    slug: "stat-punch-fits",
    title: "Stat Punch Fits",
    ratio: "4x5",
    totalDurationSec: 18,
    scenes: scenes(8),
  });

  assert.equal(result.success, true);
});

test("reserves the end-card budget for a final typeBeats scene", () => {
  const result = parsePlan({
    schemaVersion: "1",
    slug: "final-type-beats-contract",
    title: "Final Type Beats Contract",
    ratio: "4x5",
    totalDurationSec: 10,
    scenes: [
      {
        kind: "typeBeats",
        durationSec: 10,
        captions: [],
        beats: [
          { headline: "Payments become easier for families", holdSec: 3 },
          { headline: "Teams reconcile every dollar clearly", holdSec: 3 },
        ],
      },
    ],
  });

  assert.equal(result.success, false);
});

/**
 * Icon windows. `runIcons` walks the sorted list and waits out one lifecycle
 * per icon, so an inverted, overrunning, or overlapping window is a render bug
 * the plan is the only place to catch. All three used to parse as valid.
 */
const iconPlan = (
  slug: string,
  durationSec: number,
  icons: unknown[],
): unknown => ({
  schemaVersion: "1",
  slug,
  title: "Icon Window Contract",
  ratio: "4x5",
  totalDurationSec: durationSec,
  scenes: [
    {
      kind: "hookStat",
      durationSec,
      captions: [],
      hook: "Payments fit the product experience",
      stat: { value: "100%", label: "payment visibility" },
      supportingLine: "Keep every transaction visible.",
      icons,
    },
  ],
});

const icon = (startSec: number, endSec: number): unknown => ({
  icon: "shield",
  x: 0,
  y: 0,
  startSec,
  endSec,
  size: 100,
});

test("rejects an icon window that ends before it starts", () => {
  const result = parsePlan(iconPlan("icon-inverted", 12, [icon(6, 2)]));

  assert.equal(result.success, false);
  assert.equal(
    result.success === false &&
      result.errors.some((error) =>
        error.includes("Icon endSec must be greater than startSec"),
      ),
    true,
  );
});

test("rejects an icon window that runs past the scene duration", () => {
  const result = parsePlan(iconPlan("icon-overrun", 12, [icon(2, 14)]));

  assert.equal(result.success, false);
  assert.equal(
    result.success === false &&
      result.errors.some((error) =>
        error.includes("Icon must end within the scene duration"),
      ),
    true,
  );
});

test("rejects overlapping icon windows", () => {
  const result = parsePlan(
    iconPlan("icon-overlap", 12, [icon(0, 5), icon(3, 8)]),
  );

  assert.equal(result.success, false);
  assert.equal(
    result.success === false &&
      result.errors.some((error) =>
        error.includes("icon windows must not overlap"),
      ),
    true,
  );
});

test("rejects an icon window that reaches under the logo end card", () => {
  // The end card owns the last 3s of the final scene, and the icon track runs
  // against the scene clock rather than the beat budget, so an icon ending at
  // 9.5s of a 12s scene would draw over the logomark (L9).
  const result = parsePlan(iconPlan("icon-end-card", 12, [icon(2, 9.5)]));

  assert.equal(result.success, false);
  assert.equal(
    result.success === false &&
      result.errors.some((error) => error.includes("logo end card boundary")),
    true,
  );
});

test("accepts icon windows that clear the end card and each other", () => {
  const result = parsePlan(
    iconPlan("icon-valid", 12, [icon(0, 4), icon(4, 8.5)]),
  );

  assert.equal(result.success, true);
});

/* ------------------------------------------------- living-element contract */

/**
 * A three-beat typeBeats plan sitting exactly on its motion budget.
 *
 * Each beat is a bare five-word headline at the 2s hold floor, so the required
 * duration is fully determined: 3 entrances, 2 overlapped exits, the final exit
 * in full, the 3s end card, and 6s of holds. That comes to 11.70s, which is what
 * makes the chip tests below a real measurement rather than a guess - three
 * chips add three nodes to the final peel-out and push the requirement to
 * 11.85s, and nothing else about the plan changes.
 */
const chipPlan = (slug: string, durationSec: number, chips?: string[]) => ({
  schemaVersion: "1",
  slug,
  title: "Chip Contract",
  ratio: "4x5",
  totalDurationSec: durationSec,
  scenes: [
    {
      kind: "typeBeats",
      durationSec,
      captions: [],
      beats: [
        { headline: "Payments become easier for families", holdSec: 2 },
        { headline: "Teams reconcile every dollar clearly", holdSec: 2 },
        chips
          ? { headline: "Card and cash arrive together", holdSec: 2, chips }
          : { headline: "Card and cash arrive together", holdSec: 2 },
      ],
    },
  ],
});

test("accepts beat chips and defaults the traveling pulse on", () => {
  const result = parsePlan(
    chipPlan("chip-accepts", 12, ["Card", "ACH", "Cash"]),
  );

  assert.equal(result.success, true);
  const scene = result.success === true ? result.data.scenes[0] : undefined;
  assert.equal(scene?.kind === "typeBeats" && scene.pulse, true);
  assert.deepEqual(
    scene?.kind === "typeBeats" ? scene.beats[2].chips : undefined,
    ["Card", "ACH", "Cash"],
  );
});

test("charges a beat's chips against its exit budget", () => {
  // 11.8s fits the same plan without chips and does not fit it with three.
  assert.equal(parsePlan(chipPlan("chip-budget-bare", 11.8)).success, true);

  const withChips = parsePlan(
    chipPlan("chip-budget-full", 11.8, ["Card", "ACH", "Cash"]),
  );
  assert.equal(withChips.success, false);
  assert.equal(
    withChips.success === false &&
      withChips.errors.some((error) => error.includes("typeBeats needs")),
    true,
  );
});

test("rejects more than three chips on one beat", () => {
  const result = parsePlan(
    chipPlan("chip-too-many", 13, ["Card", "ACH", "Cash", "Wire"]),
  );

  assert.equal(result.success, false);
  assert.equal(
    result.success === false &&
      result.errors.some((error) => error.includes("at most 3 chips")),
    true,
  );
});

test("rejects an em dash and over-long copy in a chip label", () => {
  const dashed = parsePlan(chipPlan("chip-dash", 13, ["Card — ACH"]));
  assert.equal(dashed.success, false);
  assert.equal(
    dashed.success === false &&
      dashed.errors.some((error) => error.includes("em or en dash")),
    true,
  );

  const wordy = parsePlan(chipPlan("chip-wordy", 13, ["Card and cash"]));
  assert.equal(wordy.success, false);
  assert.equal(
    wordy.success === false &&
      wordy.errors.some((error) => error.includes("at most 2 words")),
    true,
  );
});

test("rejects a chip label over the character cap on its own", () => {
  // One word, 15 characters: the word cap is satisfied, so only the character
  // cap can reject this. "Card and cash" above is 13 characters and would pass
  // this rule, which is why the two need separate cases.
  const long = parsePlan(chipPlan("chip-long", 13, ["Reconciliations"]));

  assert.equal(long.success, false);
  assert.equal(
    long.success === false &&
      long.errors.some((error) => error.includes("at most 14 characters")),
    true,
  );
});

test("rejects a beat that declares chips and then carries none", () => {
  const empty = parsePlan(chipPlan("chip-empty", 13, []));

  assert.equal(empty.success, false);
  assert.equal(
    empty.success === false &&
      empty.errors.some((error) =>
        error.includes("chips cannot be an empty array"),
      ),
    true,
  );
});

test("a statPunch scene can opt out of the traveling pulse", () => {
  const result = parsePlan({
    schemaVersion: "1",
    slug: "pulse-opt-out",
    title: "Pulse Opt Out",
    ratio: "4x5",
    totalDurationSec: 11,
    scenes: [
      {
        kind: "statPunch",
        durationSec: 11,
        captions: [],
        pulse: false,
        stat: { value: "99%", label: "settled on time" },
        headline: "Do you own your payments experience?",
        endStillnessSec: 0.8,
      },
    ],
  });

  assert.equal(result.success, true);
  const scene = result.success === true ? result.data.scenes[0] : undefined;
  assert.equal(scene?.kind === "statPunch" && scene.pulse, false);
});
