// The page the worker puts in front of a watched site, from any tab. It
// shows the same gate as the new tab, then lets the site open or sends you
// back. A pass in session storage tells the worker to let this tab in.

import { loadSettings, settings, getVisitLog, saveVisitLog, getPasses, savePasses } from './storage.js';
import { currentTabId, extensionUrl } from './platform.js';
import { gatePanel } from './mindful.js';
import { applyTheme } from './theme.js';
import { addVisit, readGateAddress, siteFor, statsFor, SNOOZE_MS } from './timelog.js';
import { el } from './util.js';

const root = document.getElementById('gate');

async function setPass(tabId, pass) {
  if (tabId === null) return;
  const passes = await getPasses();
  if (pass) passes[tabId] = pass;
  else delete passes[tabId];
  await savePasses(passes);
}

async function enter(tabId, site, request, config) {
  await setPass(tabId, { host: site.host, until: Date.now() + SNOOZE_MS });
  // When every site is counted, the worker counts the visit as it opens.
  if (request.kind === 'visit' && !config.track) {
    await saveVisitLog(addVisit(await getVisitLog(), site.host));
  }
  location.replace(request.url);
}

async function leave(tabId, request) {
  await setPass(tabId, null);
  // After a time-out, the page before this one is the site itself.
  if (request.kind === 'visit' && history.length > 1) history.back();
  else location.replace(extensionUrl('newtab.html') ?? 'newtab.html');
}

async function start() {
  await loadSettings();
  applyTheme();

  const request = readGateAddress(location.search);
  if (!request) {
    root.replaceChildren(el('p', { class: 'mind-note', text: 'There is nothing to open here.' }));
    return;
  }

  const config = settings().mindful;
  const site = siteFor(request.url, config.sites ?? []);
  // The watch list changed since the worker sent you here.
  if (!site || !config.enabled) {
    location.replace(request.url);
    return;
  }

  const tabId = await currentTabId();
  const stats = statsFor(await getVisitLog(), site.host);
  let done = false;
  const finish = (proceed) => {
    if (done) return;
    done = true;
    panel.stop();
    if (proceed) enter(tabId, site, request, config);
    else leave(tabId, request);
  };
  const panel = gatePanel(site, stats, { ...config, kind: request.kind, onDone: finish });

  document.title = request.kind === 'timeout' ? `Time out · ${site.host}` : `Wait · ${site.host}`;
  root.replaceChildren(panel.root);
  panel.focus();
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') finish(false);
  });
}

start();
