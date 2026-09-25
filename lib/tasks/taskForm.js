'use client';
// Ruta: components/tasks/taskForm.js
// Crear o editar una tarea. Se puede asignar a cualquier usuario de la
// organización; el lead es opcional.

import { useState } from 'react';
import { useSession } from '../../lib/auth/sessionContext';
import { trackEvent } from '../../lib/activity/tracker';
import {
  PRIORITY, TASK_STATUS, createTask, fromLocalInput, notifyTasksChanged, toLocalInput, updateTask,
} from '../../lib/tasks/api';

const label = { display: 'block', fontSize: '0.85rem', marginBottom: 4 };

export default function TaskForm({ task, leadId, leadName, opportunityId, users, onSaved, onCancel }) {
  const { user } = useSession();
  const editing = !!task;
  const [v, setV] = useState({
    title: task?.title ?? '',
    notes: task?.notes ?? '',
    assigned_to: task?.assigned_to ?? user?.id ?? '',
    priority: task?.priority ?? 'normal',
    status: task?.status ?? 'pending',
    due: toLocalInput(task?.due_at) || defaultDue(),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    if (!v.title.trim()) return setError('Escribe el título de la tarea.');
    if (!v.assigned_to) return setError('Elige el responsable.');
    setSaving(true);
    setError(null);
    try {
      const values = {
        title: v.title.trim(),
        notes: v.notes.trim() || null,
        assigned_to: v.assigned_to,
        priority: v.priority,
        due_at: fromLocalInput(v.due),
      };
      let saved;
      if (editing) {
        saved = await updateTask(task.id, { ...values, status: v.status });
        trackEvent('task.updated', { entityType: 'tasks', entityId: task.id });
      } else {
        saved = await createTask({ ...values, lead_id: leadId, opportunity_id: opportunityId });
        trackEvent('task.created', { entityType: 'tasks', entityId: saved.id, metadata: { lead_id: leadId ?? null } });
      }
      notifyTasksChanged();
      onSaved?.(saved);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: '0.75rem' }}>
      {(leadName || task?.lead) && (
        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
          Lead: <strong>{leadName ?? `${task.lead.first_name} ${task.lead.last_name ?? ''}`.trim()}</strong>
        </p>
      )}
      <label>
        <span style={label}>Tarea *</span>
        <input className="input" autoFocus required maxLength={200} value={v.title} onChange={set('title')} placeholder="Ej. Enviar cotización" />
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <label>
          <span style={label}>Responsable *</span>
          <select className="input" value={v.assigned_to} onChange={set('assigned_to')}>
            <option value="">Elegir…</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
                {u.id === user?.id ? ' (yo)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span style={label}>Fecha límite</span>
          <input className="input" type="datetime-local" value={v.due} onChange={set('due')} />
        </label>
        <label>
          <span style={label}>Prioridad</span>
          <select className="input" value={v.priority} onChange={set('priority')}>
            {Object.entries(PRIORITY).map(([k, p]) => (
              <option key={k} value={k}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        {editing && (
          <label>
            <span style={label}>Estado</span>
            <select className="input" value={v.status} onChange={set('status')}>
              {Object.entries(TASK_STATUS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <label>
        <span style={label}>Notas</span>
        <textarea className="input" rows={3} value={v.notes} onChange={set('notes')} style={{ resize: 'vertical', minHeight: 70 }} />
      </label>
      {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem' }}>{error}</p>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Guardando…' : editing ? 'Guardar' : 'Crear tarea'}
        </button>
      </div>
    </form>
  );
}

// Por defecto: mañana a las 9:00
function defaultDue() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return toLocalInput(d.toISOString());
}