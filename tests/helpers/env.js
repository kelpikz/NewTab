// Minimal browser globals so the extension modules can run under Node.
// Imported for its side effect, before any module under test.

class MemoryStorage {
  #data = new Map();

  get length() {
    return this.#data.size;
  }

  key(index) {
    return [...this.#data.keys()][index] ?? null;
  }

  getItem(key) {
    return this.#data.has(key) ? this.#data.get(key) : null;
  }

  setItem(key, value) {
    this.#data.set(String(key), String(value));
  }

  removeItem(key) {
    this.#data.delete(key);
  }

  clear() {
    this.#data.clear();
  }
}

const storage = new MemoryStorage();

// `Object.keys(localStorage)` must list the stored keys, like it does in a browser.
globalThis.localStorage = new Proxy(storage, {
  ownKeys: (target) => [...Array(target.length).keys()].map((index) => target.key(index)),
  getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
  get: (target, prop) => {
    const value = Reflect.get(target, prop);
    return typeof value === 'function' ? value.bind(target) : value;
  },
});

export function resetStorage() {
  storage.clear();
}
