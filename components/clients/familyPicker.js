'use client';
// Ruta: components/clients/familyPicker.js
// Uno o varios clientes (p. ej. una familia que comparte el mismo número):
// con varios, una lista desplegable para elegir a la persona.

import { useEffect, useState } from 'react';
import ClientCard from './clientCard';

export default function FamilyPicker({ clients, compact = false, showLeads = true }) {
  const [id, setId] = useState(clients[0]?.id ?? '');
  useEffect(() => {
    if (!clients.some((c) => c.id === id)) setId(clients[0]?.id ?? '');
  }, [clients, id]);
  const current = clients.find((c) => c.id === id) ?? clients[0];
  if (!current) return null;

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {clients.length > 1 && (
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: '0.84rem' }}>
          <span style={{ fontWeight: 600 }}>👪 {clients.length} personas con este número:</span>
          <select className="input" style={{ height: 34, maxWidth: 320 }} value={current.id} onChange={(e) => setId(e.target.value)}>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name || 'Sin nombre'}
                {c.birth_date ? ` · ${c.birth_date.slice(0, 4)}` : ''}
                {c.archived ? ' (archivado)' : ''}
              </option>
            ))}
          </select>
        </label>
      )}
      <ClientCard client={current} compact={compact} showLeads={showLeads} />
    </div>
  );
}