import {
  getGroups,
  getActiveGroupId,
  setActiveGroupId,
  removeLink,
  reorderGroup,
  reorderLink,
  moveLinkToGroup,
} from './storage.js';
import { el, faviconNode } from './util.js';
import { openUrl } from './platform.js';

let dragData = null;
let lastRender = null;

function makeDropTarget(node, { accepts, onDrop }) {
  node.addEventListener('dragover', (event) => {
    if (dragData && accepts(dragData)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      node.classList.add('drag-over');
    }
  });
  node.addEventListener('dragleave', () => node.classList.remove('drag-over'));
  node.addEventListener('drop', (event) => {
    node.classList.remove('drag-over');
    if (dragData && accepts(dragData)) {
      event.preventDefault();
      onDrop(dragData);
    }
  });
}

function makeDraggable(node, getData) {
  node.draggable = true;
  node.addEventListener('dragstart', (event) => {
    dragData = getData();
    event.dataTransfer.effectAllowed = 'move';
    node.classList.add('dragging');
  });
  node.addEventListener('dragend', () => {
    dragData = null;
    node.classList.remove('dragging');
  });
}

function tileAction({ className, text, title, onClick }) {
  return el('button', {
    type: 'button',
    class: className,
    text,
    title,
    'aria-label': title,
    onClick: (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick();
    },
  });
}

function createLinkTile(link, index, groupId, { onEdit, onRemove, onReorder }) {
  const tile = el('a', { class: 'quicklink', href: link.url, title: link.url });

  makeDraggable(tile, () => ({ type: 'link', groupId, index }));
  makeDropTarget(tile, {
    accepts: (data) => data.type === 'link' && !(data.groupId === groupId && data.index === index),
    onDrop: (data) => onReorder(data.index, index),
  });

  const icon = el('div', { class: 'quicklink-icon' }, faviconNode(link.url, link.name, 32));

  tile.append(
    icon,
    el('span', { class: 'quicklink-name', text: link.name }),
    index < 9 ? el('span', { class: 'quicklink-index', text: String(index + 1) }) : null,
    tileAction({
      className: 'quicklink-action quicklink-edit',
      text: '✎',
      title: `Edit ${link.name}`,
      onClick: () => onEdit(link, index, groupId),
    }),
    tileAction({
      className: 'quicklink-action quicklink-remove',
      text: '✕',
      title: `Remove ${link.name}`,
      onClick: () => onRemove(index, groupId),
    })
  );
  return tile;
}

function createAddTile(groupId, onAdd) {
  return el(
    'div',
    {
      class: 'quicklink quicklink-add',
      role: 'button',
      tabIndex: 0,
      title: 'Add a site',
      onClick: () => onAdd(groupId),
      onKeydown: (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onAdd(groupId);
        }
      },
    },
    el('div', { class: 'quicklink-icon' }, el('span', { class: 'add-icon', text: '+' })),
    el('span', { class: 'quicklink-name', text: 'Add site' })
  );
}

function createTab(group, isActive, { onSelect, onEditGroup, onDropOnTab }) {
  const tab = el('button', {
    type: 'button',
    class: 'ql-tab' + (isActive ? ' active' : ''),
    'aria-current': isActive ? 'true' : 'false',
    onClick: () => onSelect(group.id),
  });

  makeDraggable(tab, () => ({ type: 'tab', groupId: group.id }));
  makeDropTarget(tab, {
    accepts: (data) => data.groupId !== group.id,
    onDrop: (data) => onDropOnTab(data, group.id),
  });

  tab.append(el('span', { text: group.name }));
  if (isActive) {
    tab.append(
      el('span', {
        class: 'ql-tab-edit',
        text: '✎',
        title: `Edit "${group.name}" tab`,
        onClick: (event) => {
          event.stopPropagation();
          onEditGroup(group);
        },
      })
    );
  }
  return tab;
}

export async function renderQuicklinks(container, handlers) {
  const { onAdd, onEdit, onAddGroup, onEditGroup } = handlers;
  const groups = await getGroups();

  let activeId = await getActiveGroupId();
  if (!groups.some((group) => group.id === activeId)) {
    activeId = groups[0].id;
    await setActiveGroupId(activeId);
  }
  const active = groups.find((group) => group.id === activeId);
  lastRender = { container, handlers, groups, activeId };

  const rerender = () => renderQuicklinks(container, handlers);

  const tabBar = el('div', { class: 'ql-tabs', role: 'tablist' });
  groups.forEach((group) => {
    tabBar.appendChild(
      createTab(group, group.id === activeId, {
        onSelect: async (id) => {
          await setActiveGroupId(id);
          rerender();
        },
        onEditGroup,
        onDropOnTab: async (data, targetGroupId) => {
          if (data.type === 'tab') await reorderGroup(data.groupId, targetGroupId);
          else await moveLinkToGroup(data.groupId, data.index, targetGroupId);
          rerender();
        },
      })
    );
  });
  tabBar.appendChild(
    el('button', {
      type: 'button',
      class: 'ql-tab ql-tab-add',
      text: '+',
      title: 'New tab group',
      onClick: onAddGroup,
    })
  );

  const grid = el('div', { class: 'ql-grid' });
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

/** Move to the previous or next tab group. Used by the keyboard shortcuts. */
export async function cycleGroup(delta) {
  if (!lastRender) return;
  const { groups, activeId, container, handlers } = lastRender;
  if (groups.length < 2) return;
  const current = groups.findIndex((group) => group.id === activeId);
  const next = groups[(current + delta + groups.length) % groups.length];
  await setActiveGroupId(next.id);
  await renderQuicklinks(container, handlers);
}

/** Open the nth quick link of the active group (1-based). */
export async function openQuicklink(position, { newTab = false } = {}) {
  const groups = await getGroups();
  const activeId = (await getActiveGroupId()) ?? groups[0]?.id;
  const active = groups.find((group) => group.id === activeId);
  const link = active?.links[position - 1];
  if (link) openUrl(link.url, { newTab });
}
