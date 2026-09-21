import { getRoutines } from './storage.js';
import { openRoutineDialog } from './routine-dialog.js';
import { openRoutine } from './actions.js';
import { el, faviconNode } from './util.js';
import { card, cardButton } from './card.js';

function routineRow(routine, index) {
  const icons = el('span', { class: 'rw-icons' });
  routine.urls.slice(0, 5).forEach((url) => {
    const node = faviconNode(url, '', 32);
    node.classList.add('rw-favicon');
    icons.appendChild(node);
  });
  if (routine.urls.length > 5) {
    icons.appendChild(el('span', { class: 'rw-more', text: `+${routine.urls.length - 5}` }));
  }

  return el(
    'div',
    {
      class: 'rw-row',
      role: 'button',
      tabIndex: 0,
      title: routine.urls.join('\n'),
      onClick: () => openRoutine(routine),
      onKeydown: (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openRoutine(routine);
        }
      },
    },
    el('div', { class: 'rw-info' }, el('span', { class: 'rw-name', text: routine.name }), icons),
    el('button', {
      type: 'button',
      class: 'rw-edit',
      text: '✎',
      title: `Edit ${routine.name}`,
      onClick: (event) => {
        event.stopPropagation();
        openRoutineDialog(routine, index);
      },
    }),
    el('span', { class: 'rw-hint', text: '↗' })
  );
}

export async function renderRoutines(container) {
  const routines = await getRoutines();
  const { root, body } = card({
    title: 'Routines',
    className: 'card-routines',
    actions: [cardButton('+', 'New routine', () => openRoutineDialog())],
  });

  if (!routines.length) {
    body.appendChild(el('p', { class: 'card-empty', text: 'Group sites you open together.' }));
  } else {
    routines.forEach((routine, index) => body.appendChild(routineRow(routine, index)));
  }

  container.replaceChildren(root);
}
