import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/env.js';
import {
  dayLabel,
  eventsBetween,
  expandRule,
  groupByDay,
  parseDate,
  parseEvents,
  parseLines,
  parseRule,
  timeLabel,
  unfold,
} from '../js/ical.js';

const feed = (...lines) =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', ...lines, 'END:VCALENDAR'].join('\r\n');

const event = (...lines) => feed('BEGIN:VEVENT', ...lines, 'END:VEVENT');

describe('reading the text', () => {
  test('wrapped lines are joined back together', () => {
    assert.equal(unfold('SUMMARY:A very\r\n  long title'), 'SUMMARY:A very long title');
  });

  test('a line splits into name, parameters and value', () => {
    const [line] = parseLines('DTSTART;TZID=Asia/Kolkata;VALUE=DATE-TIME:20260922T093000');
    assert.equal(line.name, 'DTSTART');
    assert.deepEqual(line.params, { TZID: 'Asia/Kolkata', VALUE: 'DATE-TIME' });
    assert.equal(line.value, '20260922T093000');
  });

  test('a value may hold colons of its own', () => {
    const [line] = parseLines('LOCATION:https://meet.example.com/abc');
    assert.equal(line.value, 'https://meet.example.com/abc');
  });
});

describe('dates', () => {
  test('a plain date is an all day event', () => {
    const parsed = parseDate('20260922');
    assert.equal(parsed.allDay, true);
    assert.equal(parsed.date.getDate(), 22);
    assert.equal(parsed.date.getHours(), 0);
  });

  test('a local time keeps its wall clock reading', () => {
    const parsed = parseDate('20260922T093000', { TZID: 'Asia/Kolkata' });
    assert.equal(parsed.allDay, false);
    assert.equal(parsed.date.getHours(), 9);
    assert.equal(parsed.date.getMinutes(), 30);
  });

  test('a time ending in Z is read as UTC', () => {
    const parsed = parseDate('20260922T093000Z');
    assert.equal(parsed.date.toISOString(), '2026-09-22T09:30:00.000Z');
  });

  test('rubbish gives nothing', () => {
    assert.equal(parseDate('not a date'), null);
    assert.equal(parseDate(''), null);
  });
});

describe('events', () => {
  test('the fields of an event are read', () => {
    const [one] = parseEvents(
      event(
        'UID:abc123',
        'SUMMARY:Stand-up\\, daily',
        'LOCATION:Room 2',
        'DTSTART;TZID=Asia/Kolkata:20260922T093000',
        'DTEND;TZID=Asia/Kolkata:20260922T094500'
      )
    );
    assert.equal(one.uid, 'abc123');
    assert.equal(one.summary, 'Stand-up, daily');
    assert.equal(one.location, 'Room 2');
    assert.equal(one.start.getHours(), 9);
    assert.equal(one.end.getMinutes(), 45);
  });

  test('an event with no start is dropped', () => {
    assert.equal(parseEvents(event('SUMMARY:Nowhere')).length, 0);
  });

  test('several events are kept apart', () => {
    const text = feed(
      'BEGIN:VEVENT',
      'SUMMARY:One',
      'DTSTART:20260922T090000',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'SUMMARY:Two',
      'DTSTART:20260923T090000',
      'END:VEVENT'
    );
    assert.deepEqual(
      parseEvents(text).map((item) => item.summary),
      ['One', 'Two']
    );
  });
});

describe('repeats', () => {
  const rule = (value) => parseRule(value);

  test('a rule is read into its parts', () => {
    assert.deepEqual(rule('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=4'), {
      freq: 'WEEKLY',
      interval: 2,
      count: 4,
      until: null,
      byDay: ['MO', 'WE'],
      byMonthDay: null,
    });
    assert.equal(rule('nonsense'), null);
  });

  test('a daily event lands on every day in the window', () => {
    const [one] = parseEvents(
      event('SUMMARY:Daily', 'DTSTART:20260922T090000', 'RRULE:FREQ=DAILY')
    );
    const days = expandRule(one, new Date(2026, 8, 22), new Date(2026, 8, 25, 23, 59));
    assert.equal(days.length, 4);
    assert.equal(days[0].getDate(), 22);
    assert.equal(days[3].getDate(), 25);
  });

  test('an interval skips the days between', () => {
    const [one] = parseEvents(
      event('SUMMARY:Other day', 'DTSTART:20260922T090000', 'RRULE:FREQ=DAILY;INTERVAL=2')
    );
    const days = expandRule(one, new Date(2026, 8, 22), new Date(2026, 8, 27, 23, 59));
    assert.deepEqual(
      days.map((day) => day.getDate()),
      [22, 24, 26]
    );
  });

  test('a weekly event lands on each named day', () => {
    // 22 September 2026 is a Tuesday.
    const [one] = parseEvents(
      event('SUMMARY:Gym', 'DTSTART:20260922T070000', 'RRULE:FREQ=WEEKLY;BYDAY=TU,TH')
    );
    const days = expandRule(one, new Date(2026, 8, 22), new Date(2026, 8, 30, 23, 59));
    assert.deepEqual(
      days.map((day) => day.getDate()),
      [22, 24, 29]
    );
  });

  test('COUNT stops the series', () => {
    const [one] = parseEvents(
      event('SUMMARY:Three times', 'DTSTART:20260922T090000', 'RRULE:FREQ=DAILY;COUNT=3')
    );
    const days = expandRule(one, new Date(2026, 8, 22), new Date(2026, 9, 30));
    assert.equal(days.length, 3);
  });

  test('UNTIL stops the series', () => {
    const [one] = parseEvents(
      event('SUMMARY:Until', 'DTSTART:20260922T090000', 'RRULE:FREQ=DAILY;UNTIL=20260924T235959Z')
    );
    const days = expandRule(one, new Date(2026, 8, 22), new Date(2026, 9, 30));
    assert.deepEqual(
      days.map((day) => day.getDate()),
      [22, 23, 24]
    );
  });

  test('an EXDATE removes one day from the series', () => {
    const [one] = parseEvents(
      event(
        'SUMMARY:Skips one',
        'DTSTART:20260922T090000',
        'RRULE:FREQ=DAILY',
        'EXDATE:20260923T090000'
      )
    );
    const days = expandRule(one, new Date(2026, 8, 22), new Date(2026, 8, 24, 23, 59));
    assert.deepEqual(
      days.map((day) => day.getDate()),
      [22, 24]
    );
  });

  test('a monthly event keeps its day of the month', () => {
    const [one] = parseEvents(event('SUMMARY:Rent', 'DTSTART:20260901T090000', 'RRULE:FREQ=MONTHLY'));
    const days = expandRule(one, new Date(2026, 8, 1), new Date(2026, 10, 30));
    assert.deepEqual(
      days.map((day) => `${day.getMonth()}-${day.getDate()}`),
      ['8-1', '9-1', '10-1']
    );
  });

  test('a series with no end never runs away', () => {
    const [one] = parseEvents(event('SUMMARY:For ever', 'DTSTART:20200101T090000', 'RRULE:FREQ=DAILY'));
    const days = expandRule(one, new Date(2026, 8, 22), new Date(2026, 8, 23), 30);
    assert.ok(days.length <= 2);
  });
});

describe('the window', () => {
  const from = new Date(2026, 8, 22, 8, 0);
  const to = new Date(2026, 8, 24, 23, 59);

  test('events come back in time order', () => {
    const text = feed(
      'BEGIN:VEVENT',
      'SUMMARY:Later',
      'DTSTART:20260922T150000',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'SUMMARY:Sooner',
      'DTSTART:20260922T090000',
      'END:VEVENT'
    );
    assert.deepEqual(
      eventsBetween(text, from, to).map((item) => item.summary),
      ['Sooner', 'Later']
    );
  });

  test('an event already finished is left out', () => {
    const text = event('SUMMARY:Over', 'DTSTART:20260922T060000', 'DTEND:20260922T070000');
    assert.deepEqual(eventsBetween(text, from, to), []);
  });

  test('a meeting running right now is still shown', () => {
    const text = event('SUMMARY:Now', 'DTSTART:20260922T073000', 'DTEND:20260922T083000');
    assert.equal(eventsBetween(text, from, to).length, 1);
  });

  test('a cancelled event is left out', () => {
    const text = event('SUMMARY:Off', 'DTSTART:20260922T090000', 'STATUS:CANCELLED');
    assert.deepEqual(eventsBetween(text, from, to), []);
  });

  test('an all day event is marked as one', () => {
    const text = event('SUMMARY:Holiday', 'DTSTART;VALUE=DATE:20260923');
    const [one] = eventsBetween(text, from, to);
    assert.equal(one.allDay, true);
    assert.equal(timeLabel(one), '');
  });

  test('a feed that makes no sense gives no events', () => {
    assert.deepEqual(eventsBetween('', from, to), []);
    assert.deepEqual(eventsBetween('total nonsense', from, to), []);
  });
});

describe('labels', () => {
  const today = new Date(2026, 8, 22, 12, 0);

  test('the next two days are named', () => {
    assert.equal(dayLabel(new Date(2026, 8, 22, 9, 0), today), 'Today');
    assert.equal(dayLabel(new Date(2026, 8, 23, 9, 0), today), 'Tomorrow');
    assert.match(dayLabel(new Date(2026, 8, 26, 9, 0), today), /Sat/);
  });

  test('events are grouped under their day, in order', () => {
    const events = [
      { summary: 'A', start: new Date(2026, 8, 22, 9, 0) },
      { summary: 'B', start: new Date(2026, 8, 22, 11, 0) },
      { summary: 'C', start: new Date(2026, 8, 23, 9, 0) },
    ];
    const groups = groupByDay(events, today);
    assert.deepEqual(
      groups.map((group) => [group.label, group.events.length]),
      [
        ['Today', 2],
        ['Tomorrow', 1],
      ]
    );
  });

  test('a time is padded and a 12 hour clock is offered', () => {
    const timed = { allDay: false, start: new Date(2026, 8, 22, 9, 5) };
    assert.equal(timeLabel(timed), '09:05');
    assert.match(timeLabel(timed, true), /9:05/);
  });
});
