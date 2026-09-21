// A focus timer that survives a page reload by storing the end time.

import { local } from './platform.js';
import { el, pad2, toast } from './util.js';

const KEY = 'timerState';

export function durationFor(mode, timerConfig) {
  const minutes = mode === 'break' ? timerConfig.breakMin : timerConfig.focusMin;
  return Math.max(1, minutes) * 60 * 1000;
}

export function remainingMs(state, now = Date.now()) {
  if (state.running && state.endsAt) return Math.max(0, state.endsAt - now);
  return Math.max(0, state.remaining);
}

export function freshState(mode, timerConfig) {
  const full = durationFor(mode, timerConfig);
  return { mode, running: false, endsAt: null, remaining: full, full };
}

/**
 * Bring a stored state in line with the current settings. An untouched timer
 * takes the new length; a paused one keeps its countdown.
 */
export function normalizeState(state, timerConfig) {
  if (!state) return freshState('focus', timerConfig);
  if (state.running) return state;
  const full = durationFor(state.mode, timerConfig);
  const untouched = state.full === undefined || state.remaining === state.full;
  return {
    ...state,
    full,
    remaining: untouched ? full : Math.min(state.remaining, full),
  };
}

export function formatDuration(ms) {
  const total = Math.ceil(ms / 1000);
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}

function chime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.18, 0.36].forEach((offset, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 660 + index * 110;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 0.18);
    });
    setTimeout(() => ctx.close(), 1200);
  } catch {
    /* audio is a nice-to-have */
  }
}

export async function renderTimer(container, config) {
  const timerConfig = config.timer;
  let state = normalizeState((await local.get(KEY))[KEY], timerConfig);

  const save = () => local.set({ [KEY]: state });

  const time = el('span', { class: 'timer-time' });
  const modeBtn = el('button', {
    type: 'button',
    class: 'timer-mode',
    title: 'Switch between focus and break',
  });
  const playBtn = el('button', { type: 'button', class: 'timer-btn' });
  const resetBtn = el('button', { type: 'button', class: 'timer-btn', text: '↺', title: 'Reset' });

  const paint = () => {
    const left = remainingMs(state);
    time.textContent = formatDuration(left);
    modeBtn.textContent = state.mode === 'break' ? 'Break' : 'Focus';
    playBtn.textContent = state.running ? '❙❙' : '▶';
    playBtn.title = state.running ? 'Pause' : 'Start';
    playBtn.setAttribute('aria-label', playBtn.title);
    container.classList.toggle('running', state.running);
    container.classList.toggle('break', state.mode === 'break');
  };

  const setMode = async (mode) => {
    state = freshState(mode, timerConfig);
    await save();
    paint();
  };

  const finish = async () => {
    const finished = state.mode;
    if (timerConfig.chime) chime();
    toast(finished === 'focus' ? 'Focus session done — take a break.' : 'Break over — back to it.');
    await setMode(finished === 'focus' ? 'break' : 'focus');
  };

  modeBtn.addEventListener('click', () => setMode(state.mode === 'focus' ? 'break' : 'focus'));

  playBtn.addEventListener('click', async () => {
    if (state.running) {
      state = { ...state, running: false, remaining: remainingMs(state), endsAt: null };
    } else {
      const left = remainingMs(state) || durationFor(state.mode, timerConfig);
      state = { ...state, running: true, remaining: left, endsAt: Date.now() + left };
    }
    await save();
    paint();
  });

  resetBtn.addEventListener('click', () => setMode(state.mode));

  container.replaceChildren(modeBtn, time, playBtn, resetBtn);
  paint();

  const handle = setInterval(() => {
    if (state.running && remainingMs(state) <= 0) finish();
    else paint();
  }, 500);

  return () => clearInterval(handle);
}
