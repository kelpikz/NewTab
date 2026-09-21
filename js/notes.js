import { getNotes, saveNotes } from './storage.js';
import { el, debounce } from './util.js';
import { card } from './card.js';

/** A scratchpad that saves itself while you type. */
export async function renderNotes(container) {
  const text = await getNotes();
  const status = el('span', { class: 'card-status', text: '' });
  const { root, body, actionBar } = card({ title: 'Notes', className: 'card-notes' });
  actionBar.appendChild(status);

  const area = el('textarea', {
    class: 'notes-area',
    placeholder: 'Jot something down…',
    'aria-label': 'Notes',
    spellcheck: true,
    value: text,
  });

  let hideTimer = null;
  const flash = (message) => {
    status.textContent = message;
    status.classList.add('show');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => status.classList.remove('show'), 1400);
  };

  const persist = debounce(async () => {
    await saveNotes(area.value);
    flash('Saved');
  }, 500);

  area.addEventListener('input', persist);
  area.addEventListener('blur', async () => {
    await saveNotes(area.value);
  });

  body.appendChild(area);
  container.replaceChildren(root);
  return { focus: () => area.focus() };
}
