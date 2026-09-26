'use client';
// Ruta: components/whatsapp/waModeToggle.js
// Botón para cambiar entre el WhatsApp de la plataforma y la ventana de
// Wazzup. La elección se recuerda por usuario (en este navegador).

export default function WaModeToggle({ mode, onChange, compact = false }) {
  const opt = (value, label, title) => (
    <button
      type="button"
      title={title}
      onClick={() => onChange(value)}
      style={{
        border: 'none',
        padding: compact ? '4px 10px' : '6px 14px',
        fontSize: compact ? '0.76rem' : '0.82rem',
        fontWeight: 600,
        cursor: 'pointer',
        borderRadius: 999,
        background: mode === value ? (value === 'wazzup' ? '#25D366' : 'var(--color-primary)') : 'transparent',
        color: mode === value ? '#fff' : 'var(--color-text)',
      }}
    >
      {label}
    </button>
  );
  return (
    <div style={{ display: 'inline-flex', gap: 2, padding: 3, borderRadius: 999, border: '1px solid var(--color-border)', background: 'var(--color-active-bg)' }}>
      {opt('app', '💬 Plataforma', 'Usar el WhatsApp de la plataforma')}
      {opt('wazzup', '🟩 Wazzup', 'Usar la ventana de Wazzup (incluye el historial anterior)')}
    </div>
  );
}