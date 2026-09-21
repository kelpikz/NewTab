import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/env.js';
import { daysLabel, daysUntil, sortByDate } from '../js/countdowns.js';

// Late on a Wednesday, to prove the clock time does not shift the count.
const NOW = new Date(2026, 8, 23, 23, 30, 0);

describe('counting days', () => {
  test('a day ahead is counted whole', () => {
    assert.equal(daysUntil('2026-09-24', NOW), 1);
    assert.equal(daysUntil('2026-10-23', NOW), 30);
  });

  test('today is zero and the past is negative', () => {
    assert.equal(daysUntil('2026-09-23', NOW), 0);
    assert.equal(daysUntil('2026-09-20', NOW), -3);
  });

  test('the count crosses a daylight saving change', () => {
    // Most of Europe moves its clocks on 25 October 2026.
    assert.equal(daysUntil('2026-10-26', new Date(2026, 9, 24, 12, 0, 0)), 2);
  });

  test('a date that makes no sense counts as nothing', () => {
    assert.equal(daysUntil('not-a-date', NOW), null);
  });
});

describe('wording', () => {
  test('near days are named, not numbered', () => {
    assert.equal(daysLabel(0), 'today');
    assert.equal(daysLabel(1), 'tomorrow');
    assert.equal(daysLabel(-1), 'yesterday');
  });

  test('other days are counted both ways', () => {
    assert.equal(daysLabel(12), 'in 12 days');
    assert.equal(daysLabel(-4), '4 days ago');
    assert.equal(daysLabel(null), '');
  });
});

describe('order', () => {
  const items = [
    { name: 'far', date: '2026-12-25' },
    { name: 'gone', date: '2026-09-01' },
    { name: 'soon', date: '2026-09-25' },
    { name: 'long gone', date: '2026-01-01' },
  ];

  test('the soonest day comes first', () => {
    const order = sortByDate(items, NOW).map((item) => item.name);
    assert.deepEqual(order, ['soon', 'far', 'gone', 'long gone']);
  });

  test('the original list is left alone', () => {
    sortByDate(items, NOW);
    assert.equal(items[0].name, 'far');
  });
});
