'use client';
// Ruta: components/automations/runsLog.js
// Historial de ejecuciones de una automatización (y envíos de webhook).

import { useEffect, useState } from 'react';
import { ACTIONS, listRuns, webhookLog } from '../../lib/automations/api';
import { fullDate } from '../../lib/leads/format';

const STATUS = {
  ok: { label: 'OK', color: 'var(--color-success, #16a34a)' },
  partial: { label: 'Con errores', color: '#d97706' },
  error: { label: 'Error', color: 'var(--color-danger)' },
};
const RESULT = { ok: '✅', skipped: '⏭️', error: '❌' };

export default function RunsLog({ rule, userMap, onClose }) {
  const [runs, setRuns] = useState(null);
  const [hooks, setHooks] = useState([]);
  const [error, setError] = useState(null);
  const hasWebhook = (rule.actions ?? []).some((a) => a.type === 'webhook');

  useEffect(() => {
    listRuns(rule.id, 100).then(setRuns).catch((e) => setError(e.message));
    if (hasWebhook) webhookLog(rule.id).then(setHooks).catch(() => setHooks([]));
  }, [rule.id, hasWebhook]);

  return (
    <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h3 style={{ fontSize: '1rem' }}>Historial · {rule.name}</h3>
        <button className="btn btn-secondary" onClick={onClose}>
          Cerrar
        </button>
      </div>
      <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: 10 }}>Últimas 100 ejecuciones (se guardan 90 días).</p>
      {error && <p style={{ color: 'var(--color-danger)' }}>{error}</p>}
      {runs === null ? (
        <p>Cargando…</p>
      ) : runs.length === 0 ? (
        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Todavía no se ha ejecutado.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-border)' }}>
                <th style={{ padding: '6px 8px' }}>Fecha</th>
                <th style={{ padding: '6px 8px' }}>Lead</th>
                <th style={{ padding: '6px 8px' }}>Resultado</th>
                <th style={{ padding: '6px 8px' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--color-border)', verticalAlign: 'top' }}>
                  <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{fullDate(r.created_at)}</td>
                  <td style={{ padding: '6px 8px' }}>{r.lead_id ? <a href={`/leads/${r.lead_id}`}>Ver lead</a> : '—'}</td>
                  <td style={{ padding: '6px 8px', color: STATUS[r.status]?.color, fontWeight: 600 }}>{STATUS[r.status]?.label ?? r.status}</td>
                  <td style={{ padding: '6px 8px' }}>
                    {(r.log ?? []).map((l, i) => (
                      <div key={i}>
                        {RESULT[l.result] ?? '•'} {ACTIONS[l.type]?.label ?? l.type}
                        {l.user_id && userMap[l.user_id] ? ` → ${userMap[l.user_id].name}` : l.user_name ? ` → ${l.user_name}` : ''}
                        {l.status_name ? ` → ${l.status_name}` : ''}
                        {l.recipients ? ` (${l.recipients})` : ''}
                        {l.reason && <span style={{ color: 'var(--color-text-muted)' }}> — {l.reason}</span>}
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {hasWebhook && (
        <>
          <h4 style={{ fontSize: '0.9rem', margin: '1rem 0 6px' }}>Envíos de webhook (30 días)</h4>
          {hooks.length === 0 ? (
            <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>Sin envíos.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <tbody>
                {hooks.map((h) => (
                  <tr key={h.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '5px 8px', whiteSpace: 'nowrap' }}>{fullDate(h.created_at)}</td>
                    <td style={{ padding: '5px 8px' }}>{h.status === 'sent' ? '✅ Enviado' : h.status === 'failed' ? '❌ Falló' : '⏳ Pendiente'}</td>
                    <td style={{ padding: '5px 8px' }}>{h.response_status ? `HTTP ${h.response_status}` : ''}</td>
                    <td style={{ padding: '5px 8px' }}>{h.attempts} intento(s)</td>
                    <td style={{ padding: '5px 8px', color: 'var(--color-text-muted)' }}>{h.last_error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}