import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/env.js';
import { nearestPads, makeFrogs, updateFrogs, frogPose, makeTurtles, updateTurtles } from '../js/wildlife.js';

test('the next pad is one of the nearest, and never the pad itself', () => {
  const pads = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 50, y: 0 },
    { x: 100, y: 0 },
    { x: 11, y: 11 },
  ];
  assert.deepEqual(nearestPads(pads, 0, 2), [1, 4]);
});

test('each frog starts on its own pad', () => {
  const pads = Array.from({ length: 6 }, (_, i) => ({ x: i * 30, y: (i % 2) * 25 }));
  const frogs = makeFrogs(pads, 4);
  assert.equal(new Set(frogs.map((frog) => frog.at)).size, 4);
});

test('a frog sits, hops to a free pad, and lands there', () => {
  const pads = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 0, y: 40 }];
  const frogs = [{ at: 0, to: -1, t: 0, dur: 1, rest: 0.1, turn: 0 }];
  updateFrogs(frogs, pads, 0.2);
  assert.ok(frogs[0].to === 1 || frogs[0].to === 2, 'it hops to a pad nearby');

  frogs[0].to = 1;
  frogs[0].t = 0.99;
  updateFrogs(frogs, pads, 0.05);
  assert.equal(frogs[0].at, 1);
  assert.equal(frogs[0].to, -1);
});

test('no two frogs ever share a pad', () => {
  const pads = Array.from({ length: 8 }, (_, i) => ({ x: (i % 4) * 35, y: Math.floor(i / 4) * 35 }));
  const frogs = makeFrogs(pads, 4);
  for (let i = 0; i < 3000; i++) {
    updateFrogs(frogs, pads, 0.05);
    const used = frogs.flatMap((frog) => [frog.at, frog.to]).filter((pad) => pad >= 0);
    const hopping = frogs.filter((frog) => frog.to >= 0).length;
    assert.equal(new Set(used).size, frogs.length + hopping, 'every pad is used once');
  }
});

test('a frog is on the pad at rest, and in the air at the middle of a hop', () => {
  const pads = [{ x: 0, y: 0 }, { x: 40, y: 0 }];
  assert.deepEqual(frogPose({ at: 0, to: -1, t: 0 }, pads), { x: 0, y: 0, lift: 0 });
  const middle = frogPose({ at: 0, to: 1, t: 0.5 }, pads);
  assert.equal(middle.x, 20);
  assert.ok(Math.abs(middle.lift - 1) < 1e-9);
});

test('turtles glide but stay in the pond', () => {
  const turtles = makeTurtles(480, 300, 2);
  let t = 0;
  for (let i = 0; i < 6000; i++) {
    t += 1 / 30;
    updateTurtles(turtles, 1 / 30, t, 480, 300);
  }
  for (const turtle of turtles) {
    assert.ok(turtle.x > -30 && turtle.x < 510, 'inside the width');
    assert.ok(turtle.y > -30 && turtle.y < 330, 'inside the height');
  }
});
