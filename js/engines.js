import { el, faviconNode } from './util.js';

export function buildSearchUrl(engine, query) {
  return engine.searchUrl.replace('{query}', encodeURIComponent(query));
}

/** Split "g: cats" into the Google engine and "cats". */
export function parsePrefix(rawQuery, engines) {
  const match = rawQuery.match(/^(\S+):\s*(.*)$/s);
  if (match) {
    const engine = engines.find((e) => e.prefix && e.prefix === match[1].toLowerCase());
    if (engine) return { engine, query: match[2] };
  }
  return { engine: null, query: rawQuery };
}

/** Bundled icon for the built-in engines, favicon for custom ones. */
export function engineIconNode(engine) {
  if (engine.icon) return el('img', { class: 'engine-icon', src: engine.icon, alt: '' });
  return faviconNode(engine.searchUrl, engine.name, 32);
}
