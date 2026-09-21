// The weather widget against a stubbed Open-Meteo reply.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage, jsdomAvailable } from './helpers/page.js';

const skip = (await jsdomAvailable()) ? false : 'jsdom is not installed';

const REPLY = {
  current: {
    temperature_2m: 18.6,
    apparent_temperature: 17.1,
    weather_code: 2,
    is_day: 1,
    relative_humidity_2m: 62,
    wind_speed_10m: 11.4,
  },
  daily: {
    time: ['2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27'],
    temperature_2m_max: [21.4, 19.8, 24.2, 22.0, 20.1],
    temperature_2m_min: [11.2, 9.9, 13.5, 12.0, 10.4],
    weather_code: [2, 61, 0, 3, 80],
    precipitation_probability_max: [5, 80, 0, 20, 60],
  },
};

describe('weather widget', { skip }, () => {
  let page;
  const requests = [];

  before(async () => {
    page = await loadPage({
      seed: {
        sync: {
          settings: {
            weather: { place: { name: 'Kochi', label: 'Kochi, India', lat: 9.93, lon: 76.26 } },
          },
        },
      },
      fetchImpl: async (url) => {
        requests.push(String(url));
        return { ok: true, json: async () => REPLY };
      },
    });
  });

  after(() => page?.dispose());

  test('asks Open-Meteo for five days', () => {
    const call = requests.find((url) => url.includes('api.open-meteo.com'));
    assert.ok(call, 'a forecast was requested');
    assert.match(call, /forecast_days=5/);
    assert.match(call, /latitude=9.93/);
  });

  test('shows the reading for the chosen place', () => {
    assert.equal(page.text('.weather-temp'), '19°C');
    assert.match(page.text('.weather-meta'), /Partly cloudy · H 21° L 11°/);
    assert.equal(page.text('.weather-place'), 'Kochi, India');
  });

  test('the card opens a panel with the next days', async () => {
    assert.ok(!page.$('#weather').classList.contains('open'));
    await page.click('.weather-card');
    assert.ok(page.$('#weather').classList.contains('open'));

    assert.equal(page.$$('.weather-day').length, 5);
    assert.equal(page.text('.weather-day-name'), 'Today');
    assert.deepEqual(
      page.$$('.weather-day-high').map((node) => node.textContent),
      ['21°', '20°', '24°', '22°', '20°']
    );
    assert.deepEqual(
      page.$$('.weather-detail-value').map((node) => node.textContent),
      ['17°C', '62%', '11 km/h']
    );
  });

  test('a click anywhere else closes the panel', async () => {
    await page.click('body');
    assert.ok(!page.$('#weather').classList.contains('open'));
  });

  test('nothing threw along the way', () => {
    assert.deepEqual(page.errors, []);
  });
});
