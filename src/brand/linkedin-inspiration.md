# LinkedIn Video Inspiration — Animation & Flow Reference

Analysis of 4 real LinkedIn B2B tech videos (AWS, Cohesity, Stripe, Google)
whose flow and animations Pay Theory's short-form videos should emulate.

## Verified animation patterns (from frame-by-frame vision analysis)

### 1. Alternating text cards and photo cards

The videos alternate between two scene types:

**Text-only card:** Brand gradient background, white sans-serif text,
left-aligned in the lower third. No photo, no logo, no decoration.
One idea per card, 3-5 words per line, 2-3 lines max.

**Photo card:** Rounded-corner photo in upper 60% of frame, white text
caption in lower 30%, left-aligned flush with photo's left edge.
Photo has a subtle drop shadow (floating card feel).

### 2. Scene flow (verified from AWS video, 22s)

```
0-4s:  Text-only hook  → "Ready to build a production-grade AI Agent?"
4-8s:  Photo card       → Two people at desk + "AWS Startup Advisor"
8-12s: B-roll photo     → Woman typing (no text, pure visual breathing room)
12-16s: Photo card      → Two people + "Expert guidance across key agent runtimes — ECS/EKS"
16-22s: Text-only CTA   → "Get started with an idea or existing code"
```

The rhythm: HOOK → PROOF → BREATHE → DETAIL → CTA
Text cards open and close the video. Photo cards carry the middle.
B-roll with no text gives the viewer a visual breather.

### 3. Background gradient

- **AWS:** Purple-to-blue vertical gradient (lighter violet top, deeper blue bottom)
- **Cohesity:** Soft lavender/periwinkle diagonal gradient
- **Stripe:** Cobalt-violet vertical gradient
- **Google:** White/flat (UI demo style)

All use smooth 2-3 stop gradients, no banding, no texture, no patterns.
The gradient is a permanent brand canvas — it stays consistent across
all scenes. Photos float on top of it with rounded corners + shadow.

### 4. Typography

- **Font:** Humanist sans-serif (Inter / SF Pro / GT America style)
- **Weight:** Medium (500-600), NOT bold — reads as confident, not pushy
- **Size:** Large for mobile (36-56pt relative to 1080px width)
- **Color:** Pure white (#FFFFFF), no shadow, no stroke
- **Alignment:** Left-aligned, ragged right
- **Case:** Sentence case, no all-caps
- **Line breaks:** Semantic — break at natural pause points
- **Em dashes:** Used for deliberate pauses before product names
- **Line height:** Tight (1.05-1.15x) for headlines

### 5. Text entry animation (inferred from frame analysis)

- Text fades in with a small slide-up: 0 → full opacity, 12-20px upward
  translate, 300-500ms ease-out
- Text settles into place and holds for the full scene duration
- No typewriter effect, no word-by-word reveal
- Photo cards: photo fades in first, then text fades in 200-300ms after

### 6. Transitions between scenes

- Hard cuts on the voiceover beat — no crossfades, no wipes, no zooms
- The persistent gradient background provides visual continuity
- Photo cards swap cleanly (old photo fades out, new photo fades in)
- Text-only cards: old text fades out, new text fades in (200ms gap)

### 7. Pacing

- 4-6 seconds per scene
- One idea per scene, stated in under 15 words
- 5 scenes in a 22-second video
- B-roll scenes (no text) give visual breathing room
- The video never rushes — each idea gets its full beat

### 8. Layout grid (9:16 portrait, 1080x1920)

```
┌─────────────────────────────┐
│  (top safe area, ~5%)       │
│                             │
│  ┌─────────────────────┐    │  ← Photo card (rounded corners)
│  │                     │    │     90% width, centered
│  │     PHOTO           │    │     ~55% height
│  │                     │    │
│  └─────────────────────┘    │
│                             │  ← Breathing space (~8%)
│  Text line one              │  ← Caption (left-aligned)
│  Text line two              │     flush with photo's left edge
│  Text line three            │
│                             │
│  (bottom safe area, ~5%)    │
└─────────────────────────────┘
```

For text-only cards: photo area becomes empty gradient space,
text moves to center-lower third.

### 9. Color palette for Pay Theory adaptation

From `src/brand/tokens.ts`:
- Background gradient: deep purple (#2D1B4E) → violet (#7C3AED) →
  light lavender tint (#EDE9F5)
- Text: pure white on dark gradient
- Photo cards: rounded corners (radius ~24px), subtle drop shadow
- No additional colors — restraint is what makes it feel polished

## Scene structure template for Pay Theory videos

```
Scene 1 (0-4s):  TEXT-ONLY HOOK
  - Purple gradient background
  - Hook question or statement, 2-3 lines, white text, left-aligned
  - Fades in with slide-up

Scene 2 (4-8s):  PHOTO CARD — THE PRODUCT/PROBLEM
  - Same gradient background
  - Photo of person/product in rounded card, upper 60%
  - Caption below: one line naming what the photo shows
  - Photo fades in first, text follows 200ms later

Scene 3 (8-12s): B-ROLL BREATHE
  - Same gradient background
  - B-roll photo, no text
  - Pure visual — lets the viewer absorb before the next point

Scene 4 (12-16s): PHOTO CARD — THE PROOF/DETAIL
  - Same gradient background
  - Photo of the solution/team/product
  - Caption: one key stat or capability, with em dash before the name

Scene 5 (16-22s): TEXT-ONLY CTA
  - Same gradient background
  - Call to action, 2-3 lines
  - "Get started" or equivalent
  - Fades in, holds, video ends
```

## What NOT to do

- No flashy transitions (whip-pans, zoom-ins, glitch effects, wipes)
- No text that pops or bounces — everything fades smoothly
- No bold or all-caps text — medium weight, sentence case only
- No scene longer than 6 seconds — keep the pace moving
- No drop shadows on text (only on photo cards)
- No paid image APIs — use local rendering only
- No copy from the reference posts — imitate the construction, not the words
- No more than one idea per scene