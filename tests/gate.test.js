import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/env.js';
import {
  addSeconds,
  addVisit,
  gateAddress,
  gateFor,
  hostKey,
  lastDays,
  modeOf,
  phraseMatches,
  readGateAddress,
  shouldTimeOut,
  siteFor,
  siteTotals,
  DEFAULT_PHRASE,
} from '../js/timelog.js';
import { limitLine } from '../js/mindful.js';
import { rangeDays, sumTotals } from '../js/screentime.js';
import { QUOTES, quoteFor } from '../js/quotes.js';

const SITES = [
  { host: 'instagram.com', mode: 'pause', limitMinutes: 30 },
  { host: 'x.com', mode: 'block' },
  { host: 'youtube.com', mode: 'type' },
];
const CONFIG = { enabled: true, sites: SITES };

describe('which site an address is', () => {
  test('a watched site covers its subdomains', () => {
    assert.equal(siteFor('https://www.instagram.com/reels', SITES).host, 'instagram.com');
    assert.equal(siteFor('https://m.youtube.com/watch?v=1', SITES).host, 'youtube.com');
    assert.equal(siteFor('https://github.com', SITES), null);
  });

  test('time is counted under the watched site, else the bare host', () => {
    assert.equal(hostKey('https://m.youtube.com/watch', SITES), 'youtube.com');
    assert.equal(hostKey('https://mail.google.com/u/0', SITES), 'mail.google.com');
    assert.equal(hostKey('https://www.github.com/', SITES), 'github.com');
  });

  test('pages that are not on the web are not counted', () => {
    assert.equal(hostKey('chrome://extensions', SITES), null);
    assert.equal(hostKey('chrome-extension://abc/newtab.html', SITES), null);
    assert.equal(hostKey('file:///C:/notes.txt', SITES), null);
    assert.equal(hostKey(undefined, SITES), null);
  });

  test('a site saved before modes waits, like it always did', () => {
    assert.equal(modeOf({ host: 'a.test' }), 'pause');
    assert.equal(modeOf({ host: 'a.test', mode: 'nonsense' }), 'pause');
    assert.equal(modeOf({ host: 'a.test', mode: 'block' }), 'block');
  });
});

describe('the gate', () => {
  test('a watched site is stopped, any other site is not', () => {
    assert.equal(gateFor('https://instagram.com/', CONFIG).host, 'instagram.com');
    assert.equal(gateFor('https://github.com/', CONFIG), null);
  });

  test('nothing is stopped when the gate is off', () => {
    assert.equal(gateFor('https://instagram.com/', { ...CONFIG, enabled: false }), null);
  });

  test('a tab you let in stays in', () => {
    const pass = { host: 'instagram.com', until: 0 };
    assert.equal(gateFor('https://instagram.com/explore', CONFIG, pass), null);
    assert.equal(gateFor('https://youtube.com/', CONFIG, pass).host, 'youtube.com');
  });

  test('a blocked site ignores a pass', () => {
    assert.equal(gateFor('https://x.com/home', CONFIG, { host: 'x.com', until: 0 }).host, 'x.com');
  });

  test('the sentence can differ in case, spaces and the full stop', () => {
    assert.ok(phraseMatches('i should not be doing this.', DEFAULT_PHRASE));
    assert.ok(phraseMatches('  I should  not be doing this!  ', DEFAULT_PHRASE));
    assert.ok(phraseMatches('I don’t need this', "I don't need this"));
    assert.ok(!phraseMatches('I should be doing this', DEFAULT_PHRASE));
    assert.ok(!phraseMatches('', DEFAULT_PHRASE));
  });

  test('an empty sentence falls back to the default one', () => {
    assert.ok(phraseMatches(DEFAULT_PHRASE, ''));
  });

  test('the gate address carries the site there and back', () => {
    const url = 'https://www.instagram.com/p/abc?x=1&y=2#top';
    const address = gateAddress('chrome-extension://id/gate.html', url, 'timeout');
    const search = address.slice(address.indexOf('?'));
    assert.deepEqual(readGateAddress(search), { url, kind: 'timeout' });
  });

  test('the gate page only ever opens a web page', () => {
    assert.equal(readGateAddress('?url=javascript%3Aalert(1)'), null);
    assert.equal(readGateAddress('?kind=visit'), null);
    assert.equal(readGateAddress('?url=https%3A%2F%2Fa.test&kind=odd').kind, 'visit');
  });
});

describe('the time-out', () => {
  const site = SITES[0];
  const now = 1_000_000;

  test('comes once the minutes are used up', () => {
    assert.equal(shouldTimeOut(site, { visits: 3, seconds: 29 * 60 }, null, now), false);
    assert.equal(shouldTimeOut(site, { visits: 3, seconds: 30 * 60 }, null, now), true);
  });

  test('waits while five more minutes run', () => {
    const stats = { visits: 3, seconds: 45 * 60 };
    assert.equal(shouldTimeOut(site, stats, { host: site.host, until: now + 1 }, now), false);
    assert.equal(shouldTimeOut(site, stats, { host: site.host, until: now - 1 }, now), true);
    assert.equal(shouldTimeOut(site, stats, { host: 'x.com', until: now + 1 }, now), true);
  });

  test('never comes without a minute limit', () => {
    assert.equal(shouldTimeOut({ host: 'a.test' }, { visits: 99, seconds: 99999 }, null, now), false);
  });

  test('the limit line names the limit you passed', () => {
    const both = { host: 'a.test', limitVisits: 5, limitMinutes: 20 };
    assert.equal(limitLine({ visits: 1, seconds: 25 * 60 }, both), 'You set yourself 20 minutes a day.');
    assert.equal(limitLine({ visits: 6, seconds: 60 }, both), 'You set yourself 5 visits a day.');
    assert.equal(limitLine({ visits: 1, seconds: 60 }, both), '');
  });
});

describe('every site', () => {
  test('totals add up over days and sort by time', () => {
    let log = addSeconds({}, 'github.com', 600, '2026-10-01');
    log = addSeconds(log, 'github.com', 300, '2026-10-02');
    log = addVisit(log, 'github.com', '2026-10-02');
    log = addSeconds(log, 'youtube.com', 1200, '2026-10-02');
    log = addSeconds(log, 'old.test', 9999, '2026-09-01');

    const totals = siteTotals(log, ['2026-10-01', '2026-10-02']);
    assert.deepEqual(totals, [
      { host: 'youtube.com', visits: 0, seconds: 1200 },
      { host: 'github.com', visits: 1, seconds: 900 },
    ]);
    assert.deepEqual(sumTotals(totals), { visits: 1, seconds: 2100 });
  });

  test('a range is today or the last seven days', () => {
    const from = new Date(2026, 9, 3);
    assert.deepEqual(rangeDays('today', from), ['2026-10-03']);
    assert.equal(rangeDays('week', from).length, 7);
    assert.equal(rangeDays('week', from)[0], '2026-09-27');
    assert.deepEqual(lastDays(2, from), ['2026-10-02', '2026-10-03']);
  });
});

describe('quotes', () => {
  test('every quote has words and a name', () => {
    QUOTES.forEach((quote) => {
      assert.ok(quote.text.length > 10, quote.text);
      assert.ok(quote.author, quote.text);
    });
  });

  test('any number picks a quote', () => {
    assert.equal(quoteFor(0), QUOTES[0]);
    assert.equal(quoteFor(QUOTES.length), QUOTES[0]);
    assert.ok(quoteFor(-3.7));
    assert.ok(quoteFor(NaN));
  });
});
