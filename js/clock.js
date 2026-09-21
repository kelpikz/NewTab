import { el, pad2 } from './util.js';

const DATE_FORMAT = { weekday: 'long', day: 'numeric', month: 'long' };

export function greetingFor(hour) {
  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 21) return 'Good evening';
  return 'Good night';
}

export function formatTime(date, { format = '24', seconds = false } = {}) {
  const hours24 = date.getHours();
  const hours = format === '12' ? hours24 % 12 || 12 : hours24;
  const parts = [format === '12' ? String(hours) : pad2(hours), pad2(date.getMinutes())];
  if (seconds) parts.push(pad2(date.getSeconds()));
  const suffix = format === '12' ? (hours24 < 12 ? ' AM' : ' PM') : '';
  return parts.join(':') + suffix;
}

/** Renders the clock and greeting. Returns a stop function. */
export function renderClock(container, config) {
  const { format, seconds, greeting } = config.clock;
  const time = el('div', { class: 'clock-time' });
  const line = el('div', { class: 'clock-line' });
  container.replaceChildren(time, line);

  const tick = () => {
    const now = new Date();
    const text = formatTime(now, { format, seconds });
    if (time.textContent !== text) time.textContent = text;

    const date = now.toLocaleDateString(undefined, DATE_FORMAT);
    const hello = config.name
      ? `${greetingFor(now.getHours())}, ${config.name}`
      : greetingFor(now.getHours());
    const next = greeting ? `${hello} · ${date}` : date;
    if (line.textContent !== next) line.textContent = next;
  };

  tick();
  const handle = setInterval(tick, 1000);
  return () => clearInterval(handle);
}
