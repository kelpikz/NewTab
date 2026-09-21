// The calendar widget against a stubbed .ics feed.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage, jsdomAvailable } from './helpers/page.js';

const skip = (await jsdomAvailable()) ? false : 'jsdom is not installed';

const pad = (n) => String(n).padStart(2, '0');
const stamp = (date) =>
  `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(
    date.getHours()
  )}${pad(date.getMinutes())}00`;

const at = (hoursFromNow) => {
  const date = new Date();
  date.setMinutes(0, 0, 0);
  date.setHours(date.getHours() + hoursFromNow);
  return date;
};

// Built around the moment the test runs, so it is always "today".
const FEED = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'BEGIN:VEVENT',
  'UID:1',
  'SUMMARY:Design review',
  'LOCATION:Room 2',
  `DTSTART:${stamp(at(2))}`,
  `DTEND:${stamp(at(3))}`,
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:2',
  'SUMMARY:Cancelled thing',
  `DTSTART:${stamp(at(4))}`,
  'STATUS:CANCELLED',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:3',
  'SUMMARY:Stand-up',
  `DTSTART:${stamp(at(1))}`,
  `DTEND:${stamp(at(1))}`,
  'RRULE:FREQ=DAILY',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

const FEED_URL = 'https://calendar.google.com/calendar/ical/x/basic.ics';

describe('calendar widget', { skip }, () => {
  let page;
  const requests = [];

  before(async () => {
    page = await loadPage({
      seed: { local: { calendarFeed: FEED_URL } },
      fetchImpl: async (url) => {
        requests.push(String(url));
        if (!String(url).includes('calendar.google.com')) throw new Error('offline');
        return { ok: true, text: async () => FEED, json: async () => ({}) };
      },
    });
    await page.click(page.$$('.widget-tab').find((tab) => tab.textContent === 'Calendar'));
    await page.wait(200);
  });

  after(() => page?.dispose());

  test('fetches the address that was saved', () => {
    assert.ok(requests.includes(FEED_URL));
  });

  test('lists what is coming, soonest first', () => {
    const titles = page.$$('.cal-title').map((node) => node.textContent);
    assert.deepEqual(titles.slice(0, 2), ['Stand-up', 'Design review']);
    assert.ok(!titles.includes('Cancelled thing'), 'a cancelled event is left out');
    assert.equal(page.text('.cal-day'), 'Today');
    assert.match(page.text('.cal-time'), /^\d{2}:\d{2}$/);
    assert.ok(
      page.$$('.cal-where').some((node) => node.textContent === 'Room 2'),
      'the place is shown'
    );
  });

  test('the repeat shows again tomorrow', () => {
    const days = page.$$('.cal-day').map((node) => node.textContent);
    assert.ok(days.includes('Tomorrow'), `expected a Tomorrow heading, got ${days.join(', ')}`);
  });

  test('the feed is read from the cache, not fetched again', async () => {
    const before = requests.filter((url) => url === FEED_URL).length;
    await page.click(page.$$('.widget-tab').find((tab) => tab.textContent === 'Tasks'));
    await page.click(page.$$('.widget-tab').find((tab) => tab.textContent === 'Calendar'));
    await page.wait(200);
    assert.equal(requests.filter((url) => url === FEED_URL).length, before);
  });

  test('nothing threw along the way', () => {
    assert.deepEqual(page.errors, []);
  });
});
