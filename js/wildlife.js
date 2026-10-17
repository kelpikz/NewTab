import { rand, pick } from './scene.js';

// Frogs and turtles for the koi pond. A frog sits on a lily pad, then hops to
// a pad nearby. A turtle glides under the water. Both are drawn in pond units,
// like the koi, and both are pure data until a scene draws them.

const SIT = [4, 12]; // seconds a frog sits between hops
const NEAR = 4; // a frog picks its next pad from the nearest few

const FROG = { body: '#6aa84f', spot: '#2f6b35', eye: '#d8ec9a' };
const TURTLE = { shell: '#4a5a2a', plate: '#2e3a1c', skin: '#7d8f45', eye: '#16200e' };

/** The pads nearest to one pad, closest first. The pad itself is left out. */
export function nearestPads(pads, index, count = NEAR) {
  const from = pads[index];
  return pads
    .map((pad, i) => ({ i, d: Math.hypot(pad.x - from.x, pad.y - from.y) }))
    .filter(({ i }) => i !== index)
    .sort((a, b) => a.d - b.d)
    .slice(0, count)
    .map(({ i }) => i);
}

/** `count` frogs, each on its own pad. */
export function makeFrogs(pads, count) {
  const order = pads.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand(0, i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order.slice(0, count).map((at) => ({
    at,
    to: -1,
    t: 0,
    dur: 1,
    rest: rand(SIT[0], SIT[1]),
    turn: rand(0, Math.PI * 2),
  }));
}

function startHop(frog, pads, to) {
  const from = pads[frog.at];
  const target = pads[to];
  const d = Math.hypot(target.x - from.x, target.y - from.y);
  Object.assign(frog, {
    to,
    t: 0,
    dur: Math.min(1.2, Math.max(0.5, d / 60)),
    turn: Math.atan2(target.y - from.y, target.x - from.x),
  });
}

/** Move the frogs on. A sitting frog hops to a free pad nearby when it rests. */
export function updateFrogs(frogs, pads, dt) {
  for (const frog of frogs) {
    if (frog.to >= 0) {
      frog.t += dt / frog.dur;
      if (frog.t >= 1) Object.assign(frog, { at: frog.to, to: -1, t: 0, rest: rand(SIT[0], SIT[1]) });
      continue;
    }
    frog.rest -= dt;
    if (frog.rest > 0) continue;
    const taken = new Set(frogs.flatMap((other) => [other.at, other.to]));
    const free = nearestPads(pads, frog.at).filter((i) => !taken.has(i));
    if (free.length) startHop(frog, pads, pick(free));
    else frog.rest = 1;
  }
}

/** Where a frog is, and how high it is off the pad. Zero when it sits. */
export function frogPose(frog, pads) {
  const from = pads[frog.at];
  if (frog.to < 0) return { x: from.x, y: from.y, lift: 0 };
  const to = pads[frog.to];
  return {
    x: from.x + (to.x - from.x) * frog.t,
    y: from.y + (to.y - from.y) * frog.t,
    lift: Math.sin(Math.PI * frog.t),
  };
}

// One frog, drawn in one colour set. Its head points along +x before `turn`.
function frogShape(c, x, y, turn, s, body, spot, eye) {
  c.save();
  c.translate(x, y);
  c.rotate(turn);
  c.fillStyle = body;
  for (const side of [-1, 1]) {
    c.beginPath();
    c.ellipse(-s, side * 2.4 * s, 1.7 * s, 0.7 * s, side * 0.5, 0, Math.PI * 2);
    c.fill();
  }
  c.beginPath();
  c.ellipse(0, 0, 2.6 * s, 1.9 * s, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = spot;
  for (const side of [-1, 1]) {
    c.beginPath();
    c.arc(-0.6 * s, side * 0.9 * s, 0.45 * s, 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = eye;
  for (const side of [-1, 1]) {
    c.beginPath();
    c.arc(1.5 * s, side * 1 * s, 0.6 * s, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

/** Draw a frog. In the air it is larger and throws a shadow onto the pad. */
export function drawFrog(c, frog, pose, paint) {
  const s = 1 + 0.35 * pose.lift;
  if (pose.lift > 0) {
    const off = pose.lift * 2.5;
    const shadow = 'rgba(4, 34, 30, 0.35)';
    frogShape(c, pose.x + off, pose.y + off, frog.turn, s, shadow, shadow, shadow);
  }
  frogShape(c, pose.x, pose.y, frog.turn, s, paint(FROG.body), paint(FROG.spot), paint(FROG.eye));
}

/** Turtles, spread over the middle of the water. */
export function makeTurtles(W, H, count) {
  return Array.from({ length: count }, () => ({
    x: rand(W * 0.25, W * 0.75),
    y: rand(H * 0.25, H * 0.75),
    angle: rand(0, Math.PI * 2),
    speed: rand(2, 3.2),
    size: rand(4.5, 6),
    phase: rand(0, 100),
  }));
}

/** Glide the turtles on. They turn gently, and turn back near the edges. */
export function updateTurtles(turtles, dt, t, W, H) {
  for (const turtle of turtles) {
    let turn = Math.sin(t * 0.13 + turtle.phase) * 0.3;
    const edge = 20;
    if (turtle.x < edge || turtle.x > W - edge || turtle.y < edge || turtle.y > H - edge) {
      const toward = Math.atan2(H / 2 - turtle.y, W / 2 - turtle.x);
      turn += Math.atan2(Math.sin(toward - turtle.angle), Math.cos(toward - turtle.angle)) * 1.5;
    }
    turtle.angle += turn * dt;
    turtle.x += Math.cos(turtle.angle) * turtle.speed * dt;
    turtle.y += Math.sin(turtle.angle) * turtle.speed * dt;
  }
}

/** Draw a turtle on the floor: a shadow, four paddling flippers, a shell and a head. */
export function drawTurtle(c, turtle, t, paint) {
  const { x, y, angle, size: r, phase } = turtle;
  const paddle = Math.sin(t * 3 + phase) * 0.5;
  c.fillStyle = 'rgba(4, 30, 28, 0.3)';
  c.beginPath();
  c.ellipse(x + 1.2, y + 1.5, r, r * 0.8, angle, 0, Math.PI * 2);
  c.fill();

  c.save();
  c.translate(x, y);
  c.rotate(angle);
  c.fillStyle = paint(TURTLE.skin);
  for (const side of [-1, 1]) {
    for (const front of [true, false]) {
      const stroke = front ? paddle * side : -paddle * side * 0.5;
      c.beginPath();
      c.ellipse(front ? r * 0.55 : -r * 0.55, side * r * 0.85, r * 0.45, r * 0.18, side * 0.5 + stroke, 0, Math.PI * 2);
      c.fill();
    }
  }
  c.beginPath();
  c.ellipse(r * 0.95, 0, r * 0.3, r * 0.26, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = paint(TURTLE.shell);
  c.beginPath();
  c.ellipse(0, 0, r, r * 0.8, 0, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = paint(TURTLE.plate);
  c.lineWidth = 0.5;
  c.beginPath();
  c.ellipse(0, 0, r * 0.5, r * 0.42, 0, 0, Math.PI * 2);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    c.moveTo(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.42);
    c.lineTo(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.76);
  }
  c.stroke();
  c.fillStyle = paint(TURTLE.eye);
  c.beginPath();
  c.arc(r * 1.1, -r * 0.12, r * 0.07, 0, Math.PI * 2);
  c.arc(r * 1.1, r * 0.12, r * 0.07, 0, Math.PI * 2);
  c.fill();
  c.restore();
}
