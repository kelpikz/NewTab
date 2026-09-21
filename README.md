# My New Tab

A Chrome new tab replacement: quick links, a command palette, weather, tasks,
notes and a focus timer. No build step, no dependencies, no tracking.

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

### Clock, greeting and daily focus

A large clock (12 or 24 hour), a greeting with your name, and one thing to
finish today. The focus clears itself at midnight.

### Weather

Current temperature, conditions and the day's high and low, from
[Open-Meteo](https://open-meteo.com) — free, no account, no API key. Search for
your city in **Settings → Widgets**. Readings are cached for 30 minutes.

### Tasks and notes

A checklist that syncs across your Chrome profiles, and a scratchpad that saves
itself as you type. Notes stay on this device only.

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
| `tabs`, `bookmarks`, `history`, `topSites` | **Optional.** Only for palette search, only if you turn them on |

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
js/storage.js          Settings, links, engines, routines, tasks, backup
js/util.js             DOM builder and small helpers
js/omni.js             Gathers palette and suggestion candidates
js/fuzzy.js            Match scoring and ranking
js/palette.js          Command palette
js/actions.js          Runs whatever a result row stands for
js/search.js           Search bar with suggestions
js/engines.js          Search engine URLs and prefixes
js/quicklinks.js       Quick link tiles, groups, drag and drop
js/clock.js            Clock and greeting
js/focus.js            Daily focus
js/weather.js          Open-Meteo client and icons
js/tasks.js            Task list
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
```
