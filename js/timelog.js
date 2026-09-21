// The record of time spent on watched sites: { day: { host: {visits, seconds} } }.
// Pure functions only, and no DOM, because the background worker imports this
// file as well as the page does.

const KEEP_DAYS = 60;
const EMPTY = { visits: 0, seconds: 0 };

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

/** The last `count` days for one site, oldest first. */
export function trend(log, host, count = 7, from = new Date()) {
  const days = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const date = new Date(from);
    date.setDate(date.getDate() - i);
    const day = dayKey(date);
    days.push({ day, ...statsFor(log, host, day) });
  }
  return days;
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
