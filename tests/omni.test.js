import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { resetStorage } from './helpers/env.js';
import { search } from '../js/omni.js';
import { saveGroups, saveRoutines } from '../js/storage.js';

const GROUPS = [
  {
    id: 'general',
    name: 'Daily',
    links: [
      { name: 'GitHub', url: 'https://github.com' },
      { name: 'Claude', url: 'https://claude.ai' },
      { name: 'Hacker News', url: 'https://news.ycombinator.com' },
    ],
  },
  { id: 'work', name: 'Work', links: [{ name: 'Sentry', url: 'https://sentry.io' }] },
];

const ROUTINES = [{ name: 'Morning', urls: ['https://mail.google.com'] }];

const COMMANDS = [
  { type: 'command', title: 'Add a site', keywords: ['quicklink', 'new'], run() {} },
  { type: 'command', title: 'Open settings', keywords: ['preferences'], run() {} },
];

beforeEach(async () => {
  resetStorage();
  await saveGroups(structuredClone(GROUPS));
  await saveRoutines(structuredClone(ROUTINES));
});

const titles = (results) => results.map((item) => item.title);

test('an empty query lists links before routines', async () => {
  const results = await search('');
  const types = results.map((item) => item.type);
  assert.ok(types.indexOf('link') < types.indexOf('routine'));
  assert.equal(results.filter((item) => item.type === 'link').length, 4);
});

test('an empty query hides commands that are not marked alwaysShow', async () => {
  const results = await search('', { commands: COMMANDS });
  assert.ok(!results.some((item) => item.type === 'command'));
});

test('a query filters down to what matches', async () => {
  const results = await search('claude');
  assert.deepEqual(titles(results), ['Claude']);
});

test('links from every group are searched', async () => {
  assert.deepEqual(titles(await search('sentry')), ['Sentry']);
});

test('the group name is searchable through the subtitle', async () => {
  const results = await search('work');
  assert.ok(titles(results).includes('Sentry'));
});

test('routines are searchable', async () => {
  const results = await search('morning');
  assert.equal(results[0].type, 'routine');
  assert.equal(results[0].routineIndex, 0);
});

test('commands outrank a weaker link match', async () => {
  const results = await search('settings', { commands: COMMANDS });
  assert.equal(results[0].title, 'Open settings');
});

test('a command is found by its keywords', async () => {
  const results = await search('quicklink', { commands: COMMANDS });
  assert.equal(results[0].title, 'Add a site');
});

test('nothing matching gives an empty list', async () => {
  assert.deepEqual(await search('zzzzqq'), []);
});

test('the limit is respected', async () => {
  const results = await search('', { limit: 2 });
  assert.equal(results.length, 2);
});

test('a host name matches through the URL', async () => {
  assert.deepEqual(titles(await search('ycombinator')), ['Hacker News']);
});
