'use client';
// Ruta: components/tasks/taskDetail.js
// Detalle de una tarea: edición y su historial de cambios.

import { useEffect, useState } from 'react';
import TaskForm from './taskForm';
import { fullDate } from '../../lib/leads/format';
import { PRIORITY, TASK_STATUS, getTaskHistory } from '../../lib/tasks/api';

const ACTION = {
  created: 'Creó la tarea',
  updated: 'Editó la tarea',
  completed: 'Completó la tarea',
  reopened: 'Reabrió la tarea',
  cancelled: 'Canceló la tarea',
  reassigned: 'Reasignó la tarea',
};

const FIELD = {
  title: 'título',
  notes: 'notas',
  assigned_to: 'responsable',
  priority: 'prioridad',
  status: 'estado',
  due_at: 'fecha límite',
  lead_id: 'lead',
  opportunity_id: 'oportunidad',
};

export default function TaskDetail({ task, users, userMap, onSaved, onClose }) {
  const [history, setHistory] = useState(null);

  useEffect(() => {
    getTaskHistory(task.id).then(setHistory).catch(() => setHistory([]));
  }, [task.id, task.updated_at]);

  const show = (k, val) => {
    if (val === null || val === undefined || val === '') return '—';
    if (k === 'assigned_to') return userMap[val]?.name ?? '—';
    if (k === 'priority') return PRIORITY[val]?.label ?? val;
    if (k === 'status') return TASK_STATUS[val] ?? val;
    if (k === 'due_at') return fullDate(val);
    if (k === 'notes' || k === 'lead_id' || k === 'opportunity_id') return null;
    return String(val);
  };

  return (
    <div style={{ display: 'grid', gap: '1.2rem' }}>
      <TaskForm task={task} users={users} onSaved={onSaved} onCancel={onClose} />

      <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', display: 'grid', gap: 2 }}>
        <span>Creada por {userMap[task.created_by]?.name ?? '—'} · {fullDate(task.created_at)}</span>
        {task.completed_at && (
          <span>
            Completada por {userMap[task.completed_by]?.name ?? '—'} · {fullDate(task.completed_at)}
          </span>
        )}
      </div>

      <div>
        <h4 style={{ fontSize: '0.9rem', marginBottom: 6 }}>Historial</h4>
        {!history ? (
          <p style={{ fontSize: '0.85rem' }}>Cargando…</p>
        ) : (
          <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)' }}>
            {history.map((h) => (
              <div key={h.id} style={{ padding: '0.45rem 0.7rem', borderBottom: '1px solid var(--color-border)', fontSize: '0.8rem' }}>
                <div>
                  <strong>{userMap[h.user_id]?.name ?? 'Sistema'}</strong> · {ACTION[h.action] ?? h.action}
                  <span style={{ color: 'var(--color-text-muted)' }}> · {fullDate(h.created_at)}</span>
                </div>
                {h.action !== 'created' && (
                  <div style={{ color: 'var(--color-text-muted)' }}>
                    {Object.entries(h.changes ?? {}).map(([k, c]) => {
                      const from = show(k, c?.from);
                      const to = show(k, c?.to);
                      return (
                        <div key={k}>
                          {from === null ? `Cambió ${FIELD[k] ?? k}` : `${FIELD[k] ?? k}: ${from} → ${to}`}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}