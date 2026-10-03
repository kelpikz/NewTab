import { sheet, minuteOfDay, hexToRgb } from './scene.js';
import { program } from './shader.js';
import { createScene as createKoi, lightAt } from './koi.js';

// The koi pond under a real water surface. koi.js paints the floor and the
// koi on one canvas and the pads on another. The surface is a grid of water
// heights that obeys the wave equation, run on the main thread: each cell
// moves toward the mean of its four neighbours, and the motion fades a
// little each step. Drops, koi, rain and the pointer push the cells. The
// shader then bends the view of the floor through the waves, gathers light
// into moving lines on the floor, and adds glints of sky on the crests.

export const context = 'webgl2';

const CELL = 5; // screen pixels per wave cell
const MAXK = 12; // koi the shader can draw
const CALM = 0.985; // the part of its motion a cell keeps each step
const UNDER_PAD = 0.7;

const FRAGMENT = `
uniform sampler2D u_below;
uniform sampler2D u_above;
uniform sampler2D u_wave;
uniform sampler2D u_web;
uniform vec2 u_cell;
uniform float u_light;
uniform vec3 u_glint;
uniform vec4 u_spine[${MAXK * 5}];
uniform vec4 u_fish[${MAXK}];
uniform vec4 u_reach[${MAXK}];
uniform vec3 u_colors[${MAXK * 3}];
uniform int u_fishCount;
uniform vec3 u_deep;
uniform vec3 u_tint;
uniform float u_scale;

const float PROFILE[9] = float[9](0.8, 1.0, 1.0, 0.92, 0.8, 0.64, 0.48, 0.34, 0.24);

// Nine points down each koi's spine, two to a slot.
vec2 spine(int k, int j) {
  vec4 v = u_spine[k * 5 + j / 2];
  return j - (j / 2) * 2 == 0 ? v.xy : v.zw;
}

// The body: a tube round the spine, wide at the shoulders. Returns the
// distance to its edge in pixels (less than zero inside), how far along it
// the point lies (0 at the nose, 1 at the tail), how far across (-1..1),
// and the sideways direction there.
float body(int k, vec2 q, float width, out float along, out float across, out vec2 side) {
  float best = 1e9;
  along = 0.0;
  across = 0.0;
  side = vec2(1.0, 0.0);
  for (int j = 0; j < 8; j++) {
    vec2 a = spine(k, j);
    vec2 b = spine(k, j + 1);
    vec2 ab = b - a;
    float l2 = max(dot(ab, ab), 1e-4);
    float h = clamp(dot(q - a, ab) / l2, 0.0, 1.0);
    float r = mix(PROFILE[j], PROFILE[j + 1], h) * width;
    vec2 off = q - a - ab * h;
    float d = length(off) - r;
    if (d < best) {
      best = d;
      along = (float(j) + h) / 8.0;
      side = vec2(-ab.y, ab.x) / sqrt(l2);
      across = dot(off, side) / r;
    }
  }
  return best;
}

// The fins: two that paddle at the shoulders and a long tail that flutters.
// Returns how much fin covers the point, and the fine rays in it.
float fins(int k, vec2 q, float width, float phase, out float rays) {
  rays = 0.0;
  float cover = 0.0;
  vec2 fwd = normalize(spine(k, 1) - spine(k, 3) + 1e-5);
  vec2 side = vec2(-fwd.y, fwd.x);
  for (int s = 0; s < 2; s++) {
    float sg = float(s) * 2.0 - 1.0;
    float paddle = 0.75 + 0.3 * sin(phase + sg * 0.7);
    vec2 dir = -fwd * cos(paddle) + side * sg * sin(paddle);
    vec2 d = q - spine(k, 2) - side * sg * width * 0.75;
    float u = dot(d, dir);
    float v = dot(d, vec2(-dir.y, dir.x));
    float len = width * 1.3;
    float wide = width * 0.55 * (0.3 + 0.7 * clamp(u / len, 0.0, 1.0));
    float e = length(vec2((u - len * 0.5) / (len * 0.5), v / max(wide, 1e-3)));
    float f = smoothstep(1.0, 0.8, e) * step(0.0, u);
    if (f > cover) {
      cover = f;
      rays = 0.5 + 0.5 * sin(atan(v, u + width * 0.3) * 16.0);
    }
  }
  vec2 tip = spine(k, 8);
  vec2 back = normalize(tip - spine(k, 7) + 1e-5);
  vec2 d = q - tip + back * width * 0.15;
  float u = dot(d, back);
  float v = dot(d, vec2(-back.y, back.x));
  float reach = width * 2.2;
  v += sin(u / reach * 5.0 - phase * 1.6) * width * 0.18 * u / reach;
  float ang = atan(v, max(u, 1e-3));
  float rad = length(vec2(u, v));
  // Two long lobes with a shallow notch between them.
  float edge = reach * (0.62 + 0.38 * smoothstep(0.0, 0.8, abs(ang)));
  float f = smoothstep(0.85, 0.7, abs(ang)) * smoothstep(edge, edge * 0.8, rad) * step(0.0, u);
  if (f > cover) {
    cover = f;
    rays = 0.5 + 0.5 * sin(ang * 22.0);
  }
  return cover;
}

// The colours of a koi's coat at a point on its body.
vec3 coat(int k, float along, float across, float seed) {
  vec3 base = u_colors[k * 3];
  vec3 spot = u_colors[k * 3 + 1];
  vec3 ink = u_colors[k * 3 + 2];
  vec2 bp = vec2(along * 5.5, across * 1.1) + seed;
  float mottle = noise(bp) * 0.65 + noise(bp * 2.3 + 7.0) * 0.35;
  float red = smoothstep(0.5, 0.55, mottle) * smoothstep(0.02, 0.06, along) * (1.0 - smoothstep(0.8, 0.88, along));
  float sumi = smoothstep(0.66, 0.7, noise(vec2(along * 9.0, across * 2.4) + seed * 3.0)) * step(0.12, along);
  return mix(mix(base, spot, red), ink, sumi);
}

// Bright lines where the light from the surface gathers on the floor: two
// copies of one baked web drift past each other and bend with the waves.
float caustic(vec2 p, float t) {
  vec2 w = 0.04 * vec2(sin(p.y * 2.3 + t * 0.9), sin(p.x * 2.1 - t * 0.8));
  float a = texture(u_web, p * 0.21 + w + vec2(t * 0.011, t * 0.007)).r;
  float b = texture(u_web, p * 0.27 - w + vec2(-t * 0.009, t * 0.012) + 0.37).r;
  return max(a, b) * 0.45 + a * b * 1.4;
}

float height(vec2 uv) { return texture(u_wave, uv).r; }

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 tex = vec2(uv.x, 1.0 - uv.y);
  float t = u_time;

  float h = height(tex);
  float hl = height(tex - vec2(u_cell.x, 0.0));
  float hr = height(tex + vec2(u_cell.x, 0.0));
  float hu = height(tex - vec2(0.0, u_cell.y));
  float hd = height(tex + vec2(0.0, u_cell.y));
  vec2 slope = vec2(hr - hl, hd - hu) * 0.5;
  float bend = hl + hr + hu + hd - 4.0 * h;

  // A faint swell so the surface is never quite still.
  vec2 p = gl_FragCoord.xy / u_res.y;
  slope += 0.004 * vec2(sin(p.x * 9.0 + p.y * 4.0 + t * 1.1), sin(p.y * 11.0 - p.x * 3.0 + t * 0.9));

  vec2 shift = slope * vec2(1.0, u_res.x / u_res.y) * 0.06;
  vec3 below = pow(texture(u_below, tex + shift).rgb, vec3(2.2));

  float lines = caustic(p * 6.5 + slope * 4.0, t);
  float focus = clamp(-bend * 3.0, -0.3, 0.6);
  below *= 1.0 + (lines * 0.32 + focus * 0.5) * u_light;

  // Each koi throws a shadow on the floor, lit from the upper left: close
  // and sharp under a deep koi, wide and soft under one near the top.
  vec2 px = gl_FragCoord.xy;
  vec2 bent = vec2(shift.x, -shift.y) * u_res;
  float shade = 0.0;
  for (int k = 0; k < u_fishCount; k++) {
    vec4 info = u_fish[k];
    vec4 reach = u_reach[k];
    vec2 sq = px - vec2(9.0, -13.0) * u_scale * (1.7 - info.y) - bent * 0.3;
    if (length(sq - reach.xy) > reach.z) continue;
    float a;
    float b;
    vec2 c;
    float ds = body(k, sq, info.x, a, b, c);
    float soft = (2.0 + (1.0 - info.y) * 9.0) * u_scale;
    shade = max(shade, smoothstep(soft, -soft, ds) * (0.42 - info.y * 0.12));
  }
  below *= 1.0 - shade;

  // The koi themselves. The waves bend the view of a deep koi more, and
  // deep water tints it and softens its edge.
  vec3 sunDir = normalize(vec3(-0.4, 0.5, 0.75));
  for (int k = 0; k < u_fishCount; k++) {
    vec4 info = u_fish[k];
    vec4 reach = u_reach[k];
    float depth = info.y;
    float width = info.x;
    vec2 q = px - bent * (0.4 + depth * 0.8);
    if (length(q - reach.xy) > reach.z) continue;
    float along;
    float across;
    vec2 side;
    float d = body(k, q, width, along, across, side);
    float rays;
    float fin = fins(k, q, width, reach.w, rays);
    float aa = (0.8 + depth * 1.6) * u_scale;
    float inside = smoothstep(aa, -aa, d);
    if (inside <= 0.0 && fin <= 0.0) continue;

    float z = sqrt(max(1.0 - across * across, 0.0));
    vec3 n = normalize(vec3(side * across * 0.9, z + 0.1));
    float diffuse = 0.55 + 0.6 * max(dot(n, sunDir), 0.0);
    float shine = pow(max(dot(reflect(-sunDir, n), vec3(0.0, 0.0, 1.0)), 0.0), 22.0);
    // Rows of scales, and on the metal koi, a glitter that moves.
    vec2 sc = vec2(along * 42.0, across * 4.0);
    sc.y += step(1.0, mod(floor(sc.x), 2.0)) * 0.5;
    float scale = smoothstep(0.5, 0.25, length(fract(sc) - 0.5));
    float glitter = info.w * pow(hash12(floor(sc) + info.z), 6.0) * (0.5 + 0.5 * sin(t * 2.0 + info.z * 9.0 + sc.x));
    vec3 skin = coat(k, along, across, info.z);
    skin *= diffuse * (0.6 + 0.4 * z) * (0.94 + 0.08 * scale);
    skin += vec3(1.0, 0.97, 0.9) * (shine * (0.3 + info.w * 0.5) + glitter * 0.6);
    // Two dark eyes near the nose.
    vec2 nose = spine(k, 0);
    vec2 ahead = normalize(nose - spine(k, 1) + 1e-5);
    vec2 sideAt = vec2(-ahead.y, ahead.x);
    vec2 eyeA = nose - ahead * width * 0.12 + sideAt * width * 0.5;
    vec2 eyeB = nose - ahead * width * 0.12 - sideAt * width * 0.5;
    float eye = smoothstep(width * 0.13, width * 0.08, min(length(q - eyeA), length(q - eyeB)));
    skin = mix(skin, vec3(0.01), eye * 0.9);
    skin *= 1.0 + lines * 0.35 * u_light * (1.0 - depth);
    vec3 finCol = mix(u_colors[k * 3], vec3(1.0), 0.35) * (0.7 + 0.4 * rays) * (0.7 + 0.3 * u_light);
    skin *= u_tint;
    finCol *= u_tint;
    skin = mix(skin, u_deep, depth * 0.55);
    finCol = mix(finCol, u_deep, depth * 0.6);
    below = mix(below, finCol, fin * 0.5 * (1.0 - inside));
    below = mix(below, skin, inside);
  }

  vec3 n = normalize(vec3(-slope * 22.0, 1.0));
  vec3 sun = normalize(vec3(-0.35, 0.45, 0.82));
  float glint = pow(max(dot(n, normalize(sun + vec3(0.0, 0.0, 1.0))), 0.0), 260.0);
  float sky = pow(1.0 - n.z, 1.5);
  vec3 col = below + u_glint * (glint * 0.7 + sky * 0.12);

  // Pads float, so they ride the waves a little but are not bent.
  vec4 above = texture(u_above, tex + shift * 0.25);
  col = col * (1.0 - above.a) + pow(max(above.rgb, 0.0), vec3(2.2));

  // The floor is already a finished picture, so the pixel look keeps its
  // colours as they are and adds no dither.
  outColor = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
}
`;

/**
 * A tile of light lines that wraps at its edges: the edges between Voronoi
 * cells, brightest on the thinnest part of each edge. Made once.
 */
export function webTile(size = 128, cells = 6) {
  const seeds = [];
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) seeds.push([(i + 0.15 + Math.random() * 0.7) / cells, (j + 0.15 + Math.random() * 0.7) / cells]);
  }
  const out = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      let d1 = 9;
      let d2 = 9;
      for (const [sx, sy] of seeds) {
        let dx = Math.abs(u - sx);
        let dy = Math.abs(v - sy);
        dx = Math.min(dx, 1 - dx);
        dy = Math.min(dy, 1 - dy);
        const d = Math.hypot(dx, dy);
        if (d < d1) [d1, d2] = [d, d1];
        else if (d < d2) d2 = d;
      }
      out[y * size + x] = Math.round(255 * Math.exp(-(d2 - d1) * cells * 9));
    }
  }
  return out;
}

const linear = (hex) => hexToRgb(hex).map((v) => (v / 255) ** 2.2);

/**
 * How deep a koi swims, 0 at the top to 1 near the floor. It drifts up and
 * down; a curious koi comes up, and a frightened one dives.
 */
export function depthOf(fish, t) {
  let depth = 0.45 + 0.32 * Math.sin(t * 0.05 + fish.phase * 0.37);
  if (fish.curious) depth -= 0.35;
  depth += Math.min((fish.boost ?? 0) / 14, 1) * 0.35;
  return Math.min(0.92, Math.max(0.06, depth));
}

/** One step of the wave equation. `now` and `last` swap after it. */
export function waveStep(now, last, calm, width, height) {
  for (let y = 1; y < height - 1; y++) {
    let i = y * width + 1;
    for (let x = 1; x < width - 1; x++, i++) {
      last[i] = ((now[i - 1] + now[i + 1] + now[i - width] + now[i + width]) * 0.5 - last[i]) * calm[i];
    }
  }
}

function texture(gl, unit, filter) {
  const handle = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, handle);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return handle;
}

export function createScene(gl, env) {
  const shader = program(gl, FRAGMENT);
  const filter = env.pixel ? gl.NEAREST : gl.LINEAR;
  const textures = [texture(gl, 0, filter), texture(gl, 1, filter), texture(gl, 2, gl.LINEAR), texture(gl, 3, gl.LINEAR)];
  shader.unit('u_below', 0);
  shader.unit('u_above', 1);
  shader.unit('u_wave', 2);
  shader.unit('u_web', 3);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 128, 128, 0, gl.RED, gl.UNSIGNED_BYTE, webTile());
  gl.generateMipmap(gl.TEXTURE_2D);
  // Canvas pictures come in with their alpha already applied, so the pads
  // blend without dark edges.
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

  // Full floats go up as they are; half floats would need a conversion on
  // every frame. Not every GPU can blend full floats, though.
  const wide = Boolean(gl.getExtension('OES_texture_float_linear'));
  const [below, belowCtx] = sheet(1, 1);
  const [above, aboveCtx] = sheet(1, 1);
  let gw = 0;
  let gh = 0;
  let cellPx = CELL;
  let now = null;
  let last = null;
  let calm = null;
  let padsRead = false;
  let litAt = -Infinity;
  let sized = false;
  const trail = { x: 0, y: 0, at: -1 };

  // Push the water down in a soft round dent. `x`, `y` and `size` are in
  // canvas pixels.
  function drop(x, y, size, power = 1) {
    if (!now) return;
    const cx = x / cellPx;
    const cy = y / cellPx;
    const r = Math.max(1.8, Math.min(size / cellPx / 3, 6));
    for (let j = Math.floor(cy - r); j <= Math.ceil(cy + r); j++) {
      for (let i = Math.floor(cx - r); i <= Math.ceil(cx + r); i++) {
        if (i < 1 || j < 1 || i >= gw - 1 || j >= gh - 1) continue;
        const d = Math.hypot(i - cx, j - cy) / r;
        if (d < 1) now[j * gw + i] -= power * 0.5 * (1 + Math.cos(Math.PI * d));
      }
    }
  }

  const water = {
    above: aboveCtx,
    fresh: false,
    drop: (x, y, size) => drop(x, y, size, Math.min(1.2, size / (cellPx * 6))),
    stir(x, y, push) {
      const i = Math.round(x / cellPx);
      const j = Math.round(y / cellPx);
      if (i > 0 && j > 0 && i < gw - 1 && j < gh - 1) now[j * gw + i] -= push * 0.003;
    },
  };
  const spines = new Float32Array(MAXK * 20);
  const fishInfo = new Float32Array(MAXK * 4);
  const reaches = new Float32Array(MAXK * 4);
  const colors = new Float32Array(MAXK * 9);

  // Hand the koi to the shader, deepest first so the nearest are drawn last.
  function packFish(dt, t, height) {
    const unit = water.unit ?? 1;
    const fish = (water.fish ?? []).slice(0, MAXK);
    fish.forEach((f) => {
      f.depth = f.depth === undefined ? depthOf(f, t) : f.depth + (depthOf(f, t) - f.depth) * Math.min(1, dt * 0.8);
      f.fin = (f.fin ?? 0) + dt * (2.2 + (f.boost ?? 0) * 0.4);
    });
    fish.sort((a, b) => b.depth - a.depth);
    fish.forEach((f, k) => {
      f.points.forEach((point, j) => {
        spines[k * 20 + j * 2] = point.x * unit;
        spines[k * 20 + j * 2 + 1] = height - point.y * unit;
      });
      const width = f.width * unit;
      fishInfo.set([width, f.depth, f.phase % 50, f.coat.spots.length ? 0.15 : 1], k * 4);
      const mid = f.points[4];
      reaches.set([mid.x * unit, height - mid.y * unit, f.gap * 4 * unit + width * 3.5, f.fin], k * 4);
      const base = linear(f.coat.body);
      const spot = f.coat.spots[0] ? linear(f.coat.spots[0]) : base;
      const ink = f.coat.spots[1] ? linear(f.coat.spots[1]) : spot;
      colors.set([...base, ...spot, ...ink], k * 9);
    });
    shader.list('u_spine', spines, 4);
    shader.list('u_fish', fishInfo, 4);
    shader.list('u_reach', reaches, 4);
    shader.list('u_colors', colors, 3);
    shader.whole('u_fishCount', fish.length);
  }

  const koiEnv = Object.create(env);
  koiEnv.water = water;
  const koi = createKoi(belowCtx, koiEnv);

  // Pads hold the water still under them, so waves stop at their edges.
  function readPads() {
    const { width, height } = above;
    const alpha = aboveCtx.getImageData(0, 0, width, height).data;
    for (let j = 0; j < gh; j++) {
      for (let i = 0; i < gw; i++) {
        const x = Math.min(width - 1, Math.round((i + 0.5) * cellPx));
        const y = Math.min(height - 1, Math.round((j + 0.5) * cellPx));
        calm[j * gw + i] = alpha[(y * width + x) * 4 + 3] > 200 ? UNDER_PAD : CALM;
      }
    }
  }

  function upload(unit, source) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, textures[unit]);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  }

  return {
    resolution: 0.75,
    pixelResolution: 0.25,
    resize(width, height, scale) {
      below.width = above.width = width;
      below.height = above.height = height;
      koi.resize(width, height, scale);
      cellPx = CELL * scale;
      gw = Math.ceil(width / cellPx) + 1;
      gh = Math.ceil(height / cellPx) + 1;
      now = new Float32Array(gw * gh);
      last = new Float32Array(gw * gh);
      calm = new Float32Array(gw * gh).fill(CALM);
      shader.set('u_cell', 1 / gw, 1 / gh);
      shader.set('u_scale', scale);
      padsRead = false;
      sized = true;
      gl.viewport(0, 0, width, height);
    },
    frame(dt, t) {
      if (!sized) return;
      if (t - litAt > 60) {
        litAt = t;
        const light = lightAt(minuteOfDay());
        const level = (light.tint[0] + light.tint[1] + light.tint[2]) / 765;
        const dim = env.weather === 'rain' || env.weather === 'cloud' ? 0.6 : 1;
        shader.set('u_light', level * dim);
        // Glints are a sharp sky light. Under cloud there is little of it.
        shader.set('u_glint', ...light.glow.map((v) => (v / 255) * level * level * dim * dim * dim));
        // The koi take the same light as the floor, and sink into the
        // colour of deep water.
        const tint = light.tint.map((v) => ((v / 255) * (dim === 1 ? 1 : 0.82)) ** 2.2);
        shader.set('u_tint', ...tint);
        shader.set('u_deep', 0.012 * tint[0], 0.07 * tint[1], 0.065 * tint[2]);
      }

      // The pointer draws a soft wake as it moves over open water.
      const { pointer } = env;
      if (pointer.inside && pointer.free && pointer.movedAt > trail.at) {
        const moved = Math.hypot(pointer.x - trail.x, pointer.y - trail.y);
        if (trail.at >= 0 && moved > 0) drop(pointer.x, pointer.y, cellPx * 4, Math.min(moved / cellPx, 4) * 0.05);
        trail.x = pointer.x;
        trail.y = pointer.y;
        trail.at = pointer.movedAt;
      }

      koi.frame(dt, t);
      packFish(dt, t, below.height);
      if (!padsRead) {
        readPads();
        padsRead = true;
      }
      waveStep(now, last, calm, gw, gh);
      [now, last] = [last, now];

      upload(0, below);
      if (water.fresh) {
        upload(1, above);
        water.fresh = false;
      }
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, textures[2]);
      gl.texImage2D(gl.TEXTURE_2D, 0, wide ? gl.R32F : gl.R16F, gw, gh, 0, gl.RED, gl.FLOAT, now);
      shader.draw(t);
    },
    tap(x, y) {
      koi.tap(x, y);
    },
    dispose() {
      textures.forEach((handle) => gl.deleteTexture(handle));
      shader.dispose();
    },
  };
}
