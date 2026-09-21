import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/env.js';
import { recentDays, streak, toggleDay } from '../js/habits.js';

// A fixed Wednesday, so the tests do not depend on the day they run.
const WEDNESDAY = new Date(2026, 8, 23, 10, 0, 0);
const day = (offset) => {
  const date = new Date(WEDNESDAY);
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
};

describe('the day window', () => {
  test('ends today and runs back seven days', () => {
    const days = recentDays(7, WEDNESDAY);
    assert.equal(days.length, 7);
    assert.equal(days[6], '2026-09-23');
    assert.equal(days[0], '2026-09-17');
  });

  test('it steps over the end of a month', () => {
    const days = recentDays(3, new Date(2026, 9, 1, 12, 0, 0));
    assert.deepEqual(days, ['2026-09-29', '2026-09-30', '2026-10-01']);
  });
});

describe('streaks', () => {
  test('days in a row ending today are counted', () => {
    assert.equal(streak([day(-2), day(-1), day(0)], WEDNESDAY), 3);
  });

  test('a gap ends the run', () => {
    assert.equal(streak([day(-4), day(-1), day(0)], WEDNESDAY), 2);
  });

  test('a run kept up to yesterday survives an unticked today', () => {
    assert.equal(streak([day(-2), day(-1)], WEDNESDAY), 2);
  });

  test('a run that stopped before yesterday is over', () => {
    assert.equal(streak([day(-5), day(-4)], WEDNESDAY), 0);
    assert.equal(streak([], WEDNESDAY), 0);
  });
});

describe('ticking a day', () => {
  test('a day is added, then removed by a second tick', () => {
    const once = toggleDay([], '2026-09-23');
    assert.deepEqual(once, ['2026-09-23']);
    assert.deepEqual(toggleDay(once, '2026-09-23'), []);
  });

  test('the record stays sorted', () => {
    const days = toggleDay(['2026-09-23', '2026-09-21'], '2026-09-22');
    assert.deepEqual(days, ['2026-09-21', '2026-09-22', '2026-09-23']);
  });

  test('old days fall off the end', () => {
    const many = Array.from({ length: 5 }, (_, i) => `2026-01-0${i + 1}`);
    const days = toggleDay(many, '2026-02-01', 3);
    assert.deepEqual(days, ['2026-01-04', '2026-01-05', '2026-02-01']);
  });

  test('a habit with no record yet can be ticked', () => {
    assert.deepEqual(toggleDay(undefined, '2026-09-23'), ['2026-09-23']);
  });
});
