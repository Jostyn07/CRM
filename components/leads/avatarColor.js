// Paleta suave (fondo translúcido + color de texto a juego) — sin
// colores chillones, para que cada contacto sea reconocible sin
// competir visualmente con el resto de la tarjeta.
const PALETTE = [
  { bg: 'rgba(139,141,247,0.18)', color: '#a5a6fb' }, // lavanda
  { bg: 'rgba(236,72,153,0.18)', color: '#f472b6' },  // rosa
  { bg: 'rgba(59,130,246,0.18)', color: '#60a5fa' },  // azul
  { bg: 'rgba(34,197,94,0.18)', color: '#4ade80' },   // verde
  { bg: 'rgba(251,191,36,0.18)', color: '#fbbf24' },  // ámbar
  { bg: 'rgba(45,212,191,0.18)', color: '#2dd4bf' },  // teal
];

export function getInitials(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function getAvatarColors(name) {
  const str = name || '';
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const idx = Math.abs(hash) % PALETTE.length;
  return PALETTE[idx];
}