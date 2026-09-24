// Ruta: lib/leads/format.js

export function relTime(iso) {
  if (!iso) return '—';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'hace un momento';
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  if (diff < 86400 * 30) return `hace ${Math.floor(diff / 86400)} d`;
  return new Date(iso).toLocaleDateString('es-CO');
}

export function fullDate(iso) {
  return iso ? new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

// Descripción legible de un evento de activity_feed
const EVENT_LABELS = {
  'leads.insert': 'Creó el lead',
  'leads.update': 'Editó el lead',
  'leads.delete': 'Eliminó permanentemente el lead',
  'leads.duplicate_attempt': 'Intentó crear un duplicado de este lead',
  'lead_tags.insert': 'Agregó una etiqueta',
  'lead_tags.delete': 'Quitó una etiqueta',
  'lead.view': 'Abrió la ficha',
  'lead.tab_change': 'Cambió de pestaña',
  'lead.updated_form': 'Guardó el formulario',
  'lead.edit_open': 'Abrió la edición',
};

const FIELD_LABELS = {
  first_name: 'nombre',
  last_name: 'apellido',
  phone_normalized: 'teléfono',
  email_normalized: 'correo',
  company_name: 'empresa',
  country: 'país',
  state: 'estado/departamento',
  city: 'ciudad',
  address: 'dirección',
  status_id: 'estado',
  source_id: 'fuente',
  assigned_user_id: 'responsable',
  branch_id: 'sucursal',
  custom_data: 'campos personalizados',
  deleted_at: 'papelera',
};

export function describeEvent(ev, maps) {
  let text = EVENT_LABELS[ev.event_type] ?? ev.event_type;

  if (ev.event_type === 'lead.tab_change') {
    text += `: ${ev.metadata?.from ?? '—'} → ${ev.metadata?.to ?? '—'}`;
  }

  if (ev.event_type === 'leads.update') {
    const o = ev.metadata?.old ?? {};
    const n = ev.metadata?.new ?? {};
    if (!o.deleted_at && n.deleted_at) return 'Envió el lead a la papelera';
    if (o.deleted_at && !n.deleted_at) return 'Restauró el lead de la papelera';

    const changes = Object.keys(FIELD_LABELS)
      .filter((k) => JSON.stringify(o[k]) !== JSON.stringify(n[k]))
      .map((k) => {
        if (k === 'status_id') return `estado: ${maps.status[o[k]]?.name ?? '—'} → ${maps.status[n[k]]?.name ?? '—'}`;
        if (k === 'assigned_user_id') return `responsable: ${maps.user[o[k]]?.name ?? 'sin asignar'} → ${maps.user[n[k]]?.name ?? 'sin asignar'}`;
        if (k === 'branch_id') return `sucursal: ${maps.branch[o[k]]?.name ?? '—'} → ${maps.branch[n[k]]?.name ?? '—'}`;
        if (k === 'source_id') return `fuente: ${maps.source[o[k]]?.name ?? '—'} → ${maps.source[n[k]]?.name ?? '—'}`;
        return FIELD_LABELS[k];
      });
    if (changes.length) text = `Cambió ${changes.join('; ')}`;
  }

  if (ev.event_type.startsWith('lead_tags.')) {
    const tagId = (ev.metadata?.new ?? ev.metadata?.old)?.tag_id;
    const name = maps.tag[tagId]?.name;
    if (name) text += `: ${name}`;
  }
  return text;
}