import { Rect, Txt, makeScene2D } from "@revideo/2d";
import { makeProject, useScene, waitFor } from "@revideo/core";

import { fonts, palette } from "./brand/tokens";
import type { Plan } from "./schemas/plan";
import { type AssetSize } from "./scenes/kenBurnsStory.js";
import { sceneRegistry, type SceneContext } from "./scenes/registry.js";
import {
  DriftingGround,
  frameFor,
  loadBrandFonts,
  type Ratio,
} from "./scenes/sceneKit.js";

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

  const allScenesShareGround = plan.scenes.every(
    scene => sceneRegistry[scene.kind].sharedGround,
  );

  if (allScenesShareGround) {
    const frame = frameFor(ratio);
    const ground = DriftingGround(frame);
    const layers = {
      back: <Rect width={frame.width} height={frame.height} /> as Rect,
      mid: <Rect width={frame.width} height={frame.height} /> as Rect,
      fore: <Rect width={frame.width} height={frame.height} /> as Rect,
    };

    view.add(ground.node);
    view.add(layers.back);
    view.add(layers.mid);
    view.add(layers.fore);
    yield ground.run(plan.totalDurationSec);

    for (const [index, scene] of plan.scenes.entries()) {
      const context: SceneContext = {
        frame,
        ratio,
        ground,
        layers,
        scene,
        isLast: index === plan.scenes.length - 1,
        assetSizes,
      };
      yield* sceneRegistry[scene.kind].run(context);
    }
    return;
  }

  for (const [index, scene] of plan.scenes.entries()) {
    const context: SceneContext = {
      ratio,
      layers: {back: view, mid: view, fore: view},
      scene,
      isLast: index === plan.scenes.length - 1,
      assetSizes,
    };

    yield* sceneRegistry[scene.kind].run(context);

    view.removeChildren();
  }
});

export default makeProject({
  scenes: [planScene],
});
