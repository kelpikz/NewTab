import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/env.js';
import {
  collapse,
  normalizeOrder,
  placeWidget,
  reorder,
  resolveActive,
  stepWidget,
  WIDGET_KEYS,
  zonesOf,
} from '../js/layout.js';

const allOn = Object.fromEntries(WIDGET_KEYS.map((key) => [key, true]));

describe('the order', () => {
  test('an empty order is the order they ship in', () => {
    assert.deepEqual(normalizeOrder([]), WIDGET_KEYS);
  });

  test('a stored order keeps its choices and picks up new widgets', () => {
    const order = normalizeOrder(['notes', 'tasks']);
    assert.deepEqual(order.slice(0, 2), ['notes', 'tasks']);
    assert.equal(order.length, WIDGET_KEYS.length);
    assert.ok(order.includes('calendar'));
  });

  test('a widget that no longer exists is dropped', () => {
    assert.ok(!normalizeOrder(['gone', 'tasks']).includes('gone'));
  });

  test('a card can be moved in front of another', () => {
    const order = reorder(['a', 'tasks', 'habits', 'notes'], 'notes', 'tasks');
    assert.deepEqual(order.slice(0, 3), ['notes', 'tasks', 'habits']);
  });

  test('a card dropped on nothing goes last', () => {
    const order = reorder(WIDGET_KEYS, 'tasks');
    assert.equal(order[order.length - 1], 'tasks');
  });
});

describe('the zones', () => {
  test('everything starts in the middle', () => {
    const zones = zonesOf({ order: [], placement: {}, widgets: allOn });
    assert.deepEqual(zones.deck, WIDGET_KEYS);
    assert.deepEqual(zones.left, []);
  });

  test('a placed widget moves to its rail', () => {
    const placement = placeWidget({}, 'calendar', 'left');
    const zones = zonesOf({ order: [], placement, widgets: allOn });
    assert.deepEqual(zones.left, ['calendar']);
    assert.ok(!zones.deck.includes('calendar'));
  });

  test('a rail keeps the order you chose', () => {
    const placement = { calendar: 'right', mindful: 'right' };
    const order = reorder(WIDGET_KEYS, 'calendar', 'mindful');
    assert.deepEqual(zonesOf({ order, placement, widgets: allOn }).right, ['calendar', 'mindful']);
  });

  test('a widget that is turned off is in no zone', () => {
    const widgets = { ...allOn, calendar: false };
    const zones = zonesOf({ order: [], placement: { calendar: 'left' }, widgets });
    assert.deepEqual(zones.left, []);
  });

  test('a zone name that makes no sense falls back to the middle', () => {
    const zones = zonesOf({ order: [], placement: { tasks: 'moon' }, widgets: allOn });
    assert.ok(zones.deck.includes('tasks'));
  });
});

describe('narrow windows', () => {
  const zones = { left: ['calendar'], deck: ['tasks'], right: ['mindful'] };

  test('a wide window keeps the rails', () => {
    assert.deepEqual(collapse(zones, 1600), zones);
  });

  test('a narrow window sends the rails back to the middle, in order', () => {
    const tight = collapse(zones, 1100);
    assert.deepEqual(tight, { left: [], right: [], deck: ['calendar', 'tasks', 'mindful'] });
  });
});

describe('the deck tabs', () => {
  const deck = ['tasks', 'habits', 'notes'];

  test('the tab last used opens again', () => {
    assert.equal(resolveActive(deck, 'habits'), 'habits');
  });

  test('a tab that has gone falls back to the first', () => {
    assert.equal(resolveActive(deck, 'calendar'), 'tasks');
    assert.equal(resolveActive([], 'tasks'), null);
  });

  test('stepping wraps around both ways', () => {
    assert.equal(stepWidget(deck, 'tasks', 1), 'habits');
    assert.equal(stepWidget(deck, 'notes', 1), 'tasks');
    assert.equal(stepWidget(deck, 'tasks', -1), 'notes');
  });
});
