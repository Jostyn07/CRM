'use client';
// Ruta: components/tasks/leadTasksTab.js
// Pestaña "Tareas" de la ficha del lead.

import { useCallback, useEffect, useState } from 'react';
import Modal from '../ui/modal';
import TaskForm from './taskForm';
import TaskDetail from './taskDetail';
import TaskList from './taskList';
import { useSession } from '../../lib/auth/sessionContext';
import { listTasks } from '../../lib/tasks/api';

export default function LeadTasksTab({ lead, users, userMap, deleted }) {
  const { can } = useSession();
  const [open, setOpen] = useState(null);
  const [closed, setClosed] = useState([]);
  const [showClosed, setShowClosed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const [o, c] = await Promise.all([
        listTasks({ view: 'all', leadId: lead.id, status: 'open' }),
        listTasks({ view: 'all', leadId: lead.id, status: 'closed', limit: 100 }),
      ]);
      setOpen(o);
      setClosed(c);
    } catch (e) {
      setError(e.message);
    }
  }, [lead.id]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <p style={{ color: 'var(--color-danger)' }}>{error}</p>;
  if (!open) return <p>Cargando…</p>;

  const leadName = `${lead.first_name} ${lead.last_name ?? ''}`.trim();

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div className="card" style={{ padding: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.7rem 0.9rem', borderBottom: '1px solid var(--color-border)' }}>
          <h3 style={{ fontSize: '0.95rem' }}>Tareas pendientes ({open.length})</h3>
          {!deleted && can('tasks.create') && (
            <button className="btn btn-primary" onClick={() => setCreating(true)}>
              + Nueva tarea
            </button>
          )}
        </div>
        <TaskList tasks={open} userMap={userMap} showLead={false} onOpen={setEditing} onChanged={load} empty="Este lead no tiene tareas pendientes." />
      </div>

      {closed.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <button
            onClick={() => setShowClosed(!showClosed)}
            style={{ width: '100%', textAlign: 'left', padding: '0.7rem 0.9rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem', color: 'inherit' }}
          >
            {showClosed ? '▾' : '▸'} Completadas y canceladas ({closed.length})
          </button>
          {showClosed && <TaskList tasks={closed} userMap={userMap} showLead={false} onOpen={setEditing} onChanged={load} />}
        </div>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="Nueva tarea" width={560}>
        <TaskForm
          leadId={lead.id}
          leadName={leadName}
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
    </div>
  );
}