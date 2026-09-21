// Just enough iCalendar (RFC 5545) to show what is next in your day.
//
// A calendar feed is plain text. This file turns it into events, and works
// out which days a repeating event lands on inside a window of a week or
// two. It has no DOM and no network in it, so it is easy to test.
//
// Times carry a zone name that only a full timezone database could resolve,
// so a time with a TZID is read as wall clock time on this machine. That is
// right whenever the calendar and the computer keep the same zone, which is
// the usual case. Times ending in "Z" are proper UTC and always exact.

const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/** Join the continuation lines a feed wraps long values onto. */
export function unfold(text) {
  return String(text ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\n[ \t]/g, '');
}

/** Split "NAME;PARAM=X:value" into its three parts, line by line. */
export function parseLines(text) {
  return unfold(text)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const colon = line.indexOf(':');
      if (colon === -1) return null;
      const head = line.slice(0, colon);
      const value = line.slice(colon + 1);
      const [name, ...rest] = head.split(';');
      const params = {};
      rest.forEach((part) => {
        const equals = part.indexOf('=');
        if (equals === -1) return;
        params[part.slice(0, equals).toUpperCase()] = part.slice(equals + 1).replace(/^"|"$/g, '');
      });
      return { name: name.toUpperCase(), params, value };
    })
    .filter(Boolean);
}

/** Read a DATE or DATE-TIME. Returns `{ date, allDay }`, or null. */
export function parseDate(value, params = {}) {
  const text = String(value ?? '').trim();
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(text);
  if (!match) return null;
  const [, y, m, d, hh, mm, ss, zulu] = match;
  const parts = [Number(y), Number(m) - 1, Number(d), Number(hh ?? 0), Number(mm ?? 0), Number(ss ?? 0)];
  const allDay = hh === undefined || params.VALUE === 'DATE';
  const date = zulu ? new Date(Date.UTC(...parts)) : new Date(...parts);
  return Number.isNaN(date.getTime()) ? null : { date, allDay };
}

function unescapeText(value) {
  return String(value ?? '')
    .replace(/\\n/gi, ' ')
    .replace(/\\([,;\\])/g, '$1')
    .trim();
}

/** Turn "FREQ=WEEKLY;BYDAY=MO,WE" into an object. */
export function parseRule(value) {
  const rule = {};
  String(value ?? '')
    .split(';')
    .forEach((part) => {
      const equals = part.indexOf('=');
      if (equals === -1) return;
      rule[part.slice(0, equals).toUpperCase()] = part.slice(equals + 1);
    });
  if (!rule.FREQ) return null;
  return {
    freq: rule.FREQ.toUpperCase(),
    interval: Math.max(1, Number(rule.INTERVAL) || 1),
    count: rule.COUNT ? Number(rule.COUNT) : null,
    until: rule.UNTIL ? parseDate(rule.UNTIL)?.date ?? null : null,
    byDay: rule.BYDAY ? rule.BYDAY.split(',').map((day) => day.trim().toUpperCase()) : null,
    byMonthDay: rule.BYMONTHDAY ? rule.BYMONTHDAY.split(',').map(Number) : null,
  };
}

/** Every VEVENT in a feed, in the order they appear. */
export function parseEvents(text) {
  const events = [];
  let current = null;
  parseLines(text).forEach(({ name, params, value }) => {
    if (name === 'BEGIN' && value === 'VEVENT') {
      current = { exdates: [] };
      return;
    }
    if (!current) return;
    if (name === 'END' && value === 'VEVENT') {
      if (current.start) events.push(current);
      current = null;
      return;
    }
    if (name === 'UID') current.uid = value;
    else if (name === 'SUMMARY') current.summary = unescapeText(value);
    else if (name === 'LOCATION') current.location = unescapeText(value);
    else if (name === 'STATUS') current.status = value.toUpperCase();
    else if (name === 'RRULE') current.rule = parseRule(value);
    else if (name === 'DTSTART') {
      const parsed = parseDate(value, params);
      if (parsed) {
        current.start = parsed.date;
        current.allDay = parsed.allDay;
      }
    } else if (name === 'DTEND') {
      current.end = parseDate(value, params)?.date ?? null;
    } else if (name === 'EXDATE') {
      value.split(',').forEach((part) => {
        const parsed = parseDate(part, params);
        if (parsed) current.exdates.push(parsed.date);
      });
    } else if (name === 'RECURRENCE-ID') {
      // A single changed instance. Showing the series once is close enough.
      current.overrides = true;
    }
  });
  return events;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Move a date by whole days, months or years, keeping the time of day. */
function step(date, freq, amount) {
  const next = new Date(date);
  if (freq === 'DAILY') next.setDate(next.getDate() + amount);
  else if (freq === 'WEEKLY') next.setDate(next.getDate() + amount * 7);
  else if (freq === 'MONTHLY') next.setMonth(next.getMonth() + amount);
  else if (freq === 'YEARLY') next.setFullYear(next.getFullYear() + amount);
  return next;
}

/** The days of a week that a weekly rule lands on. */
function weeklyDays(start, rule) {
  const wanted = rule.byDay?.length
    ? rule.byDay.map((day) => WEEKDAYS.indexOf(day.slice(-2))).filter((index) => index >= 0)
    : [start.getDay()];
  return [...new Set(wanted)].sort();
}

/**
 * Every time a repeating event happens between `from` and `to`.
 * A rule with no end is walked a limited number of times, so a broken feed
 * can never spin here for ever.
 */
export function expandRule(event, from, to, limit = 400) {
  const rule = event.rule;
  const out = [];
  if (!rule) {
    if (event.start >= from && event.start <= to) out.push(new Date(event.start));
    return out;
  }

  const skip = new Set(event.exdates.map((date) => date.getTime()));
  const duration = event.end ? event.end - event.start : 0;
  let occurrences = 0;
  let cursor = new Date(event.start);

  const take = (date) => {
    if (skip.has(date.getTime())) return true;
    occurrences += 1;
    if (rule.until && date > rule.until) return false;
    if (rule.count && occurrences > rule.count) return false;
    if (date >= from && date <= to) out.push(new Date(date));
    return true;
  };

  for (let guard = 0; guard < limit; guard += 1) {
    if (cursor - duration > to) break;
    if (rule.until && cursor > rule.until) break;
    if (rule.count && occurrences >= rule.count) break;

    if (rule.freq === 'WEEKLY') {
      const days = weeklyDays(event.start, rule);
      const weekStart = new Date(cursor);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      for (const day of days) {
        const date = new Date(weekStart);
        date.setDate(date.getDate() + day);
        date.setHours(
          event.start.getHours(),
          event.start.getMinutes(),
          event.start.getSeconds(),
          0
        );
        if (date < event.start) continue;
        if (!take(date)) return out;
      }
    } else if (!take(new Date(cursor))) {
      return out;
    }

    cursor = step(cursor, rule.freq, rule.interval);
  }
  return out;
}

/**
 * Flatten a feed into the events that fall inside a window, soonest first.
 * All-day events are kept whole; timed events keep their length.
 */
export function eventsBetween(feedText, from, to) {
  const out = [];
  parseEvents(feedText).forEach((event) => {
    if (event.status === 'CANCELLED') return;
    const duration = event.end ? Math.max(0, event.end - event.start) : 0;
    expandRule(event, new Date(from - duration), to).forEach((start) => {
      const end = new Date(start.getTime() + (duration || (event.allDay ? DAY_MS : 0)));
      if (end < from) return;
      out.push({
        uid: event.uid,
        summary: event.summary || '(no title)',
        location: event.location ?? '',
        start,
        end,
        allDay: !!event.allDay,
      });
    });
  });
  return out.sort((a, b) => a.start - b.start);
}

/** "09:30", or "" for an all-day event. */
export function timeLabel(event, hour12 = false) {
  if (event.allDay) return '';
  return event.start.toLocaleTimeString(undefined, {
    hour: hour12 ? 'numeric' : '2-digit',
    minute: '2-digit',
    hour12,
  });
}

/** "Today", "Tomorrow" or a short date. */
export function dayLabel(date, from = new Date()) {
  const tomorrow = new Date(from);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (sameDay(date, from)) return 'Today';
  if (sameDay(date, tomorrow)) return 'Tomorrow';
  return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Group events under the day they start on, keeping the order. */
export function groupByDay(events, from = new Date()) {
  const groups = [];
  events.forEach((event) => {
    const label = dayLabel(event.start, from);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.events.push(event);
    else groups.push({ label, events: [event] });
  });
  return groups;
}
