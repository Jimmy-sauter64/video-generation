import {z} from 'zod';

export const RENDER_RATIOS = ['4x5', '9x16'] as const;

export const ratioSchema = z.enum(RENDER_RATIOS);

export const assetPathSchema = z
  .string()
  .min(1, 'Asset path cannot be empty')
  .refine(
    path =>
      (path.startsWith('assets/') || path.startsWith('videos/')) &&
      !path.includes('..') &&
      !path.includes('\\'),
    {
      message:
        "Asset path must be relative, start with 'assets/' or 'videos/', and contain neither '..' nor backslashes",
    },
  );

export const captionSchema = z
  .strictObject({
    text: z.string().trim().min(1, 'Caption text cannot be empty'),
    startSec: z.number().finite().nonnegative(),
    endSec: z.number().finite().positive(),
  })
  .refine(caption => caption.endSec > caption.startSec, {
    message: 'Caption endSec must be greater than startSec',
    path: ['endSec'],
  });

const sceneFields = {
  durationSec: z.number().finite().positive(),
  captions: z.array(captionSchema),
};

const countWords = (text: string): number => text.trim().split(/\s+/u).length;

function validateCaptionTrack(
  scene: {durationSec: number; captions: Caption[]},
  context: z.RefinementCtx,
): void {
  for (const [index, caption] of scene.captions.entries()) {
    if (caption.endSec > scene.durationSec) {
      context.addIssue({
        code: 'custom',
        path: ['captions', index, 'endSec'],
        message: `Caption must end within the ${scene.durationSec}s scene duration`,
      });
    }

    const wordCount = countWords(caption.text);
    const minimumDuration = wordCount / 3;
    const actualDuration = caption.endSec - caption.startSec;
    if (actualDuration + Number.EPSILON < minimumDuration) {
      context.addIssue({
        code: 'custom',
        path: ['captions', index],
        message: `Caption has ${wordCount} words and needs at least ${minimumDuration.toFixed(2)}s at 180 wpm; received ${actualDuration.toFixed(2)}s`,
      });
    }
  }

  const chronological = scene.captions
    .map((caption, index) => ({caption, index}))
    .sort((left, right) => left.caption.startSec - right.caption.startSec);

  for (let index = 1; index < chronological.length; index += 1) {
    const previous = chronological[index - 1];
    const current = chronological[index];
    if (current.caption.startSec < previous.caption.endSec) {
      context.addIssue({
        code: 'custom',
        path: ['captions', current.index, 'startSec'],
        message: `Caption overlaps caption ${previous.index + 1}; caption intervals must not overlap`,
      });
    }
  }
}

export const hookStatSceneSchema = z
  .strictObject({
    ...sceneFields,
    kind: z.literal('hookStat'),
    hook: z.string().trim().min(1).refine(text => {
      const words = countWords(text);
      return words >= 4 && words <= 8;
    }, 'Hook text must contain 4–8 words'),
    stat: z.strictObject({
      value: z.string().trim().min(1, 'Stat value cannot be empty'),
      label: z.string().trim().min(1, 'Stat label cannot be empty'),
    }),
    supportingLine: z
      .string()
      .trim()
      .min(1, 'Supporting line cannot be empty'),
  })
  .superRefine(validateCaptionTrack);

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
  caption: z.string().trim().min(1, 'Still caption cannot be empty'),
});

export const kenBurnsStorySceneSchema = z
  .strictObject({
    ...sceneFields,
    kind: z.literal('kenBurnsStory'),
    stills: z
      .array(kenBurnsStillSchema)
      .min(1, 'A kenBurnsStory scene needs at least one still'),
  })
  .superRefine(validateCaptionTrack);

export const sceneSchema = z.discriminatedUnion('kind', [
  hookStatSceneSchema,
  kenBurnsStorySceneSchema,
]);

export const planSchema = z
  .strictObject({
    schemaVersion: z.literal('1'),
    slug: z
      .string()
      .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        'Slug must use lowercase letters, numbers, and single hyphens',
      ),
    title: z.string().trim().min(1, 'Title cannot be empty'),
    ratio: ratioSchema,
    totalDurationSec: z.number().finite().min(10).max(90),
    scenes: z.array(sceneSchema).min(1, 'Plan must contain at least one scene'),
  })
  .superRefine((plan, context) => {
    const sceneDuration = plan.scenes.reduce(
      (total, scene) => total + scene.durationSec,
      0,
    );

    if (Math.abs(plan.totalDurationSec - sceneDuration) > 1e-6) {
      context.addIssue({
        code: 'custom',
        path: ['totalDurationSec'],
        message: `totalDurationSec must equal the sum of scene durations (${sceneDuration}s)`,
      });
    }
  });

export type Ratio = z.infer<typeof ratioSchema>;
export type AssetPath = z.infer<typeof assetPathSchema>;
export type Caption = z.infer<typeof captionSchema>;
export type PanPoint = z.infer<typeof panPointSchema>;
export type HookStatScene = z.infer<typeof hookStatSceneSchema>;
export type KenBurnsStill = z.infer<typeof kenBurnsStillSchema>;
export type KenBurnsStoryScene = z.infer<typeof kenBurnsStorySceneSchema>;
export type Scene = z.infer<typeof sceneSchema>;
export type Plan = z.infer<typeof planSchema>;

export type ParsePlanResult =
  | {success: true; data: Plan}
  | {success: false; errors: string[]};

export function parsePlan(json: unknown): ParsePlanResult {
  const result = planSchema.safeParse(json);
  if (result.success) {
    return {success: true, data: result.data};
  }

  return {
    success: false,
    errors: result.error.issues.map(issue => {
      const path = issue.path.length > 0 ? issue.path.join('.') : 'plan';
      return `${path}: ${issue.message}`;
    }),
  };
}
