import { getEngines, saveEngines } from './storage.js';

function createEngineFields(engine) {
  const fieldset = document.createElement('fieldset');
  fieldset.className = 'settings-engine';

  const legend = document.createElement('legend');
  const icon = document.createElement('img');
  icon.src = engine.icon;
  icon.alt = '';
  const title = document.createElement('span');
  title.textContent = engine.name;
  legend.append(icon, title);

  const prefixLabel = document.createElement('label');
  prefixLabel.textContent = 'Prefix shortcut';
  const prefixInput = document.createElement('input');
  prefixInput.type = 'text';
  prefixInput.value = engine.prefix;
  prefixInput.required = true;
  prefixLabel.appendChild(prefixInput);

  const urlLabel = document.createElement('label');
  urlLabel.textContent = 'Search URL ({query} = your search)';
  const urlInput = document.createElement('input');
  urlInput.type = 'text';
  urlInput.value = engine.searchUrl;
  urlInput.required = true;
  urlInput.pattern = '.*\\{query\\}.*';
  urlInput.title = 'Must contain {query}';
  urlLabel.appendChild(urlInput);

  fieldset.append(legend, prefixLabel, urlLabel);
  return {
    fieldset,
    read: () => ({
      ...engine,
      prefix: prefixInput.value.trim().toLowerCase(),
      searchUrl: urlInput.value.trim(),
    }),
  };
}

export function initSettings({ button, dialog, form, container, cancelBtn, onSave }) {
  let fields = [];

  button.addEventListener('click', async () => {
    const engines = await getEngines();
    container.replaceChildren();
    fields = engines.map((engine) => {
      const field = createEngineFields(engine);
      container.appendChild(field.fieldset);
      return field;
    });
    dialog.showModal();
  });

  form.addEventListener('submit', async () => {
    await saveEngines(fields.map((f) => f.read()));
    onSave();
  });

  cancelBtn.addEventListener('click', () => dialog.close());
}
