import { el } from './util.js';

/** Shared shell for the dashboard widgets. */
export function card({ title, actions = [], className = '' }) {
  const body = el('div', { class: 'card-body' });
  const actionBar = el('div', { class: 'card-actions' }, ...actions);
  const head = el(
    'div',
    { class: 'card-head' },
    el('span', { class: 'card-title', text: title }),
    actionBar
  );
  const root = el('section', { class: `card ${className}`.trim() }, head, body);
  return { root, head, body, actionBar };
}

export function cardButton(text, title, onClick) {
  return el('button', { type: 'button', class: 'card-btn', text, title, onClick });
}
