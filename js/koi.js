import { rand, pick, rgb, sheet, blendByMinute, minuteOfDay, hexToRgb } from './scene.js';

// A koi pond seen from above, painted on a 2D canvas. The world is measured
// in pond units of four screen pixels. The pixel look draws one canvas pixel
// per unit; the smooth look draws four. The water and the pads are painted
// once a minute with the light of that minute baked in, so a frame only moves
// the living things.
//
// On its own this is the whole pond. The GPU pond in pond.js gives it
// `env.water`: then the pads and the dragonfly go on `env.water.above`, the
// floor goes on `ctx` to be seen through the waves, ripples go to the water
// itself, and the koi are handed over in `water.fish` for the GPU to draw.

const UNIT = 4; // screen pixels per pond unit
const TILE = 96; // size of the light net on the pond floor, in units

// The light at fixed minutes of the day.
const NIGHT = { tint: [74, 96, 150], glow: [150, 180, 235], glowAlpha: 0.16, flies: 1 };
const DAY = { tint: [255, 255, 255], glow: [215, 255, 235], glowAlpha: 0.22, flies: 0 };
const LIGHT = [
  { at: 0, ...NIGHT },
  { at: 300, ...NIGHT },
  { at: 390, tint: [255, 200, 165], glow: [255, 190, 140], glowAlpha: 0.3, flies: 0.2 },
  { at: 600, ...DAY },
  { at: 1020, ...DAY },
  { at: 1140, tint: [215, 165, 200], glow: [255, 160, 110], glowAlpha: 0.3, flies: 0.3 },
  { at: 1260, ...NIGHT },
  { at: 1440, ...NIGHT },
];

const COATS = [
  { body: '#f3ece0', spots: ['#d9412f'] },
  { body: '#f3ece0', spots: ['#d9412f', '#23232b'] },
  { body: '#f08a2c', spots: [], fin: '#ffc27a' },
  { body: '#f6d25a', spots: [], fin: '#fff0b0' },
  { body: '#2a2d3a', spots: ['#f08a2c', '#f3ece0'] },
  { body: '#e6ecf1', spots: ['#7f95ad'] },
];

// Body width along the spine, head first.
const PROFILE = [0.8, 1, 1, 0.92, 0.8, 0.64, 0.48, 0.34, 0.24];

/** The pond light for a minute of the day. Minutes wrap. */
export function lightAt(minutes) {
  return blendByMinute(LIGHT, minutes);
}

/** Pull each point to a fixed distance behind the one before it. */
export function followChain(points, gap) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    b.x = a.x + (dx / d) * gap;
    b.y = a.y + (dy / d) * gap;
  }
}

/** The smallest turn from angle `from` to angle `to`, in -PI..PI. */
export function turnToward(to, from) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

/* ------------------------------------------------------------------ */
/* Painted once                                                        */
/* ------------------------------------------------------------------ */

function paintWater(c, W, H, smooth) {
  const base = c.createLinearGradient(0, 0, W, H);
  base.addColorStop(0, '#5aa892');
  base.addColorStop(0.55, '#357f6f');
  base.addColorStop(1, '#1e5a50');
  c.fillStyle = base;
  c.fillRect(0, 0, W, H);

  // Soft patches of algae and darker silt.
  for (let i = 0; i < (W * H) / 3000; i++) {
    const x = rand(0, W);
    const y = rand(0, H);
    const r = rand(12, 40);
    const patch = c.createRadialGradient(x, y, 0, x, y, r);
    const green = Math.random() < 0.6;
    patch.addColorStop(0, green ? 'rgba(40, 90, 40, 0.18)' : 'rgba(6, 34, 30, 0.2)');
    patch.addColorStop(1, 'rgba(6, 34, 30, 0)');
    c.fillStyle = patch;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Beds of round stones, thick near the banks and thin toward the middle,
  // so the open water stays calm under the page. The water tints them.
  const stones = ['#9c9a78', '#b0a07a', '#7f8a6c', '#c2b48e', '#8a8f80', '#a48a66'];
  const count = (W * H) / (smooth ? 85 : 120);
  for (let i = 0; i < count; i++) {
    const x = rand(-4, W + 4);
    const y = rand(-4, H + 4);
    const edge = Math.min(x, y, W - x, H - y) / Math.min(W, H);
    if (Math.random() < edge * 3.2) continue;
    const r = rand(0.8, 2.6) * (1.2 - edge);
    const tilt = rand(0, Math.PI);
    const stretch = rand(0.5, 0.9);
    c.fillStyle = 'rgba(4, 30, 26, 0.16)';
    c.beginPath();
    c.ellipse(x + r * 0.35, y + r * 0.45, r, r * stretch, tilt, 0, Math.PI * 2);
    c.fill();
    const hue = pick(stones);
    if (smooth) {
      const shade = c.createRadialGradient(x - r * 0.35, y - r * 0.4, 0, x, y, r * 1.1);
      shade.addColorStop(0, hue);
      shade.addColorStop(1, 'rgba(40, 92, 80, 1)');
      c.fillStyle = shade;
    } else c.fillStyle = hue;
    c.globalAlpha = 0.32;
    c.beginPath();
    c.ellipse(x, y, r, r * stretch, tilt, 0, Math.PI * 2);
    c.fill();
    c.globalAlpha = 1;
  }

  // A few leaves that sank long ago.
  const browns = ['#7a5a32', '#8c4a2a', '#6b6a3a'];
  for (let i = 0; i < (W * H) / 9000 + 2; i++) {
    const x = rand(0, W);
    const y = rand(0, H);
    const size = rand(4, 7);
    const turn = rand(0, Math.PI * 2);
    c.save();
    c.translate(x, y);
    c.rotate(turn);
    c.globalAlpha = 0.45;
    c.fillStyle = pick(browns);
    c.beginPath();
    c.moveTo(-size, 0);
    c.quadraticCurveTo(0, -size * 0.55, size, 0);
    c.quadraticCurveTo(0, size * 0.55, -size, 0);
    c.fill();
    c.strokeStyle = 'rgba(40, 30, 16, 0.6)';
    c.lineWidth = 0.3;
    c.beginPath();
    c.moveTo(-size * 1.2, 0);
    c.lineTo(size, 0);
    c.stroke();
    c.restore();
  }
  c.globalAlpha = 1;

  // Deep water darkens toward the banks.
  const edge = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
  edge.addColorStop(0, 'rgba(8, 40, 36, 0)');
  edge.addColorStop(1, 'rgba(8, 40, 36, 0.45)');
  c.fillStyle = edge;
  c.fillRect(0, 0, W, H);

  // Grains of silt.
  const grain = smooth ? 0.5 : 1;
  for (let i = 0; i < (W * H) / 50; i++) {
    c.fillStyle = Math.random() < 0.7 ? 'rgba(10, 50, 44, 0.2)' : 'rgba(210, 255, 240, 0.07)';
    c.fillRect(Math.floor(rand(0, W)), Math.floor(rand(0, H)), grain, grain);
  }
}

// Light bent by the ripples on top makes a net of bright lines on the floor.
// These are the edges of a cell pattern that wraps at the tile border. A
// small wave on each axis bends the lines, and it wraps at the border too.
function paintLightNet(detail) {
  const size = TILE * detail;
  const [tile, t] = sheet(size, size);
  const seeds = Array.from({ length: 14 }, () => [rand(0, TILE), rand(0, TILE)]);
  const image = t.createImageData(size, size);
  const wave = (Math.PI * 2) / TILE;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const x = px / detail;
      const y = py / detail;
      const wx = x + Math.sin(y * wave * 2) * 3;
      const wy = y + Math.sin(x * wave * 3) * 3;
      let d1 = Infinity;
      let d2 = Infinity;
      for (const [sx, sy] of seeds) {
        let dx = Math.abs(wx - sx) % TILE;
        let dy = Math.abs(wy - sy) % TILE;
        dx = Math.min(dx, TILE - dx);
        dy = Math.min(dy, TILE - dy);
        const d = Math.hypot(dx, dy);
        if (d < d1) {
          d2 = d1;
          d1 = d;
        } else if (d < d2) d2 = d;
      }
      const line = Math.max(0, 1 - (d2 - d1) / 1.8) ** 2;
      image.data.set([215, 255, 240, line * 140], (py * size + px) * 4);
    }
  }
  t.putImageData(image, 0, 0);
  return tile;
}

// Pads keep to the edges and leave open water in the middle for the page.
function placePads(W, H) {
  const pads = [];
  const count = Math.round((W * H) / 16000) + 4;
  for (let i = 0; i < count; i++) {
    const angle = rand(0, Math.PI * 2);
    const reach = rand(0.85, 1.15);
    const x = W / 2 + Math.cos(angle) * (W / 2) * reach;
    const y = H / 2 + Math.sin(angle) * (H / 2) * reach;
    const r = rand(10, 22);
    pads.push({ x, y, r, notch: rand(0, Math.PI * 2), lotus: r > 14 && Math.random() < 0.35 });
    if (Math.random() < 0.6) {
      const side = rand(0, Math.PI * 2);
      pads.push({
        x: x + Math.cos(side) * r * 1.4,
        y: y + Math.sin(side) * r * 1.4,
        r: r * rand(0.4, 0.6),
        notch: rand(0, Math.PI * 2),
        lotus: false,
      });
    }
  }
  return pads;
}

function padPath(c, x, y, r, notch) {
  c.beginPath();
  c.moveTo(x, y);
  c.arc(x, y, r, notch + 0.28, notch - 0.28 + Math.PI * 2);
  c.closePath();
}

function paintLotus(c, x, y) {
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    c.fillStyle = '#ef8fb0';
    c.beginPath();
    c.ellipse(x + Math.cos(a) * 2.6, y + Math.sin(a) * 2.6, 3, 1.4, a, 0, Math.PI * 2);
    c.fill();
  }
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 0.3;
    c.fillStyle = '#ffd3e2';
    c.beginPath();
    c.ellipse(x + Math.cos(a) * 1.4, y + Math.sin(a) * 1.4, 1.8, 0.9, a, 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = '#f5b73b';
  c.beginPath();
  c.arc(x, y, 0.9, 0, Math.PI * 2);
  c.fill();
}

function paintDuckweed(c, x, y, spread, smooth) {
  const greens = ['#7ccf4f', '#a5e05f', '#4e9f3d'];
  const dot = (px, py, size) => {
    if (!smooth) return c.fillRect(px, py, size, size);
    c.beginPath();
    c.arc(px + size / 2, py + size / 2, size * 0.6, 0, Math.PI * 2);
    c.fill();
  };
  for (let i = 0; i < spread * 3; i++) {
    const px = Math.round(x + (Math.random() + Math.random() - 1) * spread);
    const py = Math.round(y + (Math.random() + Math.random() - 1) * spread * 0.7);
    const size = Math.random() < 0.3 ? 2 : 1;
    c.fillStyle = 'rgba(4, 36, 30, 0.35)';
    dot(px + 1, py + 1, size);
    c.fillStyle = pick(greens);
    dot(px, py, size);
  }
}

function paintPads(c, W, H, smooth) {
  const pads = placePads(W, H);

  c.fillStyle = 'rgba(4, 34, 30, 0.38)';
  pads.forEach((p) => {
    padPath(c, p.x + 3, p.y + 4, p.r, p.notch);
    c.fill();
  });

  const greens = [['#3a7a4c', '#1f4f36'], ['#2f6d4a', '#1a4630'], ['#4a8448', '#24502f'], ['#5f8a3e', '#2f5a2c']];
  pads.forEach((p) => {
    padPath(c, p.x, p.y, p.r, p.notch);
    const [light, dark] = pick(greens);
    const leaf = c.createRadialGradient(p.x - p.r * 0.3, p.y - p.r * 0.3, 0, p.x, p.y, p.r);
    leaf.addColorStop(0, light);
    leaf.addColorStop(0.85, dark);
    // The rim curls up a little and catches the light.
    leaf.addColorStop(1, Math.random() < 0.3 ? '#7a7a3a' : '#3f7a50');
    c.fillStyle = leaf;
    c.fill();
    c.strokeStyle = 'rgba(110, 180, 120, 0.45)';
    c.lineWidth = 1;
    c.beginPath();
    c.arc(p.x, p.y, p.r - 1, Math.PI * 0.95, Math.PI * 1.55);
    c.stroke();
    c.strokeStyle = 'rgba(16, 50, 32, 0.8)';
    c.lineWidth = 0.8;
    for (let k = 1; k < 6; k++) {
      const a = p.notch + (k / 6) * Math.PI * 2;
      c.beginPath();
      c.moveTo(p.x, p.y);
      c.lineTo(p.x + Math.cos(a) * p.r * 0.8, p.y + Math.sin(a) * p.r * 0.8);
      c.stroke();
    }
    // Drops of water bead on some pads.
    if (smooth && Math.random() < 0.6) {
      for (let k = 0; k < 3; k++) {
        const a = rand(0, Math.PI * 2);
        const d = rand(0.2, 0.7) * p.r;
        const x = p.x + Math.cos(a) * d;
        const y = p.y + Math.sin(a) * d;
        const size = rand(0.5, 1.1);
        c.fillStyle = 'rgba(10, 40, 24, 0.5)';
        c.beginPath();
        c.arc(x + size * 0.3, y + size * 0.3, size, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = 'rgba(200, 240, 220, 0.55)';
        c.beginPath();
        c.arc(x, y, size, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = 'rgba(255, 255, 255, 0.9)';
        c.beginPath();
        c.arc(x - size * 0.35, y - size * 0.35, size * 0.3, 0, Math.PI * 2);
        c.fill();
      }
    }
    if (p.lotus) paintLotus(c, p.x + rand(-3, 3), p.y + rand(-3, 3));
  });

  const clumps = Math.round((W + H) / 120) + 2;
  for (let i = 0; i < clumps; i++) {
    const p = pick(pads);
    const a = rand(0, Math.PI * 2);
    paintDuckweed(c, p.x + Math.cos(a) * p.r * 1.3, p.y + Math.sin(a) * p.r * 1.3, rand(5, 11), smooth);
  }
}

// Soft white blobs that drift over the water on a foggy day.
function paintMist(c, W, H) {
  for (let i = 0; i < 14; i++) {
    const x = rand(0, W);
    const y = rand(0, H);
    const r = rand(30, 70);
    const puff = c.createRadialGradient(x, y, 0, x, y, r);
    puff.addColorStop(0, 'rgba(235, 245, 245, 0.22)');
    puff.addColorStop(1, 'rgba(235, 245, 245, 0)');
    c.fillStyle = puff;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

/* ------------------------------------------------------------------ */
/* Living things                                                       */
/* ------------------------------------------------------------------ */

function makeKoi(W, H) {
  const length = rand(18, 30);
  const gap = length / (PROFILE.length - 1);
  const angle = rand(0, Math.PI * 2);
  const x = rand(W * 0.2, W * 0.8);
  const y = rand(H * 0.2, H * 0.8);
  const coat = pick(COATS);
  return {
    points: PROFILE.map((_, i) => ({ x: x - Math.cos(angle) * gap * i, y: y - Math.sin(angle) * gap * i })),
    gap,
    width: length * 0.17,
    angle,
    speed: rand(5, 9),
    boost: 0,
    phase: rand(0, 100),
    coat,
    curious: false,
    spots: coat.spots.length
      ? Array.from({ length: 2 + Math.floor(rand(0, 3)) }, () => ({
          at: 1 + Math.floor(rand(0, 5)),
          side: rand(-0.6, 0.6),
          size: rand(0.5, 0.8),
          color: pick(coat.spots),
        }))
      : [],
  };
}

function swim(koi, t, dt, W, H, food) {
  const head = koi.points[0];
  let turn = Math.sin(t * 0.23 + koi.phase) * 0.45 + Math.sin(t * 0.61 + koi.phase * 1.7) * 0.25;
  let pace = 1;
  const margin = 24;
  if (head.x < margin || head.x > W - margin || head.y < margin || head.y > H - margin) {
    turn += turnToward(Math.atan2(H / 2 - head.y, W / 2 - head.x), koi.angle) * 1.2;
  }
  // A curious koi noses up to a pointer that rests over open water.
  if (koi.curious && food) {
    const distance = Math.hypot(food.x - head.x, food.y - head.y);
    turn = turnToward(Math.atan2(food.y - head.y, food.x - head.x), koi.angle) * 1.6;
    pace = Math.min(1, Math.max(0.25, distance / 25));
  }
  koi.angle += turn * dt;
  koi.boost *= Math.exp(-dt * 1.5);
  const speed = koi.speed * pace * (0.75 + 0.25 * Math.sin(t * 0.4 + koi.phase)) + koi.boost;
  const heading = koi.angle + Math.sin(t * (3 + speed * 0.3) + koi.phase) * 0.15;
  head.x += Math.cos(heading) * speed * dt;
  head.y += Math.sin(heading) * speed * dt;
  followChain(koi.points, koi.gap);
}

// The direction a point on the spine faces, and the one at right angles.
function spineFrame(points, i) {
  const a = points[Math.max(i - 1, 0)];
  const b = points[Math.min(i + 1, points.length - 1)];
  const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
  const fx = (a.x - b.x) / d;
  const fy = (a.y - b.y) / d;
  return { fx, fy, px: -fy, py: fx };
}

function tailPath(c, koi, ox = 0, oy = 0) {
  const n = koi.points.length;
  const end = koi.points[n - 1];
  const { fx, fy, px, py } = spineFrame(koi.points, n - 1);
  const back = koi.gap * 1.6;
  const spread = koi.width * 0.9;
  c.moveTo(end.x + ox, end.y + oy);
  c.lineTo(end.x - fx * back + px * spread + ox, end.y - fy * back + py * spread + oy);
  c.lineTo(end.x - fx * back * 0.7 + ox, end.y - fy * back * 0.7 + oy);
  c.lineTo(end.x - fx * back - px * spread + ox, end.y - fy * back - py * spread + oy);
  c.closePath();
}

// One smooth outline: down the left side, across the tail, up the right
// side, and round the head.
function bodyPath(c, koi, ox = 0, oy = 0) {
  const { points } = koi;
  const n = points.length;
  const left = [];
  const right = [];
  for (let i = 0; i < n; i++) {
    const { px, py } = spineFrame(points, i);
    const r = koi.width * PROFILE[i];
    left.push([points[i].x + px * r + ox, points[i].y + py * r + oy]);
    right.push([points[i].x - px * r + ox, points[i].y - py * r + oy]);
  }
  const side = (edge) => {
    for (let i = 1; i < n - 1; i++) {
      c.quadraticCurveTo(edge[i][0], edge[i][1], (edge[i][0] + edge[i + 1][0]) / 2, (edge[i][1] + edge[i + 1][1]) / 2);
    }
    c.lineTo(edge[n - 1][0], edge[n - 1][1]);
  };
  c.moveTo(left[0][0], left[0][1]);
  side(left);
  right.reverse();
  c.lineTo(right[0][0], right[0][1]);
  side(right);
  const head = spineFrame(points, 0);
  const across = Math.atan2(head.py, head.px);
  c.arc(points[0].x + ox, points[0].y + oy, koi.width * PROFILE[0], across + Math.PI, across + Math.PI * 2);
  c.closePath();
}

function drawKoi(c, koi, paint, smooth) {
  const { coat, points, width } = koi;

  c.globalAlpha = 0.7;
  c.fillStyle = paint(coat.fin ?? coat.body);
  const root = points[2];
  const { fx, fy, px, py } = spineFrame(points, 2);
  [1, -1].forEach((side) => {
    c.beginPath();
    c.ellipse(
      root.x + px * side * width * 1.1 - fx * width * 0.3,
      root.y + py * side * width * 1.1 - fy * width * 0.3,
      width * 0.6,
      width * 0.3,
      Math.atan2(py * side - fy * 0.5, px * side - fx * 0.5),
      0,
      Math.PI * 2
    );
    c.fill();
  });
  c.beginPath();
  tailPath(c, koi);
  c.fill();
  c.globalAlpha = 1;

  c.fillStyle = paint(coat.body);
  c.beginPath();
  bodyPath(c, koi);
  c.fill();

  koi.spots.forEach((spot) => {
    const p = points[spot.at];
    const f = spineFrame(points, spot.at);
    const r = width * PROFILE[spot.at];
    c.fillStyle = paint(spot.color);
    c.beginPath();
    c.arc(p.x + f.px * spot.side * r * 0.5, p.y + f.py * spot.side * r * 0.5, r * spot.size * 0.7, 0, Math.PI * 2);
    c.fill();
  });

  // A soft sheen along the back makes the body read as round.
  c.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  c.lineWidth = width * 0.5;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(points[0].x - 0.4, points[0].y - 0.4);
  for (let i = 1; i < 6; i++) c.lineTo(points[i].x - 0.4, points[i].y - 0.4);
  c.stroke();

  if (smooth) {
    c.fillStyle = 'rgba(20, 20, 26, 0.85)';
    const head = spineFrame(points, 0);
    [1, -1].forEach((side) => {
      c.beginPath();
      c.arc(
        points[0].x + head.fx * width * 0.35 + head.px * side * width * 0.45,
        points[0].y + head.fy * width * 0.35 + head.py * side * width * 0.45,
        width * 0.1,
        0,
        Math.PI * 2
      );
      c.fill();
    });
  }
}

// A dragonfly darts from rest to rest across the pond, now and then.
function makeDragonfly(W, H) {
  const fromLeft = Math.random() < 0.5;
  const stops = [];
  const count = 3 + Math.floor(rand(0, 3));
  for (let i = 1; i <= count; i++) {
    const u = i / (count + 1);
    stops.push({ x: (fromLeft ? u : 1 - u) * W, y: rand(0.15, 0.85) * H });
  }
  stops.push({ x: fromLeft ? W + 20 : -20, y: rand(0, H) });
  return { x: fromLeft ? -20 : W + 20, y: rand(0, H), stops, rest: 0, angle: 0 };
}

function moveDragonfly(fly, dt) {
  if (fly.rest > 0) {
    fly.rest -= dt;
    return true;
  }
  const target = fly.stops[0];
  if (!target) return false;
  const dx = target.x - fly.x;
  const dy = target.y - fly.y;
  const d = Math.hypot(dx, dy);
  fly.angle = Math.atan2(dy, dx);
  const speed = Math.min(d * 3, 90);
  if (d < 1) {
    fly.stops.shift();
    fly.rest = fly.stops.length ? rand(0.6, 2) : 0;
    return true;
  }
  fly.x += (dx / d) * speed * dt;
  fly.y += (dy / d) * speed * dt;
  return true;
}

function drawDragonfly(c, fly, t, paint) {
  const beat = fly.rest > 0 ? 0.35 : 0.5 + 0.5 * Math.sin(t * 70);
  const draw = (ox, oy, body, wing) => {
    c.save();
    c.translate(fly.x + ox, fly.y + oy);
    c.rotate(fly.angle);
    c.fillStyle = wing;
    [-1, 1].forEach((side) => {
      c.beginPath();
      c.ellipse(1.2, side * 2.2, 2.6, 0.9 + beat * 0.4, side * 0.25, 0, Math.PI * 2);
      c.ellipse(-0.6, side * 2, 2.3, 0.8 + beat * 0.4, side * -0.2, 0, Math.PI * 2);
      c.fill();
    });
    c.fillStyle = body;
    c.fillRect(-4.5, -0.45, 6.5, 0.9);
    c.beginPath();
    c.arc(2.2, 0, 0.9, 0, Math.PI * 2);
    c.fill();
    c.restore();
  };
  draw(7, 9, 'rgba(4, 30, 28, 0.25)', 'rgba(4, 30, 28, 0.12)');
  draw(0, 0, paint('#2c7fb8'), 'rgba(225, 245, 255, 0.35)');
}

/* ------------------------------------------------------------------ */
/* The scene                                                           */
/* ------------------------------------------------------------------ */

export function createScene(ctx, env) {
  const smooth = !env.pixel;
  let k = 1; // canvas pixels per pond unit
  let W = 0;
  let H = 0;
  let raw = null; // the water and the pads before any light
  let lit = null; // the same with this minute's light baked in
  let net = null;
  let netScale = 1;
  let mist = null;
  let koi = [];
  let petals = [];
  let flies = [];
  let flakes = [];
  let ripples = [];
  let dragonfly = null;
  let nextDragonfly = rand(15, 40);
  let nextRise = rand(3, 8);
  let light = null;
  let brightness = 1;
  let litAt = -Infinity;
  let padsStale = true;
  let flew = false;
  const palette = new Map();

  const { weather, water } = env;
  const dim = weather === 'rain' || weather === 'cloud' ? 0.82 : 1;

  // Colours under this minute's light. Kept in a map so a frame does no maths.
  const paint = (hex) => {
    let value = palette.get(hex);
    if (!value) {
      value = rgb(hexToRgb(hex).map((channel, i) => (channel * light.tint[i] * dim) / 255));
      palette.set(hex, value);
    }
    return value;
  };

  const relight = () => {
    light = lightAt(minuteOfDay());
    brightness = ((light.tint[0] + light.tint[1] + light.tint[2]) / 765) * dim;
    palette.clear();
    padsStale = true;
    const [bed, pads] = raw;
    lit = [bed, pads].map((source, index) => {
      const [canvas, c] = sheet(source.width, source.height);
      c.drawImage(source, 0, 0);
      c.globalCompositeOperation = 'multiply';
      c.fillStyle = rgb(light.tint.map((v) => v * dim));
      c.fillRect(0, 0, canvas.width, canvas.height);
      if (index === 1) {
        // Multiply also paints the clear parts; cut them back out.
        c.globalCompositeOperation = 'destination-in';
        c.drawImage(source, 0, 0);
        return canvas;
      }
      c.globalCompositeOperation = 'screen';
      const glow = c.createRadialGradient(
        canvas.width * 0.15, canvas.height * 0.05, 0,
        canvas.width * 0.15, canvas.height * 0.05, Math.max(canvas.width, canvas.height) * 0.75
      );
      glow.addColorStop(0, rgb(light.glow, light.glowAlpha));
      glow.addColorStop(1, rgb(light.glow, 0));
      c.fillStyle = glow;
      c.fillRect(0, 0, canvas.width, canvas.height);
      return canvas;
    });
  };

  const ripple = (x, y, size, speed = 9) => {
    if (water) water.drop(x * k, y * k, size * k);
    else ripples.push({ x, y, r: 0, max: size, speed });
  };

  function resize(width, height, scale) {
    k = UNIT * scale;
    W = width / k;
    H = height / k;
    const layers = [paintWater, paintPads].map((paintLayer) => {
      const [canvas, c] = sheet(width, height);
      c.scale(k, k);
      paintLayer(c, W, H, smooth);
      return canvas;
    });
    raw = layers;
    const detail = smooth ? 2 : 1;
    const tile = paintLightNet(detail);
    net = ctx.createPattern(tile, 'repeat');
    netScale = 1 / detail;
    if (weather === 'fog') {
      const [canvas, c] = sheet(width, height);
      c.scale(k, k);
      paintMist(c, W, H);
      mist = canvas;
    }
    koi = Array.from({ length: Math.round((W * H) / 22000) + 3 }, () => makeKoi(W, H));
    petals = Array.from({ length: 6 }, () => ({
      x: rand(0, W), y: rand(0, H), vx: rand(0.6, 1.8), vy: rand(-0.4, 0.4), phase: rand(0, 10),
    }));
    flies = Array.from({ length: 12 }, () => ({ x: rand(0, W), y: rand(0, H), phase: rand(0, 100) }));
    flakes = weather === 'snow'
      ? Array.from({ length: 50 }, () => ({ x: rand(0, W), y: rand(0, H), life: rand(0, 1), size: rand(0.6, 1.3) }))
      : [];
    ripples = [];
    litAt = -Infinity;
  }

  function update(dt, t) {
    // The pointer counts as food once it has rested a moment on open water.
    const { pointer } = env;
    const food = pointer.inside && pointer.free && t - pointer.movedAt > 1.2
      ? { x: pointer.x / k, y: pointer.y / k }
      : null;
    if (food) {
      const near = koi
        .map((fish) => [fish, Math.hypot(fish.points[0].x - food.x, fish.points[0].y - food.y)])
        .sort((a, b) => a[1] - b[1]);
      koi.forEach((fish) => (fish.curious = false));
      near.slice(0, 2).forEach(([fish]) => (fish.curious = true));
      if (near[0]?.[1] < 6 && Math.random() < dt * 1.5) ripple(food.x, food.y, 5);
    } else koi.forEach((fish) => (fish.curious = false));

    koi.forEach((fish) => swim(fish, t, dt, W, H, food));
    if (water) {
      koi.forEach((fish) => water.stir(fish.points[0].x * k, fish.points[0].y * k, fish.boost + 2));
      water.fish = koi;
      water.unit = k;
    }

    nextRise -= dt;
    if (nextRise <= 0) {
      const head = pick(koi).points[0];
      ripple(head.x, head.y, rand(6, 10));
      nextRise = rand(4, 10);
    }
    if (weather === 'rain') {
      const drops = dt * (W * H) / 2500;
      for (let i = 0; i < Math.floor(drops) + (Math.random() < drops % 1 ? 1 : 0); i++) {
        ripple(rand(0, W), rand(0, H), rand(3, 6), 12);
      }
    }
    flakes.forEach((flake) => {
      flake.life += dt * 0.12;
      flake.x += Math.sin(t * 0.7 + flake.y) * dt * 2;
      flake.y += dt * 1.5;
      if (flake.life >= 1) {
        ripple(flake.x, flake.y, 2.5, 6);
        Object.assign(flake, { x: rand(0, W), y: rand(0, H), life: 0 });
      }
    });

    ripples.forEach((ring) => (ring.r += dt * ring.speed));
    ripples = ripples.filter((ring) => ring.r < ring.max);

    petals.forEach((petal) => {
      petal.x = ((petal.x + petal.vx * dt + W + 20) % (W + 20)) - 10;
      petal.y = ((petal.y + petal.vy * dt + H + 20) % (H + 20)) - 10;
    });

    if (dragonfly && !moveDragonfly(dragonfly, dt)) dragonfly = null;
    nextDragonfly -= dt;
    if (!dragonfly && nextDragonfly <= 0 && light.flies < 0.6 && weather !== 'rain') {
      dragonfly = makeDragonfly(W, H);
      nextDragonfly = rand(30, 70);
    }
  }

  function drawNet(ox, oy, alpha, flip) {
    ctx.save();
    ctx.globalAlpha = alpha * brightness;
    if (flip) {
      ctx.translate(W, 0);
      ctx.scale(-1, 1);
    }
    ctx.translate(ox, oy);
    ctx.scale(netScale, netScale);
    ctx.fillStyle = net;
    ctx.fillRect(-ox / netScale, -oy / netScale, W / netScale, H / netScale);
    ctx.restore();
  }

  function draw(t) {
    const snap = smooth ? (v) => v : Math.round;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(lit[0], 0, 0);
    ctx.setTransform(k, 0, 0, k, 0, 0);

    if (!water) {
      drawNet(snap(t * 1.3) % TILE, snap(t * 0.7) % TILE, 0.2 + Math.sin(t * 0.5) * 0.04, false);
      drawNet(snap(t * 0.9) % TILE, snap(t * 1.1) % TILE, 0.13, true);
    }

    // Under real water the GPU draws the koi themselves, from `water.fish`.
    if (!water) {
      ctx.fillStyle = 'rgba(4, 30, 28, 0.3)';
      ctx.beginPath();
      koi.forEach((fish) => {
        bodyPath(ctx, fish, 3, 4);
        tailPath(ctx, fish, 3, 4);
      });
      ctx.fill();
      koi.forEach((fish) => drawKoi(ctx, fish, paint, smooth));
    }

    // Pads, and the dragonfly that may land on one, float on top. On the
    // water's own layer they are drawn again only when they change, since
    // each fresh copy costs an upload to the GPU.
    const top = water ? water.above : ctx;
    if (!water || padsStale || dragonfly || flew) {
      top.setTransform(1, 0, 0, 1, 0, 0);
      if (water) {
        top.clearRect(0, 0, top.canvas.width, top.canvas.height);
        water.fresh = true;
      }
      top.drawImage(lit[1], 0, 0);
      top.setTransform(k, 0, 0, k, 0, 0);
      if (dragonfly) drawDragonfly(top, dragonfly, t, paint);
      padsStale = false;
      flew = Boolean(dragonfly);
    }
    ctx.setTransform(k, 0, 0, k, 0, 0);

    petals.forEach((petal) => {
      const x = snap(petal.x);
      const y = snap(petal.y);
      const turn = Math.sin(t * 0.8 + petal.phase);
      if (smooth) {
        ctx.fillStyle = 'rgba(4, 34, 30, 0.3)';
        ctx.beginPath();
        ctx.ellipse(x + 1, y + 1.2, 1.4, 0.7, turn * 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = paint('#f7c1d2');
        ctx.beginPath();
        ctx.ellipse(x, y, 1.4, 0.7, turn * 1.5, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      const wide = turn > 0;
      ctx.fillStyle = 'rgba(4, 34, 30, 0.3)';
      ctx.fillRect(x + 1, y + 1, wide ? 2 : 1, wide ? 1 : 2);
      ctx.fillStyle = paint('#f7c1d2');
      ctx.fillRect(x, y, wide ? 2 : 1, wide ? 1 : 2);
    });

    ctx.lineWidth = smooth ? 0.4 : 1;
    ripples.forEach((ring) => {
      ctx.strokeStyle = `rgba(230, 255, 245, ${(1 - ring.r / ring.max) * 0.55 * brightness})`;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
      if (ring.r > 4) {
        ctx.moveTo(ring.x + ring.r * 0.55, ring.y);
        ctx.arc(ring.x, ring.y, ring.r * 0.55, 0, Math.PI * 2);
      }
      ctx.stroke();
    });

    flakes.forEach((flake) => {
      ctx.fillStyle = `rgba(245, 250, 255, ${Math.sin(flake.life * Math.PI) * 0.85})`;
      ctx.beginPath();
      ctx.arc(flake.x, flake.y, flake.size * (1 - flake.life * 0.5), 0, Math.PI * 2);
      ctx.fill();
    });

    if (dragonfly) drawDragonfly(top, dragonfly, t, paint);

    if (mist) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const drift = (t * 3 * k) % mist.width;
      ctx.drawImage(mist, drift, 0);
      ctx.drawImage(mist, drift - mist.width, 0);
      ctx.setTransform(k, 0, 0, k, 0, 0);
    }

    if (light.flies > 0.05) {
      ctx.globalCompositeOperation = 'lighter';
      flies.forEach((fly) => {
        const x = snap(fly.x + Math.sin(t * 0.3 + fly.phase) * 12);
        const y = snap(fly.y + Math.cos(t * 0.23 + fly.phase * 1.3) * 8);
        const shine = light.flies * (0.5 + 0.5 * Math.sin(t * 1.7 + fly.phase));
        if (smooth) {
          const halo = ctx.createRadialGradient(x, y, 0, x, y, 3);
          halo.addColorStop(0, `rgba(220, 255, 140, ${shine * 0.6})`);
          halo.addColorStop(1, 'rgba(220, 255, 140, 0)');
          ctx.fillStyle = halo;
          ctx.fillRect(x - 3, y - 3, 6, 6);
          return;
        }
        ctx.fillStyle = `rgba(200, 255, 120, ${shine * 0.35})`;
        ctx.fillRect(x - 1, y - 1, 3, 3);
        ctx.fillStyle = `rgba(240, 255, 170, ${shine})`;
        ctx.fillRect(x, y, 1, 1);
      });
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  return {
    resolution: 1,
    resize,
    frame(dt, t) {
      if (t - litAt > 60) {
        relight();
        litAt = t;
      }
      update(dt, t);
      draw(t);
    },
    tap(x, y) {
      const px = x / k;
      const py = y / k;
      ripple(px, py, 16);
      koi.forEach((fish) => {
        const head = fish.points[0];
        if (Math.hypot(head.x - px, head.y - py) > 45) return;
        fish.angle = Math.atan2(head.y - py, head.x - px);
        fish.boost = 14;
      });
    },
  };
}
