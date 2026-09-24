'use client';
// Ruta: components/leads/tagPicker.js

export default function TagPicker({ tags, value = [], onChange, disabled }) {
  if (!tags.length) {
    return <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>No hay etiquetas creadas.</p>;
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {tags.map((t) => {
        const on = value.includes(t.id);
        return (
          <button
            key={t.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(on ? value.filter((x) => x !== t.id) : [...value, t.id])}
            style={{
              padding: '0.2rem 0.65rem',
              borderRadius: 999,
              fontSize: '0.8rem',
              border: `1px solid ${t.color}`,
              background: on ? t.color : 'transparent',
              color: on ? '#fff' : 'var(--color-text)',
              cursor: disabled ? 'default' : 'pointer',
            }}
          >
            {t.name}
          </button>
        );
      })}
    </div>
  );
}

export function TagChips({ tagIds = [], tagMap }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {tagIds
        .map((id) => tagMap[id])
        .filter(Boolean)
        .map((t) => (
          <span
            key={t.id}
            style={{ padding: '0.05rem 0.5rem', borderRadius: 999, fontSize: '0.72rem', background: t.color, color: '#fff' }}
          >
            {t.name}
          </span>
        ))}
    </div>
  );
}

export function StatusPill({ status }) {
  if (!status) return <span style={{ color: 'var(--color-text-muted)' }}>—</span>;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '0.1rem 0.6rem',
        borderRadius: 999,
        fontSize: '0.78rem',
        border: `1px solid ${status.color}66`,
        background: `${status.color}22`,
        color: 'var(--color-text)',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: status.color }} />
      {status.name}
    </span>
  );
}