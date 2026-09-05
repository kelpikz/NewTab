import { getRoutines } from './storage.js';
import { openRoutineDialog } from './routine-dialog.js';

function faviconUrl(siteUrl) {
  const domain = new URL(siteUrl).hostname;
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
}

function openRoutine(routine) {
  chrome.windows.create({ url: routine.urls, focused: true });
}

function createRoutineRow(routine, index) {
  const row = document.createElement('div');
  row.className = 'rw-row rw-row-clickable';
  row.addEventListener('click', () => openRoutine(routine));

  const info = document.createElement('div');
  info.className = 'rw-info';

  const name = document.createElement('span');
  name.className = 'rw-name';
  name.textContent = routine.name;

  const icons = document.createElement('span');
  icons.className = 'rw-icons';
  routine.urls.slice(0, 5).forEach((url) => {
    const img = document.createElement('img');
    img.src = faviconUrl(url);
    img.alt = '';
    icons.appendChild(img);
  });

  info.append(name, icons);

  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'rw-edit';
  edit.textContent = '✎';
  edit.title = `Edit ${routine.name}`;
  edit.addEventListener('click', (e) => {
    e.stopPropagation();
    openRoutineDialog(routine, index);
  });

  const hint = document.createElement('span');
  hint.className = 'rw-hint';
  hint.textContent = '↗';

  row.append(info, edit, hint);
  return row;
}

export async function renderRoutines(container) {
  const routines = await getRoutines();
  container.replaceChildren();

  const widget = document.createElement('div');
  widget.className = 'rw';

  const header = document.createElement('div');
  header.className = 'rw-header';
  const title = document.createElement('span');
  title.textContent = 'Routines';
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'rw-add';
  add.textContent = '+';
  add.title = 'New routine';
  add.addEventListener('click', () => openRoutineDialog());
  header.append(title, add);
  widget.appendChild(header);

  routines.forEach((routine, index) => {
    widget.appendChild(createRoutineRow(routine, index));
  });

  container.appendChild(widget);
}
