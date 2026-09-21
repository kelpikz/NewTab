import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { resetStorage } from './helpers/env.js';
import {
  deepMerge,
  migrateEngines,
  DEFAULT_ENGINES,
  DEFAULT_SETTINGS,
  loadSettings,
  updateSettings,
  settings,
  getGroups,
  addGroup,
  addLink,
  removeLink,
  reorderLink,
  moveLinkToGroup,
  deleteGroup,
  reorderGroup,
  getTasks,
  saveTasks,
  exportData,
  importData,
  getDailyFocus,
  saveDailyFocus,
} from '../js/storage.js';

beforeEach(() => resetStorage());

/* deepMerge -------------------------------------------------------- */

test('deepMerge fills in nested defaults', () => {
  const merged = deepMerge({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 9 } });
  assert.deepEqual(merged, { a: 1, b: { c: 2, d: 9 } });
});

test('deepMerge replaces arrays instead of merging them', () => {
  assert.deepEqual(deepMerge({ list: [1, 2, 3] }, { list: [4] }), { list: [4] });
});

test('deepMerge keeps the base when the patch is missing', () => {
  assert.deepEqual(deepMerge({ a: 1 }, undefined), { a: 1 });
});

test('deepMerge writes an object over a null default', () => {
  const place = { name: 'Bengaluru', lat: 12.9 };
  assert.deepEqual(deepMerge({ place: null }, { place }), { place });
});

test('deepMerge can clear a value back to null', () => {
  assert.deepEqual(deepMerge({ place: { name: 'x' } }, { place: null }), { place: null });
});

test('deepMerge keeps the base when the patch value is undefined', () => {
  assert.deepEqual(deepMerge({ a: 1 }, { a: undefined }), { a: 1 });
});

test('deepMerge does not mutate the base', () => {
  const base = { nested: { value: 1 } };
  deepMerge(base, { nested: { value: 2 } });
  assert.equal(base.nested.value, 1);
});

/* Engines ---------------------------------------------------------- */

test('engines fall back to the defaults', () => {
  assert.deepEqual(migrateEngines(undefined), DEFAULT_ENGINES);
  assert.deepEqual(migrateEngines([]), DEFAULT_ENGINES);
});

test('version 1 engine overrides are merged into the defaults', () => {
  const migrated = migrateEngines([{ id: 'google', prefix: 'gg', searchUrl: 'https://x/?q={query}' }]);
  assert.equal(migrated.length, DEFAULT_ENGINES.length);
  assert.equal(migrated[0].name, 'Google');
  assert.equal(migrated[0].prefix, 'gg');
  assert.equal(migrated[0].searchUrl, 'https://x/?q={query}');
});

test('a full engine list is kept as it is', () => {
  const stored = [{ id: 'a', name: 'Mine', prefix: 'm', searchUrl: 'https://m/?q={query}' }];
  assert.deepEqual(migrateEngines(stored), stored);
});

/* Settings --------------------------------------------------------- */

test('settings load with every default present', async () => {
  const loaded = await loadSettings();
  assert.deepEqual(loaded, DEFAULT_SETTINGS);
});

test('updateSettings merges deeply and persists', async () => {
  await loadSettings();
  await updateSettings({ background: { dim: 0.5 } });
  assert.equal(settings().background.dim, 0.5);
  assert.equal(settings().background.blur, DEFAULT_SETTINGS.background.blur);

  const reloaded = await loadSettings();
  assert.equal(reloaded.background.dim, 0.5);
});

test('a stored setting from an older version keeps new defaults', async () => {
  await loadSettings();
  await updateSettings({ name: 'Ajitha' });
  const reloaded = await loadSettings();
  assert.equal(reloaded.name, 'Ajitha');
  assert.equal(reloaded.timer.focusMin, DEFAULT_SETTINGS.timer.focusMin);
});

/* Quick links ------------------------------------------------------ */

test('the first read creates a General group with sample links', async () => {
  const groups = await getGroups();
  assert.equal(groups.length, 1);
  assert.equal(groups[0].id, 'general');
  assert.ok(groups[0].links.length > 0);
});

test('links can be added, edited and removed', async () => {
  await addLink('general', { name: 'Test', url: 'https://test.dev' });
  let groups = await getGroups();
  const added = groups[0].links.at(-1);
  assert.equal(added.name, 'Test');

  groups = await removeLink('general', groups[0].links.length - 1);
  assert.ok(!groups[0].links.some((link) => link.name === 'Test'));
});

test('reorderLink moves a link within its group', async () => {
  const before = (await getGroups())[0].links.map((link) => link.name);
  const after = (await reorderLink('general', 0, 2))[0].links.map((link) => link.name);
  assert.deepEqual(after, [before[1], before[2], before[0], before[3]]);
});

test('a link can move to another group', async () => {
  const other = await addGroup('Work');
  const first = (await getGroups())[0].links[0];
  const groups = await moveLinkToGroup('general', 0, other.id);
  assert.equal(groups.find((group) => group.id === other.id).links[0].name, first.name);
  assert.ok(!groups[0].links.some((link) => link.name === first.name));
});

test('groups can be reordered', async () => {
  const other = await addGroup('Work');
  const groups = await reorderGroup(other.id, 'general');
  assert.equal(groups[0].id, other.id);
});

test('deleting the last group leaves an empty General group', async () => {
  const groups = await deleteGroup('general');
  assert.equal(groups.length, 1);
  assert.equal(groups[0].id, 'general');
  assert.deepEqual(groups[0].links, []);
});

/* Tasks and focus -------------------------------------------------- */

test('tasks round-trip', async () => {
  assert.deepEqual(await getTasks(), []);
  await saveTasks([{ id: '1', text: 'Ship it', done: false }]);
  assert.equal((await getTasks())[0].text, 'Ship it');
});

test('the daily focus resets on a new day', async () => {
  await saveDailyFocus({ text: 'Write tests', done: false });
  assert.equal((await getDailyFocus()).text, 'Write tests');

  const stale = JSON.parse(localStorage.getItem('newtab:local:dailyFocus'));
  stale.date = '2000-01-01';
  localStorage.setItem('newtab:local:dailyFocus', JSON.stringify(stale));

  const fresh = await getDailyFocus();
  assert.equal(fresh.text, '');
  assert.equal(fresh.done, false);
});

/* Backup ----------------------------------------------------------- */

test('export then import restores the data', async () => {
  await loadSettings();
  await updateSettings({ name: 'Ajitha' });
  await addLink('general', { name: 'Keep', url: 'https://keep.dev' });
  await saveTasks([{ id: '1', text: 'Keep me', done: false }]);

  const backup = await exportData();
  resetStorage();

  await importData(backup);
  assert.equal((await loadSettings()).name, 'Ajitha');
  assert.ok((await getGroups())[0].links.some((link) => link.name === 'Keep'));
  assert.equal((await getTasks())[0].text, 'Keep me');
});

test('importing junk is rejected', async () => {
  await assert.rejects(() => importData({ nope: true }), /not a New Tab backup/);
});

test('import ignores keys it does not know', async () => {
  await importData({ version: 2, sync: { evil: 'payload', tasks: [] }, local: {} });
  assert.equal(localStorage.getItem('newtab:sync:evil'), null);
});
