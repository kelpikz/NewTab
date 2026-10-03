import { el, debounce } from './util.js';
import { compiling } from './shader.js';

// Runs one moving background. The runner owns the canvas, its size, the
// frame clock and the pointer, so a scene only has to draw.
//
// A scene module exports `createScene(ctx, env)`. It gets a 2D context, or a
// WebGL 2 context when it also exports `context = 'webgl2'`. It returns:
//   resolution  canvas pixels per screen pixel in the smooth look
//   pixelResolution  the same in the pixel look (a quarter when left out)
//   fps         frames a second (30 when left out)
//   warmup      frames to run before a still picture (1 when left out)
//   resize(width, height, scale)   the canvas changed size
//   frame(dt, time)                move and draw, times in seconds
//   tap(x, y)                      a click on open space, in canvas pixels

const PIXEL_SCALE = 0.25;
// No software drawing: a shader on the processor is too slow to be calm.
const GL_OPTIONS = {
  alpha: false,
  antialias: false,
  depth: false,
  stencil: false,
  powerPreference: 'low-power',
  failIfMajorPerformanceCaveat: true,
};
const CONTROLS = 'button, a, input, textarea, select, label, dialog, [contenteditable], .card, .topbar';

export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (min, max) => min + Math.random() * (max - min);
export const pick = (list) => list[Math.floor(Math.random() * list.length)];
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const rgb = ([r, g, b], a = 1) => `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${a})`;
export const mixRgb = (a, b, t) => a.map((value, i) => lerp(value, b[i], t));

export function hexToRgb(hex) {
  const value = String(hex).trim().replace('#', '');
  const full = value.length === 3 ? [...value].map((c) => c + c).join('') : value;
  const number = parseInt(full, 16);
  if (Number.isNaN(number) || full.length !== 6) return [124, 156, 255];
  return [(number >> 16) & 255, (number >> 8) & 255, number & 255];
}

/** Blend between colour stops keyed by minute of the day. Minutes wrap. */
export function blendByMinute(stops, minutes) {
  const m = ((minutes % 1440) + 1440) % 1440;
  const next = stops.findIndex((stop) => stop.at > m);
  const a = stops[next - 1];
  const b = stops[next];
  const t = (m - a.at) / (b.at - a.at);
  const out = {};
  for (const key of Object.keys(a)) {
    if (key === 'at') continue;
    out[key] = Array.isArray(a[key]) ? mixRgb(a[key], b[key], t) : lerp(a[key], b[key], t);
  }
  return out;
}

export function minuteOfDay(date = new Date()) {
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
}

/** An off-screen canvas for things drawn once and copied every frame. */
export function sheet(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(height));
  return [canvas, canvas.getContext('2d')];
}

function readAccent() {
  return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#7c9cff';
}

/**
 * Put a scene module in `layer`. `look` is 'smooth' or 'pixel'. `weather` is
 * 'rain', 'snow', 'fog', 'cloud' or null. Returns a function that stops it,
 * or null when this device cannot run a shader scene. If a shader fails
 * later, while it compiles, the scene stops and `fallback()` runs; it may
 * return the function that stops what it started.
 */
export function startScene(layer, module, { look = 'smooth', weather = null, fallback = null } = {}) {
  const pixel = look === 'pixel';
  const shader = module.context === 'webgl2';
  const canvas = el('canvas', { class: 'scene', 'aria-hidden': 'true' });
  if (pixel) canvas.classList.add('scene-pixel');
  layer.append(canvas);
  const ctx = shader ? canvas.getContext('webgl2', GL_OPTIONS) : canvas.getContext('2d');
  if (!ctx && shader) {
    canvas.remove();
    return null;
  }
  if (!ctx) return () => canvas.remove();
  const pointer = { x: 0, y: 0, inside: false, free: false, movedAt: -Infinity };
  const env = { pixel, weather, pointer, accent: readAccent(), time: 0 };
  let scene;
  try {
    scene = module.createScene(ctx, env);
  } catch {
    canvas.remove();
    return null;
  }
  const scale = pixel ? (scene.pixelResolution ?? PIXEL_SCALE) : (scene.resolution ?? 1);
  const fps = scene.fps ?? 30;
  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let box = null;
  let accentAt = 0;

  const fit = () => {
    const width = Math.max(1, Math.round(layer.clientWidth * scale));
    const height = Math.max(1, Math.round(layer.clientHeight * scale));
    box = canvas.getBoundingClientRect();
    if (width === canvas.width && height === canvas.height && env.time > 0) return;
    canvas.width = width;
    canvas.height = height;
    if (!shader) ctx.imageSmoothingEnabled = !pixel;
    scene.resize(width, height, scale);
  };

  const step = (dt) => {
    env.time += dt;
    if (env.time - accentAt > 2) {
      env.accent = readAccent();
      accentAt = env.time;
    }
    scene.frame(dt, env.time);
  };

  const warm = () => {
    for (let i = 0; i < (scene.warmup ?? 1); i++) step(1 / fps);
  };

  const place = (event) => {
    if (!box?.width) return null;
    return [
      ((event.clientX - box.left) / box.width) * canvas.width,
      ((event.clientY - box.top) / box.height) * canvas.height,
    ];
  };

  const onMove = (event) => {
    const spot = place(event);
    if (!spot) return;
    [pointer.x, pointer.y] = spot;
    pointer.inside = true;
    pointer.free = !event.target.closest?.(CONTROLS);
    pointer.movedAt = env.time;
  };
  const onLeave = () => {
    pointer.inside = false;
  };
  const onDown = (event) => {
    if (event.target.closest?.(CONTROLS)) return;
    const spot = place(event);
    if (spot) scene.tap?.(spot[0], spot[1]);
  };

  const onResize = debounce(() => {
    fit();
    if (still && started) warm();
  }, 200);

  let handle = 0;
  let last = 0;
  let started = false;
  let stopped = false;
  let replaced = null;

  const cleanup = () => {
    stopped = true;
    window.cancelAnimationFrame(handle);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerdown', onDown);
    document.documentElement.removeEventListener('mouseleave', onLeave);
    scene.dispose?.();
    // The last picture fades out slowly, so the next scene comes in over it.
    canvas.classList.replace('scene', 'scene-leaving');
    window.setTimeout(() => canvas.remove(), 1300);
  };

  const fail = async () => {
    cleanup();
    const next = (await fallback?.()) ?? null;
    if (replaced === false) next?.();
    else replaced = next;
  };

  // Shaders may still be compiling. Draw nothing until they are done, then
  // fade the scene in.
  const begin = () => {
    if (started) return true;
    try {
      if (shader && compiling(ctx)) return false;
    } catch {
      fail();
      return false;
    }
    started = true;
    warm();
    canvas.classList.add('scene-ready');
    return true;
  };

  const tick = (now) => {
    handle = window.requestAnimationFrame(tick);
    if (!begin() || stopped) return;
    if (now - last < 1000 / fps - 2) return;
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    step(dt);
  };
  const wait = () => {
    if (!begin() && !stopped) handle = window.requestAnimationFrame(wait);
  };

  fit();
  window.addEventListener('resize', onResize);
  // The browser stops calling back while the tab is hidden, so a hidden
  // tab costs nothing.
  // A lost GPU context draws nothing more, so stop asking for frames.
  canvas.addEventListener('webglcontextlost', () => window.cancelAnimationFrame(handle));
  if (still) {
    wait();
  } else {
    begin();
    handle = window.requestAnimationFrame(tick);
    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerdown', onDown);
    document.documentElement.addEventListener('mouseleave', onLeave);
  }

  return () => {
    if (replaced) {
      replaced();
      return;
    }
    if (stopped) {
      replaced = false;
      return;
    }
    cleanup();
  };
}
