import { Rect, Txt, type Node } from "@revideo/2d";
import { type ThreadGenerator, waitFor } from "@revideo/core";

import { palette, fonts, safeAreas } from "../brand/tokens";

type Ratio = keyof typeof safeAreas;

export interface CaptionCue {
  text: string;
  startSec: number;
  endSec: number;
}

export interface CaptionsProps {
  parent: Node;
  ratio: Ratio;
  captions: readonly CaptionCue[];
}

function splitAcrossTwoLines(text: string): [string, string?] {
  const words = text.trim().split(/\s+/u);
  if (words.length < 2) {
    return [text.trim()];
  }

  let bestSplit = 1;
  let smallestDifference = Number.POSITIVE_INFINITY;
  for (let index = 1; index < words.length; index += 1) {
    const firstLength = words.slice(0, index).join(" ").length;
    const secondLength = words.slice(index).join(" ").length;
    const difference = Math.abs(firstLength - secondLength);
    if (difference < smallestDifference) {
      bestSplit = index;
      smallestDifference = difference;
    }
  }

  return [
    words.slice(0, bestSplit).join(" "),
    words.slice(bestSplit).join(" "),
  ];
}

function makeCaptionNode(text: string, ratio: Ratio): Node {
  const {
    width: frameWidth,
    height: frameHeight,
    captionZone,
  } = safeAreas[ratio];
  const lines = splitAcrossTwoLines(text);
  const displayText = lines.join("\n");
  const longestLine = Math.max(...lines.map((line) => line?.length ?? 0));
  const horizontalPadding = 40;
  const verticalPadding = 18;
  const baseFontSize = ratio === "9x16" ? 52 : 58;
  const estimatedFit =
    (captionZone.width - horizontalPadding * 2) /
    Math.max(longestLine * 0.58, 1);
  const verticalFit =
    (captionZone.height - verticalPadding * 2) / (lines.length * 1.08);
  const fontSize = Math.min(baseFontSize, estimatedFit, verticalFit);

  return (
    <Rect
      x={captionZone.x + captionZone.width / 2 - frameWidth / 2}
      y={captionZone.y + captionZone.height / 2 - frameHeight / 2}
      width={captionZone.width}
      height={captionZone.height}
      padding={[verticalPadding, horizontalPadding]}
      radius={24}
      fill={palette.deepest}
      opacity={0.94}
      layout
      alignItems="center"
      justifyContent="center"
      clip
    >
      <Txt
        text={displayText}
        width={captionZone.width - horizontalPadding * 2}
        fill={palette.white}
        fontFamily={fonts.display.fallback}
        fontSize={fontSize}
        fontWeight={700}
        lineHeight={fontSize * 1.08}
        textAlign="center"
        textWrap="pre"
        shadowColor={palette.ink}
        shadowBlur={8}
        shadowOffsetY={2}
      />
    </Rect>
  );
}

/**
 * Add and remove a validated scene caption track on the scene timeline.
 * Call from a scene with `yield* Captions({parent: view, ...})`.
 */
export function* Captions({
  parent,
  ratio,
  captions,
}: CaptionsProps): ThreadGenerator {
  const chronological = [...captions].sort(
    (left, right) => left.startSec - right.startSec,
  );
  let cursorSec = 0;

  for (const caption of chronological) {
    yield* waitFor(Math.max(0, caption.startSec - cursorSec));
    const node = makeCaptionNode(caption.text, ratio);
    parent.add(node);
    yield* waitFor(caption.endSec - caption.startSec);
    node.remove();
    cursorSec = caption.endSec;
  }
}

export default Captions;
