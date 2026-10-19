// Where the widget cards live.
//
// There are three zones: a rail down the left, the middle of the page, and a
// rail down the right. The middle either stacks every card (the grid) or
// shows one at a time behind a row of tabs (the deck). Drag a card by its
// grip to move it between zones or to reorder a rail.
//
// A narrow window has no room for rails, so their cards fall back to the
// middle until there is space again. That is a display decision only; what
// you chose is left alone.

import { el } from './util.js';
import { getActiveWidget, setActiveWidget } from './storage.js';

/** Every widget that can be placed, in the order it ships. */
export const WIDGET_KEYS = [
  'tasks',
  'habits',
  'countdowns',
  'mindful',
  'calendar',
  'notes',
  'routines',
];

export const LABELS = {
  tasks: 'Tasks',
  habits: 'Habits',
  countdowns: 'Countdowns',
  mindful: 'Time',
  calendar: 'Calendar',
  notes: 'Notes',
  routines: 'Routines',
};

export const ZONES = ['left', 'deck', 'right'];

/**
 * Below this the rails would sit on top of the search bar, so they stand
 * down: the middle is about 780px wide, and each rail asks for 290 plus a
 * margin either side.
 */
export const RAIL_MIN_WIDTH = 1440;

/* ------------------------------------------------------------------ */
/* Working out the zones                                               */
/* ------------------------------------------------------------------ */

/** A stored order, with anything new added and anything unknown dropped. */
export function normalizeOrder(order = []) {
  const known = order.filter((key) => WIDGET_KEYS.includes(key));
  return [...known, ...WIDGET_KEYS.filter((key) => !known.includes(key))];
}

/** The widgets of each zone, in order, leaving out the ones turned off. */
export function zonesOf({ order, placement = {}, widgets = {} }) {
  const out = { left: [], deck: [], right: [] };
  normalizeOrder(order)
    .filter((key) => widgets[key])
    .forEach((key) => {
      const zone = ZONES.includes(placement[key]) ? placement[key] : 'deck';
      out[zone].push(key);
    });
  return out;
}

/** Rails need room. Without it their cards go back to the middle. */
export function collapse(zones, width, minWidth = RAIL_MIN_WIDTH) {
  if (width >= minWidth) return zones;
  return { left: [], right: [], deck: [...zones.left, ...zones.deck, ...zones.right] };
}

/** Put one widget in a zone. Returns a new placement. */
export function placeWidget(placement, key, zone) {
  return { ...placement, [key]: ZONES.includes(zone) ? zone : 'deck' };
}

/**
 * Move `key` so it sits just before `before`. With no `before` it goes last.
 * Returns a new order.
 */
export function reorder(order, key, before = null) {
  const list = normalizeOrder(order).filter((item) => item !== key);
  const at = before ? list.indexOf(before) : -1;
  if (at === -1) list.push(key);
  else list.splice(at, 0, key);
  return list;
}

/** The tab to open: the last one used, or the first that is still there. */
export function resolveActive(deck, stored) {
  if (!deck.length) return null;
  return deck.includes(stored) ? stored : deck[0];
}

/** The next or previous tab, wrapping around. */
export function stepWidget(deck, current, step) {
  if (!deck.length) return null;
  const index = deck.indexOf(current);
  return deck[(index + step + deck.length) % deck.length];
}

/* ------------------------------------------------------------------ */
/* Drawing                                                             */
/* ------------------------------------------------------------------ */

let refs = null;
let state = { zones: { left: [], deck: [], right: [] }, active: null, deckMode: true };
let dragKey = null;

const holderOf = (key) => refs?.holders?.[key] ?? null;

function paint() {
  const { zones, active, deckMode } = state;
  WIDGET_KEYS.forEach((key) => {
    const holder = holderOf(key);
    if (!holder) return;
    const inDeck = zones.deck.includes(key);
    const shown = inDeck || zones.left.includes(key) || zones.right.includes(key);
    holder.hidden = !shown || (deckMode && inDeck && key !== active);
  });
  refs?.tabsEl?.querySelectorAll('.widget-tab').forEach((tab) => {
    const on = tab.dataset.widget === active;
    tab.classList.toggle('active', on);
    tab.setAttribute('aria-selected', on ? 'true' : 'false');
    tab.tabIndex = on ? 0 : -1;
  });
}

/** Bring one widget to the front. Does nothing outside the deck. */
export function showWidget(key) {
  if (!state.deckMode || !state.zones.deck.includes(key) || state.active === key) return;
  state.active = key;
  setActiveWidget(key);
  paint();
}

/** Move to the next card in the middle. Used by the keyboard shortcut. */
export function cycleWidget(step = 1) {
  if (!state.deckMode) return;
  showWidget(stepWidget(state.zones.deck, state.active, step));
}

/** The zone a widget is shown in right now, for the settings dialog. */
export function zoneOf(key) {
  if (state.zones.left.includes(key)) return 'left';
  if (state.zones.right.includes(key)) return 'right';
  return 'deck';
}

/* ------------------------------------------------------------------ */
/* Dragging                                                            */
/* ------------------------------------------------------------------ */

function endDrag() {
  const holder = holderOf(dragKey);
  if (holder) {
    holder.draggable = false;
    holder.classList.remove('dragging');
  }
  dragKey = null;
  document.body.classList.remove('arranging');
  document.querySelectorAll('.drop-into').forEach((node) => node.classList.remove('drop-into'));
}

/** Say where a card was dropped, then let main.js save it. */
function drop(zone, before = null) {
  const key = dragKey;
  endDrag();
  if (!key) return;
  refs.onArrange?.({ key, zone, before });
}

function wireHolder(key, holder) {
  const grip = holder.querySelector('.widget-grip');
  // Only the grip starts a drag, so text inside a card stays selectable.
  grip?.addEventListener('mousedown', () => {
    holder.draggable = true;
  });
  grip?.addEventListener('mouseup', () => {
    holder.draggable = false;
  });

  holder.addEventListener('dragstart', (event) => {
    dragKey = key;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', key);
    holder.classList.add('dragging');
    document.body.classList.add('arranging');
  });
  holder.addEventListener('dragend', endDrag);

  holder.addEventListener('dragover', (event) => {
    if (!dragKey || dragKey === key) return;
    event.preventDefault();
    event.stopPropagation();
    holder.classList.add('drop-into');
  });
  holder.addEventListener('dragleave', () => holder.classList.remove('drop-into'));
  holder.addEventListener('drop', (event) => {
    if (!dragKey || dragKey === key) return;
    event.preventDefault();
    event.stopPropagation();
    drop(zoneOf(key), key);
  });
}

function wireZone(node, zone) {
  if (!node) return;
  node.addEventListener('dragover', (event) => {
    if (!dragKey) return;
    event.preventDefault();
    node.classList.add('drop-into');
  });
  node.addEventListener('dragleave', () => node.classList.remove('drop-into'));
  node.addEventListener('drop', (event) => {
    if (!dragKey) return;
    event.preventDefault();
    drop(zone);
  });
}

/**
 * Called once at start-up. `onArrange` is told where a card was dropped;
 * saving it is main.js's job.
 */
export function initLayout(options) {
  refs = options;
  Object.entries(refs.holders).forEach(([key, holder]) => wireHolder(key, holder));
  wireZone(refs.railLeft, 'left');
  wireZone(refs.railRight, 'right');
  wireZone(refs.centreEl, 'deck');
  wireZone(refs.tabsEl, 'deck');
}

/**
 * Put every card holder in its zone and decide what is on show. The cards
 * can load before or after this; moving a holder keeps whatever is inside it.
 */
export async function applyLayout({ widgets, order, placement, layout, width }) {
  const chosen = zonesOf({ order, placement, widgets });
  const zones = collapse(chosen, width ?? window.innerWidth);
  const deckMode = layout !== 'grid' && zones.deck.length > 1;
  const active = deckMode ? resolveActive(zones.deck, await getActiveWidget()) : null;
  state = { zones, active, deckMode };

  // Rails first, so the middle keeps whatever is left.
  [
    [refs.railLeft, zones.left],
    [refs.railRight, zones.right],
  ].forEach(([rail, keys]) => {
    keys.forEach((key) => rail.appendChild(holderOf(key)));
    rail.hidden = !keys.length;
  });
  zones.deck.forEach((key) => refs.centreEl.appendChild(holderOf(key)));

  refs.centreEl.classList.toggle('deck', deckMode);
  refs.tabsEl.hidden = !deckMode;
  if (deckMode) {
    refs.tabsEl.replaceChildren(
      ...zones.deck.map((key) =>
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
  } else {
    refs.tabsEl.replaceChildren();
  }
  paint();
}
