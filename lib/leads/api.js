// Ruta: lib/leads/api.js
// Acceso a datos de leads. Todo pasa por las funciones y el RLS de la
// base de datos: aquí no se decide ningún permiso.

import { supabase } from '../supabase/client';

// Traduce errores de Postgres a mensajes para el usuario
export function friendlyError(error) {
  if (!error) return null;
  const msg = error.message || String(error);
  if (error.code === '23505') return 'Ya existe un lead con ese teléfono o correo.';
  if (error.code === '42501') return msg.includes('row-level security') ? 'No tienes permiso para esta acción.' : msg;
  if (msg.includes('leads_contact_required')) return 'El lead necesita al menos un teléfono o un correo.';
  return msg;
}

// Lista paginada. filters: ver filter_leads() en la migración 03
export async function searchLeads({ filters = {}, page = 1, pageSize = 25, sort = 'created_desc' }) {
  const { data, error } = await supabase.rpc('search_leads', {
    p_filters: filters,
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
    p_sort: sort,
  });
  if (error) throw new Error(friendlyError(error));
  return { rows: data?.rows ?? [], total: data?.total ?? 0 };
}

export async function getLead(id) {
  const { data, error } = await supabase
    .from('leads')
    .select('*, lead_tags(tag_id)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(friendlyError(error));
  if (!data) return null;
  return { ...data, tag_ids: (data.lead_tags ?? []).map((t) => t.tag_id) };
}

// Crear: devuelve { ok, lead_id } o { ok:false, duplicate:true, matches }
export async function createLead(values) {
  const { data, error } = await supabase.rpc('create_lead', { p_data: toPayload(values) });
  if (error) throw new Error(friendlyError(error));
  return data;
}

export async function checkDuplicates(phone, email, excludeId = null) {
  if (!phone && !email) return [];
  const { data, error } = await supabase.rpc('check_lead_duplicates', {
    p_phone: phone || null,
    p_email: email || null,
    p_exclude_lead: excludeId,
  });
  if (error) return [];
  return data ?? [];
}

// Editar un lead y sincronizar sus etiquetas
export async function updateLead(id, values, previousTagIds = []) {
  const p = toPayload(values);
  const patch = {
    first_name: p.first_name,
    last_name: p.last_name,
    phone_raw: p.phone,
    email: p.email,
    company_name: p.company_name,
    country: p.country,
    state: p.state,
    city: p.city,
    address: p.address,
    status_id: p.status_id,
    source_id: p.source_id,
    assigned_user_id: p.assigned_user_id,
    custom_data: p.custom_data,
  };
  if (p.branch_id) patch.branch_id = p.branch_id;

  const { error } = await supabase.from('leads').update(patch).eq('id', id);
  if (error) throw new Error(friendlyError(error));
  await syncTags(id, previousTagIds, p.tag_ids);
}

export async function syncTags(leadId, before = [], after = []) {
  const toAdd = after.filter((t) => !before.includes(t));
  const toRemove = before.filter((t) => !after.includes(t));
  if (toRemove.length) {
    const { error } = await supabase.from('lead_tags').delete().eq('lead_id', leadId).in('tag_id', toRemove);
    if (error) throw new Error(friendlyError(error));
  }
  if (toAdd.length) {
    // organization_id lo fija la base de datos desde la sesión
    const rows = toAdd.map((tag_id) => ({ lead_id: leadId, tag_id }));
    const { error } = await supabase.from('lead_tags').insert(rows);
    if (error) throw new Error(friendlyError(error));
  }
}

// Acciones masivas
export async function bulkUpdate(ids, patch) {
  const { data, error } = await supabase.from('leads').update(patch).in('id', ids).select('id');
  if (error) throw new Error(friendlyError(error));
  return data?.length ?? 0;
}

export const softDelete = (ids) => bulkUpdate(ids, { deleted_at: new Date().toISOString() });
export const restore = (ids) => bulkUpdate(ids, { deleted_at: null });

export async function listTrash({ page = 1, pageSize = 25 }) {
  const from = (page - 1) * pageSize;
  const { data, error, count } = await supabase
    .from('leads')
    .select('id, first_name, last_name, phone_normalized, email_normalized, branch_id, deleted_at, deleted_by', { count: 'exact' })
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false })
    .range(from, from + pageSize - 1);
  if (error) throw new Error(friendlyError(error));
  return { rows: data ?? [], total: count ?? 0 };
}

export async function deletePermanently(ids) {
  const { data, error } = await supabase.from('leads').delete().in('id', ids).select('id');
  if (error) throw new Error(friendlyError(error));
  return data?.length ?? 0;
}

export async function exportLeads(filters, leadIds = null) {
  const { data, error } = await supabase.rpc('export_leads', {
    p_filters: filters,
    p_lead_ids: leadIds,
  });
  if (error) throw new Error(friendlyError(error));
  return data ?? [];
}

// Actividad de un lead (requiere audit.view)
export async function getLeadActivity(leadId, limit = 100) {
  const { data, error } = await supabase
    .from('activity_feed')
    .select('*')
    .eq('entity_id', leadId)
    .order('occurred_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(friendlyError(error));
  return data ?? [];
}

function clean(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function toPayload(v) {
  return {
    first_name: clean(v.first_name),
    last_name: clean(v.last_name),
    phone: clean(v.phone),
    email: clean(v.email),
    company_name: clean(v.company_name),
    country: clean(v.country),
    state: clean(v.state),
    city: clean(v.city),
    address: clean(v.address),
    branch_id: clean(v.branch_id),
    status_id: clean(v.status_id),
    source_id: clean(v.source_id),
    assigned_user_id: clean(v.assigned_user_id),
    custom_data: cleanCustom(v.custom_data),
    tag_ids: v.tag_ids ?? [],
  };
}

// Quita valores vacíos para no chocar con la validación de tipos
function cleanCustom(obj = {}) {
  const out = {};
  for (const [k, val] of Object.entries(obj)) {
    if (val === '' || val === null || val === undefined) continue;
    if (Array.isArray(val) && val.length === 0) continue;
    out[k] = val;
  }
  return out;
}