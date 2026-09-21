import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/env.js';
import { durationFor, remainingMs, formatDuration, freshState, normalizeState } from '../js/timer.js';
import { describeCode, dayName, readDays } from '../js/weather.js';
import { isStale, GRADIENTS } from '../js/background.js';
import { formatTime, greetingFor } from '../js/clock.js';
import { buildSearchUrl, parsePrefix } from '../js/engines.js';
import { dedupe, groupResults } from '../js/omni.js';

/* Timer ------------------------------------------------------------ */

const timerConfig = { focusMin: 25, breakMin: 5, chime: true };

test('durationFor reads the right side of the config', () => {
  assert.equal(durationFor('focus', timerConfig), 25 * 60_000);
  assert.equal(durationFor('break', timerConfig), 5 * 60_000);
});

test('durationFor never returns zero', () => {
  assert.equal(durationFor('focus', { focusMin: 0, breakMin: 0 }), 60_000);
});

test('a running timer counts down from its end time', () => {
  const now = 1_000_000;
  const state = { running: true, endsAt: now + 90_000, remaining: 0 };
  assert.equal(remainingMs(state, now), 90_000);
  assert.equal(remainingMs(state, now + 100_000), 0);
});

test('a paused timer keeps whatever is left', () => {
  assert.equal(remainingMs({ running: false, endsAt: null, remaining: 42_000 }), 42_000);
});

test('formatDuration rounds up to whole seconds', () => {
  assert.equal(formatDuration(0), '00:00');
  assert.equal(formatDuration(59_400), '01:00');
  assert.equal(formatDuration(25 * 60_000), '25:00');
  assert.equal(formatDuration(61_000), '01:01');
});

test('a missing state starts a fresh focus session', () => {
  assert.deepEqual(normalizeState(undefined, timerConfig), freshState('focus', timerConfig));
});

test('an untouched timer picks up a new session length', () => {
  const state = freshState('focus', timerConfig);
  const longer = normalizeState(state, { ...timerConfig, focusMin: 50 });
  assert.equal(longer.remaining, 50 * 60_000);
  assert.equal(longer.full, 50 * 60_000);
});

test('a paused timer keeps its countdown when the length changes', () => {
  const state = { ...freshState('focus', timerConfig), remaining: 8 * 60_000 };
  assert.equal(normalizeState(state, { ...timerConfig, focusMin: 50 }).remaining, 8 * 60_000);
});

test('a paused timer is clamped to a shorter session', () => {
  const state = { ...freshState('focus', timerConfig), remaining: 20 * 60_000 };
  assert.equal(normalizeState(state, { ...timerConfig, focusMin: 10 }).remaining, 10 * 60_000);
});

test('a running timer is left alone', () => {
  const state = { mode: 'focus', running: true, endsAt: 123, remaining: 5, full: 10 };
  assert.deepEqual(normalizeState(state, timerConfig), state);
});

/* Weather ---------------------------------------------------------- */

test('weather codes map to a label and an icon', () => {
  assert.deepEqual(describeCode(0, true), { label: 'Clear sky', icon: 'sun' });
  assert.deepEqual(describeCode(0, false), { label: 'Clear sky', icon: 'moon' });
  assert.equal(describeCode(3).icon, 'cloud');
  assert.equal(describeCode(65).icon, 'rain');
  assert.equal(describeCode(75).icon, 'snow');
  assert.equal(describeCode(95).icon, 'storm');
  assert.equal(describeCode(48).icon, 'fog');
});

test('an unknown weather code still renders', () => {
  assert.deepEqual(describeCode(999), { label: 'Unknown', icon: 'cloud' });
});

/* Background ------------------------------------------------------- */

test('the daily arrays become one row per day', () => {
  const days = readDays({
    time: ['2026-09-23', '2026-09-24', '2026-09-25'],
    temperature_2m_max: [21.4, 19.8, 24.2],
    temperature_2m_min: [11.2, 9.9, 13.5],
    weather_code: [0, 61, 3],
    precipitation_probability_max: [0, 80, 10],
  });
  assert.equal(days.length, 3);
  assert.equal(days[0].name, 'Today');
  assert.deepEqual(
    { high: days[0].high, low: days[0].low, code: days[0].code, rain: days[0].rain },
    { high: 21, low: 11, code: 0, rain: 0 }
  );
  assert.equal(days[1].rain, 80);
});

test('a forecast with no days does not break', () => {
  assert.deepEqual(readDays(undefined), []);
  assert.deepEqual(readDays({}), []);
});

test('the first day is named "Today" and the rest by weekday', () => {
  assert.equal(dayName('2026-09-23', 0), 'Today');
  assert.equal(dayName('2026-09-24', 1), 'Thu');
});

test('a missing photo is always stale', () => {
  assert.equal(isStale(null, 'never'), true);
  assert.equal(isStale({ timestamp: Date.now() }, 'hourly'), true);
});

test('the refresh policy decides staleness', () => {
  const now = Date.parse('2026-03-02T10:00:00Z');
  const fresh = { dataUrl: 'data:', timestamp: now - 10 * 60_000 };
  const old = { dataUrl: 'data:', timestamp: now - 2 * 60 * 60_000 };

  assert.equal(isStale(fresh, 'tab', now), true);
  assert.equal(isStale(fresh, 'never', now), false);
  assert.equal(isStale(fresh, 'hourly', now), false);
  assert.equal(isStale(old, 'hourly', now), true);
});

test('a daily photo changes when the date changes', () => {
  const now = new Date(2026, 2, 2, 9, 0).getTime();
  const today = { dataUrl: 'data:', timestamp: new Date(2026, 2, 2, 1, 0).getTime() };
  const yesterday = { dataUrl: 'data:', timestamp: new Date(2026, 2, 1, 23, 0).getTime() };
  assert.equal(isStale(today, 'daily', now), false);
  assert.equal(isStale(yesterday, 'daily', now), true);
});

test('every gradient is a CSS gradient', () => {
  Object.values(GRADIENTS).forEach((value) => assert.match(value, /^linear-gradient\(/));
});

/* Clock ------------------------------------------------------------ */

test('24 hour time pads both parts', () => {
  assert.equal(formatTime(new Date(2026, 0, 1, 9, 5)), '09:05');
  assert.equal(formatTime(new Date(2026, 0, 1, 21, 5)), '21:05');
});

test('12 hour time adds the suffix and drops the leading zero', () => {
  const options = { format: '12' };
  assert.equal(formatTime(new Date(2026, 0, 1, 9, 5), options), '9:05 AM');
  assert.equal(formatTime(new Date(2026, 0, 1, 21, 5), options), '9:05 PM');
  assert.equal(formatTime(new Date(2026, 0, 1, 0, 30), options), '12:30 AM');
  assert.equal(formatTime(new Date(2026, 0, 1, 12, 30), options), '12:30 PM');
});

test('seconds are optional', () => {
  assert.equal(formatTime(new Date(2026, 0, 1, 8, 7, 6), { seconds: true }), '08:07:06');
});

test('the greeting follows the clock', () => {
  assert.equal(greetingFor(2), 'Good night');
  assert.equal(greetingFor(8), 'Good morning');
  assert.equal(greetingFor(14), 'Good afternoon');
  assert.equal(greetingFor(19), 'Good evening');
  assert.equal(greetingFor(23), 'Good night');
});

/* Engines ---------------------------------------------------------- */

const engines = [
  { id: 'g', name: 'Google', prefix: 'g', searchUrl: 'https://g/?q={query}' },
  { id: 'c', name: 'Claude', prefix: 'cl', searchUrl: 'https://c/?q={query}' },
];

test('the query is URL encoded', () => {
  assert.equal(buildSearchUrl(engines[0], 'a b&c'), 'https://g/?q=a%20b%26c');
});

test('a known prefix picks the engine', () => {
  assert.deepEqual(parsePrefix('cl: hello', engines), { engine: engines[1], query: 'hello' });
  assert.deepEqual(parsePrefix('CL:hello', engines), { engine: engines[1], query: 'hello' });
});

test('an unknown prefix is treated as text', () => {
  assert.deepEqual(parsePrefix('note: buy milk', engines), {
    engine: null,
    query: 'note: buy milk',
  });
});

test('text without a prefix is left alone', () => {
  assert.deepEqual(parsePrefix('https://x.dev/a', engines), {
    engine: null,
    query: 'https://x.dev/a',
  });
});

/* Omni ------------------------------------------------------------- */

test('dedupe keeps the first of each page', () => {
  const items = [
    { type: 'bookmark', url: 'https://www.github.com/' },
    { type: 'history', url: 'http://github.com' },
    { type: 'history', url: 'https://github.com/pulls' },
  ];
  assert.deepEqual(
    dedupe(items).map((item) => item.url),
    ['https://www.github.com/', 'https://github.com/pulls']
  );
});

test('dedupe keeps rows that have no URL', () => {
  const items = [{ type: 'command', title: 'a' }, { type: 'command', title: 'b' }];
  assert.equal(dedupe(items).length, 2);
});

test('results are grouped in a fixed order', () => {
  const grouped = groupResults([
    { type: 'history', title: 'h' },
    { type: 'command', title: 'c' },
    { type: 'link', title: 'l' },
    { type: 'history', title: 'h2' },
  ]);
  assert.deepEqual(
    grouped.map((group) => group.type),
    ['command', 'link', 'history']
  );
  assert.equal(grouped[2].items.length, 2);
  assert.equal(grouped[0].label, 'Actions');
});
