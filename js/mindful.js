// Time you would rather not lose. Sites on the watch list get a short pause
// before they open, with the count for today, so the visit is a choice and
// not a reflex. Everything is counted on this device only.

import { settings } from './storage.js';
import { getVisitLog, saveVisitLog } from './storage.js';
import { el, hostOf, todayKey } from './util.js';

const KEEP_DAYS = 60;

const QUESTIONS = [
  'What do you want from this visit?',
  'Is this the thing you meant to do?',
  'What were you doing before this?',
  'How long is this worth?',
  'Will this still matter in an hour?',
];

/* ------------------------------------------------------------------ */
/* The watch list                                                      */
/* ------------------------------------------------------------------ */

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

/** The watched site an address belongs to, or `null`. Subdomains count. */
export function watchedFor(url, sites = []) {
  const host = normalizeHost(hostOf(url) || url);
  if (!host) return null;
  return sites.find((site) => host === site.host || host.endsWith(`.${site.host}`)) ?? null;
}

/* ------------------------------------------------------------------ */
/* The tally                                                           */
/* ------------------------------------------------------------------ */

const EMPTY = { visits: 0, seconds: 0 };

/** What one site added up to on one day. */
export function statsFor(log, host, day = todayKey()) {
  return { ...EMPTY, ...(log?.[day]?.[host] ?? {}) };
}

/** Count one more visit. Returns the new log; old days are dropped. */
export function addVisit(log, host, day = todayKey(), keep = KEEP_DAYS) {
  const next = { ...log, [day]: { ...(log?.[day] ?? {}) } };
  const entry = { ...EMPTY, ...(next[day][host] ?? {}) };
  next[day][host] = { ...entry, visits: entry.visits + 1 };
  return prune(next, keep);
}

/** Add watched seconds to a day, as counted by the background worker. */
export function addSeconds(log, host, seconds, day = todayKey(), keep = KEEP_DAYS) {
  if (!seconds) return log;
  const next = { ...log, [day]: { ...(log?.[day] ?? {}) } };
  const entry = { ...EMPTY, ...(next[day][host] ?? {}) };
  next[day][host] = { ...entry, seconds: Math.round(entry.seconds + seconds) };
  return prune(next, keep);
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
    const day = todayKey(date);
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
  return `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, '0')}m`;
}

/** "1st", "2nd", "3rd", "4th"… */
export function ordinal(n) {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

/** The line under the host name on the pause screen. */
export function pauseSummary(stats) {
  const visit = `${ordinal(stats.visits + 1)} visit today`;
  const time = formatMinutes(stats.seconds);
  return time ? `${visit} · ${time} so far` : visit;
}

/* ------------------------------------------------------------------ */
/* The pause                                                           */
/* ------------------------------------------------------------------ */

let openPause = null;

/** The pause screen. Resolves true to carry on, false to stay here. */
export function pauseScreen(site, stats, { pause = 5, question } = {}) {
  return new Promise((resolve) => {
    openPause?.();

    let left = Math.max(0, Number(pause) || 0);
    const ring = el('div', { class: 'mind-ring' });
    const count = el('span', { class: 'mind-count', text: left ? String(left) : '' });
    ring.append(count);

    const go = el('button', {
      type: 'button',
      class: 'btn btn-secondary mind-go',
      text: left ? `Open in ${left}` : 'Open anyway',
      disabled: left > 0,
      onClick: () => finish(true),
    });

    const stay = el('button', {
      type: 'button',
      class: 'btn btn-primary',
      text: 'Not now',
      onClick: () => finish(false),
    });

    const state = limitState(stats, site);
    const limitLine =
      state === 'over' && site.limitVisits
        ? `You set yourself ${site.limitVisits} a day.`
        : state === 'over' && site.limitMinutes
          ? `You set yourself ${site.limitMinutes} minutes a day.`
          : '';

    const panel = el(
      'div',
      { class: `mind-panel${state === 'over' ? ' over' : ''}` },
      ring,
      el('h2', { class: 'mind-host', text: site.host }),
      el('p', { class: 'mind-sum', text: pauseSummary(stats) }),
      limitLine ? el('p', { class: 'mind-limit', text: limitLine }) : null,
      el('p', { class: 'mind-question', text: question ?? QUESTIONS[stats.visits % QUESTIONS.length] }),
      el('div', { class: 'mind-actions' }, stay, go)
    );

    const root = el('div', { class: 'mind-scrim' }, panel);
    document.body.appendChild(root);
    requestAnimationFrame(() => root.classList.add('open'));
    stay.focus();

    const tick = setInterval(() => {
      left -= 1;
      count.textContent = left > 0 ? String(left) : '';
      go.textContent = left > 0 ? `Open in ${left}` : 'Open anyway';
      if (left <= 0) {
        go.disabled = false;
        clearInterval(tick);
      }
    }, 1000);

    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      event.preventDefault();
      finish(false);
    };
    document.addEventListener('keydown', onKey, true);

    function finish(proceed) {
      clearInterval(tick);
      document.removeEventListener('keydown', onKey, true);
      root.remove();
      openPause = null;
      resolve(proceed);
    }

    openPause = () => finish(false);
  });
}

/* ------------------------------------------------------------------ */
/* The gate                                                            */
/* ------------------------------------------------------------------ */

let onChange = () => {};

/** Told by main.js how to redraw the widget after a visit is counted. */
export function onVisitCounted(fn) {
  onChange = fn ?? (() => {});
}

/**
 * Ask before a watched site opens. `true` means carry on. Every caller that
 * opens a page from this tab goes through here.
 */
export async function allowVisit(url) {
  const config = settings().mindful;
  if (!config?.enabled || !config.sites?.length) return true;
  const site = watchedFor(url, config.sites);
  if (!site) return true;

  const log = await getVisitLog();
  const stats = statsFor(log, site.host);
  const proceed = await pauseScreen(site, stats, config);
  if (!proceed) return false;

  await saveVisitLog(addVisit(log, site.host));
  onChange();
  return true;
}
