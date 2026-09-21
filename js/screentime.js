// The widget behind the "Time" tab: what today cost you on the sites you
// asked to watch, and how the last seven days compare.

import { settings, updateSettings, getVisitLog, saveVisitLog } from './storage.js';
import { el, faviconNode, todayKey } from './util.js';
import { card } from './card.js';
import { formatMinutes, limitState, normalizeHost, statsFor, trend } from './mindful.js';

const DAYS = 7;

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

export async function renderScreenTime(container) {
  const config = settings().mindful;
  const log = await getVisitLog();
  const rerender = () => renderScreenTime(container);
  const sites = config.sites ?? [];

  const today = sites.reduce((total, site) => total + statsFor(log, site.host).visits, 0);
  const { root, body } = card({
    title: today ? `Time · ${today} today` : 'Time',
    className: 'card-screentime',
  });

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
      mindful: { sites: [...sites, { host, limitVisits: 0, limitMinutes: 0 }] },
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
