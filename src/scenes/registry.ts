import {type Node} from '@revideo/2d';
import {type ThreadGenerator} from '@revideo/core';

import type {AssetSize} from './kenBurnsStory';
import hookStat from './hookStat.js';
import kenBurnsStory from './kenBurnsStory.js';
import {
  type Ground,
  type Frame,
  type Ratio,
} from './sceneKit.js';
import type {Scene} from '../schemas/plan';
import statPunch from './statPunch.js';
import typeBeats from './typeBeats.js';

export interface SceneContext {
  readonly frame?: Frame;
  readonly ratio: Ratio;
  readonly ground?: Ground;
  readonly layers: {
    readonly back: Node;
    readonly mid: Node;
    readonly fore: Node;
  };
  readonly scene: Scene;
  readonly isLast: boolean;
  readonly assetSizes: Record<string, AssetSize>;
}

export type SceneRunner = (context: SceneContext) => ThreadGenerator;

function* runHookStat(context: SceneContext): ThreadGenerator {
  if (context.scene.kind !== 'hookStat') return;
  yield* hookStat({
    view: context.layers.back,
    scene: context.scene,
    ratio: context.ratio,
    endCardCta: context.isLast,
  });
}

function* runKenBurnsStory(context: SceneContext): ThreadGenerator {
  if (context.scene.kind !== 'kenBurnsStory') return;
  yield* kenBurnsStory({
    view: context.layers.back,
    scene: context.scene,
    ratio: context.ratio,
    assetSizes: context.assetSizes,
    endCardCta: context.isLast,
  });
}

export const sceneRegistry: Record<
  Scene['kind'],
  {run: SceneRunner; sharedGround: boolean}
> = {
  hookStat: {run: runHookStat, sharedGround: false},
  kenBurnsStory: {run: runKenBurnsStory, sharedGround: false},
  typeBeats: {run: typeBeats, sharedGround: true},
  statPunch: {run: statPunch, sharedGround: true},
};
