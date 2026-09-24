'use client';
// Ruta: app/funnels/page.js
// Embudos: tablero Kanban (arrastrar y soltar) y vista de tabla, con
// totales por etapa. Mover a "Perdida" pide el motivo.

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import RequirePermission from '../../components/ui/requirePermission';
import Modal from '../../components/ui/modal';
import OpportunityForm from '../../components/opportunities/opportunityForm';
import OpportunityDetail from '../../components/opportunities/opportunityDetail';
import LostReasonDialog from '../../components/opportunities/lostReasonDialog';
import { supabase } from '../../lib/supabase/client';
import { useSession } from '../../lib/auth/sessionContext';
import { useLeadConfig } from '../../lib/leads/useLeadConfig';
import { funnelSummary, listOpportunities, money, moveOpportunity, useFunnelConfig } from '../../lib/opportunities/api';
import { relTime } from '../../lib/leads/format';
import { trackEvent, trackTab } from '../../lib/activity/tracker';

export default function FunnelsPage() {
  return (
    <RequirePermission perm="opportunities.view">
      <Suspense fallback={null}>
        <Board />
      </Suspense>
    </RequirePermission>
  );
}

function Board() {
  const params = useSearchParams();
  const { can, scopeOf, activeBranchId } = useSession();
  const fconfig = useFunnelConfig();
  const lconfig = useLeadConfig();

  const [funnelId, setFunnelId] = useState(params.get('funnel') || '');
  const [view, setView] = useState('kanban');
  const [userId, setUserId] = useState('');
  const [search, setSearch] = useState('');
  const [showClosed, setShowClosed] = useState(false);
  const [opps, setOpps] = useState([]);
  const [summary, setSummary] = useState({});
  const [error, setError] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [pendingLost, setPendingLost] = useState(null); // { oppId, stageId }

  useEffect(() => {
    if (!funnelId && fconfig.funnels.length) setFunnelId(fconfig.funnels.find((f) => f.is_active)?.id ?? '');
  }, [fconfig.funnels, funnelId]);

  const load = useCallback(async () => {
    if (!funnelId) return;
    try {
      const [rows, sum] = await Promise.all([
        listOpportunities({ funnelId, branchId: activeBranchId, userId, search, status: showClosed ? undefined : 'open' }),
        funnelSummary(funnelId, activeBranchId, userId),
      ]);
      setOpps(rows);
      setSummary(sum);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, [funnelId, activeBranchId, userId, search, showClosed]);

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  // Otros usuarios mueven oportunidades: el tablero se actualiza solo
  useEffect(() => {
    if (!funnelId) return;
    const ch = supabase
      .channel(`opps:${funnelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'opportunities', filter: `funnel_id=eq.${funnelId}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [funnelId, load]);

  const stages = fconfig.stagesOf(funnelId).filter((s) => s.is_active && (showClosed || s.kind === 'open'));
  const byStage = useMemo(() => {
    const m = {};
    for (const o of opps) (m[o.stage_id] ||= []).push(o);
    return m;
  }, [opps]);

  const openTotals = useMemo(() => {
    const open = fconfig.stagesOf(funnelId).filter((s) => s.kind === 'open');
    return open.reduce(
      (a, s) => ({ count: a.count + Number(summary[s.id]?.count ?? 0), value: a.value + Number(summary[s.id]?.total_value ?? 0), weighted: a.weighted + Number(summary[s.id]?.weighted_value ?? 0) }),
      { count: 0, value: 0, weighted: 0 }
    );
  }, [summary, funnelId, fconfig]);

  async function drop(stageId, lost = null) {
    const opp = opps.find((o) => o.id === dragId || o.id === pendingLost?.oppId);
    setDragId(null);
    if (!opp || opp.stage_id === stageId) return;
    const stage = fconfig.stageMap[stageId];
    if (stage.kind === 'lost' && !lost) return setPendingLost({ oppId: opp.id, stageId });
    // Movimiento optimista
    setOpps((list) => list.map((o) => (o.id === opp.id ? { ...o, stage_id: stageId } : o)));
    try {
      await moveOpportunity(opp.id, stageId, lost);
      trackEvent('opportunity.moved', { entityType: 'opportunities', entityId: opp.id, metadata: { to: stage.name, via: 'kanban' } });
    } catch (e) {
      setError(e.message);
    } finally {
      setPendingLost(null);
      load();
    }
  }

  const users = lconfig.users;
  const userName = (id) => users.find((u) => u.id === id)?.name;
  const currency = fconfig.currency;

  if (fconfig.loading) return <main style={{ padding: '1.5rem' }}>Cargando…</main>;

  return (
    <main style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Embudos</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
            {openTotals.count} abierta(s) · {money(openTotals.value, currency)} en juego · {money(openTotals.weighted, currency)} ponderado
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {can('funnels.manage') && (
            <a className="btn btn-secondary" href="/settings/embudos">
              ⚙️ Configurar
            </a>
          )}
          {can('opportunities.create') && (
            <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
              + Nueva oportunidad
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem' }}>
        <select className="input" style={{ width: 200 }} value={funnelId} onChange={(e) => setFunnelId(e.target.value)} aria-label="Embudo">
          {fconfig.funnels
            .filter((f) => f.is_active)
            .map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
        </select>
        <input className="input" style={{ width: 220 }} placeholder="Buscar por título…" value={search} onChange={(e) => setSearch(e.target.value)} />
        {scopeOf('opportunities.view') !== 'own' && (
          <select className="input" style={{ width: 200 }} value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">Todos los responsables</option>
            <option value="__none">Sin asignar</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        )}
        <label style={{ fontSize: '0.84rem', display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> Mostrar ganadas y perdidas
        </label>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {['kanban', 'tabla'].map((v) => (
            <button
              key={v}
              className={view === v ? 'btn btn-primary' : 'btn btn-secondary'}
              onClick={() => {
                trackTab('funnels', view, v);
                setView(v);
              }}
            >
              {v === 'kanban' ? 'Kanban' : 'Tabla'}
            </button>
          ))}
        </div>
      </div>

      {error && <p style={{ color: 'var(--color-danger)', marginBottom: 8 }}>{error}</p>}

      {view === 'kanban' ? (
        <div className="scroll-x" style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 12, alignItems: 'flex-start' }}>
          {stages.map((s) => {
            const items = byStage[s.id] ?? [];
            const sum = summary[s.id];
            return (
              <div
                key={s.id}
                onDragOver={(e) => can('opportunities.update') && e.preventDefault()}
                onDrop={() => drop(s.id)}
                style={{ minWidth: 270, width: 270, flexShrink: 0, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', borderTop: `3px solid ${s.color}` }}
              >
                <div style={{ padding: '0.6rem 0.75rem', borderBottom: '1px solid var(--color-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, fontSize: '0.9rem' }}>
                    <span>{s.name}</span>
                    <span style={{ color: 'var(--color-text-muted)' }}>{sum?.count ?? 0}</span>
                  </div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--color-text-muted)' }}>
                    {money(sum?.total_value ?? 0, currency)}
                    {s.kind === 'open' ? ` · ${s.probability}%` : ''}
                  </div>
                </div>
                <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 80, maxHeight: '65vh', overflowY: 'auto' }}>
                  {items.map((o) => (
                    <div
                      key={o.id}
                      draggable={can('opportunities.update')}
                      onDragStart={() => setDragId(o.id)}
                      onClick={() => setSelected(o)}
                      className="card"
                      style={{ padding: '0.6rem 0.7rem', cursor: 'pointer', opacity: dragId === o.id ? 0.5 : 1 }}
                    >
                      <div style={{ fontWeight: 600, fontSize: '0.87rem' }}>{o.title}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                        {o.lead?.first_name} {o.lead?.last_name}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: '0.78rem' }}>
                        <strong>{money(o.value, o.currency)}</strong>
                        <span style={{ color: 'var(--color-text-muted)' }}>{userName(o.assigned_user_id) ?? 'Sin asignar'}</span>
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                        En esta etapa {relTime(o.stage_entered_at)}
                        {o.expected_close_date ? ` · cierre ${o.expected_close_date}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-border)', fontSize: '0.78rem' }}>
                {['Oportunidad', 'Lead', 'Etapa', 'Valor', 'Responsable', 'Cierre estimado', 'En la etapa'].map((h) => (
                  <th key={h} style={{ padding: '0.55rem 0.75rem' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {opps.filter((o) => showClosed || o.status === 'open').length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                    No hay oportunidades.
                  </td>
                </tr>
              )}
              {opps
                .filter((o) => showClosed || o.status === 'open')
                .map((o) => (
                  <tr key={o.id} onClick={() => setSelected(o)} style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer' }}>
                    <td style={{ padding: '0.55rem 0.75rem', fontWeight: 600 }}>{o.title}</td>
                    <td style={{ padding: '0.55rem 0.75rem' }}>
                      {o.lead?.first_name} {o.lead?.last_name}
                    </td>
                    <td style={{ padding: '0.55rem 0.75rem' }}>
                      <span style={{ borderLeft: `4px solid ${fconfig.stageMap[o.stage_id]?.color}`, paddingLeft: 6 }}>{fconfig.stageMap[o.stage_id]?.name}</span>
                    </td>
                    <td style={{ padding: '0.55rem 0.75rem' }}>{money(o.value, o.currency)}</td>
                    <td style={{ padding: '0.55rem 0.75rem' }}>{userName(o.assigned_user_id) ?? '—'}</td>
                    <td style={{ padding: '0.55rem 0.75rem' }}>{o.expected_close_date ?? '—'}</td>
                    <td style={{ padding: '0.55rem 0.75rem' }}>{relTime(o.stage_entered_at)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Nueva oportunidad" width={560}>
        <OpportunityForm
          funnelId={funnelId}
          fconfig={fconfig}
          users={users}
          onCancel={() => setCreateOpen(false)}
          onSaved={() => {
            setCreateOpen(false);
            load();
          }}
        />
      </Modal>

      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected?.title} width={600}>
        {selected && (
          <OpportunityDetail
            opportunity={opps.find((o) => o.id === selected.id) ?? selected}
            fconfig={fconfig}
            users={users}
            onChanged={load}
            onClose={() => setSelected(null)}
          />
        )}
      </Modal>

      <LostReasonDialog
        open={!!pendingLost}
        reasons={fconfig.lostReasons}
        onCancel={() => setPendingLost(null)}
        onConfirm={(lost) => {
          setDragId(pendingLost.oppId);
          drop(pendingLost.stageId, lost);
        }}
      />
    </main>
  );
}