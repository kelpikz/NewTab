// Weather from Open-Meteo. No account and no API key needed.

import { local } from './platform.js';
import { el } from './util.js';

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const CACHE_KEY = 'weatherCache';
const CACHE_TTL_MS = 30 * 60 * 1000;
const FORECAST_DAYS = 5;
// Bumped when the shape of the cached reading changes.
const CACHE_VERSION = 'v2';

const SVG = (body) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const CLOUD = '<path d="M7 16h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.4 1.6A3.5 3.5 0 0 0 7 16z"/>';

export const ICONS = {
  sun: SVG(
    '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'
  ),
  moon: SVG('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>'),
  partly: SVG(
    '<circle cx="8" cy="7" r="3"/><path d="M8 1v1.5M3.1 3.1l1 1M1.5 7H3M12.9 3.1l-1 1"/>' + CLOUD
  ),
  cloud: SVG(CLOUD),
  rain: SVG(`${CLOUD}<path d="M9 19l-1 3M13 19l-1 3M17 19l-1 3"/>`),
  snow: SVG(`${CLOUD}<path d="M9 20h.01M12.5 22h.01M16 20h.01"/>`),
  storm: SVG(`${CLOUD}<path d="M13 18l-3 3h3l-2 3"/>`),
  fog: SVG('<path d="M4 8h16M6 12h12M4 16h13M8 20h9"/>'),
};

/** WMO weather codes -> a label and an icon name. */
export function describeCode(code, isDay = true) {
  const clear = isDay ? 'sun' : 'moon';
  const table = [
    [[0], 'Clear sky', clear],
    [[1], 'Mainly clear', clear],
    [[2], 'Partly cloudy', 'partly'],
    [[3], 'Overcast', 'cloud'],
    [[45, 48], 'Fog', 'fog'],
    [[51, 53, 55, 56, 57], 'Drizzle', 'rain'],
    [[61, 63, 65, 66, 67], 'Rain', 'rain'],
    [[71, 73, 75, 77], 'Snow', 'snow'],
    [[80, 81, 82], 'Rain showers', 'rain'],
    [[85, 86], 'Snow showers', 'snow'],
    [[95, 96, 99], 'Thunderstorm', 'storm'],
  ];
  const match = table.find(([codes]) => codes.includes(code));
  return match ? { label: match[1], icon: match[2] } : { label: 'Unknown', icon: 'cloud' };
}

export async function geocode(name) {
  const url = `${GEOCODE_URL}?name=${encodeURIComponent(name)}&count=6&language=en&format=json`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('Location search failed');
  const data = await response.json();
  return (data.results ?? []).map((place) => ({
    name: place.name,
    label: [place.name, place.admin1, place.country].filter(Boolean).join(', '),
    lat: Number(place.latitude.toFixed(3)),
    lon: Number(place.longitude.toFixed(3)),
  }));
}

function cacheKey(place, units) {
  return `${place.lat},${place.lon},${units},${CACHE_VERSION}`;
}

/** "Today", then short weekday names. */
export function dayName(dateText, index) {
  if (index === 0) return 'Today';
  const date = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateText;
  return date.toLocaleDateString(undefined, { weekday: 'short' });
}

/** Turn the daily arrays Open-Meteo returns into one row per day. */
export function readDays(daily) {
  if (!daily?.time) return [];
  return daily.time.slice(0, FORECAST_DAYS).map((date, index) => ({
    date,
    name: dayName(date, index),
    high: Math.round(daily.temperature_2m_max[index]),
    low: Math.round(daily.temperature_2m_min[index]),
    code: daily.weather_code?.[index] ?? 3,
    rain: daily.precipitation_probability_max?.[index] ?? null,
  }));
}

export async function fetchWeather(place, units, { force = false } = {}) {
  const key = cacheKey(place, units);
  const stored = (await local.get(CACHE_KEY))[CACHE_KEY];
  if (!force && stored?.key === key && Date.now() - stored.fetchedAt < CACHE_TTL_MS) {
    return stored.data;
  }

  const params = new URLSearchParams({
    latitude: String(place.lat),
    longitude: String(place.lon),
    current: 'temperature_2m,apparent_temperature,weather_code,is_day,relative_humidity_2m,wind_speed_10m',
    daily: 'temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max',
    forecast_days: String(FORECAST_DAYS),
    timezone: 'auto',
    temperature_unit: units === 'imperial' ? 'fahrenheit' : 'celsius',
    wind_speed_unit: units === 'imperial' ? 'mph' : 'kmh',
  });

  const response = await fetch(`${FORECAST_URL}?${params}`);
  if (!response.ok) throw new Error('Weather request failed');
  const raw = await response.json();

  const data = {
    temp: Math.round(raw.current.temperature_2m),
    feels: Math.round(raw.current.apparent_temperature),
    code: raw.current.weather_code,
    isDay: raw.current.is_day === 1,
    humidity: raw.current.relative_humidity_2m,
    wind: Math.round(raw.current.wind_speed_10m),
    high: Math.round(raw.daily.temperature_2m_max[0]),
    low: Math.round(raw.daily.temperature_2m_min[0]),
    days: readDays(raw.daily),
    unit: units === 'imperial' ? '°F' : '°C',
    windUnit: units === 'imperial' ? 'mph' : 'km/h',
    place: place.label ?? place.name,
  };

  await local.set({ [CACHE_KEY]: { key, data, fetchedAt: Date.now() } });
  return data;
}

function iconNode(name) {
  return el('span', { class: 'weather-icon', html: ICONS[name] ?? ICONS.cloud });
}

/** The panel under the reading: today's detail and the next few days. */
function forecastPanel(data, onConfigure) {
  const detail = [
    ['Feels like', `${data.feels}${data.unit}`],
    ['Humidity', `${data.humidity}%`],
    ['Wind', `${data.wind} ${data.windUnit}`],
  ];

  const rows = (data.days ?? []).map((day) => {
    const { label, icon } = describeCode(day.code, true);
    return el(
      'div',
      { class: 'weather-day' },
      el('span', { class: 'weather-day-name', text: day.name }),
      el('span', { class: 'weather-day-icon', html: ICONS[icon] ?? ICONS.cloud, title: label }),
      el('span', {
        class: 'weather-day-rain',
        text: day.rain === null ? '' : `${day.rain}%`,
      }),
      el('span', { class: 'weather-day-high', text: `${day.high}°` }),
      el('span', { class: 'weather-day-low', text: `${day.low}°` })
    );
  });

  return el(
    'div',
    { class: 'weather-panel', onClick: (event) => event.stopPropagation() },
    el(
      'div',
      { class: 'weather-detail' },
      ...detail.map(([label, value]) =>
        el(
          'span',
          { class: 'weather-detail-item' },
          el('span', { class: 'weather-detail-label', text: label }),
          el('span', { class: 'weather-detail-value', text: value })
        )
      )
    ),
    rows.length ? el('div', { class: 'weather-days' }, ...rows) : null,
    el('button', {
      type: 'button',
      class: 'weather-change',
      text: `${data.place} · change`,
      onClick: () => onConfigure?.(),
    })
  );
}

export async function renderWeather(container, config, { onConfigure } = {}) {
  const { place, units } = config.weather;
  container.replaceChildren();

  if (!place) {
    container.appendChild(
      el('button', {
        type: 'button',
        class: 'weather-empty',
        text: 'Set your location',
        onClick: () => onConfigure?.(),
      })
    );
    return;
  }

  container.appendChild(el('div', { class: 'weather-loading', text: '…' }));

  try {
    const data = await fetchWeather(place, units);
    const { label, icon } = describeCode(data.code, data.isDay);
    const panel = forecastPanel(data, onConfigure);

    const close = () => container.classList.remove('open');
    document.addEventListener('click', close);
    document.addEventListener('keydown', (event) => event.key === 'Escape' && close());

    const card = el(
      'button',
      {
        type: 'button',
        class: 'weather-card',
        title: 'Show the forecast',
        'aria-expanded': 'false',
        onClick: (event) => {
          event.stopPropagation();
          const open = container.classList.toggle('open');
          card.setAttribute('aria-expanded', open ? 'true' : 'false');
        },
      },
      iconNode(icon),
      el(
        'span',
        { class: 'weather-body' },
        el('span', { class: 'weather-temp', text: `${data.temp}${data.unit}` }),
        el('span', { class: 'weather-meta', text: `${label} · H ${data.high}° L ${data.low}°` }),
        el('span', { class: 'weather-place', text: data.place })
      )
    );

    container.replaceChildren(card, panel);
  } catch {
    container.replaceChildren(
      el('button', {
        type: 'button',
        class: 'weather-empty',
        text: 'Weather unavailable — retry',
        onClick: () => renderWeather(container, config, { onConfigure }),
      })
    );
  }
}
