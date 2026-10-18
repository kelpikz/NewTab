import { hasApi, openUrl } from './platform.js';
import { allowVisit } from './mindful.js';
import { settings } from './storage.js';

// The new tab page closes, so the group takes its place in the tab strip.
async function openAsGroup(routine) {
  const tabs = [];
  for (const [index, url] of routine.urls.entries()) {
    tabs.push(await chrome.tabs.create({ url, active: index === 0 }));
  }
  try {
    const groupId = await chrome.tabs.group({ tabIds: tabs.map((tab) => tab.id) });
    if (hasApi('tabGroups')) await chrome.tabGroups.update(groupId, { title: routine.name });
  } catch {
    // An old Chrome has no groups; loose tabs are fine.
  }
  const current = await chrome.tabs.getCurrent?.();
  if (current?.id) chrome.tabs.remove(current.id);
}

export async function openRoutine(routine) {
  if (!routine?.urls?.length) return;
  if (settings().routines.open === 'group' && hasApi('tabs')) {
    await openAsGroup(routine);
    return;
  }
  if (hasApi('windows')) {
    chrome.windows.create({ url: routine.urls, focused: true });
    return;
  }
  routine.urls.forEach((url) => window.open(url, '_blank', 'noopener'));
}

async function focusTab(item) {
  if (!hasApi('tabs')) {
    openUrl(item.url);
    return;
  }
  await chrome.tabs.update(item.tabId, { active: true });
  if (hasApi('windows') && item.windowId !== undefined) {
    await chrome.windows.update(item.windowId, { focused: true });
  }
  const current = await chrome.tabs.getCurrent?.();
  if (current?.id) chrome.tabs.remove(current.id);
}

/** Run whatever a palette or suggestion row stands for. */
export async function activate(item, { newTab = false } = {}) {
  if (!item) return;
  if (typeof item.run === 'function') {
    await item.run({ newTab });
    return;
  }
  if (item.type === 'routine') {
    await openRoutine(item.routine);
    return;
  }
  if (item.type === 'tab' && !newTab) {
    await focusTab(item);
    return;
  }
  if (item.url && (await allowVisit(item.url))) openUrl(item.url, { newTab });
}
