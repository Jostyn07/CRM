'use client';
// Ruta: app/leads/page.js
// Lista de leads (sección 21.1): búsqueda, filtros, paginación,
// selección, acciones masivas, exportación y creación.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import RequirePermission from '../../components/ui/requirePermission';
import Modal from '../../components/ui/modal';
import LeadForm from '../../components/leads/leadForm';
import LeadFilters, { toApiFilters } from '../../components/leads/leadFilters';
import { StatusPill, TagChips } from '../../components/leads/tagPicker';
import { useSession } from '../../lib/auth/sessionContext';
import { useLeadConfig } from '../../lib/leads/useLeadConfig';
import { bulkUpdate, exportLeads, searchLeads, softDelete } from '../../lib/leads/api';
import { downloadLeads } from '../../lib/leads/exportFile';
import { trackEvent } from '../../lib/activity/tracker';
import { relTime } from '../../lib/leads/format';

const PAGE_SIZES = [25, 50, 100];
const SORTS = [
  { value: 'created_desc', label: 'Más recientes' },
  { value: 'created_asc', label: 'Más antiguos' },
  { value: 'name_asc', label: 'Nombre (A-Z)' },
  { value: 'activity_desc', label: 'Última actividad' },
];

export default function LeadsPage() {
  return (
    <RequirePermission perm="leads.view">
      <LeadsList />
    </RequirePermission>
  );
}

function LeadsList() {
  const router = useRouter();
  const { can, activeBranchId, activeBranch } = useSession();
  const config = useLeadConfig();

  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [filters, setFilters] = useState({});
  const [showFilters, setShowFilters] = useState(false);
  const [sort, setSort] = useState('created_desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);

  const apiFilters = useMemo(() => toApiFilters(filters, debounced, activeBranchId), [filters, debounced, activeBranchId]);
  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  // Búsqueda con espera (una consulta cuando se deja de escribir)
  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search);
      setPage(1);
      if (search.trim()) trackEvent('lead.search', { metadata: { term_length: search.trim().length } });
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await searchLeads({ filters: apiFilters, page, pageSize, sort });
      setRows(res.rows);
      setTotal(res.total);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [apiFilters, page, pageSize, sort]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => setSelected([]), [apiFilters, page, pageSize, sort]);

  function changeFilters(next) {
    setFilters(next);
    setPage(1);
    trackEvent('lead.filter', { metadata: { filters: Object.keys(next).filter((k) => next[k]) } });
  }

  function flash(msg) {
    setNotice(msg);
    setTimeout(() => setNotice(null), 4000);
  }

  async function runBulk(action, fn) {
    if (!selected.length) return;
    setBusy(true);
    try {
      const n = await fn(selected);
      trackEvent(`lead.bulk_${action}`, { metadata: { requested: selected.length, affected: n } });
      flash(n === selected.length ? `${n} lead(s) actualizados.` : `${n} de ${selected.length} actualizados (el resto no lo permiten tus permisos).`);
      await load();
    } catch (e) {
      flash(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleExport(onlySelected) {
    setBusy(true);
    try {
      const data = await exportLeads(apiFilters, onlySelected ? selected : null);
      if (!data.length) return flash('No hay leads para exportar.');
      downloadLeads(data, config.customFields);
      flash(`${data.length} lead(s) exportados.`);
    } catch (e) {
      flash(e.message);
    } finally {
      setBusy(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const allOnPage = rows.length > 0 && rows.every((r) => selected.includes(r.id));
  const toggleAll = () => setSelected(allOnPage ? [] : rows.map((r) => r.id));
  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <main style={{ padding: '1.5rem', maxWidth: 1400 }}>
      {/* Encabezado */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Leads</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
            {total.toLocaleString('es-CO')} lead(s){activeBranch ? ` · ${activeBranch.name}` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {can('leads.delete') && (
            <a className="btn btn-secondary" href="/leads/papelera">
              🗑️ Papelera
            </a>
          )}
          {can('leads.import') && (
            <a className="btn btn-secondary" href="/imports">
              📥 Importar
            </a>
          )}
          {can('leads.export') && (
            <button className="btn btn-secondary" onClick={() => handleExport(false)} disabled={busy || !total}>
              📤 Exportar
            </button>
          )}
          {can('leads.create') && (
            <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
              + Nuevo lead
            </button>
          )}
        </div>
      </div>

      {/* Búsqueda y orden */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        <input
          className="input"
          style={{ flex: '1 1 280px' }}
          placeholder="Buscar por nombre, teléfono, correo o empresa…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="btn btn-secondary" onClick={() => setShowFilters((v) => !v)}>
          Filtros{activeFilterCount ? ` (${activeFilterCount})` : ''}
        </button>
        {activeFilterCount > 0 && (
          <button className="btn btn-secondary" onClick={() => changeFilters({})}>
            Limpiar
          </button>
        )}
        <select className="input" style={{ width: 180 }} value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Ordenar">
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {showFilters && (
        <div className="card" style={{ marginBottom: '0.75rem', padding: '0.75rem' }}>
          <LeadFilters config={config} filters={filters} onChange={changeFilters} showAssigned={can('leads.view', 'branch')} />
        </div>
      )}

      {/* Acciones masivas */}
      {selected.length > 0 && (
        <BulkBar
          count={selected.length}
          config={config}
          busy={busy}
          canAssign={can('leads.assign')}
          canUpdate={can('leads.update')}
          canDelete={can('leads.delete')}
          canExport={can('leads.export')}
          onAssign={(userId) => runBulk('assign', (ids) => bulkUpdate(ids, { assigned_user_id: userId || null }))}
          onStatus={(statusId) => runBulk('status', (ids) => bulkUpdate(ids, { status_id: statusId }))}
          onDelete={() => {
            if (confirm(`¿Enviar ${selected.length} lead(s) a la papelera?`)) runBulk('delete', softDelete);
          }}
          onExport={() => handleExport(true)}
          onClear={() => setSelected([])}
        />
      )}

      {notice && (
        <p className="card" style={{ padding: '0.5rem 0.8rem', marginBottom: '0.75rem', fontSize: '0.85rem' }}>
          {notice}
        </p>
      )}
      {error && <p style={{ color: 'var(--color-danger)', marginBottom: '0.75rem' }}>{error}</p>}

      {/* Tabla */}
      <div className="card scroll-x" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-border)' }}>
              <th style={th}>
                <input type="checkbox" checked={allOnPage} onChange={toggleAll} aria-label="Seleccionar página" />
              </th>
              <th style={th}>Nombre</th>
              <th style={th}>Contacto</th>
              <th style={th}>Empresa</th>
              <th style={th}>Estado</th>
              <th style={th}>Fuente</th>
              <th style={th}>Responsable</th>
              <th style={th}>Etiquetas</th>
              <th style={th}>Última actividad</th>
              <th style={th}>Creado</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={10} style={{ ...td, textAlign: 'center', color: 'var(--color-text-muted)' }}>
                  Cargando…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={10} style={{ ...td, textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem' }}>
                  {debounced || activeFilterCount ? 'Ningún lead coincide con la búsqueda.' : 'Todavía no hay leads.'}
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => router.push(`/leads/${r.id}`)}
                  style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer', background: selected.includes(r.id) ? 'var(--color-active-bg)' : undefined }}
                >
                  <td style={td} onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.includes(r.id)} onChange={() => toggle(r.id)} aria-label="Seleccionar lead" />
                  </td>
                  <td style={{ ...td, fontWeight: 600 }}>
                    {r.first_name} {r.last_name}
                    {!activeBranchId && config.maps.branch[r.branch_id] && (
                      <div style={{ fontWeight: 400, fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>📍 {config.maps.branch[r.branch_id].name}</div>
                    )}
                  </td>
                  <td style={td}>
                    <div>{r.phone_normalized || '—'}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>{r.email_normalized}</div>
                  </td>
                  <td style={td}>{r.company_name || '—'}</td>
                  <td style={td}>
                    <StatusPill status={config.maps.status[r.status_id]} />
                  </td>
                  <td style={td}>{config.maps.source[r.source_id]?.name ?? '—'}</td>
                  <td style={td}>{config.maps.user[r.assigned_user_id]?.name ?? <span style={{ color: 'var(--color-text-muted)' }}>Sin asignar</span>}</td>
                  <td style={td}>
                    <TagChips tagIds={r.tag_ids} tagMap={config.maps.tag} />
                  </td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{relTime(r.last_activity_at)}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{new Date(r.created_at).toLocaleDateString('es-CO')}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem', fontSize: '0.85rem', flexWrap: 'wrap', gap: 8 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          Por página
          <select
            className="input"
            style={{ width: 80, height: 32 }}
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            ← Anterior
          </button>
          <span>
            Página {page} de {totalPages}
          </span>
          <button className="btn btn-secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Siguiente →
          </button>
        </div>
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Nuevo lead" width={720}>
        {!config.loading && (
          <LeadForm
            config={config}
            onCancel={() => setCreateOpen(false)}
            onSaved={(id) => {
              setCreateOpen(false);
              router.push(`/leads/${id}`);
            }}
          />
        )}
      </Modal>
    </main>
  );
}

function BulkBar({ count, config, busy, canAssign, canUpdate, canDelete, canExport, onAssign, onStatus, onDelete, onExport, onClear }) {
  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '0.5rem 0.75rem', marginBottom: '0.75rem' }}>
      <strong style={{ fontSize: '0.86rem' }}>{count} seleccionado(s)</strong>
      {canAssign && (
        <select className="input" style={{ width: 200, height: 34 }} disabled={busy} value="" onChange={(e) => e.target.value && onAssign(e.target.value === '__none' ? null : e.target.value)}>
          <option value="">Asignar a…</option>
          <option value="__none">Quitar responsable</option>
          {config.users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      )}
      {canUpdate && (
        <select className="input" style={{ width: 180, height: 34 }} disabled={busy} value="" onChange={(e) => e.target.value && onStatus(e.target.value)}>
          <option value="">Cambiar estado…</option>
          {config.statuses
            .filter((s) => s.is_active)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </select>
      )}
      {canExport && (
        <button className="btn btn-secondary" onClick={onExport} disabled={busy}>
          Exportar selección
        </button>
      )}
      {canDelete && (
        <button className="btn btn-secondary" style={{ color: 'var(--color-danger)' }} onClick={onDelete} disabled={busy}>
          Enviar a papelera
        </button>
      )}
      <button className="btn btn-secondary" onClick={onClear} disabled={busy} style={{ marginLeft: 'auto' }}>
        Cancelar
      </button>
    </div>
  );
}

const th = { padding: '0.6rem 0.75rem', fontWeight: 500, fontSize: '0.78rem', whiteSpace: 'nowrap' };
const td = { padding: '0.6rem 0.75rem', verticalAlign: 'top' };
