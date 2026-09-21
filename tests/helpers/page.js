// Loads newtab.html into a jsdom window and runs the real modules against it.
// jsdom is an optional dev dependency; loadPage() returns null without it.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as wait } from 'node:timers/promises';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export async function jsdomAvailable() {
  try {
    await import('jsdom');
    return true;
  } catch {
    return false;
  }
}

/** A 1x1 transparent GIF, so the background code has something to cache. */
const PIXEL_BYTES = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

/**
 * `seed` fills storage before the page starts, so a test can open the page
 * with settings, links or a location already in place. Keys are storage keys
 * without the `newtab:<area>:` prefix, e.g. `{ sync: { settings: {...} } }`.
 */
export async function loadPage({ fetchImpl, seed } = {}) {
  const { JSDOM } = await import('jsdom');
  const html = readFileSync(join(root, 'newtab.html'), 'utf8');
  const errors = [];

  const dom = new JSDOM(html, { url: 'https://newtab.test/', pretendToBeVisual: true });
  const { window } = dom;

  // jsdom does not fetch <link> stylesheets, so inline them. This makes
  // getComputedStyle meaningful for the checks that need it.
  const style = window.document.createElement('style');
  style.textContent = ['css/base.css', 'css/app.css']
    .map((file) => readFileSync(join(root, file), 'utf8'))
    .join('\n');
  window.document.head.appendChild(style);

  // Globals the modules expect from a browser.
  const previous = {};
  const define = (name, value) => {
    previous[name] = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  };

  window.Element.prototype.scrollIntoView ??= function () {};
  window.matchMedia ??= () => ({ matches: false, addEventListener() {} });
  window.HTMLDialogElement.prototype.showModal ??= function () {
    this.open = true;
  };
  window.HTMLDialogElement.prototype.close ??= function () {
    this.open = false;
    this.dispatchEvent(new window.Event('close'));
  };
  window.AudioContext = class {
    createOscillator() {
      return { connect: () => ({ connect() {} }), start() {}, stop() {}, frequency: {}, type: '' };
    }
    createGain() {
      return {
        gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect: () => ({ connect() {} }),
      };
    }
    close() {}
    get currentTime() {
      return 0;
    }
  };
  window.URL.createObjectURL = () => 'blob:test';
  window.URL.revokeObjectURL = () => {};

  // The clock and timer widgets tick forever; track them so dispose() can stop
  // them and let the test process exit.
  const timers = new Set();
  const realSetInterval = globalThis.setInterval;
  define('setInterval', (...args) => {
    const handle = realSetInterval(...args);
    timers.add(handle);
    return handle;
  });

  define('window', window);
  define('document', window.document);
  define('navigator', window.navigator);
  define('localStorage', window.localStorage);
  define('FileReader', window.FileReader);
  define('Blob', window.Blob);
  define('requestAnimationFrame', window.requestAnimationFrame ?? ((fn) => setTimeout(fn, 0)));
  define(
    'fetch',
    fetchImpl ??
      (async () => {
        throw new Error('offline');
      })
  );

  Object.entries(seed ?? {}).forEach(([area, items]) => {
    Object.entries(items).forEach(([key, value]) => {
      window.localStorage.setItem(`newtab:${area}:${key}`, JSON.stringify(value));
    });
  });

  window.addEventListener('error', (event) => errors.push(event.message));
  const onRejection = (reason) => errors.push(`unhandled rejection: ${reason}`);
  process.on('unhandledRejection', onRejection);

  // Fresh module instances per page, so state does not leak between tests.
  const cacheBust = `?t=${Date.now()}${Math.random()}`;
  await import(pathToFileURL(join(root, 'js', 'main.js')).href + cacheBust);
  await wait(250);

  const $ = (selector) => window.document.querySelector(selector);
  const $$ = (selector) => [...window.document.querySelectorAll(selector)];

  return {
    window,
    document: window.document,
    errors,
    $,
    $$,
    text: (selector) => $(selector)?.textContent ?? null,
    displayOf: (selector) => window.getComputedStyle($(selector)).display,
    click(target) {
      const node = typeof target === 'string' ? $(target) : target;
      node.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      return wait(120);
    },
    press(key, options = {}) {
      const target = options.target ? $(options.target) : window.document;
      target.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, ...options }));
      return wait(120);
    },
    async fill(selector, value) {
      const node = $(selector);
      node.value = value;
      node.dispatchEvent(new window.Event('input', { bubbles: true }));
      await wait(250);
    },
    change(selector, value) {
      const node = $(selector);
      node.value = value;
      node.dispatchEvent(new window.Event('change', { bubbles: true }));
      return wait(200);
    },
    wait,
    dispose() {
      timers.forEach((handle) => clearInterval(handle));
      timers.clear();
      process.off('unhandledRejection', onRejection);
      Object.entries(previous).forEach(([name, descriptor]) => {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete globalThis[name];
      });
      window.close();
    },
  };
}

export { PIXEL_BYTES };
