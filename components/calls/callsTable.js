'use client';
// Ruta: components/calls/callsTable.js
// Tabla de llamadas: estado, resultado editable, duración y grabación.
// La usan la pantalla de Llamadas y la pestaña Llamadas del lead.

import { useState } from 'react';
import { useSession } from '../../lib/auth/sessionContext';
import { RESULTS, TECHNICAL_STATUS, fmtDuration, getRecordingUrl, setCallResult } from '../../lib/calls/api';
import { fullDate } from '../../lib/leads/format';
import { trackEvent } from '../../lib/activity/tracker';

const cell = { padding: '0.55rem 0.7rem', verticalAlign: 'middle' };

function recordingStatus(r) {
  const rec = Array.isArray(r.recording) ? r.recording[0] : r.recording;
  return rec?.status ?? null;
}

export default function CallsTable({ rows, users = {}, showLead = true, showUser = true, onChanged }) {
  const { user, can, scopeOf } = useSession();
  const [playing, setPlaying] = useState(null); // { id, url }
  const [msg, setMsg] = useState(null);
  const canListen = can('calls.recordings');
  const canEditOthers = ['branch', 'organization'].includes(scopeOf('calls.view'));

  async function play(id) {
    setMsg(null);
    try {
      const url = await getRecordingUrl(id);
      setPlaying({ id, url });
      trackEvent('call.recording_played', { entityType: 'calls', entityId: id });
    } catch (e) {
      setMsg(e.message);
    }
  }

  async function changeResult(id, value) {
    try {
      await setCallResult(id, value);
      onChanged?.();
    } catch (e) {
      setMsg(e.message);
    }
  }

  return (
    <>
      {msg && <p style={{ color: 'var(--color-danger)', fontSize: '0.84rem', marginBottom: 8 }}>{msg}</p>}
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-border)', fontSize: '0.78rem' }}>
              <th style={cell}>Fecha</th>
              {showLead && <th style={cell}>Contacto</th>}
              {showUser && <th style={cell}>Usuario</th>}
              <th style={cell}>Estado</th>
              <th style={cell}>Duración</th>
              <th style={cell}>Resultado</th>
              <th style={cell}>Grabación</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} style={{ ...cell, textAlign: 'center', padding: '1.5rem', color: 'var(--color-text-muted)' }}>
                  No hay llamadas.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const rec = recordingStatus(r);
              const editable = r.user_id === user?.id || canEditOthers;
              return (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ ...cell, whiteSpace: 'nowrap' }}>{fullDate(r.initiated_at)}</td>
                  {showLead && (
                    <td style={cell}>
                      {r.lead_id ? (
                        <a href={`/leads/${r.lead_id}?tab=llamadas`} style={{ color: 'var(--color-primary)' }}>
                          {[r.lead?.first_name, r.lead?.last_name].filter(Boolean).join(' ') || 'Lead'}
                        </a>
                      ) : (
                        <span>Externa</span>
                      )}
                      <div style={{ fontSize: '0.76rem', color: 'var(--color-text-muted)' }}>{r.to_e164}</div>
                    </td>
                  )}
                  {showUser && <td style={cell}>{users[r.user_id]?.name ?? '—'}</td>}
                  <td style={cell}>{TECHNICAL_STATUS[r.technical_status]}</td>
                  <td style={cell}>{fmtDuration(r.duration_seconds)}</td>
                  <td style={cell}>
                    {editable ? (
                      <select className="input" style={{ height: 32, minWidth: 150 }} value={r.commercial_result ?? ''} onChange={(e) => changeResult(r.id, e.target.value)}>
                        <option value="" disabled>
                          Sin resultado
                        </option>
                        {Object.entries(RESULTS).map(([k, l]) => (
                          <option key={k} value={k}>
                            {l}
                          </option>
                        ))}
                      </select>
                    ) : (
                      RESULTS[r.commercial_result] ?? '—'
                    )}
                    {r.notes && <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 2 }}>{r.notes}</div>}
                  </td>
                  <td style={cell}>
                    {rec === 'available' && canListen ? (
                      playing?.id === r.id ? (
                        <audio src={playing.url} controls autoPlay style={{ height: 32, maxWidth: 220 }} />
                      ) : (
                        <button className="btn btn-secondary" onClick={() => play(r.id)}>
                          ▶ Escuchar
                        </button>
                      )
                    ) : rec === 'pending' ? (
                      <span style={{ color: 'var(--color-text-muted)' }}>Procesando…</span>
                    ) : rec === 'failed' ? (
                      <span style={{ color: 'var(--color-danger)' }}>No disponible</span>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}