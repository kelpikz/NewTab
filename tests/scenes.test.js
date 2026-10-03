import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/env.js';

// Node has no canvas. This one takes every call and draws nothing, which is
// enough to run each scene frame by frame and catch any error in its code.
// For a shader scene it says yes to every compile, so the code round the
// shader runs too.
function fakeCanvas() {
  const canvas = { width: 300, height: 150 };
  const gradient = { addColorStop() {} };
  const known = {
    canvas,
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createPattern: () => ({}),
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    getShaderParameter: () => true,
    getProgramParameter: () => true,
    drawingBufferWidth: 300,
    drawingBufferHeight: 150,
    ellipse(x, y, rx, ry) {
      if (rx < 0 || ry < 0) throw new RangeError('The radius is negative.');
    },
    arc(x, y, r) {
      if (r < 0) throw new RangeError('The radius is negative.');
    },
  };
  canvas.getContext = () =>
    new Proxy(known, {
      get: (target, key) => (key in target ? target[key] : () => {}),
      set: (target, key, value) => {
        target[key] = value;
        return true;
      },
    });
  return canvas;
}

globalThis.document = { createElement: () => fakeCanvas() };

const { blendByMinute, hexToRgb } = await import('../js/scene.js');
const koi = await import('../js/koi.js');
const pond = await import('../js/pond.js');
const { skyFor } = await import('../js/weather.js');

/* Every scene runs --------------------------------------------------- */

const SCENES = { koi, pond };

describe('every scene draws frame after frame', () => {
  for (const [name, module] of Object.entries(SCENES)) {
    for (const look of ['smooth', 'pixel']) {
      for (const weather of [null, 'rain', 'snow', 'fog']) {
        test(`${name}, ${look}, ${weather ?? 'clear'}`, () => {
          const ctx = fakeCanvas().getContext('2d');
          const pointer = { x: 50, y: 40, inside: true, free: true, movedAt: 0 };
          const env = { pixel: look === 'pixel', weather, pointer, accent: '#5ad2a0', time: 0 };
          const scene = module.createScene(ctx, env);
          const scale = look === 'pixel' ? (scene.pixelResolution ?? 0.25) : scene.resolution;
          scene.resize(Math.round(1280 * scale), Math.round(720 * scale), scale);
          let time = 0;
          for (let i = 0; i < 400; i++) {
            time += 1 / 30;
            env.time = time;
            if (i === 100) scene.tap?.(60, 30);
            if (i === 200) scene.tap?.(60, 700 * scale);
            scene.frame(1 / 30, time);
          }
          scene.resize(Math.round(900 * scale), Math.round(1400 * scale), scale);
          scene.frame(1 / 30, time + 1);
        });
      }
    }
  }
});

/* Shared helpers ----------------------------------------------------- */

test('colours blend between the stops of the day and wrap round midnight', () => {
  const stops = [
    { at: 0, tone: [0, 0, 0], level: 0 },
    { at: 720, tone: [200, 100, 0], level: 1 },
    { at: 1440, tone: [0, 0, 0], level: 0 },
  ];
  assert.deepEqual(blendByMinute(stops, 360), { tone: [100, 50, 0], level: 0.5 });
  assert.deepEqual(blendByMinute(stops, 1440 + 720), blendByMinute(stops, 720));
  assert.deepEqual(blendByMinute(stops, -360), blendByMinute(stops, 1080));
});

test('hex colours read in long and short form, with a safe fallback', () => {
  assert.deepEqual(hexToRgb('#7c9cff'), [124, 156, 255]);
  assert.deepEqual(hexToRgb('#fff'), [255, 255, 255]);
  assert.deepEqual(hexToRgb('not a colour'), [124, 156, 255]);
});

test('the weather picks rain, snow, fog or cloud', () => {
  assert.equal(skyFor(63), 'rain');
  assert.equal(skyFor(95), 'rain');
  assert.equal(skyFor(73), 'snow');
  assert.equal(skyFor(45), 'fog');
  assert.equal(skyFor(3), 'cloud');
  assert.equal(skyFor(0), null);
});

/* Koi pond ----------------------------------------------------------- */

test('the pond is clear at noon and dark with fireflies at midnight', () => {
  const noon = koi.lightAt(12 * 60);
  assert.deepEqual(noon.tint, [255, 255, 255]);
  assert.equal(noon.flies, 0);
  const midnight = koi.lightAt(0);
  assert.ok(midnight.tint.every((value) => value < 160));
  assert.equal(midnight.flies, 1);
});

test('a koi spine keeps its links the same length', () => {
  const points = [
    { x: 10, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 3 },
  ];
  koi.followChain(points, 2);
  assert.deepEqual(points[1], { x: 8, y: 0 });
  const link = Math.hypot(points[2].x - points[1].x, points[2].y - points[1].y);
  assert.ok(Math.abs(link - 2) < 1e-9);
});

test('a koi turns the short way round', () => {
  assert.ok(Math.abs(koi.turnToward(0.1, -0.1) - 0.2) < 1e-9);
  assert.ok(koi.turnToward(-3, 3) > 0, 'across the back, not the long way');
});

test('a dent in the water spreads out as a ring and fades', () => {
  const size = 41;
  let now = new Float32Array(size * size);
  let last = new Float32Array(size * size);
  const calm = new Float32Array(size * size).fill(0.985);
  const centre = 20 * size + 20;
  now[centre] = -1;
  for (let i = 0; i < 12; i++) {
    pond.waveStep(now, last, calm, size, size);
    [now, last] = [last, now];
  }
  const ring = Math.max(...[8, 9, 10, 11, 12].map((r) => Math.abs(now[20 * size + 20 + r])));
  assert.ok(ring > Math.abs(now[centre + 1]) * 0.5, 'the wave has moved out');
  for (let i = 0; i < 2000; i++) {
    pond.waveStep(now, last, calm, size, size);
    [now, last] = [last, now];
  }
  assert.ok(Math.max(...now.map(Math.abs)) < 1e-3, 'and then it dies away');
});

test('the light web wraps at its edges', () => {
  const size = 64;
  const tile = pond.webTile(size, 4);
  assert.equal(tile.length, size * size);
  assert.ok(Math.max(...tile) > 200, 'bright lines');
  assert.ok(tile.filter((v) => v < 128).length > tile.length / 2, 'on a mostly dark floor');
  // Across the wrap, neighbours differ no more than neighbours inside do.
  let seam = 0;
  let inside = 0;
  for (let y = 0; y < size; y++) {
    seam = Math.max(seam, Math.abs(tile[y * size] - tile[y * size + size - 1]));
    for (let x = 1; x < size; x++) inside = Math.max(inside, Math.abs(tile[y * size + x] - tile[y * size + x - 1]));
  }
  assert.ok(seam <= inside + 8, 'no seam where the tile meets itself');
});
