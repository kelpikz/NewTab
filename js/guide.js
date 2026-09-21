// "What this tab does": every feature in one sheet, so nothing stays hidden.
// The list is data, so a new feature is one line here.

import { el } from './util.js';

export const FEATURES = [
  {
    title: 'Find and go',
    items: [
      {
        name: 'Command palette',
        keys: 'Ctrl K',
        text: 'One box for your links, routines, open tabs, bookmarks, history and actions.',
      },
      {
        name: 'Instant answers',
        text: 'Type "24 * 7", "20% of 60" or "10 km in miles". Enter copies the result.',
      },
      {
        name: 'Catch a thought',
        text: 'Type anything else and the palette offers to keep it as a task or today’s focus.',
      },
      {
        name: 'It learns',
        text: 'Rows you pick often rise to the top. Clear that in Settings → Data.',
      },
      {
        name: 'Search bar',
        keys: '/',
        text: 'Search the web or your own pages. "g:", "ch:" and "cl:" pick an engine.',
      },
    ],
  },
  {
    title: 'Your sites',
    items: [
      {
        name: 'Quick links',
        keys: '1 – 9',
        text: 'Tiles in groups. Drag to reorder, drag onto a group name to move.',
      },
      { name: 'Add from a tab', text: 'The Add site box offers the pages you have open.' },
      { name: 'Routines', text: 'A named set of sites. One click opens all of them.' },
      {
        name: 'Save this window',
        text: 'The palette can turn the tabs you have open into a routine.',
      },
    ],
  },
  {
    title: 'Your day',
    items: [
      { name: 'Daily focus', text: 'One thing to finish. It clears itself at midnight.' },
      { name: 'Tasks', keys: 'T', text: 'A checklist that follows your Chrome profile.' },
      { name: 'Habits', text: 'A dot per day, and the run you are on. Click a dot to tick it.' },
      { name: 'Countdowns', text: 'Days until a trip, a release or a birthday.' },
      { name: 'Notes', keys: 'N', text: 'A scratchpad that saves itself. Stays on this device.' },
      { name: 'Focus timer', text: 'A pomodoro in the top bar. It survives closing the tab.' },
      { name: 'Widget deck', keys: 'W', text: 'One card at a time, so the page fits one screen.' },
    ],
  },
  {
    title: 'Time you lose',
    items: [
      {
        name: 'Watch a site',
        text: 'A watched site waits a few seconds and tells you how often you have been today.',
      },
      { name: 'Daily limits', text: 'Set visits or minutes a day. The count turns red once past.' },
      {
        name: 'Count the minutes',
        text: 'Optional. Needs the tabs permission, and only ever counts the sites you named.',
      },
    ],
  },
  {
    title: 'Around the edges',
    items: [
      {
        name: 'Calendar',
        text: 'Paste the secret .ics address of a Google Calendar to see what is next.',
      },
      { name: 'Weather', text: 'Now, and five days ahead. Click the reading for the rest.' },
      { name: 'Background', keys: 'B', text: 'A new photo, a gradient, a colour or your own image.' },
      { name: 'Appearance', text: 'Dark, light or match the system, with an accent you pick.' },
      { name: 'Backup', text: 'Settings → Data writes everything to a file and reads it back.' },
      {
        name: 'Nothing leaves',
        text: 'Only the photo, weather and calendar addresses are ever called. No account, no tracking.',
      },
    ],
  },
];

function featureRow(item) {
  return el(
    'div',
    { class: 'guide-row' },
    el(
      'div',
      { class: 'guide-text' },
      el('span', { class: 'guide-name', text: item.name }),
      el('span', { class: 'guide-desc', text: item.text })
    ),
    item.keys
      ? el(
          'span',
          { class: 'keys' },
          ...item.keys
            .split(' ')
            .flatMap((key, index) => [
              index ? el('span', { class: 'key-plus', text: key === '–' ? '' : '+' }) : null,
              el('kbd', { text: key }),
            ])
            .filter(Boolean)
        )
      : null
  );
}

/** Draw the feature list into a container. */
export function renderGuide(container) {
  container.replaceChildren(
    ...FEATURES.map((group) =>
      el(
        'section',
        { class: 'guide-group' },
        el('h3', { class: 'guide-title', text: group.title }),
        ...group.items.map(featureRow)
      )
    )
  );
}
