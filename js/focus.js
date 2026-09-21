import { getDailyFocus, saveDailyFocus } from './storage.js';
import { el } from './util.js';

/** One thing to get done today. Clears itself at midnight. */
export async function renderDailyFocus(container) {
  const focus = await getDailyFocus();
  const rerender = () => renderDailyFocus(container);

  const startEditing = () => {
    const input = el('input', {
      class: 'focus-input',
      type: 'text',
      value: focus.text,
      placeholder: 'What is your focus today?',
      'aria-label': 'Focus for today',
      maxLength: 90,
    });
    const commit = async () => {
      const text = input.value.trim();
      if (text === focus.text) {
        rerender();
        return;
      }
      await saveDailyFocus({ text, done: text ? focus.done : false });
      rerender();
    };
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        input.blur();
      } else if (event.key === 'Escape') {
        event.stopPropagation();
        input.value = focus.text;
        input.blur();
      }
    });
    input.addEventListener('blur', commit);
    container.replaceChildren(input);
    input.focus();
    input.select();
  };

  if (!focus.text) {
    container.replaceChildren(
      el('button', {
        type: 'button',
        class: 'focus-empty',
        text: 'What is your focus today?',
        onClick: startEditing,
      })
    );
    return;
  }

  container.replaceChildren(
    el(
      'div',
      { class: 'focus-row' + (focus.done ? ' done' : '') },
      el('button', {
        type: 'button',
        class: 'focus-check',
        text: focus.done ? '✓' : '',
        title: focus.done ? 'Mark as not done' : 'Mark as done',
        'aria-pressed': String(focus.done),
        onClick: async () => {
          await saveDailyFocus({ ...focus, done: !focus.done });
          rerender();
        },
      }),
      el('span', {
        class: 'focus-text',
        text: focus.text,
        title: 'Click to edit',
        onClick: startEditing,
      }),
      el('button', {
        type: 'button',
        class: 'focus-clear',
        text: '✕',
        title: 'Clear focus',
        onClick: async () => {
          await saveDailyFocus({ text: '', done: false });
          rerender();
        },
      })
    )
  );
}
