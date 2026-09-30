'use client';
// Ruta: app/tareas/page.js
// Tareas: pestañas (asignadas a mí, creadas por mí y, si el alcance lo
// permite, las del equipo), búsqueda y filtros, grupos por vencimiento
// (vencidas, hoy, próximos 7 días, más adelante, sin fecha) y, a la
// derecha, resumen del periodo, calendario y próxima tarea.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Modal from '../../components/ui/modal';
import Icon from '../../components/ui/icon';
import TaskForm from '../../components/tasks/taskForm';
import TaskDetail from '../../components/tasks/taskDetail';
import TaskRow from '../../components/tasks/taskRow';
import { NextTask, TaskCalendar, TaskSummary } from '../../components/tasks/taskSidePanel';
import { useSession } from '../../lib/auth/sessionContext';
import { trackEvent, trackTab } from '../../lib/activity/tracker';
import { groupTasks, isOpen, listTasks, notifyTasksChanged, updateTask } from '../../lib/tasks/api';
import { useOrgUsers } from '../../lib/tasks/useOrgUsers';

const GROUPS = [
  { key: 'overdue', label: 'Vencidas', icon: 'clock', danger: true },
  { key: 'today', label: 'Hoy', icon: 'calendar-days' },
  { key: 'week', label: 'Próximos 7 días', icon: 'calendar' },
  { key: 'later', label: 'Más adelante', icon: 'calendar' },
  { key: 'nodate', label: 'Sin fecha', icon: 'hourglass' },
];

const STATUS_OPTIONS = [
  { key: 'open', label: 'Pendientes' },
  { key: 'completed', label: 'Completadas' },
  { key: 'closed', label: 'Completadas y canceladas' },
  { key: 'all', label: 'Todas' },
];

const RANGE_OPTIONS = [
  { key: 'all', label: 'Todas las fechas' },
  { key: 'today', label: 'Hoy' },
  { key: 'week', label: 'Esta semana' },
  { key: 'month', label: 'Este mes' },
];

function inRange(t, key) {
  if (key === 'all') return true;
  if (!t.due_at) return false;
  const d = new Date(t.due_at);
  const now = new Date();
  if (key === 'today') return d.toDateString() === now.toDateString();
  if (key === 'week') {
    const start = new Date(now);
    start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    return d >= start && d < end;
  }
  if (key === 'month') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  return true;
}

const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

export default function TasksPage() {
  const { user, profile, can, scopeOf, branches } = useSession();
  const { users, userMap } = useOrgUsers();
  const teamScope = scopeOf?.('tasks.view');
  const canTeam = teamScope === 'branch' || teamScope === 'organization';

  const TABS = useMemo(
    () => [
      { key: 'mine', label: 'Asignadas a mí' },
      { key: 'created', label: 'Creadas por mí' },
      ...(canTeam ? [{ key: 'team', label: teamScope === 'organization' ? 'Organización' : 'Mi sucursal' }] : []),
    ],
    [canTeam, teamScope]
  );

  const [tab, setTab] = useState('mine');
  const [status, setStatus] = useState('open');
  const [branchId, setBranchId] = useState('');
  const [range, setRange] = useState('all');
  const [search, setSearch] = useState('');
  const [showMore, setShowMore] = useState(false);
  const [assignee, setAssignee] = useState('');
  const [priority, setPriority] = useState('');
  const [day, setDay] = useState(null);
  const [collapsed, setCollapsed] = useState({});
  const [tasks, setTasks] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);

  // Una sola consulta (todas las tareas de la pestaña); los filtros se
  // aplican aquí y el resumen usa el mismo resultado
  const load = useCallback(async () => {
    if (!user?.id) return;
    setError(null);
    try {
      setTasks(
        await listTasks({
          view: tab,
          userId: user.id,
          status: 'all',
          branchId: branchId || undefined,
          assignedTo: tab === 'team' ? assignee || undefined : undefined,
          limit: 600,
        })
      );
    } catch (e) {
      setError(e.message);
    }
  }, [user?.id, tab, branchId, assignee]);

  useEffect(() => {
    load();
  }, [load]);

  function changeTab(next) {
    if (next === tab) return;
    trackTab('tasks', tab, next);
    setTab(next);
    setTasks(null);
  }

  async function toggle(t) {
    setBusy(t.id);
    setError(null);
    try {
      const next = isOpen(t) ? 'completed' : 'pending';
      await updateTask(t.id, { status: next });
      trackEvent(next === 'completed' ? 'task.completed' : 'task.reopened', { entityType: 'tasks', entityId: t.id });
      notifyTasksChanged();
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  const visible = useMemo(() => {
    if (!tasks) return null;
    const q = norm(search.trim());
    return tasks.filter((t) => {
      if (status === 'open' && !isOpen(t)) return false;
      if (status === 'completed' && t.status !== 'completed') return false;
      if (status === 'closed' && isOpen(t)) return false;
      if (priority && t.priority !== priority) return false;
      if (!inRange(t, range)) return false;
      if (day && (!t.due_at || new Date(t.due_at).toDateString() !== day.toDateString())) return false;
      if (q) {
        const lead = t.lead ? `${t.lead.first_name ?? ''} ${t.lead.last_name ?? ''} ${t.lead.company_name ?? ''}` : '';
        if (!norm(`${t.title} ${t.notes ?? ''} ${lead}`).includes(q)) return false;
      }
      return true;
    });
  }, [tasks, status, priority, range, day, search]);

  const groups = useMemo(() => (visible && status === 'open' ? groupTasks(visible) : null), [visible, status]);
  const openCount = useMemo(() => (tasks ?? []).filter(isOpen).length, [tasks]);
  const activeFilters = [priority, tab === 'team' ? assignee : ''].filter(Boolean).length;

  if (!profile) return null;

  return (
    <main className="tasks-page">
      <div className="tasks-main">
        {/* Encabezado */}
        <div className="tasks-head">
          <div>
            <h1 style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: '2rem', margin: 0, letterSpacing: '-0.01em' }}>
              Tareas <span className="count-pill">{openCount}</span>
            </h1>
            <p style={{ margin: '6px 0 0', color: 'var(--color-text-muted)', fontSize: '0.92rem' }}>Organiza y da seguimiento a todas tus tareas y actividades.</p>
          </div>
          {can('tasks.create') && (
            <button className="btn btn-dark" style={{ height: 46, padding: '0 1.4rem', fontSize: '0.95rem' }} onClick={() => setCreating(true)}>
              <Icon name="plus" size={18} />
              Nueva tarea
            </button>
          )}
        </div>

        {/* Pestañas */}
        <div className="tabs-under" role="tablist" style={{ margin: '1.2rem 0 1rem' }}>
          {TABS.map((t) => (
            <button key={t.key} role="tab" aria-selected={tab === t.key} className={tab === t.key ? 'active' : ''} onClick={() => changeTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Filtros */}
        <div className="tasks-filters">
          <div className="field-wrap" style={{ flex: '1 1 240px' }}>
            <Icon name="search" size={17} />
            <input className="input select-pill" placeholder="Buscar tareas por título, lead, empresa…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="field-wrap">
            <Icon name="circle" size={16} />
            <select className="input select-pill" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Estado">
              {STATUS_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          {branches.length > 1 && (
            <div className="field-wrap">
              <Icon name="building-2" size={16} />
              <select className="input select-pill" value={branchId} onChange={(e) => setBranchId(e.target.value)} aria-label="Sucursal">
                <option value="">Todas las sucursales</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="field-wrap">
            <Icon name="calendar" size={16} />
            <select className="input select-pill" value={range} onChange={(e) => setRange(e.target.value)} aria-label="Fechas">
              {RANGE_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <button className={`btn ${showMore || activeFilters ? 'btn-primary' : 'btn-secondary'} select-pill`} style={{ padding: '0 1rem' }} onClick={() => setShowMore((v) => !v)} aria-expanded={showMore}>
            <Icon name="filter" size={16} />
            Filtros{activeFilters ? ` (${activeFilters})` : ''}
          </button>
        </div>

        {showMore && (
          <div className="tasks-filters" style={{ marginTop: 8 }}>
            <div className="field-wrap">
              <Icon name="flag" size={16} />
              <select className="input select-pill" value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Prioridad">
                <option value="">Todas las prioridades</option>
                <option value="urgent">Urgente</option>
                <option value="high">Alta</option>
                <option value="normal">Normal</option>
                <option value="low">Baja</option>
              </select>
            </div>
            {tab === 'team' && (
              <div className="field-wrap">
                <Icon name="user" size={16} />
                <select className="input select-pill" value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Responsable">
                  <option value="">Todos los responsables</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {(priority || assignee) && (
              <button
                className="btn btn-secondary select-pill"
                onClick={() => {
                  setPriority('');
                  setAssignee('');
                }}
              >
                Limpiar
              </button>
            )}
          </div>
        )}

        {day && (
          <div style={{ marginTop: 10 }}>
            <button className="btn btn-secondary" style={{ height: 30, fontSize: '0.8rem', borderRadius: 999 }} onClick={() => setDay(null)}>
              <Icon name="calendar" size={14} />
              {day.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}
              <Icon name="x" size={14} />
            </button>
          </div>
        )}

        {error && <p style={{ color: 'var(--color-danger)', marginTop: 12 }}>{error}</p>}

        {/* Lista */}
        <div style={{ display: 'grid', gap: 14, marginTop: 16 }}>
          {!visible ? (
            <div className="soft-card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
              Cargando…
            </div>
          ) : visible.length === 0 ? (
            <div className="soft-card" style={{ padding: '2.4rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
              <Icon name="circle-check" size={28} style={{ color: 'var(--color-primary)', marginBottom: 8 }} />
              <div>{status === 'open' ? 'No tienes tareas pendientes con estos filtros.' : 'No hay tareas con estos filtros.'}</div>
            </div>
          ) : groups ? (
            GROUPS.filter((g) => groups[g.key].length).map((g) => (
              <section key={g.key} className={`soft-card task-group${g.danger ? ' danger' : ''}`}>
                <button className="task-group-head" onClick={() => setCollapsed((c) => ({ ...c, [g.key]: !c[g.key] }))} aria-expanded={!collapsed[g.key]}>
                  <Icon name={g.icon} size={19} style={{ color: g.danger ? 'var(--color-danger)' : 'var(--color-primary)' }} />
                  <span style={{ color: g.danger ? 'var(--color-danger)' : undefined }}>{g.label}</span>
                  <span className="count-pill" style={g.danger ? { background: 'rgba(214, 69, 69, 0.12)', color: 'var(--color-danger)' } : undefined}>
                    {groups[g.key].length}
                  </span>
                  <Icon name={collapsed[g.key] ? 'chevron-down' : 'chevron-up'} size={18} style={{ marginLeft: 'auto', color: 'var(--color-text-muted)' }} />
                </button>
                {!collapsed[g.key] && groups[g.key].map((t) => <TaskRow key={t.id} task={t} userMap={userMap} busy={busy === t.id} onToggle={toggle} onOpen={setEditing} />)}
              </section>
            ))
          ) : (
            <section className="soft-card task-group">
              {visible.map((t) => (
                <TaskRow key={t.id} task={t} userMap={userMap} busy={busy === t.id} onToggle={toggle} onOpen={setEditing} />
              ))}
            </section>
          )}
        </div>
      </div>

      {/* Columna derecha */}
      <aside className="tasks-side">
        <TaskSummary tasks={tasks} />
        <TaskCalendar tasks={tasks} selected={day} onSelect={setDay} />
        <NextTask tasks={tasks} onOpen={setEditing} />
      </aside>

      <Modal open={creating} onClose={() => setCreating(false)} title="Nueva tarea" width={560}>
        <TaskForm
          users={users}
          onCancel={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            load();
          }}
        />
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Tarea" width={600}>
        {editing && (
          <TaskDetail
            task={editing}
            users={users}
            userMap={userMap}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              load();
            }}
          />
        )}
      </Modal>
    </main>
  );
}