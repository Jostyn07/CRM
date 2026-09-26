'use client';
// Ruta: components/reports/widgets.js
// Piezas del dashboard y reportes: filtros de período, tarjetas con ⓘ
// (definición, población y fuente), gráficas y tablas.

import { useEffect, useMemo, useRef, useState } from 'react';
import { GOAL_METRICS, METRICS, PRESETS, money, num, presetRange, shortDate } from '../../lib/reports/api';

// ---------------- ⓘ de una métrica
export function InfoTip({ metric, period }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const m = METRICS[metric];
  useEffect(() => {
    if (!open) return undefined;
    const h = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  if (!m) return null;
  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        aria-label={`Qué mide: ${m.label}`}
        onClick={() => setOpen((v) => !v)}
        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: '0.8rem', padding: '0 2px' }}
      >
        ⓘ
      </button>
      {open && (
        <span
          className="card"
          style={{ position: 'absolute', top: '120%', left: 0, zIndex: 30, width: 280, padding: '0.6rem 0.7rem', fontSize: '0.78rem', lineHeight: 1.45, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', display: 'block', fontWeight: 400, color: 'var(--color-text)', textAlign: 'left' }}
        >
          <strong style={{ display: 'block', marginBottom: 4 }}>{m.label}</strong>
          <span style={{ display: 'block' }}><b>Qué mide:</b> {m.def}</span>
          {period && <span style={{ display: 'block' }}><b>Período:</b> {period}</span>}
          <span style={{ display: 'block' }}><b>Población:</b> {m.pop}</span>
          <span style={{ display: 'block' }}><b>Fuente:</b> {m.src}</span>
        </span>
      )}
    </span>
  );
}

// ---------------- Filtros (una fila)
export function ReportFilters({ tz, value, onChange, branches, users, showBranch, showUser }) {
  const set = (patch) => onChange({ ...value, ...patch });
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem' }}>
      <div style={{ display: 'inline-flex', gap: 2, padding: 3, borderRadius: 999, border: '1px solid var(--color-border)', background: 'var(--color-active-bg)', flexWrap: 'wrap' }}>
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => (p.key === 'custom' ? set({ preset: 'custom' }) : set({ preset: p.key, ...presetRange(p.key, tz) }))}
            style={{
              border: 'none',
              borderRadius: 999,
              padding: '5px 12px',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              background: value.preset === p.key ? 'var(--color-primary)' : 'transparent',
              color: value.preset === p.key ? '#fff' : 'var(--color-text)',
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
      {value.preset === 'custom' && (
        <>
          <input className="input" type="date" style={{ width: 150 }} value={value.from} max={value.to} onChange={(e) => e.target.value && set({ from: e.target.value })} />
          <span style={{ color: 'var(--color-text-muted)' }}>→</span>
          <input className="input" type="date" style={{ width: 150 }} value={value.to} min={value.from} onChange={(e) => e.target.value && set({ to: e.target.value })} />
        </>
      )}
      {showBranch && branches.length > 1 && (
        <select className="input" style={{ width: 180 }} value={value.branchId} onChange={(e) => set({ branchId: e.target.value, userId: '' })}>
          <option value="">Todas las sucursales</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      )}
      {showUser && (
        <select className="input" style={{ width: 200 }} value={value.userId} onChange={(e) => set({ userId: e.target.value })}>
          <option value="">Todo el equipo</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      )}
      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
        {shortDate(value.from)} – {shortDate(value.to)} · {tz}
      </span>
    </div>
  );
}

// ---------------- Tarjeta de indicador
export function StatTile({ metric, value, sub, period, tone, href }) {
  const body = (
    <div className="card" style={{ padding: '0.85rem 1rem', display: 'grid', gap: 4, height: '100%' }}>
      <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 2 }}>
        {METRICS[metric]?.label ?? metric}
        <InfoTip metric={metric} period={period} />
      </span>
      <span style={{ fontSize: '1.7rem', fontWeight: 700, lineHeight: 1.1, color: tone === 'bad' ? 'var(--color-danger)' : 'var(--color-text)' }}>{value}</span>
      {sub && <span style={{ fontSize: '0.76rem', color: 'var(--color-text-muted)' }}>{sub}</span>}
    </div>
  );
  return href ? (
    <a href={href} style={{ color: 'inherit', textDecoration: 'none' }}>
      {body}
    </a>
  ) : (
    body
  );
}

export function TileGrid({ children }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>{children}</div>;
}

// ---------------- Barras por día (una serie) con tooltip
export function DailyChart({ rows, field = 'leads_new', label = 'Leads nuevos', height = 180 }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...rows.map((r) => Number(r[field]) || 0));
  const w = 100 / Math.max(rows.length, 1);
  const ticks = [max, Math.round(max / 2), 0];
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height, fontSize: '0.68rem', color: 'var(--color-text-muted)', textAlign: 'right', minWidth: 24 }}>
          {ticks.map((t, i) => (
            <span key={i}>{num(t)}</span>
          ))}
        </div>
        <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ flex: 1, height, overflow: 'visible' }} role="img" aria-label={`${label} por día`}>
          {[0, 0.5, 1].map((f) => (
            <line key={f} x1="0" x2="100" y1={height * f} y2={height * f} stroke="var(--color-border)" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
          ))}
          {rows.map((r, i) => {
            const v = Number(r[field]) || 0;
            const h = (v / max) * (height - 4);
            return (
              <g key={r.day} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <rect x={i * w} y={0} width={w} height={height} fill="transparent" />
                <rect
                  x={i * w + w * 0.15}
                  y={height - h}
                  width={w * 0.7}
                  height={Math.max(h, v ? 1 : 0)}
                  rx="0.6"
                  fill="var(--color-primary)"
                  opacity={hover === null || hover === i ? 1 : 0.45}
                />
              </g>
            );
          })}
        </svg>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--color-text-muted)', marginLeft: 32, marginTop: 4 }}>
        <span>{rows[0] ? shortDate(rows[0].day) : ''}</span>
        <span>{rows.length > 2 ? shortDate(rows[Math.floor(rows.length / 2)].day) : ''}</span>
        <span>{rows.length ? shortDate(rows[rows.length - 1].day) : ''}</span>
      </div>
      {hover !== null && rows[hover] && (
        <div
          className="card"
          style={{
            position: 'absolute',
            top: 0,
            left: `calc(32px + ${((hover + 0.5) / rows.length) * 100}% * (1 - 32 / 1000))`,
            transform: 'translateX(-50%)',
            padding: '0.4rem 0.6rem',
            fontSize: '0.75rem',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 14px rgba(0,0,0,0.15)',
          }}
        >
          <strong>{shortDate(rows[hover].day)}</strong>
          <div>
            {label}: <b>{num(rows[hover][field])}</b>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------- Lista de barras horizontales (distribuciones)
export function BarList({ items, total, colorOf, empty = 'Sin datos en el período.' }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  if (!items.length) return <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>{empty}</p>;
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {items.map((it) => (
        <div key={it.key} title={`${it.label}: ${num(it.count)}${total ? ` (${Math.round((it.count / total) * 100)}%)` : ''}`}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: 3 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {colorOf && <span style={{ width: 8, height: 8, borderRadius: 2, background: colorOf(it) }} />}
              {it.label}
            </span>
            <span style={{ color: 'var(--color-text-muted)' }}>
              <b style={{ color: 'var(--color-text)' }}>{num(it.count)}</b>
              {total ? ` · ${Math.round((it.count / total) * 100)}%` : ''}
            </span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: 'var(--color-active-bg)' }}>
            <div style={{ width: `${(it.count / max) * 100}%`, height: '100%', borderRadius: 4, background: colorOf ? colorOf(it) : 'var(--color-primary)' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------- Embudo
export function FunnelChart({ stages, currency }) {
  const open = stages.filter((s) => s.kind === 'open');
  const first = open[0]?.reached || 0;
  const won = stages.find((s) => s.kind === 'won');
  const lost = stages.find((s) => s.kind === 'lost');
  if (!first && !won?.reached) return <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>No hay oportunidades creadas en el período.</p>;
  const rows = [...open, ...(won ? [won] : [])];
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {rows.map((s, i) => {
        const prev = i > 0 ? rows[i - 1].reached : null;
        const w = first ? (s.reached / first) * 100 : 0;
        return (
          <div key={s.stage_id} style={{ display: 'grid', gridTemplateColumns: '130px 1fr 110px', gap: 8, alignItems: 'center', fontSize: '0.8rem' }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
            <div style={{ height: 20, borderRadius: 4, background: 'var(--color-active-bg)' }} title={`${s.name}: ${s.reached} alcanzaron esta etapa`}>
              <div style={{ width: `${Math.max(w, s.reached ? 2 : 0)}%`, height: '100%', borderRadius: 4, background: s.kind === 'won' ? '#16a34a' : s.color || 'var(--color-primary)' }} />
            </div>
            <span style={{ color: 'var(--color-text-muted)' }}>
              <b style={{ color: 'var(--color-text)' }}>{num(s.reached)}</b>
              {prev ? ` · ${Math.round((s.reached / prev) * 100)}%` : ''}
            </span>
          </div>
        );
      })}
      <div style={{ fontSize: '0.76rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
        Ganadas en el período: <b>{num(won?.current_count)}</b> ({money(won?.current_value, currency)}) · Perdidas: <b>{num(lost?.current_count)}</b>
      </div>
    </div>
  );
}

// ---------------- Ranking del equipo (ordenable)
const RANK_COLS = [
  ['leads_contacted', 'Contactados'],
  ['calls', 'Llamadas'],
  ['calls_answered', 'Contestadas'],
  ['call_minutes', 'Minutos'],
  ['wa_sent', 'WhatsApp'],
  ['opps_won', 'Ventas'],
  ['opps_won_value', 'Valor'],
  ['tasks_completed', 'Tareas'],
];

export function RankingTable({ rows, userMap, me, currency }) {
  const [sort, setSort] = useState('leads_contacted');
  const sorted = useMemo(() => [...rows].sort((a, b) => Number(b[sort]) - Number(a[sort])), [rows, sort]);
  if (!rows.length) return <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>Sin usuarios en el alcance.</p>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
            <th style={{ textAlign: 'left', padding: '6px 8px' }}>#</th>
            <th style={{ textAlign: 'left', padding: '6px 8px' }}>Usuario</th>
            {RANK_COLS.map(([k, l]) => (
              <th key={k} style={{ textAlign: 'right', padding: '6px 8px', whiteSpace: 'nowrap' }}>
                <button
                  type="button"
                  onClick={() => setSort(k)}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: sort === k ? 700 : 500, color: sort === k ? 'var(--color-primary)' : 'var(--color-text)', fontSize: '0.8rem' }}
                >
                  {l} {sort === k ? '▼' : ''}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={r.user_id} style={{ borderBottom: '1px solid var(--color-border)', background: r.user_id === me ? 'var(--color-active-bg)' : 'transparent' }}>
              <td style={{ padding: '6px 8px' }}>{i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</td>
              <td style={{ padding: '6px 8px', fontWeight: r.user_id === me ? 700 : 400 }}>
                {userMap[r.user_id]?.name ?? 'Usuario'}
                {r.user_id === me ? ' (tú)' : ''}
              </td>
              {RANK_COLS.map(([k]) => (
                <td key={k} style={{ textAlign: 'right', padding: '6px 8px', fontVariantNumeric: 'tabular-nums' }}>
                  {k === 'opps_won_value' ? money(r[k], currency) : num(r[k], k === 'call_minutes' ? 1 : 0)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------- Avance de metas
export function GoalsProgress({ rows, currency }) {
  if (!rows?.length) return <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>No hay metas fijadas para este mes.</p>;
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {rows.map((g) => {
        const p = g.target ? Math.min(100, (Number(g.actual) / Number(g.target)) * 100) : 0;
        const done = Number(g.actual) >= Number(g.target);
        const fmt = (v) => (g.metric === 'opps_won_value' ? money(v, currency) : num(v, g.metric === 'call_minutes' ? 1 : 0));
        return (
          <div key={g.metric}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: 3 }}>
              <span>{GOAL_METRICS[g.metric] ?? g.metric}</span>
              <span>
                <b>{fmt(g.actual)}</b> / {fmt(g.target)} {done ? '✅' : `· ${Math.round(p)}%`}
              </span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: 'var(--color-active-bg)' }} role="progressbar" aria-valuenow={Math.round(p)} aria-valuemin={0} aria-valuemax={100}>
              <div style={{ width: `${p}%`, height: '100%', borderRadius: 4, background: done ? '#16a34a' : 'var(--color-primary)' }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}