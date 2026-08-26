/**
 * @deprecated Not used by any scene as of the 2026-08-26 exemplar rebuild.
 *
 * `docs/style/exemplar-analysis.md` L9: every reference video ends on the logo
 * **alone** — no CTA, no URL, no tagline lockup — held 2.5–4.0s on the same
 * ground. This component's required `cta` prop cannot express that, and its
 * `fontWeight={700}` violates L3. Replaced by `LogoEndCard`/`runEndCard` in
 * `src/scenes/sceneKit.tsx`.
 */

import { Img, Rect, Txt, type Node } from "@revideo/2d";

import { palette, fonts, safeAreas, logos } from "../brand/tokens";

type Ratio = keyof typeof safeAreas;

export interface EndCardProps {
  ratio: Ratio;
  cta: string;
}

export function EndCard({ ratio, cta }: EndCardProps): Node {
  const { width, height, margins } = safeAreas[ratio];
  const contentWidth = width - margins.left - margins.right;
  const baseCtaFontSize = ratio === "9x16" ? 60 : 64;
  const estimatedCtaFit = contentWidth / Math.max(cta.length * 0.58, 1);
  const ctaFontSize = Math.min(baseCtaFontSize, estimatedCtaFit);

  return (
    <Rect
      width={width}
      height={height}
      fill={palette.deepest}
      layout
      direction="column"
      alignItems="center"
      justifyContent="center"
      gap={48}
      padding={[margins.top, margins.right, margins.bottom, margins.left]}
    >
      <Rect
        width={196}
        height={196}
        fill={palette.white}
        radius={48}
        layout
        alignItems="center"
        justifyContent="center"
      >
        <Img src={logos.logomarkSvg} width={132} height={126} />
      </Rect>
      <Txt
        text={cta}
        width={contentWidth}
        fill={palette.white}
        fontFamily={fonts.display.fallback}
        fontSize={ctaFontSize}
        fontWeight={700}
        lineHeight="110%"
        textAlign="center"
        textWrap={false}
      />
    </Rect>
  );
}

export default EndCard;
