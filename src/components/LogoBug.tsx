/**
 * @deprecated Not used by any scene as of the 2026-08-26 exemplar rebuild.
 *
 * `docs/style/exemplar-analysis.md` L9: three of the four reference videos show
 * no brand mark until the end, and none uses a faded corner bug — a mark at 68%
 * opacity reads as a watermark. The logo end card (`LogoEndCard` in
 * `src/scenes/sceneKit.tsx`) is now the only brand moment.
 */

import { Img, type Node } from "@revideo/2d";

import { logos, safeAreas } from "../brand/tokens";

type Ratio = keyof typeof safeAreas;

export interface LogoBugProps {
  ratio: Ratio;
  corner?: "topLeft" | "topRight";
}

export function LogoBug({ ratio, corner = "topRight" }: LogoBugProps): Node {
  const { width, height, margins } = safeAreas[ratio];
  const size = ratio === "9x16" ? 76 : 72;
  const x =
    corner === "topLeft"
      ? -width / 2 + margins.left + size / 2
      : width / 2 - margins.right - size / 2;
  const y = -height / 2 + margins.top + size / 2;

  return (
    <Img
      src={logos.logomarkSvg}
      width={size}
      height={size}
      x={x}
      y={y}
      opacity={0.68}
    />
  );
}

export default LogoBug;
