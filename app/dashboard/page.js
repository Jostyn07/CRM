'use client';
// Ruta: app/dashboard/page.js
// Dashboard (Fase 5): indicadores del período (por defecto últimos 30
// días, zona horaria de la organización), leads por día, embudo, metas del
// mes, pendientes y top del equipo. Cada quien ve sus números según su
// alcance. Cada indicador tiene ⓘ con definición, población y fuente.

import { useCallback, useEffect, useMemo, useState } from 'react';
import RequirePermission from '../../components/ui/requirePermission';
import { DailyChart, FunnelChart, GoalsProgress, ReportFilters, StatTile, TileGrid } from '../../components/reports/widgets';
import { useSession } from '../../lib/auth/sessionContext';
import { useLeadConfig } from '../../lib/leads/useLeadConfig';
import { useFunnelConfig } from '../../lib/opportunities/api';
import { listTasks, dueLabel, isOverdue } from '../../lib/tasks/api';
import { getDaily, getFunnel, getGoalProgress, getKpis, getRanking, money, num, pct, presetRange, shortDate, todayIn, useOrgTimezone } from '../../lib/reports/api';

export default function DashboardPage() {
  return (
    <RequirePermission perm="reports.view">
      <Dashboard />
    </RequirePermission>
  );
}

function Dashboard() {
  const { user, profile, scopeOf } = useSession();
  const config = useLeadConfig();
  const fconfig = useFunnelConfig();
  const tz = useOrgTimezone();
  const scope = scopeOf('reports.view');
  const [f, setF] = useState(null);
  const [kpis, setKpis] = useState(null);
  const [daily, setDaily] = useState([]);
  const [funnelId, setFunnelId] = useState('');
  const [funnel, setFunnel] = useState([]);
  const [goals, setGoals] = useState([]);
  const [ranking, setRanking] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (tz && !f) setF({ preset: '30d', ...presetRange('30d', tz), branchId: '', userId: '' });
  }, [tz, f]);

  useEffect(() => {
    if (!funnelId && fconfig.funnels.length) setFunnelId(fconfig.funnels[0].id);
  }, [fconfig.funnels, funnelId]);

  const load = useCallback(async () => {
    if (!f) return;
    setError(null);
    try {
      const [k, d, r] = await Promise.all([getKpis(f), getDaily(f), getRanking(f)]);
      setKpis(k);
      setDaily(d ?? []);
      setRanking(r ?? []);
    } catch (e) {
      setError(e.message);
    }
  }, [f]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!f || !funnelId) return;
    getFunnel(funnelId, f).then(setFunnel).catch(() => setFunnel([]));
  }, [f, funnelId]);

  useEffect(() => {
    if (!tz || !user?.id) return;
    getGoalProgress(`${todayIn(tz).slice(0, 7)}-01`).then(setGoals).catch(() => setGoals([]));
    listTasks({ view: 'mine', userId: user.id, status: 'open', limit: 50 }).then(setTasks).catch(() => setTasks([]));
  }, [tz, user?.id]);

  const users = useMemo(
    () => (f?.branchId ? config.users.filter((u) => u.branchIds.includes(f.branchId)) : config.users),
    [config.users, f?.branchId]
  );

  if (!profile || !f) return <main style={{ padding: '1.5rem' }}>Cargando…</main>;

  const cur = kpis?.currency ?? 'USD';
  const period = `${shortDate(f.from)} – ${shortDate(f.to)} (${tz})`;
  const pending = tasks.filter((t) => isOverdue(t) || (t.due_at && new Date(t.due_at).toDateString() === new Date().toDateString())).slice(0, 6);
  const top = [...ranking].sort((a, b) => b.leads_contacted - a.leads_contacted).slice(0, 5);

  return (
    <main style={{ padding: '1.5rem', maxWidth: 1250, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: '0.8rem', flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: '1.35rem' }}>Dashboard</h1>
        <a className="btn btn-secondary" href="/reportes">
          📈 Ver reportes
        </a>
      </div>

      <ReportFilters
        tz={tz}
        value={f}
        onChange={setF}
        branches={config.allBranches}
        users={users}
        showBranch={scope === 'organization'}
        showUser={scope !== 'own'}
      />
      {error && <p style={{ color: 'var(--color-danger)', marginBottom: 8 }}>{error}</p>}

      {!kpis ? (
        <p>Cargando indicadores…</p>
      ) : (
        <TileGrid>
          <StatTile metric="leads_new" value={num(kpis.leads_new)} period={period} href="/leads" />
          <StatTile metric="leads_contacted" value={num(kpis.leads_contacted)} sub={`Tasa de contacto de nuevos: ${pct(kpis.new_contacted, kpis.leads_new)}`} period={period} />
          <StatTile metric="leads_no_contact" value={num(kpis.leads_no_contact)} sub={`Sin asignar: ${num(kpis.leads_unassigned)}`} tone={kpis.leads_no_contact ? 'bad' : undefined} />
          <StatTile metric="calls_total" value={num(kpis.calls_total)} sub={`Contestadas: ${num(kpis.calls_answered)} (${pct(kpis.calls_answered, kpis.calls_total)}) · ${num(kpis.call_minutes, 1)} min`} period={period} />
          <StatTile metric="wa_received" value={num(kpis.wa_received)} sub={`Enviados: ${num(kpis.wa_sent)}`} period={period} />
          <StatTile metric="opps_open" value={num(kpis.opps_open)} sub={money(kpis.opps_open_value, cur)} href="/funnels" />
          <StatTile metric="opps_won" value={num(kpis.opps_won)} sub={`${money(kpis.opps_won_value, cur)} · Perdidas: ${num(kpis.opps_lost)}`} period={period} />
          <StatTile metric="tasks_overdue" value={num(kpis.tasks_overdue)} sub={`Completadas en el período: ${num(kpis.tasks_completed)}`} tone={kpis.tasks_overdue ? 'bad' : undefined} href="/tareas" />
        </TileGrid>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
        <div className="card">
          <h3 style={{ fontSize: '0.95rem', marginBottom: 10 }}>Leads nuevos por día</h3>
          <DailyChart rows={daily} field="leads_new" label="Leads nuevos" />
        </div>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <h3 style={{ fontSize: '0.95rem' }}>Conversión por etapa</h3>
            {fconfig.funnels.length > 1 && (
              <select className="input" style={{ width: 170, height: 32 }} value={funnelId} onChange={(e) => setFunnelId(e.target.value)}>
                {fconfig.funnels.map((fu) => (
                  <option key={fu.id} value={fu.id}>
                    {fu.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <FunnelChart stages={funnel} currency={cur} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
        <div className="card">
          <h3 style={{ fontSize: '0.95rem', marginBottom: 10 }}>Mis metas del mes</h3>
          <GoalsProgress rows={goals} currency={cur} />
        </div>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <h3 style={{ fontSize: '0.95rem' }}>Mis pendientes de hoy</h3>
            <a href="/tareas" style={{ fontSize: '0.8rem' }}>
              Ver todas →
            </a>
          </div>
          {pending.length === 0 ? (
            <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>Nada vencido ni para hoy. 🎉</p>
          ) : (
            <div style={{ display: 'grid', gap: 6 }}>
              {pending.map((t) => (
                <a key={t.id} href="/tareas" style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '0.83rem', color: 'inherit', textDecoration: 'none' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                  <span style={{ flexShrink: 0, color: isOverdue(t) ? 'var(--color-danger)' : 'var(--color-text-muted)' }}>
                    {isOverdue(t) ? '⚠ ' : ''}
                    {dueLabel(t)}
                  </span>
                </a>
              ))}
            </div>
          )}
        </div>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <h3 style={{ fontSize: '0.95rem' }}>Top del equipo · contactados</h3>
            <a href="/reportes?tab=equipo" style={{ fontSize: '0.8rem' }}>
              Ranking →
            </a>
          </div>
          <RankingTableMini rows={top} userMap={config.maps.user} me={user?.id} />
        </div>
      </div>
      {/* Tabla accesible de la serie diaria */}
      <details style={{ marginTop: '1rem', fontSize: '0.8rem' }}>
        <summary style={{ cursor: 'pointer', color: 'var(--color-text-muted)' }}>Ver datos por día en tabla</summary>
        <table style={{ marginTop: 8, borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Día', 'Leads nuevos', 'Contactados', 'Llamadas', 'Contestadas', 'WhatsApp recibidos'].map((h) => (
                <th key={h} style={{ textAlign: 'left', padding: '3px 10px' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {daily.map((r) => (
              <tr key={r.day}>
                <td style={{ padding: '3px 10px' }}>{shortDate(r.day)}</td>
                <td style={{ padding: '3px 10px' }}>{r.leads_new}</td>
                <td style={{ padding: '3px 10px' }}>{r.leads_contacted}</td>
                <td style={{ padding: '3px 10px' }}>{r.calls}</td>
                <td style={{ padding: '3px 10px' }}>{r.calls_answered}</td>
                <td style={{ padding: '3px 10px' }}>{r.wa_received}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </main>
  );
}

function RankingTableMini({ rows, userMap, me }) {
  if (!rows.length) return <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>Sin datos.</p>;
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {rows.map((r, i) => (
        <div key={r.user_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.83rem', fontWeight: r.user_id === me ? 700 : 400 }}>
          <span>
            {['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`} {userMap[r.user_id]?.name ?? 'Usuario'}
            {r.user_id === me ? ' (tú)' : ''}
          </span>
          <span>{num(r.leads_contacted)}</span>
        </div>
      ))}
    </div>
  );
}