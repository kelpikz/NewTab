// Thin wrapper over the Chrome extension APIs.
// Falls back to localStorage so the page also runs outside an extension.

const inExtension = typeof chrome !== 'undefined' && !!chrome.storage;

function toKeyList(keys) {
  if (keys === null || keys === undefined) return null;
  return Array.isArray(keys) ? keys : [keys];
}

function fallbackArea(name) {
  const prefix = `newtab:${name}:`;
  const read = (key) => {
    const raw = localStorage.getItem(prefix + key);
    return raw === null ? undefined : JSON.parse(raw);
  };
  return {
    async get(keys) {
      const list = toKeyList(keys);
      const names =
        list ??
        Object.keys(localStorage)
          .filter((k) => k.startsWith(prefix))
          .map((k) => k.slice(prefix.length));
      const out = {};
      names.forEach((key) => {
        const value = read(key);
        if (value !== undefined) out[key] = value;
      });
      return out;
    },
    async set(items) {
      Object.entries(items).forEach(([key, value]) => {
        localStorage.setItem(prefix + key, JSON.stringify(value));
      });
    },
    async remove(keys) {
      toKeyList(keys).forEach((key) => localStorage.removeItem(prefix + key));
    },
    async clear() {
      Object.keys(localStorage)
        .filter((k) => k.startsWith(prefix))
        .forEach((k) => localStorage.removeItem(k));
    },
  };
}

function area(name) {
  const native = inExtension ? chrome.storage[name] : null;
  if (!native) return fallbackArea(name);
  return {
    get: (keys) => native.get(keys ?? null),
    set: (items) => native.set(items),
    remove: (keys) => native.remove(keys),
    clear: () => native.clear(),
  };
}

export const sync = area('sync');
export const local = area('local');

/** True when the given chrome.* namespace is usable right now. */
export function hasApi(name) {
  return typeof chrome !== 'undefined' && !!chrome[name];
}

// The palette asks about permissions on every keystroke, so the answers are
// cached until Chrome tells us they changed.
const permissionCache = new Map();

if (hasApi('permissions')) {
  chrome.permissions.onAdded?.addListener(() => permissionCache.clear());
  chrome.permissions.onRemoved?.addListener(() => permissionCache.clear());
}

/** True when every optional permission in the list is granted. */
export async function hasPermissions(permissions) {
  if (!hasApi('permissions')) return false;
  const key = permissions.join(',');
  if (!permissionCache.has(key)) {
    permissionCache.set(key, chrome.permissions.contains({ permissions }).catch(() => false));
  }
  return permissionCache.get(key);
}

async function changePermissions(action, permissions) {
  if (!hasApi('permissions')) return false;
  const result = await chrome.permissions[action]({ permissions }).catch(() => false);
  permissionCache.clear();
  return result;
}

/** Ask for optional permissions. Must run inside a user gesture. */
export function requestPermissions(permissions) {
  return changePermissions('request', permissions);
}

export function removePermissions(permissions) {
  return changePermissions('remove', permissions);
}

/** Extension-internal URL, or null outside an extension. */
export function extensionUrl(path) {
  if (typeof chrome === 'undefined' || !chrome.runtime?.getURL) return null;
  return chrome.runtime.getURL(path);
}

export function openUrl(url, { newTab = false } = {}) {
  if (newTab) window.open(url, '_blank', 'noopener');
  else window.location.href = url;
}
