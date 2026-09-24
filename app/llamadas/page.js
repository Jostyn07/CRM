'use client';
// Ruta: app/llamadas/page.js
// Historial de llamadas con estadísticas, filtros y grabaciones.
// Cada usuario ve según calls.view: las propias, su sucursal o toda la organización.

import { useCallback, useEffect, useMemo, useState } from 'react';
import RequirePermission from '../../components/ui/requirePermission';
import CallsTable from '../../components/calls/callsTable';
import { useSession } from '../../lib/auth/sessionContext';
import { useCalls } from '../../lib/calls/callContext';
import { useLeadConfig } from '../../lib/leads/useLeadConfig';
import { RESULTS, TECHNICAL_STATUS, fmtDuration, fmtMinutes, getCallStats, getMinutesSummary, listCalls } from '../../lib/calls/api';

const PAGE_SIZE = 25;

export default function CallsPage() {
  return (
    <RequirePermission any={['calls.view', 'calls.make']}>
      <Calls />
    </RequirePermission>
  );
}

function Calls() {
  const { can, scopeOf, activeBranchId } = useSession();
  const { openDialer, phase } = useCalls();
  const config = useLeadConfig();
  const [filters, setFilters] = useState({});
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState(null);
  const [minutes, setMinutes] = useState(null);
  const [error, setError] = useState(null);

  const effective = useMemo(() => ({ ...filters, branchId: filters.branchId || activeBranchId || undefined }), [filters, activeBranchId]);
  const seesOthers = ['branch', 'organization'].includes(scopeOf('calls.view'));

  const load = useCallback(async () => {
    try {
      const [res, st, mi] = await Promise.all([listCalls({ page, pageSize: PAGE_SIZE, filters: effective }), getCallStats(effective), getMinutesSummary()]);
      setRows(res.rows);
      setTotal(res.total);
      setStats(st);
      setMinutes(mi);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, [page, effective]);

  useEffect(() => {
    if (can('calls.view')) load();
    else getMinutesSummary().then(setMinutes);
  }, [load, can]);

  useEffect(() => {
    if (phase === 'idle' && can('calls.view')) load();
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k) => (e) => {
    setPage(1);
    setFilters((f) => ({ ...f, [k]: e.target.value || undefined }));
  };
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const available = minutes ? minutes.my_assigned_seconds - minutes.my_used_seconds : 0;

  const cards = stats
    ? [
        ['Llamadas', stats.total],
        ['Contestadas', stats.answered],
        ['Tiempo conectado', fmtDuration(stats.duration_seconds)],
        ['Externas', stats.external],
        ['Interesados', stats.by_result?.interesado ?? 0],
      ]
    : [];

  return (
    <main style={{ padding: '1.5rem', maxWidth: 1300 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Llamadas</h1>
          {minutes && (
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
              Tus minutos: {fmtMinutes(available)} disponibles de {fmtMinutes(minutes.my_assigned_seconds)} asignados
            </p>
          )}
        </div>
        {can('calls.make') && (
          <button className="btn btn-primary" onClick={() => openDialer()}>
            📞 Nueva llamada
          </button>
        )}
      </div>

      {!can('calls.view') ? (
        <p style={{ color: 'var(--color-text-muted)' }}>Puedes hacer llamadas, pero no tienes permiso para ver el historial.</p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: '1rem' }}>
            {cards.map(([label, value]) => (
              <div key={label} className="card" style={{ padding: '0.7rem 1rem' }}>
                <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>{value}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>{label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: '0.8rem' }}>
            <input className="input" style={{ width: 180 }} placeholder="Buscar número…" value={filters.number ?? ''} onChange={set('number')} />
            {seesOthers && (
              <select className="input" style={{ width: 200 }} value={filters.userId ?? ''} onChange={set('userId')}>
                <option value="">Todos los usuarios</option>
                {config.users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            )}
            <select className="input" style={{ width: 160 }} value={filters.status ?? ''} onChange={set('status')}>
              <option value="">Todos los estados</option>
              {Object.entries(TECHNICAL_STATUS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
            <select className="input" style={{ width: 170 }} value={filters.result ?? ''} onChange={set('result')}>
              <option value="">Todos los resultados</option>
              <option value="__none">Sin resultado</option>
              {Object.entries(RESULTS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
            <select className="input" style={{ width: 140 }} value={filters.type ?? ''} onChange={set('type')}>
              <option value="">Lead y externas</option>
              <option value="lead">Solo leads</option>
              <option value="external">Solo externas</option>
            </select>
            <input className="input" type="date" style={{ width: 150 }} value={filters.from ?? ''} onChange={set('from')} aria-label="Desde" />
            <input className="input" type="date" style={{ width: 150 }} value={filters.to ?? ''} onChange={set('to')} aria-label="Hasta" />
          </div>

          {error && <p style={{ color: 'var(--color-danger)', marginBottom: 8 }}>{error}</p>}
          <CallsTable rows={rows} users={config.maps.user} showUser={seesOthers} onChanged={load} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem', fontSize: '0.85rem' }}>
            <span>{total.toLocaleString('es-CO')} llamada(s)</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
        </>
      )}
    </main>
  );
}