// The widget behind the "Time" tab: what today cost you on the sites you
// asked to watch, how the last seven days compare, and, when every site is
// counted, where the rest of the time went.

import { settings, updateSettings, getVisitLog, saveVisitLog } from './storage.js';
import { el, faviconNode, todayKey } from './util.js';
import { card, cardButton } from './card.js';
import { formatMinutes, limitState, normalizeHost, statsFor, trend } from './mindful.js';
import { lastDays, siteTotals } from './timelog.js';

const DAYS = 7;
const TOP = 12;

// Which list the card shows, and over which days. Kept for this tab only.
const view = { list: 'watched', range: 'today' };

/** Seconds and visits over a list of site totals. */
export function sumTotals(totals) {
  return totals.reduce(
    (sum, site) => ({ visits: sum.visits + site.visits, seconds: sum.seconds + site.seconds }),
    { visits: 0, seconds: 0 }
  );
}

/** The days a range covers: today, or the last seven. */
export function rangeDays(range, from = new Date()) {
  return lastDays(range === 'week' ? DAYS : 1, from);
}

/** The tallest bar in the chart, so the small days stay readable. */
export function chartScale(days, key) {
  return Math.max(1, ...days.map((day) => day[key] ?? 0));
}

function sparkline(days, key, host) {
  const scale = chartScale(days, key);
  return el(
    'span',
    { class: 'st-spark', title: `${DAYS} days of ${host}` },
    ...days.map((day) => {
      const value = day[key] ?? 0;
      const bar = el('span', {
        class: 'st-bar' + (day.day === todayKey() ? ' today' : ''),
        style: { height: `${Math.max(2, Math.round((value / scale) * 20))}px` },
        title: `${day.day}: ${key === 'seconds' ? formatMinutes(value) || '0m' : `${value} visits`}`,
      });
      return bar;
    })
  );
}

function siteRow(site, log, { onRemove }) {
  const stats = statsFor(log, site.host);
  const days = trend(log, site.host, DAYS);
  const counted = days.some((day) => day.seconds > 0);
  const state = limitState(stats, site);

  const parts = [`${stats.visits} ${stats.visits === 1 ? 'visit' : 'visits'}`];
  const time = formatMinutes(stats.seconds);
  if (time) parts.push(time);

  const icon = faviconNode(`https://${site.host}`, site.host, 16);
  icon.classList.add('st-icon');

  return el(
    'li',
    { class: `st-site ${state}` },
    icon,
    el(
      'span',
      { class: 'st-text' },
      el('span', { class: 'st-host', text: site.host }),
      el('span', { class: 'st-stat', text: parts.join(' · ') })
    ),
    sparkline(days, counted ? 'seconds' : 'visits', site.host),
    el('button', {
      type: 'button',
      class: 'st-remove',
      text: '✕',
      'aria-label': `Stop watching ${site.host}`,
      onClick: () => onRemove(site),
    })
  );
}

function totalRow(total, scale, watched, onWatch) {
  const icon = faviconNode(`https://${total.host}`, total.host, 16);
  icon.classList.add('st-icon');
  const parts = [formatMinutes(total.seconds) || '<1m'];
  if (total.visits) parts.push(`${total.visits} ${total.visits === 1 ? 'visit' : 'visits'}`);

  return el(
    'li',
    { class: 'st-site' },
    icon,
    el(
      'span',
      { class: 'st-text' },
      el('span', { class: 'st-host', text: total.host }),
      el(
        'span',
        { class: 'st-meter' },
        el('span', {
          class: 'st-fill',
          style: { width: `${Math.max(2, Math.round((total.seconds / scale) * 100))}%` },
        })
      )
    ),
    el('span', { class: 'st-amount', text: parts.join(' · ') }),
    watched
      ? el('span', { class: 'st-watched', text: '●', title: 'Watched' })
      : el('button', {
          type: 'button',
          class: 'st-watch',
          text: '+',
          title: `Watch ${total.host}`,
          'aria-label': `Watch ${total.host}`,
          onClick: () => onWatch(total.host),
        })
  );
}

function allSites(body, log, sites, rerender) {
  if (!settings().mindful.track) {
    body.appendChild(
      el('p', {
        class: 'card-empty',
        text: 'Turn on Count every site in Settings → Time to see where your time goes.',
      })
    );
    return;
  }
  const totals = siteTotals(log, rangeDays(view.range)).filter((total) => total.seconds >= 30);
  if (!totals.length) {
    body.appendChild(el('p', { class: 'card-empty', text: 'Nothing counted yet.' }));
    return;
  }
  const sum = sumTotals(totals);
  body.appendChild(
    el('p', {
      class: 'st-summary',
      text: `${formatMinutes(sum.seconds)} on ${totals.length} ${totals.length === 1 ? 'site' : 'sites'}${view.range === 'week' ? ' this week' : ' today'}`,
    })
  );
  const watched = new Set(sites.map((site) => site.host));
  const scale = totals[0].seconds || 1;
  const list = el('ul', { class: 'st-list st-all' });
  totals.slice(0, TOP).forEach((total) =>
    list.appendChild(
      totalRow(total, scale, watched.has(total.host), async (host) => {
        await updateSettings({
          mindful: { sites: [...sites, { host, mode: 'pause', limitVisits: 0, limitMinutes: 0 }] },
        });
        rerender();
      })
    )
  );
  body.appendChild(list);
}

export async function renderScreenTime(container) {
  const config = settings().mindful;
  const log = await getVisitLog();
  const rerender = () => renderScreenTime(container);
  const sites = config.sites ?? [];

  const switchTo = (patch) => {
    Object.assign(view, patch);
    rerender();
  };
  const actions = [
    cardButton(view.list === 'all' ? 'Watched' : 'All', 'Switch between watched sites and every site', () =>
      switchTo({ list: view.list === 'all' ? 'watched' : 'all' })
    ),
  ];
  if (view.list === 'all') {
    actions.unshift(
      cardButton(view.range === 'week' ? 'Week' : 'Today', 'Switch between today and this week', () =>
        switchTo({ range: view.range === 'week' ? 'today' : 'week' })
      )
    );
  }

  const today = config.track
    ? formatMinutes(sumTotals(siteTotals(log, [todayKey()])).seconds)
    : sites.reduce((total, site) => total + statsFor(log, site.host).visits, 0);
  const { root, body } = card({
    title: today ? `Time · ${today} today` : 'Time',
    actions,
    className: 'card-screentime',
  });

  if (view.list === 'all') {
    allSites(body, log, sites, rerender);
    container.replaceChildren(root);
    return;
  }

  if (sites.length) {
    const list = el('ul', { class: 'st-list' });
    sites.forEach((site) =>
      list.appendChild(
        siteRow(site, log, {
          onRemove: async (target) => {
            await updateSettings({
              mindful: { sites: sites.filter((item) => item.host !== target.host) },
            });
            rerender();
          },
        })
      )
    );
    body.appendChild(list);
  } else {
    body.appendChild(
      el('p', {
        class: 'card-empty',
        text: 'Name a site that eats your day. It then waits a few seconds before it opens.',
      })
    );
  }

  const input = el('input', {
    class: 'st-input',
    type: 'text',
    placeholder: 'Watch a site, e.g. youtube.com',
    'aria-label': 'Watch a site',
    maxLength: 60,
  });
  input.addEventListener('keydown', async (event) => {
    if (event.key !== 'Enter') return;
    const host = normalizeHost(input.value);
    if (!host || !host.includes('.')) return;
    if (sites.some((site) => site.host === host)) {
      input.value = '';
      return;
    }
    await updateSettings({
      mindful: { sites: [...sites, { host, mode: 'pause', limitVisits: 0, limitMinutes: 0 }] },
    });
    await renderScreenTime(container);
    container.querySelector('.st-input')?.focus();
  });

  body.appendChild(
    el('div', { class: 'st-add' }, el('span', { class: 'st-add-plus', text: '+' }), input)
  );
  container.replaceChildren(root);
}

/** Clear everything counted so far. Used by the settings dialog. */
export async function clearVisitLog() {
  await saveVisitLog({});
}
