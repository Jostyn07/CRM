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
import { useSession } from '../../lib/auth/sessionContext';
import { useLeadConfig } from '../../lib/leads/useLeadConfig';
import { bulkUpdate, exportLeads, searchLeads, softDelete } from '../../lib/leads/api';
import { downloadLeads } from '../../lib/leads/exportFile';
import { trackEvent } from '../../lib/activity/tracker';
import Icon, { IconText } from '../../components/ui/icon';
import { LeadGrid, LeadTable, Pager, StatusTabs } from '../../components/leads/leadViews';

const PAGE_SIZES = [10, 25, 50, 100];
const SORTS = [
  { value: 'created_desc', label: 'Más recientes' },
  { value: 'created_asc', label: 'Más antiguos' },
  { value: 'name_asc', label: 'Nombre (A-Z)' },
  { value: 'activity_desc', label: 'Último contacto' },
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
  // Enlace directo a "sin asignar" (por ejemplo, desde Reportes): /leads?asignado=none
  useEffect(() => {
    try {
      if (new URLSearchParams(window.location.search).get('asignado') === 'none') setFilters((f) => ({ ...f, assigned: '__none' }));
    } catch {}
  }, []);
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
  const [view, setView] = useState('list'); // 'list' | 'grid'
  const [counts, setCounts] = useState({ all: null, byStatus: {} });

  // Vista guardada por usuario en este navegador
  useEffect(() => {
    try {
      const v = localStorage.getItem('xiris.leads.view');
      if (v === 'grid' || v === 'list') setView(v);
    } catch {}
  }, []);
  function changeView(v) {
    setView(v);
    try {
      localStorage.setItem('xiris.leads.view', v);
    } catch {}
  }

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

  // Conteo por estado (las pestañas): mismos filtros, sin el de estado
  const baseFilters = useMemo(() => toApiFilters({ ...filters, status: '' }, debounced, activeBranchId), [filters, debounced, activeBranchId]);
  const statusKey = config.statuses.map((x) => x.id).join(',');
  useEffect(() => {
    if (config.loading) return undefined;
    let vivo = true;
    (async () => {
      try {
        const [all, ...each] = await Promise.all([
          searchLeads({ filters: baseFilters, page: 1, pageSize: 1 }),
          ...config.statuses.map((x) => searchLeads({ filters: { ...baseFilters, status_ids: [x.id] }, page: 1, pageSize: 1 })),
        ]);
        if (vivo) setCounts({ all: all.total, byStatus: Object.fromEntries(config.statuses.map((x, i) => [x.id, each[i].total])) });
      } catch {
        /* los conteos son informativos */
      }
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseFilters, statusKey, config.loading, total]);

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

  const allOnPage = rows.length > 0 && rows.every((r) => selected.includes(r.id));
  const toggleAll = () => setSelected(allOnPage ? [] : rows.map((r) => r.id));
  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const emptyText = debounced || activeFilterCount ? 'Ningún lead coincide con la búsqueda.' : 'Todavía no hay leads.';
  async function deleteOne(r) {
    if (!confirm(`¿Enviar a "${`${r.first_name ?? ''} ${r.last_name ?? ''}`.trim()}" a la papelera?`)) return;
    try {
      await softDelete([r.id]);
      trackEvent('lead.delete', { entityType: 'leads', entityId: r.id });
      flash('Lead enviado a la papelera.');
      await load();
    } catch (e) {
      flash(e.message);
    }
  }

  return (
    <main className="leads-page">
      {/* Encabezado */}
      <div className="leads-head">
        <div>
          <h1>
            Leads <span className="leads-count">{(counts.all ?? total).toLocaleString('es-CO')}</span>
          </h1>
          <p>Gestiona y da seguimiento a todos tus leads{activeBranch ? ` · ${activeBranch.name}` : ''}.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {can('leads.delete') && (
            <a className="btn btn-secondary" href="/leads/papelera">
              <IconText name="trash-2" size={16}>Papelera</IconText>
            </a>
          )}
          {can('leads.import') && (
            <a className="btn btn-secondary" href="/imports">
              <IconText name="upload" size={16}>Importar</IconText>
            </a>
          )}
          {can('leads.export') && (
            <button className="btn btn-secondary" onClick={() => handleExport(false)} disabled={busy || !total}>
              <IconText name="download" size={16}>Exportar</IconText>
            </button>
          )}
          {can('leads.create') && (
            <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
              <IconText name="plus" size={16}>Nuevo lead</IconText>
            </button>
          )}
        </div>
      </div>

      {/* Búsqueda, filtros, orden y vista */}
      <div className="leads-toolbar">
        <label className="leads-search">
          <Icon name="search" size={17} />
          <input placeholder="Buscar por nombre, teléfono, correo o empresa…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <button className={`btn btn-secondary${showFilters || activeFilterCount ? ' leads-btn-on' : ''}`} onClick={() => setShowFilters((v) => !v)}>
          <IconText name="filter" size={16}>Filtros{activeFilterCount ? ` (${activeFilterCount})` : ''}</IconText>
        </button>
        {activeFilterCount > 0 && (
          <button className="btn btn-secondary" onClick={() => changeFilters({})}>
            Limpiar
          </button>
        )}
        <label className="leads-select">
          <Icon name="arrow-up-down" size={15} />
          <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Ordenar">
            {SORTS.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
        <div className="leads-view" role="group" aria-label="Vista">
          <button type="button" className={view === 'list' ? 'on' : ''} onClick={() => changeView('list')} title="Vista de tabla" aria-pressed={view === 'list'}>
            <Icon name="list" size={18} />
          </button>
          <button type="button" className={view === 'grid' ? 'on' : ''} onClick={() => changeView('grid')} title="Vista de tarjetas" aria-pressed={view === 'grid'}>
            <Icon name="layout-grid" size={18} />
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="card" style={{ marginBottom: '0.75rem', padding: '0.75rem' }}>
          <LeadFilters config={config} filters={filters} onChange={changeFilters} showAssigned={can('leads.view', 'branch')} />
        </div>
      )}

      {/* Pestañas por estado */}
      {!config.loading && config.statuses.length > 0 && (
        <StatusTabs
          statuses={config.statuses}
          counts={counts.byStatus}
          total={counts.all}
          value={filters.status || ''}
          onChange={(id) => changeFilters({ ...filters, status: id })}
        />
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

      {view === 'grid' ? (
        <LeadGrid
          rows={rows}
          loading={loading}
          emptyText={emptyText}
          config={config}
          showBranch={!activeBranchId}
          selected={selected}
          onToggle={toggle}
          canDelete={can('leads.delete')}
          onDelete={deleteOne}
        />
      ) : (
        <LeadTable
          rows={rows}
          loading={loading}
          emptyText={emptyText}
          config={config}
          showBranch={!activeBranchId}
          selected={selected}
          allOnPage={allOnPage}
          onToggleAll={toggleAll}
          onToggle={toggle}
          sort={sort}
          onSort={setSort}
          canDelete={can('leads.delete')}
          onDelete={deleteOne}
        />
      )}

      <Pager
        page={page}
        pageSize={pageSize}
        total={total}
        sizes={PAGE_SIZES}
        onPage={setPage}
        onSize={(n) => {
          setPageSize(n);
          setPage(1);
        }}
      />

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