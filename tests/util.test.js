import { test } from 'node:test';
import assert from 'node:assert/strict';
import { asUrl, urlKey, hostOf, pad2, clamp, todayKey, hueFromString } from '../js/util.js';

test('asUrl keeps a full URL as it is', () => {
  assert.equal(asUrl('https://github.com/a'), 'https://github.com/a');
  assert.equal(asUrl('  http://x.dev  '), 'http://x.dev');
});

test('asUrl adds https to a bare domain', () => {
  assert.equal(asUrl('github.com'), 'https://github.com');
  assert.equal(asUrl('news.ycombinator.com/news'), 'https://news.ycombinator.com/news');
});

test('asUrl uses http for localhost and IP addresses', () => {
  assert.equal(asUrl('localhost:3000'), 'http://localhost:3000');
  assert.equal(asUrl('127.0.0.1:8080/app'), 'http://127.0.0.1:8080/app');
});

test('asUrl rejects plain search text', () => {
  assert.equal(asUrl('how to cook rice'), null);
  assert.equal(asUrl('github'), null);
  assert.equal(asUrl(''), null);
});

test('urlKey ignores protocol, www and a trailing slash', () => {
  assert.equal(urlKey('https://www.github.com/'), urlKey('http://github.com'));
  assert.notEqual(urlKey('https://github.com/a'), urlKey('https://github.com/b'));
});

test('urlKey keeps the query string', () => {
  assert.notEqual(urlKey('https://x.com/s?q=1'), urlKey('https://x.com/s?q=2'));
});

test('hostOf strips www and survives bad input', () => {
  assert.equal(hostOf('https://www.example.com/x'), 'example.com');
  assert.equal(hostOf('not a url'), '');
});

test('pad2 and clamp', () => {
  assert.equal(pad2(7), '07');
  assert.equal(pad2(70), '70');
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-5, 0, 3), 0);
});

test('todayKey formats as YYYY-MM-DD', () => {
  assert.equal(todayKey(new Date(2026, 0, 9)), '2026-01-09');
});

test('hueFromString is stable and inside the colour wheel', () => {
  const hue = hueFromString('github.com');
  assert.equal(hue, hueFromString('github.com'));
  assert.ok(hue >= 0 && hue < 360);
});
