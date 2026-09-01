import { z } from "zod";

import { motion } from "../brand/tokens";
import {
  MIN_HOLD_SEC,
  MIN_STILLNESS_SEC,
  statPunchOverheadSec,
  statPunchRequiredSec,
  typeBeatsOverheadSec,
  typeBeatsRequiredSec,
  type BeatShape,
  type StatPunchShape,
} from "../motion/timing";

export const RENDER_RATIOS = ["4x5", "9x16"] as const;

export const ratioSchema = z.enum(RENDER_RATIOS);

const noEmDash = (text: string): boolean => !/[—–]/u.test(text);

export const assetPathSchema = z
  .string()
  .min(1, "Asset path cannot be empty")
  .refine(
    (path) =>
      (path.startsWith("assets/") || path.startsWith("videos/")) &&
      !path.includes("..") &&
      !path.includes("\\"),
    {
      message:
        "Asset path must be relative, start with 'assets/' or 'videos/', and contain neither '..' nor backslashes",
    },
  );

export const captionSchema = z
  .strictObject({
    text: z
      .string()
      .trim()
      .min(1, "Caption text cannot be empty")
      .refine(noEmDash, "Caption text cannot contain an em or en dash"),
    startSec: z.number().finite().nonnegative(),
    endSec: z.number().finite().positive(),
  })
  .refine((caption) => caption.endSec > caption.startSec, {
    message: "Caption endSec must be greater than startSec",
    path: ["endSec"],
  });

const sceneFields = {
  durationSec: z.number().finite().positive(),
  captions: z.array(captionSchema),
};

const countWords = (text: string): number => text.trim().split(/\s+/u).length;

const sentenceCaseAcronyms = new Set([
  "ACH",
  "PCI",
  "API",
  "CTA",
  "SaaS",
  "DSS",
  "KYC",
]);

/**
 * Reject copy that shouts: any run of three or more capitals that is not a
 * known acronym.
 *
 * This is deliberately not a sentence-case check, and used to claim to be one.
 * Title Case ("Own Your Payments Experience") passed it unchanged, because
 * distinguishing an out-of-style capital from a proper noun ("Pay Theory",
 * "Visa") needs a proper-noun list this repo does not have. The check is named
 * for what it does; the sentence-case law itself (L3) stays a human review item
 * in `docs/style/exemplar-analysis.md`.
 */
const noUnknownAllCaps = (text: string): boolean =>
  ![...text.matchAll(/\b[A-Z]{3,}\b/gu)].some(
    (match) => !sentenceCaseAcronyms.has(match[0]),
  );

const eyebrowSchema = (maxWords: number, maxChars?: number) =>
  z
    .string()
    .trim()
    .min(1, "Eyebrow cannot be empty")
    .refine(noEmDash, "Eyebrow cannot contain an em or en dash")
    .refine(
      (text) => countWords(text) <= maxWords,
      `Eyebrow must contain at most ${maxWords} words`,
    )
    .refine(
      (text) => maxChars === undefined || text.length <= maxChars,
      maxChars === undefined
        ? "Invalid eyebrow"
        : `Eyebrow must contain at most ${maxChars} characters`,
    );

const headlineSchema = (minWords: number, maxWords: number) =>
  z
    .string()
    .trim()
    .min(1, "Headline cannot be empty")
    .refine(
      (text) => countWords(text) >= minWords && countWords(text) <= maxWords,
      `Headline must contain ${minWords}–${maxWords} words`,
    )
    .refine(noEmDash, "Headline cannot contain an em or en dash")
    .refine(
      noUnknownAllCaps,
      "Headline cannot contain ALL-CAPS words outside the known acronym list",
    );

const supportSchema = (maxWords: number) =>
  z
    .string()
    .trim()
    .min(1, "Support cannot be empty")
    .refine(
      (text) => countWords(text) <= maxWords,
      `Support must contain at most ${maxWords} words`,
    )
    .refine(noEmDash, "Support cannot contain an em or en dash");

function validateCaptionTrack(
  scene: { durationSec: number; captions: Caption[] },
  context: z.RefinementCtx,
): void {
  for (const [index, caption] of scene.captions.entries()) {
    if (caption.endSec > scene.durationSec) {
      context.addIssue({
        code: "custom",
        path: ["captions", index, "endSec"],
        message: `Caption must end within the ${scene.durationSec}s scene duration`,
      });
    }

    const wordCount = countWords(caption.text);
    const minimumDuration = wordCount / 3;
    const actualDuration = caption.endSec - caption.startSec;
    if (actualDuration + Number.EPSILON < minimumDuration) {
      context.addIssue({
        code: "custom",
        path: ["captions", index],
        message: `Caption has ${wordCount} words and needs at least ${minimumDuration.toFixed(2)}s at 180 wpm; received ${actualDuration.toFixed(2)}s`,
      });
    }
  }

  const chronological = scene.captions
    .map((caption, index) => ({ caption, index }))
    .sort((left, right) => left.caption.startSec - right.caption.startSec);

  for (let index = 1; index < chronological.length; index += 1) {
    const previous = chronological[index - 1];
    const current = chronological[index];
    if (current.caption.startSec < previous.caption.endSec) {
      context.addIssue({
        code: "custom",
        path: ["captions", current.index, "startSec"],
        message: `Caption overlaps caption ${previous.index + 1}; caption intervals must not overlap`,
      });
    }
  }
}

const HOOK_STAT_ICONS = [
  "arrowUp",
  "shield",
  "lock",
  "dollar",
  "chart",
  "circle",
  "diamond",
] as const;

const motionAccentSchema = z
  .strictObject({
    icon: z.enum(HOOK_STAT_ICONS),
    x: z.number().finite().min(-0.5).max(0.5),
    y: z.number().finite().min(-0.5).max(0.5),
    startSec: z.number().finite().nonnegative(),
    endSec: z.number().finite().positive(),
    size: z.number().finite().positive().max(160),
  })
  .refine((accent) => accent.endSec > accent.startSec, {
    message: "Icon endSec must be greater than startSec",
    path: ["endSec"],
  });

export type MotionAccent = z.infer<typeof motionAccentSchema>;

/**
 * Icon windows get the same treatment as the caption track.
 *
 * `runIcons` walks the sorted list and waits out one lifecycle per icon, so an
 * inverted window (`endSec < startSec`) produced a negative dwell, an overlap
 * silently dropped the later icon's lead-in, and a window past `durationSec`
 * left an icon on screen under the next scene or the logo end card. None of
 * those were catchable from the plan, because all three parsed as valid.
 */
function checkIconBoundary(
  icons: readonly MotionAccent[],
  latestEndSec: number,
  boundary: string,
  context: z.RefinementCtx,
  path: (string | number)[],
): void {
  for (const [index, icon] of icons.entries()) {
    if (icon.endSec > latestEndSec + 1e-9) {
      context.addIssue({
        code: "custom",
        path: [...path, index, "endSec"],
        message: `Icon must end within ${boundary} (${latestEndSec.toFixed(2)}s); received ${icon.endSec.toFixed(2)}s`,
      });
    }
  }
}

function checkIconOverlap(
  icons: readonly MotionAccent[],
  context: z.RefinementCtx,
  path: (string | number)[],
): void {
  const chronological = icons
    .map((icon, index) => ({ icon, index }))
    .sort((left, right) => left.icon.startSec - right.icon.startSec);

  for (let index = 1; index < chronological.length; index += 1) {
    const previous = chronological[index - 1];
    const current = chronological[index];
    if (current.icon.startSec < previous.icon.endSec) {
      context.addIssue({
        code: "custom",
        path: [...path, current.index, "startSec"],
        message: `Icon overlaps icon ${previous.index + 1}; icon windows must not overlap`,
      });
    }
  }
}

export const hookStatSceneSchema = z
  .strictObject({
    ...sceneFields,
    kind: z.literal("hookStat"),
    hook: z
      .string()
      .trim()
      .min(1)
      .refine((text) => {
        const words = countWords(text);
        return words >= 4 && words <= 8;
      }, "Hook text must contain 4–8 words"),
    stat: z.strictObject({
      value: z
        .string()
        .trim()
        .min(1, "Stat value cannot be empty")
        .refine(noEmDash, "Stat value cannot contain an em or en dash"),
      label: z
        .string()
        .trim()
        .min(1, "Stat label cannot be empty")
        .refine(noEmDash, "Stat label cannot contain an em or en dash"),
    }),
    supportingLine: z.string().trim().min(1, "Supporting line cannot be empty"),
    icons: z.array(motionAccentSchema).optional(),
  })
  .superRefine((scene, context) => {
    validateCaptionTrack(scene, context);
    const icons = scene.icons ?? [];
    checkIconBoundary(icons, scene.durationSec, "the scene duration", context, [
      "icons",
    ]);
    checkIconOverlap(icons, context, ["icons"]);
  });

const panPointSchema = z.strictObject({
  x: z.number().finite().min(-1).max(1),
  y: z.number().finite().min(-1).max(1),
});

export const kenBurnsStillSchema = z.strictObject({
  src: assetPathSchema,
  panFrom: panPointSchema,
  panTo: panPointSchema,
  zoomFrom: z.number().finite().positive(),
  zoomTo: z.number().finite().positive(),
  caption: z.string().trim().min(1, "Still caption cannot be empty"),
});

export const kenBurnsStorySceneSchema = z
  .strictObject({
    ...sceneFields,
    kind: z.literal("kenBurnsStory"),
    stills: z
      .array(kenBurnsStillSchema)
      .min(1, "A kenBurnsStory scene needs at least one still"),
  })
  .superRefine(validateCaptionTrack);

/* ------------------------------------------------------- motion budgeting */

/**
 * Duration checks are delegated to `src/motion/timing.ts`, the same ledger the
 * generators budget from.
 *
 * The previous rule allowed a flat 0.7s of motion per beat. The generators
 * actually spend an entrance, a per-word stagger, and a reversed exit, so a beat
 * with an eyebrow, a seven word headline, and a support line costs about 1.9s.
 * A plan could therefore validate and still overrun its own `durationSec`,
 * pushing an exit past the scene boundary. Sharing one model is what makes
 * "schema-valid" mean "renderable".
 */
function typeBeatsShape(scene: {
  eyebrow?: string;
  beats: readonly {
    headline: string;
    holdSec: number;
    eyebrow?: string;
    support?: string;
    accent?: unknown;
    chips?: readonly unknown[];
  }[];
}): BeatShape[] {
  return scene.beats.map((beat, index) => ({
    headline: beat.headline,
    holdSec: beat.holdSec,
    // The generator falls back to the scene-level eyebrow on the opening beat,
    // so the budget has to charge for one there too.
    hasEyebrow:
      beat.eyebrow !== undefined ||
      (index === 0 && scene.eyebrow !== undefined),
    hasSupport: beat.support !== undefined,
    hasAccent: beat.accent !== undefined,
    chipCount: beat.chips?.length ?? 0,
  }));
}

function statPunchShape(scene: {
  headline: string;
  endStillnessSec: number;
  eyebrow?: string;
  support?: string;
  stat: { label: string };
  icon?: unknown;
}): StatPunchShape {
  return {
    headline: scene.headline,
    endStillnessSec: scene.endStillnessSec,
    hasEyebrow: scene.eyebrow !== undefined,
    // The label is always drawn, under the stat value at support scale.
    hasLabel: scene.stat.label.length > 0,
    hasSupport: scene.support !== undefined,
    hasIcon: scene.icon !== undefined,
  };
}

function checkTypeBeatsBudget(
  scene: Parameters<typeof typeBeatsShape>[0] & { durationSec: number },
  isLast: boolean,
  context: z.RefinementCtx,
  path: (string | number)[],
): void {
  const beats = typeBeatsShape(scene);
  const required = typeBeatsRequiredSec(beats, isLast);
  if (required > scene.durationSec + 1e-9) {
    const overhead = typeBeatsOverheadSec(beats, isLast);
    context.addIssue({
      code: "custom",
      path,
      message: `typeBeats needs ${required.toFixed(2)}s (${overhead.toFixed(2)}s of entrances, staggers, and exits${isLast ? ` including the ${motion.endCardSec}s end card` : ""}, plus holds at the ${MIN_HOLD_SEC}s floor), exceeding the ${scene.durationSec}s scene duration`,
    });
  }
}

function checkStatPunchBudget(
  scene: Parameters<typeof statPunchShape>[0] & { durationSec: number },
  isLast: boolean,
  context: z.RefinementCtx,
  path: (string | number)[],
): void {
  const shape = statPunchShape(scene);
  const required = statPunchRequiredSec(shape, isLast);
  if (required > scene.durationSec + 1e-9) {
    const overhead = statPunchOverheadSec(shape, isLast);
    context.addIssue({
      code: "custom",
      path,
      message: `statPunch needs ${required.toFixed(2)}s (${overhead.toFixed(2)}s of entrances and the full exit${isLast ? ` plus the ${motion.endCardSec}s end card` : ""}, plus ${Math.max(shape.endStillnessSec, MIN_STILLNESS_SEC)}s of stillness), exceeding the ${scene.durationSec}s scene duration`,
    });
  }
}

/**
 * One orbiting chip label ("CARD", "ACH", "CASH").
 *
 * Chips are set in caps at the frame's small-type floor, so they are kept short
 * enough that three of them fit across the type column without colliding. Two
 * words is the ceiling; anything longer is a support line, not a chip.
 */
const chipSchema = z
  .string()
  .trim()
  .min(1, "Chip label cannot be empty")
  .max(14, "Chip label must contain at most 14 characters")
  .refine(noEmDash, "Chip label cannot contain an em or en dash")
  .refine(
    (text) => countWords(text) <= 2,
    "Chip label must contain at most 2 words",
  );

/**
 * Whether the scene carries the traveling pulse: a bright dot crossing a
 * hairline track once per beat, handed on to the next beat and the next scene.
 *
 * It defaults on because it is the system's connective tissue rather than a
 * per-scene decoration; a scene opts out only when something else already owns
 * the lower band. It costs no motion budget - the pulse runs on its own thread
 * in the layer behind the type and removes itself before the end card.
 */
const pulseSchema = z.boolean().default(true);

export const beatSchema = z.strictObject({
  eyebrow: eyebrowSchema(3, 24).optional(),
  headline: headlineSchema(2, 8),
  support: supportSchema(14).optional(),
  holdSec: z.number().finite().min(2).max(5),
  // 'mask' and 'line' are deferred to M4. The schema must not advertise a
  // reveal the renderer does not implement: a plan author who asked for one
  // silently got the word reveal instead.
  reveal: z.enum(["word"]).default("word"),
  accent: z
    .strictObject({
      shape: z.enum(["rule", "dot", "bracket", "arc"]),
      anchor: z.enum(["underHeadline", "leftGutter", "rightEdge"]),
    })
    .optional(),
  // Three is the hard ceiling: the design brief allows two or three living
  // elements per beat, and the chip row plus the traveling pulse is already at
  // it. A fourth chip also stops fitting the type column at the small-type floor.
  chips: z
    .array(chipSchema)
    .min(1, "chips cannot be an empty array")
    .max(3, "A beat may carry at most 3 chips")
    .optional(),
});

export const typeBeatsSceneSchema = z
  .strictObject({
    ...sceneFields,
    kind: z.literal("typeBeats"),
    eyebrow: eyebrowSchema(4).optional(),
    beats: z.array(beatSchema).min(1).max(4),
    groundMotion: z.enum(["drift", "shift"]).default("drift"),
    pulse: pulseSchema,
  })
  .superRefine((scene, context) => {
    validateCaptionTrack(scene, context);
    checkTypeBeatsBudget(scene, false, context, ["beats"]);
  });

export const statPunchSceneSchema = z
  .strictObject({
    ...sceneFields,
    kind: z.literal("statPunch"),
    eyebrow: eyebrowSchema(4).optional(),
    stat: z.strictObject({
      value: z
        .string()
        .trim()
        .min(1, "Stat value cannot be empty")
        .max(12)
        .refine(noEmDash, "Stat value cannot contain an em or en dash"),
      label: z
        .string()
        .trim()
        .min(1, "Stat label cannot be empty")
        .refine(
          (text) => countWords(text) <= 6,
          "Stat label must contain at most 6 words",
        )
        .refine(noEmDash, "Stat label cannot contain an em or en dash"),
      countFrom: z.number().finite().optional(),
      countTo: z.number().finite().optional(),
      prefix: z.string().max(2).optional(),
      suffix: z.string().max(3).optional(),
    }),
    headline: headlineSchema(4, 8),
    support: supportSchema(12).optional(),
    accentMoment: z.enum(["overshoot", "settle"]).default("settle"),
    icon: z
      .strictObject({
        icon: z.enum(HOOK_STAT_ICONS),
        x: z.number().finite().min(-0.5).max(0.5),
        y: z.number().finite().min(-0.5).max(0.5),
        size: z.number().finite().positive().max(160),
      })
      .optional(),
    endStillnessSec: z.number().finite().min(0.8).default(0.8),
    pulse: pulseSchema,
  })
  .superRefine((scene, context) => {
    validateCaptionTrack(scene, context);
    if (scene.stat.countTo !== undefined) {
      if (scene.stat.countFrom === undefined) {
        context.addIssue({
          code: "custom",
          path: ["stat", "countFrom"],
          message: "countFrom is required when countTo is supplied",
        });
      } else if (scene.stat.countFrom >= scene.stat.countTo) {
        context.addIssue({
          code: "custom",
          path: ["stat", "countTo"],
          message: "countFrom must be less than countTo",
        });
      }
    }
    checkStatPunchBudget(scene, false, context, ["endStillnessSec"]);
  });

export const sceneSchema = z.discriminatedUnion("kind", [
  hookStatSceneSchema,
  kenBurnsStorySceneSchema,
  typeBeatsSceneSchema,
  statPunchSceneSchema,
]);

export const planSchema = z
  .strictObject({
    schemaVersion: z.literal("1"),
    slug: z
      .string()
      .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        "Slug must use lowercase letters, numbers, and single hyphens",
      ),
    title: z
      .string()
      .trim()
      .min(1, "Title cannot be empty")
      .refine(noEmDash, "Title cannot contain an em or en dash"),
    ratio: ratioSchema,
    totalDurationSec: z.number().finite().min(10).max(90),
    scenes: z.array(sceneSchema).min(1, "Plan must contain at least one scene"),
  })
  .superRefine((plan, context) => {
    const sceneDuration = plan.scenes.reduce(
      (total, scene) => total + scene.durationSec,
      0,
    );

    if (Math.abs(plan.totalDurationSec - sceneDuration) > 1e-6) {
      context.addIssue({
        code: "custom",
        path: ["totalDurationSec"],
        message: `totalDurationSec must equal the sum of scene durations (${sceneDuration}s)`,
      });
    }

    const overshootScenes = plan.scenes.filter(
      (scene) =>
        scene.kind === "statPunch" && scene.accentMoment === "overshoot",
    );
    if (overshootScenes.length > 1) {
      context.addIssue({
        code: "custom",
        path: ["scenes"],
        message:
          'A plan may contain at most one statPunch scene with accentMoment "overshoot"',
      });
    }

    const hasSharedGroundScene = plan.scenes.some(
      (scene) => scene.kind === "typeBeats" || scene.kind === "statPunch",
    );
    const hasLegacyScene = plan.scenes.some(
      (scene) => scene.kind === "hookStat" || scene.kind === "kenBurnsStory",
    );
    if (hasSharedGroundScene && hasLegacyScene) {
      context.addIssue({
        code: "custom",
        path: ["scenes"],
        message:
          "Plans cannot mix shared-ground scenes (typeBeats/statPunch) with legacy scenes (hookStat/kenBurnsStory)",
      });
    }

    // Only the final scene pays for the logo end card, and its content has to
    // be fully off screen before the logomark comes up, so the last scene is
    // re-checked with the end card and the full exit included.
    const lastIndex = plan.scenes.length - 1;
    const lastScene = plan.scenes[lastIndex];
    if (lastScene?.kind === "typeBeats") {
      checkTypeBeatsBudget(lastScene, true, context, [
        "scenes",
        lastIndex,
        "beats",
      ]);
    } else if (lastScene?.kind === "hookStat") {
      // The logo end card owns the tail of the final scene, and `runIcons` runs
      // against the scene clock rather than the beat budget, so an icon window
      // reaching into that tail would draw over the logomark (L9).
      // Windows already past `durationSec` are reported by the scene-level pass;
      // a second message on the same field would be noise.
      const inScene = (lastScene.icons ?? []).filter(
        (icon) => icon.endSec <= lastScene.durationSec + 1e-9,
      );
      checkIconBoundary(
        inScene,
        lastScene.durationSec - motion.endCardSec,
        `the ${motion.endCardSec}s logo end card boundary`,
        context,
        ["scenes", lastIndex, "icons"],
      );
    } else if (lastScene?.kind === "statPunch") {
      checkStatPunchBudget(lastScene, true, context, [
        "scenes",
        lastIndex,
        "durationSec",
      ]);
    }
  });

export type Ratio = z.infer<typeof ratioSchema>;
export type AssetPath = z.infer<typeof assetPathSchema>;
export type Caption = z.infer<typeof captionSchema>;
export type PanPoint = z.infer<typeof panPointSchema>;
export type HookStatScene = z.infer<typeof hookStatSceneSchema>;
export type KenBurnsStill = z.infer<typeof kenBurnsStillSchema>;
export type KenBurnsStoryScene = z.infer<typeof kenBurnsStorySceneSchema>;
export type Beat = z.infer<typeof beatSchema>;
export type TypeBeatsScene = z.infer<typeof typeBeatsSceneSchema>;
export type StatPunchScene = z.infer<typeof statPunchSceneSchema>;
export type Scene = z.infer<typeof sceneSchema>;
export type Plan = z.infer<typeof planSchema>;

export type ParsePlanResult =
  | { success: true; data: Plan }
  | { success: false; errors: string[] };

export function parsePlan(json: unknown): ParsePlanResult {
  const result = planSchema.safeParse(json);
  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    errors: result.error.issues.map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "plan";
      return `${path}: ${issue.message}`;
    }),
  };
}
