// The palette learns. Every row you pick is remembered, and the next search
// lifts the rows you keep choosing — recent picks count for more than old
// ones. The record never leaves this device.

import { getUsage, saveUsage } from './storage.js';
import { urlKey } from './util.js';

const HALF_LIFE_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 300;
const MAX_QUERIES = 4;
const MAX_QUERY_LENGTH = 24;

let cache = null;
let ready = null;

/** What the usage record calls this item. `null` for rows worth forgetting. */
export function keyOf(item) {
  if (!item) return null;
  if (item.type === 'command') return item.title ? `command:${item.title}` : null;
  if (item.type === 'routine') return `routine:${item.title}`;
  if (item.type === 'answer' || item.type === 'search') return null;
  return item.url ? `url:${urlKey(item.url)}` : null;
}

const decayOf = (entry, now) => 0.5 ** ((now - (entry.t ?? 0)) / HALF_LIFE_MS);

/** How much a single entry is worth now. Older picks fade by half a fortnight. */
export function scoreEntry(entry, now = Date.now()) {
  if (!entry?.n) return 0;
  // Capped, so that one well used row cannot outrank every name match.
  return Math.min(30, 9 * Math.log2(1 + entry.n)) * decayOf(entry, now);
}

/** Like scoreEntry but uncapped, so pruning can tell heavy use apart. */
function strength(entry, now) {
  return entry?.n ? entry.n * decayOf(entry, now) : 0;
}

const tidy = (query) => (query ?? '').trim().toLowerCase().slice(0, MAX_QUERY_LENGTH);

/** True when the two queries are leading parts of one another. */
function queryMatches(stored, current) {
  if (!stored || !current) return false;
  return stored.startsWith(current) || current.startsWith(stored);
}

/** The boost for one item: how often it is picked, plus how it was searched. */
export function boostFor(usage, item, query, now = Date.now()) {
  const key = keyOf(item);
  const entry = key && usage[key];
  if (!entry) return 0;
  const base = scoreEntry(entry, now);
  const typed = tidy(query);
  const matched = typed && (entry.q ?? []).some((stored) => queryMatches(stored, typed));
  return matched ? base + 25 : base;
}

/** Drop the weakest entries so the record stays small enough to sync. */
export function prune(usage, now = Date.now()) {
  const keys = Object.keys(usage);
  if (keys.length <= MAX_ENTRIES) return usage;
  const keep = keys
    .sort((a, b) => strength(usage[b], now) - strength(usage[a], now))
    .slice(0, MAX_ENTRIES);
  return Object.fromEntries(keep.map((key) => [key, usage[key]]));
}

/** Read the record once, then keep it in memory. */
export async function loadUsage() {
  ready ??= getUsage().then((stored) => {
    cache = stored ?? {};
    return cache;
  });
  return ready;
}

/** The record as last read. Empty until loadUsage() finishes. */
export function usage() {
  return cache ?? {};
}

/** Remember that this row was picked for this query. */
export async function recordUse(item, query) {
  const key = keyOf(item);
  if (!key) return;
  const store = await loadUsage();
  const entry = store[key] ?? { n: 0, t: 0, q: [] };
  entry.n += 1;
  entry.t = Date.now();
  const typed = tidy(query);
  if (typed) {
    entry.q = [typed, ...(entry.q ?? []).filter((stored) => stored !== typed)].slice(
      0,
      MAX_QUERIES
    );
  }
  store[key] = entry;
  cache = prune(store);
  await saveUsage(cache);
}

/** Forget everything. Used by the settings dialog. */
export async function clearUsage() {
  cache = {};
  ready = Promise.resolve(cache);
  await saveUsage(cache);
}
