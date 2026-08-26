/**
 * `hookStat` — the kinetic-text stat template.
 *
 * Frame grammar (sound-off first): accent rule → 4–8 word hook → oversized stat
 * value with the final token in `palette.accent` → stat label → supporting line,
 * all on a `palette.deepest` card, with the beat-timed caption track running in
 * the ratio's caption zone and a logo bug held for the whole scene.
 */

import { Circle, Rect, Txt, blur, type Node } from "@revideo/2d";
import {
  all,
  easeOutCubic,
  easeOutExpo,
  easeInOutSine,
  loop,
  waitFor,
  type ThreadGenerator,
} from "@revideo/core";

import { fonts, palette } from "../brand/tokens";
import Captions from "../components/Captions";
import EndCard from "../components/EndCard";
import type { HookStatScene } from "../schemas/plan";

import {
  AccentRule,
  LogoBugOnChip,
  TextBlock,
  fitText,
  frameFor,
  loadBrandFonts,
  splitStatValue,
  type Ratio,
} from "./sceneKit";

export const END_CARD_SEC = 2;
const END_CARD_FADE_SEC = 0.4;

export interface HookStatProps {
  view: Node;
  scene: HookStatScene;
  ratio: Ratio;
  /** CTA rendered on the closing card. Only the final scene of a plan gets one. */
  endCardCta?: string;
}

export function* hookStat({
  view,
  scene,
  ratio,
  endCardCta,
}: HookStatProps): ThreadGenerator {
  yield loadBrandFonts();

  const frame = frameFor(ratio);
  const scale = ratio === "9x16" ? 1.06 : 1;

  /* ---------------------------------------------------------- background */

  view.add(
    <Rect width={frame.width} height={frame.height} fill={palette.deepest} />,
  );

  // Two soft off-frame glows keep a flat deepest card from reading as dead
  // space. `deepAnchor` and `accent` at low alpha, never as a literal fill.
  const glowA = (
    <Circle
      x={frame.width * 0.42}
      y={-frame.height * 0.34}
      width={frame.width * 1.1}
      height={frame.width * 1.1}
      fill={palette.deepAnchor}
      opacity={0.5}
      filters={[blur(160)]}
    />
  ) as Circle;

  const glowB = (
    <Circle
      x={-frame.width * 0.46}
      y={frame.height * 0.3}
      width={frame.width * 0.82}
      height={frame.width * 0.82}
      fill={palette.accent}
      opacity={0.16}
      filters={[blur(190)]}
    />
  ) as Circle;

  view.add(glowA);
  view.add(glowB);

  /* ----------------------------------------------------------- typography */

  const contentWidth = frame.contentWidth;

  const hookFit = fitText(scene.hook, contentWidth, {
    base: Math.round(92 * scale),
    min: 56,
    maxLines: 3,
    lineHeightRatio: 1.08,
  });

  const labelFit = fitText(scene.stat.label, contentWidth, {
    base: Math.round(44 * scale),
    min: 30,
    maxLines: 2,
    lineHeightRatio: 1.24,
  });

  const supportFit = fitText(scene.supportingLine, contentWidth, {
    base: Math.round(40 * scale),
    min: 28,
    maxLines: 3,
    lineHeightRatio: 1.32,
  });

  // Stack the hook from the top and the supporting line from the bottom, then
  // centre the stat block in whatever is left. Balances both ratios without a
  // layout pass, and keeps a fixed clear band around the hairline divider.
  const ruleY = frame.contentTop + 108;
  const hookTop = ruleY + 46;
  const hookBottom = hookTop + hookFit.height;
  const supportTop = frame.contentBottom - supportFit.height;
  const dividerY = supportTop - 38;

  const statGap = 14;
  const bandTop = hookBottom + 48;
  const bandBottom = dividerY - 48;

  // Size the stat value against the band that is actually left, not just the
  // content width. A long hook plus a long supporting line can leave less room
  // than a 168px value needs, and without this the value overruns the divider
  // and collides with the supporting line.
  const valueCeiling = Math.max(
    72,
    bandBottom - bandTop - statGap - labelFit.height,
  );
  let valueFit = fitText(scene.stat.value, contentWidth, {
    base: Math.round(168 * scale),
    min: 72,
    maxLines: 2,
    lineHeightRatio: 1.04,
  });
  if (valueFit.height > valueCeiling) {
    const shrunk = Math.max(
      64,
      Math.floor((valueFit.fontSize * valueCeiling) / valueFit.height),
    );
    valueFit = fitText(scene.stat.value, contentWidth, {
      base: shrunk,
      min: 56,
      maxLines: 2,
      lineHeightRatio: 1.04,
    });
  }

  const statHeight = valueFit.height + statGap + labelFit.height;
  const statTop =
    bandTop + Math.max(0, (bandBottom - bandTop - statHeight) / 2);

  const rule = AccentRule(frame, ruleY) as Rect;
  rule.scale([0, 1]);

  const hook = TextBlock({
    frame,
    top: hookTop,
    fitted: hookFit,
    text: scene.hook,
    fill: palette.white,
    fontWeight: 700,
    lineHeightRatio: 1.08,
    opacity: 0,
  }) as Rect;

  // Value and label share one flex column so the gap between them is real
  // rather than estimated — `fitText` only budgets heights well enough to place
  // the block, not well enough to butt two blocks together.
  const { head, tail } = splitStatValue(scene.stat.value);

  const statLabel = (
    <Txt
      text={scene.stat.label}
      width={contentWidth}
      fill={palette.tint}
      fontFamily={fonts.display.fallback}
      fontSize={labelFit.fontSize}
      fontWeight={500}
      lineHeight={labelFit.fontSize * 1.24}
      textAlign="left"
      textWrap
      opacity={0}
    />
  ) as Txt;

  const statBlock = (
    <Rect
      x={0}
      y={statTop}
      offset={[0, -1]}
      width={contentWidth}
      layout
      direction="column"
      alignItems="start"
      gap={statGap}
      opacity={0}
    >
      <Txt
        width={contentWidth}
        fontFamily={fonts.display.fallback}
        fontSize={valueFit.fontSize}
        fontWeight={700}
        lineHeight={valueFit.fontSize * 1.04}
        textAlign="left"
        textWrap
      >
        <Txt text={head} fill={palette.white} />
        <Txt text={tail} fill={palette.accent} />
      </Txt>
      {statLabel}
    </Rect>
  ) as Rect;

  const support = TextBlock({
    frame,
    top: frame.contentBottom,
    anchor: "bottom",
    fitted: supportFit,
    text: scene.supportingLine,
    fill: palette.tint,
    fontWeight: 500,
    lineHeightRatio: 1.32,
    opacity: 0,
  }) as Rect;

  // A hairline divider above the supporting line separates proof from claim.
  const divider = (
    <Rect
      x={0}
      y={dividerY}
      width={contentWidth}
      height={2}
      fill={palette.accent}
      opacity={0}
    />
  ) as Rect;

  view.add(rule);
  view.add(hook);
  view.add(statBlock);
  view.add(divider);
  view.add(support);
  view.add(LogoBugOnChip(ratio));

  /* ------------------------------------------------------------- timeline */

  // Caption track and the background drift both run alongside the entrance.
  yield Captions({ parent: view, ratio, captions: scene.captions });
  yield loop(Math.ceil(scene.durationSec / 12) + 1, function* () {
    yield* all(
      glowA.position.y(-frame.height * 0.28, 6, easeInOutSine),
      glowB.position.x(-frame.width * 0.38, 6, easeInOutSine),
    );
    yield* all(
      glowA.position.y(-frame.height * 0.34, 6, easeInOutSine),
      glowB.position.x(-frame.width * 0.46, 6, easeInOutSine),
    );
  });

  hook.position.y(hook.position.y() + 54);
  statBlock.scale(0.88);
  support.position.y(support.position.y() + 26);

  const hookY = hook.position.y() - 54;
  const supportY = support.position.y() - 26;

  yield* rule.scale([1, 1], 0.36, easeOutExpo);
  yield* all(
    hook.opacity(1, 0.42, easeOutCubic),
    hook.position.y(hookY, 0.42, easeOutCubic),
  );
  yield* waitFor(0.14);
  yield* all(
    statBlock.opacity(1, 0.44, easeOutCubic),
    statBlock.scale(1, 0.44, easeOutCubic),
  );
  yield* statLabel.opacity(1, 0.34, easeOutCubic);
  yield* all(
    divider.opacity(0.55, 0.3, easeOutCubic),
    support.opacity(1, 0.38, easeOutCubic),
    support.position.y(supportY, 0.38, easeOutCubic),
  );

  const entranceSec = 0.36 + 0.42 + 0.14 + 0.44 + 0.34 + 0.38;
  const holdSec = endCardCta
    ? scene.durationSec - END_CARD_SEC - entranceSec
    : scene.durationSec - entranceSec;

  yield* waitFor(Math.max(0, holdSec));

  if (endCardCta) {
    const endCard = (
      <Rect opacity={0}>{EndCard({ ratio, cta: endCardCta })}</Rect>
    ) as Rect;

    // The end card sits on `deepest`; add a small accent kicker above the CTA so
    // the closing frame carries the same accent language as the opening rule.
    endCard.add(
      <Txt
        text="paytheory.com"
        y={frame.height * 0.3}
        fill={palette.accent}
        fontFamily={fonts.display.fallback}
        fontSize={ratio === "9x16" ? 38 : 36}
        fontWeight={500}
        textAlign="center"
      />,
    );

    view.add(endCard);
    yield* endCard.opacity(1, END_CARD_FADE_SEC, easeOutCubic);
    yield* waitFor(END_CARD_SEC - END_CARD_FADE_SEC);
  }
}

export default hookStat;
