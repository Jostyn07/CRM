// Ruta: lib/automations/api.js
// Automatizaciones (Fase 6) y notificaciones dentro de la app.
// El motor corre en la base de datos; aquí solo se configuran las reglas
// y se consulta su historial.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase/client';

// ---------------- Catálogo de disparadores
export const TRIGGERS = {
  lead_created: {
    label: 'Se crea un lead',
    icon: '🆕',
    help: 'Manual, importado, por API o un número nuevo que escribe por WhatsApp.',
  },
  lead_no_contact: {
    label: 'Lead sin contacto',
    icon: '⏰',
    help: 'Pasan X horas desde que se creó y nadie lo ha contactado (llamada, WhatsApp o nota). Una sola vez por lead y solo para leads creados después de la regla.',
  },
  lead_status_changed: { label: 'Cambia el estado del lead', icon: '🔁', help: 'Opcional: de qué estado y a qué estado.' },
  opportunity_stage_changed: { label: 'Oportunidad cambia de etapa', icon: '🔀', help: 'Opcional: embudo y etapa destino.' },
  opportunity_won: { label: 'Oportunidad ganada', icon: '🏆', help: '' },
  opportunity_lost: { label: 'Oportunidad perdida', icon: '📉', help: '' },
  call_ended: { label: 'Termina una llamada', icon: '📞', help: 'Contestada, no contestada o cualquiera.' },
  whatsapp_received: {
    label: 'Llega un WhatsApp del lead',
    icon: '🟢',
    help: 'Para no repetir avisos, corre como máximo una vez cada X minutos por lead (60 por defecto).',
  },
  task_overdue: { label: 'Una tarea se vence', icon: '⚠️', help: 'Una sola vez por tarea; solo tareas que vencen después de crear la regla.' },
};

export const ACTIONS = {
  assign: { label: 'Asignar responsable', icon: '👤' },
  create_task: { label: 'Crear tarea', icon: '✅' },
  change_status: { label: 'Cambiar estado del lead', icon: '🏷️' },
  notify: { label: 'Notificar', icon: '🔔' },
  webhook: { label: 'Enviar webhook', icon: '🔗' },
};

export const RECIPIENTS = {
  owner: 'Responsable (del lead, tarea u oportunidad)',
  supervisors: 'Supervisores de la sucursal',
  branch_admins: 'Admins de la sucursal',
  org_admins: 'Admins de la organización',
};

export const PLACEHOLDERS = ['{lead}', '{telefono}', '{correo}', '{estado}', '{fuente}', '{sucursal}', '{responsable}', '{tarea}', '{etapa}'];

export const PRIORITIES = { low: 'Baja', normal: 'Normal', high: 'Alta', urgent: 'Urgente' };

export function newAction(type) {
  switch (type) {
    case 'assign':
      return { type, method: 'round_robin', user_ids: [], only_unassigned: true };
    case 'create_task':
      return { type, title: 'Llamar a {lead}', notes: '', assign_to: 'owner', user_id: '', priority: 'normal', due_hours: 24 };
    case 'change_status':
      return { type, status_id: '' };
    case 'notify':
      return { type, to: ['owner'], user_ids: [], channels: ['app'], title: '', message: '' };
    case 'webhook':
      return { type, url: '', secret: '' };
    default:
      return { type };
  }
}

// Resumen legible de una regla ("Cuando … → hace …")
export function describeRule(rule, maps = {}) {
  const t = TRIGGERS[rule.trigger]?.label ?? rule.trigger;
  const cfg = rule.trigger_config ?? {};
  let when = t;
  if (rule.trigger === 'lead_no_contact') when = `Lead sin contacto en ${cfg.hours} h`;
  if (rule.trigger === 'lead_status_changed' && cfg.to_status_id) when += ` a “${maps.status?.[cfg.to_status_id]?.name ?? '…'}”`;
  if (rule.trigger === 'call_ended' && cfg.result === 'answered') when = 'Llamada contestada';
  if (rule.trigger === 'call_ended' && cfg.result === 'not_answered') when = 'Llamada no contestada';
  const does = (rule.actions ?? []).map((a) => ACTIONS[a.type]?.label ?? a.type).join(' · ');
  return { when, does };
}

// ---------------- Reglas
export async function listRules() {
  const { data, error } = await supabase.from('automation_rules').select('*').order('created_at');
  if (error) throw new Error(error.message);
  return data ?? [];
}

function clean(rule) {
  const actions = (rule.actions ?? []).map((a) => {
    const b = { ...a };
    delete b._idx;
    if (b.type === 'create_task') b.due_hours = b.due_hours === '' || b.due_hours == null ? null : Number(b.due_hours);
    return b;
  });
  return {
    name: rule.name,
    description: rule.description || null,
    branch_id: rule.branch_id || null,
    is_active: rule.is_active ?? true,
    trigger: rule.trigger,
    trigger_config: rule.trigger_config ?? {},
    conditions: rule.conditions ?? {},
    actions,
  };
}

export async function saveRule(rule) {
  const row = clean(rule);
  const q = rule.id
    ? supabase.from('automation_rules').update(row).eq('id', rule.id).select().single()
    : supabase.from('automation_rules').insert(row).select().single();
  const { data, error } = await q;
  if (error) throw new Error(friendly(error));
  return data;
}

export async function setRuleActive(id, active) {
  const { error } = await supabase.from('automation_rules').update({ is_active: active }).eq('id', id);
  if (error) throw new Error(friendly(error));
}

export async function deleteRule(id) {
  const { error } = await supabase.from('automation_rules').delete().eq('id', id);
  if (error) throw new Error(friendly(error));
}

function friendly(error) {
  if (error.code === '42501' || error.message?.includes('row-level security'))
    return 'No tienes permiso para esta automatización (los admins de sucursal solo pueden crear reglas de su sucursal).';
  return error.message;
}

export async function listRuns(ruleId, limit = 50) {
  let q = supabase.from('automation_runs').select('*').order('created_at', { ascending: false }).limit(limit);
  if (ruleId) q = q.eq('rule_id', ruleId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function webhookLog(ruleId) {
  const { data, error } = await supabase.rpc('automation_webhook_log', { p_rule: ruleId, p_limit: 50 });
  if (error) throw new Error(error.message);
  return data ?? [];
}

// ---------------- Notificaciones
export async function listNotifications(limit = 30) {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, title, body, link, created_at, read_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function markNotificationsRead(ids = null) {
  await supabase.rpc('notifications_mark_read', { p_ids: ids });
}

// Contador de no leídas en tiempo real + aviso de escritorio
export function useNotifications(userId) {
  const [unread, setUnread] = useState(0);
  const [lastNew, setLastNew] = useState(null);

  const load = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase.rpc('notifications_unread_count');
    setUnread(Number(data) || 0);
  }, [userId]);

  useEffect(() => {
    if (!userId) return undefined;
    load();
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, (payload) => {
        const n = payload.new;
        setLastNew(n);
        load();
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
          try {
            const note = new Notification(n.title, { body: n.body ?? '', tag: `notif-${n.id}` });
            note.onclick = () => {
              window.focus();
              if (n.link) window.location.href = n.link;
            };
          } catch {}
        }
      })
      .subscribe();
    const t = setInterval(load, 120000);
    return () => {
      clearInterval(t);
      supabase.removeChannel(channel);
    };
  }, [userId, load]);

  return { unread, reload: load, lastNew };
}