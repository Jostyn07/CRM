export default function KanbanCard({ lead }) {
  function handleDragStart(e) {
    e.dataTransfer.setData('text/plain', lead.id);
    e.dataTransfer.effectAllowed = 'move';
  }

  return (
    <a
      href={`/leads/${lead.id}`}
      draggable
      onDragStart={handleDragStart}
      style={{
        display: 'block',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 6,
        padding: '0.6rem 0.75rem',
        marginBottom: '0.5rem',
        cursor: 'grab',
      }}
    >
      <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{lead.name}</div>
      <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{lead.phone}</div>
    </a>
  );
}