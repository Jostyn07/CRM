// Ruta: lib/ai/api.js
// IA (Fase 7). Todo pasa por la Edge Function "ai": la llave de OpenAI
// nunca llega al navegador y la base valida permisos y el tope mensual.

import { supabase } from '../supabase/client';

export const INTENTS = {
  cotizacion: { label: 'Cotización', color: '#2563eb' },
  pago: { label: 'Pago', color: '#0891b2' },
  documentos: { label: 'Documentos', color: '#7c3aed' },
  queja: { label: 'Queja', color: '#dc2626' },
  cancelacion: { label: 'Cancelación', color: '#b91c1c' },
  no_interesado: { label: 'No interesado', color: '#6b7280' },
  seguimiento: { label: 'Seguimiento', color: '#059669' },
  saludo: { label: 'Saludo', color: '#6b7280' },
  otro: { label: 'Otro', color: '#6b7280' },
};
export const URGENCY = { alta: '🔴 Alta', media: '🟡 Media', baja: '⚪ Baja' };

// Datos que la IA puede detectar (se guardan aparte; no reemplazan el lead)
export const FIELD_LABELS = {
  state: 'Estado (EE. UU.)',
  zip_code: 'Código postal',
  household_size: 'Personas en el hogar',
  annual_income: 'Ingreso anual aprox.',
  birth_dates: 'Fechas de nacimiento',
  has_employer_insurance: 'Seguro por el trabajo',
  current_insurer: 'Aseguradora actual',
  filing_status: 'Estado civil para declarar',
  dependents: 'Dependientes',
  income_type: 'Tipo de ingreso',
  tax_years: 'Años a declarar',
  filed_last_year: '¿Declaró el año pasado?',
  email: 'Correo',
  preferred_contact_time: 'Horario preferido',
};

export const PRIORITY_LABEL = { low: 'Baja', normal: 'Normal', high: 'Alta', urgent: 'Urgente' };

async function call(action, id, opts) {
  const { data, error } = await supabase.functions.invoke('ai', { body: { action, id, opts } });
  if (error) {
    let msg = error.message;
    try {
      msg = (await error.context.json()).error || msg;
    } catch {}
    throw new Error(msg);
  }
  return data;
}

export const aiSummarize = (leadId, force = false) => call('summarize', leadId, { force });
export const aiExtract = (leadId, force = false) => call('extract', leadId, { force });
export const aiReply = (conversationId, opts = {}) => call('reply', conversationId, opts);
export const aiTranscribe = (callId, force = false) => call('transcribe', callId, { force });
export const aiAnalytics = (opts) => call('analytics', null, opts);

export async function getLeadAi(leadId) {
  const { data } = await supabase
    .from('lead_ai_profiles')
    .select('summary, next_step, summary_at, extracted, extracted_at')
    .eq('lead_id', leadId)
    .maybeSingle();
  return data;
}

export async function getTranscript(callId) {
  const { data } = await supabase.from('call_transcripts').select('transcript, summary, created_at').eq('call_id', callId).maybeSingle();
  return data;
}

export async function aiStatus() {
  const { data, error } = await supabase.rpc('ai_status');
  if (error) throw new Error(error.message);
  return data;
}

export async function saveAiSettings({ enabled, autoClassify, budget }) {
  const { data, error } = await supabase.rpc('ai_save_settings', { p_enabled: enabled, p_auto_classify: autoClassify, p_budget: Number(budget) });
  if (error) throw new Error(error.message);
  return data;
}

export async function aiUsageSummary(month) {
  const { data, error } = await supabase.rpc('ai_usage_summary', { p_month: month || null });
  if (error) throw new Error(error.message);
  return data;
}

export const usd = (n, d = 2) => `$${Number(n || 0).toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: Math.max(d, 4) })}`;