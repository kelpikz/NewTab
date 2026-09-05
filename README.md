# My New Tab

A minimal Chrome new tab replacement with quick links and rotating background images.

## Features

- **Quick links** — horizontal grid of your favourite sites, each showing the site's favicon and name.
- **Add / remove sites** — click the `+` tile to add a site; hover a tile and click `✕` to remove it.
- **Search bar** — search Google, ChatGPT, or Claude; pick the engine from the dropdown or use prefixes (`g:`, `ch:`, `cl:`). Enter searches, Shift+Enter adds a newline. Prefixes and search URLs are editable via the ⚙ settings button.
- **Routines** — named collections of URLs; clicking one opens all of them in a new window. Add with `+`, edit or delete via the hover ✎.
- **Beautiful backgrounds** — a random photo from [picsum.photos](https://picsum.photos), cached locally and refreshed every hour.
- Links, engines, and routines sync across your Chrome profiles via `chrome.storage.sync`.

## Install

1. Open `chrome://extensions` (or `brave://extensions`).
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select this folder.
4. Open a new tab.

## Structure

```
manifest.json        Extension manifest (MV3)
newtab.html          New tab page markup
css/style.css        Styles
js/main.js           Entry point, wires up UI
js/quicklinks.js     Quick-link tile rendering
js/search.js         Search bar with engine dropdown & prefix routing
js/settings.js       Search engine settings dialog
js/routines.js       Routines widget
js/routine-dialog.js Shared add/edit routine dialog
js/storage.js        Persistence for links, engines, routines
js/background.js     Background image fetching & caching
```
