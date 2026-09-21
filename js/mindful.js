// Time you would rather not lose. Sites on the watch list get a short pause
// before they open, with the count for today, so the visit is a choice and
// not a reflex. Everything is counted on this device only.

import { settings, getVisitLog, saveVisitLog } from './storage.js';
import { el, hostOf } from './util.js';
import { addVisit, limitState, matchHost, ordinal, statsFor, formatMinutes } from './timelog.js';

export {
  addSeconds,
  addVisit,
  dayKey,
  formatMinutes,
  limitState,
  matchHost,
  normalizeHost,
  ordinal,
  prune,
  statsFor,
  trend,
} from './timelog.js';

const QUESTIONS = [
  'What do you want from this visit?',
  'Is this the thing you meant to do?',
  'What were you doing before this?',
  'How long is this worth?',
  'Will this still matter in an hour?',
];

/** The watched site an address belongs to, or `null`. Subdomains count. */
export function watchedFor(url, sites = []) {
  const host = matchHost(
    hostOf(url) || url,
    sites.map((site) => site.host)
  );
  return sites.find((site) => site.host === host) ?? null;
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
    const count = el('span', { class: 'mind-count', text: left ? String(left) : '' });
    const ring = el('div', { class: 'mind-ring' }, count);

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
    let limitLine = '';
    if (state === 'over' && site.limitVisits) {
      limitLine = `You set yourself ${site.limitVisits} a day.`;
    } else if (state === 'over' && site.limitMinutes) {
      limitLine = `You set yourself ${site.limitMinutes} minutes a day.`;
    }

    const panel = el(
      'div',
      { class: `mind-panel${state === 'over' ? ' over' : ''}` },
      ring,
      el('h2', { class: 'mind-host', text: site.host }),
      el('p', { class: 'mind-sum', text: pauseSummary(stats) }),
      limitLine ? el('p', { class: 'mind-limit', text: limitLine }) : null,
      el('p', {
        class: 'mind-question',
        text: question ?? QUESTIONS[stats.visits % QUESTIONS.length],
      }),
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
