'use client';
// Ruta: app/settings/actividad/page.js
// Bitácora completa (activity_feed): cambios de datos + navegación e
// interacción de los usuarios. El alcance lo decide audit.view.

import { useCallback, useEffect, useState } from 'react';
import RequirePermission from '../../../components/ui/requirePermission';
import { SettingsHeader, bodyRow, cell, errorText, headRow } from '../../../components/settings/settingsTabs';
import { supabase } from '../../../lib/supabase/client';
import { useLeadConfig } from '../../../lib/leads/useLeadConfig';
import { describeEvent, fullDate } from '../../../lib/leads/format';

const PAGE_SIZE = 50;

export default function ActivityPage() {
  return (
    <RequirePermission perm="audit.view">
      <Activity />
    </RequirePermission>
  );
}

function Activity() {
  const config = useLeadConfig();
  const [filters, setFilters] = useState({ user: '', source: '', from: '', to: '', hideNoise: true });
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('activity_feed').select('*', { count: 'exact' });
    if (filters.user) q = q.eq('user_id', filters.user);
    if (filters.source) q = q.eq('source', filters.source);
    if (filters.from) q = q.gte('occurred_at', new Date(`${filters.from}T00:00:00`).toISOString());
    if (filters.to) q = q.lte('occurred_at', new Date(`${filters.to}T23:59:59.999`).toISOString());
    // Oculta los eventos de ventana (foco/desenfoque) salvo que se pidan
    if (filters.hideNoise) q = q.not('event_type', 'in', '(window.blur,window.focus)');
    const from = (page - 1) * PAGE_SIZE;
    const { data, count, error: err } = await q.order('occurred_at', { ascending: false }).range(from, from + PAGE_SIZE - 1);
    if (err) setError(await errorText(err));
    else {
      setRows(data ?? []);
      setTotal(count ?? 0);
      setError(null);
    }
    setLoading(false);
  }, [filters, page]);

  useEffect(() => {
    load();
  }, [load]);

  const set = (k) => (e) => {
    setPage(1);
    setFilters((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  };
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main style={{ padding: '1.5rem', maxWidth: 1200 }}>
      <SettingsHeader title="Actividad" subtitle="Todo lo que hacen los usuarios: cambios de datos, páginas visitadas, cambios de pestaña, inactividad e inicios de sesión." />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.8rem' }}>
        <select className="input" style={{ width: 220 }} value={filters.user} onChange={set('user')}>
          <option value="">Todos los usuarios</option>
          {config.users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <select className="input" style={{ width: 200 }} value={filters.source} onChange={set('source')}>
          <option value="">Todo</option>
          <option value="data">Solo cambios de datos</option>
          <option value="ui">Solo navegación e interacción</option>
        </select>
        <input className="input" type="date" style={{ width: 160 }} value={filters.from} onChange={set('from')} aria-label="Desde" />
        <input className="input" type="date" style={{ width: 160 }} value={filters.to} onChange={set('to')} aria-label="Hasta" />
        <label style={{ fontSize: '0.82rem', display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={filters.hideNoise} onChange={set('hideNoise')} /> Ocultar cambios de foco de ventana
        </label>
      </div>

      {error && <p style={{ color: 'var(--color-danger)', marginBottom: '0.8rem' }}>{error}</p>}

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={headRow}>
              <th style={cell}>Fecha</th>
              <th style={cell}>Usuario</th>
              <th style={cell}>Acción</th>
              <th style={cell}>Dónde</th>
              <th style={cell}>Tipo</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} style={{ ...cell, textAlign: 'center', padding: '1.5rem' }}>
                  Cargando…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={5} style={{ ...cell, textAlign: 'center', padding: '1.5rem', color: 'var(--color-text-muted)' }}>
                  No hay actividad con esos filtros.
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((ev) => (
                <tr key={`${ev.source}-${ev.id}`} style={bodyRow}>
                  <td style={{ ...cell, whiteSpace: 'nowrap' }}>{fullDate(ev.occurred_at)}</td>
                  <td style={cell}>{config.maps.user[ev.user_id]?.name ?? (ev.user_id ? 'Usuario' : 'Sistema')}</td>
                  <td style={cell}>{describeEvent(ev, config.maps)}</td>
                  <td style={{ ...cell, color: 'var(--color-text-muted)' }}>
                    {ev.entity_type === 'leads' && ev.entity_id ? (
                      <a href={`/leads/${ev.entity_id}`} style={{ color: 'var(--color-primary)' }}>
                        Ver lead
                      </a>
                    ) : (
                      ev.path || ev.entity_type || '—'
                    )}
                  </td>
                  <td style={cell}>{ev.source === 'data' ? 'Datos' : 'Navegación'}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem', fontSize: '0.85rem' }}>
        <span>{total.toLocaleString('es-CO')} evento(s)</span>
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
    </main>
  );
}