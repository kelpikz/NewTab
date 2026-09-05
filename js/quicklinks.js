import {
  getGroups,
  getActiveGroupId,
  setActiveGroupId,
  removeLink,
  reorderGroup,
  reorderLink,
  moveLinkToGroup,
} from './storage.js';

let dragData = null;

function makeDropTarget(el, { accepts, onDrop }) {
  el.addEventListener('dragover', (e) => {
    if (dragData && accepts(dragData)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      el.classList.add('drag-over');
    }
  });
  el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
  el.addEventListener('drop', (e) => {
    el.classList.remove('drag-over');
    if (dragData && accepts(dragData)) {
      e.preventDefault();
      onDrop(dragData);
    }
  });
}

function makeDraggable(el, getData) {
  el.draggable = true;
  el.addEventListener('dragstart', (e) => {
    dragData = getData();
    e.dataTransfer.effectAllowed = 'move';
    el.classList.add('dragging');
  });
  el.addEventListener('dragend', () => {
    dragData = null;
    el.classList.remove('dragging');
  });
}

const FAVICON_API = 'https://www.google.com/s2/favicons';

function faviconUrl(siteUrl) {
  const domain = new URL(siteUrl).hostname;
  return `${FAVICON_API}?domain=${domain}&sz=64`;
}

function tileAction({ className, text, title, onClick }) {
  const btn = document.createElement('button');
  btn.className = className;
  btn.textContent = text;
  btn.title = title;
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });
  return btn;
}

function createLinkTile(link, index, groupId, { onEdit, onRemove, onReorder }) {
  const tile = document.createElement('a');
  tile.className = 'quicklink';
  tile.href = link.url;

  makeDraggable(tile, () => ({ type: 'link', groupId, index }));
  makeDropTarget(tile, {
    accepts: (d) => d.type === 'link' && !(d.groupId === groupId && d.index === index),
    onDrop: (d) => onReorder(d.index, index),
  });

  const icon = document.createElement('div');
  icon.className = 'quicklink-icon';
  const img = document.createElement('img');
  img.src = faviconUrl(link.url);
  img.alt = link.name;
  icon.appendChild(img);

  const name = document.createElement('span');
  name.className = 'quicklink-name';
  name.textContent = link.name;

  const editBtn = tileAction({
    className: 'quicklink-action quicklink-edit',
    text: '✎',
    title: `Edit ${link.name}`,
    onClick: () => onEdit(link, index, groupId),
  });

  const removeBtn = tileAction({
    className: 'quicklink-action quicklink-remove',
    text: '✕',
    title: `Remove ${link.name}`,
    onClick: () => onRemove(index, groupId),
  });

  tile.append(icon, name, editBtn, removeBtn);
  return tile;
}

function createAddTile(groupId, onAdd) {
  const tile = document.createElement('div');
  tile.className = 'quicklink';
  tile.setAttribute('role', 'button');
  tile.tabIndex = 0;

  const icon = document.createElement('div');
  icon.className = 'quicklink-icon';
  const plus = document.createElement('span');
  plus.className = 'add-icon';
  plus.textContent = '+';
  icon.appendChild(plus);

  const name = document.createElement('span');
  name.className = 'quicklink-name';
  name.textContent = 'Add site';

  tile.append(icon, name);
  tile.addEventListener('click', () => onAdd(groupId));
  return tile;
}

function createTab(group, isActive, { onSelect, onEditGroup, onDropOnTab }) {
  const tab = document.createElement('button');
  tab.type = 'button';
  tab.className = 'ql-tab' + (isActive ? ' active' : '');
  tab.addEventListener('click', () => onSelect(group.id));

  makeDraggable(tab, () => ({ type: 'tab', groupId: group.id }));
  makeDropTarget(tab, {
    accepts: (d) =>
      (d.type === 'tab' && d.groupId !== group.id) ||
      (d.type === 'link' && d.groupId !== group.id),
    onDrop: (d) => onDropOnTab(d, group.id),
  });

  const label = document.createElement('span');
  label.textContent = group.name;
  tab.appendChild(label);

  if (isActive) {
    const edit = document.createElement('span');
    edit.className = 'ql-tab-edit';
    edit.textContent = '✎';
    edit.title = `Edit "${group.name}" tab`;
    edit.addEventListener('click', (e) => {
      e.stopPropagation();
      onEditGroup(group);
    });
    tab.appendChild(edit);
  }

  return tab;
}

function createAddTab(onAddGroup) {
  const tab = document.createElement('button');
  tab.type = 'button';
  tab.className = 'ql-tab ql-tab-add';
  tab.textContent = '+';
  tab.title = 'New tab';
  tab.addEventListener('click', onAddGroup);
  return tab;
}

export async function renderQuicklinks(container, handlers) {
  const { onAdd, onEdit, onAddGroup, onEditGroup } = handlers;
  const groups = await getGroups();

  let activeId = await getActiveGroupId();
  if (!groups.some((g) => g.id === activeId)) {
    activeId = groups[0].id;
    await setActiveGroupId(activeId);
  }
  const active = groups.find((g) => g.id === activeId);

  const rerender = () => renderQuicklinks(container, handlers);

  const tabBar = document.createElement('div');
  tabBar.className = 'ql-tabs';
  groups.forEach((group) => {
    tabBar.appendChild(
      createTab(group, group.id === activeId, {
        onSelect: async (id) => {
          await setActiveGroupId(id);
          rerender();
        },
        onEditGroup,
        onDropOnTab: async (d, targetGroupId) => {
          if (d.type === 'tab') {
            await reorderGroup(d.groupId, targetGroupId);
          } else {
            await moveLinkToGroup(d.groupId, d.index, targetGroupId);
          }
          rerender();
        },
      })
    );
  });
  tabBar.appendChild(createAddTab(onAddGroup));

  const grid = document.createElement('div');
  grid.className = 'ql-grid';

  const tileHandlers = {
    onEdit,
    onRemove: async (index, groupId) => {
      await removeLink(groupId, index);
      rerender();
    },
    onReorder: async (from, to) => {
      await reorderLink(activeId, from, to);
      rerender();
    },
  };

  active.links.forEach((link, index) => {
    grid.appendChild(createLinkTile(link, index, active.id, tileHandlers));
  });
  grid.appendChild(createAddTile(active.id, onAdd));

  container.replaceChildren(tabBar, grid);
}
