'use client';
// Ruta: app/reportes/page.js
// Reportes (Fase 5): Leads, Actividad, Oportunidades, Equipo y Metas, con
// filtros de período / sucursal / usuario y exportación a Excel. Cada
// cambio de pestaña queda en la actividad.

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import * as XLSX from 'xlsx';
import RequirePermission from '../../components/ui/requirePermission';
import { BarList, DailyChart, FunnelChart, InfoTip, RankingTable, ReportFilters, StatTile, TileGrid } from '../../components/reports/widgets';
import { useSession } from '../../lib/auth/sessionContext';
import { useLeadConfig } from '../../lib/leads/useLeadConfig';
import { useFunnelConfig } from '../../lib/opportunities/api';
import { trackEvent, trackTab } from '../../lib/activity/tracker';
import {
  GOAL_METRICS, getBreakdown, getDaily, getFunnel, getKpis, getRanking, listGoals, money, num, pct, presetRange, saveGoal,
  saveOrgTimezone, shortDate, todayIn, useOrgTimezone,
} from '../../lib/reports/api';

const TABS = [
  { key: 'leads', label: 'Leads' },
  { key: 'actividad', label: 'Actividad' },
  { key: 'oportunidades', label: 'Oportunidades' },
  { key: 'equipo', label: 'Equipo' },
  { key: 'metas', label: 'Metas', perm: 'goals.manage' },
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

  return (
    <main style={{ padding: '1.5rem', maxWidth: 1250, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: '0.8rem', flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: '1.35rem' }}>Reportes</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {can('settings.manage') && <TimezonePicker tz={tz} />}
          <button className="btn btn-secondary" onClick={exportExcel} disabled={!kpis}>
            ⬇ Exportar a Excel
          </button>
        </div>
      </div>

      <ReportFilters tz={tz} value={f} onChange={setF} branches={config.allBranches} users={users} showBranch={scope === 'organization'} showUser={scope !== 'own'} />
      {error && <p style={{ color: 'var(--color-danger)', marginBottom: 8 }}>{error}</p>}

      <div className="tabs-bar" role="tablist" style={{ marginBottom: '1rem' }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={`tab-link${tab === t.key ? ' active' : ''}`}
            onClick={() => changeTab(t.key)}
            style={{ background: 'none', border: 'none', borderBottom: tab === t.key ? '2px solid var(--color-primary)' : '2px solid transparent', cursor: 'pointer' }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!kpis ? (
        <p>Cargando…</p>
      ) : tab === 'leads' ? (
        <>
          <TileGrid>
            <StatTile metric="leads_new" value={num(kpis.leads_new)} period={period} />
            <StatTile metric="leads_contacted" value={num(kpis.leads_contacted)} period={period} />
            <StatTile metric="contact_rate" value={pct(kpis.new_contacted, kpis.leads_new)} sub={`${num(kpis.new_contacted)} de ${num(kpis.leads_new)} nuevos`} period={period} />
            <StatTile metric="leads_no_contact" value={num(kpis.leads_no_contact)} tone={kpis.leads_no_contact ? 'bad' : undefined} />
            <StatTile metric="leads_unassigned" value={num(kpis.leads_unassigned)} tone={kpis.leads_unassigned ? 'bad' : undefined} />
          </TileGrid>
          <div className="card" style={{ marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '0.95rem', marginBottom: 10 }}>Leads nuevos por día</h3>
            <DailyChart rows={daily} field="leads_new" label="Leads nuevos" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
            <Panel title="Por estado" metric="leads_new" period={period}>
              <BarList total={kpis.leads_new} items={(breakdown?.by_status ?? []).map((x) => ({ key: x.id, label: x.name, count: x.count, color: x.color }))} colorOf={(it) => statusColor[it.key] || 'var(--color-primary)'} />
            </Panel>
            <Panel title="Por fuente" metric="leads_new" period={period}>
              <BarList total={kpis.leads_new} items={(breakdown?.by_source ?? []).map((x) => ({ key: x.id, label: x.name, count: x.count }))} />
            </Panel>
            <Panel title="Por responsable" metric="leads_new" period={period}>
              <BarList
                total={kpis.leads_new}
                items={(breakdown?.by_user ?? []).map((x) => ({ key: x.user_id ?? 'none', label: x.user_id ? userMap[x.user_id]?.name ?? 'Usuario' : '⚠ Sin asignar', count: x.count }))}
              />
            </Panel>
            {scope === 'organization' && (
              <Panel title="Por sucursal" metric="leads_new" period={period}>
                <BarList total={kpis.leads_new} items={(breakdown?.by_branch ?? []).map((x) => ({ key: x.id, label: x.name, count: x.count }))} />
              </Panel>
            )}
          </div>
        </>
      ) : tab === 'actividad' ? (
        <>
          <TileGrid>
            <StatTile metric="calls_total" value={num(kpis.calls_total)} period={period} />
            <StatTile metric="calls_answered" value={num(kpis.calls_answered)} sub={`Tasa: ${pct(kpis.calls_answered, kpis.calls_total)}`} period={period} />
            <StatTile metric="call_minutes" value={num(kpis.call_minutes, 1)} period={period} />
            <StatTile metric="wa_sent" value={num(kpis.wa_sent)} period={period} />
            <StatTile metric="wa_received" value={num(kpis.wa_received)} period={period} />
            <StatTile metric="tasks_completed" value={num(kpis.tasks_completed)} sub={`Vencidas hoy: ${num(kpis.tasks_overdue)}`} period={period} />
          </TileGrid>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '1rem' }}>
            <Panel title="Llamadas por día" metric="calls_total" period={period}>
              <DailyChart rows={daily} field="calls" label="Llamadas" height={160} />
            </Panel>
            <Panel title="Leads contactados por día" metric="leads_contacted" period={period}>
              <DailyChart rows={daily} field="leads_contacted" label="Contactados" height={160} />
            </Panel>
            <Panel title="Resultado de las llamadas" metric="calls_total" period={period}>
              <BarList
                total={Object.values(kpis.calls_by_result ?? {}).reduce((a, b) => a + Number(b), 0)}
                items={Object.entries(kpis.calls_by_result ?? {})
                  .map(([k, v]) => ({ key: k, label: RESULT_LABEL[k] ?? k, count: Number(v) }))
                  .sort((a, b) => b.count - a.count)}
              />
            </Panel>
          </div>
        </>
      ) : tab === 'oportunidades' ? (
        <>
          <TileGrid>
            <StatTile metric="opps_open" value={num(kpis.opps_open)} sub={money(kpis.opps_open_value, cur)} />
            <StatTile metric="opps_won" value={num(kpis.opps_won)} sub={money(kpis.opps_won_value, cur)} period={period} />
            <StatTile metric="opps_lost" value={num(kpis.opps_lost)} period={period} />
          </TileGrid>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8 }}>
              <h3 style={{ fontSize: '0.95rem', display: 'flex', alignItems: 'center' }}>
                Conversión por etapa <InfoTip metric="funnel_reached" period={period} />
              </h3>
              {fconfig.funnels.length > 1 && (
                <select className="input" style={{ width: 180, height: 32 }} value={funnelId} onChange={(e) => setFunnelId(e.target.value)}>
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
        </>
      ) : tab === 'equipo' ? (
        <div className="card">
          <h3 style={{ fontSize: '0.95rem', marginBottom: 4 }}>Ranking del equipo</h3>
          <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: 10 }}>
            {period}. Usuarios activos de {scope === 'organization' ? (f.branchId ? 'la sucursal elegida' : 'toda la organización') : 'tus sucursales'}. Haz clic en una columna para ordenar. Mismas
            definiciones que los indicadores (contactado = llamada contestada o WhatsApp recibido).
          </p>
          <RankingTable rows={ranking} userMap={userMap} me={user?.id} currency={cur} />
        </div>
      ) : (
        <GoalsEditor tz={tz} users={config.users} userMap={userMap} me={user?.id} goalsScope={scopeOf('goals.manage')} myBranches={myBranches} />
      )}
    </main>
  );
}

function Panel({ title, metric, period, children }) {
  return (
    <div className="card">
      <h3 style={{ fontSize: '0.95rem', marginBottom: 10, display: 'flex', alignItems: 'center' }}>
        {title} <InfoTip metric={metric} period={period} />
      </h3>
      {children}
    </div>
  );
}

function TimezonePicker({ tz }) {
  const [value, setValue] = useState(tz);
  const [msg, setMsg] = useState(null);
  useEffect(() => setValue(tz), [tz]);
  const options = TIMEZONES.includes(tz) ? TIMEZONES : [tz, ...TIMEZONES];
  return (
    <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.8rem' }} title="Zona horaria con la que se cortan los días en todos los reportes de la organización">
      🕒
      <select
        className="input"
        style={{ width: 200, height: 34 }}
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
function GoalsEditor({ tz, users, userMap, me, goalsScope, myBranches }) {
  const [month, setMonth] = useState(`${todayIn(tz).slice(0, 7)}`);
  const [goals, setGoals] = useState([]);
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState(null);
  const monthDate = `${month}-01`;
  const myBranchIds = (myBranches ?? []).map((b) => b.id);
  const editable = users.filter(
    (u) => u.id !== me && u.status === 'active' && (goalsScope === 'organization' || u.branchIds.some((b) => myBranchIds.includes(b)))
  );

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

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ fontSize: '0.95rem' }}>Metas mensuales</h3>
          <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
            Escribe la meta y sal de la casilla para guardar. Vacía = sin meta. Cada persona ve su avance en el Dashboard.
          </p>
        </div>
        <input className="input" type="month" style={{ width: 170 }} value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
      </div>
      {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.82rem' }}>{error}</p>}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
              <th style={{ textAlign: 'left', padding: '6px 8px' }}>Usuario</th>
              {Object.values(GOAL_METRICS).map((l) => (
                <th key={l} style={{ textAlign: 'center', padding: '6px 4px', whiteSpace: 'nowrap' }}>
                  {l}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {editable.map((u) => (
              <tr key={u.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{userMap[u.id]?.name ?? u.name}</td>
                {Object.keys(GOAL_METRICS).map((m) => (
                  <td key={m} style={{ padding: '4px' }}>
                    <input
                      key={`${u.id}-${m}-${valueOf(u.id, m)}`}
                      className="input"
                      type="number"
                      min="0"
                      step={m === 'opps_won_value' || m === 'call_minutes' ? '0.01' : '1'}
                      defaultValue={valueOf(u.id, m)}
                      disabled={saving === `${u.id}-${m}`}
                      onBlur={(e) => save(u.id, m, e.target.value)}
                      style={{ width: 90, height: 30, textAlign: 'right' }}
                    />
                  </td>
                ))}
              </tr>
            ))}
            {!editable.length && (
              <tr>
                <td colSpan={9} style={{ padding: '1rem', color: 'var(--color-text-muted)' }}>
                  No hay usuarios a los que puedas fijar metas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}