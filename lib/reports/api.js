// Ruta: lib/reports/api.js
// Dashboard, reportes y metas (Fase 5). Los cálculos y el alcance
// (propio / sucursal / organización) los hace la base de datos.

import { useEffect, useState } from 'react';
import { supabase } from '../supabase/client';

// ---------------- Definición de cada métrica (ⓘ)
// Regla del documento: definición, período, población y fuente.
export const METRICS = {
  leads_new: {
    label: 'Leads nuevos',
    def: 'Leads creados en el período (no incluye los que están en la papelera).',
    pop: 'Leads de tu alcance; al filtrar por usuario, los asignados a esa persona.',
    src: 'Tabla de leads (fecha de creación).',
  },
  leads_contacted: {
    label: 'Leads contactados',
    def: 'Leads distintos con al menos una llamada CONTESTADA o un WhatsApp RECIBIDO del lead dentro del período.',
    pop: 'Leads de tu alcance (asignados al usuario filtrado).',
    src: 'Llamadas (hora en que se contestó) y WhatsApp recibidos en la línea de tiempo.',
  },
  contact_rate: {
    label: 'Tasa de contacto',
    def: 'De los leads nuevos del período, el % que ya fue contactado (llamada contestada o WhatsApp recibido), en cualquier momento.',
    pop: 'Leads nuevos del período.',
    src: 'Leads, llamadas y línea de tiempo.',
  },
  leads_no_contact: {
    label: 'Sin contacto',
    def: 'Leads que nunca han tenido un contacto real (último contacto vacío). Es una foto de hoy, no depende del período.',
    pop: 'Leads de tu alcance.',
    src: 'Campo "último contacto" del lead.',
  },
  leads_unassigned: {
    label: 'Sin asignar',
    def: 'Leads sin responsable hoy (por ejemplo, los que llegan por WhatsApp de números nuevos).',
    pop: 'Leads de tu alcance.',
    src: 'Responsable del lead.',
  },
  calls_total: {
    label: 'Llamadas',
    def: 'Llamadas iniciadas en el período.',
    pop: 'Llamadas hechas por los usuarios de tu alcance (o por el usuario filtrado).',
    src: 'Registro de llamadas (Telnyx).',
  },
  calls_answered: {
    label: 'Contestadas',
    def: 'Llamadas del período que fueron contestadas.',
    pop: 'Igual que Llamadas.',
    src: 'Registro de llamadas (hora de respuesta).',
  },
  call_minutes: {
    label: 'Minutos',
    def: 'Minutos de las llamadas del período (facturados por el proveedor o, si aún no llegan, duración medida).',
    pop: 'Igual que Llamadas.',
    src: 'Registro de llamadas.',
  },
  wa_sent: {
    label: 'WhatsApp enviados',
    def: 'Mensajes de WhatsApp enviados desde la plataforma en el período.',
    pop: 'Mensajes enviados por los usuarios de tu alcance.',
    src: 'Mensajes de WhatsApp.',
  },
  wa_received: {
    label: 'WhatsApp recibidos',
    def: 'Mensajes de WhatsApp recibidos de clientes en el período.',
    pop: 'Conversaciones de las sucursales de tu alcance (al filtrar por usuario: de sus leads).',
    src: 'Mensajes de WhatsApp.',
  },
  opps_open: {
    label: 'Oportunidades abiertas',
    def: 'Oportunidades abiertas hoy y su valor total. Foto actual, no depende del período.',
    pop: 'Oportunidades de tu alcance.',
    src: 'Oportunidades.',
  },
  opps_won: {
    label: 'Ganadas',
    def: 'Oportunidades cerradas como ganadas dentro del período y su valor.',
    pop: 'Oportunidades de tu alcance (asignadas al usuario filtrado).',
    src: 'Oportunidades (fecha de cierre).',
  },
  opps_lost: {
    label: 'Perdidas',
    def: 'Oportunidades cerradas como perdidas dentro del período.',
    pop: 'Igual que Ganadas.',
    src: 'Oportunidades (fecha de cierre).',
  },
  tasks_overdue: {
    label: 'Tareas vencidas',
    def: 'Tareas pendientes o en progreso cuya fecha límite ya pasó. Foto actual.',
    pop: 'Tareas de tu alcance (asignadas al usuario filtrado).',
    src: 'Tareas.',
  },
  tasks_completed: {
    label: 'Tareas completadas',
    def: 'Tareas marcadas como completadas dentro del período.',
    pop: 'Igual que Tareas vencidas.',
    src: 'Tareas (fecha de completado).',
  },
  funnel_reached: {
    label: 'Conversión por etapa',
    def: 'De las oportunidades CREADAS en el período, cuántas llegaron al menos a cada etapa. Una ganada cuenta como que pasó por todas las etapas abiertas.',
    pop: 'Oportunidades del embudo elegido en tu alcance.',
    src: 'Historial de etapas de las oportunidades.',
  },
};

export const GOAL_METRICS = {
  leads_contacted: 'Leads contactados',
  calls: 'Llamadas',
  calls_answered: 'Llamadas contestadas',
  call_minutes: 'Minutos de llamada',
  wa_sent: 'WhatsApp enviados',
  opps_won: 'Ventas ganadas',
  opps_won_value: 'Valor ganado',
  tasks_completed: 'Tareas completadas',
};

// ---------------- Fechas en la zona horaria de la organización
export function todayIn(tz) {
  // en-CA da AAAA-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'America/Bogota' }).format(new Date());
}

function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const PRESETS = [
  { key: 'today', label: 'Hoy' },
  { key: 'week', label: 'Semana' },
  { key: 'month', label: 'Mes' },
  { key: 'quarter', label: 'Trimestre' },
  { key: '30d', label: 'Últimos 30 días' },
  { key: 'custom', label: 'Personalizado' },
];

export function presetRange(key, tz) {
  const t = todayIn(tz);
  const d = new Date(`${t}T12:00:00Z`);
  switch (key) {
    case 'today':
      return { from: t, to: t };
    case 'week': {
      const dow = (d.getUTCDay() + 6) % 7; // lunes = 0
      return { from: addDays(t, -dow), to: t };
    }
    case 'month':
      return { from: `${t.slice(0, 7)}-01`, to: t };
    case 'quarter': {
      const q = Math.floor(d.getUTCMonth() / 3) * 3 + 1;
      return { from: `${t.slice(0, 4)}-${String(q).padStart(2, '0')}-01`, to: t };
    }
    default:
      return { from: addDays(t, -29), to: t };
  }
}

export function useOrgTimezone() {
  const [tz, setTz] = useState(null);
  useEffect(() => {
    supabase
      .from('organization_settings')
      .select('organization_id, settings')
      .maybeSingle()
      .then(({ data }) => setTz(data?.settings?.timezone || 'America/Bogota'));
  }, []);
  return tz;
}

export async function saveOrgTimezone(tz) {
  const { data: row, error: e1 } = await supabase.from('organization_settings').select('organization_id, settings').maybeSingle();
  if (e1 || !row) throw new Error(e1?.message || 'No se pudo leer la configuración');
  const { error } = await supabase
    .from('organization_settings')
    .update({ settings: { ...row.settings, timezone: tz } })
    .eq('organization_id', row.organization_id);
  if (error) throw new Error(error.message);
}

// ---------------- Consultas
const args = ({ from, to, branchId, userId }) => ({ p_from: from, p_to: to, p_branch: branchId || null, p_user: userId || null });

async function rpc(name, params) {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw new Error(error.message);
  return data;
}

export const getKpis = (f) => rpc('report_kpis', args(f));
export const getDaily = (f) => rpc('report_daily', args(f));
export const getBreakdown = (f) => rpc('report_leads_breakdown', args(f));
export const getFunnel = (funnelId, f) => rpc('report_funnel', { p_funnel: funnelId, ...args(f) });
export const getRanking = (f) => rpc('report_ranking', { p_from: f.from, p_to: f.to, p_branch: f.branchId || null });
export const getGoalProgress = (month, userId) => rpc('report_goal_progress', { p_month: month, p_user: userId || null });

export async function listGoals(month) {
  const { data, error } = await supabase.from('user_goals').select('id, user_id, month, metric, target').eq('month', month);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function saveGoal(userId, month, metric, target) {
  if (!target || Number(target) <= 0) {
    const { error } = await supabase.from('user_goals').delete().eq('user_id', userId).eq('month', month).eq('metric', metric);
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await supabase
    .from('user_goals')
    .upsert({ user_id: userId, month, metric, target: Number(target) }, { onConflict: 'user_id,month,metric' });
  if (error) throw new Error(error.message);
}

// ---------------- Formato
export function num(n, dec = 0) {
  return Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: dec, minimumFractionDigits: 0 });
}
export function money(n, currency = 'USD') {
  try {
    return Number(n || 0).toLocaleString('es-CO', { style: 'currency', currency, maximumFractionDigits: 0 });
  } catch {
    return `${num(n)} ${currency}`;
  }
}
export function pct(a, b) {
  return b ? `${Math.round((a / b) * 100)}%` : '—';
}
export function shortDate(iso) {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}