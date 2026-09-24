'use client';
// Ruta: components/leads/leadFilters.js
// Filtros de la lista (sección 9.5): estado, fuente, responsable,
// etiqueta, fecha y campos personalizados de tipo lista.

export default function LeadFilters({ config, filters, onChange, showAssigned }) {
  const set = (key, value) => onChange({ ...filters, [key]: value || undefined });
  const selectFields = config.customFields.filter((f) => f.is_active && f.field_type === 'single_select');

  const control = { className: 'input', style: { fontSize: '0.84rem', height: 36 } };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 8 }}>
      <select {...control} value={filters.status || ''} onChange={(e) => set('status', e.target.value)} aria-label="Estado">
        <option value="">Todos los estados</option>
        {config.statuses.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>

      <select {...control} value={filters.source || ''} onChange={(e) => set('source', e.target.value)} aria-label="Fuente">
        <option value="">Todas las fuentes</option>
        {config.sources.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>

      {showAssigned && (
        <select {...control} value={filters.assigned || ''} onChange={(e) => set('assigned', e.target.value)} aria-label="Responsable">
          <option value="">Todos los responsables</option>
          <option value="__none">Sin asignar</option>
          {config.users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      )}

      <select {...control} value={filters.tag || ''} onChange={(e) => set('tag', e.target.value)} aria-label="Etiqueta">
        <option value="">Todas las etiquetas</option>
        {config.tags.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>

      <input {...control} type="date" value={filters.from || ''} onChange={(e) => set('from', e.target.value)} title="Creado desde" aria-label="Creado desde" />
      <input {...control} type="date" value={filters.to || ''} onChange={(e) => set('to', e.target.value)} title="Creado hasta" aria-label="Creado hasta" />

      {selectFields.map((f) => (
        <select
          key={f.id}
          {...control}
          value={filters.custom?.[f.key] || ''}
          onChange={(e) => {
            const custom = { ...(filters.custom || {}) };
            if (e.target.value) custom[f.key] = e.target.value;
            else delete custom[f.key];
            onChange({ ...filters, custom: Object.keys(custom).length ? custom : undefined });
          }}
          aria-label={f.name}
        >
          <option value="">{f.name}: todos</option>
          {(f.options || []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ))}
    </div>
  );
}

// Filtros de UI → formato de filter_leads() en la base de datos
export function toApiFilters(filters, search, activeBranchId) {
  const f = {};
  if (search?.trim()) f.search = search.trim();
  if (filters.status) f.status_ids = [filters.status];
  if (filters.source) f.source_ids = [filters.source];
  if (filters.tag) f.tag_ids = [filters.tag];
  if (filters.assigned === '__none') f.unassigned = true;
  else if (filters.assigned) f.assigned_user_ids = [filters.assigned];
  if (filters.from) f.created_from = new Date(`${filters.from}T00:00:00`).toISOString();
  if (filters.to) f.created_to = new Date(`${filters.to}T23:59:59.999`).toISOString();
  if (filters.custom) f.custom = filters.custom;
  if (activeBranchId) f.branch_ids = [activeBranchId];
  return f;
}