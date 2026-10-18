import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/env.js';
import { activate } from '../js/actions.js';
import { updateSettings } from '../js/storage.js';

test('a row with a run callback runs it', async () => {
  let ran = 0;
  await activate({ type: 'search', title: 'hello', run: () => (ran += 1) });
  assert.equal(ran, 1);
});

test('the run callback is told about Ctrl+Enter', async () => {
  let seen = null;
  await activate({ type: 'search', run: (options) => (seen = options) }, { newTab: true });
  assert.deepEqual(seen, { newTab: true });
});

test('a routine row opens its urls', async () => {
  const opened = [];
  globalThis.window = { open: (url) => opened.push(url) };
  await activate({ type: 'routine', routine: { urls: ['https://example.com'] } });
  assert.deepEqual(opened, ['https://example.com']);
  delete globalThis.window;
});

test('a routine can open as a named group in this window', async () => {
  await updateSettings({ routines: { open: 'group' } });
  const calls = [];
  globalThis.chrome = {
    tabs: {
      create: async ({ url, active }) => (calls.push(['create', url, active]), { id: calls.length }),
      group: async ({ tabIds }) => (calls.push(['group', tabIds]), 7),
      getCurrent: async () => ({ id: 99 }),
      remove: (id) => calls.push(['remove', id]),
    },
    tabGroups: { update: async (id, { title }) => calls.push(['title', id, title]) },
  };
  await activate({ type: 'routine', routine: { name: 'work', urls: ['https://a.com', 'https://b.com'] } });
  assert.deepEqual(calls, [
    ['create', 'https://a.com', true],
    ['create', 'https://b.com', false],
    ['group', [1, 2]],
    ['title', 7, 'work'],
    ['remove', 99],
  ]);
  delete globalThis.chrome;
  await updateSettings({ routines: { open: 'window' } });
});
