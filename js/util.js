import { extensionUrl } from './platform.js';

/**
 * Small DOM builder. `el('div', { class: 'card', onClick: fn }, child, 'text')`.
 * Special props: class, text, html, dataset, style, on<Event>.
 */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'style') Object.assign(node.style, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key in node) node[key] = value;
    else node.setAttribute(key, value);
  }
  appendAll(node, children);
  return node;
}

export function appendAll(parent, children) {
  children.flat(Infinity).forEach((child) => {
    if (child === null || child === undefined || child === false) return;
    parent.append(child);
  });
  return parent;
}

export function debounce(fn, ms) {
  let handle = null;
  return (...args) => {
    clearTimeout(handle);
    handle = setTimeout(() => fn(...args), ms);
  };
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function pad2(n) {
  return String(n).padStart(2, '0');
}

export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Turn typed text into a URL when it looks like one, else return null. */
export function asUrl(text) {
  const value = text.trim();
  if (!value || /\s/.test(value)) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return value;
  if (/^(localhost|(\d{1,3}\.){3}\d{1,3})(:\d+)?(\/|$)/i.test(value)) return `http://${value}`;
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/.test(value)) return `https://${value}`;
  return null;
}

/** Compare URLs while ignoring protocol, www, trailing slash and hash. */
export function urlKey(url) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/$/, '');
    return `${parsed.hostname.replace(/^www\./, '')}${path}${parsed.search}`;
  } catch {
    return url;
  }
}

/**
 * Chrome's own favicon cache. Needs the "favicon" permission, which only
 * takes effect after the extension is reloaded — until then the request
 * fails and the caller falls back to a letter tile.
 * Chrome stores icons at 16 and 32 pixels, so ask for one of those.
 */
export function faviconUrl(pageUrl, size = 32) {
  if (!pageUrl) return '';
  const base = extensionUrl('/_favicon/');
  if (!base) return '';
  const url = new URL(base);
  url.searchParams.set('pageUrl', pageUrl);
  url.searchParams.set('size', size <= 16 ? '16' : '32');
  return url.toString();
}

export function hueFromString(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) % 360;
  return hash;
}

/** Favicon image that degrades to a coloured letter tile. */
export function faviconNode(url, label = '', size = 32) {
  const wrap = el('span', { class: 'favicon' });
  const name = label || hostOf(url) || '?';

  const showLetter = () => {
    wrap.style.setProperty('--fav-hue', hueFromString(name));
    wrap.replaceChildren(el('span', { class: 'favicon-letter', text: name.charAt(0).toUpperCase() }));
  };

  const src = faviconUrl(url, size);
  if (!src) {
    showLetter();
    return wrap;
  }
  const img = el('img', { src, alt: '', loading: 'lazy' });
  img.addEventListener('error', showLetter);
  wrap.appendChild(img);
  return wrap;
}

export function todayKey(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

let toastTimer = null;

export function toast(message) {
  const host = document.getElementById('toasts');
  if (!host) return;
  const node = el('div', { class: 'toast', text: message });
  host.appendChild(node);
  requestAnimationFrame(() => node.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    node.classList.remove('show');
    setTimeout(() => node.remove(), 300);
  }, 2400);
}

export function isTypingTarget(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

/** Put text on the clipboard. Falls back to a hidden textarea. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = el('textarea', { value: text, style: { position: 'fixed', opacity: '0' } });
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}
