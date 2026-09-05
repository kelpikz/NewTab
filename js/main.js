import { renderQuicklinks } from './quicklinks.js';
import {
  addLink,
  updateLink,
  removeLink,
  addGroup,
  renameGroup,
  deleteGroup,
  getGroups,
  setActiveGroupId,
} from './storage.js';
import { applyBackground } from './background.js';
import { renderSearchBar } from './search.js';
import { initSettings } from './settings.js';
import { renderRoutines } from './routines.js';
import { initRoutineDialog } from './routine-dialog.js';

const quicklinksContainer = document.getElementById('quicklinks');
const searchContainer = document.getElementById('search-bar');
const dialog = document.getElementById('add-site-dialog');
const form = document.getElementById('add-site-form');
const dialogTitle = document.getElementById('add-site-title');
const nameInput = document.getElementById('site-name');
const urlInput = document.getElementById('site-url');
const groupSelect = document.getElementById('site-group');
const cancelBtn = document.getElementById('cancel-add');
const credit = document.getElementById('photo-credit');

const groupDialog = document.getElementById('group-dialog');
const groupForm = document.getElementById('group-form');
const groupDialogTitle = document.getElementById('group-dialog-title');
const groupNameInput = document.getElementById('group-name');
const deleteGroupBtn = document.getElementById('delete-group');
const cancelGroupBtn = document.getElementById('cancel-group');

let editLinkIndex = null;
let editLinkGroupId = null;
let editGroupId = null;

const quicklinkHandlers = {
  onAdd: (groupId) => openSiteDialog(null, null, groupId),
  onEdit: (link, index, groupId) => openSiteDialog(link, index, groupId),
  onAddGroup: () => openGroupDialog(),
  onEditGroup: (group) => openGroupDialog(group),
};

const rerenderQuicklinks = () => renderQuicklinks(quicklinksContainer, quicklinkHandlers);

async function openSiteDialog(link = null, index = null, groupId = null) {
  editLinkIndex = index;
  editLinkGroupId = groupId;
  dialogTitle.textContent = link ? 'Edit site' : 'Add site';
  nameInput.value = link?.name ?? '';
  urlInput.value = link?.url ?? '';

  const groups = await getGroups();
  groupSelect.replaceChildren(
    ...groups.map((g) => {
      const option = document.createElement('option');
      option.value = g.id;
      option.textContent = g.name;
      option.selected = g.id === groupId;
      return option;
    })
  );

  dialog.showModal();
  nameInput.focus();
}

form.addEventListener('submit', async () => {
  const link = { name: nameInput.value.trim(), url: urlInput.value.trim() };
  const targetGroupId = groupSelect.value;
  if (editLinkIndex === null) {
    await addLink(targetGroupId, link);
  } else if (targetGroupId === editLinkGroupId) {
    await updateLink(editLinkGroupId, editLinkIndex, link);
  } else {
    await removeLink(editLinkGroupId, editLinkIndex);
    await addLink(targetGroupId, link);
  }
  rerenderQuicklinks();
});

cancelBtn.addEventListener('click', () => dialog.close());

async function openGroupDialog(group = null) {
  editGroupId = group?.id ?? null;
  groupDialogTitle.textContent = group ? 'Edit tab' : 'New tab';
  groupNameInput.value = group?.name ?? '';
  const groups = await getGroups();
  deleteGroupBtn.style.display = group && groups.length > 1 ? '' : 'none';
  groupDialog.showModal();
  groupNameInput.focus();
}

groupForm.addEventListener('submit', async () => {
  const name = groupNameInput.value.trim();
  if (editGroupId === null) {
    const group = await addGroup(name);
    await setActiveGroupId(group.id);
  } else {
    await renameGroup(editGroupId, name);
  }
  rerenderQuicklinks();
});

deleteGroupBtn.addEventListener('click', async () => {
  await deleteGroup(editGroupId);
  groupDialog.close();
  rerenderQuicklinks();
});

cancelGroupBtn.addEventListener('click', () => groupDialog.close());

initSettings({
  button: document.getElementById('settings-button'),
  dialog: document.getElementById('settings-dialog'),
  form: document.getElementById('settings-form'),
  container: document.getElementById('settings-engines'),
  cancelBtn: document.getElementById('cancel-settings'),
  onSave: () => renderSearchBar(searchContainer),
});

const routinesContainer = document.getElementById('routines');

initRoutineDialog(() => renderRoutines(routinesContainer));
renderRoutines(routinesContainer);

applyBackground(document.getElementById('background'));
rerenderQuicklinks();
renderSearchBar(searchContainer);
credit.textContent = 'Photos via picsum.photos';
