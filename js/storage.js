import { sync, local } from './platform.js';
import { todayKey } from './util.js';

const LINKS_KEY = 'quicklinks';
const GROUPS_KEY = 'quicklinkGroups';
const ACTIVE_GROUP_KEY = 'activeQuicklinkGroup';
const ENGINES_KEY = 'searchEngines';
const ROUTINES_KEY = 'routines';
const TASKS_KEY = 'tasks';
const SETTINGS_KEY = 'settings';
const NOTES_KEY = 'notes';
const FOCUS_KEY = 'dailyFocus';
const USAGE_KEY = 'usage';

const clone = (value) => structuredClone(value);

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export const DEFAULT_SETTINGS = {
  name: '',
  theme: 'dark', // dark | light | auto
  accent: '#7c9cff',
  clock: { show: true, format: '24', seconds: false, greeting: true },
  background: {
    source: 'photo', // photo | gradient | solid | custom
    gradient: 'aurora',
    color: '#161a24',
    dim: 0.3,
    blur: 0,
    refresh: 'hourly', // tab | hourly | daily | never
  },
  widgets: {
    clock: true,
    focus: true,
    search: true,
    quicklinks: true,
    tasks: true,
    notes: true,
    routines: true,
    weather: true,
    timer: true,
  },
  weather: { place: null, units: 'metric' },
  timer: { focusMin: 25, breakMin: 5, chime: true },
};

function deepMerge(base, patch) {
  if (patch === undefined) return clone(base);
  if (base === null || typeof base !== 'object' || Array.isArray(base)) return clone(patch);
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return clone(patch);
  const out = clone(base);
  for (const [key, value] of Object.entries(patch)) {
    out[key] = key in base ? deepMerge(base[key], value) : clone(value);
  }
  return out;
}

export { deepMerge };

let cached = null;
const listeners = new Set();

export async function loadSettings() {
  const stored = await sync.get(SETTINGS_KEY);
  cached = deepMerge(DEFAULT_SETTINGS, stored[SETTINGS_KEY]);
  return cached;
}

/** Settings as loaded at start-up. Call loadSettings() once before this. */
export function settings() {
  return cached ?? clone(DEFAULT_SETTINGS);
}

export async function updateSettings(patch) {
  cached = deepMerge(settings(), patch);
  await sync.set({ [SETTINGS_KEY]: cached });
  listeners.forEach((fn) => fn(cached));
  return cached;
}

export function onSettingsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/* ------------------------------------------------------------------ */
/* Search engines                                                      */
/* ------------------------------------------------------------------ */

export const DEFAULT_ENGINES = [
  {
    id: 'google',
    name: 'Google',
    icon: 'icons/google.png',
    prefix: 'g',
    searchUrl: 'https://www.google.com/search?q={query}',
  },
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    icon: 'icons/chatgpt.png',
    prefix: 'ch',
    searchUrl: 'https://chatgpt.com/?prompt={query}',
  },
  {
    id: 'claude',
    name: 'Claude',
    icon: 'icons/claude.png',
    prefix: 'cl',
    searchUrl: 'https://claude.ai/new?q={query}',
  },
];

/**
 * Version 1 stored only overrides ({id, prefix, searchUrl}). Version 2 stores
 * the full list so engines can be added and removed.
 */
export function migrateEngines(stored) {
  if (!stored?.length) return clone(DEFAULT_ENGINES);
  if (stored.every((engine) => engine.name && engine.id)) return clone(stored);
  return DEFAULT_ENGINES.map((base) => ({
    ...base,
    ...stored.find((engine) => engine.id === base.id),
  }));
}

export async function getEngines() {
  const result = await sync.get(ENGINES_KEY);
  return migrateEngines(result[ENGINES_KEY]);
}

export async function saveEngines(engines) {
  await sync.set({ [ENGINES_KEY]: engines });
}

/* ------------------------------------------------------------------ */
/* Routines                                                            */
/* ------------------------------------------------------------------ */

const DEFAULT_ROUTINES = [
  {
    name: 'Morning',
    urls: ['https://mail.google.com', 'https://news.ycombinator.com', 'https://devurls.com'],
  },
  { name: 'Dev', urls: ['https://github.com', 'https://claude.ai', 'https://chatgpt.com'] },
];

export async function getRoutines() {
  const result = await sync.get(ROUTINES_KEY);
  return result[ROUTINES_KEY] ?? clone(DEFAULT_ROUTINES);
}

export async function saveRoutines(routines) {
  await sync.set({ [ROUTINES_KEY]: routines });
}

/* ------------------------------------------------------------------ */
/* Quick links                                                         */
/* ------------------------------------------------------------------ */

const DEFAULT_LINKS = [
  { name: 'Instagram', url: 'https://www.instagram.com' },
  { name: 'Claude', url: 'https://claude.ai' },
  { name: 'HN', url: 'https://news.ycombinator.com' },
  { name: 'DevURLS', url: 'https://devurls.com' },
];

export async function getGroups() {
  const result = await sync.get([GROUPS_KEY, LINKS_KEY]);
  if (result[GROUPS_KEY]?.length) return result[GROUPS_KEY];

  // Migrate pre-groups flat quicklinks into a single "General" tab
  const legacy = result[LINKS_KEY];
  const groups = [{ id: 'general', name: 'General', links: legacy ?? clone(DEFAULT_LINKS) }];
  if (legacy) {
    await sync.set({ [GROUPS_KEY]: groups });
    await sync.remove(LINKS_KEY);
  }
  return groups;
}

export async function saveGroups(groups) {
  await sync.set({ [GROUPS_KEY]: groups });
}

export async function getActiveGroupId() {
  const result = await local.get(ACTIVE_GROUP_KEY);
  return result[ACTIVE_GROUP_KEY] ?? null;
}

export async function setActiveGroupId(id) {
  await local.set({ [ACTIVE_GROUP_KEY]: id });
}

export async function addGroup(name) {
  const groups = await getGroups();
  const group = { id: crypto.randomUUID(), name, links: [] };
  groups.push(group);
  await saveGroups(groups);
  return group;
}

export async function renameGroup(id, name) {
  const groups = await getGroups();
  const group = groups.find((g) => g.id === id);
  if (group) group.name = name;
  await saveGroups(groups);
  return groups;
}

export async function deleteGroup(id) {
  const groups = await getGroups();
  const remaining = groups.filter((g) => g.id !== id);
  if (!remaining.length) {
    remaining.push({ id: 'general', name: 'General', links: [] });
  }
  await saveGroups(remaining);
  return remaining;
}

export async function reorderGroup(fromId, toId) {
  const groups = await getGroups();
  const from = groups.findIndex((g) => g.id === fromId);
  const to = groups.findIndex((g) => g.id === toId);
  if (from === -1 || to === -1) return groups;
  const [moved] = groups.splice(from, 1);
  groups.splice(to, 0, moved);
  await saveGroups(groups);
  return groups;
}

export async function reorderLink(groupId, from, to) {
  const groups = await getGroups();
  const group = groups.find((g) => g.id === groupId);
  if (group) {
    const [moved] = group.links.splice(from, 1);
    group.links.splice(to, 0, moved);
  }
  await saveGroups(groups);
  return groups;
}

export async function moveLinkToGroup(fromGroupId, index, toGroupId) {
  const groups = await getGroups();
  const from = groups.find((g) => g.id === fromGroupId);
  const to = groups.find((g) => g.id === toGroupId);
  if (from && to && from !== to) {
    const [link] = from.links.splice(index, 1);
    to.links.push(link);
  }
  await saveGroups(groups);
  return groups;
}

export async function addLink(groupId, link) {
  const groups = await getGroups();
  const group = groups.find((g) => g.id === groupId);
  if (group) group.links.push(link);
  await saveGroups(groups);
  return groups;
}

export async function updateLink(groupId, index, link) {
  const groups = await getGroups();
  const group = groups.find((g) => g.id === groupId);
  if (group) group.links[index] = link;
  await saveGroups(groups);
  return groups;
}

export async function removeLink(groupId, index) {
  const groups = await getGroups();
  const group = groups.find((g) => g.id === groupId);
  if (group) group.links.splice(index, 1);
  await saveGroups(groups);
  return groups;
}

/* ------------------------------------------------------------------ */
/* Tasks, notes, daily focus                                           */
/* ------------------------------------------------------------------ */

export async function getTasks() {
  const result = await sync.get(TASKS_KEY);
  return result[TASKS_KEY] ?? [];
}

export async function saveTasks(tasks) {
  await sync.set({ [TASKS_KEY]: tasks });
}

export async function getNotes() {
  const result = await local.get(NOTES_KEY);
  return result[NOTES_KEY] ?? '';
}

export async function saveNotes(text) {
  await local.set({ [NOTES_KEY]: text });
}

/** The focus resets itself every day. */
export async function getDailyFocus() {
  const result = await local.get(FOCUS_KEY);
  const stored = result[FOCUS_KEY];
  if (!stored || stored.date !== todayKey()) return { date: todayKey(), text: '', done: false };
  return stored;
}

export async function saveDailyFocus(focus) {
  await local.set({ [FOCUS_KEY]: { ...focus, date: todayKey() } });
}

/** What the palette has learned about which rows get picked. */
export async function getUsage() {
  const result = await local.get(USAGE_KEY);
  return result[USAGE_KEY] ?? {};
}

export async function saveUsage(usage) {
  await local.set({ [USAGE_KEY]: usage });
}

/* ------------------------------------------------------------------ */
/* Backup                                                              */
/* ------------------------------------------------------------------ */

const SYNC_KEYS = [SETTINGS_KEY, GROUPS_KEY, ENGINES_KEY, ROUTINES_KEY, TASKS_KEY];
const LOCAL_KEYS = [NOTES_KEY, FOCUS_KEY, ACTIVE_GROUP_KEY, USAGE_KEY];

export async function exportData() {
  const [syncData, localData] = await Promise.all([sync.get(SYNC_KEYS), local.get(LOCAL_KEYS)]);
  return { version: 2, exportedAt: new Date().toISOString(), sync: syncData, local: localData };
}

export async function importData(payload) {
  if (!payload || typeof payload !== 'object' || !payload.sync) {
    throw new Error('This file is not a New Tab backup.');
  }
  const syncData = Object.fromEntries(
    Object.entries(payload.sync).filter(([key]) => SYNC_KEYS.includes(key))
  );
  const localData = Object.fromEntries(
    Object.entries(payload.local ?? {}).filter(([key]) => LOCAL_KEYS.includes(key))
  );
  if (Object.keys(syncData).length) await sync.set(syncData);
  if (Object.keys(localData).length) await local.set(localData);
}

export async function resetAll() {
  await Promise.all([sync.clear(), local.clear()]);
}
