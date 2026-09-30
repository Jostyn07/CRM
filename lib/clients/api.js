// Ruta: lib/clients/api.js
// Clientes traídos de Asesorías (solo lectura) y su cruce con leads.

import { supabase } from '../supabase/client';

async function rpc(name, params) {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw new Error(error.message);
  return data;
}

export const sourceStatus = () => rpc('clients_source_status');
export const saveSource = (baseUrl, token, auto = true) =>
  rpc('clients_save_source', { p_base_url: baseUrl, p_token: token || null, p_auto: auto });

export async function syncNow(full = false) {
  const { data, error } = await supabase.functions.invoke('clients-sync', { body: { full } });
  if (error) {
    let msg = error.message;
    try {
      msg = (await error.context.json()).error || msg;
    } catch {}
    throw new Error(msg);
  }
  if (data && data.ok === false) throw new Error(data.error || 'La sincronización falló');
  return data;
}

export const listClients = ({ search = '', filter = 'all', page = 1, pageSize = 50, archived = false, portal = '' } = {}) =>
  rpc('clients_list', {
    p_search: search || null,
    p_filter: filter,
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
    p_archived: archived,
    p_portal: portal || null,
  });

// Portales de Asesorías y su sucursal
export const listPortals = () => rpc('clients_portals');
export const setPortalBranch = (portalKey, branchId) => rpc('clients_set_portal_branch', { p_portal_key: portalKey, p_branch: branchId || null });
export const setUserPortals = (userId, portalKeys) => rpc('set_user_portals', { p_user: userId, p_portals: portalKeys ?? [] });

export const clientsByPhone = (phone) => rpc('clients_by_phone', { p_phone: phone });
export const clientsForLead = (leadId) => rpc('clients_for_lead', { p_lead: leadId });
export const matchingLeads = (clientId) => rpc('client_matching_leads', { p_client: clientId });
export const policySecrets = (clientId) => rpc('client_policy_secrets', { p_client: clientId });
export const createLeadFromClient = (clientId, branchId) => rpc('client_create_lead', { p_client: clientId, p_branch: branchId || null });

// Campos del cliente que no se muestran en "Otros datos"
export const HIDDEN_FIELDS = new Set([
  'id', 'created_at', 'updated_at', 'archivado', 'nombres', 'nombre', 'apellidos', 'apellido',
  'email', 'correo', 'user_id', 'organization_id', 'portal_id', 'operador_id', 'operador_email',
  'fecha_nacimiento', 'operador_nombre', 'archivado_por', 'archivado_fecha', 'motivo_archivo',
  'restaurado_por', 'restaurado_fecha',
]);

// Datos principales del cliente de Asesorías, en este orden
export const MAIN_FIELDS = [
  ['direccion', 'Dirección'], ['casa_apartamento', 'Casa / apto.'], ['ciudad', 'Ciudad'], ['estado', 'Estado'],
  ['codigo_postal', 'Código postal'], ['condado', 'Condado'], ['po_box', 'PO Box'], ['genero', 'Género'],
  ['nacionalidad', 'Nacionalidad'], ['ocupacion', 'Ocupación'], ['ingreso_anual', 'Ingreso anual'],
  ['tipo_registro', 'Tipo de registro'], ['fecha_registro', 'Fecha de registro'], ['aplica', 'Aplica'],
  ['portal', 'Portal'], ['tipo_declaracion', 'Tipo de declaración'], ['agente_nombre', 'Agente'],
  ['venta_realizada_por', 'Venta realizada por'], ['caso_especial', 'Caso especial'], ['tipo_modificacion', 'Tipo de modificación'],
];

export function humanize(key) {
  const s = String(key).replace(/_/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function fmtValue(v) {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  if (typeof v === 'number') return v.toLocaleString('es-CO');
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}(T|$)/.test(v)) {
    const d = new Date(v.length === 10 ? `${v}T12:00:00` : v);
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function money(v) {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  return Number.isNaN(n) ? String(v) : n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}