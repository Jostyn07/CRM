'use client';
// Ruta: components/ai/leadAiPanel.js
// Asistente IA en la ficha del lead: resumen, siguiente paso (→ tarea) y
// datos detectados en las conversaciones (se muestran aparte, no se
// guardan en el lead).

import { useEffect, useState } from 'react';
import { useSession } from '../../lib/auth/sessionContext';
import { createTask } from '../../lib/tasks/api';
import { trackEvent } from '../../lib/activity/tracker';
import { relTime } from '../../lib/leads/format';
import { FIELD_LABELS, PRIORITY_LABEL, aiExtract, aiSummarize, getLeadAi } from '../../lib/ai/api';

function dueFrom(when) {
  const d = new Date();
  if (!when || when === 'hoy') d.setHours(Math.max(d.getHours() + 2, 9), 0, 0, 0);
  else if (when === 'mañana') {
    d.setDate(d.getDate() + 1);
    d.setHours(10, 0, 0, 0);
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(when)) return new Date(`${when}T10:00:00`).toISOString();
  return d.toISOString();
}

export default function LeadAiPanel({ lead }) {
  const { can, user } = useSession();
  const canSum = can('ai.summarize');
  const canExt = can('ai.extract');
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getLeadAi(lead.id).then((d) => {
      setData(d);
      if (d?.summary) setOpen(true);
    });
  }, [lead.id]);

  if (!canSum && !canExt) return null;

  async function run(kind, force = false) {
    setBusy(kind);
    setError(null);
    setMsg(null);
    try {
      const r = kind === 'summary' ? await aiSummarize(lead.id, force) : await aiExtract(lead.id, force);
      setData((d) => ({
        ...(d ?? {}),
        ...(kind === 'summary' ? { summary: r.summary, next_step: r.next_step, summary_at: r.at ?? new Date().toISOString() } : { extracted: r.extracted, extracted_at: r.at ?? new Date().toISOString() }),
      }));
      setOpen(true);
      if (r.cached) setMsg('Sin cambios desde la última vez: se muestra el resultado guardado (sin costo).');
      trackEvent(kind === 'summary' ? 'ai.summarize' : 'ai.extract', { entityType: 'leads', entityId: lead.id, metadata: { cached: !!r.cached } });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function toTask() {
    const s = data?.next_step;
    if (!s?.action) return;
    setBusy('task');
    setError(null);
    try {
      await createTask({
        title: s.action.slice(0, 200),
        notes: s.reason ? `Sugerido por la IA: ${s.reason}` : 'Sugerido por la IA',
        assigned_to: lead.assigned_user_id || user.id,
        priority: ['low', 'normal', 'high', 'urgent'].includes(s.priority) ? s.priority : 'normal',
        due_at: dueFrom(s.when),
        lead_id: lead.id,
      });
      setMsg('Tarea creada ✅');
      trackEvent('ai.next_step_task', { entityType: 'leads', entityId: lead.id });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  const fields = Object.entries(data?.extracted ?? {}).filter(([, v]) => v && (v.value ?? v) !== '');

  return (
    <div className="card" style={{ marginBottom: '1rem', borderLeft: '3px solid #8b5cf6' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => setOpen((v) => !v)} style={{ background: 'none', border: 'none', color: 'inherit', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer', padding: 0 }}>
          ✨ Asistente IA {open ? '▾' : '▸'}
        </button>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {canSum && (
            <button className="btn btn-secondary" style={{ height: 32 }} disabled={!!busy} onClick={() => run('summary', !!data?.summary)}>
              {busy === 'summary' ? 'Pensando…' : data?.summary ? '🔄 Actualizar resumen' : '✨ Resumir lead'}
            </button>
          )}
          {canExt && (
            <button className="btn btn-secondary" style={{ height: 32 }} disabled={!!busy} onClick={() => run('extract', !!data?.extracted)}>
              {busy === 'extract' ? 'Buscando…' : '📋 Detectar datos'}
            </button>
          )}
        </div>
      </div>

      {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.84rem', marginTop: 8 }}>{error}</p>}
      {msg && <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem', marginTop: 8 }}>{msg}</p>}

      {open && (
        <div style={{ marginTop: 10, display: 'grid', gap: 12 }}>
          {data?.summary ? (
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: 4 }}>Resumen · {data.summary_at ? relTime(data.summary_at) : ''}</div>
              <p style={{ fontSize: '0.88rem', whiteSpace: 'pre-line', lineHeight: 1.5 }}>{data.summary}</p>
            </div>
          ) : (
            canSum && <p style={{ fontSize: '0.84rem', color: 'var(--color-text-muted)' }}>Presiona “Resumir lead” para ver quién es, qué necesita y qué quedó pendiente.</p>
          )}

          {data?.next_step?.action && (
            <div style={{ padding: '0.6rem 0.75rem', borderRadius: 'var(--radius)', background: 'var(--color-active-bg)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                👉 Siguiente paso sugerido · {data.next_step.when ?? ''} · prioridad {PRIORITY_LABEL[data.next_step.priority] ?? 'normal'}
              </div>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', margin: '2px 0' }}>{data.next_step.action}</div>
              {data.next_step.reason && <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{data.next_step.reason}</div>}
              {can('tasks.create') && (
                <button className="btn btn-primary" style={{ height: 30, marginTop: 6 }} disabled={!!busy} onClick={toTask}>
                  {busy === 'task' ? 'Creando…' : '＋ Crear tarea'}
                </button>
              )}
            </div>
          )}

          {data?.extracted && (
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: 4 }}>
                📋 Datos detectados en las conversaciones · {data.extracted_at ? relTime(data.extracted_at) : ''} · solo informativos, no cambian el lead
              </div>
              {fields.length === 0 ? (
                <p style={{ fontSize: '0.84rem', color: 'var(--color-text-muted)' }}>No se encontraron datos en las conversaciones.</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                  <tbody>
                    {fields.map(([k, v]) => (
                      <tr key={k} style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <td style={{ padding: '4px 8px', color: 'var(--color-text-muted)', width: '38%' }}>{FIELD_LABELS[k] ?? k}</td>
                        <td style={{ padding: '4px 8px', fontWeight: 600 }}>{String(v.value ?? v)}</td>
                        <td style={{ padding: '4px 8px', fontSize: '0.76rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>{v.evidence ? `“${v.evidence}”` : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}