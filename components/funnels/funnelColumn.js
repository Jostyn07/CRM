'use client';

import { useState } from 'react';
import Button from '../ui/button';

export default function FunnelColumn({
  funnel,
  leads,
  total,
  loadingMore,
  onLoadMore,
  editing,
  editState,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onDropLead,
}) {
  const [dragOver, setDragOver] = useState(false);

  function handleDragOver(e) {
    e.preventDefault();
    setDragOver(true);
  }
  function handleDragLeave() {
    setDragOver(false);
  }
  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const leadId = e.dataTransfer.getData('text/plain');
    if (leadId) onDropLead(leadId, funnel.id);
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="card"
      style={{
        minWidth: 260,
        maxWidth: 260,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        maxHeight: 'calc(100vh - 8rem)',
        background: dragOver ? 'rgba(99, 102, 241, 0.14)' : 'var(--color-surface)',
      }}
    >
      {editing ? (
        <div style={{ marginBottom: '0.75rem' }}>
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
            style={{ marginBottom: '0.5rem' }}
          />
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <Button onClick={onSaveEdit}>Guardar</Button>
            <Button variant="secondary" onClick={onCancelEdit}>Cancelar</Button>
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 4 }}>
            <h2 style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 6 }}>
              {funnel.name}
              {funnel.is_protected && (
                <span title="Embudo obligatorio" style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                  🔒
                </span>
              )}
            </h2>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', flexShrink: 0 }}>
              {total}
            </span>
          </div>
          {funnel.description && (
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
              {funnel.description}
            </p>
          )}
          <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
            <button
              onClick={onStartEdit}
              className="btn btn-secondary"
              style={{ fontSize: '0.78rem', padding: '0.35rem 0.6rem' }}
            >
              Editar
            </button>
            {!funnel.is_protected && (
              <button
                onClick={onDelete}
                className="btn btn-secondary"
                style={{ fontSize: '0.78rem', padding: '0.35rem 0.6rem', color: 'var(--color-danger)' }}
              >
                Eliminar
              </button>
            )}
          </div>
        </div>
      )}

      <div className="scroll-y" style={{ overflowY: 'auto', display: 'grid', gap: '0.5rem' }}>
        {leads.map((lead) => (
          <a
            key={lead.id}
            href={`/leads/${lead.id}`}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('text/plain', lead.id);
              e.dataTransfer.effectAllowed = 'move';
            }}
            style={{
              display: 'block',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              padding: '0.5rem 0.65rem',
              cursor: 'grab',
            }}
          >
            <div style={{ fontSize: '0.88rem', fontWeight: 500 }}>{lead.name}</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>{lead.phone}</div>
          </a>
        ))}
        {leads.length === 0 && (
          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
            Arrastra un lead aquí.
          </p>
        )}
        {leads.length < total && (
          <button
            className="btn btn-secondary"
            onClick={onLoadMore}
            disabled={loadingMore}
            style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}
          >
            {loadingMore ? 'Cargando…' : `Cargar más (${leads.length} de ${total})`}
          </button>
        )}
      </div>
    </div>
  );
}