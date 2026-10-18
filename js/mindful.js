// Time you would rather not lose. A watched site waits behind a gate: a short
// pause, a sentence to type, or a wall. The same panel shows on top of this
// tab and, when the worker guards every tab, as a page of its own.
// Everything is counted on this device only.

import { settings, getVisitLog, saveVisitLog } from './storage.js';
import { el, hostOf } from './util.js';
import { hasPermissions } from './platform.js';
import { quoteFor, QUOTES } from './quotes.js';
import {
  addVisit,
  limitState,
  matchHost,
  modeOf,
  ordinal,
  phraseMatches,
  statsFor,
  formatMinutes,
  DEFAULT_PHRASE,
} from './timelog.js';

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

/** With these, the background worker guards watched sites in every tab. */
export const GUARD_PERMISSIONS = ['tabs', 'webNavigation'];

export function guardsEverywhere() {
  return hasPermissions(GUARD_PERMISSIONS);
}

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

/** The line about the limit you set, or '' when you are not past it. */
export function limitLine(stats, site) {
  if (limitState(stats, site) !== 'over') return '';
  const minutesOver = site.limitMinutes > 0 && stats.seconds >= site.limitMinutes * 60;
  if (minutesOver) return `You set yourself ${site.limitMinutes} minutes a day.`;
  if (site.limitVisits) return `You set yourself ${site.limitVisits} visits a day.`;
  return '';
}

/* ------------------------------------------------------------------ */
/* The panel                                                           */
/* ------------------------------------------------------------------ */

function quoteBlock(quote) {
  const credit = quote.source ? `${quote.author}, ${quote.source}` : quote.author;
  return el(
    'figure',
    { class: 'mind-quote' },
    el('blockquote', { text: quote.text }),
    el('figcaption', { text: `— ${credit}` })
  );
}

/**
 * The gate in front of a watched site. `kind` is "visit" when you try to
 * open it and "timeout" when its minutes are used up. `onDone(true)` means
 * go on. Returns { root, focus, stop }; call stop() when it goes away.
 */
export function gatePanel(site, stats, options = {}) {
  const { kind = 'visit', pause = 5, phrase, question, quote, onDone = () => {} } = options;
  const mode = modeOf(site);
  const timeout = kind === 'timeout';
  const sentence = phrase || DEFAULT_PHRASE;
  const over = timeout || limitState(stats, site) === 'over';
  const goText = timeout ? 'Five more minutes' : 'Open anyway';

  let left = mode === 'pause' ? Math.max(0, Number(pause) || 0) : 0;
  let typed = false;
  const count = el('span', { class: 'mind-count', text: left ? String(left) : '' });

  const go = el('button', {
    type: 'button',
    class: 'btn btn-secondary mind-go',
    onClick: () => onDone(true),
  });
  const stay = el('button', {
    type: 'button',
    class: 'btn btn-primary',
    text: mode === 'block' ? 'Go back' : 'Not now',
    onClick: () => onDone(false),
  });

  const paintGo = () => {
    go.disabled = left > 0 || (mode === 'type' && !typed);
    go.textContent = left > 0 ? `${goText} in ${left}` : goText;
  };

  let entry = null;
  let gate = null;
  if (mode === 'type') {
    entry = el('input', {
      class: 'mind-entry',
      type: 'text',
      placeholder: sentence,
      'aria-label': `Type “${sentence}” to go on`,
      autocomplete: 'off',
      spellcheck: false,
    });
    entry.addEventListener('input', () => {
      typed = phraseMatches(entry.value, sentence);
      paintGo();
    });
    entry.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && typed) onDone(true);
    });
    // Typing it out is the point, so a paste does not count.
    entry.addEventListener('paste', (event) => event.preventDefault());
    gate = el(
      'div',
      { class: 'mind-type' },
      el('p', { class: 'mind-note', text: 'To go on, type this:' }),
      el('p', { class: 'mind-phrase', text: sentence }),
      entry
    );
  } else if (mode === 'block') {
    gate = el('p', { class: 'mind-note', text: 'You blocked this site. It stays closed.' });
  }

  const summary = timeout ? `${formatMinutes(stats.seconds) || '0m'} here today` : pauseSummary(stats);
  const limit = limitLine(stats, site);

  const root = el(
    'div',
    { class: `mind-panel${over ? ' over' : ''}` },
    el('div', { class: 'mind-ring' }, count),
    timeout ? el('p', { class: 'mind-kicker', text: 'Time out' }) : null,
    el('h2', { class: 'mind-host', text: site.host }),
    el('p', { class: 'mind-sum', text: summary }),
    limit ? el('p', { class: 'mind-limit', text: limit }) : null,
    over
      ? quoteBlock(quote ?? quoteFor(Math.random() * QUOTES.length))
      : el('p', {
          class: 'mind-question',
          text: question ?? QUESTIONS[stats.visits % QUESTIONS.length],
        }),
    gate,
    el('div', { class: 'mind-actions' }, stay, mode === 'block' ? null : go)
  );
  paintGo();

  const tick = setInterval(() => {
    if (left <= 0) {
      clearInterval(tick);
      return;
    }
    left -= 1;
    count.textContent = left > 0 ? String(left) : '';
    paintGo();
  }, 1000);

  return {
    root,
    focus: () => (entry ?? stay).focus(),
    stop: () => clearInterval(tick),
  };
}

/* ------------------------------------------------------------------ */
/* The pause on this tab                                               */
/* ------------------------------------------------------------------ */

let openPause = null;

/** The gate on top of this tab. Resolves true to carry on, false to stay here. */
export function pauseScreen(site, stats, options = {}) {
  return new Promise((resolve) => {
    openPause?.();

    const panel = gatePanel(site, stats, { ...options, onDone: (proceed) => finish(proceed) });
    const root = el('div', { class: 'mind-scrim' }, panel.root);
    document.body.appendChild(root);
    requestAnimationFrame(() => root.classList.add('open'));
    panel.focus();

    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      event.preventDefault();
      finish(false);
    };
    document.addEventListener('keydown', onKey, true);

    function finish(proceed) {
      panel.stop();
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
  // The worker stops the page itself, so a gate here would ask twice.
  if (await guardsEverywhere()) return true;

  const log = await getVisitLog();
  const stats = statsFor(log, site.host);
  const proceed = await pauseScreen(site, stats, config);
  if (!proceed) return false;

  // When every site is counted, the worker counts this visit as it opens.
  if (!config.track) await saveVisitLog(addVisit(log, site.host));
  onChange();
  return true;
}
