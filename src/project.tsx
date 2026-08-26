import { Rect, Txt, makeScene2D } from "@revideo/2d";
import { makeProject, useScene, waitFor } from "@revideo/core";

import { fonts, palette } from "./brand/tokens";
import type { Plan } from "./schemas/plan";
import hookStat from "./scenes/hookStat.js";
import kenBurnsStory, { type AssetSize } from "./scenes/kenBurnsStory.js";
import { loadBrandFonts, type Ratio } from "./scenes/sceneKit.js";

/**
 * A plan can carry several scenes of different kinds, so the project exposes a
 * single composer scene that reads the validated plan out of render variables
 * and dispatches each entry to its template in order. Only the last scene gets
 * the closing card.
 */
const planScene = makeScene2D("plan", function* (view) {
  yield loadBrandFonts();

  const variables = useScene().variables;
  const plan = variables.get<Plan | null>("plan", null)();
  const assetSizes = variables.get<Record<string, AssetSize>>(
    "assetSizes",
    {},
  )();

  if (!plan) {
    // No plan supplied (e.g. `pnpm smoke`): render a minimal brand title card.
    view.add(<Rect width="100%" height="100%" fill={palette.deepest} />);
    view.add(
      <Txt
        text="Revideo video factory"
        fill={palette.white}
        fontFamily={fonts.display.fallback}
        fontSize={72}
        fontWeight={700}
      />,
    );
    yield* waitFor(2);
    return;
  }

  const ratio = plan.ratio as Ratio;

  for (const [index, scene] of plan.scenes.entries()) {
    const isLast = index === plan.scenes.length - 1;
    const endCardCta = isLast ? plan.title : undefined;

    if (scene.kind === "hookStat") {
      yield* hookStat({ view, scene, ratio, endCardCta });
    } else {
      yield* kenBurnsStory({ view, scene, ratio, assetSizes, endCardCta });
    }

    view.removeChildren();
  }
});

export default makeProject({
  scenes: [planScene],
});
