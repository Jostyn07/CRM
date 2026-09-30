'use client';
// Ruta: components/tasks/taskSidePanel.js
// Columna derecha de Tareas: resumen del periodo (con avance), calendario
// del mes (días con tareas; al elegir un día se filtra la lista) y la
// próxima tarea.

import { useMemo, useState } from 'react';
import Icon from '../ui/icon';
import { isOpen, isOverdue } from '../../lib/tasks/api';
import { taskKind } from './taskRow';

const PERIODS = [
  { key: 'week', label: 'Esta semana' },
  { key: 'month', label: 'Este mes' },
  { key: 'all', label: 'Todo' },
];

function periodRange(key) {
  const now = new Date();
  if (key === 'week') {
    const start = new Date(now);
    const dow = (start.getDay() + 6) % 7; // lunes = 0
    start.setDate(start.getDate() - dow);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    return [start, end];
  }
  if (key === 'month') return [new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 1, 1)];
  return [null, null];
}

// Un anillo de avance (SVG)
function Ring({ pct }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <svg width="84" height="84" viewBox="0 0 84 84" role="img" aria-label={`${pct}% completado`}>
      <circle cx="42" cy="42" r={r} fill="none" stroke="var(--color-primary-soft)" strokeWidth="8" />
      <circle
        cx="42"
        cy="42"
        r={r}
        fill="none"
        stroke="url(#ringGold)"
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={`${(c * pct) / 100} ${c}`}
        transform="rotate(-90 42 42)"
      />
      <defs>
        <linearGradient id="ringGold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#e7c47f" />
          <stop offset="100%" stopColor="#b8862f" />
        </linearGradient>
      </defs>
      <text x="42" y="47" textAnchor="middle" fontSize="16" fontWeight="700" fill="var(--color-text)">
        {pct}%
      </text>
    </svg>
  );
}

export function TaskSummary({ tasks }) {
  const [period, setPeriod] = useState('week');
  const stats = useMemo(() => {
    const [from, to] = periodRange(period);
    const inPeriod = (t) => {
      if (!from) return true;
      const ref = t.due_at ? new Date(t.due_at) : t.completed_at ? new Date(t.completed_at) : new Date(t.created_at);
      return ref >= from && ref < to;
    };
    const list = (tasks ?? []).filter((t) => t.status !== 'cancelled' && inPeriod(t));
    const overdue = list.filter(isOverdue).length;
    const completed = list.filter((t) => t.status === 'completed').length;
    const pending = list.filter((t) => isOpen(t) && !isOverdue(t)).length;
    const total = list.length;
    return { overdue, completed, pending, total, pct: total ? Math.round((completed / total) * 100) : 0 };
  }, [tasks, period]);

  const row = (color, label, n) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.9rem', padding: '5px 0' }}>
      <span style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
      <span style={{ flex: 1 }}>{label}</span>
      <strong>{n}</strong>
    </div>
  );

  return (
    <section className="soft-card" style={{ padding: '1rem 1.1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <h3 style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
          <Icon name="chart-column" size={18} />
          Resumen
        </h3>
        <select className="input" value={period} onChange={(e) => setPeriod(e.target.value)} style={{ width: 'auto', height: 30, fontSize: '0.8rem', padding: '0 8px', border: 'none', background: 'transparent', boxShadow: 'none' }}>
          {PERIODS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      {row('#b8b2a7', 'Pendientes', stats.pending)}
      {row('#d64545', 'Vencidas', stats.overdue)}
      {row('#2f9e6b', 'Completadas', stats.completed)}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 12 }}>
        <Ring pct={stats.pct} />
        <div>
          <div style={{ fontWeight: 700, fontSize: '1rem' }}>
            {stats.completed} de {stats.total}
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>tareas completadas</div>
        </div>
      </div>
    </section>
  );
}

function shortDateTime(iso) {
  const d = new Date(iso);
  const month = d.toLocaleDateString('es-CO', { month: 'short' }).replace('.', '');
  const time = d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true });
  return `${d.getDate()} ${month}. ${d.getFullYear()}, ${time}`;
}

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const sameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export function TaskCalendar({ tasks, selected, onSelect }) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const today = new Date();

  const marks = useMemo(() => {
    const m = {};
    for (const t of tasks ?? []) {
      if (!t.due_at || !isOpen(t)) continue;
      const d = new Date(t.due_at);
      const k = d.toDateString();
      m[k] = m[k] === 'overdue' || isOverdue(t) ? 'overdue' : 'open';
    }
    return m;
  }, [tasks]);

  const days = useMemo(() => {
    const first = new Date(cursor);
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(first);
    start.setDate(first.getDate() - offset);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [cursor]);

  const monthName = cursor.toLocaleDateString('es-CO', { month: 'long' });
  const title = `${monthName.charAt(0).toUpperCase()}${monthName.slice(1)} ${cursor.getFullYear()}`;

  return (
    <section className="soft-card" style={{ padding: '1rem 1.1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h3 style={{ fontSize: '0.98rem', margin: 0 }}>{title}</h3>
        <div style={{ display: 'flex', gap: 2 }}>
          <button className="icon-btn" aria-label="Mes anterior" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
            <Icon name="chevron-left" size={17} />
          </button>
          <button className="icon-btn" aria-label="Mes siguiente" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
            <Icon name="chevron-right" size={17} />
          </button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, textAlign: 'center' }}>
        {WEEKDAYS.map((w, i) => (
          <div key={i} style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', padding: '4px 0' }}>
            {w}
          </div>
        ))}
        {days.map((d) => {
          const inMonth = d.getMonth() === cursor.getMonth();
          const isSel = sameDay(d, selected);
          const isToday = sameDay(d, today);
          const mark = marks[d.toDateString()];
          return (
            <button
              key={d.toISOString()}
              onClick={() => onSelect(isSel ? null : d)}
              aria-pressed={isSel}
              aria-label={d.toLocaleDateString('es-CO', { dateStyle: 'full' })}
              style={{
                position: 'relative',
                height: 32,
                width: 32,
                margin: '0 auto',
                borderRadius: '50%',
                border: isToday && !isSel ? '1.5px solid var(--color-primary)' : '1.5px solid transparent',
                background: isSel ? 'var(--gold-gradient)' : 'transparent',
                color: isSel ? '#1b1409' : inMonth ? 'var(--color-text)' : 'var(--color-text-tertiary)',
                fontWeight: isSel || isToday ? 700 : 400,
                fontSize: '0.8rem',
                opacity: inMonth ? 1 : 0.5,
              }}
            >
              {d.getDate()}
              {mark && !isSel && (
                <span style={{ position: 'absolute', bottom: 2, left: '50%', transform: 'translateX(-50%)', width: 4, height: 4, borderRadius: '50%', background: mark === 'overdue' ? '#d64545' : 'var(--color-primary)' }} />
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function NextTask({ tasks, onOpen }) {
  const next = useMemo(
    () =>
      (tasks ?? [])
        .filter((t) => isOpen(t) && t.due_at)
        .sort((a, b) => new Date(a.due_at) - new Date(b.due_at))[0] ?? null,
    [tasks]
  );
  return (
    <section className="soft-card" style={{ padding: '1rem 1.1rem' }}>
      <h3 style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 10px' }}>
        <Icon name="clock" size={18} />
        Próxima tarea
      </h3>
      {!next ? (
        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: 0 }}>No tienes tareas con fecha pendientes.</p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span className="task-kind" style={{ width: 46, height: 46, color: '#b8862f', background: 'rgba(184, 137, 59, 0.14)' }}>
              <Icon name={taskKind(next).icon} size={20} />
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 650, fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{next.title}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: isOverdue(next) ? 'var(--color-danger)' : 'var(--color-text-muted)', marginTop: 4 }}>
                <Icon name="calendar" size={14} />
                {shortDateTime(next.due_at)}
              </div>
              {next.lead && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: 3 }}>
                  <Icon name="building-2" size={14} />
                  {`${next.lead.first_name ?? ''} ${next.lead.last_name ?? ''}`.trim()}
                </div>
              )}
            </div>
          </div>
          <button className="btn btn-primary" style={{ width: '100%', marginTop: 14, height: 42 }} onClick={() => onOpen(next)}>
            Ver tarea
          </button>
        </>
      )}
    </section>
  );
}