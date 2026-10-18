// Dark, light or the system's choice, and the accent colour. Shared by the
// new tab and the gate page.

import { settings } from './storage.js';

function readableInk(hex) {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.6 ? '#101216' : '#ffffff';
}

export function applyTheme() {
  const config = settings();
  const auto = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  const theme = config.theme === 'auto' ? auto : config.theme;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.setProperty('--accent', config.accent);
  document.documentElement.style.setProperty('--accent-ink', readableInk(config.accent));
}
