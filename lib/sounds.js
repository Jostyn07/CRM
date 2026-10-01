'use client';
// Ruta: lib/sounds.js
// Sonidos de mensajes (Comunicación y WhatsApp), generados con Web Audio:
// no requieren archivos de audio. Cada usuario los activa o silencia en su
// navegador (se guarda en localStorage; si no hay acceso, quedan activos).

const KEY = 'xiris.sounds';
let ctx = null;
let lastPlay = 0;

export function isSoundOn() {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setSoundOn(on) {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* sin almacenamiento: solo cambia en esta sesión */
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('sounds:change', { detail: on }));
}

function audio() {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

// Desbloquea el audio con el primer clic o tecla (los navegadores lo exigen)
if (typeof window !== 'undefined') {
  const unlock = () => {
    audio();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

function tone(c, freq, start, dur, vol) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(vol, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

function play(notes) {
  if (!isSoundOn()) return;
  const now = Date.now();
  if (now - lastPlay < 250) return; // evita ráfagas al llegar varios a la vez
  lastPlay = now;
  const c = audio();
  if (!c || c.state !== 'running') return;
  const t = c.currentTime + 0.01;
  notes.forEach(([f, at, dur, vol]) => tone(c, f, t + at, dur, vol));
}

// Enviado: un "pop" corto ascendente
export function playSent() {
  play([[660, 0, 0.09, 0.08], [990, 0.05, 0.1, 0.06]]);
}

// Recibido: dos notas suaves (campanilla)
export function playReceived() {
  play([[880, 0, 0.16, 0.12], [1318.5, 0.11, 0.24, 0.1]]);
}