// Ctrl/Cmd+K command palette: one box for links, tabs, bookmarks,
// history and actions.

import { el, faviconNode, debounce, asUrl, copyText, toast } from './util.js';
import { search, groupResults, OPTIONAL_SOURCES } from './omni.js';
import { answer } from './answers.js';
import { activate } from './actions.js';
import { recordUse } from './frecency.js';
import { getEngines } from './storage.js';
import { buildSearchUrl } from './engines.js';
import { hasPermissions, requestPermissions, openUrl } from './platform.js';

let root = null;
let inputEl = null;
let listEl = null;
let flatItems = [];
let selected = 0;
let isOpen = false;
let queryToken = 0;
let getCommands = () => [];
let engines = [];
let enginesReady = null;

function rowNode(item, index) {
  const row = el('div', {
    class:
      'pal-row' +
      (item.type === 'answer' ? ' pal-answer' : '') +
      (index === selected ? ' selected' : ''),
    role: 'option',
    'aria-selected': index === selected ? 'true' : 'false',
    dataset: { index: String(index) },
    onMouseenter: () => setSelected(index, { scroll: false }),
    onClick: (event) => run(item, { newTab: event.metaKey || event.ctrlKey }),
  });

  const icon = item.glyph
    ? el('span', { class: 'pal-glyph', text: item.glyph })
    : faviconNode(item.url ?? '', item.title, 32);
  icon.classList.add('pal-icon');

  const text = el(
    'div',
    { class: 'pal-text' },
    el('span', { class: 'pal-title', text: item.title }),
    item.subtitle ? el('span', { class: 'pal-subtitle', text: item.subtitle }) : null
  );

  const hint = item.hint ? el('span', { class: 'pal-hint', text: item.hint }) : null;
  row.append(icon, text);
  if (hint) row.append(hint);
  return row;
}

function render(results) {
  if (!results.length) {
    flatItems = [];
    listEl.replaceChildren(el('div', { class: 'pal-empty', text: 'Nothing found' }));
    return;
  }
  // groupResults reorders, so build the flat list from the grouped order.
  const groups = groupResults(results);
  flatItems = groups.flatMap((group) => group.items);
  selected = Math.min(selected, flatItems.length - 1);

  let index = 0;
  const nodes = [];
  groups.forEach((group) => {
    nodes.push(el('div', { class: 'pal-group', text: group.label }));
    group.items.forEach((item) => {
      nodes.push(rowNode(item, index));
      index += 1;
    });
  });
  listEl.replaceChildren(...nodes);
}

function setSelected(index, { scroll = true } = {}) {
  if (!flatItems.length) return;
  selected = (index + flatItems.length) % flatItems.length;
  listEl.querySelectorAll('.pal-row').forEach((row, i) => {
    const active = i === selected;
    row.classList.toggle('selected', active);
    row.setAttribute('aria-selected', active ? 'true' : 'false');
    if (active && scroll) row.scrollIntoView({ block: 'nearest' });
  });
}

async function permissionCommand() {
  const granted = await hasPermissions(OPTIONAL_SOURCES);
  if (granted) return [];
  return [
    {
      type: 'command',
      glyph: '🔍',
      title: 'Turn on tab, bookmark and history search',
      subtitle: 'Asks Chrome for read access. Everything stays on this device.',
      alwaysShow: true,
      keywords: ['permission', 'enable', 'history', 'bookmarks'],
      run: async () => {
        const ok = await requestPermissions(OPTIONAL_SOURCES);
        if (ok) refresh();
      },
      keepOpen: true,
    },
  ];
}

/** A sum or a unit conversion, worked out here and shown above everything. */
export function answerRow(query) {
  const result = answer(query);
  if (!result) return [];
  return [
    {
      type: 'answer',
      glyph: '=',
      title: result.title,
      subtitle: result.detail,
      hint: 'copy',
      run: async () => {
        const ok = await copyText(result.value);
        toast(ok ? `Copied ${result.value}` : 'Could not copy.');
      },
    },
  ];
}

/** The "open this address" row, shown first when the query is a URL. */
function directUrlRow(query) {
  const url = asUrl(query);
  if (!url) return [];
  return [
    {
      type: 'command',
      glyph: '↗',
      title: `Open ${url}`,
      subtitle: 'Go to this address',
      run: ({ newTab } = {}) => openUrl(url, { newTab }),
    },
  ];
}

/** One "search with <engine>" row per engine, shown last. */
function searchRows(query) {
  return engines.map((engine) => ({
    type: 'search',
    glyph: '⌕',
    title: query,
    subtitle: `Search with ${engine.name}`,
    hint: engine.prefix ? `${engine.prefix}:` : '',
    run: ({ newTab } = {}) => openUrl(buildSearchUrl(engine, query), { newTab }),
  }));
}

function ensureEngines() {
  enginesReady ??= getEngines().then((list) => {
    engines = list;
  });
  return enginesReady;
}

/** Call after the engine list is edited so the palette picks it up. */
export function reloadEngines() {
  enginesReady = null;
  ensureEngines();
}

async function refresh() {
  const token = (queryToken += 1);
  const query = inputEl.value;
  await ensureEngines();
  const commands = [...getCommands(), ...(await permissionCommand())];
  const results = await search(query, { commands });
  if (token !== queryToken) return;

  const trimmed = query.trim();
  const extras = trimmed
    ? [...answerRow(trimmed), ...directUrlRow(trimmed), ...searchRows(trimmed)]
    : [];
  render([...extras, ...results]);
  setSelected(0, { scroll: true });
}

const refreshSoon = debounce(refresh, 90);

async function run(item, options) {
  if (!item) return;
  const query = inputEl.value;
  if (!item.keepOpen) close();
  recordUse(item, query);
  await activate(item, options);
}

function onKeyDown(event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    close();
  } else if (event.key === 'ArrowDown') {
    event.preventDefault();
    setSelected(selected + 1);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    setSelected(selected - 1);
  } else if (event.key === 'Enter') {
    event.preventDefault();
    run(flatItems[selected], { newTab: event.metaKey || event.ctrlKey });
  } else if (event.key === 'Tab') {
    event.preventDefault();
    setSelected(selected + (event.shiftKey ? -1 : 1));
  }
}

function build() {
  inputEl = el('input', {
    class: 'pal-input',
    type: 'text',
    placeholder: 'Search links, tabs, history — or type a command',
    autocomplete: 'off',
    spellcheck: false,
    'aria-label': 'Command palette',
    onInput: refreshSoon,
    onKeydown: onKeyDown,
  });

  listEl = el('div', { class: 'pal-list', role: 'listbox' });

  const panel = el(
    'div',
    { class: 'pal-panel', onClick: (event) => event.stopPropagation() },
    el('div', { class: 'pal-head' }, el('span', { class: 'pal-search-glyph', text: '⌕' }), inputEl),
    listEl,
    el(
      'div',
      { class: 'pal-footer' },
      el('span', {}, el('kbd', { text: '↑↓' }), ' move'),
      el('span', {}, el('kbd', { text: '↵' }), ' open'),
      el('span', {}, el('kbd', { text: 'Ctrl' }), '+', el('kbd', { text: '↵' }), ' new tab'),
      el('span', {}, el('kbd', { text: 'Esc' }), ' close')
    )
  );

  root = el('div', { class: 'pal-scrim', onClick: () => close() }, panel);
  document.getElementById('palette-root').appendChild(root);
}

export function initPalette(options = {}) {
  getCommands = options.getCommands ?? (() => []);
  build();
  ensureEngines();
}

export function isPaletteOpen() {
  return isOpen;
}

/**
 * Opens straight away and fills the list afterwards, so a key pressed right
 * after Ctrl+K still lands in the box.
 */
export function openPalette(initialQuery = '') {
  if (!root) return;
  isOpen = true;
  root.classList.add('open');
  inputEl.value = initialQuery;
  inputEl.focus();
  inputEl.select();
  selected = 0;
  refresh();
}

export function close() {
  if (!root) return;
  isOpen = false;
  root.classList.remove('open');
  inputEl.value = '';
  listEl.replaceChildren();
  flatItems = [];
}

export { close as closePalette };
