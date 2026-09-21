import {
  loadSettings,
  settings,
  updateSettings,
  addLink,
  updateLink,
  removeLink,
  addGroup,
  renameGroup,
  deleteGroup,
  getGroups,
  setActiveGroupId,
  exportData,
} from './storage.js';
import { renderQuicklinks, cycleGroup, openQuicklink } from './quicklinks.js';
import { applyBackground } from './background.js';
import { renderSearchBar } from './search.js';
import { initSettings, openSettings } from './settings.js';
import { renderRoutines } from './routines.js';
import { initRoutineDialog, openRoutineDialog } from './routine-dialog.js';
import { renderClock } from './clock.js';
import { renderDailyFocus } from './focus.js';
import { renderWeather } from './weather.js';
import { renderTasks } from './tasks.js';
import { renderHabits } from './habits.js';
import { renderNotes } from './notes.js';
import { renderTimer } from './timer.js';
import { initPalette, openPalette, reloadEngines } from './palette.js';
import { initShortcuts } from './shortcuts.js';
import { el, toast } from './util.js';
import { currentWindowTabs, requestPermissions } from './platform.js';

const dom = {
  background: document.getElementById('background'),
  credit: document.getElementById('photo-credit'),
  clock: document.getElementById('clock'),
  focus: document.getElementById('daily-focus'),
  search: document.getElementById('search-bar'),
  quicklinks: document.getElementById('quicklinks'),
  tasks: document.getElementById('tasks'),
  habits: document.getElementById('habits'),
  notes: document.getElementById('notes'),
  routines: document.getElementById('routines'),
  widgets: document.getElementById('widgets'),
  weather: document.getElementById('weather'),
  timer: document.getElementById('timer'),
};

let stopClock = null;
let stopTimer = null;
let searchHandle = null;
let notesHandle = null;

/* ------------------------------------------------------------------ */
/* Theme                                                               */
/* ------------------------------------------------------------------ */

function readableInk(hex) {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.6 ? '#101216' : '#ffffff';
}

function applyTheme() {
  const config = settings();
  const auto = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  const theme = config.theme === 'auto' ? auto : config.theme;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.setProperty('--accent', config.accent);
  document.documentElement.style.setProperty('--accent-ink', readableInk(config.accent));
}

/* ------------------------------------------------------------------ */
/* Background                                                          */
/* ------------------------------------------------------------------ */

async function refreshBackground(force = false) {
  const credit = await applyBackground(dom.background, settings(), { force: force === true });
  dom.credit.replaceChildren();
  if (!credit?.author) return;
  dom.credit.append(
    'Photo by ',
    credit.link
      ? el('a', { href: credit.link, target: '_blank', rel: 'noopener', text: credit.author })
      : el('span', { text: credit.author }),
    ' on Unsplash via Picsum'
  );
}

/* ------------------------------------------------------------------ */
/* Widgets                                                             */
/* ------------------------------------------------------------------ */

function show(node, visible) {
  node.hidden = !visible;
}

async function refreshClock() {
  stopClock?.();
  stopClock = null;
  if (!settings().widgets.clock) return;
  stopClock = renderClock(dom.clock, settings());
}

async function refreshTimer() {
  stopTimer?.();
  stopTimer = null;
  if (!settings().widgets.timer) return;
  stopTimer = await renderTimer(dom.timer, settings());
}

async function refreshWeather() {
  if (!settings().widgets.weather) {
    dom.weather.replaceChildren();
    return;
  }
  await renderWeather(dom.weather, settings(), { onConfigure: () => openSettings('widgets') });
}

async function refreshNotes() {
  notesHandle = settings().widgets.notes ? await renderNotes(dom.notes) : null;
}

async function refreshSearch() {
  reloadEngines();
  searchHandle = settings().widgets.search ? await renderSearchBar(dom.search) : null;
}

const quicklinkHandlers = {
  onAdd: (groupId) => openSiteDialog(null, null, groupId),
  onEdit: (link, index, groupId) => openSiteDialog(link, index, groupId),
  onAddGroup: () => openGroupDialog(),
  onEditGroup: (group) => openGroupDialog(group),
};

const rerenderQuicklinks = () => renderQuicklinks(dom.quicklinks, quicklinkHandlers);

/** Show or hide every section, then draw the visible ones. */
async function refreshLayout() {
  const { widgets } = settings();
  show(dom.clock, widgets.clock);
  show(dom.focus, widgets.focus);
  show(dom.search, widgets.search);
  show(dom.quicklinks, widgets.quicklinks);
  show(dom.tasks, widgets.tasks);
  show(dom.habits, widgets.habits);
  show(dom.notes, widgets.notes);
  show(dom.routines, widgets.routines);
  show(dom.weather, widgets.weather);
  show(dom.timer, widgets.timer);
  show(dom.widgets, widgets.tasks || widgets.habits || widgets.notes || widgets.routines);

  await Promise.all([
    refreshClock(),
    widgets.focus ? renderDailyFocus(dom.focus) : null,
    refreshSearch(),
    widgets.quicklinks ? rerenderQuicklinks() : null,
    widgets.tasks ? renderTasks(dom.tasks) : null,
    widgets.habits ? renderHabits(dom.habits) : null,
    refreshNotes(),
    widgets.routines ? renderRoutines(dom.routines) : null,
    refreshWeather(),
    refreshTimer(),
  ]);
}

/* ------------------------------------------------------------------ */
/* Dialogs                                                             */
/* ------------------------------------------------------------------ */

const siteDialog = document.getElementById('add-site-dialog');
const siteForm = document.getElementById('add-site-form');
const siteTitle = document.getElementById('add-site-title');
const siteName = document.getElementById('site-name');
const siteUrl = document.getElementById('site-url');
const siteGroup = document.getElementById('site-group');

const groupDialog = document.getElementById('group-dialog');
const groupForm = document.getElementById('group-form');
const groupTitle = document.getElementById('group-dialog-title');
const groupName = document.getElementById('group-name');
const deleteGroupBtn = document.getElementById('delete-group');

let editLinkIndex = null;
let editLinkGroupId = null;
let editGroupId = null;

async function openSiteDialog(link = null, index = null, groupId = null) {
  editLinkIndex = index;
  editLinkGroupId = groupId;
  siteTitle.textContent = link ? 'Edit site' : 'Add site';
  siteName.value = link?.name ?? '';
  siteUrl.value = link?.url ?? '';

  const groups = await getGroups();
  const target = groupId ?? groups[0]?.id;
  siteGroup.replaceChildren(
    ...groups.map((group) =>
      el('option', { value: group.id, text: group.name, selected: group.id === target })
    )
  );

  siteDialog.showModal();
  siteName.focus();
}

siteForm.addEventListener('submit', async () => {
  const link = { name: siteName.value.trim(), url: siteUrl.value.trim() };
  const targetGroupId = siteGroup.value;
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

document.getElementById('cancel-add').addEventListener('click', () => siteDialog.close());

async function openGroupDialog(group = null) {
  editGroupId = group?.id ?? null;
  groupTitle.textContent = group ? 'Edit tab group' : 'New tab group';
  groupName.value = group?.name ?? '';
  const groups = await getGroups();
  deleteGroupBtn.style.display = group && groups.length > 1 ? '' : 'none';
  groupDialog.showModal();
  groupName.focus();
}

groupForm.addEventListener('submit', async () => {
  const name = groupName.value.trim();
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

document.getElementById('cancel-group').addEventListener('click', () => groupDialog.close());

/* ------------------------------------------------------------------ */
/* Palette commands                                                    */
/* ------------------------------------------------------------------ */

function paletteCommands() {
  const config = settings();
  return [
    {
      type: 'command',
      glyph: '＋',
      title: 'Add a site',
      keywords: ['quicklink', 'new', 'bookmark'],
      run: () => openSiteDialog(),
    },
    {
      type: 'command',
      glyph: '🗂',
      title: 'New tab group',
      keywords: ['category', 'folder'],
      run: () => openGroupDialog(),
    },
    {
      type: 'command',
      glyph: '▶',
      title: 'New routine',
      keywords: ['session', 'open many'],
      run: () => openRoutineDialog(),
    },
    {
      type: 'command',
      glyph: '⇲',
      title: 'Save my open tabs as a routine',
      keywords: ['session', 'snapshot', 'window', 'tabs'],
      run: async () => {
        const granted = await requestPermissions(['tabs']);
        if (!granted) {
          toast('Chrome did not allow tab access.');
          return;
        }
        const tabs = await currentWindowTabs();
        if (!tabs.length) {
          toast('No web pages are open in this window.');
          return;
        }
        openRoutineDialog({
          name: `Session ${new Date().toLocaleDateString()}`,
          urls: tabs.map((tab) => tab.url),
        });
      },
    },
    {
      type: 'command',
      glyph: '🖼',
      title: 'Load a new background photo',
      keywords: ['wallpaper', 'picture'],
      run: () => refreshBackground(true),
    },
    {
      type: 'command',
      glyph: '◐',
      title: config.theme === 'light' ? 'Switch to the dark theme' : 'Switch to the light theme',
      keywords: ['dark', 'light', 'appearance'],
      run: async () => {
        await updateSettings({ theme: config.theme === 'light' ? 'dark' : 'light' });
        applyTheme();
      },
    },
    {
      type: 'command',
      glyph: '⚙',
      title: 'Open settings',
      keywords: ['preferences', 'options'],
      run: () => openSettings(),
    },
    {
      type: 'command',
      glyph: '⌨',
      title: 'Show keyboard shortcuts',
      keywords: ['keys', 'help'],
      run: () => keyboard.toggleHelp(),
    },
    {
      type: 'command',
      glyph: '⭳',
      title: 'Download a backup',
      keywords: ['export', 'save', 'json'],
      run: async () => {
        const payload = await exportData();
        const url = URL.createObjectURL(
          new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
        );
        el('a', { href: url, download: `newtab-backup-${Date.now()}.json` }).click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast('Backup downloaded.');
      },
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Start-up                                                            */
/* ------------------------------------------------------------------ */

let keyboard = { toggleHelp: () => {} };

async function start() {
  await loadSettings();
  applyTheme();
  window
    .matchMedia('(prefers-color-scheme: light)')
    .addEventListener('change', () => settings().theme === 'auto' && applyTheme());

  refreshBackground();

  initRoutineDialog(() => renderRoutines(dom.routines));
  initPalette({ getCommands: paletteCommands });

  initSettings({
    button: document.getElementById('settings-button'),
    dialog: document.getElementById('settings-dialog'),
    tabs: document.getElementById('settings-tabs'),
    panel: document.getElementById('settings-panel'),
    closeBtn: document.getElementById('close-settings'),
    actions: {
      applyTheme,
      refreshBackground,
      refreshLayout,
      refreshClock,
      refreshSearch,
      refreshWeather,
      refreshTimer,
    },
  });

  keyboard = initShortcuts({
    dialog: document.getElementById('shortcuts-dialog'),
    list: document.getElementById('shortcuts-list'),
    closeBtn: document.getElementById('close-shortcuts'),
    handlers: {
      openPalette: () => openPalette(),
      focusSearch: () => (searchHandle && !dom.search.hidden ? searchHandle.focus() : openPalette()),
      openSettings: () => openSettings(),
      toggleHelp: () => keyboard.toggleHelp(),
      cycleGroup,
      openLink: (position, options) => openQuicklink(position, options),
      newPhoto: () => refreshBackground(true),
      focusNotes: () => notesHandle?.focus(),
      focusTasks: () => document.querySelector('.task-input')?.focus(),
    },
  });

  document.getElementById('shortcuts-button').addEventListener('click', () => keyboard.toggleHelp());
  document.getElementById('palette-button').addEventListener('click', () => openPalette());

  await refreshLayout();
  document.body.classList.add('ready');
}

start();
