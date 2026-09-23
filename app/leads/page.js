'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase/client';
import LeadCard from '../../components/leads/leadCard';
import LeadBulkActions from '../../components/leads/leadBulkActions';
import LeadCreateForm from '../../components/leads/leadCreateForm';
import Modal from '../../components/ui/modal';
import Button from '../../components/ui/button';

const SEARCH_DEBOUNCE_MS = 400;
const PAGE_SIZE_OPTIONS = [10, 20, 40, 60];
const SORT_OPTIONS = [
  { value: 'name_asc', label: 'Nombre (A-Z)' },
  { value: 'name_desc', label: 'Nombre (Z-A)' },
  { value: 'created_desc', label: 'Más reciente' },
  { value: 'created_asc', label: 'Más antiguo' },
];

export default function LeadsPage() {
  const [leads, setLeads] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortBy, setSortBy] = useState('created_desc');

  const [funnels, setFunnels] = useState([]);
  const [filterFunnelId, setFilterFunnelId] = useState(''); // '' = todos, 'unassigned' = sin embudo, o id de embudo

  const [states, setStates] = useState([]);
  const [filterState, setFilterState] = useState(''); // '' = todos

  const [stats, setStats] = useState(null); // { total, unassigned, byFunnel: [{funnel, count}] }

  const [isAdmin, setIsAdmin] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [users, setUsers] = useState([]);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  // Debounce de la búsqueda: espera a que la persona deje de escribir
  // antes de consultar al servidor (evita una consulta por cada tecla).
  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    loadLeads(page, pageSize, debouncedSearch, filterFunnelId, filterState, sortBy);
  }, [page, pageSize, debouncedSearch, filterFunnelId, filterState, sortBy]);

  useEffect(() => {
    loadFunnels();
    loadRole();
    loadStats();
    loadStates();
  }, []);

  async function loadRole() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    const admin = data?.role === 'admin';
    setIsAdmin(admin);
    setIsOwner(data?.role === 'owner');
    if (admin) {
      const { data: profiles } = await supabase.from('profiles').select('id, full_name').order('full_name');
      setUsers(profiles ?? []);
    }
  }

  async function loadFunnels() {
    const { data } = await supabase
      .from('funnels')
      .select('id, name, is_default_stage, is_protected')
      .order('is_default_stage', { ascending: false })
      .order('is_protected', { ascending: false })
      .order('name');
    setFunnels(data ?? []);
  }

  // Trae los valores de "state" que realmente existen entre los leads
  // (la columna es generada automáticamente desde address) y arma la
  // lista de opciones del filtro sin duplicados.
  async function loadStates() {
    // RPC con DISTINCT real en la base -- traer la columna state de
    // TODOS los leads (podían ser miles) chocaba con el límite de
    // 1000 filas por defecto de PostgREST y se perdían estados.
    const { data } = await supabase.rpc('get_distinct_lead_states');
    setStates((data ?? []).map((r) => r.state));
  }

  // Totales para la fila de estadísticas — siempre reflejan el total
  // real (no el filtro/búsqueda actual de la tabla).
  async function loadStats() {
    const { count: total } = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active');

    const { count: unassigned } = await supabase
      .from('leads')
      .select('id, lead_funnel!left(funnel_id)', { count: 'exact', head: true })
      .eq('status', 'active')
      .is('lead_funnel.funnel_id', null);

    const { data: funnelsData } = await supabase
      .from('funnels')
      .select('id, name, is_default_stage, is_protected')
      .order('is_default_stage', { ascending: false })
      .order('is_protected', { ascending: false })
      .order('name');

    const byFunnel = await Promise.all(
      (funnelsData ?? []).slice(0, 4).map(async (f) => {
        const { count } = await supabase
          .from('lead_funnel')
          .select('leads!inner(id)', { count: 'exact', head: true })
          .eq('funnel_id', f.id)
          .eq('leads.status', 'active');
        return { funnel: f, count: count ?? 0 };
      })
    );

    setStats({ total: total ?? 0, unassigned: unassigned ?? 0, byFunnel });
  }

  // Trae una página de leads directamente del servidor, con el filtro de
  // búsqueda, embudo, estado y orden ya aplicados en la consulta (no en
  // el cliente) — así funciona igual de bien con 100 leads que con 50,000.
  async function loadLeads(pageNum, size, searchTerm, funnelFilter, stateFilter, sort) {
    setLoading(true);
    setErrorMsg(null);

    const from = (pageNum - 1) * size;
    const to = from + size - 1;

    const specificFunnel = funnelFilter && funnelFilter !== 'unassigned';

    let query = supabase
      .from('leads')
      .select(
        specificFunnel
          ? `id, name, phone, address, email, status, state,
             lead_funnel!inner ( funnel_id, funnels ( name, is_default_stage, is_protected ) )`
          : `id, name, phone, address, email, status, state,
             lead_funnel ( funnel_id, funnels ( name, is_default_stage, is_protected ) )`,
        { count: 'exact' }
      )
      .eq('status', 'active');

    if (specificFunnel) {
      query = query.eq('lead_funnel.funnel_id', funnelFilter);
    } else if (funnelFilter === 'unassigned') {
      query = query.is('lead_funnel.funnel_id', null);
    }

    if (stateFilter) {
      query = query.eq('state', stateFilter);
    }

    if (searchTerm.trim()) {
      const term = searchTerm.trim().replace(/[%,]/g, '');
      query = query.or(`name.ilike.%${term}%,phone.ilike.%${term}%`);
    }

    const [sortField, sortDir] = sort.startsWith('name')
      ? ['name', sort.endsWith('asc') ? 'asc' : 'desc']
      : ['created_at', sort.endsWith('asc') ? 'asc' : 'desc'];
    query = query.order(sortField, { ascending: sortDir === 'asc' }).range(from, to);

    const { data, error, count } = await query;

    if (error) {
      setErrorMsg(error.message);
    } else {
      setLeads(data ?? []);
      setTotalCount(count ?? 0);
      setSelectedIds([]);
    }
    setLoading(false);
  }

  function refreshAll() {
    loadLeads(page, pageSize, debouncedSearch, filterFunnelId, filterState, sortBy);
    loadStats();
    loadStates();
  }

  function toggleSelect(leadId) {
    setSelectedIds((prev) =>
      prev.includes(leadId) ? prev.filter((id) => id !== leadId) : [...prev, leadId]
    );
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => (prev.length === leads.length ? [] : leads.map((l) => l.id)));
  }

  async function handleCreateLead(newLead, resetForm) {
    setCreating(true);
    setCreateError(null);

    const { error } = await supabase.from('leads').insert(newLead);

    setCreating(false);
    if (error) {
      if (error.code === '23505') {
        setCreateError('Ya existe un lead con ese teléfono.');
      } else {
        setCreateError(error.message);
      }
    } else {
      resetForm();
      setCreateModalOpen(false);
      setPage(1);
      loadLeads(1, pageSize, debouncedSearch, filterFunnelId, filterState, sortBy);
      loadStats();
      loadStates();
    }
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const rangeStart = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, totalCount);

  // Genera la lista de números de página a mostrar (con "…" si hay muchas).
  function getPageNumbers() {
    const pages = [];
    const windowSize = 1;
    for (let p = 1; p <= totalPages; p++) {
      if (p === 1 || p === totalPages || Math.abs(p - page) <= windowSize) {
        pages.push(p);
      } else if (pages[pages.length - 1] !== '…') {
        pages.push('…');
      }
    }
    return pages;
  }

  const funnelBadgeColor = (f) =>
    f.is_default_stage
      ? 'var(--color-status-default)'
      : f.is_protected
      ? 'var(--color-status-protected)'
      : 'var(--color-status-custom)';

  return (
    <main style={{ padding: '28px 32px', maxWidth: 1500, margin: '0 auto' }}>
      {/* Encabezado */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ fontSize: '1.9rem', fontWeight: 750, letterSpacing: '-0.02em' }}>Leads</h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
            {totalCount.toLocaleString('es')} leads disponibles
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <div className="card" style={{ padding: 4, display: 'flex', gap: 4 }}>
            <button
              onClick={() => setViewMode('grid')}
              title="Vista cuadrícula"
              className={viewMode === 'grid' ? 'btn btn-primary' : 'btn btn-secondary'}
              style={{ border: 'none', padding: '0.4rem 0.6rem' }}
            >
              ▦
            </button>
            <button
              onClick={() => setViewMode('list')}
              title="Vista lista"
              className={viewMode === 'list' ? 'btn btn-primary' : 'btn btn-secondary'}
              style={{ border: 'none', padding: '0.4rem 0.6rem' }}
            >
              ☰
            </button>
          </div>
          <a href="/funnels" className="btn btn-secondary">Ver embudos</a>
          {isAdmin && <Button onClick={() => setCreateModalOpen(true)}>+ Nuevo lead</Button>}
          {isOwner && <a href="/imports" className="btn btn-secondary">Importar Excel</a>}
        </div>
      </div>

      {errorMsg && (
        <p style={{ color: 'var(--color-danger)', marginBottom: '1rem' }}>{errorMsg}</p>
      )}

      {/* Fila de estadísticas */}
      {stats && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${2 + stats.byFunnel.length}, minmax(120px, 1fr))`,
            gap: '0.75rem',
            marginBottom: '1.25rem',
          }}
        >
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.85rem 1rem' }}>
            <span style={{ fontSize: '1.1rem' }}>👥</span>
            <div>
              <div style={{ fontWeight: 750, fontSize: '1.1rem' }}>{stats.total.toLocaleString('es')}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Total de leads</div>
            </div>
          </div>
          {stats.byFunnel.map(({ funnel, count }) => (
            <div key={funnel.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.85rem 1rem' }}>
              <span className="status-dot" style={{ background: funnelBadgeColor(funnel), width: 12, height: 12 }} />
              <div>
                <div style={{ fontWeight: 750, fontSize: '1.1rem' }}>{count.toLocaleString('es')}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{funnel.name}</div>
              </div>
            </div>
          ))}
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.85rem 1rem' }}>
            <span className="status-dot" style={{ background: 'var(--color-status-none)', width: 12, height: 12 }} />
            <div>
              <div style={{ fontWeight: 750, fontSize: '1.1rem' }}>{stats.unassigned.toLocaleString('es')}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Sin asignar</div>
            </div>
          </div>
        </div>
      )}

      {/* Búsqueda y filtros */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'center' }}>
        <div style={{ position: 'relative', width: 320, maxWidth: '100%' }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
            🔎
          </span>
          <input
            className="input"
            placeholder="Buscar nombre, teléfono…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: '2rem', height: 44 }}
          />
        </div>
        <select
          className="input"
          style={{ maxWidth: 200, height: 44 }}
          value={filterFunnelId}
          onChange={(e) => {
            setFilterFunnelId(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Todos los embudos</option>
          <option value="unassigned">Sin embudo</option>
          {funnels.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
        <select
          className="input"
          style={{ maxWidth: 160, height: 44 }}
          value={filterState}
          onChange={(e) => {
            setFilterState(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Todos los estados</option>
          {states.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        {(filterFunnelId || filterState || search) && (
          <button
            className="btn btn-secondary"
            onClick={() => {
              setSearch('');
              setDebouncedSearch('');
              setFilterFunnelId('');
              setFilterState('');
              setPage(1);
            }}
          >
            Limpiar filtros
          </button>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Ordenar por</span>
          <select
            className="input"
            style={{ height: 44 }}
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value);
              setPage(1);
            }}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      <LeadBulkActions selectedIds={selectedIds} onDone={refreshAll} isAdmin={isAdmin} />

      {loading ? (
        <p>Cargando…</p>
      ) : (
        <>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '0.75rem',
              flexWrap: 'wrap',
              gap: '0.5rem',
            }}
          >
            <button
              className="btn btn-secondary"
              onClick={toggleSelectAll}
              style={{ fontSize: '0.85rem' }}
              disabled={leads.length === 0}
            >
              {selectedIds.length === leads.length && leads.length > 0 ? 'Deseleccionar todos' : 'Seleccionar todos (esta página)'}
            </button>
            <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
              {totalCount} resultado{totalCount === 1 ? '' : 's'}
            </span>
          </div>

          {viewMode === 'grid' ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '0.75rem',
              }}
            >
              {leads.map((lead) => (
                <LeadCard key={lead.id} lead={lead} selected={selectedIds.includes(lead.id)} onToggleSelect={toggleSelect} view="grid" onChanged={refreshAll} />
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {leads.map((lead) => (
                <LeadCard key={lead.id} lead={lead} selected={selectedIds.includes(lead.id)} onToggleSelect={toggleSelect} view="list" onChanged={refreshAll} />
              ))}
            </div>
          )}

          {leads.length === 0 && (
            <p style={{ padding: '1rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
              No hay leads que coincidan con la búsqueda o los filtros.
            </p>
          )}

          {/* Paginación */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '1.5rem',
              flexWrap: 'wrap',
              gap: '0.75rem',
            }}
          >
            <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
              Mostrando {rangeStart}–{rangeEnd} de {totalCount.toLocaleString('es')} leads
            </span>

            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <button className="btn btn-secondary" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: '0.4rem 0.6rem' }}>
                  ←
                </button>
                {getPageNumbers().map((p, i) =>
                  p === '…' ? (
                    <span key={`ellipsis-${i}`} style={{ padding: '0 0.3rem', color: 'var(--color-text-muted)' }}>…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={p === page ? 'btn btn-primary' : 'btn btn-secondary'}
                      style={{ padding: '0.4rem 0.7rem', minWidth: 36 }}
                    >
                      {p}
                    </button>
                  )
                )}
                <button className="btn btn-secondary" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ padding: '0.4rem 0.6rem' }}>
                  →
                </button>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Leads por página</span>
              <select
                className="input"
                style={{ width: 80 }}
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          </div>
        </>
      )}

      <Modal open={createModalOpen} onClose={() => setCreateModalOpen(false)} title="Nuevo lead">
        <LeadCreateForm
          onCreate={handleCreateLead}
          saving={creating}
          errorMsg={createError}
          isAdmin={isAdmin}
          users={users}
        />
      </Modal>
    </main>
  );
}
