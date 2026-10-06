'use client';
// Ruta: app/reportes/page.js
// Reportes (Fase 5): Leads, Actividad, Oportunidades, Equipo y Metas, con
// filtros de período / sucursal / usuario y exportación a Excel. Cada
// cambio de pestaña queda en la actividad.

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import * as XLSX from 'xlsx';
import RequirePermission from '../../components/ui/requirePermission';
import { DailyChart, InfoTip } from '../../components/reports/widgets';
import { useSession } from '../../lib/auth/sessionContext';
import { useLeadConfig } from '../../lib/leads/useLeadConfig';
import { useFunnelConfig } from '../../lib/opportunities/api';
import { trackEvent, trackTab } from '../../lib/activity/tracker';
import AiAnalysis from '../../components/ai/aiAnalysis';
import {
  GOAL_METRICS, PRESETS, getBreakdown, getDaily, getFunnel, getKpis, getRanking, listGoals, money, num, pct, presetRange, saveGoal,
  saveOrgTimezone, shortDate, todayIn, useOrgTimezone,
} from '../../lib/reports/api';
import Icon, { IconText } from '../../components/ui/icon';

const TABS = [
  { key: 'leads', label: 'Leads' },
  { key: 'actividad', label: 'Actividad' },
  { key: 'oportunidades', label: 'Oportunidades' },
  { key: 'equipo', label: 'Equipo' },
  { key: 'metas', label: 'Metas', perm: 'goals.manage' },
  { key: 'ia', label: 'Análisis IA', icon: 'sparkles', perm: 'ai.analytics' },
];

const RESULT_LABEL = {
  contactado: 'Contactado',
  interesado: 'Interesado',
  seguimiento: 'Seguimiento',
  no_interesado: 'No interesado',
  no_contesto: 'No contestó',
  numero_incorrecto: 'Número incorrecto',
  sin_resultado: 'Sin resultado',
};

const TIMEZONES = [
  'America/Bogota', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles',
  'America/Mexico_City', 'America/Caracas', 'America/Lima', 'America/Santiago', 'America/Argentina/Buenos_Aires', 'Europe/Madrid',
];

export default function ReportsPage() {
  return (
    <RequirePermission perm="reports.view">
      <Suspense fallback={null}>
        <Reports />
      </Suspense>
    </RequirePermission>
  );
}

function Reports() {
  const params = useSearchParams();
  const { user, profile, can, scopeOf, branches: myBranches } = useSession();
  const config = useLeadConfig();
  const fconfig = useFunnelConfig();
  const tz = useOrgTimezone();
  const scope = scopeOf('reports.view');
  const tabs = TABS.filter((t) => !t.perm || can(t.perm));
  const [tab, setTab] = useState(tabs.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'leads');
  const [f, setF] = useState(null);
  const [kpis, setKpis] = useState(null);
  const [daily, setDaily] = useState([]);
  const [breakdown, setBreakdown] = useState(null);
  const [ranking, setRanking] = useState([]);
  const [funnelId, setFunnelId] = useState('');
  const [funnel, setFunnel] = useState([]);
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
      const [k, d, b, r] = await Promise.all([getKpis(f), getDaily(f), getBreakdown(f), getRanking(f)]);
      setKpis(k);
      setDaily(d ?? []);
      setBreakdown(b);
      setRanking(r ?? []);
    } catch (e) {
      setError(e.message);
    }
  }, [f]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (f && funnelId) getFunnel(funnelId, f).then(setFunnel).catch(() => setFunnel([]));
  }, [f, funnelId]);

  const users = useMemo(() => (f?.branchId ? config.users.filter((u) => u.branchIds.includes(f.branchId)) : config.users), [config.users, f?.branchId]);
  const userMap = config.maps.user;
  const cur = kpis?.currency ?? 'USD';

  function changeTab(next) {
    if (next === tab) return;
    trackTab('reports', tab, next);
    setTab(next);
  }

  function exportExcel() {
    const wb = XLSX.utils.book_new();
    const add = (name, rows) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ '': 'Sin datos' }]), name);
    const k = kpis ?? {};
    add('Resumen', [
      { Indicador: 'Período', Valor: `${f.from} a ${f.to} (${tz})` },
      { Indicador: 'Leads nuevos', Valor: k.leads_new },
      { Indicador: 'Leads contactados', Valor: k.leads_contacted },
      { Indicador: 'Tasa de contacto (nuevos)', Valor: pct(k.new_contacted, k.leads_new) },
      { Indicador: 'Leads sin contacto (hoy)', Valor: k.leads_no_contact },
      { Indicador: 'Llamadas', Valor: k.calls_total },
      { Indicador: 'Llamadas contestadas', Valor: k.calls_answered },
      { Indicador: 'Minutos', Valor: k.call_minutes },
      { Indicador: 'WhatsApp enviados', Valor: k.wa_sent },
      { Indicador: 'WhatsApp recibidos', Valor: k.wa_received },
      { Indicador: 'Oportunidades abiertas (hoy)', Valor: k.opps_open },
      { Indicador: 'Ganadas', Valor: k.opps_won },
      { Indicador: `Valor ganado (${cur})`, Valor: k.opps_won_value },
      { Indicador: 'Perdidas', Valor: k.opps_lost },
      { Indicador: 'Tareas vencidas (hoy)', Valor: k.tasks_overdue },
      { Indicador: 'Tareas completadas', Valor: k.tasks_completed },
    ]);
    add('Por día', daily.map((r) => ({ Día: r.day, 'Leads nuevos': r.leads_new, Contactados: r.leads_contacted, Llamadas: r.calls, Contestadas: r.calls_answered, 'WhatsApp recibidos': r.wa_received })));
    add('Por estado', (breakdown?.by_status ?? []).map((x) => ({ Estado: x.name, Leads: x.count })));
    add('Por fuente', (breakdown?.by_source ?? []).map((x) => ({ Fuente: x.name, Leads: x.count })));
    add('Por responsable', (breakdown?.by_user ?? []).map((x) => ({ Responsable: x.user_id ? userMap[x.user_id]?.name ?? 'Usuario' : 'Sin asignar', Leads: x.count })));
    add('Embudo', funnel.map((s) => ({ Etapa: s.name, Tipo: s.kind, 'Alcanzaron la etapa': s.reached, 'En la etapa': s.current_count, Valor: s.current_value })));
    add('Equipo', ranking.map((r) => ({
      Usuario: userMap[r.user_id]?.name ?? 'Usuario', 'Leads asignados': r.leads_assigned, Contactados: r.leads_contacted, Llamadas: r.calls,
      Contestadas: r.calls_answered, Minutos: r.call_minutes, WhatsApp: r.wa_sent, Ventas: r.opps_won, [`Valor (${cur})`]: r.opps_won_value, Tareas: r.tasks_completed,
    })));
    XLSX.writeFile(wb, `reporte_${f.from}_${f.to}.xlsx`);
    trackEvent('reports.exported', { metadata: { from: f.from, to: f.to, branch: f.branchId || null, user: f.userId || null } });
  }

  if (!profile || !f) return <main style={{ padding: '1.5rem' }}>Cargando…</main>;
  const period = `${shortDate(f.from)} – ${shortDate(f.to)} (${tz})`;
  const statusColor = Object.fromEntries((breakdown?.by_status ?? []).map((s) => [s.id, s.color]));
  const mainTabs = tabs.filter((t) => t.key !== 'ia');
  const hasIa = tabs.some((t) => t.key === 'ia');
  const tabLabel = TABS.find((t) => t.key === tab)?.label ?? '';
  const setFilter = (patch) => setF({ ...f, ...patch });

  return (
    <main className="rp-page">
      <header className="rp-head">
        <div>
          <h1>Reportes</h1>
          <p>Una visión clara de tus leads, actividad y resultados.</p>
        </div>
        <div className="rp-export">
          <button className="btn btn-secondary rp-btn" onClick={exportExcel} disabled={!kpis}>
            <IconText name="download" size={16}>Exportar a Excel</IconText>
          </button>
          <span>Vista actual: {tabLabel}</span>
        </div>
      </header>

      <div className="rp-filters">
        <label className="rp-field">
          <span>Período del reporte</span>
          <select className="input" value={f.preset} onChange={(e) => (e.target.value === 'custom' ? setFilter({ preset: 'custom' }) : setFilter({ preset: e.target.value, ...presetRange(e.target.value, tz) }))}>
            {PRESETS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        {f.preset === 'custom' && (
          <>
            <label className="rp-field">
              <span>Desde</span>
              <input className="input" type="date" value={f.from} max={f.to} onChange={(e) => e.target.value && setFilter({ from: e.target.value })} />
            </label>
            <label className="rp-field">
              <span>Hasta</span>
              <input className="input" type="date" value={f.to} min={f.from} onChange={(e) => e.target.value && setFilter({ to: e.target.value })} />
            </label>
          </>
        )}
        {scope === 'organization' && config.allBranches.length > 1 && (
          <label className="rp-field">
            <span>Sucursal</span>
            <select className="input" value={f.branchId} onChange={(e) => setFilter({ branchId: e.target.value, userId: '' })}>
              <option value="">Todas las sucursales</option>
              {config.allBranches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {scope !== 'own' && (
          <label className="rp-field">
            <span>Equipo</span>
            <select className="input" value={f.userId} onChange={(e) => setFilter({ userId: e.target.value })}>
              <option value="">Todo el equipo</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="rp-range">
          <strong>{longRange(f.from, f.to)}</strong>
          {can('settings.manage') ? <TimezonePicker tz={tz} /> : <span>Zona horaria: {tz}</span>}
        </div>
      </div>
      {tab === 'metas' && <p className="rp-note">Estos filtros corresponden al reporte. Las metas se configuran por mes, abajo.</p>}
      {error && <p style={{ color: 'var(--color-danger)', marginBottom: 8 }}>{error}</p>}

      <div className="rp-tabs">
        <div role="tablist">
          {mainTabs.map((t) => (
            <button key={t.key} role="tab" aria-selected={tab === t.key} className={tab === t.key ? 'active' : ''} onClick={() => changeTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
        {hasIa && (
          <button className={`btn btn-secondary rp-btn rp-ia${tab === 'ia' ? ' active' : ''}`} onClick={() => changeTab('ia')}>
            <IconText name="sparkles" size={15}>Análisis IA</IconText>
          </button>
        )}
      </div>

      {!kpis ? (
        <p>Cargando…</p>
      ) : tab === 'leads' ? (
        <>
          <div className="rp-kpis rp-kpis-4">
            <Kpi label="Leads nuevos" metric="leads_new" period={period} value={num(kpis.leads_new)} />
            <Kpi label="Leads contactados" metric="leads_contacted" period={period} value={num(kpis.leads_contacted)} />
            <Kpi label="Tasa de contacto" metric="contact_rate" period={period} value={pct(kpis.new_contacted, kpis.leads_new)} tone="good" sub={`${num(kpis.new_contacted)} de ${num(kpis.leads_new)} nuevos`} />
            <Kpi label="Sin contacto" metric="leads_no_contact" value={num(kpis.leads_no_contact)} tone={kpis.leads_no_contact ? 'bad' : undefined} />
          </div>
          {Number(kpis.leads_unassigned) > 0 && (
            <div className="rp-alert">
              <Icon name="triangle-alert" size={18} />
              <strong>{num(kpis.leads_unassigned)} leads sin asignar</strong>
              <span>Pendientes de asignación a un responsable.</span>
              <a href="/leads?asignado=none">
                Ver leads sin asignar <Icon name="arrow-right" size={14} />
              </a>
            </div>
          )}
          <Card title="Leads nuevos por día" sub="Distribución diaria del período seleccionado" metric="leads_new" period={period}>
            <DailyChart rows={daily} field="leads_new" label="Leads nuevos" color="#4a7fcf" />
          </Card>
          <div className="rp-two">
            <div className="rp-stack">
              <Card title="Por estado" sub={`${num(kpis.leads_new)} leads`}>
                <Bars total={kpis.leads_new} items={(breakdown?.by_status ?? []).map((x) => ({ key: x.id, label: x.name, count: x.count }))} color={(it) => statusColor[it.key] || '#4a7fcf'} />
              </Card>
              <Card title="Por fuente" sub={`Origen de los ${num(kpis.leads_new)} leads`}>
                <Bars total={kpis.leads_new} items={(breakdown?.by_source ?? []).map((x) => ({ key: x.id, label: x.name, count: x.count }))} color={(_, i) => SERIES[i % SERIES.length]} />
              </Card>
              {scope === 'organization' && (
                <Card title="Por sucursal">
                  <Bars total={kpis.leads_new} items={(breakdown?.by_branch ?? []).map((x) => ({ key: x.id, label: x.name, count: x.count }))} color={() => '#4a7fcf'} />
                </Card>
              )}
            </div>
            <Card title="Por responsable" sub={`Asignación de los ${num(kpis.leads_new)} leads`}>
              <Bars
                total={kpis.leads_new}
                items={(breakdown?.by_user ?? []).map((x) => ({ key: x.user_id ?? 'none', label: x.user_id ? userMap[x.user_id]?.name ?? 'Usuario' : 'Sin asignar', count: x.count }))}
                color={(it) => (it.key === 'none' ? '#a8772f' : '#4a7fcf')}
              />
            </Card>
          </div>
        </>
      ) : tab === 'actividad' ? (
        <>
          <div className="rp-act">
            <div className="card rp-card">
              <h3>Llamadas</h3>
              <div className="rp-mini3">
                <Mini label="Llamadas" value={num(kpis.calls_total)} />
                <Mini label="Contestadas" value={num(kpis.calls_answered)} />
                <Mini label="Minutos" value={num(kpis.call_minutes, 1)} />
              </div>
              <p className="rp-foot">Tasa de respuesta: {Number(kpis.calls_total) ? pct(kpis.calls_answered, kpis.calls_total) : '—'}</p>
            </div>
            <div className="card rp-card">
              <h3>WhatsApp</h3>
              <div className="rp-mini2">
                <Mini label="Enviados" value={num(kpis.wa_sent)} />
                <Mini label="Recibidos" value={num(kpis.wa_received)} />
              </div>
              <p className="rp-foot">Mensajes en el período seleccionado</p>
            </div>
            <div className="card rp-card">
              <h3>Tareas</h3>
              <Mini label="Completadas" value={num(kpis.tasks_completed)} />
              <p className="rp-foot" style={{ color: Number(kpis.tasks_overdue) ? '#c0564b' : undefined }}>Vencidas hoy: {num(kpis.tasks_overdue)}</p>
            </div>
          </div>
          <Card title="Leads contactados por día" sub="Actividad de contacto en el período seleccionado" metric="leads_contacted" period={period}>
            <DailyChart rows={daily} field="leads_contacted" label="Contactados" color="#2e8b7a" />
          </Card>
          <div className="rp-two rp-two-eq">
            <Card title="Llamadas por día">
              {daily.some((r) => Number(r.calls)) ? (
                <DailyChart rows={daily} field="calls" label="Llamadas" height={150} color="#4a7fcf" />
              ) : (
                <Empty title="Sin datos en el período" text="No se registraron llamadas en estas fechas." />
              )}
            </Card>
            <Card title="Resultado de las llamadas">
              {Object.keys(kpis.calls_by_result ?? {}).length ? (
                <Bars
                  total={Object.values(kpis.calls_by_result ?? {}).reduce((x, y) => x + Number(y), 0)}
                  items={Object.entries(kpis.calls_by_result ?? {})
                    .map(([k, v]) => ({ key: k, label: RESULT_LABEL[k] ?? k, count: Number(v) }))
                    .sort((x, y) => y.count - x.count)}
                  color={(_, i) => SERIES[i % SERIES.length]}
                />
              ) : (
                <Empty title="Sin datos en el período" text="No hay resultados de llamadas para mostrar." />
              )}
            </Card>
          </div>
        </>
      ) : tab === 'oportunidades' ? (
        <>
          <div className="rp-kpis rp-kpis-3">
            <Kpi label="Oportunidades abiertas" metric="opps_open" value={num(kpis.opps_open)} tone="blue" />
            <Kpi label="Ganadas" metric="opps_won" period={period} value={num(kpis.opps_won)} tone="good" />
            <Kpi label="Perdidas" metric="opps_lost" period={period} value={num(kpis.opps_lost)} tone="bad" />
          </div>
          <div className="card rp-value">
            <Icon name="wallet" size={16} />
            <strong>Valor de oportunidades</strong>
            <span className="rp-sep" />
            <span>Abiertas</span>
            <b>{money(kpis.opps_open_value, cur)}</b>
            <span className="rp-sep" />
            <span>Ganadas</span>
            <b>{money(kpis.opps_won_value, cur)}</b>
          </div>
          <Card
            title="Conversión por etapa"
            sub="Cantidad de oportunidades en cada etapa"
            right={
              fconfig.funnels.length > 1 && (
                <select className="input" style={{ width: 190, height: 34 }} value={funnelId} onChange={(e) => setFunnelId(e.target.value)}>
                  {fconfig.funnels.map((fu) => (
                    <option key={fu.id} value={fu.id}>
                      {fu.name}
                    </option>
                  ))}
                </select>
              )
            }
          >
            <Funnel stages={funnel} currency={cur} />
          </Card>
        </>
      ) : tab === 'equipo' ? (
        <TeamRanking rows={ranking} userMap={userMap} me={user?.id} currency={cur} scopeText={scope === 'organization' ? (f.branchId ? 'la sucursal elegida' : 'toda la organización') : 'tus sucursales'} />
      ) : tab === 'ia' ? (
        <AiAnalysis filters={f} period={period} />
      ) : (
        <GoalsEditor tz={tz} users={config.users} userMap={userMap} me={user?.id} goalsScope={scopeOf('goals.manage')} myBranches={myBranches} />
      )}
    </main>
  );
}

// ---------------- Piezas del diseño
const SERIES = ['#2e8b7a', '#4a7fcf', '#a8772f', '#8a63c9', '#c0564b', '#5b8c3a'];
const MONO = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' };

function longRange(from, to) {
  const fmt = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', timeZone: 'UTC' }).replace('.', '');
  return `${fmt(from)} – ${fmt(to)}`;
}

function Kpi({ label, value, sub, tone, metric, period }) {
  const color = tone === 'good' ? '#2e8b7a' : tone === 'bad' ? '#c0564b' : tone === 'blue' ? '#4a7fcf' : 'var(--color-text)';
  return (
    <div className="card rp-kpi">
      <span className="rp-kpi-label">
        {label}
        {metric && <InfoTip metric={metric} period={period} />}
      </span>
      <span className="rp-kpi-value" style={{ ...MONO, color }}>
        {value}
      </span>
      {sub && <span className="rp-kpi-sub">{sub}</span>}
    </div>
  );
}

function Mini({ label, value }) {
  return (
    <div className="rp-mini">
      <span>{label}</span>
      <b style={MONO}>{value}</b>
    </div>
  );
}

function Card({ title, sub, metric, period, right, children }) {
  return (
    <section className="card rp-card">
      <div className="rp-card-head">
        <div>
          <h3>
            {title}
            {metric && <InfoTip metric={metric} period={period} />}
          </h3>
          {sub && <p>{sub}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function Empty({ title, text }) {
  return (
    <div className="rp-empty">
      <Icon name="phone-off" size={18} />
      <div>
        <strong>{title}</strong>
        <span>{text}</span>
      </div>
    </div>
  );
}

function Bars({ items, total, color }) {
  if (!items.length) return <p className="rp-muted">Sin datos en el período.</p>;
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <div className="rp-bars">
      {items.map((it, i) => (
        <div key={it.key}>
          <div className="rp-bar-row">
            <span>{it.label}</span>
            <span>
              <b>{num(it.count)}</b>
              {total ? <em>{(Math.round((it.count / total) * 1000) / 10).toLocaleString('es-CO')}%</em> : null}
            </span>
          </div>
          <div className="rp-bar-track">
            <div style={{ width: `${Math.max((it.count / max) * 100, it.count ? 1 : 0)}%`, background: color ? color(it, i) : '#4a7fcf' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Funnel({ stages, currency }) {
  const open = stages.filter((s) => s.kind === 'open');
  const won = stages.find((s) => s.kind === 'won');
  const lost = stages.find((s) => s.kind === 'lost');
  const rows = [...open, ...(won ? [won] : [])];
  if (!rows.length) return <p className="rp-muted">No hay etapas en este embudo.</p>;
  const max = Math.max(1, ...rows.map((s) => Number(s.reached) || 0));
  const second = open[1];
  return (
    <div>
      <div className="rp-funnel">
        {rows.map((s) => (
          <div key={s.stage_id} className="rp-funnel-row">
            <span>{s.name}</span>
            <div className="rp-funnel-track" title={`${s.name}: ${num(s.reached)}`}>
              <div style={{ width: `${(Number(s.reached) / max) * 100}%`, background: s.kind === 'won' ? '#2e8b7a' : '#4a7fcf' }} />
            </div>
            <b style={{ ...MONO, color: Number(s.reached) ? '#4a7fcf' : 'var(--color-text-muted)' }}>{num(s.reached)}</b>
          </div>
        ))}
      </div>
      <div className="rp-funnel-foot">
        <span>
          Ganadas en el período: {num(won?.current_count)} ({money(won?.current_value, currency)})
        </span>
        <span>Perdidas: {num(lost?.current_count)}</span>
        {second && open[0] && (
          <span>
            {second.name}: {num(second.reached)} · {Number(open[0].reached) ? Math.round((second.reached / open[0].reached) * 100) : 0}%
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------- Ranking del equipo
const RANK_COLS = [
  { k: 'leads_contacted', l: 'Contactados', g: 'Contacto' },
  { k: 'calls', l: 'Llamadas', g: 'Comunicación' },
  { k: 'calls_answered', l: 'Contestadas', g: 'Comunicación' },
  { k: 'call_minutes', l: 'Minutos', g: 'Comunicación' },
  { k: 'wa_sent', l: 'WhatsApp', g: 'Comunicación' },
  { k: 'opps_won', l: 'Ventas', g: 'Resultados' },
  { k: 'opps_won_value', l: 'Valor', g: 'Resultados' },
  { k: 'tasks_completed', l: 'Tareas', g: 'Resultados' },
];

function TeamRanking({ rows, userMap, me, currency, scopeText }) {
  const [sort, setSort] = useState('leads_contacted');
  const [q, setQ] = useState('');
  const nameOf = (r) => userMap[r.user_id]?.name ?? 'Usuario';
  const sorted = useMemo(() => [...rows].sort((a, b) => Number(b[sort]) - Number(a[sort]) || nameOf(a).localeCompare(nameOf(b))), [rows, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = sorted.filter((r) => !q.trim() || nameOf(r).toLowerCase().includes(q.trim().toLowerCase()));
  const label = RANK_COLS.find((c) => c.k === sort)?.l ?? '';
  return (
    <>
      <div className="rp-section-head">
        <div>
          <h2>Ranking del equipo</h2>
          <p>Usuarios activos de {scopeText}</p>
        </div>
        <div className="rp-section-tools">
          <div className="rp-search">
            <Icon name="search" size={15} />
            <input placeholder="Buscar colaborador…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <label className="rp-field">
            <span>Ordenar por métrica</span>
            <select className="input" value={sort} onChange={(e) => setSort(e.target.value)}>
              {RANK_COLS.map((c) => (
                <option key={c.k} value={c.k}>
                  {c.l} ↓
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="card rp-table-card">
        <div style={{ overflowX: 'auto' }}>
          <table className="rp-table">
            <thead>
              <tr className="rp-groups">
                <th colSpan={2}>Colaborador</th>
                <th className="gold">Contacto</th>
                <th colSpan={4}>Comunicación</th>
                <th colSpan={3}>Resultados</th>
              </tr>
              <tr>
                <th style={{ width: 36 }}>#</th>
                <th>Usuario</th>
                {RANK_COLS.map((c) => (
                  <th key={c.k} className={`num${sort === c.k ? ' gold' : ''}`}>
                    <button type="button" onClick={() => setSort(c.k)}>
                      {c.l}
                      {sort === c.k ? ' ↓' : ''}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.user_id} className={r.user_id === me ? 'me' : ''}>
                  <td className="muted">{sorted.indexOf(r) + 1}</td>
                  <td className="name">
                    {nameOf(r)}
                    {r.user_id === me ? ' (tú)' : ''}
                  </td>
                  {RANK_COLS.map((c) => (
                    <td key={c.k} className="num" style={MONO}>
                      {c.k === 'opps_won_value' ? money(r[c.k], currency) : num(r[c.k], c.k === 'call_minutes' ? 1 : 0)}
                    </td>
                  ))}
                </tr>
              ))}
              {!shown.length && (
                <tr>
                  <td colSpan={10} className="muted" style={{ padding: '1rem' }}>
                    Sin colaboradores para mostrar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="rp-table-foot">
          <span>{shown.length} colaboradores visibles</span>
          <span>Orden: {label.toLowerCase()}, de mayor a menor</span>
        </div>
      </div>
      <p className="rp-info">
        <Icon name="info" size={14} /> Contactado = llamada contestada o WhatsApp recibido. Mismas definiciones que los indicadores del reporte.
      </p>
    </>
  );
}

function TimezonePicker({ tz }) {
  const [value, setValue] = useState(tz);
  const [msg, setMsg] = useState(null);
  useEffect(() => setValue(tz), [tz]);
  const options = TIMEZONES.includes(tz) ? TIMEZONES : [tz, ...TIMEZONES];
  return (
    <label className="rp-tz" title="Zona horaria con la que se cortan los días en todos los reportes de la organización">
      Zona horaria:
      <select
        style={{ width: 'auto', minWidth: 0 }}
        value={value || ''}
        onChange={async (e) => {
          const next = e.target.value;
          setValue(next);
          try {
            await saveOrgTimezone(next);
            setMsg('Guardado');
            trackEvent('reports.timezone_changed', { metadata: { timezone: next } });
            setTimeout(() => window.location.reload(), 600);
          } catch (err) {
            setMsg(err.message);
          }
        }}
      >
        {options.map((z) => (
          <option key={z} value={z}>
            {z.replace('_', ' ')}
          </option>
        ))}
      </select>
      {msg && <span style={{ color: 'var(--color-text-muted)' }}>{msg}</span>}
    </label>
  );
}

// ---------------- Metas mensuales por usuario
const GOAL_GROUPS = { leads_contacted: 'Contacto', calls: 'Comunicación', calls_answered: 'Comunicación', call_minutes: 'Comunicación', wa_sent: 'Comunicación', opps_won: 'Resultados', opps_won_value: 'Resultados', tasks_completed: 'Resultados' };

function GoalsEditor({ tz, users, userMap, me, goalsScope, myBranches }) {
  const [month, setMonth] = useState(`${todayIn(tz).slice(0, 7)}`);
  const [goals, setGoals] = useState([]);
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');
  const monthDate = `${month}-01`;
  const monthName = new Date(`${monthDate}T12:00:00Z`).toLocaleDateString('es-CO', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const myBranchIds = (myBranches ?? []).map((b) => b.id);
  const editable = users
    .filter((u) => u.id !== me && u.status === 'active' && (goalsScope === 'organization' || u.branchIds.some((b) => myBranchIds.includes(b))))
    .sort((a, b) => (userMap[a.id]?.name ?? a.name).localeCompare(userMap[b.id]?.name ?? b.name));
  const shown = editable.filter((u) => !q.trim() || (userMap[u.id]?.name ?? u.name).toLowerCase().includes(q.trim().toLowerCase()));

  const load = useCallback(() => {
    listGoals(monthDate).then(setGoals).catch((e) => setError(e.message));
  }, [monthDate]);
  useEffect(() => {
    load();
  }, [load]);

  const valueOf = (u, m) => goals.find((g) => g.user_id === u && g.metric === m)?.target ?? '';

  async function save(u, m, v) {
    const current = valueOf(u, m);
    if (String(current) === String(v)) return;
    setSaving(`${u}-${m}`);
    setError(null);
    try {
      await saveGoal(u, monthDate, m, v);
      trackEvent('goals.saved', { metadata: { user: u, month: monthDate, metric: m, target: v || null } });
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(null);
    }
  }

  const metrics = Object.keys(GOAL_METRICS);
  return (
    <>
      <div className="rp-section-head">
        <div>
          <h2>
            Metas mensuales <span className="rp-badge">Configuración</span>
          </h2>
          <p>Define objetivos por colaborador. Cada persona ve su avance en el Dashboard.</p>
        </div>
        <label className="rp-field">
          <span>Mes de las metas</span>
          <input className="input" type="month" style={{ width: 170 }} value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        </label>
      </div>
      <div className="rp-goals-tools">
        <div className="rp-search">
          <Icon name="search" size={15} />
          <input placeholder="Buscar colaborador…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <span className="rp-muted">
          <Icon name="info" size={13} /> Escribe la meta y sal de la casilla para guardar. Vacía = Sin meta.
        </span>
      </div>
      {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.82rem' }}>{error}</p>}
      <div className="card rp-table-card">
        <div style={{ overflowX: 'auto' }}>
          <table className="rp-table rp-goals">
            <thead>
              <tr className="rp-groups">
                <th>Colaborador</th>
                <th>Contacto</th>
                <th colSpan={4}>Comunicación</th>
                <th colSpan={3}>Resultados</th>
              </tr>
              <tr>
                <th>Usuario</th>
                {metrics.map((m) => (
                  <th key={m} title={GOAL_GROUPS[m]}>
                    {GOAL_METRICS[m]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((u) => (
                <tr key={u.id}>
                  <td className="name">{userMap[u.id]?.name ?? u.name}</td>
                  {metrics.map((m) => (
                    <td key={m}>
                      <input
                        key={`${u.id}-${m}-${valueOf(u.id, m)}`}
                        className="input rp-goal-input"
                        type="number"
                        min="0"
                        step={m === 'opps_won_value' || m === 'call_minutes' ? '0.01' : '1'}
                        defaultValue={valueOf(u.id, m)}
                        disabled={saving === `${u.id}-${m}`}
                        onBlur={(e) => save(u.id, m, e.target.value)}
                        aria-label={`${GOAL_METRICS[m]} de ${userMap[u.id]?.name ?? u.name}`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
              {!shown.length && (
                <tr>
                  <td colSpan={9} className="muted" style={{ padding: '1rem' }}>
                    {editable.length ? 'Sin coincidencias.' : 'No hay usuarios a los que puedas fijar metas.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="rp-table-foot">
          <span>{shown.length} colaboradores visibles</span>
          <span>Campos vacíos: Sin meta · No equivalen a cero</span>
        </div>
      </div>
      <p className="rp-info gold">
        <Icon name="save" size={14} /> Guardado automático al salir de cada campo. Las metas corresponden a {monthName}.
      </p>
    </>
  );
}