'use client';
// Ruta: components/dashboard/widgets.js
// Piezas del Dashboard: saludo, indicadores con mini-tendencia, gráfico de
// leads por día, conversión por etapa, tareas de hoy, leads recientes, top
// del equipo, actividad reciente, metas del mes y acceso a reportes.

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase/client';
import Icon from '../ui/icon';
import Avatar from '../ui/avatar';
import { num, shortDate } from '../../lib/reports/api';
import { isOverdue } from '../../lib/tasks/api';
import { relTime } from '../../lib/leads/format';
import { taskKind } from '../tasks/taskRow';

// ---------------------------------------------------------------- Encabezado
const QUOTES = [
  'La disciplina de hoy construye los resultados de mañana.',
  'Cada conversación es una oportunidad de ayudar.',
  'Lo que se mide, se mejora.',
  'El seguimiento convierte el interés en clientes.',
  'Pequeños avances diarios, grandes resultados.',
];

// Frase del día escrita por la IA (una por día, hora de Bogotá). Mientras
// carga, o si la IA no responde, se usa una frase fija.
function useFraseDelDia() {
  const fija = QUOTES[new Date().getDate() % QUOTES.length];
  const [frase, setFrase] = useState({ message: fija, topic: null, day: null });
  useEffect(() => {
    let vivo = true;
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
    const KEY = `xiris.frase.${day}`;
    try {
      const guardada = JSON.parse(sessionStorage.getItem(KEY) || 'null');
      if (guardada?.message) return setFrase({ ...guardada, day });
    } catch {}
    (async () => {
      let { data } = await supabase.from('daily_messages').select('message, topic').eq('day', day).maybeSingle();
      if (!data) {
        const r = await supabase.functions.invoke('frase-del-dia', { body: {} });
        if (!r.error && r.data?.message) data = r.data;
      }
      if (vivo && data?.message) {
        const f = { message: data.message, topic: data.topic ?? null };
        setFrase({ ...f, day });
        try {
          sessionStorage.setItem(KEY, JSON.stringify(f));
        } catch {}
      }
    })().catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);
  return frase;
}

// Reacciones a la frase: la IA aprende de ellas para escribir las siguientes
const REACCIONES = [
  { key: 'love', icon: 'heart', label: 'Me encanta' },
  { key: 'like', icon: 'thumbs-up', label: 'Me gusta' },
  { key: 'dislike', icon: 'thumbs-down', label: 'No me gusta' },
];

function ReaccionesFrase({ day }) {
  const [sum, setSum] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!day) return;
    supabase.rpc('daily_message_summary', { p_day: day }).then(({ data }) => data && setSum(data));
  }, [day]);
  if (!day || !sum) return null;
  async function react(key) {
    if (busy) return;
    setBusy(true);
    const next = sum.mine === key ? null : key;
    const { data } = await supabase.rpc('daily_message_react', { p_day: day, p_reaction: next });
    if (data) setSum(data);
    setBusy(false);
  }
  return (
    <div className="dash-quote-react" role="group" aria-label="Reaccionar a la frase del día">
      {REACCIONES.map((r) => {
        const on = sum.mine === r.key;
        const n = Number(sum[r.key]) || 0;
        return (
          <button key={r.key} type="button" title={r.label} aria-pressed={on} disabled={busy} onClick={() => react(r.key)} className={on ? 'on' : ''}>
            <Icon name={r.icon} size={14} />
            {n > 0 && <span>{n}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Hero({ name, right }) {
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
  const frase = useFraseDelDia();
  const quote = frase.message;
  return (
    <section className="dash-hero">
      <div style={{ position: 'relative', zIndex: 1, minWidth: 0 }}>
        <h1 className="dash-hello">
          ¡{hello}, <span className="dash-name">{name}</span>!
        </h1>
        <p style={{ margin: '6px 0 0', color: 'var(--color-text-muted)', fontSize: '0.95rem' }}>Aquí tienes un resumen de la actividad de tu equipo.</p>
        {right && <div style={{ marginTop: 14 }}>{right}</div>}
      </div>
      <blockquote className="dash-quote">
        <Icon name="sparkles" size={16} style={{ color: 'var(--color-primary)', marginBottom: 6 }} />
        <span title={frase.topic ? `Inspirada en: ${frase.topic}` : undefined}>“{quote}”</span>
        <ReaccionesFrase day={frase.day} />
      </blockquote>
    </section>
  );
}

// ---------------------------------------------------------------- Indicadores
function Sparkline({ values, color }) {
  const pts = values?.length ? values : [0, 0];
  const max = Math.max(1, ...pts);
  const w = 56;
  const h = 26;
  const step = pts.length > 1 ? w / (pts.length - 1) : w;
  const d = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(h - 3 - (v / max) * (h - 6)).toFixed(1)}`).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" style={{ overflow: 'visible', flexShrink: 0, marginBottom: 4 }}>
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function KpiCard({ icon, color, label, value, sub, trend, spark, href, title }) {
  const Tag = href ? 'a' : 'div';
  return (
    <Tag className="soft-card kpi-card" href={href} title={title}>
      <span className="kpi-icon" style={{ color, background: `${color}1a` }}>
        <Icon name={icon} size={22} />
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="kpi-label">{label}</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 6 }}>
          <div className="kpi-value">{value}</div>
          {spark && <Sparkline values={spark} color={color} />}
        </div>
        {trend != null && (
          <div className="kpi-sub" style={{ color: trend >= 0 ? 'var(--color-success)' : 'var(--color-danger)', fontWeight: 600 }}>
            <Icon name={trend >= 0 ? 'trending-up' : 'trending-down'} size={13} style={{ marginRight: 4 }} />
            {trend >= 0 ? '+' : ''}
            {trend}% <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>vs. período anterior</span>
          </div>
        )}
        {sub && <div className="kpi-sub">{sub}</div>}
      </div>
    </Tag>
  );
}

// ---------------------------------------------------------------- Tarjeta con título
export function Panel({ icon, title, count, action, children, className = '', style, w }) {
  return (
    <section className={`soft-card dash-panel ${className}`} style={style} data-w={w}>
      <header className="dash-panel-head">
        <h3>
          {icon && <Icon name={icon} size={18} style={{ color: 'var(--color-primary)' }} />}
          {title}
          {count != null && <span className="count-pill" style={{ background: 'rgba(214, 69, 69, 0.12)', color: 'var(--color-danger)' }}>{count}</span>}
        </h3>
        {action}
      </header>
      {children}
    </section>
  );
}

export function LinkAction({ href, children }) {
  return (
    <a href={href} className="dash-link">
      {children}
      <Icon name="arrow-right" size={14} />
    </a>
  );
}

// ---------------------------------------------------------------- Leads por día
export function BarsChart({ rows, field = 'leads_new', height = 190 }) {
  const [hover, setHover] = useState(null);
  const values = rows.map((r) => Number(r[field]) || 0);
  const rawMax = Math.max(0, ...values);
  const step = rawMax <= 5 ? 1 : rawMax <= 20 ? 5 : rawMax <= 50 ? 10 : rawMax <= 100 ? 20 : Math.ceil(rawMax / 5 / 50) * 50;
  const max = Math.max(step, Math.ceil(rawMax / step) * step);
  const ticks = [];
  for (let v = max; v >= 0; v -= step) ticks.push(v);
  const labelEvery = Math.max(1, Math.ceil(rows.length / 6));
  if (!rows.length) return <p className="dash-empty">Sin datos en el período.</p>;
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height, fontSize: '0.7rem', color: 'var(--color-text-muted)', textAlign: 'right', minWidth: 22 }}>
          {ticks.map((t) => (
            <span key={t} style={{ lineHeight: 0 }}>
              {t}
            </span>
          ))}
        </div>
        <div style={{ flex: 1, position: 'relative', height }}>
          {ticks.map((t) => (
            <div key={t} style={{ position: 'absolute', left: 0, right: 0, top: `${(1 - t / max) * 100}%`, borderTop: '1px dashed var(--color-border)' }} />
          ))}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', gap: 3 }}>
            {rows.map((r, i) => (
              <div
                key={r.day}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', cursor: 'default' }}
              >
                <div
                  style={{
                    width: '70%',
                    maxWidth: 22,
                    height: `${(values[i] / max) * 100}%`,
                    minHeight: values[i] ? 3 : 0,
                    borderRadius: '5px 5px 2px 2px',
                    background: hover === i ? 'var(--color-primary-hover)' : 'linear-gradient(180deg, #e2bd76 0%, #c3923f 100%)',
                    opacity: hover == null || hover === i ? 1 : 0.55,
                    transition: 'opacity 0.12s ease',
                  }}
                />
              </div>
            ))}
          </div>
          {hover != null && (
            <div className="dash-tip" style={{ left: `${((hover + 0.5) / rows.length) * 100}%`, bottom: `${(values[hover] / max) * 100}%` }}>
              <strong>{num(values[hover])}</strong> · {shortDate(rows[hover].day)}
            </div>
          )}
        </div>
      </div>
      <div style={{ position: 'relative', height: 18, marginLeft: 30, marginTop: 6 }}>
        {rows.map((r, i) =>
          i % labelEvery === 0 ? (
            <span
              key={r.day}
              style={{ position: 'absolute', left: `${((i + 0.5) / rows.length) * 100}%`, transform: 'translateX(-50%)', fontSize: '0.68rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}
            >
              {shortDate(r.day).replace(' de ', ' ')}
            </span>
          ) : null
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Conversión
const STAGE_COLORS = ['#7a5cc7', '#4f7be0', '#2f9e6b', '#e0a13a', '#d64545', '#2f6f7a'];
export function StageBars({ stages }) {
  const open = stages.filter((s) => s.kind === 'open');
  const won = stages.find((s) => s.kind === 'won');
  const list = [...open, ...(won ? [won] : [])];
  const base = Number(list[0]?.reached) || 0;
  if (!base && !Number(won?.reached)) return <p className="dash-empty">No hay oportunidades creadas en el período.</p>;
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {list.map((s, i) => {
        const n = Number(s.reached) || 0;
        const p = base ? Math.round((n / base) * 100) : 0;
        const color = s.kind === 'won' ? '#2f9e6b' : s.color || STAGE_COLORS[i % STAGE_COLORS.length];
        return (
          <div key={s.stage_id ?? s.name} style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 130px) 1fr 44px 44px', alignItems: 'center', gap: 12, fontSize: '0.86rem' }}>
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.kind === 'won' ? 'Ganadas' : s.name}</span>
            <div style={{ height: 14, borderRadius: 999, background: 'var(--color-primary-soft)' }} title={`${s.name}: ${n}`}>
              <div style={{ width: `${Math.max(p, n ? 2 : 0)}%`, height: '100%', borderRadius: 999, background: color }} />
            </div>
            <strong style={{ textAlign: 'right' }}>{num(n)}</strong>
            <span style={{ textAlign: 'right', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>{p}%</span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- Tareas de hoy
function taskStatus(t) {
  if (isOverdue(t)) return { label: 'Vencida', color: '#c0392b', bg: 'rgba(214, 69, 69, 0.12)' };
  if (t.status === 'in_progress') return { label: 'En curso', color: '#2f6fde', bg: 'rgba(47, 111, 222, 0.1)' };
  return { label: 'Pendiente', color: 'var(--color-text-muted)', bg: 'var(--color-btn-secondary-bg-hover)' };
}

export function TodayTasks({ tasks }) {
  if (!tasks.length) return <p className="dash-empty">Nada vencido ni para hoy.</p>;
  return (
    <div className="dash-list">
      {tasks.map((t) => {
        const k = taskKind(t);
        const st = taskStatus(t);
        const lead = t.lead ? `${t.lead.first_name ?? ''} ${t.lead.last_name ?? ''}`.trim() : null;
        const time = t.due_at ? new Date(t.due_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true }) : '';
        const when = !t.due_at ? '' : new Date(t.due_at).toDateString() === new Date().toDateString() ? `Hoy, ${time}` : relTime(t.due_at);
        return (
          <a key={t.id} href="/tareas" className="dash-row">
            <span className="task-kind" style={{ width: 36, height: 36, borderRadius: 10, color: isOverdue(t) ? '#d64545' : k.fg, background: isOverdue(t) ? 'rgba(214, 69, 69, 0.1)' : k.bg }}>
              <Icon name={k.icon} size={17} />
            </span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <div className="dash-row-title">{t.title}</div>
              <div className="dash-row-sub">{[lead ? `Lead: ${lead}` : null, when].filter(Boolean).join(' · ')}</div>
            </span>
            <span className="prio" style={{ color: st.color, background: st.bg, minWidth: 0 }}>
              {st.label}
            </span>
          </a>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- Leads recientes
export function RecentLeads({ leads, statusMap, sourceMap }) {
  if (!leads) return <p className="dash-empty">Cargando…</p>;
  if (!leads.length) return <p className="dash-empty">Todavía no hay leads.</p>;
  return (
    <div className="dash-list">
      {leads.map((l) => {
        const name = `${l.first_name ?? ''} ${l.last_name ?? ''}`.trim() || 'Sin nombre';
        const st = statusMap[l.status_id];
        const color = st?.color || 'var(--color-primary)';
        return (
          <a key={l.id} href={`/leads/${l.id}`} className="dash-row">
            <Avatar name={name} size={36} />
            <span style={{ minWidth: 0, flex: 1 }}>
              <div className="dash-row-title">{name}</div>
              <div className="dash-row-sub">{sourceMap[l.source_id]?.name ?? 'Sin fuente'}</div>
            </span>
            <span className="dash-row-sub" style={{ whiteSpace: 'nowrap' }}>
              {relTime(l.created_at)}
            </span>
            {st && (
              <span className="prio" style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)`, minWidth: 0 }}>
                {st.name}
              </span>
            )}
          </a>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- Top del equipo
export const TEAM_METRICS = [
  { key: 'leads_contacted', label: 'Contactados' },
  { key: 'calls', label: 'Llamadas' },
  { key: 'calls_answered', label: 'Contestadas' },
  { key: 'wa_sent', label: 'WhatsApp enviados' },
  { key: 'opps_won', label: 'Ventas ganadas' },
  { key: 'tasks_completed', label: 'Tareas completadas' },
];

export function TeamTop({ rows, metric, userMap, me }) {
  const top = [...rows].sort((a, b) => Number(b[metric]) - Number(a[metric])).slice(0, 5);
  const max = Math.max(1, ...top.map((r) => Number(r[metric]) || 0));
  if (!top.length) return <p className="dash-empty">Sin datos en el período.</p>;
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {top.map((r, i) => {
        const name = userMap[r.user_id]?.name ?? 'Usuario';
        const v = Number(r[metric]) || 0;
        return (
          <div key={r.user_id} style={{ display: 'grid', gridTemplateColumns: '26px 32px minmax(0, 1fr) 36px minmax(60px, 38%)', alignItems: 'center', gap: 10, fontSize: '0.86rem' }}>
            <span className="rank-num" style={i === 0 ? { background: 'var(--gold-gradient)', color: '#1b1409' } : undefined}>
              {i + 1}
            </span>
            <Avatar name={name} size={32} />
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: r.user_id === me ? 700 : 500 }}>
              {name}
              {r.user_id === me ? ' (tú)' : ''}
            </span>
            <strong style={{ textAlign: 'right' }}>{num(v)}</strong>
            <div style={{ height: 8, borderRadius: 999, background: 'var(--color-primary-soft)' }}>
              <div style={{ width: `${(v / max) * 100}%`, height: '100%', borderRadius: 999, background: 'var(--gold-gradient)' }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- Actividad reciente
export const ACTIVITY_FILTERS = [
  { key: 'all', label: 'Todos', types: null },
  { key: 'leads', label: 'Leads', types: ['lead_created'] },
  { key: 'calls', label: 'Llamadas', types: ['call_started', 'call_completed'] },
  { key: 'wa', label: 'WhatsApp', types: ['whatsapp_received', 'whatsapp_sent'] },
  { key: 'tasks', label: 'Tareas', types: ['task_created', 'task_completed'] },
  { key: 'system', label: 'Sistema', types: ['lead_assigned', 'lead_updated', 'funnel_changed', 'note_created'] },
];

const ACT = {
  lead_created: { icon: 'user-plus', color: '#4f7be0', text: 'Nuevo lead creado' },
  lead_assigned: { icon: 'user-check', color: '#7a5cc7', text: 'Lead asignado' },
  lead_updated: { icon: 'pencil', color: '#8d8476', text: 'Lead actualizado' },
  funnel_changed: { icon: 'kanban', color: '#b8893b', text: 'Cambio de etapa' },
  whatsapp_received: { icon: 'message-circle', color: '#22b35e', text: 'Mensaje recibido por WhatsApp' },
  whatsapp_sent: { icon: 'send', color: '#22b35e', text: 'Mensaje enviado por WhatsApp' },
  call_started: { icon: 'phone-outgoing', color: '#d64545', text: 'Llamada iniciada' },
  call_completed: { icon: 'phone', color: '#d64545', text: 'Llamada terminada' },
  note_created: { icon: 'sticky-note', color: '#c9861d', text: 'Nota agregada' },
  task_created: { icon: 'clipboard-list', color: '#2f6fde', text: 'Tarea creada' },
  task_completed: { icon: 'circle-check', color: '#2f9e6b', text: 'Tarea completada' },
};

export function ActivityFeed({ items }) {
  if (!items) return <p className="dash-empty">Cargando…</p>;
  if (!items.length) return <p className="dash-empty">Sin actividad reciente.</p>;
  return (
    <div className="dash-feed">
      {items.map((a) => {
        const m = ACT[a.type] ?? { icon: 'activity', color: '#8d8476', text: a.type };
        const lead = a.lead ? `${a.lead.first_name ?? ''} ${a.lead.last_name ?? ''}`.trim() : '';
        const inbound = a.type === 'call_completed' && a.metadata?.direction === 'inbound';
        return (
          <a key={a.id} href={a.lead_id ? `/leads/${a.lead_id}` : undefined} className="dash-feed-item">
            <span className="dash-feed-dot" style={{ color: m.color, background: `${m.color}1a` }}>
              <Icon name={inbound ? 'phone-incoming' : m.icon} size={15} />
            </span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <div className="dash-row-title" style={{ fontWeight: 600 }}>
                {inbound ? 'Llamada entrante' : m.text}
              </div>
              <div className="dash-row-sub">{lead || (a.body ? a.body.slice(0, 60) : '')}</div>
            </span>
            <span className="dash-row-sub" style={{ whiteSpace: 'nowrap' }}>
              {relTime(a.created_at)}
            </span>
          </a>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- Metas del mes
const GOAL_UI = {
  leads_contacted: { icon: 'phone-call', color: '#1f9d55', label: 'Leads contactados' },
  calls: { icon: 'phone', color: '#7a5cc7', label: 'Llamadas' },
  calls_answered: { icon: 'phone-incoming', color: '#7a5cc7', label: 'Llamadas contestadas' },
  call_minutes: { icon: 'clock', color: '#2f6f7a', label: 'Minutos de llamada' },
  wa_sent: { icon: 'message-circle', color: '#22b35e', label: 'WhatsApp enviados' },
  opps_won: { icon: 'trophy', color: '#d4a24c', label: 'Ventas ganadas' },
  opps_won_value: { icon: 'dollar-sign', color: '#d4a24c', label: 'Valor ganado' },
  tasks_completed: { icon: 'circle-check', color: '#2f6fde', label: 'Tareas completadas' },
};

export function MonthGoals({ rows, money }) {
  if (!rows?.length) return <p className="dash-empty">No hay metas fijadas para este mes.</p>;
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {rows.map((g) => {
        const ui = GOAL_UI[g.metric] ?? { icon: 'target', color: '#b8893b', label: g.metric };
        const target = Number(g.target) || 0;
        const actual = Number(g.actual) || 0;
        const p = target ? Math.min(100, Math.round((actual / target) * 100)) : 0;
        const fmt = g.metric === 'opps_won_value' ? money : (v) => num(v, g.metric === 'call_minutes' ? 1 : 0);
        return (
          <div key={g.metric} style={{ display: 'grid', gridTemplateColumns: '36px 1fr 52px', alignItems: 'center', gap: 12 }}>
            <span className="task-kind" style={{ width: 36, height: 36, borderRadius: 10, color: ui.color, background: `${ui.color}1a` }}>
              <Icon name={ui.icon} size={17} />
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '0.86rem', marginBottom: 6 }}>
                <span style={{ fontWeight: 600 }}>{ui.label}</span>
                <span style={{ color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                  {fmt(actual)} / {fmt(target)}
                </span>
              </div>
              <div style={{ height: 8, borderRadius: 999, background: 'var(--color-primary-soft)' }} role="progressbar" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100}>
                <div style={{ width: `${p}%`, height: '100%', borderRadius: 999, background: p >= 100 ? '#2f9e6b' : ui.color }} />
              </div>
            </div>
            <span className="prio" style={{ minWidth: 0, color: p >= 100 ? '#1f8a5b' : 'var(--color-text)', background: p >= 100 ? 'rgba(47, 158, 107, 0.12)' : 'var(--color-btn-secondary-bg-hover)' }}>
              {p}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- Acceso a reportes
export function PromoCard() {
  return (
    <a href="/reportes" className="dash-promo">
      <div className="dash-promo-art" aria-hidden="true">
        <Icon name="chart-line" size={120} strokeWidth={1.2} />
      </div>
      <div style={{ position: 'relative' }}>
        <div style={{ fontSize: '1.15rem', fontWeight: 700, lineHeight: 1.25 }}>Convierte más con cada conversación</div>
        <p style={{ margin: '8px 0 14px', fontSize: '0.85rem', color: '#e9dcc4' }}>Revisa el detalle por asesor, fuente y embudo en los reportes.</p>
        <span className="btn btn-primary" style={{ height: 40 }}>
          Explorar reportes
          <Icon name="arrow-right" size={16} />
        </span>
      </div>
    </a>
  );
}

// Selector compacto dentro de una tarjeta
export function MiniSelect({ value, onChange, options, label }) {
  return (
    <select className="input dash-mini-select" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      {options.map((o) => (
        <option key={o.key} value={o.key}>
          {o.label}
        </option>
      ))}
    </select>
  );
}