import Button from '../ui/button';

const STAGE_COLORS = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#64748b'];

export function stageColors() {
  return STAGE_COLORS;
}

export default function StageEditor({
  stage,
  index,
  total,
  editing,
  editState,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.5rem',
        border: '1px solid var(--color-border)',
        borderRadius: 6,
      }}
    >
      {editing ? (
        <>
          <input
            className="input"
            value={editState.name}
            onChange={(e) => editState.setName(e.target.value)}
            style={{ flex: 1 }}
          />
          <select
            value={editState.color}
            onChange={(e) => editState.setColor(e.target.value)}
            style={{ padding: '0.4rem' }}
          >
            {STAGE_COLORS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <Button onClick={onSaveEdit}>Guardar</Button>
          <Button variant="secondary" onClick={onCancelEdit}>Cancelar</Button>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <button
              className="btn btn-secondary"
              style={{ padding: '0.1rem 0.4rem', fontSize: '0.7rem' }}
              onClick={onMoveUp}
              disabled={index === 0}
              title="Subir"
            >
              ▲
            </button>
            <button
              className="btn btn-secondary"
              style={{ padding: '0.1rem 0.4rem', fontSize: '0.7rem' }}
              onClick={onMoveDown}
              disabled={index === total - 1}
              title="Bajar"
            >
              ▼
            </button>
          </div>
          <span
            style={{ width: 12, height: 12, borderRadius: '50%', background: stage.color || '#999', flexShrink: 0 }}
          />
          <span style={{ flex: 1 }}>{stage.name}</span>
          <Button variant="secondary" onClick={onStartEdit}>Editar</Button>
          <Button variant="danger" onClick={onDelete}>Eliminar</Button>
        </>
      )}
    </div>
  );
}