'use client';
// Ruta: app/dashboard/page.js
// Dashboard: saludo, 6 indicadores del período (con tendencia diaria y
// comparación con el período anterior), leads nuevos por día, conversión
// por etapa, tareas de hoy, leads recientes, top del equipo, actividad
// reciente y metas del mes. Cada quien ve sus números según su alcance
// (propio / sucursal / organización); los cálculos los hace la base.

import { useCallback, useEffect, useMemo, useState } from 'react';
import RequirePermission from '../../components/ui/requirePermission';
import Icon from '../../components/ui/icon';
import {
  ACTIVITY_FILTERS,
  ActivityFeed,
  BarsChart,
  Hero,
  KpiCard,
  LinkAction,
  MiniSelect,
  MonthGoals,
  Panel,
  PromoCard,
  RecentLeads,
  StageBars,
  TEAM_METRICS,
  TeamTop,
  TodayTasks,
} from '../../components/dashboard/widgets';
import { supabase } from '../../lib/supabase/client';
import { useSession } from '../../lib/auth/sessionContext';
import { dashboardLayout, useMyPrefs } from '../../lib/me/workspace';
import { useLeadConfig } from '../../lib/leads/useLeadConfig';
import { useFunnelConfig } from '../../lib/opportunities/api';
import { searchLeads } from '../../lib/leads/api';
import { isOverdue, listTasks } from '../../lib/tasks/api';
import { addDays, getDaily, getFunnel, getGoalProgress, getKpis, getRanking, money, num, pct, presetRange, todayIn, useOrgTimezone } from '../../lib/reports/api';

const PERIODS = [
  { key: 'today', label: 'Hoy' },
  { key: 'week', label: 'Esta semana' },
  { key: 'month', label: 'Este mes' },
  { key: '30d', label: 'Últimos 30 días' },
  { key: 'quarter', label: 'Trimestre' },
];

const COLORS = { blue: '#3f6fe0', green: '#1f9d55', red: '#d64545', purple: '#7a5cc7', wa: '#22b35e', gold: '#c99a3f' };

// Período anterior de igual duración (para la tendencia)
function previousRange({ from, to }) {
  const days = Math.round((new Date(`${to}T12:00:00Z`) - new Date(`${from}T12:00:00Z`)) / 86400000) + 1;
  return { from: addDays(from, -days), to: addDays(from, -1) };
}
function trend(now, before) {
  const a = Number(now) || 0;
  const b = Number(before) || 0;
  if (!b) return a ? 100 : null;
  return Math.round(((a - b) / b) * 100);
}

export default function DashboardPage() {
  return (
    <RequirePermission perm="reports.view">
      <Dashboard />
    </RequirePermission>
  );
}

function Dashboard() {
  const { user, profile, scopeOf, can } = useSession();
  const myPrefs = useMyPrefs(profile?.organization_id ? user?.id : null);
  const layout = dashboardLayout(myPrefs);
  const config = useLeadConfig();
  const fconfig = useFunnelConfig();
  const tz = useOrgTimezone();
  const scope = scopeOf('reports.view');

  const [preset, setPreset] = useState('30d');
  const [branchId, setBranchId] = useState('');
  const [userId, setUserId] = useState('');
  const [kpis, setKpis] = useState(null);
  const [prevKpis, setPrevKpis] = useState(null);
  const [daily, setDaily] = useState([]);
  const [funnelId, setFunnelId] = useState('');
  const [funnel, setFunnel] = useState([]);
  const [goals, setGoals] = useState([]);
  const [ranking, setRanking] = useState([]);
  const [teamMetric, setTeamMetric] = useState('leads_contacted');
  const [tasks, setTasks] = useState([]);
  const [leadsView, setLeadsView] = useState('all');
  const [leads, setLeads] = useState(null);
  const [actFilter, setActFilter] = useState('all');
  const [activity, setActivity] = useState(null);
  const [error, setError] = useState(null);

  const f = useMemo(() => (tz ? { ...presetRange(preset, tz), branchId, userId } : null), [tz, preset, branchId, userId]);

  useEffect(() => {
    if (!funnelId && fconfig.funnels.length) setFunnelId(fconfig.funnels[0].id);
  }, [fconfig.funnels, funnelId]);

  // Indicadores, serie diaria y ranking del período
  const load = useCallback(async () => {
    if (!f) return;
    setError(null);
    try {
      const [k, pk, d, r] = await Promise.all([getKpis(f), getKpis({ ...f, ...previousRange(f) }), getDaily(f), getRanking(f)]);
      setKpis(k);
      setPrevKpis(pk);
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
    getFunnel(funnelId, f).then((s) => setFunnel(s ?? [])).catch(() => setFunnel([]));
  }, [f, funnelId]);

  // Metas del mes y mis tareas
  useEffect(() => {
    if (!tz || !user?.id) return;
    getGoalProgress(`${todayIn(tz).slice(0, 7)}-01`).then((g) => setGoals(g ?? [])).catch(() => setGoals([]));
    listTasks({ view: 'mine', userId: user.id, status: 'open', limit: 50 }).then(setTasks).catch(() => setTasks([]));
  }, [tz, user?.id]);

  // Leads recientes (según alcance; "Míos" = asignados a mí)
  useEffect(() => {
    if (!user?.id || !can('leads.view')) return;
    setLeads(null);
    const filters = { ...(leadsView === 'mine' ? { assigned_user_ids: [user.id] } : {}), ...(leadsView === 'unassigned' ? { unassigned: true } : {}), ...(branchId ? { branch_ids: [branchId] } : {}) };
    searchLeads({ filters, page: 1, pageSize: 5, sort: 'created_desc' })
      .then((r) => setLeads(r.rows))
      .catch(() => setLeads([]));
  }, [user?.id, leadsView, branchId, can]);

  // Actividad reciente (línea de tiempo de los leads que puedo ver)
  useEffect(() => {
    if (!user?.id) return;
    setActivity(null);
    const types = ACTIVITY_FILTERS.find((x) => x.key === actFilter)?.types;
    let q = supabase.from('lead_activities').select('id, type, lead_id, body, metadata, created_at, lead:leads(first_name, last_name)').order('created_at', { ascending: false }).limit(6);
    if (types) q = q.in('type', types);
    if (branchId) q = q.eq('branch_id', branchId);
    q.then(({ data }) => setActivity(data ?? []));
  }, [user?.id, actFilter, branchId]);

  const users = useMemo(() => (branchId ? config.users.filter((u) => u.branchIds.includes(branchId)) : config.users), [config.users, branchId]);
  const spark = useCallback((field) => daily.map((r) => Number(r[field]) || 0), [daily]);

  if (!profile || !f) return <main style={{ padding: '1.6rem' }}>Cargando…</main>;

  const cur = kpis?.currency ?? 'USD';
  const today = tasks.filter((t) => isOverdue(t) || (t.due_at && new Date(t.due_at).toDateString() === new Date().toDateString())).slice(0, 4);
  const firstName = (profile.full_name || user.email || '').split(/\s+/)[0];

  const filters = (scope === 'organization' || scope === 'branch') && (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {scope === 'organization' && config.allBranches.length > 1 && (
        <div className="field-wrap">
          <Icon name="building-2" size={15} />
          <select
            className="input select-pill"
            style={{ height: 38 }}
            value={branchId}
            onChange={(e) => {
              setBranchId(e.target.value);
              setUserId('');
            }}
            aria-label="Sucursal"
          >
            <option value="">Todas las sucursales</option>
            {config.allBranches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="field-wrap">
        <Icon name="user" size={15} />
        <select className="input select-pill" style={{ height: 38 }} value={userId} onChange={(e) => setUserId(e.target.value)} aria-label="Asesor">
          <option value="">Todo el equipo</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );

  return (
    <main className="dash-page">
      <Hero name={firstName} right={filters} />
      {error && <p style={{ color: 'var(--color-danger)', margin: '0 0 12px' }}>{error}</p>}

      <div className="dash-flow">
      {/* Indicadores */}
      <div className="kpi-grid" data-w="kpis">
        <KpiCard icon="users" color={COLORS.blue} label="Leads nuevos" value={kpis ? num(kpis.leads_new) : '—'} trend={kpis && prevKpis ? trend(kpis.leads_new, prevKpis.leads_new) : null} spark={spark('leads_new')} href="/leads" />
        <KpiCard
          icon="phone-call"
          color={COLORS.green}
          label="Contactados"
          value={kpis ? num(kpis.leads_contacted) : '—'}
          sub={kpis ? `${pct(kpis.new_contacted, kpis.leads_new)} tasa de contacto` : null}
          spark={spark('leads_contacted')}
        />
        <KpiCard icon="ban" color={COLORS.red} label="Sin contacto" value={kpis ? num(kpis.leads_no_contact) : '—'} sub={kpis ? `Sin asignar: ${num(kpis.leads_unassigned)}` : null} href="/leads" />
        <KpiCard
          icon="phone"
          color={COLORS.purple}
          label="Llamadas"
          value={kpis ? num(kpis.calls_total) : '—'}
          sub={kpis ? `Contestadas: ${num(kpis.calls_answered)} (${pct(kpis.calls_answered, kpis.calls_total)})` : null}
          spark={spark('calls')}
          href="/llamadas"
        />
        <KpiCard icon="message-circle" color={COLORS.wa} label="WhatsApp" value={kpis ? num(kpis.wa_received) : '—'} sub={kpis ? `Recibidos · enviados: ${num(kpis.wa_sent)}` : null} spark={spark('wa_received')} href="/whatsapp" />
        <KpiCard icon="trophy" color={COLORS.gold} label="Oportunidades" value={kpis ? num(kpis.opps_open) : '—'} sub={kpis ? money(kpis.opps_open_value, cur) : null} href="/funnels" />
      </div>

      {/* Gráficos */}
        <Panel w="daily" icon="chart-column" title="Leads nuevos por día" action={<MiniSelect value={preset} onChange={setPreset} options={PERIODS} label="Período" />}>
          <BarsChart rows={daily} field="leads_new" />
        </Panel>
        <Panel
          w="funnel"
          icon="filter"
          title="Conversión por etapa"
          action={
            fconfig.funnels.length > 1 ? (
              <MiniSelect value={funnelId} onChange={setFunnelId} options={fconfig.funnels.map((x) => ({ key: x.id, label: x.name }))} label="Embudo" />
            ) : null
          }
        >
          <StageBars stages={funnel} />
        </Panel>

      {/* Tareas, leads y equipo */}
        <Panel w="tasks" icon="square-check-big" title="Tareas de hoy" count={today.length || null} action={<LinkAction href="/tareas">Ver todas</LinkAction>}>
          <TodayTasks tasks={today} />
        </Panel>
        {can('leads.view') && (
          <Panel
            w="leads"
            icon="users"
            title="Leads recientes"
            action={
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <MiniSelect
                  value={leadsView}
                  onChange={setLeadsView}
                  label="Leads"
                  options={[
                    { key: 'all', label: 'Todos' },
                    { key: 'mine', label: 'Míos' },
                    { key: 'unassigned', label: 'Sin asignar' },
                  ]}
                />
                <LinkAction href="/leads">Ver todos</LinkAction>
              </div>
            }
          >
            <RecentLeads leads={leads} statusMap={config.maps.status} sourceMap={config.maps.source} />
          </Panel>
        )}
        <Panel w="team" icon="trophy" title="Top del equipo" action={<MiniSelect value={teamMetric} onChange={setTeamMetric} options={TEAM_METRICS} label="Métrica" />}>
          <TeamTop rows={ranking} metric={teamMetric} userMap={config.maps.user} me={user?.id} />
        </Panel>

      {/* Actividad, metas y reportes */}
        <Panel w="activity" icon="activity" title="Actividad reciente" action={can('audit.view') ? <LinkAction href="/settings/actividad">Ver toda la actividad</LinkAction> : null}>
          <div className="chip-row" role="tablist">
            {ACTIVITY_FILTERS.map((x) => (
              <button key={x.key} role="tab" aria-selected={actFilter === x.key} className={`chip${actFilter === x.key ? ' active' : ''}`} onClick={() => setActFilter(x.key)}>
                {x.label}
              </button>
            ))}
          </div>
          <ActivityFeed items={activity} />
        </Panel>
        <Panel w="goals" icon="target" title="Metas del mes" action={can('goals.manage') ? <LinkAction href="/reportes?tab=metas">Editar metas</LinkAction> : null}>
          <MonthGoals rows={goals} money={(v) => money(v, cur)} />
        </Panel>
        <div data-w="promo" className="dash-promo-wrap">
          <PromoCard />
        </div>
      </div>
      <style>{`.dash-flow > [data-w] { order: 99; } ${layout.order.map((k, i) => `.dash-flow > [data-w="${k}"] { order: ${i}; }`).join(' ')} ${[...layout.hidden].map((k) => `.dash-flow > [data-w="${k}"] { display: none !important; }`).join(' ')}`}</style>
    </main>
  );
}