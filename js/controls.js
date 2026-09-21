import { el } from './util.js';

export function row(label, control, hint) {
  return el(
    'div',
    { class: 'set-row' },
    el(
      'div',
      { class: 'set-label' },
      el('span', { text: label }),
      hint ? el('small', { text: hint }) : null
    ),
    el('div', { class: 'set-control' }, control)
  );
}

export function toggle(checked, onChange, label = '') {
  const input = el('input', {
    type: 'checkbox',
    checked,
    'aria-label': label,
    onChange: (event) => onChange(event.currentTarget.checked),
  });
  return el('label', { class: 'switch' }, input, el('span', { class: 'switch-track' }));
}

export function select(options, value, onChange, label = '') {
  const node = el('select', {
    class: 'set-select',
    'aria-label': label,
    onChange: (event) => onChange(event.currentTarget.value),
  });
  options.forEach(([optionValue, text]) => {
    node.appendChild(el('option', { value: optionValue, text, selected: optionValue === value }));
  });
  return node;
}

export function slider({ value, min, max, step = 1, format, onInput, label = '' }) {
  const output = el('span', { class: 'set-value', text: format ? format(value) : String(value) });
  const input = el('input', {
    type: 'range',
    class: 'set-range',
    min: String(min),
    max: String(max),
    step: String(step),
    value: String(value),
    'aria-label': label,
    onInput: (event) => {
      const next = Number(event.currentTarget.value);
      output.textContent = format ? format(next) : String(next);
      onInput(next);
    },
  });
  return el('div', { class: 'set-slider' }, input, output);
}

export function textInput({ value = '', placeholder = '', onInput, onEnter, label = '', type = 'text' }) {
  const input = el('input', {
    type,
    class: 'set-input',
    value,
    placeholder,
    'aria-label': label,
  });
  if (onInput) input.addEventListener('input', () => onInput(input.value));
  if (onEnter) {
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        onEnter(input.value, input);
      }
    });
  }
  return input;
}

export function button(text, onClick, variant = 'secondary') {
  return el('button', { type: 'button', class: `btn btn-${variant}`, text, onClick });
}

export function section(title, ...children) {
  return el(
    'div',
    { class: 'set-section' },
    title ? el('h3', { class: 'set-section-title', text: title }) : null,
    ...children
  );
}
