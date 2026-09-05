const IMAGE_URL = 'https://picsum.photos/1920/1080';
const CACHE_KEY = 'backgroundImage';
const CACHE_TTL_MS = 60 * 60 * 1000;

async function fetchImageAsDataUrl() {
  const response = await fetch(IMAGE_URL);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function getCachedImage() {
  const result = await chrome.storage.local.get(CACHE_KEY);
  const cached = result[CACHE_KEY];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.dataUrl;
  }
  return null;
}

async function refreshCache() {
  const dataUrl = await fetchImageAsDataUrl();
  await chrome.storage.local.set({
    [CACHE_KEY]: { dataUrl, timestamp: Date.now() },
  });
  return dataUrl;
}

export async function applyBackground(element) {
  const cached = await getCachedImage();
  if (cached) {
    element.style.backgroundImage = `url(${cached})`;
    return;
  }
  try {
    const dataUrl = await refreshCache();
    element.style.backgroundImage = `url(${dataUrl})`;
  } catch {
    element.style.background =
      'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
  }
}
