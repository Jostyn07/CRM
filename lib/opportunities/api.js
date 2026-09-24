// Ruta: lib/opportunities/api.js
// Acceso a datos de embudos y oportunidades. Las reglas (estado según la
// etapa, motivo de pérdida, una abierta por lead, sucursal del lead) las
// aplica la base de datos.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase/client';

export function oppError(error) {
  if (!error) return null;
  const msg = error.message || String(error);
  if (error.code === '23505' || msg.includes('opportunities_one_open_per_lead')) return 'Este lead ya tiene una oportunidad abierta.';
  if (error.code === '42501' && msg.includes('row-level')) return 'No tienes permiso para esta acción.';
  return msg;
}

// Embudos, etapas, motivos de pérdida y moneda de la organización
export function useFunnelConfig() {
  const [state, setState] = useState({ funnels: [], stages: [], lostReasons: [], currency: 'USD', loading: true });

  const load = useCallback(async () => {
    const [f, s, r, set] = await Promise.all([
      supabase.from('funnels').select('*').order('position').order('name'),
      supabase.from('funnel_stages').select('*').order('position'),
      supabase.from('lost_reasons').select('*').order('position'),
      supabase.from('organization_settings').select('settings').maybeSingle(),
    ]);
    setState({
      funnels: f.data ?? [],
      stages: s.data ?? [],
      lostReasons: r.data ?? [],
      currency: set.data?.settings?.currency ?? 'USD',
      wonLeadStatusId: set.data?.settings?.won_lead_status_id ?? null,
      loading: false,
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const stagesOf = useCallback((funnelId) => state.stages.filter((s) => s.funnel_id === funnelId), [state.stages]);
  const stageMap = useMemo(() => Object.fromEntries(state.stages.map((s) => [s.id, s])), [state.stages]);
  const reasonMap = useMemo(() => Object.fromEntries(state.lostReasons.map((r) => [r.id, r])), [state.lostReasons]);

  return { ...state, stagesOf, stageMap, reasonMap, reload: load };
}

export function money(value, currency = 'USD') {
  try {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(value ?? 0));
  } catch {
    return `${currency} ${Number(value ?? 0).toLocaleString('es-CO')}`;
  }
}

const FIELDS = '*, lead:leads(id, first_name, last_name, phone_normalized, email_normalized)';

export async function listOpportunities({ funnelId, branchId, userId, status, search, limit = 1000 }) {
  let q = supabase.from('opportunities').select(FIELDS);
  if (funnelId) q = q.eq('funnel_id', funnelId);
  if (branchId) q = q.eq('branch_id', branchId);
  if (userId === '__none') q = q.is('assigned_user_id', null);
  else if (userId) q = q.eq('assigned_user_id', userId);
  if (status) q = q.eq('status', status);
  if (search?.trim()) q = q.ilike('title', `%${search.trim()}%`);
  const { data, error } = await q.order('stage_entered_at', { ascending: false }).limit(limit);
  if (error) throw new Error(oppError(error));
  return data ?? [];
}

export async function getLeadOpportunities(leadId) {
  const { data, error } = await supabase.from('opportunities').select(FIELDS).eq('lead_id', leadId).order('created_at', { ascending: false });
  if (error) throw new Error(oppError(error));
  return data ?? [];
}

export async function getHistory(opportunityId) {
  const { data } = await supabase
    .from('opportunity_stage_history')
    .select('*')
    .eq('opportunity_id', opportunityId)
    .order('moved_at', { ascending: false });
  return data ?? [];
}

export async function createOpportunity(values) {
  const { data, error } = await supabase
    .from('opportunities')
    .insert({
      lead_id: values.lead_id,
      funnel_id: values.funnel_id,
      stage_id: values.stage_id || null,
      title: values.title.trim(),
      value: Number(values.value || 0),
      assigned_user_id: values.assigned_user_id || null,
      expected_close_date: values.expected_close_date || null,
      notes: values.notes || null,
    })
    .select('id')
    .single();
  if (error) throw new Error(oppError(error));
  return data.id;
}

export async function updateOpportunity(id, patch) {
  const { error } = await supabase.from('opportunities').update(patch).eq('id', id);
  if (error) throw new Error(oppError(error));
}

export async function moveOpportunity(id, stageId, lost = null) {
  return updateOpportunity(id, {
    stage_id: stageId,
    lost_reason_id: lost?.reasonId ?? null,
    lost_note: lost?.note ?? null,
  });
}

export async function deleteOpportunity(id) {
  const { error } = await supabase.from('opportunities').delete().eq('id', id);
  if (error) throw new Error(oppError(error));
}

export async function funnelSummary(funnelId, branchId, userId) {
  const { data } = await supabase.rpc('funnel_summary', {
    p_funnel: funnelId,
    p_branch: branchId || null,
    p_user: userId && userId !== '__none' ? userId : null,
  });
  return Object.fromEntries((data ?? []).map((r) => [r.stage_id, r]));
}