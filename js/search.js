import { getEngines } from './storage.js';
import { el, faviconNode, debounce, asUrl, copyText, toast } from './util.js';
import { answer } from './answers.js';
import { buildSearchUrl, parsePrefix, engineIconNode } from './engines.js';
import { search as omniSearch } from './omni.js';
import { activate } from './actions.js';
import { recordUse } from './frecency.js';

const MAX_SUGGESTIONS = 7;

function suggestIcon(item) {
  if (item.glyph) return el('span', { class: 'suggest-icon pal-glyph', text: item.glyph });
  if (item.type === 'routine') return el('span', { class: 'suggest-icon pal-glyph', text: '▶' });
  const node = faviconNode(item.url ?? '', item.title, 32);
  node.classList.add('suggest-icon');
  return node;
}

function createEngineDropdown(engines, onSelect) {
  const trigger = el('button', {
    type: 'button',
    class: 'engine-trigger',
    'aria-label': 'Choose search engine',
    'aria-haspopup': 'menu',
  });
  let icon = engineIconNode(engines[0]);
  const caret = el('span', { class: 'engine-caret', text: '▾' });
  trigger.append(icon, caret);

  const menu = el('div', { class: 'engine-menu', role: 'menu' });
  engines.forEach((engine) => {
    menu.appendChild(
      el(
        'button',
        {
          type: 'button',
          class: 'engine-menu-item',
          role: 'menuitem',
          onClick: () => {
            menu.classList.remove('open');
            onSelect(engine);
          },
        },
        engineIconNode(engine),
        el('span', { text: engine.name }),
        engine.prefix ? el('kbd', { class: 'engine-prefix', text: `${engine.prefix}:` }) : null
      )
    );
  });

  trigger.addEventListener('click', (event) => {
    event.stopPropagation();
    menu.classList.toggle('open');
  });

  const closeMenu = () => menu.classList.remove('open');
  document.addEventListener('click', closeMenu);

  return {
    root: el('div', { class: 'engine-dropdown' }, trigger, menu),
    destroy: () => document.removeEventListener('click', closeMenu),
    setEngine(engine) {
      const next = engineIconNode(engine);
      trigger.replaceChild(next, icon);
      icon = next;
      trigger.title = `Search with ${engine.name}`;
    },
  };
}

let destroyPrevious = null;

export async function renderSearchBar(container) {
  destroyPrevious?.();
  const engines = await getEngines();
  let selectedEngine = engines[0];
  let suggestions = [];
  let cursor = -1;
  let token = 0;

  const input = el('textarea', {
    class: 'search-input',
    rows: 1,
    placeholder: 'Search the web, your tabs, or your history…',
    'aria-label': 'Search',
    spellcheck: false,
  });

  const list = el('div', { class: 'suggest-list', role: 'listbox' });
  const dropdown = createEngineDropdown(engines, (engine) => {
    selectedEngine = engine;
    input.focus();
  });

  const autoResize = () => {
    input.style.height = 'auto';
    input.style.height = `${input.scrollHeight}px`;
  };

  const closeList = () => {
    suggestions = [];
    cursor = -1;
    list.replaceChildren();
    list.classList.remove('open');
  };

  const paint = () => {
    list.querySelectorAll('.suggest-row').forEach((row, index) => {
      const active = index === cursor;
      row.classList.toggle('selected', active);
      row.setAttribute('aria-selected', active ? 'true' : 'false');
      if (active) row.scrollIntoView({ block: 'nearest' });
    });
  };

  const move = (delta) => {
    if (!suggestions.length) return;
    cursor += delta;
    if (cursor < -1) cursor = suggestions.length - 1;
    if (cursor >= suggestions.length) cursor = -1;
    paint();
  };

  const choose = (item, options) => {
    recordUse(item, input.value);
    activate(item, options);
  };

  const submit = (event) => {
    if (cursor >= 0 && suggestions[cursor]) {
      choose(suggestions[cursor], { newTab: event?.ctrlKey || event?.metaKey });
      return;
    }
    const { engine, query } = parsePrefix(input.value, engines);
    const text = query.trim();
    if (!text) return;
    const direct = asUrl(text);
    window.location.href = direct ?? buildSearchUrl(engine ?? selectedEngine, text);
  };

  const refresh = async () => {
    const current = (token += 1);
    const { engine, query } = parsePrefix(input.value, engines);
    dropdown.setEngine(engine ?? selectedEngine);
    const text = query.trim();
    if (!text) {
      closeList();
      return;
    }
    const found = await omniSearch(text, { limit: MAX_SUGGESTIONS });
    if (current !== token) return;
    const results = [...answerSuggestion(text), ...found].slice(0, MAX_SUGGESTIONS);
    suggestions = results;
    cursor = -1;
    if (!results.length) {
      closeList();
      return;
    }
    list.replaceChildren(
      ...results.map((item, index) =>
        el(
          'div',
          {
            class: 'suggest-row',
            role: 'option',
            'aria-selected': 'false',
            onMouseenter: () => {
              cursor = index;
              paint();
            },
            onMousedown: (event) => {
              event.preventDefault();
              choose(item, { newTab: event.ctrlKey || event.metaKey });
            },
          },
          suggestIcon(item),
          el(
            'div',
            { class: 'suggest-text' },
            el('span', { class: 'suggest-title', text: item.title }),
            el('span', { class: 'suggest-sub', text: item.subtitle ?? '' })
          ),
          el('span', { class: 'suggest-kind', text: kindLabel(item.type) })
        )
      )
    );
    list.classList.add('open');
  };

  const refreshSoon = debounce(refresh, 120);

  input.addEventListener('input', () => {
    autoResize();
    refreshSoon();
  });
  input.addEventListener('focus', () => {
    if (input.value.trim()) refreshSoon();
  });
  input.addEventListener('blur', () => setTimeout(closeList, 120));
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      move(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      move(-1);
    } else if (event.key === 'Escape') {
      if (suggestions.length) {
        event.stopPropagation();
        closeList();
      }
    } else if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit(event);
    }
  });

  dropdown.setEngine(selectedEngine);
  destroyPrevious = dropdown.destroy;
  container.replaceChildren(el('div', { class: 'search-pill' }, dropdown.root, input), list);
  return { focus: () => input.focus() };
}

/** A sum or a conversion, worked out on this device and offered first. */
function answerSuggestion(query) {
  const result = answer(query);
  if (!result) return [];
  return [
    {
      type: 'answer',
      glyph: '=',
      title: result.title,
      subtitle: result.detail,
      run: async () => {
        const ok = await copyText(result.value);
        toast(ok ? `Copied ${result.value}` : 'Could not copy.');
      },
    },
  ];
}

function kindLabel(type) {
  return (
    {
      answer: 'copy',
      tab: 'tab',
      bookmark: 'bookmark',
      history: 'history',
      link: 'link',
      routine: 'routine',
      top: 'frequent',
    }[type] ?? ''
  );
}
