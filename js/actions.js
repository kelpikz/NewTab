import { hasApi, openUrl } from './platform.js';
import { allowVisit } from './mindful.js';

export function openRoutine(routine) {
  if (!routine?.urls?.length) return;
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
    openRoutine(item.routine);
    return;
  }
  if (item.type === 'tab' && !newTab) {
    await focusTab(item);
    return;
  }
  if (item.url && (await allowVisit(item.url))) openUrl(item.url, { newTab });
}
