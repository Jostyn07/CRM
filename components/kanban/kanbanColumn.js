'use client';

import { useState } from 'react';
import KanbanCard from './kanbanCard';

export default function KanbanColumn({ stage, leads, onDropLead }) {
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
    if (leadId) onDropLead(leadId, stage.id);
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        minWidth: 240,
        background: dragOver ? '#eef2ff' : 'var(--color-bg)',
        border: '1px solid var(--color-border)',
        borderRadius: 8,
        padding: '0.75rem',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: '0.75rem' }}>
        <span
          style={{ width: 10, height: 10, borderRadius: '50%', background: stage.color || '#999' }}
        />
        <strong style={{ fontSize: '0.9rem' }}>{stage.name}</strong>
        <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>({leads.length})</span>
      </div>

      <div>
        {leads.map((lead) => (
          <KanbanCard key={lead.id} lead={lead} />
        ))}
        {leads.length === 0 && (
          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Sin leads aquí.</p>
        )}
      </div>
    </div>
  );
}