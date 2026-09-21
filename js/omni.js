// Collects everything the command palette and the search bar can offer:
// quick links, routines, open tabs, bookmarks, history and top sites.

import { hasApi, hasPermissions } from './platform.js';
import { getGroups, getRoutines } from './storage.js';
import { rank } from './fuzzy.js';
import { loadUsage, boostFor } from './frecency.js';
import { urlKey, hostOf } from './util.js';

export const OPTIONAL_SOURCES = ['tabs', 'bookmarks', 'history', 'topSites'];

const TYPE_BOOST = {
  command: 40,
  link: 34,
  routine: 30,
  tab: 22,
  bookmark: 14,
  top: 10,
  history: 0,
};

export const GROUP_LABEL = {
  answer: 'Answer',
  command: 'Actions',
  link: 'Quick links',
  routine: 'Routines',
  tab: 'Open tabs',
  bookmark: 'Bookmarks',
  top: 'Frequent',
  history: 'History',
  capture: 'Keep it',
  search: 'Search',
};

const GROUP_ORDER = [
  'answer',
  'command',
  'link',
  'routine',
  'tab',
  'bookmark',
  'top',
  'history',
  'capture',
  'search',
];

async function safe(promise, fallback) {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

async function localItems() {
  const [groups, routines] = await Promise.all([getGroups(), getRoutines()]);
  const items = [];
  groups.forEach((group) => {
    group.links.forEach((link) => {
      items.push({
        type: 'link',
        title: link.name,
        subtitle: `${group.name} · ${hostOf(link.url)}`,
        url: link.url,
      });
    });
  });
  routines.forEach((routine, index) => {
    items.push({
      type: 'routine',
      title: routine.name,
      subtitle: `${routine.urls.length} sites`,
      routineIndex: index,
      routine,
    });
  });
  return items;
}

async function tabItems(currentTabId) {
  if (!hasApi('tabs') || !(await hasPermissions(['tabs']))) return [];
  const tabs = await safe(chrome.tabs.query({}), []);
  return tabs
    .filter((tab) => tab.id !== currentTabId && tab.url)
    .map((tab) => ({
      type: 'tab',
      title: tab.title || hostOf(tab.url),
      subtitle: hostOf(tab.url) || tab.url,
      url: tab.url,
      tabId: tab.id,
      windowId: tab.windowId,
    }));
}

async function bookmarkItems(query) {
  if (!hasApi('bookmarks') || !(await hasPermissions(['bookmarks']))) return [];
  const nodes = query
    ? await safe(chrome.bookmarks.search(query), [])
    : await safe(chrome.bookmarks.getRecent(12), []);
  return nodes
    .filter((node) => node.url)
    .slice(0, 40)
    .map((node) => ({
      type: 'bookmark',
      title: node.title || hostOf(node.url),
      subtitle: hostOf(node.url),
      url: node.url,
    }));
}

async function historyItems(query) {
  if (!hasApi('history') || !(await hasPermissions(['history']))) return [];
  const results = await safe(
    chrome.history.search({
      text: query,
      maxResults: 30,
      startTime: Date.now() - 90 * 24 * 60 * 60 * 1000,
    }),
    []
  );
  return results
    .filter((entry) => entry.url)
    .map((entry) => ({
      type: 'history',
      title: entry.title || hostOf(entry.url),
      subtitle: hostOf(entry.url),
      url: entry.url,
      boost: Math.min(18, Math.log2(1 + (entry.visitCount ?? 1)) * 4),
      lastVisit: entry.lastVisitTime ?? 0,
    }));
}

async function topSiteItems() {
  if (!hasApi('topSites') || !(await hasPermissions(['topSites']))) return [];
  const sites = await safe(chrome.topSites.get(), []);
  return sites.slice(0, 12).map((site) => ({
    type: 'top',
    title: site.title || hostOf(site.url),
    subtitle: hostOf(site.url),
    url: site.url,
  }));
}

async function currentTabId() {
  if (!hasApi('tabs') || !chrome.tabs.getCurrent) return null;
  const tab = await safe(chrome.tabs.getCurrent(), null);
  return tab?.id ?? null;
}

/** Drop repeats of the same page, keeping the highest ranked one. */
export function dedupe(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item.url) return true;
    const key = `${item.type === 'tab' ? 'tab:' : ''}${urlKey(item.url)}`;
    const plain = urlKey(item.url);
    if (seen.has(key) || seen.has(plain)) return false;
    seen.add(key);
    seen.add(plain);
    return true;
  });
}

/**
 * Rank every candidate against the query.
 * `commands` are palette actions; pass an empty list for the search bar.
 */
export async function search(query, { commands = [], limit = 24 } = {}) {
  const trimmed = query.trim();
  const [local, tabId, usage] = await Promise.all([localItems(), currentTabId(), loadUsage()]);
  const [tabs, bookmarks, history, top] = await Promise.all([
    tabItems(tabId),
    bookmarkItems(trimmed),
    historyItems(trimmed),
    topSiteItems(),
  ]);

  const pool = [...commands, ...local, ...tabs, ...bookmarks, ...history, ...top];
  // What you picked before for this query counts as much as a good name match.
  const now = Date.now();
  pool.forEach((item) => {
    item.boost = (item.boost ?? 0) + boostFor(usage, item, trimmed, now);
  });

  if (!trimmed) {
    const ordered = pool
      .filter((item) => item.type !== 'command' || item.alwaysShow)
      .map((item) => ({
        item,
        score: (TYPE_BOOST[item.type] ?? 0) + (item.boost ?? 0),
      }))
      .sort((a, b) => b.score - a.score || (b.item.lastVisit ?? 0) - (a.item.lastVisit ?? 0));
    return dedupe(ordered.map((entry) => entry.item)).slice(0, limit);
  }

  const scored = rank(trimmed, pool, (item) => [
    [item.title, 1],
    [item.subtitle ?? '', 0.55],
    [item.url ?? '', 0.45],
    [(item.keywords ?? []).join(' '), 0.7],
  ]);

  const withType = scored
    .map(({ item, score }) => ({ item, score: score + (TYPE_BOOST[item.type] ?? 0) }))
    .sort((a, b) => b.score - a.score);

  return dedupe(withType.map((entry) => entry.item)).slice(0, limit);
}

/** Group ranked results for display, keeping the overall order stable. */
export function groupResults(items) {
  const groups = new Map();
  items.forEach((item) => {
    const list = groups.get(item.type) ?? [];
    list.push(item);
    groups.set(item.type, list);
  });
  return GROUP_ORDER.filter((type) => groups.has(type)).map((type) => ({
    type,
    label: GROUP_LABEL[type] ?? type,
    items: groups.get(type),
  }));
}
