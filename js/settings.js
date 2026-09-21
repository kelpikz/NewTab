import {
  settings,
  updateSettings,
  getEngines,
  saveEngines,
  exportData,
  importData,
  resetAll,
} from './storage.js';
import { el, debounce, toast } from './util.js';
import { row, toggle, select, slider, textInput, button, section } from './controls.js';
import { GRADIENTS, setCustomImage, clearCustomImage, getCustomImage } from './background.js';
import { geocode } from './weather.js';
import { OPTIONAL_SOURCES } from './omni.js';
import { clearUsage } from './frecency.js';
import { hasPermissions, requestPermissions, removePermissions, hasApi } from './platform.js';

const ACCENTS = ['#7c9cff', '#5ad2a0', '#ffb454', '#ff7b8a', '#c792ea', '#4dd0e1', '#e0e0e0'];

const TABS = [
  ['general', 'General'],
  ['appearance', 'Appearance'],
  ['widgets', 'Widgets'],
  ['search', 'Search'],
  ['data', 'Data'],
];

let dialogEl = null;
let tabsEl = null;
let panelEl = null;
let actions = {};
let activeTab = 'general';

const set = async (patch, after) => {
  await updateSettings(patch);
  after?.();
};

/* ------------------------------------------------------------------ */
/* Panels                                                              */
/* ------------------------------------------------------------------ */

function generalPanel() {
  const config = settings();
  return [
    section(
      '',
      row(
        'Your name',
        textInput({
          value: config.name,
          placeholder: 'Shown in the greeting',
          label: 'Your name',
          onInput: debounce((value) => set({ name: value.trim() }, actions.refreshClock), 400),
        })
      ),
      row(
        'Clock',
        toggle(config.widgets.clock, (on) => set({ widgets: { clock: on } }, actions.refreshLayout), 'Show clock')
      ),
      row(
        'Time format',
        select(
          [
            ['24', '24 hour'],
            ['12', '12 hour'],
          ],
          config.clock.format,
          (value) => set({ clock: { format: value } }, actions.refreshClock),
          'Time format'
        )
      ),
      row(
        'Show seconds',
        toggle(config.clock.seconds, (on) => set({ clock: { seconds: on } }, actions.refreshClock), 'Show seconds')
      ),
      row(
        'Greeting',
        toggle(config.clock.greeting, (on) => set({ clock: { greeting: on } }, actions.refreshClock), 'Show greeting')
      ),
      row(
        'Daily focus',
        toggle(config.widgets.focus, (on) => set({ widgets: { focus: on } }, actions.refreshLayout), 'Show daily focus'),
        'One thing to finish today'
      )
    ),
  ];
}

function accentPicker(config) {
  const wrap = el('div', { class: 'swatches' });
  const paint = () => {
    wrap.querySelectorAll('.swatch').forEach((node) => {
      node.classList.toggle('selected', node.dataset.color === settings().accent);
    });
  };
  ACCENTS.forEach((color) => {
    wrap.appendChild(
      el('button', {
        type: 'button',
        class: 'swatch',
        dataset: { color },
        style: { background: color },
        title: color,
        'aria-label': `Accent ${color}`,
        onClick: () => set({ accent: color }, () => {
          actions.applyTheme?.();
          paint();
        }),
      })
    );
  });
  const custom = el('input', {
    type: 'color',
    class: 'swatch-custom',
    value: config.accent,
    'aria-label': 'Custom accent colour',
    onInput: debounce((event) => set({ accent: event.target.value }, () => {
      actions.applyTheme?.();
      paint();
    }), 120),
  });
  wrap.appendChild(custom);
  paint();
  return wrap;
}

function backgroundControls(config, rerender) {
  const source = config.background.source;
  const items = [];

  if (source === 'gradient') {
    items.push(
      row(
        'Gradient',
        select(
          Object.keys(GRADIENTS).map((key) => [key, key[0].toUpperCase() + key.slice(1)]),
          config.background.gradient,
          (value) => set({ background: { gradient: value } }, actions.refreshBackground),
          'Gradient'
        )
      )
    );
  }

  if (source === 'solid') {
    items.push(
      row(
        'Colour',
        el('input', {
          type: 'color',
          class: 'swatch-custom',
          value: config.background.color,
          'aria-label': 'Background colour',
          onInput: debounce(
            (event) => set({ background: { color: event.target.value } }, actions.refreshBackground),
            120
          ),
        })
      )
    );
  }

  if (source === 'custom') {
    const file = el('input', {
      type: 'file',
      accept: 'image/*',
      class: 'set-file',
      onChange: async (event) => {
        const chosen = event.target.files?.[0];
        if (!chosen) return;
        if (chosen.size > 8 * 1024 * 1024) {
          toast('Pick an image under 8 MB.');
          return;
        }
        const reader = new FileReader();
        reader.onload = async () => {
          await setCustomImage(reader.result);
          actions.refreshBackground?.();
          rerender();
        };
        reader.readAsDataURL(chosen);
      },
    });
    const preview = el('div', { class: 'custom-preview-slot' });
    getCustomImage().then((image) => {
      if (!image) return;
      preview.replaceChildren(
        el('img', { class: 'custom-preview', src: image, alt: 'Background preview' }),
        button('Remove image', async () => {
          await clearCustomImage();
          actions.refreshBackground?.();
          rerender();
        })
      );
    });
    items.push(row('Your image', file, 'JPEG or PNG, up to 8 MB'), preview);
  }

  if (source === 'photo') {
    items.push(
      row(
        'New photo',
        select(
          [
            ['tab', 'Every new tab'],
            ['hourly', 'Every hour'],
            ['daily', 'Once a day'],
            ['never', 'Keep the same one'],
          ],
          config.background.refresh,
          (value) => set({ background: { refresh: value } }),
          'Photo refresh'
        )
      ),
      row('', button('Load a new photo', () => actions.refreshBackground?.(true), 'secondary'))
    );
  }

  return items;
}

function appearancePanel(rerender) {
  const config = settings();
  return [
    section(
      '',
      row(
        'Theme',
        select(
          [
            ['dark', 'Dark'],
            ['light', 'Light'],
            ['auto', 'Match system'],
          ],
          config.theme,
          (value) => set({ theme: value }, actions.applyTheme),
          'Theme'
        )
      ),
      row('Accent', accentPicker(config))
    ),
    section(
      'Background',
      row(
        'Source',
        select(
          [
            ['photo', 'Random photo'],
            ['gradient', 'Gradient'],
            ['solid', 'Solid colour'],
            ['custom', 'Your own image'],
          ],
          config.background.source,
          (value) => set({ background: { source: value } }, () => {
            actions.refreshBackground?.();
            rerender();
          }),
          'Background source'
        )
      ),
      ...backgroundControls(config, rerender),
      row(
        'Dim',
        slider({
          value: Math.round(config.background.dim * 100),
          min: 0,
          max: 85,
          label: 'Background dim',
          format: (value) => `${value}%`,
          onInput: debounce(
            (value) => set({ background: { dim: value / 100 } }, actions.refreshBackground),
            60
          ),
        })
      ),
      row(
        'Blur',
        slider({
          value: config.background.blur,
          min: 0,
          max: 24,
          label: 'Background blur',
          format: (value) => `${value}px`,
          onInput: debounce(
            (value) => set({ background: { blur: value } }, actions.refreshBackground),
            60
          ),
        })
      )
    ),
  ];
}

function weatherSection(rerender) {
  const config = settings();
  const results = el('div', { class: 'place-results' });

  const runSearch = async (query) => {
    if (!query.trim()) return;
    results.replaceChildren(el('p', { class: 'set-hint', text: 'Searching…' }));
    try {
      const places = await geocode(query);
      if (!places.length) {
        results.replaceChildren(el('p', { class: 'set-hint', text: 'No place with that name.' }));
        return;
      }
      results.replaceChildren(
        ...places.map((place) =>
          el('button', {
            type: 'button',
            class: 'place-option',
            text: place.label,
            onClick: () =>
              set({ weather: { place } }, () => {
                actions.refreshWeather?.();
                rerender();
              }),
          })
        )
      );
    } catch {
      results.replaceChildren(el('p', { class: 'set-hint', text: 'Search failed. Try again.' }));
    }
  };

  return section(
    'Weather',
    row(
      'Location',
      textInput({
        value: '',
        placeholder: config.weather.place?.label ?? 'Search for a city',
        label: 'Search for a city',
        onEnter: runSearch,
      }),
      'Type a city and press Enter'
    ),
    results,
    row(
      'Units',
      select(
        [
          ['metric', 'Celsius'],
          ['imperial', 'Fahrenheit'],
        ],
        config.weather.units,
        (value) => set({ weather: { units: value } }, actions.refreshWeather),
        'Units'
      )
    )
  );
}

function widgetsPanel(rerender) {
  const config = settings();
  const items = [
    ['search', 'Search bar'],
    ['quicklinks', 'Quick links'],
    ['tasks', 'Tasks'],
    ['notes', 'Notes'],
    ['routines', 'Routines'],
    ['weather', 'Weather'],
    ['timer', 'Focus timer'],
  ];

  return [
    section(
      'Show or hide',
      ...items.map(([key, label]) =>
        row(
          label,
          toggle(config.widgets[key], (on) => set({ widgets: { [key]: on } }, actions.refreshLayout), label)
        )
      )
    ),
    weatherSection(rerender),
    section(
      'Focus timer',
      row(
        'Focus minutes',
        textInput({
          type: 'number',
          value: String(config.timer.focusMin),
          label: 'Focus minutes',
          onInput: debounce(
            (value) => set({ timer: { focusMin: Number(value) || 25 } }, actions.refreshTimer),
            500
          ),
        })
      ),
      row(
        'Break minutes',
        textInput({
          type: 'number',
          value: String(config.timer.breakMin),
          label: 'Break minutes',
          onInput: debounce(
            (value) => set({ timer: { breakMin: Number(value) || 5 } }, actions.refreshTimer),
            500
          ),
        })
      ),
      row(
        'Chime when done',
        toggle(config.timer.chime, (on) => set({ timer: { chime: on } }), 'Chime when done')
      )
    ),
  ];
}

function engineRow(engine, engines, rerender) {
  const save = debounce(async () => {
    await saveEngines(engines);
    actions.refreshSearch?.();
  }, 400);

  const nameInput = textInput({
    value: engine.name,
    placeholder: 'Name',
    label: 'Engine name',
    onInput: (value) => {
      engine.name = value;
      save();
    },
  });
  const prefixInput = textInput({
    value: engine.prefix ?? '',
    placeholder: 'g',
    label: 'Prefix',
    onInput: (value) => {
      engine.prefix = value.trim().toLowerCase();
      save();
    },
  });
  prefixInput.classList.add('set-input-narrow');

  const urlInput = textInput({
    value: engine.searchUrl,
    placeholder: 'https://example.com/search?q={query}',
    label: 'Search URL',
    onInput: (value) => {
      engine.searchUrl = value.trim();
      urlInput.classList.toggle('invalid', !value.includes('{query}'));
      save();
    },
  });
  urlInput.classList.toggle('invalid', !engine.searchUrl.includes('{query}'));

  return el(
    'div',
    { class: 'engine-row' },
    el(
      'div',
      { class: 'engine-row-top' },
      nameInput,
      prefixInput,
      el('button', {
        type: 'button',
        class: 'engine-delete',
        text: '✕',
        title: `Remove ${engine.name}`,
        'aria-label': `Remove ${engine.name}`,
        onClick: async () => {
          if (engines.length === 1) {
            toast('Keep at least one search engine.');
            return;
          }
          await saveEngines(engines.filter((item) => item.id !== engine.id));
          actions.refreshSearch?.();
          rerender();
        },
      })
    ),
    urlInput
  );
}

async function sourcesSection() {
  const granted = await Promise.all(
    OPTIONAL_SOURCES.map(async (name) => [name, await hasPermissions([name])])
  );
  const labels = {
    tabs: 'Open tabs',
    bookmarks: 'Bookmarks',
    history: 'History',
    topSites: 'Frequent sites',
  };

  const rows = granted.map(([name, isOn]) =>
    row(
      labels[name],
      toggle(
        isOn,
        async (on) => {
          const ok = on ? await requestPermissions([name]) : await removePermissions([name]);
          if (!ok) toast('Chrome did not change that permission.');
        },
        labels[name]
      )
    )
  );

  return section(
    'Search these too',
    el('p', {
      class: 'set-hint',
      text: hasApi('permissions')
        ? 'Results never leave your computer. Turn a source off to revoke access.'
        : 'Only available when the page runs as an extension.',
    }),
    ...rows
  );
}

async function searchPanel(rerender) {
  const engines = await getEngines();
  const list = el('div', { class: 'engine-list' });
  engines.forEach((engine) => list.appendChild(engineRow(engine, engines, rerender)));

  return [
    section(
      'Engines',
      el('p', { class: 'set-hint', text: 'Use {query} where the search words go. Type "prefix:" in the search bar to jump to an engine.' }),
      list,
      button(
        'Add engine',
        async () => {
          engines.push({
            id: crypto.randomUUID(),
            name: 'New engine',
            prefix: '',
            searchUrl: 'https://example.com/search?q={query}',
          });
          await saveEngines(engines);
          actions.refreshSearch?.();
          rerender();
        },
        'secondary'
      )
    ),
    await sourcesSection(),
  ];
}

function dataPanel() {
  const fileInput = el('input', {
    type: 'file',
    accept: 'application/json',
    class: 'set-file',
    onChange: async (event) => {
      const chosen = event.target.files?.[0];
      if (!chosen) return;
      try {
        await importData(JSON.parse(await chosen.text()));
        toast('Backup restored. Reloading…');
        setTimeout(() => window.location.reload(), 700);
      } catch (error) {
        toast(error.message ?? 'That file could not be read.');
      }
    },
  });

  return [
    section(
      'Backup',
      el('p', { class: 'set-hint', text: 'Save your links, routines, tasks and settings to a file.' }),
      row(
        'Export',
        button(
          'Download backup',
          async () => {
            const payload = await exportData();
            const url = URL.createObjectURL(
              new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
            );
            const anchor = el('a', { href: url, download: `newtab-backup-${Date.now()}.json` });
            anchor.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          },
          'secondary'
        )
      ),
      row('Import', fileInput)
    ),
    section(
      'Learned order',
      el('p', {
        class: 'set-hint',
        text: 'The palette lifts the rows you pick most. This record stays on this device.',
      }),
      row(
        'Forget',
        button('Forget what I picked', async () => {
          await clearUsage();
          toast('The palette starts over.');
        }),
        'Results go back to their plain order'
      )
    ),
    section(
      'Danger zone',
      row(
        'Reset everything',
        button(
          'Erase and start over',
          async () => {
            const confirmed = window.confirm('Erase every link, routine, note and setting?');
            if (!confirmed) return;
            await resetAll();
            window.location.reload();
          },
          'danger'
        ),
        'Cannot be undone'
      ),
    ),
  ];
}

/* ------------------------------------------------------------------ */
/* Shell                                                               */
/* ------------------------------------------------------------------ */

async function renderPanel() {
  const rerender = () => renderPanel();
  panelEl.replaceChildren(el('div', { class: 'set-loading', text: '' }));

  let content;
  if (activeTab === 'general') content = generalPanel();
  else if (activeTab === 'appearance') content = appearancePanel(rerender);
  else if (activeTab === 'widgets') content = widgetsPanel(rerender);
  else if (activeTab === 'search') content = await searchPanel(rerender);
  else content = dataPanel();

  panelEl.replaceChildren(...content);
  tabsEl.querySelectorAll('.set-tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.tab === activeTab);
  });
}

export function initSettings(options) {
  dialogEl = options.dialog;
  tabsEl = options.tabs;
  panelEl = options.panel;
  actions = options.actions ?? {};

  TABS.forEach(([id, label]) => {
    tabsEl.appendChild(
      el('button', {
        type: 'button',
        class: 'set-tab',
        text: label,
        dataset: { tab: id },
        onClick: () => {
          activeTab = id;
          renderPanel();
        },
      })
    );
  });

  options.button.addEventListener('click', () => openSettings());
  options.closeBtn.addEventListener('click', () => dialogEl.close());
}

export function openSettings(tab = activeTab) {
  activeTab = tab;
  renderPanel();
  if (!dialogEl.open) dialogEl.showModal();
}
