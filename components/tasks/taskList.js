'use client';
// Ruta: components/tasks/taskList.js
// Lista de tareas: casilla para completar, vencidas en rojo, prioridad,
// responsable y lead. Al hacer clic se abre el detalle.

import { useEffect, useState } from 'react';
import { trackEvent } from '../../lib/activity/tracker';
import { PRIORITY, TASK_STATUS, dueLabel, getCommentCounts, isOpen, isOverdue, notifyTasksChanged, updateTask } from '../../lib/tasks/api';

export default function TaskList({ tasks, userMap, onOpen, onChanged, showLead = true, showAssignee = true, empty = 'No hay tareas.' }) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [comments, setComments] = useState({});
  const ids = tasks.map((t) => t.id).join(',');

  useEffect(() => {
    let alive = true;
    getCommentCounts(ids ? ids.split(',') : []).then((c) => alive && setComments(c));
    return () => {
      alive = false;
    };
  }, [ids]);

  async function toggle(t) {
    setBusy(t.id);
    setError(null);
    try {
      const next = isOpen(t) ? 'completed' : 'pending';
      const saved = await updateTask(t.id, { status: next });
      trackEvent(next === 'completed' ? 'task.completed' : 'task.reopened', { entityType: 'tasks', entityId: t.id });
      notifyTasksChanged();
      onChanged?.(saved);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  if (!tasks.length) {
    return <p style={{ padding: '0.9rem', color: 'var(--color-text-muted)', fontSize: '0.88rem' }}>{empty}</p>;
  }

  return (
    <div>
      {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem', padding: '0.5rem 0.9rem' }}>{error}</p>}
      {tasks.map((t) => {
        const overdue = isOverdue(t);
        const done = t.status === 'completed';
        const cancelled = t.status === 'cancelled';
        const p = PRIORITY[t.priority] ?? PRIORITY.normal;
        return (
          <div
            key={t.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '0.6rem 0.9rem',
              borderBottom: '1px solid var(--color-border)',
              borderLeft: overdue ? '3px solid var(--color-danger)' : '3px solid transparent',
              background: overdue ? 'rgba(220,38,38,0.05)' : 'transparent',
            }}
          >
            <input
              type="checkbox"
              aria-label={done ? 'Reabrir tarea' : 'Completar tarea'}
              checked={done}
              disabled={busy === t.id || cancelled}
              onChange={() => toggle(t)}
              style={{ width: 18, height: 18, cursor: 'pointer', flexShrink: 0 }}
            />
            <button
              onClick={() => onOpen?.(t)}
              style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit' }}
            >
              <div
                style={{
                  fontWeight: 500,
                  fontSize: '0.9rem',
                  textDecoration: done || cancelled ? 'line-through' : 'none',
                  color: done || cancelled ? 'var(--color-text-muted)' : 'inherit',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {t.title}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 2 }}>
                <span style={{ color: overdue ? 'var(--color-danger)' : undefined, fontWeight: overdue ? 600 : 400 }}>
                  {overdue ? '⚠ Vencida · ' : ''}
                  {dueLabel(t)}
                </span>
                {showAssignee && <span>👤 {userMap[t.assigned_to]?.name ?? '—'}</span>}
                {showLead && t.lead && (
                  <a href={`/leads/${t.lead.id}`} onClick={(e) => e.stopPropagation()} style={{ color: 'var(--color-primary)' }}>
                    {`${t.lead.first_name} ${t.lead.last_name ?? ''}`.trim()}
                  </a>
                )}
                {comments[t.id] > 0 && <span title="Respuestas">💬 {comments[t.id]}</span>}
                {!isOpen(t) && <span>{TASK_STATUS[t.status]}</span>}
              </div>
            </button>
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 999,
                color: p.color,
                background: `${p.color}1A`,
                flexShrink: 0,
              }}
            >
              {p.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}