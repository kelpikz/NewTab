// Counts the minutes spent on watched sites, and nothing else.
//
// It only runs when "Count the minutes" is on and Chrome has given the tabs
// permission. Nothing is stored about any site that is not on your watch
// list, and nothing ever leaves this device.
//
// Chrome stops this worker whenever it likes, so no time is held in memory:
// the host being watched and the moment it started are written to storage,
// and every event closes off the slice that came before it.

import { addSeconds, dayKey, matchHost } from './js/timelog.js';

const STATE_KEY = 'trackState';
const LOG_KEY = 'visitLog';
const TICK = 'newtab-time-tick';

// A slice longer than this means the machine slept or the worker was idle,
// so it is capped rather than counted.
const MAX_SLICE_SECONDS = 150;

async function watchedHosts() {
  const { settings } = await chrome.storage.sync.get('settings');
  const config = settings?.mindful;
  if (!config?.enabled || !config.track) return [];
  return (config.sites ?? []).map((site) => site.host).filter(Boolean);
}

/** The watched host in front of you right now, or null. */
async function focusedHost() {
  const hosts = await watchedHosts();
  if (!hosts.length) return null;
  try {
    const window = await chrome.windows.getLastFocused();
    if (!window?.focused) return null;
    const [tab] = await chrome.tabs.query({ active: true, windowId: window.id });
    // Without the tabs permission the URL is missing, so nothing is counted.
    return tab?.url ? matchHost(tab.url, hosts) : null;
  } catch {
    return null;
  }
}

/** Write the time since the last mark against the host it belongs to. */
async function flush(now) {
  const stored = await chrome.storage.local.get([STATE_KEY, LOG_KEY]);
  const state = stored[STATE_KEY];
  if (!state?.host || !state.since) return;
  const seconds = Math.min(MAX_SLICE_SECONDS, Math.max(0, (now - state.since) / 1000));
  if (seconds < 1) return;
  const log = addSeconds(stored[LOG_KEY] ?? {}, state.host, seconds, dayKey(new Date(now)));
  await chrome.storage.local.set({ [LOG_KEY]: log });
}

/** Close off the last slice and start one for whatever is in front now. */
async function retarget() {
  const now = Date.now();
  await flush(now);
  const host = await focusedHost();
  await chrome.storage.local.set({ [STATE_KEY]: host ? { host, since: now } : null });
}

function start() {
  chrome.alarms.create(TICK, { periodInMinutes: 1 });
  retarget();
}

chrome.runtime.onInstalled.addListener(start);
chrome.runtime.onStartup.addListener(start);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === TICK) retarget();
});

chrome.tabs.onActivated.addListener(() => retarget());
chrome.tabs.onUpdated.addListener((_id, change) => {
  if (change.url) retarget();
});
chrome.tabs.onRemoved.addListener(() => retarget());
chrome.windows.onFocusChanged.addListener(() => retarget());

// The watch list may have changed, so pick the target up again.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.settings) retarget();
});

// A wake-up with no alarm set (first run after an update) still needs one.
chrome.alarms.get(TICK).then((alarm) => {
  if (!alarm) start();
});
