'use client';
// Ruta: components/tasks/taskRow.js
// Fila de tarea (pantalla Tareas): casilla, tipo, título y nota, lead y
// empresa, vencimiento, responsable, prioridad y menú de acciones.

import { useEffect, useRef, useState } from 'react';
import Icon from '../ui/icon';
import Avatar from '../ui/avatar';
import { PRIORITY, isOpen, isOverdue } from '../../lib/tasks/api';

// Tipo visual según el título (las tareas no guardan un tipo)
const KINDS = [
  { re: /whats|wasap|mensaje|enviar|compartir/i, icon: 'message-circle', fg: '#1f9d55', bg: 'rgba(34, 179, 94, 0.12)' },
  { re: /llam|telef|contactar/i, icon: 'phone', fg: '#2f6fde', bg: 'rgba(47, 111, 222, 0.1)' },
  { re: /reuni|cita|agendar|visita/i, icon: 'calendar', fg: '#7a5cc7', bg: 'rgba(122, 92, 199, 0.1)' },
  { re: /correo|email|e-mail/i, icon: 'mail', fg: '#2f6f7a', bg: 'rgba(47, 111, 122, 0.1)' },
  { re: /document|revis|propuesta|presentaci|contrato|p[oó]liza|formulario/i, icon: 'file-text', fg: '#4f5bd5', bg: 'rgba(79, 91, 213, 0.1)' },
];
const DEFAULT_KIND = { icon: 'clipboard-list', fg: '#8a6421', bg: 'rgba(184, 137, 59, 0.12)' };
export function taskKind(t) {
  return KINDS.find((k) => k.re.test(t.title ?? '')) ?? DEFAULT_KIND;
}

// Estilo de las prioridades (cápsula)
export const PRIO_STYLE = {
  urgent: { color: '#b42318', bg: 'rgba(214, 69, 69, 0.12)' },
  high: { color: '#c0392b', bg: 'rgba(214, 69, 69, 0.1)' },
  normal: { color: '#2f6fde', bg: 'rgba(47, 111, 222, 0.1)' },
  low: { color: '#1f8a5b', bg: 'rgba(47, 158, 107, 0.12)' },
};
// En la vista de tareas "Normal" se muestra como en el diseño; Alta/Media/Baja
const PRIO_LABEL = { urgent: 'Urgente', high: 'Alta', normal: 'Normal', low: 'Baja' };

function dueParts(t) {
  if (!t.due_at) return { date: 'Sin fecha', time: '' };
  const d = new Date(t.due_at);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const time = d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true });
  if (d.toDateString() === today.toDateString()) return { date: 'Hoy', time, today: true };
  if (d.toDateString() === tomorrow.toDateString()) return { date: 'Mañana', time };
  const month = d.toLocaleDateString('es-CO', { month: 'short' }).replace('.', '');
  return { date: `${d.getDate()} ${month}. ${d.getFullYear()}`, time };
}

export default function TaskRow({ task: t, userMap, busy, onToggle, onOpen }) {
  const [menu, setMenu] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!menu) return undefined;
    const h = (e) => ref.current && !ref.current.contains(e.target) && setMenu(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [menu]);

  const overdue = isOverdue(t);
  const done = t.status === 'completed';
  const cancelled = t.status === 'cancelled';
  const kind = taskKind(t);
  const due = dueParts(t);
  const prio = PRIO_STYLE[t.priority] ?? PRIO_STYLE.normal;
  const assignee = userMap[t.assigned_to]?.name ?? '—';
  const leadName = t.lead ? `${t.lead.first_name ?? ''} ${t.lead.last_name ?? ''}`.trim() : null;

  return (
    <div className={`task-row${overdue ? ' overdue' : ''}`}>
      <input
        type="checkbox"
        className="task-check"
        aria-label={done ? 'Reabrir tarea' : 'Completar tarea'}
        checked={done}
        disabled={busy || cancelled}
        onChange={() => onToggle(t)}
      />
      <span className="task-kind" style={{ color: overdue ? '#d64545' : kind.fg, background: overdue ? 'rgba(214, 69, 69, 0.1)' : kind.bg }}>
        <Icon name={kind.icon} size={18} />
      </span>
      <button className="task-main" onClick={() => onOpen(t)}>
        <div className="task-title" style={{ textDecoration: done || cancelled ? 'line-through' : 'none', color: done || cancelled ? 'var(--color-text-muted)' : undefined }}>
          {t.title}
        </div>
        {t.notes && <div className="task-notes">{t.notes}</div>}
      </button>
      <div className="task-lead">
        {leadName ? (
          <>
            <span className="task-lead-icon">
              <Icon name="building-2" size={16} />
            </span>
            <a href={`/leads/${t.lead.id}`} style={{ minWidth: 0 }}>
              <div className="task-cell-strong">{leadName}</div>
              {t.lead.company_name && <div className="task-cell-sub">{t.lead.company_name}</div>}
            </a>
          </>
        ) : (
          <span className="task-cell-sub">Sin lead</span>
        )}
      </div>
      <div className="task-due">
        <div className="task-cell-strong" style={{ color: overdue ? 'var(--color-danger)' : due.today ? 'var(--color-info)' : undefined }}>{due.date}</div>
        {due.time && <div className="task-cell-sub" style={{ color: overdue ? 'var(--color-danger)' : due.today ? 'var(--color-info)' : undefined }}>{due.time}</div>}
      </div>
      <div className="task-assignee">
        <Avatar name={assignee} size={32} />
        <span className="task-cell-strong" style={{ fontWeight: 500 }}>
          {assignee}
        </span>
      </div>
      <span className="prio" style={{ color: prio.color, background: prio.bg }}>
        {PRIO_LABEL[t.priority] ?? PRIORITY[t.priority]?.label ?? 'Normal'}
      </span>
      <div ref={ref} style={{ position: 'relative' }}>
        <button className="icon-btn" aria-label="Acciones" onClick={() => setMenu((v) => !v)}>
          <Icon name="ellipsis-vertical" size={18} />
        </button>
        {menu && (
          <div className="pop" role="menu" style={{ minWidth: 190 }}>
            <button
              className="pop-item"
              onClick={() => {
                setMenu(false);
                onOpen(t);
              }}
            >
              <Icon name="eye" size={15} />
              Ver detalle
            </button>
            {!cancelled && (
              <button
                className="pop-item"
                onClick={() => {
                  setMenu(false);
                  onToggle(t);
                }}
              >
                <Icon name={isOpen(t) ? 'circle-check' : 'rotate-ccw'} size={15} />
                {isOpen(t) ? 'Marcar como completada' : 'Reabrir'}
              </button>
            )}
            {t.lead && (
              <a className="pop-item" href={`/leads/${t.lead.id}`}>
                <Icon name="external-link" size={15} />
                Ir al lead
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}