import assert from "node:assert/strict";
import test from "node:test";

import {
  breathAt,
  chipOrbit,
  driftInward,
  idleOffsetAt,
  pulseTrackY,
  chipRowY,
} from "./idle";

const SPEC = {
  amplitudeX: 10,
  amplitudeY: 6,
  periodSec: 8,
  phase: 0.4,
} as const;

test("idleOffsetAt never leaves the ellipse its amplitudes describe", () => {
  for (let step = 0; step <= 400; step += 1) {
    const [dx, dy] = idleOffsetAt(SPEC, step * 0.05);
    assert.ok(Math.abs(dx) <= SPEC.amplitudeX + 1e-9, `dx ${dx} out of range`);
    assert.ok(Math.abs(dy) <= SPEC.amplitudeY + 1e-9, `dy ${dy} out of range`);
  }
});

test("idleOffsetAt repeats exactly one period later", () => {
  const [x0, y0] = idleOffsetAt(SPEC, 2.3);
  const [x1, y1] = idleOffsetAt(SPEC, 2.3 + SPEC.periodSec);
  assert.ok(Math.abs(x0 - x1) < 1e-9);
  assert.ok(Math.abs(y0 - y1) < 1e-9);
});

test("chipOrbit gives sibling chips different periods and phases", () => {
  const orbits = [0, 1, 2].map((index) => chipOrbit(index, 40));
  const periods = new Set(orbits.map((orbit) => orbit.periodSec));
  const phases = new Set(orbits.map((orbit) => orbit.phase));
  assert.equal(periods.size, 3);
  assert.equal(phases.size, 3);
});

test("chipOrbit amplitudes stay under a quarter of the chip's type size", () => {
  const orbit = chipOrbit(0, 40);
  assert.ok(orbit.amplitudeX <= 10);
  assert.ok(orbit.amplitudeY <= 10);
});

test("driftInward starts at rest and never goes negative", () => {
  assert.equal(driftInward(12, 9, 0), 0);
  for (let step = 0; step <= 400; step += 1) {
    const value = driftInward(12, 9, step * 0.05);
    assert.ok(value >= -1e-9, `drift ${value} moved out through the margin`);
    assert.ok(value <= 12 + 1e-9, `drift ${value} exceeded its amplitude`);
  }
});

test("breathAt stays inside its depth band and is centred on 1", () => {
  for (let step = 0; step <= 400; step += 1) {
    const value = breathAt(0.03, 5.5, step * 0.05);
    assert.ok(value >= 0.97 - 1e-9);
    assert.ok(value <= 1.03 + 1e-9);
  }
  assert.equal(breathAt(0.03, 5.5, 0), 1);
});

test("the pulse track and the chip row sit inside the empty band, pulse lower", () => {
  const height = 1350;
  // 63% of frame height, in centre-origin coordinates (L6).
  const contentBottom = -height / 2 + height * 0.63;
  const track = pulseTrackY(contentBottom, height);
  const chips = chipRowY(contentBottom, height);

  assert.ok(chips > contentBottom, "chips must clear the content band");
  assert.ok(track > chips, "the pulse must sit below the chip row");
  assert.ok(track < height / 2, "the pulse must stay inside the frame");
});

