// Ruta: lib/tasks/api.js
// Tareas y timeline de leads (Fase 3). Las reglas (sucursal, quién
// completó, historial, avisos de vencidas, edición de notas en 15 min)
// las aplica la base de datos.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase/client';

export const PRIORITY = {
  low: { label: 'Baja', color: '#64748B' },
  normal: { label: 'Normal', color: '#2563EB' },
  high: { label: 'Alta', color: '#D97706' },
  urgent: { label: 'Urgente', color: '#DC2626' },
};

export const TASK_STATUS = {
  pending: 'Pendiente',
  in_progress: 'En progreso',
  completed: 'Completada',
  cancelled: 'Cancelada',
};

export const NOTE_EDIT_MINUTES = 15;

export function taskError(error) {
  if (!error) return null;
  const msg = error.message || String(error);
  if (error.code === '42501' && msg.includes('row-level')) return 'No tienes permiso para esta acción.';
  return msg;
}

export const isOpen = (t) => t.status === 'pending' || t.status === 'in_progress';
export const isOverdue = (t) => isOpen(t) && t.due_at && new Date(t.due_at) < new Date();

const TASK_COLS =
  'id, title, notes, assigned_to, created_by, completed_by, completed_at, priority, status, due_at, branch_id, lead_id, opportunity_id, created_at, updated_at, lead:leads(id, first_name, last_name)';

// view: 'mine' (asignadas a mí) | 'created' (creadas por mí) | 'team' (todo lo que mi alcance ve)
export async function listTasks({ view = 'mine', userId, status = 'open', leadId, branchId, assignedTo, limit = 300 } = {}) {
  let q = supabase.from('tasks').select(TASK_COLS);
  if (leadId) q = q.eq('lead_id', leadId);
  if (view === 'mine' && userId) q = q.eq('assigned_to', userId);
  if (view === 'created' && userId) q = q.eq('created_by', userId);
  if (branchId) q = q.eq('branch_id', branchId);
  if (assignedTo) q = q.eq('assigned_to', assignedTo);
  if (status === 'open') q = q.in('status', ['pending', 'in_progress']);
  else if (status === 'closed') q = q.in('status', ['completed', 'cancelled']);

  q = status === 'closed'
    ? q.order('updated_at', { ascending: false })
    : q.order('due_at', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false });

  const { data, error } = await q.limit(limit);
  if (error) throw new Error(taskError(error));
  return data ?? [];
}

export async function createTask(values) {
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      title: values.title,
      notes: values.notes || null,
      assigned_to: values.assigned_to,
      priority: values.priority || 'normal',
      due_at: values.due_at || null,
      lead_id: values.lead_id || null,
      opportunity_id: values.opportunity_id || null,
    })
    .select(TASK_COLS)
    .single();
  if (error) throw new Error(taskError(error));
  return data;
}

export async function updateTask(id, patch) {
  const { data, error } = await supabase.from('tasks').update(patch).eq('id', id).select(TASK_COLS).maybeSingle();
  if (error) throw new Error(taskError(error));
  if (!data) throw new Error('No tienes permiso para modificar esta tarea.');
  return data;
}

export async function getTaskHistory(taskId) {
  const { data, error } = await supabase
    .from('task_history')
    .select('id, action, changes, user_id, created_at')
    .eq('task_id', taskId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(taskError(error));
  return data ?? [];
}

// Contador del menú: abiertas y vencidas asignadas a mí, en vivo
export function useMyTaskCounts(userId) {
  const [counts, setCounts] = useState({ open: 0, overdue: 0 });

  const load = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase.rpc('get_my_task_counts');
    if (data) setCounts({ open: Number(data.open) || 0, overdue: Number(data.overdue) || 0 });
  }, [userId]);

  useEffect(() => {
    if (!userId) return undefined;
    load();
    const channel = supabase
      .channel(`task-counts-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `assigned_to=eq.${userId}` }, load)
      .subscribe();
    // Una tarea pasa a vencida con el tiempo, sin que cambie la fila
    const timer = setInterval(load, 60_000);
    const onChanged = () => load();
    window.addEventListener('tasks:changed', onChanged);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(timer);
      window.removeEventListener('tasks:changed', onChanged);
    };
  }, [userId, load]);

  return counts;
}

export function notifyTasksChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('tasks:changed'));
}

// ---------------------------------------------------------------
// Timeline del lead
// ---------------------------------------------------------------
export async function getLeadTimeline(leadId, limit = 200) {
  const { data, error } = await supabase
    .from('lead_activities')
    .select('id, type, actor_id, body, metadata, created_at, edited_at')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(taskError(error));
  return data ?? [];
}

export async function addNote(leadId, body) {
  const { data, error } = await supabase
    .from('lead_activities')
    .insert({ lead_id: leadId, type: 'note_created', body })
    .select('id, type, actor_id, body, metadata, created_at, edited_at')
    .single();
  if (error) throw new Error(taskError(error));
  return data;
}

export async function editNote(id, body) {
  const { data, error } = await supabase
    .from('lead_activities')
    .update({ body })
    .eq('id', id)
    .select('id, type, actor_id, body, metadata, created_at, edited_at')
    .maybeSingle();
  if (error) throw new Error(taskError(error));
  if (!data) throw new Error('Solo el autor puede editar su nota.');
  return data;
}

export function canEditNote(activity, userId) {
  return (
    activity.type === 'note_created' &&
    activity.actor_id === userId &&
    Date.now() - new Date(activity.created_at).getTime() < NOTE_EDIT_MINUTES * 60_000
  );
}

// Fecha límite <-> valor de <input type="datetime-local">
export function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function fromLocalInput(v) {
  return v ? new Date(v).toISOString() : null;
}

export function dueLabel(t) {
  if (!t.due_at) return 'Sin fecha';
  const d = new Date(t.due_at);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const time = d.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return `Hoy ${time}`;
  if (d.toDateString() === tomorrow.toDateString()) return `Mañana ${time}`;
  return d.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
}

// Grupos para "Mis tareas"
export function groupTasks(tasks) {
  const now = new Date();
  const endToday = new Date(now);
  endToday.setHours(23, 59, 59, 999);
  const endWeek = new Date(endToday);
  endWeek.setDate(endWeek.getDate() + 7);
  const g = { overdue: [], today: [], week: [], later: [], nodate: [] };
  for (const t of tasks) {
    if (!t.due_at) g.nodate.push(t);
    else {
      const d = new Date(t.due_at);
      if (d < now) g.overdue.push(t);
      else if (d <= endToday) g.today.push(t);
      else if (d <= endWeek) g.week.push(t);
      else g.later.push(t);
    }
  }
  return g;
}