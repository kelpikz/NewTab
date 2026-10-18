// Counts the time you spend on sites, and stands in front of the ones you
// asked it to watch. Nothing else.
//
// Counting runs only when "Count every site" is on and Chrome has given the
// tabs permission. The gate in other tabs runs only with the webNavigation
// permission as well. Nothing ever leaves this device.
//
// Chrome stops this worker whenever it likes, so no time is held in memory:
// the host being counted and the moment it started are written to storage,
// and every event closes off the slice that came before it.

import {
  addSeconds,
  addVisit,
  dayKey,
  gateAddress,
  gateFor,
  hostKey,
  shouldTimeOut,
  siteFor,
  statsFor,
  PASSES_KEY,
} from './js/timelog.js';

const STATE_KEY = 'trackState';
const LOG_KEY = 'visitLog';
// Session: the host each tab is on, so a visit is counted once per arrival.
const TABS_KEY = 'tabHosts';
const TICK = 'newtab-time-tick';
const GATE_PAGE = chrome.runtime.getURL('gate.html');

// A slice longer than this means the machine slept or the worker was idle,
// so it is capped rather than counted.
const MAX_SLICE_SECONDS = 150;
// No key or mouse for this long means you are away, unless a tab plays sound.
const AWAY_SECONDS = 60;

// Each job reads storage, changes it and writes it back. Two jobs at once
// could lose a change, so they run one after the other.
let queue = Promise.resolve();
function serial(job) {
  const run = queue.then(job);
  queue = run.catch(() => {});
  return run;
}

async function mindful() {
  const { settings } = await chrome.storage.sync.get('settings');
  return settings?.mindful ?? {};
}

async function sessionValue(key) {
  return (await chrome.storage.session.get(key))[key] ?? {};
}

/** The tab in front of you, or null when Chrome is not the focused app. */
async function frontTab() {
  try {
    const window = await chrome.windows.getLastFocused();
    if (!window?.focused) return null;
    const [tab] = await chrome.tabs.query({ active: true, windowId: window.id });
    return tab ?? null;
  } catch {
    return null;
  }
}

async function away(tab) {
  if (tab.audible || !chrome.idle) return false;
  try {
    return (await chrome.idle.queryState(AWAY_SECONDS)) !== 'active';
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Time                                                                */
/* ------------------------------------------------------------------ */

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

/** Send the tab to the time-out page once the site's minutes are used up. */
async function timeOut(tab, config, now) {
  if (!config.enabled) return;
  const site = siteFor(tab.url, config.sites ?? []);
  if (!site) return;
  const { [LOG_KEY]: log = {} } = await chrome.storage.local.get(LOG_KEY);
  const passes = await sessionValue(PASSES_KEY);
  const stats = statsFor(log, site.host, dayKey(new Date(now)));
  if (!shouldTimeOut(site, stats, passes[tab.id], now)) return;
  await chrome.tabs.update(tab.id, { url: gateAddress(GATE_PAGE, tab.url, 'timeout') });
}

/** Close off the last slice and start one for whatever is in front now. */
async function retarget() {
  const now = Date.now();
  await flush(now);
  const config = await mindful();
  const tab = config.track ? await frontTab() : null;
  const host = tab && !(await away(tab)) ? hostKey(tab.url, config.sites ?? []) : null;
  await chrome.storage.local.set({ [STATE_KEY]: host ? { host, since: now } : null });
  if (host) await timeOut(tab, config, now);
}

/** Count a visit when a tab arrives on a new site, and drop a pass it left. */
async function arrive(tabId, url) {
  if (url.startsWith(GATE_PAGE)) return;
  const config = await mindful();
  const host = hostKey(url, config.sites ?? []);

  const passes = await sessionValue(PASSES_KEY);
  if (passes[tabId] && passes[tabId].host !== host) {
    delete passes[tabId];
    await chrome.storage.session.set({ [PASSES_KEY]: passes });
  }

  if (!config.track) return;
  const hosts = await sessionValue(TABS_KEY);
  if (hosts[tabId] === host) return;
  if (host) hosts[tabId] = host;
  else delete hosts[tabId];
  await chrome.storage.session.set({ [TABS_KEY]: hosts });
  if (!host) return;
  const { [LOG_KEY]: log = {} } = await chrome.storage.local.get(LOG_KEY);
  await chrome.storage.local.set({ [LOG_KEY]: addVisit(log, host, dayKey()) });
}

async function forget(tabId) {
  sent.delete(tabId);
  const [passes, hosts] = await Promise.all([sessionValue(PASSES_KEY), sessionValue(TABS_KEY)]);
  delete passes[tabId];
  delete hosts[tabId];
  await chrome.storage.session.set({ [PASSES_KEY]: passes, [TABS_KEY]: hosts });
}

/* ------------------------------------------------------------------ */
/* The gate                                                            */
/* ------------------------------------------------------------------ */

// Both navigation events can report the same visit; send the tab once.
const sent = new Map();

/** Stop a watched site before it loads and show the gate page instead. */
async function guard(tabId, url) {
  if (tabId < 0 || url.startsWith(GATE_PAGE)) return;
  if (!(await chrome.permissions.contains({ permissions: ['webNavigation'] }))) return;
  const config = await mindful();
  const passes = await sessionValue(PASSES_KEY);
  if (!gateFor(url, config, passes[tabId])) return;
  const last = sent.get(tabId);
  if (last?.url === url && Date.now() - last.at < 3000) return;
  sent.set(tabId, { url, at: Date.now() });
  await chrome.tabs.update(tabId, { url: gateAddress(GATE_PAGE, url, 'visit') });
}

let guarding = false;

// An optional API only exists once it is granted, so the listener is added
// at start-up when it can be, and again the moment the permission arrives.
function listenForNavigation() {
  if (guarding || !chrome.webNavigation) return;
  guarding = true;
  chrome.webNavigation.onBeforeNavigate.addListener((details) => {
    if (details.frameId !== 0 || details.documentLifecycle === 'prerender') return;
    serial(() => guard(details.tabId, details.url));
  });
}

/* ------------------------------------------------------------------ */
/* Events                                                              */
/* ------------------------------------------------------------------ */

function start() {
  chrome.alarms.create(TICK, { periodInMinutes: 1 });
  chrome.idle?.setDetectionInterval(AWAY_SECONDS);
  serial(retarget);
}

chrome.runtime.onInstalled.addListener(start);
chrome.runtime.onStartup.addListener(start);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === TICK) serial(retarget);
});

chrome.tabs.onActivated.addListener(() => serial(retarget));
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (!change.url) return;
  serial(async () => {
    // A page that opened without passing the gate, such as a prerendered one.
    await guard(tabId, change.url);
    await arrive(tabId, change.url);
    await retarget();
  });
});
chrome.tabs.onRemoved.addListener((tabId) =>
  serial(async () => {
    await forget(tabId);
    await retarget();
  })
);
chrome.windows.onFocusChanged.addListener(() => serial(retarget));
chrome.idle?.onStateChanged.addListener(() => serial(retarget));
chrome.permissions.onAdded.addListener(listenForNavigation);

// The watch list may have changed, so pick the target up again.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.settings) serial(retarget);
});

listenForNavigation();
chrome.idle?.setDetectionInterval(AWAY_SECONDS);

// A wake-up with no alarm set (first run after an update) still needs one.
chrome.alarms.get(TICK).then((alarm) => {
  if (!alarm) start();
});
