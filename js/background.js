import { local } from './platform.js';
import { savedSky } from './weather.js';

const PHOTO_URL = 'https://picsum.photos/1920/1080';
const CACHE_KEY = 'backgroundImage';
const CUSTOM_KEY = 'customBackground';
const SCENE_BASE = '#0b1220';

// Moving backgrounds. A scene's code only loads when it is picked.
export const SCENES = {
  pond: {
    label: 'Koi pond',
    text: 'Koi in real water. Ripples bend the light, and the rain falls when it rains outside.',
    load: () => import('./pond.js'),
  },
};

// The running scene: which one it is, and a promise of the function that
// stops it.
let live = null;

async function loadScene(layer, name, look) {
  const [{ startScene }, scene, weather] = await Promise.all([
    import('./scene.js'),
    (SCENES[name] ?? SCENES.pond).load(),
    savedSky(),
  ]);
  // The 2D koi pond needs no GPU, so it stands in when a shader cannot run.
  const koi = async () => startScene(layer, await import('./koi.js'), { look, weather });
  return startScene(layer, scene, { look, weather, fallback: koi }) ?? koi();
}

async function stopScene() {
  if (!live) return;
  const running = live.stop;
  live = null;
  (await running)();
}

export const GRADIENTS = {
  aurora: 'linear-gradient(140deg, #1b2a4a 0%, #3b2c63 45%, #7d3f6d 100%)',
  dusk: 'linear-gradient(140deg, #2b1a3d 0%, #5c2c4d 50%, #b4633f 100%)',
  forest: 'linear-gradient(140deg, #0f2027 0%, #203a43 50%, #2c5364 100%)',
  ember: 'linear-gradient(140deg, #3a1c1c 0%, #7a3b2e 55%, #c96f3b 100%)',
  slate: 'linear-gradient(140deg, #14161b 0%, #232733 60%, #383e4d 100%)',
  bloom: 'linear-gradient(140deg, #16222a 0%, #3a6073 50%, #8e6a8f 100%)',
};

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** Should the cached photo be replaced? */
export function isStale(cached, refresh, now = Date.now()) {
  if (!cached?.dataUrl) return true;
  if (refresh === 'never') return false;
  if (refresh === 'tab') return true;
  if (refresh === 'daily') {
    return new Date(cached.timestamp).toDateString() !== new Date(now).toDateString();
  }
  return now - cached.timestamp >= 60 * 60 * 1000;
}

async function fetchPhoto() {
  const response = await fetch(PHOTO_URL);
  if (!response.ok) throw new Error('Photo request failed');
  const id = response.headers.get('picsum-id');
  const dataUrl = await blobToDataUrl(await response.blob());

  let author = null;
  let link = null;
  if (id) {
    try {
      const info = await (await fetch(`https://picsum.photos/id/${id}/info`)).json();
      author = info.author ?? null;
      link = info.url ?? null;
    } catch {
      /* credit is optional */
    }
  }
  return { dataUrl, author, link, timestamp: Date.now() };
}

async function photoBackground(refresh, force) {
  const cached = (await local.get(CACHE_KEY))[CACHE_KEY];
  if (!force && !isStale(cached, refresh)) return cached;
  try {
    const fresh = await fetchPhoto();
    await local.set({ [CACHE_KEY]: fresh });
    return fresh;
  } catch {
    return cached ?? null;
  }
}

export async function getCustomImage() {
  return (await local.get(CUSTOM_KEY))[CUSTOM_KEY] ?? null;
}

export async function setCustomImage(dataUrl) {
  await local.set({ [CUSTOM_KEY]: dataUrl });
}

export async function clearCustomImage() {
  await local.remove(CUSTOM_KEY);
}

/**
 * Paint the background layer and return the photo credit, if any.
 * `force` fetches a new photo even when the cache is fresh.
 */
export async function applyBackground(layer, config, { force = false } = {}) {
  const { source, gradient, color, dim, blur, refresh, animated, scene, look } = config.background;
  const root = document.documentElement;
  root.style.setProperty('--bg-dim', String(dim));
  root.style.setProperty('--bg-blur', `${blur}px`);
  layer.classList.toggle('bg-blurred', blur > 0);

  const paint = (value, isImage) => {
    layer.style.backgroundImage = isImage ? `url("${value}")` : value;
    layer.style.backgroundColor = isImage ? '' : value;
  };

  if (animated) {
    paint(SCENE_BASE, false);
    const key = `${scene}:${look}`;
    if (live?.key !== key) {
      await stopScene();
      live = { key, stop: loadScene(layer, scene, look) };
    }
    await live.stop;
    return null;
  }
  await stopScene();

  if (source === 'solid') {
    paint(color, false);
    return null;
  }
  if (source === 'gradient') {
    paint(GRADIENTS[gradient] ?? GRADIENTS.aurora, false);
    return null;
  }
  if (source === 'custom') {
    const custom = await getCustomImage();
    if (custom) {
      paint(custom, true);
      return null;
    }
    paint(GRADIENTS[gradient] ?? GRADIENTS.aurora, false);
    return null;
  }

  const photo = await photoBackground(refresh, force);
  if (!photo?.dataUrl) {
    paint(GRADIENTS[gradient] ?? GRADIENTS.aurora, false);
    return null;
  }
  paint(photo.dataUrl, true);
  return { author: photo.author, link: photo.link };
}
