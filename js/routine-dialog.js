import { getRoutines, saveRoutines } from './storage.js';

const dialog = document.getElementById('routine-dialog');
const form = document.getElementById('routine-form');
const title = document.getElementById('routine-dialog-title');
const nameInput = document.getElementById('routine-name');
const urlsInput = document.getElementById('routine-urls');
const deleteBtn = document.getElementById('delete-routine');
const cancelBtn = document.getElementById('cancel-routine');

let editIndex = null;
let onChangeCallback = () => {};

function parseUrls(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

form.addEventListener('submit', async () => {
  const routines = await getRoutines();
  const routine = { name: nameInput.value.trim(), urls: parseUrls(urlsInput.value) };
  if (editIndex === null) {
    routines.push(routine);
  } else {
    routines[editIndex] = routine;
  }
  await saveRoutines(routines);
  onChangeCallback();
});

deleteBtn.addEventListener('click', async () => {
  const routines = await getRoutines();
  routines.splice(editIndex, 1);
  await saveRoutines(routines);
  dialog.close();
  onChangeCallback();
});

cancelBtn.addEventListener('click', () => dialog.close());

export function initRoutineDialog(onChange) {
  onChangeCallback = onChange;
}

export function openRoutineDialog(routine = null, index = null) {
  editIndex = index;
  title.textContent = routine ? 'Edit routine' : 'New routine';
  nameInput.value = routine?.name ?? '';
  urlsInput.value = routine?.urls.join('\n') ?? '';
  deleteBtn.style.display = routine ? 'inline-block' : 'none';
  dialog.showModal();
  nameInput.focus();
}
