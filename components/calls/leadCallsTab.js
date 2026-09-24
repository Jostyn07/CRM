'use client';
// Ruta: components/calls/leadCallsTab.js
// Pestaña "Llamadas" de la ficha del lead.

import { useCallback, useEffect, useState } from 'react';
import CallsTable from './callsTable';
import { useSession } from '../../lib/auth/sessionContext';
import { useCalls } from '../../lib/calls/callContext';
import { listCalls } from '../../lib/calls/api';

export default function LeadCallsTab({ lead, users }) {
  const { can } = useSession();
  const { openDialer, phase } = useCalls();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await listCalls({ pageSize: 100, filters: { leadId: lead.id } });
      setRows(res.rows);
    } catch (e) {
      setError(e.message);
    }
  }, [lead.id]);

  useEffect(() => {
    load();
  }, [load]);

  // Al terminar una llamada, refresca la lista
  useEffect(() => {
    if (phase === 'idle') load();
  }, [phase, load]);

  return (
    <div>
      {can('calls.make') && lead.phone_normalized && !lead.deleted_at && (
        <button
          className="btn btn-primary"
          style={{ marginBottom: '0.8rem' }}
          onClick={() => openDialer({ to: lead.phone_normalized, leadId: lead.id, leadName: `${lead.first_name} ${lead.last_name ?? ''}`.trim() })}
        >
          📞 Llamar a {lead.phone_normalized}
        </button>
      )}
      {!can('calls.view') ? (
        <p style={{ color: 'var(--color-text-muted)' }}>No tienes permiso para ver llamadas.</p>
      ) : error ? (
        <p style={{ color: 'var(--color-danger)' }}>{error}</p>
      ) : !rows ? (
        <p>Cargando…</p>
      ) : (
        <CallsTable rows={rows} users={users} showLead={false} onChanged={load} />
      )}
    </div>
  );
}