// The widget area has two shapes. "Grid" lays every card out side by side,
// which is what you want on a tall screen. "Deck" shows one card at a time
// behind a row of tabs, so the page always fits without scrolling.

import { el } from './util.js';
import { getActiveWidget, setActiveWidget } from './storage.js';

/** Widgets the deck can show, in the order the tabs appear. */
export const DECK_WIDGETS = [
  'tasks',
  'habits',
  'countdowns',
  'mindful',
  'calendar',
  'notes',
  'routines',
];

const LABELS = {
  tasks: 'Tasks',
  habits: 'Habits',
  countdowns: 'Countdowns',
  mindful: 'Time',
  calendar: 'Calendar',
  notes: 'Notes',
  routines: 'Routines',
};

/** The widgets that are turned on, in tab order. */
export function enabledWidgets(widgets) {
  return DECK_WIDGETS.filter((key) => widgets[key]);
}

/** The tab to open: the last one used, or the first that is still on. */
export function resolveActive(enabled, stored) {
  if (!enabled.length) return null;
  return enabled.includes(stored) ? stored : enabled[0];
}

/** The next or previous tab, wrapping around. */
export function stepWidget(enabled, current, step) {
  if (!enabled.length) return null;
  const index = enabled.indexOf(current);
  return enabled[(index + step + enabled.length) % enabled.length];
}

let state = { enabled: [], active: null, slots: {}, tabsEl: null, deck: false };

function paint() {
  const { enabled, active, slots, tabsEl, deck } = state;
  DECK_WIDGETS.forEach((key) => {
    const slot = slots[key];
    if (!slot) return;
    const on = enabled.includes(key);
    slot.hidden = !on || (deck && key !== active);
  });
  if (!tabsEl) return;
  tabsEl.querySelectorAll('.widget-tab').forEach((tab) => {
    const on = tab.dataset.widget === active;
    tab.classList.toggle('active', on);
    tab.setAttribute('aria-selected', on ? 'true' : 'false');
    tab.tabIndex = on ? 0 : -1;
  });
}

/** Bring one widget to the front. Does nothing in the grid layout. */
export function showWidget(key) {
  if (!state.deck || !state.enabled.includes(key) || state.active === key) return;
  state.active = key;
  setActiveWidget(key);
  paint();
}

/** Move to the next widget along. Used by the keyboard shortcut. */
export function cycleWidget(step = 1) {
  if (!state.deck) return;
  showWidget(stepWidget(state.enabled, state.active, step));
}

/**
 * Lay the widget area out. Call after the cards have been drawn; switching
 * tabs only shows and hides them, so it stays instant.
 */
export async function applyDeck({ tabsEl, slots, widgets, layout }) {
  const enabled = enabledWidgets(widgets);
  const deck = layout === 'deck' && enabled.length > 1;
  const active = deck ? resolveActive(enabled, await getActiveWidget()) : null;
  state = { enabled, active, slots, tabsEl, deck };

  tabsEl.hidden = !deck;
  if (!deck) {
    tabsEl.replaceChildren();
    paint();
    return;
  }

  tabsEl.replaceChildren(
    ...enabled.map((key) =>
      el('button', {
        type: 'button',
        class: 'widget-tab',
        role: 'tab',
        text: LABELS[key] ?? key,
        dataset: { widget: key },
        onClick: () => showWidget(key),
      })
    )
  );
  paint();
}
