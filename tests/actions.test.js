import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/env.js';
import { activate } from '../js/actions.js';

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
