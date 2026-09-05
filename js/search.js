import { getEngines } from './storage.js';

function buildSearchUrl(engine, query) {
  return engine.searchUrl.replace('{query}', encodeURIComponent(query));
}

function parsePrefix(rawQuery, engines) {
  const match = rawQuery.match(/^(\S+):\s*(.*)$/s);
  if (match) {
    const engine = engines.find((e) => e.prefix === match[1].toLowerCase());
    if (engine) return { engine, query: match[2] };
  }
  return { engine: null, query: rawQuery };
}

function autoResize(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function createEngineDropdown(engines, onSelect) {
  const wrapper = document.createElement('div');
  wrapper.className = 'engine-dropdown';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'engine-trigger';

  const triggerIcon = document.createElement('img');
  triggerIcon.src = engines[0].icon;
  triggerIcon.alt = engines[0].name;

  const caret = document.createElement('span');
  caret.className = 'engine-caret';
  caret.textContent = '▾';
  trigger.append(triggerIcon, caret);

  const menu = document.createElement('div');
  menu.className = 'engine-menu';
  engines.forEach((engine) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'engine-menu-item';

    const icon = document.createElement('img');
    icon.src = engine.icon;
    icon.alt = '';

    const name = document.createElement('span');
    name.textContent = engine.name;

    item.append(icon, name);
    item.addEventListener('click', () => {
      triggerIcon.src = engine.icon;
      triggerIcon.alt = engine.name;
      menu.classList.remove('open');
      onSelect(engine);
    });
    menu.appendChild(item);
  });

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.toggle('open');
  });
  document.addEventListener('click', () => menu.classList.remove('open'));

  wrapper.append(trigger, menu);
  return {
    root: wrapper,
    setEngine(engine) {
      triggerIcon.src = engine.icon;
      triggerIcon.alt = engine.name;
    },
  };
}

export async function renderSearchBar(container) {
  const engines = await getEngines();
  let selected = engines[0];
  container.replaceChildren();

  const pill = document.createElement('div');
  pill.className = 'search-pill';

  const input = document.createElement('textarea');
  input.className = 'search-input';
  input.rows = 1;
  input.placeholder = 'Ask anything, find anything...';

  const dropdown = createEngineDropdown(engines, (engine) => {
    selected = engine;
    input.focus();
  });

  input.addEventListener('input', () => {
    autoResize(input);
    const { engine } = parsePrefix(input.value, engines);
    dropdown.setEngine(engine ?? selected);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    e.preventDefault();
    const { engine, query } = parsePrefix(input.value, engines);
    if (!query.trim()) return;
    window.location.href = buildSearchUrl(engine ?? selected, query.trim());
  });

  pill.append(dropdown.root, input);
  container.appendChild(pill);
}
