import { el, isTypingTarget } from './util.js';
import { renderGuide } from './guide.js';

const mod = (event) => event.ctrlKey || event.metaKey;

/** Every shortcut, used both for handling keys and for the help sheet. */
export function shortcutList(handlers) {
  return [
    {
      keys: ['Ctrl', 'K'],
      label: 'Open the command palette',
      global: true,
      match: (event) => mod(event) && event.key.toLowerCase() === 'k',
      run: () => handlers.openPalette(),
    },
    {
      keys: ['/'],
      label: 'Jump to the search bar',
      match: (event) => event.key === '/' && !mod(event),
      run: () => handlers.focusSearch(),
    },
    {
      keys: ['?'],
      label: 'Show this sheet',
      match: (event) => event.key === '?',
      run: () => handlers.toggleHelp(),
    },
    {
      keys: ['1', '…', '9'],
      label: 'Open a quick link',
      match: (event) => /^[1-9]$/.test(event.key) && !mod(event) && !event.altKey,
      run: (event) => handlers.openLink(Number(event.key), { newTab: event.shiftKey }),
    },
    {
      keys: ['Shift', '←/→'],
      label: 'Switch tab group',
      match: (event) => event.shiftKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight'),
      run: (event) => handlers.cycleGroup(event.key === 'ArrowRight' ? 1 : -1),
    },
    {
      keys: ['B'],
      label: 'Load a new background photo',
      match: (event) => event.key.toLowerCase() === 'b' && !mod(event),
      run: () => handlers.newPhoto(),
    },
    {
      keys: ['N'],
      label: 'Jump to notes',
      match: (event) => event.key.toLowerCase() === 'n' && !mod(event),
      run: () => handlers.focusNotes(),
    },
    {
      keys: ['T'],
      label: 'Add a task',
      match: (event) => event.key.toLowerCase() === 't' && !mod(event),
      run: () => handlers.focusTasks(),
    },
    {
      keys: ['W'],
      label: 'Show the next widget',
      match: (event) => event.key.toLowerCase() === 'w' && !mod(event),
      run: () => handlers.cycleWidget(1),
    },
    {
      keys: [','],
      label: 'Open settings',
      match: (event) => event.key === ',' && !mod(event),
      run: () => handlers.openSettings(),
    },
  ];
}

function keyRow(shortcut) {
  const keys = el('span', { class: 'keys' });
  shortcut.keys.forEach((key, index) => {
    if (index) keys.append(el('span', { class: 'key-plus', text: '+' }));
    keys.append(el('kbd', { text: key }));
  });
  return el('div', { class: 'shortcut-row' }, el('span', { text: shortcut.label }), keys);
}

export function initShortcuts({ dialog, list, guide, closeBtn, handlers }) {
  const shortcuts = shortcutList(handlers);
  list.replaceChildren(...shortcuts.map(keyRow));
  if (guide) renderGuide(guide);
  closeBtn.addEventListener('click', () => dialog.close());

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (dialog.open) dialog.close();
      return;
    }
    if (event.defaultPrevented) return;
    const typing = isTypingTarget(event.target);
    for (const shortcut of shortcuts) {
      if (typing && !shortcut.global) continue;
      if (!shortcut.match(event)) continue;
      event.preventDefault();
      shortcut.run(event);
      return;
    }
  });

  return {
    toggleHelp() {
      if (dialog.open) dialog.close();
      else dialog.showModal();
    },
  };
}
