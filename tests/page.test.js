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
    const input = page.$('.habit-input');
    input.value = 'Read';
    await page.press('Enter', { target: '.habit-input' });

    assert.equal(page.$$('.habit').length, 1);
    assert.equal(page.text('.habit-name'), 'Read');
    assert.equal(page.$$('.habit-dot').length, 7);
    assert.equal(page.text('.habit-streak'), '–');

    await page.click(page.$$('.habit-dot').at(-1));
    assert.equal(page.text('.habit-streak'), '1');
    assert.ok(page.$('.habit.done-today'));
    assert.match(page.text('.card-habits .card-title'), /1\/1/);

    await page.click('.habit-remove');
    assert.equal(page.$$('.habit').length, 0);
  });

  test('adds a countdown and says how far off it is', async () => {
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

  test('saves notes while typing', async () => {
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

  test('the search bar suggests matching links', async () => {
    await page.fill('.search-input', 'hn');
    assert.ok(page.$('.suggest-list').classList.contains('open'));
    assert.equal(page.text('.suggest-title'), 'HN');
    await page.fill('.search-input', '');
    assert.ok(!page.$('.suggest-list').classList.contains('open'));
  });

  test('the shortcut sheet lists every shortcut', async () => {
    await page.press('?');
    assert.equal(page.$('#shortcuts-dialog').open, true);
    assert.equal(page.$$('.shortcut-row').length, 9);
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
    assert.equal(page.$$('.set-tab').length, 5);

    await page.click(page.$$('.set-tab').find((tab) => tab.textContent === 'Appearance'));
    await page.change('#settings-panel .set-select', 'light');
    assert.equal(page.document.documentElement.dataset.theme, 'light');

    await page.click(page.$$('.set-tab').find((tab) => tab.textContent === 'Widgets'));
    const notesToggle = page.$$('.set-row').find((r) => r.textContent.startsWith('Notes'));
    await page.click(notesToggle.querySelector('input'));
    await page.wait(200);
    assert.equal(page.$('#notes').hidden, true);
    assert.equal(page.displayOf('#notes'), 'none', 'hidden must beat the author display rule');

    await page.click(notesToggle.querySelector('input'));
    await page.wait(200);
    assert.equal(page.$('#notes').hidden, false);
    assert.notEqual(page.displayOf('#notes'), 'none');

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

  test('nothing threw along the way', () => {
    assert.deepEqual(page.errors, []);
  });
});
