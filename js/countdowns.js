// Dates you are counting towards: a trip, a release, a birthday. Each one
// shows how many days are left, and drops to the bottom once it has passed.

import { getCountdowns, saveCountdowns } from './storage.js';
import { el, todayKey } from './util.js';
import { card } from './card.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Whole days from today to `dateKey`. Negative once the day has passed. */
export function daysUntil(dateKey, from = new Date()) {
  const target = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  return Math.round((target - today) / MS_PER_DAY);
}

/** Plain words for a day count. */
export function daysLabel(days) {
  if (days === null) return '';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  if (days > 0) return `in ${days} days`;
  return `${Math.abs(days)} days ago`;
}

/** Soonest first, with days already past at the end. */
export function sortByDate(countdowns, from = new Date()) {
  return countdowns.slice().sort((a, b) => {
    const left = daysUntil(a.date, from) ?? 0;
    const right = daysUntil(b.date, from) ?? 0;
    if (left >= 0 && right < 0) return -1;
    if (left < 0 && right >= 0) return 1;
    return left >= 0 ? left - right : right - left;
  });
}

function niceDate(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function countdownRow(item, today, onRemove) {
  const days = daysUntil(item.date, today);
  const past = days !== null && days < 0;
  return el(
    'li',
    { class: 'countdown' + (past ? ' past' : '') + (days === 0 ? ' now' : '') },
    el(
      'span',
      { class: 'countdown-text' },
      el('span', { class: 'countdown-name', text: item.name }),
      el('span', { class: 'countdown-date', text: niceDate(item.date) })
    ),
    el('span', { class: 'countdown-days', text: daysLabel(days) }),
    el('button', {
      type: 'button',
      class: 'countdown-remove',
      text: '✕',
      'aria-label': `Delete ${item.name}`,
      onClick: () => onRemove(item),
    })
  );
}

export async function renderCountdowns(container) {
  const countdowns = await getCountdowns();
  const rerender = () => renderCountdowns(container);
  const now = new Date();

  const { root, body } = card({ title: 'Countdowns', className: 'card-countdowns' });

  if (countdowns.length) {
    const list = el('ul', { class: 'countdown-list' });
    sortByDate(countdowns, now).forEach((item) =>
      list.appendChild(
        countdownRow(item, now, async (target) => {
          await saveCountdowns(countdowns.filter((entry) => entry.id !== target.id));
          rerender();
        })
      )
    );
    body.appendChild(list);
  } else {
    body.appendChild(el('p', { class: 'card-empty', text: 'Count down to a day.' }));
  }

  const nameInput = el('input', {
    class: 'countdown-input',
    type: 'text',
    placeholder: 'Add a day',
    'aria-label': 'What are you counting down to',
    maxLength: 40,
  });
  const dateInput = el('input', {
    class: 'countdown-date-input',
    type: 'date',
    value: todayKey(),
    'aria-label': 'The day',
  });

  const add = async () => {
    const name = nameInput.value.trim();
    if (!name || !dateInput.value) return;
    countdowns.push({ id: crypto.randomUUID(), name, date: dateInput.value });
    await saveCountdowns(countdowns);
    await renderCountdowns(container);
    container.querySelector('.countdown-input')?.focus();
  };

  nameInput.addEventListener('keydown', (event) => event.key === 'Enter' && add());
  dateInput.addEventListener('keydown', (event) => event.key === 'Enter' && add());

  body.appendChild(el('div', { class: 'countdown-add' }, nameInput, dateInput));
  container.replaceChildren(root);
}
