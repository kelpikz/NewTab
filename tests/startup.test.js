import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage, jsdomAvailable } from './helpers/page.js';

const skip = (await jsdomAvailable()) ? false : 'jsdom is not installed';
const feed = 'https://calendar.google.com/calendar/ical/x/basic.ics';

for (const slow of ['weather', 'calendar', 'both']) {
  test(`widgets stay visible while ${slow} requests are pending`, { skip }, async () => {
    const pending = new Map();
    const page = await loadPage({
      seed: {
        sync: {
          settings: {
            seenGuide: true,
            ...(slow !== 'calendar' && {
              weather: { place: { name: 'Kochi', lat: 9.93, lon: 76.26 } },
            }),
          },
        },
        local: { ...(slow !== 'weather' && { calendarFeed: feed }), activeWidget: 'tasks' },
      },
      fetchImpl: (url) => new Promise((resolve) => pending.set(String(url), resolve)),
    });

    try {
      assert.ok(pending.size >= 2, 'background and widget requests are still pending');
      assert.ok(page.$('.clock-time'), 'the clock has rendered');
      assert.equal(page.$$('.ql-grid .quicklink').length, 5, 'sites have rendered');
      assert.equal(page.window.getComputedStyle(page.$('.content')).opacity, '1');
      assert.equal(page.$('.widget-holder[data-widget="tasks"]').hidden, false);
      assert.equal(page.$$('.widget-tab').length, 7, 'the deck is ready');
      assert.equal(page.$('#shortcuts-dialog').open, false);

      await page.click(page.$$('.widget-tab').find((tab) => tab.textContent === 'Notes'));
      assert.equal(page.$('.widget-holder[data-widget="notes"]').hidden, false);
      await page.press('k', { ctrlKey: true });
      assert.ok(page.$('.pal-scrim').classList.contains('open'), 'shortcuts work');
    } finally {
      // Let every request finish before the page globals are removed.
      pending.forEach((resolve) => resolve({ ok: false }));
      await page.wait(50);
      assert.deepEqual(page.errors, []);
      page.dispose();
    }
  });
}
