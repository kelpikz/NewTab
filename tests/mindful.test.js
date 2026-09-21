import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/env.js';
import {
  addSeconds,
  addVisit,
  formatMinutes,
  limitState,
  normalizeHost,
  ordinal,
  pauseSummary,
  prune,
  statsFor,
  trend,
  watchedFor,
} from '../js/mindful.js';

const DAY = '2026-09-22';

describe('hosts', () => {
  test('an address of any shape gives the bare host', () => {
    assert.equal(normalizeHost('https://www.YouTube.com/feed/subscriptions'), 'youtube.com');
    assert.equal(normalizeHost('youtube.com'), 'youtube.com');
    assert.equal(normalizeHost('  HTTP://Instagram.com:443/  '), 'instagram.com');
    assert.equal(normalizeHost(''), '');
  });

  test('a watched site also covers its subdomains', () => {
    const sites = [{ host: 'youtube.com' }, { host: 'instagram.com' }];
    assert.equal(watchedFor('https://m.youtube.com/watch?v=1', sites).host, 'youtube.com');
    assert.equal(watchedFor('https://www.instagram.com/', sites).host, 'instagram.com');
    assert.equal(watchedFor('https://github.com', sites), null);
  });

  test('a lookalike host is not a match', () => {
    const sites = [{ host: 'youtube.com' }];
    assert.equal(watchedFor('https://notyoutube.com', sites), null);
    assert.equal(watchedFor('https://youtube.com.evil.test', sites), null);
  });
});

describe('the tally', () => {
  test('a visit is counted against the day', () => {
    let log = addVisit({}, 'youtube.com', DAY);
    log = addVisit(log, 'youtube.com', DAY);
    log = addVisit(log, 'instagram.com', DAY);
    assert.equal(statsFor(log, 'youtube.com', DAY).visits, 2);
    assert.equal(statsFor(log, 'instagram.com', DAY).visits, 1);
    assert.deepEqual(statsFor(log, 'reddit.com', DAY), { visits: 0, seconds: 0 });
  });

  test('seconds add up beside the visits', () => {
    let log = addVisit({}, 'youtube.com', DAY);
    log = addSeconds(log, 'youtube.com', 90, DAY);
    log = addSeconds(log, 'youtube.com', 30.4, DAY);
    assert.deepEqual(statsFor(log, 'youtube.com', DAY), { visits: 1, seconds: 120 });
  });

  test('counting does not change the log it was given', () => {
    const log = addVisit({}, 'youtube.com', DAY);
    addVisit(log, 'youtube.com', DAY);
    assert.equal(statsFor(log, 'youtube.com', DAY).visits, 1);
  });

  test('only the last days are kept', () => {
    const log = {};
    for (let i = 1; i <= 9; i += 1) log[`2026-09-0${i}`] = { 'a.test': { visits: 1, seconds: 0 } };
    const kept = Object.keys(prune(log, 3));
    assert.deepEqual(kept, ['2026-09-07', '2026-09-08', '2026-09-09']);
  });

  test('a trend covers every day, even the empty ones', () => {
    const log = addVisit({}, 'youtube.com', '2026-09-22');
    const days = trend(log, 'youtube.com', 3, new Date(2026, 8, 22));
    assert.deepEqual(
      days.map((day) => day.visits),
      [0, 0, 1]
    );
  });
});

describe('limits', () => {
  test('a site with no limit is always fine', () => {
    assert.equal(limitState({ visits: 99, seconds: 9999 }, { host: 'a.test' }), 'ok');
  });

  test('a visit limit warns, then trips', () => {
    const site = { limitVisits: 10 };
    assert.equal(limitState({ visits: 3, seconds: 0 }, site), 'ok');
    assert.equal(limitState({ visits: 7, seconds: 0 }, site), 'near');
    assert.equal(limitState({ visits: 10, seconds: 0 }, site), 'over');
  });

  test('a minute limit trips on its own', () => {
    const site = { limitMinutes: 30 };
    assert.equal(limitState({ visits: 0, seconds: 25 * 60 }, site), 'near');
    assert.equal(limitState({ visits: 0, seconds: 31 * 60 }, site), 'over');
  });
});

describe('wording', () => {
  test('minutes read as hours once there are enough', () => {
    assert.equal(formatMinutes(0), '');
    assert.equal(formatMinutes(90), '2m');
    assert.equal(formatMinutes(42 * 60), '42m');
    assert.equal(formatMinutes(72 * 60), '1h 12m');
  });

  test('ordinals follow English, including the teens', () => {
    assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal), [
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
    ]);
  });

  test('the pause line counts the visit about to happen', () => {
    assert.equal(pauseSummary({ visits: 0, seconds: 0 }), '1st visit today');
    assert.equal(pauseSummary({ visits: 2, seconds: 45 * 60 }), '3rd visit today · 45m so far');
  });
});
