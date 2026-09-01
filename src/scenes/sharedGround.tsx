/**
 * Furniture common to the shared-ground templates (`typeBeats`, `statPunch`).
 *
 * Both scenes draw onto one persistent ground owned by the composer, both size
 * their small type off the same floor, and both close the video the same way, so
 * that logic lives here rather than being copied into each generator.
 */

import type { Node, Rect } from "@revideo/2d";
import { waitFor, type ThreadGenerator } from "@revideo/core";

import { motion } from "../brand/tokens";
import { smallTypeSizeFor } from "../motion/textMetrics";

import { LogoEndCard, runEndCard, type Frame } from "./sceneKit";
import type { SceneContext } from "./registry";

/**
 * Font size for eyebrows, support lines, and stat labels in this frame.
 *
 * The rule and its reasoning live in `smallTypeSizeFor`; this is the `Frame`
 * shaped call site.
 */
export function smallTypeSize(frame: Frame): number {
  return smallTypeSizeFor(frame.headlineSize, frame.height);
}

/**
 * Spend whatever time the scene has left, then close on the end card.
 *
 * `remainingSec` is the scene's duration minus everything the generator has
 * already spent, and it still contains the end card reserve the timing ledger
 * set aside. Any slack beyond that becomes extra stillness on an empty ground
 * before the logomark rises, which is the quiet R-5 asks for and never a frame
 * of overlap: the caller has already played its exit out in full, so the logo is
 * the only thing on screen.
 */
export function* runSceneEndCard(
  context: SceneContext,
  frame: Frame,
  remainingSec: number,
  isLast: boolean,
): ThreadGenerator {
  const endCardSec = isLast ? motion.endCardSec : 0;
  const slack = remainingSec - endCardSec;
  if (slack > 0) {
    yield* waitFor(slack);
  }

  if (!isLast) {
    return;
  }

  const endCard: Rect = LogoEndCard(frame);
  (context.layers.fore as Node).add(endCard);
  yield* runEndCard(endCard);
}
