'use client';
// Ruta: components/leads/leadTimeline.js
// Timeline del lead (Fase 3): eventos reales generados por la base de
// datos + notas. El autor puede editar su nota durante 15 minutos.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase/client';
import { useSession } from '../../lib/auth/sessionContext';
import { trackEvent } from '../../lib/activity/tracker';
import { fullDate, relTime } from '../../lib/leads/format';
import { NOTE_EDIT_MINUTES, addNote, canEditNote, editNote, getLeadTimeline } from '../../lib/tasks/api';

const ICON = {
  lead_created: '✨',
  lead_assigned: '👤',
  lead_updated: '✏️',
  funnel_changed: '🔀',
  whatsapp_received: '💬',
  whatsapp_sent: '💬',
  call_started: '📞',
  call_completed: '📞',
  note_created: '📝',
  task_created: '✅',
  task_completed: '✅',
};

const CALL_STATUS = {
  contestada: 'contestada',
  finalizada: 'finalizada',
  no_contesto: 'no contestó',
  ocupado: 'ocupado',
  fallida: 'fallida',
  cancelada: 'cancelada',
};

const FIELD = {
  first_name: 'nombre',
  last_name: 'apellido',
  phone_raw: 'teléfono',
  email: 'correo',
  company_name: 'empresa',
  country: 'país',
  state: 'estado/departamento',
  city: 'ciudad',
  address: 'dirección',
  status_id: 'estado',
  source_id: 'fuente',
  branch_id: 'sucursal',
  custom_data: 'campos personalizados',
  deleted_at: 'papelera',
};

const CONTACT_TYPES = ['call_completed', 'whatsapp_received', 'whatsapp_sent', 'note_created'];

function duration(s) {
  const n = Number(s) || 0;
  return n >= 60 ? `${Math.floor(n / 60)} min ${n % 60} s` : `${n} s`;
}

function describe(a) {
  const m = a.metadata ?? {};
  switch (a.type) {
    case 'lead_created':
      return 'Creó el lead';
    case 'lead_assigned':
      if (!m.to_user_id) return `Quitó el responsable${m.from_name ? ` (${m.from_name})` : ''}`;
      return m.from_name ? `Reasignó de ${m.from_name} a ${m.to_name}` : `Asignó a ${m.to_name}`;
    case 'lead_updated': {
      if (m.action === 'deleted') return 'Envió el lead a la papelera';
      if (m.action === 'restored') return 'Restauró el lead de la papelera';
      const parts = [];
      if (m.to_status) parts.push(`cambió el estado de ${m.from_status ?? '—'} a ${m.to_status}`);
      if (m.to_branch) parts.push(`lo movió de ${m.from_branch ?? '—'} a ${m.to_branch}`);
      const others = (m.fields ?? []).filter((f) => !['status_id', 'branch_id', 'deleted_at'].includes(f)).map((f) => FIELD[f] ?? f);
      if (others.length) parts.push(`editó ${others.join(', ')}`);
      const text = parts.join('; ') || 'Editó el lead';
      return text.charAt(0).toUpperCase() + text.slice(1);
    }
    case 'funnel_changed':
      if (m.created) return `Creó la oportunidad "${m.title}" en ${m.funnel} · ${m.to_stage}`;
      if (m.status === 'won') return `Ganó la oportunidad "${m.title}"`;
      if (m.status === 'lost') return `Perdió la oportunidad "${m.title}"`;
      return `Movió "${m.title}" ${m.from_stage ? `de ${m.from_stage} ` : ''}a ${m.to_stage}`;
    case 'call_started':
      return `Inició una llamada a ${m.to ?? ''}`;
    case 'call_completed':
      return `Llamada ${CALL_STATUS[m.status] ?? m.status ?? 'terminada'} · ${duration(m.duration_seconds)}`;
    case 'whatsapp_received':
      return 'Recibió un WhatsApp';
    case 'whatsapp_sent':
      return 'Envió un WhatsApp';
    case 'note_created':
      return 'Agregó una nota';
    case 'task_created':
      return `Creó la tarea "${m.title}"${m.assigned_name ? ` para ${m.assigned_name}` : ''}`;
    case 'task_completed':
      return `Completó la tarea "${m.title}"`;
    default:
      return a.type;
  }
}

export default function LeadTimeline({ leadId, userMap, deleted, onContact }) {
  const { user } = useSession();
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [onlyContacts, setOnlyContacts] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editText, setEditText] = useState('');
  const [, setTick] = useState(0);

  const load = useCallback(async () => {
    try {
      setItems(await getLeadTimeline(leadId));
    } catch (e) {
      setError(e.message);
    }
  }, [leadId]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`lead-timeline-${leadId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lead_activities', filter: `lead_id=eq.${leadId}` }, load)
      .subscribe();
    // El botón "Editar" desaparece al pasar los 15 minutos
    const timer = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(timer);
    };
  }, [leadId, load]);

  async function submitNote(e) {
    e.preventDefault();
    if (!note.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const created = await addNote(leadId, note.trim());
      setItems((prev) => [created, ...(prev ?? []).filter((x) => x.id !== created.id)]);
      setNote('');
      trackEvent('lead.note_created', { entityType: 'leads', entityId: leadId });
      onContact?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(id) {
    if (!editText.trim()) return;
    setError(null);
    try {
      const saved = await editNote(id, editText.trim());
      setItems((prev) => prev.map((x) => (x.id === id ? saved : x)));
      setEditId(null);
      trackEvent('lead.note_edited', { entityType: 'leads', entityId: leadId, metadata: { activity_id: id } });
    } catch (err) {
      setError(err.message);
    }
  }

  const visible = (items ?? []).filter((a) => !onlyContacts || CONTACT_TYPES.includes(a.type));

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      {!deleted && (
        <form className="card" onSubmit={submitNote} style={{ display: 'grid', gap: 8 }}>
          <textarea
            className="input"
            rows={3}
            placeholder="Escribe una nota sobre este lead…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={{ resize: 'vertical', minHeight: 70 }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
              Podrás editarla durante {NOTE_EDIT_MINUTES} minutos.
            </span>
            <button className="btn btn-primary" disabled={saving || !note.trim()}>
              {saving ? 'Guardando…' : 'Agregar nota'}
            </button>
          </div>
        </form>
      )}

      {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem' }}>{error}</p>}

      <div className="card" style={{ padding: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.9rem', borderBottom: '1px solid var(--color-border)' }}>
          <h3 style={{ fontSize: '0.95rem' }}>Línea de tiempo</h3>
          <label style={{ fontSize: '0.8rem', display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked={onlyContacts} onChange={(e) => setOnlyContacts(e.target.checked)} />
            Solo contactos
          </label>
        </div>

        {!items ? (
          <p style={{ padding: '0.9rem' }}>Cargando…</p>
        ) : !visible.length ? (
          <p style={{ padding: '0.9rem', color: 'var(--color-text-muted)', fontSize: '0.88rem' }}>Todavía no hay actividad.</p>
        ) : (
          visible.map((a) => {
            const contact = CONTACT_TYPES.includes(a.type);
            return (
              <div key={a.id} style={{ display: 'flex', gap: 12, padding: '0.65rem 0.9rem', borderBottom: '1px solid var(--color-border)' }}>
                <span
                  aria-hidden
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    fontSize: '0.9rem',
                    background: contact ? 'var(--color-active-bg)' : 'var(--color-border)',
                  }}
                >
                  {ICON[a.type] ?? '•'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.86rem' }}>
                    <strong>{a.actor_id ? userMap[a.actor_id]?.name ?? 'Usuario' : 'Sistema'}</strong> · {describe(a)}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }} title={fullDate(a.created_at)}>
                    {relTime(a.created_at)}
                    {a.edited_at && ' · editada'}
                  </div>

                  {a.type === 'note_created' &&
                    (editId === a.id ? (
                      <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
                        <textarea className="input" rows={3} value={editText} onChange={(e) => setEditText(e.target.value)} />
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button type="button" className="btn btn-secondary" onClick={() => setEditId(null)}>
                            Cancelar
                          </button>
                          <button type="button" className="btn btn-primary" onClick={() => saveEdit(a.id)}>
                            Guardar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        style={{
                          marginTop: 6,
                          padding: '0.55rem 0.7rem',
                          borderRadius: 'var(--radius)',
                          background: 'var(--color-active-bg)',
                          fontSize: '0.86rem',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                        }}
                      >
                        {a.body}
                        {canEditNote(a, user?.id) && !deleted && (
                          <div style={{ textAlign: 'right' }}>
                            <button
                              type="button"
                              onClick={() => {
                                setEditId(a.id);
                                setEditText(a.body);
                              }}
                              style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', fontSize: '0.78rem' }}
                            >
                              Editar
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}