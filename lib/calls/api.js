// Ruta: lib/calls/api.js
// Acceso a datos de llamadas. El navegador no crea ni modifica llamadas:
// prepare_call() las registra y los webhooks de Telnyx las actualizan.

import { supabase } from '../supabase/client';

export const TECHNICAL_STATUS = {
  iniciando: 'Iniciando',
  sonando: 'Sonando',
  contestada: 'En curso',
  no_contesto: 'No contestó',
  ocupado: 'Ocupado',
  fallida: 'Fallida',
  cancelada: 'Cancelada',
  finalizada: 'Finalizada',
};

export const RESULTS = {
  no_contesto: 'No contestó',
  contactado: 'Contactado',
  interesado: 'Interesado',
  seguimiento: 'Seguimiento',
  no_interesado: 'No interesado',
  numero_incorrecto: 'Número incorrecto',
};

export async function readError(error, fallback = 'Ocurrió un error.') {
  if (!error) return null;
  try {
    const body = await error.context?.json?.();
    if (body?.error) return body.error;
  } catch {}
  if (error.code === '42501') return error.message?.includes('row-level') ? 'No tienes permiso para esta acción.' : error.message;
  return error.message || fallback;
}

export async function prepareCall({ to, leadId, fromNumberId }) {
  const { data, error } = await supabase.rpc('prepare_call', {
    p_to: to || null,
    p_lead: leadId || null,
    p_from_number: fromNumberId || null,
  });
  if (error) throw new Error(await readError(error));
  return data;
}

export async function markClientEnded(callId, reason) {
  await supabase.rpc('mark_call_client_ended', { p_call: callId, p_reason: reason });
}

export async function setCallResult(callId, result, notes) {
  const { error } = await supabase.rpc('set_call_result', { p_call: callId, p_result: result, p_notes: notes || null });
  if (error) throw new Error(await readError(error));
}

export async function getRecordingUrl(callId) {
  const { data, error } = await supabase.functions.invoke('call-recording-url', { body: { call_id: callId } });
  if (error) throw new Error(await readError(error, 'No se pudo abrir la grabación.'));
  return data.url;
}

export async function getMyNumbers() {
  const { data } = await supabase.from('phone_numbers').select('id, e164, label, branch_id').eq('is_active', true).order('e164');
  return data ?? [];
}

export async function getMinutesSummary() {
  const { data } = await supabase.rpc('get_minutes_summary');
  return data ?? null;
}

const CALL_FIELDS =
  'id, user_id, lead_id, branch_id, from_e164, to_e164, call_type, technical_status, commercial_result, notes, initiated_at, answered_at, ended_at, duration_seconds, lead:leads(first_name, last_name), recording:call_recordings(status)';

// Lista paginada con los filtros de la pantalla de llamadas
export async function listCalls({ page = 1, pageSize = 25, filters = {} }) {
  let q = supabase.from('calls').select(CALL_FIELDS, { count: 'exact' });
  if (filters.leadId) q = q.eq('lead_id', filters.leadId);
  if (filters.userId) q = q.eq('user_id', filters.userId);
  if (filters.branchId) q = q.eq('branch_id', filters.branchId);
  if (filters.type) q = q.eq('call_type', filters.type);
  if (filters.status) q = q.eq('technical_status', filters.status);
  if (filters.result === '__none') q = q.is('commercial_result', null);
  else if (filters.result) q = q.eq('commercial_result', filters.result);
  if (filters.from) q = q.gte('initiated_at', new Date(`${filters.from}T00:00:00`).toISOString());
  if (filters.to) q = q.lte('initiated_at', new Date(`${filters.to}T23:59:59.999`).toISOString());
  if (filters.number) q = q.ilike('to_e164', `%${filters.number.replace(/\D/g, '')}%`);

  const from = (page - 1) * pageSize;
  const { data, count, error } = await q.order('initiated_at', { ascending: false }).range(from, from + pageSize - 1);
  if (error) throw new Error(await readError(error));
  return { rows: data ?? [], total: count ?? 0 };
}

export async function getCallStats(filters = {}) {
  const { data } = await supabase.rpc('call_stats', {
    p_from: filters.from ? new Date(`${filters.from}T00:00:00`).toISOString() : null,
    p_to: filters.to ? new Date(`${filters.to}T23:59:59.999`).toISOString() : null,
    p_user: filters.userId || null,
    p_branch: filters.branchId || null,
  });
  return data;
}

export function fmtDuration(s) {
  if (!s) return '0:00';
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m % 60).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export function fmtMinutes(seconds) {
  const m = Math.floor((seconds ?? 0) / 60);
  return `${m.toLocaleString('es-CO')} min`;
}