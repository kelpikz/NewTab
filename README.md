# My New Tab

A Chrome new tab replacement: quick links, a command palette that also does
sums, weather with a forecast, tasks, habits, countdowns, notes and a focus
timer. No build step, no dependencies, no tracking.

## Install

1. Open `chrome://extensions` (or `brave://extensions`).
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick this folder.
4. Open a new tab.

## Features

### Command palette — `Ctrl`/`Cmd` + `K`

One box that searches your quick links, routines, open tabs, bookmarks,
history and frequent sites, and also runs actions ("Add a site", "Switch to
the light theme", "Download a backup"). Type a web address to go straight
there, or pick a search engine from the bottom of the list.

Tabs, bookmarks, history and frequent sites are **optional permissions**. The
extension does not ask for them at install time. Turn them on from the palette
or from **Settings → Search**, and turn them off again whenever you want.
Nothing is ever sent off your computer.

The palette also learns. Every row you pick is counted, and rows you pick
often — especially for the same words — rise to the top next time. Recent
picks count for more than old ones. Clear the record in **Settings → Data**.

#### Catch a thought

Type something that is neither an address nor a sum and the palette offers to
keep it: **Add task "call the plumber"**, or **Make "finish the draft"
today's focus**.

#### Instant answers

Type a sum or a conversion and the result appears at the top of the list.
`Enter` copies it.

| Type this | Get this |
| --- | --- |
| `24 * 7` | 168 |
| `(2 + 3) ^ 4` | 625 |
| `20% of 60` | 12 |
| `120 + 10%` | 132 |
| `sqrt(144)` | 12 |
| `10 km in miles` | 6.2137119 mi |
| `72f to c` | 22.222222 c |
| `1 gb in mb` | 1,000 mb |
| `3 cups to ml` | 709.76471 ml |

Lengths, masses, volumes, data sizes, time, speed, area, angles and
temperature all convert. The sums run here — nothing is sent anywhere, and no
`eval()` is used.

### Search bar

Search the web, or pick a suggestion from your own tabs, bookmarks and
history. Type `g:`, `ch:` or `cl:` to jump to an engine. Add your own engines
in **Settings → Search** — any URL with `{query}` in it works.
`Enter` searches, `Shift`+`Enter` adds a newline.

### Quick links

Sites grouped into tabs. Drag a tile to reorder it, drag it onto a tab name to
move it to that group, drag tabs to reorder the groups. Press `1`–`9` to open
the first nine links of the active group.

Favicons come from Chrome's own cache, so no third party sees which sites you
keep here. A site with no icon gets a coloured letter tile.

### Routines

Named sets of URLs. One click opens all of them in a new window.

**Save my open tabs as a routine** in the palette turns the window you are in
into a routine, so you can pick the same set of pages up tomorrow.

### Clock, greeting and daily focus

A large clock (12 or 24 hour), a greeting with your name, and one thing to
finish today. The focus clears itself at midnight.

### Weather

Current temperature, conditions and the day's high and low, from
[Open-Meteo](https://open-meteo.com) — free, no account, no API key. Search for
your city in **Settings → Widgets**. Readings are cached for 30 minutes.

Click the reading for the rest: how it feels, humidity, wind, and the next
five days with their chance of rain.

### Tasks and notes

A checklist that syncs across your Chrome profiles, and a scratchpad that saves
itself as you type. Notes stay on this device only.

### Habits

One row per habit and one dot per day, for the last seven days. Click a dot to
mark that day, click it again to undo, and the number on the right counts the
days you have kept the run. A run stays alive until you miss a whole day, so
it does not drop just because today is not done yet.

### Countdowns

Days you are counting towards — a trip, a release, a birthday. The nearest one
sits at the top, and days that have passed sink to the bottom.

### Focus timer

A pomodoro timer in the top bar. It remembers its end time, so it keeps
counting even if you close and reopen the tab. It only runs while a new tab is
open — there is no background worker.

### Appearance

Dark, light or match-system. Seven accent colours or your own. Backgrounds
from [picsum.photos](https://picsum.photos), a gradient, a solid colour or your
own image, with dim and blur sliders. Every widget can be turned off.

### Backup

**Settings → Data** exports everything to a JSON file and imports it back.

## Keyboard shortcuts

| Keys | Action |
| --- | --- |
| `Ctrl`/`Cmd` + `K` | Command palette |
| `/` | Jump to the search bar |
| `?` | Show the shortcut list |
| `1`–`9` | Open a quick link (`Shift` for a new tab) |
| `Shift` + `←`/`→` | Switch tab group |
| `B` | Load a new background photo |
| `N` | Jump to notes |
| `T` | Add a task |
| `,` | Open settings |

## Permissions

| Permission | Why |
| --- | --- |
| `storage`, `unlimitedStorage` | Your links, settings and the cached background |
| `favicon` | Site icons from Chrome's own cache instead of a third party |
| `picsum.photos` | Background photos |
| `open-meteo.com` | Weather and city search |
| `tabs`, `bookmarks`, `history`, `topSites` | **Optional.** Palette search, saving open tabs as a routine, and filling a new tile from a tab. Only if you turn them on |

## Development

No build step — Chrome loads the source directly.

```bash
npm install    # jsdom, the only dependency, and only for the page tests
npm test       # unit tests plus a jsdom run of the whole page
npm run check  # ids, CSS classes, imports and manifest paths all resolve
```

`npm test` works without `npm install` too — the page tests skip themselves
when jsdom is missing.

```
manifest.json          Extension manifest (MV3)
newtab.html            Page markup
css/base.css           Design tokens, reset, buttons, dialogs
css/app.css            Layout and components
js/main.js             Entry point: theme, layout, dialogs, wiring
js/platform.js         chrome.* wrapper with a localStorage fallback
js/storage.js          Every stored key, the defaults and backup
js/util.js             DOM builder and small helpers
js/omni.js             Gathers palette and suggestion candidates
js/fuzzy.js            Match scoring and ranking
js/frecency.js         Remembers which rows get picked
js/answers.js          Sums and unit conversions
js/palette.js          Command palette
js/actions.js          Runs whatever a result row stands for
js/search.js           Search bar with suggestions
js/engines.js          Search engine URLs and prefixes
js/quicklinks.js       Quick link tiles, groups, drag and drop
js/clock.js            Clock and greeting
js/focus.js            Daily focus
js/weather.js          Open-Meteo client and icons
js/tasks.js            Task list
js/habits.js           Habit tracker
js/countdowns.js       Countdowns
js/notes.js            Scratchpad
js/timer.js            Focus timer
js/routines.js         Routines widget
js/routine-dialog.js   Add/edit routine dialog
js/background.js       Background sources and caching
js/settings.js         Settings dialog
js/controls.js         Form controls for the settings dialog
js/card.js             Widget card shell
js/shortcuts.js        Keyboard shortcuts and the help sheet
scripts/check.js       Static checks
tests/                 Unit and page tests
AGENTS.md              Conventions, for people and for coding agents
```
