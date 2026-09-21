// What is next, read from a calendar feed (an .ics address).
//
// Google Calendar gives one under Settings -> your calendar -> "Secret
// address in iCal format". Nothing is signed in to and no account is linked:
// the page fetches that one address and reads the text.

import { getCalendarFeed, getCalendarCache, saveCalendarCache, settings } from './storage.js';
import { el } from './util.js';
import { card, cardButton } from './card.js';
import { eventsBetween, groupByDay, timeLabel } from './ical.js';

const CACHE_TTL_MS = 15 * 60 * 1000;
const WINDOW_DAYS = 4;
const MAX_ROWS = 8;

/** webcal:// is the same address with a different scheme. */
export function normalizeFeedUrl(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  return text.replace(/^webcal:\/\//i, 'https://');
}

/** The feed text, from the cache when it is fresh enough. */
export async function loadFeed(url, { force = false } = {}) {
  const cached = await getCalendarCache();
  if (!force && cached?.url === url && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.text;
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error('The calendar did not answer.');
  const text = await response.text();
  if (!text.includes('BEGIN:VCALENDAR')) throw new Error('That address is not a calendar feed.');
  await saveCalendarCache({ url, text, fetchedAt: Date.now() });
  return text;
}

function eventRow(event, hour12) {
  const time = timeLabel(event, hour12);
  const now = new Date();
  const running = event.start <= now && event.end > now;
  return el(
    'li',
    { class: 'cal-event' + (running ? ' now' : '') },
    el('span', { class: 'cal-time', text: time || 'All day' }),
    el(
      'span',
      { class: 'cal-text' },
      el('span', { class: 'cal-title', text: event.summary }),
      event.location ? el('span', { class: 'cal-where', text: event.location }) : null
    )
  );
}

export async function renderCalendar(container, { onConfigure } = {}) {
  const config = settings();
  const hour12 = config.clock.format === '12';
  const url = normalizeFeedUrl(await getCalendarFeed());

  const draw = (body, nodes) => body.replaceChildren(...nodes.filter(Boolean));

  if (!url) {
    const { root, body } = card({ title: 'Calendar', className: 'card-calendar' });
    draw(body, [
      el('p', { class: 'card-empty', text: 'Add a calendar address to see what is next.' }),
      el('button', {
        type: 'button',
        class: 'btn btn-secondary cal-connect',
        text: 'Add a calendar',
        onClick: () => onConfigure?.(),
      }),
    ]);
    container.replaceChildren(root);
    return;
  }

  const { root, body } = card({
    title: 'Calendar',
    className: 'card-calendar',
    actions: [
      cardButton('⟳', 'Fetch the calendar again', async () => {
        await renderCalendar(container, { onConfigure, force: true });
      }),
    ],
  });
  body.appendChild(el('p', { class: 'card-empty', text: 'Reading…' }));
  container.replaceChildren(root);

  try {
    const text = await loadFeed(url);
    const from = new Date();
    const to = new Date(from);
    to.setDate(to.getDate() + WINDOW_DAYS);
    const events = eventsBetween(text, from, to).slice(0, MAX_ROWS);

    if (!events.length) {
      draw(body, [el('p', { class: 'card-empty', text: 'Nothing in the next few days.' })]);
      return;
    }

    const nodes = [];
    groupByDay(events, from).forEach((group) => {
      nodes.push(el('div', { class: 'cal-day', text: group.label }));
      const list = el('ul', { class: 'cal-list' });
      group.events.forEach((event) => list.appendChild(eventRow(event, hour12)));
      nodes.push(list);
    });
    draw(body, nodes);
  } catch (error) {
    draw(body, [
      el('p', { class: 'card-empty', text: error.message ?? 'The calendar could not be read.' }),
      el('button', {
        type: 'button',
        class: 'btn btn-secondary cal-connect',
        text: 'Check the address',
        onClick: () => onConfigure?.(),
      }),
    ]);
  }
}
