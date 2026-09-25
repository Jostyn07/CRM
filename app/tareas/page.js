'use client';
// Ruta: app/tareas/page.js
// "Mis tareas": vencidas (en rojo), hoy, próximos 7 días, más adelante y
// sin fecha. Pestañas: asignadas a mí, creadas por mí y, si el alcance lo
// permite, las de mi equipo. Cada cambio de pestaña queda en la actividad.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Modal from '../../components/ui/modal';
import TaskForm from '../../components/tasks/taskForm';
import TaskDetail from '../../components/tasks/taskDetail';
import TaskList from '../../components/tasks/taskList';
import { useSession } from '../../lib/auth/sessionContext';
import { trackTab } from '../../lib/activity/tracker';
import { groupTasks, listTasks } from '../../lib/tasks/api';
import { useOrgUsers } from '../../lib/tasks/useOrgUsers';

const GROUPS = [
  { key: 'overdue', label: 'Vencidas', danger: true },
  { key: 'today', label: 'Hoy' },
  { key: 'week', label: 'Próximos 7 días' },
  { key: 'later', label: 'Más adelante' },
  { key: 'nodate', label: 'Sin fecha' },
];

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
  const [assignee, setAssignee] = useState('');
  const [tasks, setTasks] = useState(null);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setError(null);
    try {
      setTasks(
        await listTasks({
          view: tab,
          userId: user.id,
          status,
          branchId: tab === 'team' ? branchId || undefined : undefined,
          assignedTo: tab === 'team' ? assignee || undefined : undefined,
        })
      );
    } catch (e) {
      setError(e.message);
    }
  }, [user?.id, tab, status, branchId, assignee]);

  useEffect(() => {
    load();
  }, [load]);

  function changeTab(next) {
    if (next === tab) return;
    trackTab('tasks', tab, next);
    setTab(next);
    setTasks(null);
  }

  const groups = useMemo(() => (tasks && status === 'open' ? groupTasks(tasks) : null), [tasks, status]);

  if (!profile) return null;

  return (
    <main style={{ padding: '1.5rem', maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: '1rem', flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: '1.4rem' }}>Tareas</h1>
        {can('tasks.create') && (
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            + Nueva tarea
          </button>
        )}
      </div>

      <div className="tabs-bar" role="tablist" style={{ marginBottom: '1rem' }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={`tab-link${tab === t.key ? ' active' : ''}`}
            onClick={() => changeTab(t.key)}
            style={{ background: 'none', border: 'none', borderBottom: tab === t.key ? '2px solid var(--color-primary)' : '2px solid transparent', cursor: 'pointer' }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: '1rem' }}>
        <select className="input" style={{ width: 170 }} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="open">Pendientes</option>
          <option value="closed">Completadas y canceladas</option>
        </select>
        {tab === 'team' && branches.length > 1 && (
          <select className="input" style={{ width: 190 }} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">Todas mis sucursales</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
        {tab === 'team' && (
          <select className="input" style={{ width: 200 }} value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">Todos los responsables</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && <p style={{ color: 'var(--color-danger)' }}>{error}</p>}
      {!tasks ? (
        <p>Cargando…</p>
      ) : groups ? (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {tasks.length === 0 && (
            <div className="card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>
              No tienes tareas pendientes. 🎉
            </div>
          )}
          {GROUPS.filter((g) => groups[g.key].length).map((g) => (
            <div key={g.key} className="card" style={{ padding: 0, borderColor: g.danger ? 'var(--color-danger)' : undefined }}>
              <h3 style={{ fontSize: '0.92rem', padding: '0.65rem 0.9rem', borderBottom: '1px solid var(--color-border)', color: g.danger ? 'var(--color-danger)' : undefined }}>
                {g.label} ({groups[g.key].length})
              </h3>
              <TaskList tasks={groups[g.key]} userMap={userMap} showAssignee={tab !== 'mine'} onOpen={setEditing} onChanged={load} />
            </div>
          ))}
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <TaskList tasks={tasks} userMap={userMap} showAssignee={tab !== 'mine'} onOpen={setEditing} onChanged={load} empty="No hay tareas cerradas." />
        </div>
      )}

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