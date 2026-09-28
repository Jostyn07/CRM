'use client';
// Ruta: components/calls/callsTable.js
// Tabla de llamadas: estado, resultado editable, duración y grabación.
// La usan la pantalla de Llamadas y la pestaña Llamadas del lead.

import { useState } from 'react';
import { useSession } from '../../lib/auth/sessionContext';
import { RESULTS, TECHNICAL_STATUS, fmtDuration, getRecordingUrl, setCallResult } from '../../lib/calls/api';
import { fullDate } from '../../lib/leads/format';
import { trackEvent } from '../../lib/activity/tracker';
import { aiTranscribe, getTranscript } from '../../lib/ai/api';

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
  const canTranscribe = canListen && can('ai.transcribe');
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
                      <div style={{ fontSize: '0.76rem', color: 'var(--color-text-muted)' }}>
                        {r.direction === 'inbound' ? '📥 ' : '📤 '}
                        {r.direction === 'inbound' ? r.from_e164 : r.to_e164}
                        {r.provider === '3cx' ? ` · 3CX${r.pbx_extension ? ` ext ${r.pbx_extension}` : ''}` : ''}
                      </div>
                    </td>
                  )}
                  {showUser && <td style={cell}>{users[r.user_id]?.name ?? (r.provider === '3cx' ? 'Sin asesor (3CX)' : '—')}</td>}
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
                    {rec === 'available' && canTranscribe && <Transcript callId={r.id} />}
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

// Transcripción y resumen con IA (a pedido)
function Transcript({ callId }) {
  const [state, setState] = useState(null); // { loading, data, error, open }

  async function open() {
    if (state?.data) return setState((s) => ({ ...s, open: !s.open }));
    setState({ loading: true });
    try {
      const saved = await getTranscript(callId);
      if (saved) return setState({ data: saved, open: true });
      const r = await aiTranscribe(callId);
      trackEvent('ai.transcribe', { entityType: 'calls', entityId: callId, metadata: { cached: !!r.cached } });
      setState({ data: { transcript: r.transcript, summary: r.summary }, open: true });
    } catch (e) {
      setState({ error: e.message });
    }
  }

  return (
    <div style={{ marginTop: 6, maxWidth: 360 }}>
      <button className="btn btn-secondary" style={{ height: 28, fontSize: '0.78rem' }} disabled={state?.loading} onClick={open}>
        {state?.loading ? 'Transcribiendo…' : state?.data ? (state.open ? 'Ocultar transcripción' : '📝 Ver transcripción') : '📝 Transcribir con IA'}
      </button>
      {state?.error && <div style={{ color: 'var(--color-danger)', fontSize: '0.76rem', marginTop: 4 }}>{state.error}</div>}
      {state?.open && state.data && (
        <div style={{ marginTop: 6, fontSize: '0.8rem' }}>
          {state.data.summary && (
            <p style={{ padding: '6px 8px', borderRadius: 6, background: 'var(--color-active-bg)', whiteSpace: 'pre-line', marginBottom: 6 }}>
              <strong>Resumen:</strong> {state.data.summary}
            </p>
          )}
          <details>
            <summary style={{ cursor: 'pointer', color: 'var(--color-text-muted)' }}>Transcripción completa</summary>
            <p style={{ whiteSpace: 'pre-wrap', maxHeight: 240, overflowY: 'auto', marginTop: 4 }}>{state.data.transcript}</p>
          </details>
        </div>
      )}
    </div>
  );
}