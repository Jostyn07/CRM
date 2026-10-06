'use client';
// Ruta: lib/sounds.js
// Sonidos de mensajes (Comunicación y WhatsApp), generados con Web Audio:
// no requieren archivos de audio. Cada usuario los activa o silencia en su
// navegador (se guarda en localStorage; si no hay acceso, quedan activos).
// Cada canal se silencia por separado: 'chat' (Comunicación) y 'wa' (WhatsApp).

const KEY = 'xiris.sounds'; // valor anterior (común a ambos), solo como respaldo
const keyOf = (ch) => `${KEY}.${ch === 'wa' ? 'wa' : 'chat'}`;
let ctx = null;
let lastPlay = 0;

export function isSoundOn(ch = 'chat') {
  try {
    const v = localStorage.getItem(keyOf(ch));
    return (v ?? localStorage.getItem(KEY)) !== 'off';
  } catch {
    return true;
  }
}

export function setSoundOn(on, ch = 'chat') {
  try {
    localStorage.setItem(keyOf(ch), on ? 'on' : 'off');
  } catch {
    /* sin almacenamiento: solo cambia en esta sesión */
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('sounds:change', { detail: { on, ch: ch === 'wa' ? 'wa' : 'chat' } }));
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

function tone(c, freq, start, dur, vol, type = 'triangle') {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(vol, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

function play(notes, ch) {
  if (!isSoundOn(ch)) return;
  const now = Date.now();
  if (now - lastPlay < 250) return; // evita ráfagas al llegar varios a la vez
  lastPlay = now;
  const c = audio();
  if (!c || c.state !== 'running') return;
  const t = c.currentTime + 0.01;
  notes.forEach(([f, at, dur, vol, type]) => tone(c, f, t + at, dur, vol, type));
}

// Enviado: "pop" doble, claro y ascendente
export function playSent(ch = 'chat') {
  play([
    [784, 0, 0.12, 0.35],
    [1175, 0.07, 0.16, 0.3],
    [2350, 0.07, 0.08, 0.06, 'sine'],
  ], ch);
}

// Recibido: campanilla de tres notas, más larga y fuerte (se oye aunque
// estés en otra pestaña o con música de fondo)
export function playReceived(ch = 'chat') {
  play([
    [988, 0, 0.22, 0.45],
    [1319, 0.13, 0.22, 0.45],
    [1760, 0.26, 0.45, 0.5],
    [3520, 0.26, 0.2, 0.08, 'sine'],
  ], ch);
}