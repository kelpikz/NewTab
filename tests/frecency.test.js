import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { resetStorage } from './helpers/env.js';
import { boostFor, clearUsage, keyOf, prune, recordUse, scoreEntry, usage } from '../js/frecency.js';

const DAY = 24 * 60 * 60 * 1000;

describe('keys', () => {
  test('a link is keyed by its address, ignoring protocol and www', () => {
    assert.equal(keyOf({ type: 'link', url: 'https://www.github.com/' }), 'url:github.com');
    assert.equal(
      keyOf({ type: 'bookmark', url: 'http://github.com' }),
      keyOf({ type: 'history', url: 'https://www.github.com/' })
    );
  });

  test('commands and routines are keyed by name', () => {
    assert.equal(keyOf({ type: 'command', title: 'Add a site' }), 'command:Add a site');
    assert.equal(keyOf({ type: 'routine', title: 'Morning' }), 'routine:Morning');
  });

  test('rows with nothing to remember are skipped', () => {
    assert.equal(keyOf({ type: 'answer', title: '42' }), null);
    assert.equal(keyOf({ type: 'search', title: 'cats' }), null);
    assert.equal(keyOf(null), null);
  });
});

describe('scoring', () => {
  const now = Date.now();

  test('more picks score higher', () => {
    const once = scoreEntry({ n: 1, t: now }, now);
    const often = scoreEntry({ n: 20, t: now }, now);
    assert.ok(often > once);
  });

  test('a score halves every fortnight', () => {
    const fresh = scoreEntry({ n: 8, t: now }, now);
    const old = scoreEntry({ n: 8, t: now - 14 * DAY }, now);
    assert.ok(Math.abs(old - fresh / 2) < 0.001);
  });

  test('an unknown item gets nothing', () => {
    assert.equal(boostFor({}, { type: 'link', url: 'https://a.test' }, 'a', now), 0);
    assert.equal(scoreEntry(undefined, now), 0);
  });

  test('the same query as last time is worth an extra push', () => {
    const store = { 'url:a.test': { n: 2, t: now, q: ['mail'] } };
    const item = { type: 'link', url: 'https://a.test' };
    const plain = boostFor(store, item, 'zzz', now);
    const remembered = boostFor(store, item, 'mai', now);
    assert.equal(remembered - plain, 25);
  });

  test('the record is capped, keeping the strongest entries', () => {
    const store = {};
    for (let i = 0; i < 350; i += 1) store[`url:site${i}.test`] = { n: i + 1, t: now };
    const pruned = prune(store, now);
    assert.equal(Object.keys(pruned).length, 300);
    assert.ok(pruned['url:site349.test'], 'the most used entry survives');
    assert.ok(!pruned['url:site0.test'], 'the least used entry is dropped');
  });
});

describe('recording', () => {
  beforeEach(async () => {
    resetStorage();
    await clearUsage();
  });

  test('a pick is counted and the query is kept', async () => {
    const item = { type: 'link', url: 'https://mail.test' };
    await recordUse(item, 'Mail');
    await recordUse(item, 'mail');
    const entry = usage()['url:mail.test'];
    assert.equal(entry.n, 2);
    assert.deepEqual(entry.q, ['mail']);
    assert.ok(entry.t > 0);
  });

  test('only the last few queries are kept', async () => {
    const item = { type: 'link', url: 'https://mail.test' };
    for (const query of ['a', 'b', 'c', 'd', 'e']) await recordUse(item, query);
    assert.deepEqual(usage()['url:mail.test'].q, ['e', 'd', 'c', 'b']);
  });

  test('a row with nothing to remember is not stored', async () => {
    await recordUse({ type: 'answer', title: '42' }, '6*7');
    assert.deepEqual(usage(), {});
  });
});
