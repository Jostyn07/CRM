import Button from '../ui/button';

export default function FunnelCard({ funnel, editing, editState, onStartEdit, onCancelEdit, onSaveEdit, onDelete }) {
  if (editing) {
    return (
      <div className="card">
        <input
          className="input"
          value={editState.name}
          onChange={(e) => editState.setName(e.target.value)}
          style={{ marginBottom: '0.5rem' }}
        />
        <input
          className="input"
          value={editState.description}
          onChange={(e) => editState.setDescription(e.target.value)}
          placeholder="Descripción (opcional)"
          style={{ marginBottom: '0.75rem' }}
        />
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Button onClick={onSaveEdit}>Guardar</Button>
          <Button variant="secondary" onClick={onCancelEdit}>Cancelar</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ fontSize: '1.05rem', marginBottom: 2 }}>{funnel.name}</h2>
          {funnel.description && (
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginBottom: 6 }}>
              {funnel.description}
            </p>
          )}
          <p style={{ fontSize: '0.85rem' }}>
            {funnel.leadCount} leads · {funnel.funnel_stages?.length ?? 0} etapas
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
          <a href={`/funnels/${funnel.id}`} className="btn btn-secondary">Etapas</a>
          <Button variant="secondary" onClick={onStartEdit}>Editar</Button>
          <Button variant="danger" onClick={onDelete}>Eliminar</Button>
        </div>
      </div>
    </div>
  );
}