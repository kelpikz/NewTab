// The record of time spent on sites: { day: { host: {visits, seconds} } }, and
// the rules for the gate in front of watched sites.
// Pure functions only, and no DOM, because the background worker imports this
// file as well as the page does.

const KEEP_DAYS = 60;
const EMPTY = { visits: 0, seconds: 0 };

/** What a watched site does when you open it. */
export const MODES = ['pause', 'type', 'block'];
export const DEFAULT_PHRASE = 'I should not be doing this';

/** Session storage key: tabId -> { host, until }, the tabs you let in. */
export const PASSES_KEY = 'gatePasses';

/** How long "Five more minutes" lasts before the time-out comes back. */
export const SNOOZE_MS = 5 * 60 * 1000;

const pad = (n) => String(n).padStart(2, '0');

/** "2026-09-22" in local time, which is how every day is keyed. */
export function dayKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "https://www.YouTube.com/feed" and "youtube.com" both give "youtube.com". */
export function normalizeHost(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .split('/')[0]
    .split('?')[0]
    .replace(/^www\./, '')
    .replace(/:\d+$/, '');
}

/** The watched host an address belongs to, or `null`. Subdomains count. */
export function matchHost(url, hosts = []) {
  const host = normalizeHost(url);
  if (!host) return null;
  return hosts.find((watched) => host === watched || host.endsWith(`.${watched}`)) ?? null;
}

/** The watched site an address belongs to, or `null`. */
export function siteFor(url, sites = []) {
  const host = matchHost(
    url,
    sites.map((site) => site.host)
  );
  return sites.find((site) => site.host === host) ?? null;
}

/**
 * The name time is counted under: the watched site when there is one, so
 * m.youtube.com adds to youtube.com, else the bare host. `null` for anything
 * that is not a web page.
 */
export function hostKey(url, sites = []) {
  if (!/^https?:\/\//i.test(url ?? '')) return null;
  return siteFor(url, sites)?.host ?? (normalizeHost(url) || null);
}

/** The site's mode, with the old sites (saved before modes) on pause. */
export function modeOf(site) {
  return MODES.includes(site?.mode) ? site.mode : 'pause';
}

/** True when the typed text is the sentence. Case, spaces and end marks do not matter. */
export function phraseMatches(typed, phrase = DEFAULT_PHRASE) {
  const clean = (text) =>
    String(text ?? '')
      .toLowerCase()
      .replace(/[‘’]/g, "'")
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[.!?]+$/, '');
  const want = clean(phrase || DEFAULT_PHRASE);
  return !!want && clean(typed) === want;
}

/**
 * The watched site to stop in front of, or `null` to let the page open.
 * A tab you already let in stays in, except on a blocked site.
 */
export function gateFor(url, config, pass) {
  if (!config?.enabled) return null;
  const site = siteFor(url, config.sites ?? []);
  if (!site) return null;
  if (modeOf(site) !== 'block' && pass?.host === site.host) return null;
  return site;
}

/** True when the minutes for today are used up and no snooze is running. */
export function shouldTimeOut(site, stats, pass, now = Date.now()) {
  const limit = Number(site?.limitMinutes) || 0;
  if (!limit || stats.seconds < limit * 60) return false;
  return !(pass?.host === site.host && pass.until > now);
}

/** The address of the gate page for a site you tried to open. */
export function gateAddress(page, url, kind = 'visit') {
  return `${page}?kind=${kind}&url=${encodeURIComponent(url)}`;
}

/** Read a gate address back: { url, kind }, or null when the url is not a web page. */
export function readGateAddress(search) {
  const params = new URLSearchParams(search);
  const url = params.get('url') ?? '';
  if (!/^https?:\/\//i.test(url)) return null;
  return { url, kind: params.get('kind') === 'timeout' ? 'timeout' : 'visit' };
}

/** What one site added up to on one day. */
export function statsFor(log, host, day = dayKey()) {
  return { ...EMPTY, ...(log?.[day]?.[host] ?? {}) };
}

function withEntry(log, host, day, change, keep) {
  const next = { ...log, [day]: { ...(log?.[day] ?? {}) } };
  next[day][host] = change({ ...EMPTY, ...(next[day][host] ?? {}) });
  return prune(next, keep);
}

/** Count one more visit. Returns a new log; old days are dropped. */
export function addVisit(log, host, day = dayKey(), keep = KEEP_DAYS) {
  return withEntry(log, host, day, (entry) => ({ ...entry, visits: entry.visits + 1 }), keep);
}

/** Add watched seconds to a day, as counted by the background worker. */
export function addSeconds(log, host, seconds, day = dayKey(), keep = KEEP_DAYS) {
  if (!seconds) return log;
  return withEntry(
    log,
    host,
    day,
    (entry) => ({ ...entry, seconds: Math.round(entry.seconds + seconds) }),
    keep
  );
}

export function prune(log, keep = KEEP_DAYS) {
  const days = Object.keys(log).sort();
  if (days.length <= keep) return log;
  return Object.fromEntries(days.slice(-keep).map((day) => [day, log[day]]));
}

/** The keys of the last `count` days, oldest first. */
export function lastDays(count = 7, from = new Date()) {
  const days = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const date = new Date(from);
    date.setDate(date.getDate() - i);
    days.push(dayKey(date));
  }
  return days;
}

/** The last `count` days for one site, oldest first. */
export function trend(log, host, count = 7, from = new Date()) {
  return lastDays(count, from).map((day) => ({ day, ...statsFor(log, host, day) }));
}

/** Every site over the given days, most time first: [{ host, visits, seconds }]. */
export function siteTotals(log, days) {
  const totals = new Map();
  days.forEach((day) => {
    Object.entries(log?.[day] ?? {}).forEach(([host, entry]) => {
      const total = totals.get(host) ?? { host, ...EMPTY };
      total.visits += entry.visits ?? 0;
      total.seconds += entry.seconds ?? 0;
      totals.set(host, total);
    });
  });
  return [...totals.values()].sort((a, b) => b.seconds - a.seconds || b.visits - a.visits);
}

/** How today compares with the limit you set: ok, near or over. */
export function limitState(stats, site) {
  const checks = [
    [site?.limitVisits, stats.visits],
    [site?.limitMinutes, stats.seconds / 60],
  ].filter(([limit]) => Number(limit) > 0);
  if (!checks.length) return 'ok';
  if (checks.some(([limit, value]) => value >= limit)) return 'over';
  if (checks.some(([limit, value]) => value >= limit * 0.7)) return 'near';
  return 'ok';
}

/** "42m", "1h 12m", or "" when nothing has been counted. */
export function formatMinutes(seconds) {
  const total = Math.round((seconds ?? 0) / 60);
  if (!total) return '';
  if (total < 60) return `${total}m`;
  return `${Math.floor(total / 60)}h ${pad(total % 60)}m`;
}

/** "1st", "2nd", "3rd", "4th"… */
export function ordinal(n) {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}
