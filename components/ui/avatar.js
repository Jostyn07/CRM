// Ruta: components/ui/avatar.js
// Círculo con las iniciales de una persona (o su foto si existe).

export function initials(name) {
  const parts = String(name || '')
    .replace(/@.*/, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : parts[0][1] ?? '';
  return (first + last).toUpperCase();
}

// Tonos suaves y estables por persona (mismo nombre → mismo color)
const TONES = [
  ['#f1e2c4', '#8a6421'],
  ['#e3ecf9', '#2f5ea8'],
  ['#e5f3ea', '#2d7a50'],
  ['#f6e3e1', '#a2423b'],
  ['#ece6f6', '#5e4796'],
  ['#e6f1f3', '#2f6f7a'],
];
function tone(name) {
  let h = 0;
  for (const ch of String(name || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length];
}

export default function Avatar({ name, src, size = 32, gold = false, style }) {
  const [bg, fg] = gold ? TONES[0] : tone(name);
  return (
    <span className="avatar" title={name || undefined} style={{ width: size, height: size, fontSize: Math.round(size * 0.38), background: bg, color: fg, overflow: 'hidden', ...style }}>
      {src ? <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials(name)}
    </span>
  );
}