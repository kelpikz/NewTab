import { getTasks, saveTasks } from './storage.js';
import { el } from './util.js';
import { card, cardButton } from './card.js';

function taskRow(task, { onToggle, onRemove, onEdit }) {
  const text = el('span', {
    class: 'task-text',
    text: task.text,
    title: 'Click to edit',
    onClick: (event) => onEdit(task, event.currentTarget),
  });

  return el(
    'li',
    { class: 'task' + (task.done ? ' done' : '') },
    el('button', {
      type: 'button',
      class: 'task-check',
      text: task.done ? '✓' : '',
      'aria-label': task.done ? `Mark ${task.text} as not done` : `Mark ${task.text} as done`,
      onClick: () => onToggle(task),
    }),
    text,
    el('button', {
      type: 'button',
      class: 'task-remove',
      text: '✕',
      'aria-label': `Delete ${task.text}`,
      onClick: () => onRemove(task),
    })
  );
}

export async function renderTasks(container) {
  const tasks = await getTasks();
  const rerender = () => renderTasks(container);
  const done = tasks.filter((task) => task.done).length;

  const actions = [];
  if (done) {
    actions.push(
      cardButton('Clear done', 'Remove finished tasks', async () => {
        await saveTasks(tasks.filter((task) => !task.done));
        rerender();
      })
    );
  }

  const { root, body } = card({ title: `Tasks${tasks.length ? ` · ${tasks.length - done}` : ''}`, actions, className: 'card-tasks' });

  const handlers = {
    onToggle: async (task) => {
      task.done = !task.done;
      await saveTasks(tasks);
      rerender();
    },
    onRemove: async (task) => {
      await saveTasks(tasks.filter((item) => item.id !== task.id));
      rerender();
    },
    onEdit: (task, node) => {
      const input = el('input', {
        class: 'task-edit',
        type: 'text',
        value: task.text,
        'aria-label': 'Edit task',
      });
      const commit = async () => {
        const text = input.value.trim();
        if (!text) {
          await saveTasks(tasks.filter((item) => item.id !== task.id));
        } else if (text !== task.text) {
          task.text = text;
          await saveTasks(tasks);
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

  if (tasks.length) {
    const list = el('ul', { class: 'task-list' });
    tasks
      .slice()
      .sort((a, b) => Number(a.done) - Number(b.done))
      .forEach((task) => list.appendChild(taskRow(task, handlers)));
    body.appendChild(list);
  } else {
    body.appendChild(el('p', { class: 'card-empty', text: 'Nothing planned yet.' }));
  }

  const input = el('input', {
    class: 'task-input',
    type: 'text',
    placeholder: 'Add a task',
    'aria-label': 'Add a task',
    maxLength: 120,
  });
  input.addEventListener('keydown', async (event) => {
    if (event.key !== 'Enter') return;
    const text = input.value.trim();
    if (!text) return;
    tasks.push({ id: crypto.randomUUID(), text, done: false, created: Date.now() });
    await saveTasks(tasks);
    await renderTasks(container);
    container.querySelector('.task-input')?.focus();
  });

  body.appendChild(el('div', { class: 'task-add' }, el('span', { class: 'task-add-plus', text: '+' }), input));
  container.replaceChildren(root);
}
