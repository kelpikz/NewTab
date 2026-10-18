// End-to-end checks against the real page, driven through jsdom.
// Run `npm install` first; without jsdom these are skipped.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage, jsdomAvailable } from './helpers/page.js';

const skip = (await jsdomAvailable()) ? false : 'jsdom is not installed';

describe('new tab page', { skip }, () => {
  let page;

  before(async () => {
    page = await loadPage();
  });

  after(() => page?.dispose());

  const openWidget = (label) =>
    page.click(page.$$('.widget-tab').find((tab) => tab.textContent === label));

  const holder = (key) => page.$(`.widget-holder[data-widget="${key}"]`);
  const shown = (key) => holder(key).hidden === false;

  test('renders every widget', () => {
    assert.match(page.text('.clock-time'), /^\d{2}:\d{2}$/);
    assert.match(page.text('.clock-line'), /Good (morning|afternoon|evening|night)/);
    assert.ok(page.$('.focus-empty'), 'daily focus prompt');
    assert.ok(page.$('.search-input'), 'search bar');
    assert.equal(page.$$('.engine-menu-item').length, 3);
    assert.equal(page.$$('.ql-grid .quicklink').length, 5, 'four links plus the add tile');
    assert.ok(page.$('.task-input'), 'task input');
    assert.ok(page.$('.habit-input'), 'habit input');
    assert.ok(page.$('.countdown-input'), 'countdown input');
    assert.ok(page.$('.notes-area'), 'notes');
    assert.equal(page.$$('#routines .rw-row').length, 2);
    assert.equal(page.text('.timer-time'), '25:00');
  });

  test('falls back to a gradient when the photo cannot be fetched', () => {
    assert.match(page.$('#background').style.backgroundImage, /linear-gradient/);
  });

  test('adds, edits and completes a task', async () => {
    const input = page.$('.task-input');
    input.value = 'Write the README';
    await page.press('Enter', { target: '.task-input' });

    assert.equal(page.$$('.task').length, 1);
    assert.equal(page.text('.task-text'), 'Write the README');

    await page.click('.task-check');
    assert.ok(page.$('.task.done'));
    assert.ok(page.$$('.card-btn').some((node) => node.textContent === 'Clear done'));

    await page.click(page.$$('.card-btn').find((node) => node.textContent === 'Clear done'));
    assert.equal(page.$$('.task').length, 0);
  });

  test('adds a habit, ticks today and counts the run', async () => {
    await openWidget('Habits');
    assert.equal(shown('habits'), true);
    const input = page.$('.habit-input');
    input.value = 'Read';
    await page.press('Enter', { target: '.habit-input' });

    assert.equal(page.$$('.habit').length, 1);
    assert.equal(page.text('.habit-name'), 'Read');
    assert.equal(page.$$('.habit-dot').length, 7);
    // The heading uses the same grid as a row, so the letters line up.
    assert.equal(page.$$('.habit-scale .habit-dots > *').length, 7);
    assert.equal(page.text('.habit-streak'), '–');

    await page.click(page.$$('.habit-dot').at(-1));
    assert.equal(page.text('.habit-streak'), '1');
    assert.ok(page.$('.habit.done-today'));
    assert.match(page.text('.card-habits .card-title'), /1\/1/);

    await page.click('.habit-remove');
    assert.equal(page.$$('.habit').length, 0);
  });

  test('adds a countdown and says how far off it is', async () => {
    await openWidget('Countdowns');
    const name = page.$('.countdown-input');
    const date = page.$('.countdown-date-input');
    const soon = new Date();
    soon.setDate(soon.getDate() + 3);
    const pad = (value) => String(value).padStart(2, '0');
    name.value = 'Trip';
    // Built from the local parts: toISOString() would shift the day.
    date.value = `${soon.getFullYear()}-${pad(soon.getMonth() + 1)}-${pad(soon.getDate())}`;
    await page.press('Enter', { target: '.countdown-input' });

    assert.equal(page.$$('.countdown').length, 1);
    assert.equal(page.text('.countdown-name'), 'Trip');
    assert.equal(page.text('.countdown-days'), 'in 3 days');

    await page.click('.countdown-remove');
    assert.equal(page.$$('.countdown').length, 0);
  });

  test('the deck shows one widget at a time', async () => {
    assert.deepEqual(
      page.$$('.widget-tab').map((tab) => tab.textContent),
      ['Tasks', 'Habits', 'Countdowns', 'Time', 'Calendar', 'Notes', 'Routines']
    );
    assert.equal(page.$$('.widget-holder:not([hidden])').length, 1);

    await openWidget('Notes');
    assert.equal(shown('notes'), true);
    assert.equal(shown('tasks'), false);
    assert.equal(page.$$('.widget-tab.active')[0].textContent, 'Notes');

    // "W" steps to the next tab; "T" jumps straight back to the tasks card.
    await page.press('w');
    assert.equal(shown('routines'), true);
    await page.press('w');
    assert.equal(shown('tasks'), true, 'the tabs wrap around');
    await page.press('t');
    await page.press('t');
    assert.equal(shown('tasks'), true);
  });

  test('a watched site pauses before it opens', async () => {
    await openWidget('Time');
    const watch = page.$('.st-input');
    watch.value = 'example.com';
    await page.press('Enter', { target: '.st-input' });
    assert.equal(page.text('.st-host'), 'example.com');

    // The palette offers the address; opening it must not leave the page yet.
    await page.press('k', { ctrlKey: true });
    await page.fill('.pal-input', 'example.com');
    await page.click(page.$$('.pal-row')[0]);
    await page.wait(150);

    assert.ok(page.$('.mind-scrim'), 'the pause is shown');
    assert.equal(page.text('.mind-host'), 'example.com');
    assert.equal(page.text('.mind-sum'), '1st visit today');
    assert.equal(page.$('.mind-go').disabled, true, 'opening waits a few seconds');

    await page.click(page.$$('.mind-actions .btn').find((b) => b.textContent === 'Not now'));
    assert.equal(page.$('.mind-scrim'), null, 'the pause is gone');
    assert.equal(page.text('.st-stat'), '0 visits', 'a visit you did not make is not counted');

    await page.click('.st-remove');
    await page.wait(150);
  });

  test('a watched site can ask for a sentence, or stay closed', async () => {
    await openWidget('Time');
    page.$('.st-input').value = 'example.com';
    await page.press('Enter', { target: '.st-input' });

    const setMode = async (mode) => {
      await page.click('#settings-button');
      await page.click(page.$$('.set-tab').find((tab) => tab.textContent === 'Time'));
      assert.equal(page.text('.watch-host'), 'example.com');
      await page.change('.watch-row .set-select', mode);
      await page.click('#close-settings');
    };
    const open = async () => {
      await page.press('k', { ctrlKey: true });
      await page.fill('.pal-input', 'example.com');
      await page.click(page.$$('.pal-row')[0]);
      await page.wait(150);
    };
    const button = (text) => page.$$('.mind-actions .btn').find((b) => b.textContent === text);

    await setMode('type');
    await open();
    assert.equal(page.text('.mind-phrase'), 'I should not be doing this');
    assert.equal(page.$('.mind-go').disabled, true, 'the way is shut until you type');
    await page.fill('.mind-entry', 'i should not be doing this.');
    assert.equal(page.$('.mind-go').disabled, false, 'the sentence opens the way');
    await page.click(button('Not now'));
    assert.equal(page.$('.mind-scrim'), null);

    await setMode('block');
    await open();
    assert.equal(page.$('.mind-go'), null, 'a blocked site has no way in');
    await page.click(button('Go back'));
    assert.equal(page.$('.mind-scrim'), null);

    await openWidget('Time');
    await page.click(page.$$('.card-screentime .card-btn').find((b) => b.textContent === 'All'));
    assert.match(page.text('.card-screentime .card-empty'), /Count every site/);
    await page.click(page.$$('.card-screentime .card-btn').find((b) => b.textContent === 'Watched'));

    await page.click('.st-remove');
    await page.wait(150);
  });

  test('a card can be dragged into a rail and back', async () => {
    assert.equal(page.$('#rail-right').hidden, true, 'a rail with nothing in it is not shown');

    await page.drag(holder('calendar'), '#rail-right');
    assert.ok(page.$('#rail-right').contains(holder('calendar')), 'the card moved');
    assert.equal(page.$('#rail-right').hidden, false);
    assert.equal(shown('calendar'), true, 'a card in a rail is always on show');
    assert.ok(
      !page.$$('.widget-tab').some((tab) => tab.textContent === 'Calendar'),
      'it no longer needs a tab'
    );

    const stored = JSON.parse(page.window.localStorage.getItem('newtab:sync:settings'));
    assert.equal(stored.widgetPlacement.calendar, 'right');

    await page.drag(holder('calendar'), '#widgets');
    assert.ok(page.$('#widgets').contains(holder('calendar')), 'and back to the middle');
    assert.equal(page.$('#rail-right').hidden, true);
    await openWidget('Tasks');
  });

  test('saves notes while typing', async () => {
    await openWidget('Notes');
    await page.fill('.notes-area', 'buy coffee');
    await page.wait(600);
    assert.equal(page.window.localStorage.getItem('newtab:local:notes'), '"buy coffee"');
  });

  test('sets and clears the daily focus', async () => {
    await page.click('.focus-empty');
    const input = page.$('.focus-input');
    input.value = 'Ship v2';
    input.dispatchEvent(new page.window.FocusEvent('blur'));
    await page.wait(150);
    assert.equal(page.text('.focus-text'), 'Ship v2');

    await page.click('.focus-clear');
    assert.ok(page.$('.focus-empty'));
  });

  test('the command palette opens, filters and closes', async () => {
    await page.press('k', { ctrlKey: true });
    assert.ok(page.$('.pal-scrim').classList.contains('open'));
    assert.ok(page.$$('.pal-row').length > 0);

    await page.fill('.pal-input', 'claude');
    const titles = page.$$('.pal-title').map((node) => node.textContent);
    assert.ok(titles.includes('Claude'), titles.join(' | '));
    assert.ok(
      page.$$('.pal-group').some((node) => node.textContent === 'Search'),
      'offers a web search'
    );

    await page.press('ArrowDown', { target: '.pal-input' });
    assert.equal(page.$$('.pal-row.selected').length, 1);

    await page.press('Escape', { target: '.pal-input' });
    assert.ok(!page.$('.pal-scrim').classList.contains('open'));
  });

  test('a typed address offers to open it', async () => {
    await page.press('k', { ctrlKey: true });
    await page.fill('.pal-input', 'example.com/path');
    assert.equal(page.text('.pal-title'), 'Open https://example.com/path');
    await page.press('Escape', { target: '.pal-input' });
  });

  test('the palette works out a sum and a conversion', async () => {
    await page.press('k', { ctrlKey: true });
    await page.fill('.pal-input', '24 * 7');
    assert.equal(page.text('.pal-group'), 'Answer');
    assert.equal(page.text('.pal-title'), '168');

    await page.fill('.pal-input', '10 km in miles');
    assert.equal(page.text('.pal-title'), '6.2137119 mi');
    await page.press('Escape', { target: '.pal-input' });
  });

  test('the palette turns what you typed into a task', async () => {
    await page.press('k', { ctrlKey: true });
    await page.fill('.pal-input', 'call the plumber');
    const row = page.$$('.pal-row').find((node) => node.textContent.includes('Add task'));
    assert.ok(row, 'an add-task row is offered');
    // It sits under its own heading, below anything the words actually match.
    assert.ok(page.$$('.pal-group').some((node) => node.textContent === 'Keep it'));

    await page.click(row);
    await page.wait(200);
    assert.ok(
      page.$$('.task-text').some((node) => node.textContent === 'call the plumber'),
      'the task was added'
    );

    await page.click(page.$$('.task').at(-1).querySelector('.task-remove'));
  });

  test('the search bar suggests matching links', async () => {
    await page.fill('.search-input', 'hn');
    assert.ok(page.$('.suggest-list').classList.contains('open'));
    assert.equal(page.text('.suggest-title'), 'HN');
    await page.fill('.search-input', '');
    assert.ok(!page.$('.suggest-list').classList.contains('open'));
  });

  test('the guide lists every feature and every shortcut', async () => {
    await page.press('?');
    assert.equal(page.$('#shortcuts-dialog').open, true);
    assert.equal(page.$$('.shortcut-row').length, 10);
    assert.ok(page.$$('.guide-group').length >= 5, 'the feature groups are listed');
    assert.ok(page.$$('.guide-row').length >= 20, 'every feature has a line');
    assert.ok(
      page.$$('.guide-name').some((node) => node.textContent === 'Instant answers'),
      'a feature added later is in the guide'
    );
    await page.press('Escape');
    assert.equal(page.$('#shortcuts-dialog').open, false);
  });

  test('a site can be added through the dialog', async () => {
    await page.click('.quicklink-add');
    assert.equal(page.$('#add-site-dialog').open, true);
    page.$('#site-name').value = 'Example';
    page.$('#site-url').value = 'https://example.com';
    page.$('#add-site-form').dispatchEvent(
      new page.window.Event('submit', { bubbles: true, cancelable: true })
    );
    await page.wait(200);
    assert.equal(page.$$('.ql-grid .quicklink').length, 6);
    assert.ok(page.$$('.quicklink-name').some((node) => node.textContent === 'Example'));
  });

  test('settings switch theme and hide widgets', async () => {
    await page.click('#settings-button');
    assert.equal(page.$('#settings-dialog').open, true);
    assert.equal(page.$$('.set-tab').length, 6);

    await page.click(page.$$('.set-tab').find((tab) => tab.textContent === 'Appearance'));
    await page.change('#settings-panel .set-select', 'light');
    assert.equal(page.document.documentElement.dataset.theme, 'light');

    await page.click(page.$$('.set-tab').find((tab) => tab.textContent === 'Widgets'));
    const settingRow = (label) =>
      page.$$('.set-row').find((r) => r.textContent.startsWith(label));
    // "All at once" lays every card out, so the tabs are not needed.
    await page.change(settingRow('Widget layout').querySelector('select'), 'grid');
    assert.equal(page.$('#widget-tabs').hidden, true);
    const notesToggle = settingRow('Notes');
    await page.click(notesToggle.querySelector('input'));
    await page.wait(200);
    assert.equal(shown('notes'), false);
    assert.equal(
      page.window.getComputedStyle(holder('notes')).display,
      'none',
      'hidden must beat the author display rule'
    );

    await page.click(notesToggle.querySelector('input'));
    await page.wait(200);
    assert.equal(shown('notes'), true);
    assert.notEqual(page.window.getComputedStyle(holder('notes')).display, 'none');

    await page.change(settingRow('Widget layout').querySelector('select'), 'deck');
    await page.wait(200);
    assert.equal(page.$('#widget-tabs').hidden, false);
    await page.click('#close-settings');
  });

  test('a moving scene takes the place of the picture and gives it back', async () => {
    await page.click('#settings-button');
    await page.click(page.$$('.set-tab').find((tab) => tab.textContent === 'Appearance'));
    const settingRow = (label) => page.$$('.set-row').find((r) => r.textContent.startsWith(label));
    assert.ok(settingRow('Source'));
    assert.equal(settingRow('Scene'), undefined);

    await page.click(settingRow('Animated').querySelector('input'));
    await page.wait(200);
    assert.equal(page.$$('#background canvas.scene').length, 1);
    assert.equal(settingRow('Source'), undefined, 'the source does not apply to a scene');

    await page.change(settingRow('Look').querySelector('select'), 'pixel');
    await page.wait(150);
    assert.ok(page.$('#background canvas.scene.scene-pixel'));

    await page.click(settingRow('Animated').querySelector('input'));
    await page.wait(200);
    assert.equal(page.$('#background canvas.scene'), null);
    assert.match(page.$('#background').style.backgroundImage, /linear-gradient/);
    assert.ok(settingRow('Source'));
    await page.click('#close-settings');
  });

  test('a search engine can be added', async () => {
    await page.click('#settings-button');
    await page.click(page.$$('.set-tab').find((tab) => tab.textContent === 'Search'));
    await page.wait(200);
    const before = page.$$('.engine-row').length;
    await page.click(page.$$('#settings-panel .btn').find((b) => b.textContent === 'Add engine'));
    await page.wait(250);
    assert.equal(page.$$('.engine-row').length, before + 1);
    await page.click('#close-settings');
    await page.wait(200);
    assert.equal(page.$$('.engine-menu-item').length, 4);
  });

  test('the guide opens by itself the first time only', async () => {
    const first = await loadPage();
    assert.equal(first.$('#shortcuts-dialog').open, true, 'shown on a fresh profile');
    const settings = JSON.parse(first.window.localStorage.getItem('newtab:sync:settings'));
    assert.equal(settings.seenGuide, true);
    first.dispose();

    const again = await loadPage({ seed: { sync: { settings } } });
    assert.equal(again.$('#shortcuts-dialog').open, false, 'not shown again');
    again.dispose();
  });

  test('nothing threw along the way', () => {
    assert.deepEqual(page.errors, []);
  });
});
