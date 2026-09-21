// A small habit tracker: one row per habit, one dot per day, and the length
// of the run you are on. Tick a dot to mark that day; tick it again to undo.

import { getHabits, saveHabits } from './storage.js';
import { el, todayKey } from './util.js';
import { card } from './card.js';

const WINDOW = 7; // dots shown for each habit
const KEEP_DAYS = 180; // how far back the record is kept

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The last `count` day keys, oldest first, ending today. */
export function recentDays(count = WINDOW, from = new Date()) {
  const days = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const date = new Date(from);
    date.setDate(date.getDate() - i);
    days.push(todayKey(date));
  }
  return days;
}

/**
 * How many days in a row end at today. A habit not yet ticked today keeps
 * yesterday's run, so the number only drops once a day is truly missed.
 */
export function streak(days, from = new Date()) {
  const done = new Set(days);
  const cursor = new Date(from);
  if (!done.has(todayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let count = 0;
  while (done.has(todayKey(cursor))) {
    count += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}

/** Add or remove one day, keeping the record sorted and short. */
export function toggleDay(days, key, limit = KEEP_DAYS) {
  const set = new Set(days ?? []);
  if (set.has(key)) set.delete(key);
  else set.add(key);
  return [...set].sort().slice(-limit);
}

function dayLabel(key) {
  const date = new Date(`${key}T00:00:00`);
  return `${WEEKDAY[date.getDay()]} ${date.getDate()}`;
}

function habitRow(habit, days, today, { onToggle, onRemove, onRename }) {
  const done = new Set(habit.days ?? []);
  const run = streak(habit.days ?? []);

  const dots = days.map((key) =>
    el('button', {
      type: 'button',
      class:
        'habit-dot' + (done.has(key) ? ' on' : '') + (key === today ? ' today' : ''),
      title: `${dayLabel(key)} — ${done.has(key) ? 'done' : 'not done'}`,
      'aria-pressed': done.has(key) ? 'true' : 'false',
      'aria-label': `${habit.name}, ${dayLabel(key)}`,
      onClick: () => onToggle(habit, key),
    })
  );

  return el(
    'li',
    { class: 'habit' + (done.has(today) ? ' done-today' : '') },
    el('span', {
      class: 'habit-name',
      text: habit.name,
      title: 'Click to rename',
      onClick: (event) => onRename(habit, event.currentTarget),
    }),
    el('span', { class: 'habit-dots' }, ...dots),
    el('span', {
      class: 'habit-streak' + (run ? ' lit' : ''),
      text: run ? `${run}` : '–',
      title: run ? `${run} day run` : 'No run yet',
    }),
    el('button', {
      type: 'button',
      class: 'habit-remove',
      text: '✕',
      'aria-label': `Delete ${habit.name}`,
      onClick: () => onRemove(habit),
    })
  );
}

export async function renderHabits(container) {
  const habits = await getHabits();
  const rerender = () => renderHabits(container);
  const today = todayKey();
  const days = recentDays();
  const ticked = habits.filter((habit) => (habit.days ?? []).includes(today)).length;

  const { root, body } = card({
    title: habits.length ? `Habits · ${ticked}/${habits.length}` : 'Habits',
    className: 'card-habits',
  });

  const handlers = {
    onToggle: async (habit, key) => {
      habit.days = toggleDay(habit.days, key);
      await saveHabits(habits);
      rerender();
    },
    onRemove: async (habit) => {
      await saveHabits(habits.filter((item) => item.id !== habit.id));
      rerender();
    },
    onRename: (habit, node) => {
      const input = el('input', {
        class: 'habit-edit',
        type: 'text',
        value: habit.name,
        maxLength: 40,
        'aria-label': 'Rename habit',
      });
      const commit = async () => {
        const name = input.value.trim();
        if (!name) {
          await saveHabits(habits.filter((item) => item.id !== habit.id));
        } else if (name !== habit.name) {
          habit.name = name;
          await saveHabits(habits);
        }
        rerender();
      };
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') input.blur();
        if (event.key === 'Escape') {
          event.stopPropagation();
          rerender();
        }
      });
      input.addEventListener('blur', commit);
      node.replaceWith(input);
      input.focus();
      input.select();
    },
  };

  if (habits.length) {
    body.appendChild(
      el(
        'div',
        { class: 'habit-scale' },
        ...days.map((key) =>
          el('span', {
            class: 'habit-scale-day' + (key === today ? ' today' : ''),
            text: dayLabel(key).charAt(0),
            title: dayLabel(key),
          })
        )
      )
    );
    const list = el('ul', { class: 'habit-list' });
    habits.forEach((habit) => list.appendChild(habitRow(habit, days, today, handlers)));
    body.appendChild(list);
  } else {
    body.appendChild(el('p', { class: 'card-empty', text: 'Track something daily.' }));
  }

  const input = el('input', {
    class: 'habit-input',
    type: 'text',
    placeholder: 'Add a habit',
    'aria-label': 'Add a habit',
    maxLength: 40,
  });
  input.addEventListener('keydown', async (event) => {
    if (event.key !== 'Enter') return;
    const name = input.value.trim();
    if (!name) return;
    habits.push({ id: crypto.randomUUID(), name, days: [], created: Date.now() });
    await saveHabits(habits);
    await renderHabits(container);
    container.querySelector('.habit-input')?.focus();
  });

  body.appendChild(
    el('div', { class: 'habit-add' }, el('span', { class: 'habit-add-plus', text: '+' }), input)
  );
  container.replaceChildren(root);
  return { focus: () => container.querySelector('.habit-input')?.focus() };
}
