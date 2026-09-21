# AGENTS.md

Guide for coding agents working in this repository. Read this before you
change anything.

## What this is

A Chrome (MV3) new tab replacement. Plain ES modules, no framework, no build
step — Chrome loads `js/*.js` straight from disk. The only dependency is
`jsdom`, and only the page tests use it.

## Commands

```bash
npm test       # unit tests plus a jsdom run of the whole page
npm run check  # static checks; run this as well as the tests
```

Both must pass before you commit. `npm test` also works without
`npm install`: the page tests skip themselves when jsdom is missing.

Do not start a dev server. There is nothing to serve — load the folder at
`chrome://extensions` with **Load unpacked** to try it by hand.

## Layout

| Path | Holds |
| --- | --- |
| `manifest.json` | MV3 manifest |
| `newtab.html` | All markup, including every `<dialog>` |
| `css/base.css` | Design tokens, reset, buttons, dialogs |
| `css/app.css` | Layout and components |
| `js/main.js` | Entry point: theme, layout, dialogs, wiring |
| `js/platform.js` | `chrome.*` wrapper with a localStorage fallback |
| `js/storage.js` | Every stored key, the defaults, and backup |
| `js/util.js` | DOM builder and small helpers |
| `js/card.js` | Shared widget shell |
| `js/controls.js` | Form controls for the settings dialog |
| `js/omni.js` | Gathers palette and suggestion candidates |
| `js/answers.js` | Sums and unit conversions; pure, no DOM |
| `js/frecency.js` | Remembers which palette rows get picked |
| `js/timelog.js` | Visits and seconds per site; no DOM, shared with the worker |
| `js/deck.js` | Widget tabs and the two widget layouts |
| `js/guide.js` | The feature list behind `?` |
| `worker.js` | Background worker: counts minutes, and nothing else |
| `scripts/check.js` | Static checks |
| `tests/` | Unit tests and a jsdom page test |

## Rules

**Build the DOM with `el()` from `js/util.js`.** Never write `innerHTML` with
text that came from the user. `el('div', { class: 'x', onClick: fn }, child)`.

**Storage always goes through `js/platform.js`** (`sync` and `local`), and
every other `chrome.*` call is guarded by `hasApi()` and, for an optional
permission, `hasPermissions()`. A capability used by more than one module
belongs in `platform.js`. The page must keep working outside an extension,
which is how the tests run it.

**Every stored key lives in `js/storage.js`,** with a default, a getter and a
setter. Add new keys to `SYNC_KEYS` or `LOCAL_KEYS` so backups keep working.
`sync` is small and shared across profiles; `local` is large and per device.
Big or private things (notes, cached photos) go in `local`.

**Settings are one deep-merged object.** Add a default to `DEFAULT_SETTINGS`,
then read it with `settings()` and write it with `updateSettings({ patch })`.
A patch only names what changes.

**A widget is a `render<Name>(container)` function** that builds a `card()`,
fills it and calls `container.replaceChildren(root)`. It reads its own state,
saves its own state and re-renders itself. `main.js` decides whether to call
it at all.

**Ask for optional permissions, never at install time.** `tabs`, `bookmarks`,
`history` and `topSites` stay in `optional_permissions`, and the code degrades
to nothing when they are missing.

**Nothing leaves the device** except the hosts the manifest names
(picsum.photos for photos, open-meteo.com for weather, calendar.google.com
for the one feed address the user pastes). No analytics, no
fonts from a CDN, no third-party favicon service — icons come from Chrome's
own cache through `faviconUrl()`.

**The background worker stays tiny and DOM-free.** It only counts minutes on
the watch list, only when the user turns it on. Anything it imports must work
without a `document`; `npm run check` walks its imports and fails otherwise.
Put shared logic in `js/timelog.js`, never in `js/util.js`.

**Add a feature, add a line to `js/guide.js`.** That sheet is how a person
finds out the feature exists.

**No new runtime dependencies.** Ever.

## Adding a widget

1. `js/<name>.js` exporting `render<Name>(container)`.
2. `<div id="<name>" class="widget-slot"></div>` in `newtab.html`.
3. A `widgets.<name>: true` default in `DEFAULT_SETTINGS`.
4. A row in `widgetsPanel()` in `js/settings.js`.
5. `dom.<name>` and a render call in `refreshLayout()` in `js/main.js`, plus
   the slot in the `applyDeck()` call. The deck decides what is on show, so no
   `show()` line is needed for a deck widget.
6. `DECK_WIDGETS` and `LABELS` in `js/deck.js`.
7. Styles in `css/app.css`.
8. Unit tests for the widget's pure parts in `tests/<name>.test.js`, and a
   round trip through the page in `tests/page.test.js`.

`npm run check` fails if an id or a CSS class is missing, which catches
steps 2 and 6.

## Style

- Modules and files are lower case, one job each.
- Comments say *why*, not *what*, and are rare. Write ASD-STE100 style plain
  English in comments, UI text and docs: short sentences, common words, no
  jargon.
- Async/await, never `.then()` chains in page code.
- Keep the UI calm. No animation that moves more than a few pixels.
- Pull the logic out of the DOM code and test it on its own: `streak()`,
  `daysUntil()`, `answer()` and `boostFor()` are all pure functions.

## Commits

Short messages, prefixed `feat:`, `fix:`, `chore:` or `doc:`. One subject
line. No co-author line for the human.
