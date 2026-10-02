'use client';
// Ruta: components/leads/leadViews.js
// Vistas de la lista de Leads: pestañas por estado, tabla, tarjetas y
// paginación numerada.

import { useRouter } from 'next/navigation';
import Icon from '../ui/icon';
import Avatar from '../ui/avatar';
import CardMenu from '../ui/cardMenu';
import { TagChips } from './tagPicker';
import { getAvatarColors } from './avatarColor';
import { relTime } from '../../lib/leads/format';
import { useCalls } from '../../lib/calls/callContext';

const fullName = (r) => `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || 'Sin nombre';

// ---------------------------------------------------------------- Estado
export function StatusBadge({ status }) {
  if (!status) return <span style={{ color: 'var(--color-text-muted)' }}>—</span>;
  const c = status.color || '#8a8a8a';
  return (
    <span
      className="lead-status"
      style={{
        background: `color-mix(in srgb, ${c} 16%, transparent)`,
        color: `color-mix(in srgb, ${c} 78%, var(--color-text))`,
        borderColor: `color-mix(in srgb, ${c} 32%, transparent)`,
      }}
    >
      <span className="lead-status-dot" style={{ background: c }} />
      {status.name}
    </span>
  );
}

// ---------------------------------------------------------------- Fuente
function SourceIcon({ name }) {
  const n = (name || '').toLowerCase();
  if (n.includes('whatsapp')) return <Icon name="message-circle" size={16} style={{ color: '#25D366' }} />;
  if (n.includes('llamad') || n.includes('teléf') || n.includes('telef')) return <Icon name="phone" size={15} style={{ color: 'var(--color-primary)' }} />;
  if (n.includes('correo') || n.includes('mail')) return <Icon name="mail" size={15} style={{ color: 'var(--color-primary)' }} />;
  if (n.includes('web') || n.includes('página') || n.includes('formul')) return <Icon name="globe" size={15} style={{ color: 'var(--color-primary)' }} />;
  if (n.includes('refer')) return <Icon name="users" size={15} style={{ color: 'var(--color-primary)' }} />;
  return <Icon name="tag" size={15} style={{ color: 'var(--color-text-muted)' }} />;
}

export function Source({ source }) {
  if (!source) return <span style={{ color: 'var(--color-text-muted)' }}>—</span>;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
      <SourceIcon name={source.name} />
      {source.name}
    </span>
  );
}

function Owner({ user }) {
  if (!user)
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
        <span className="lead-owner-empty">
          <Icon name="user" size={14} />
        </span>
        Sin asignar
      </span>
    );
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
      <Avatar name={user.name} size={26} />
      {user.name}
    </span>
  );
}

// Iniciales solo con letras: "Jesus (German)" -> "JG", "DULCE (NICOLL)" -> "DN"
function initials(name) {
  const parts = (name || '').replace(/[^\p{L}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[1][0]).toUpperCase();
}

function LeadAvatar({ name, size = 44 }) {
  const c = getAvatarColors(name);
  return (
    <span className="lead-avatar" style={{ width: size, height: size, background: c.bg, color: c.color, fontSize: Math.round(size * 0.36) }}>
      {initials(name)}
    </span>
  );
}

// Acciones de un lead (menú ⋮ y botones de la tarjeta)
function useLeadActions({ canDelete, onDelete }) {
  const router = useRouter();
  const { openDialer } = useCalls();
  const open = (r, tab) => router.push(`/leads/${r.id}${tab ? `?tab=${tab}` : ''}`);
  const call = (r) => r.phone_normalized && openDialer({ to: r.phone_normalized, leadId: r.id, leadName: fullName(r) });
  const menu = (r) =>
    [
      { label: 'Abrir lead', onClick: () => open(r) },
      r.phone_normalized && { label: 'Llamar', onClick: () => call(r) },
      { label: 'WhatsApp', onClick: () => open(r, 'whatsapp') },
      { label: 'Tareas', onClick: () => open(r, 'tareas') },
      canDelete && { label: 'Enviar a la papelera', danger: true, onClick: () => onDelete(r) },
    ].filter(Boolean);
  return { open, call, menu };
}

// ---------------------------------------------------------------- Pestañas por estado
export function StatusTabs({ statuses, counts, total, value, onChange }) {
  const Tab = ({ id, label, color, n }) => {
    const on = (value || '') === id;
    return (
      <button type="button" className={`lead-tab${on ? ' on' : ''}`} onClick={() => onChange(id)}>
        <span className="lead-status-dot" style={{ background: color || 'currentColor', opacity: color ? 1 : 0.6 }} />
        {label}
        {n != null && <span className="lead-tab-count">{n.toLocaleString('es-CO')}</span>}
      </button>
    );
  };
  return (
    <div className="lead-tabs" role="tablist" aria-label="Filtrar por estado">
      <Tab id="" label="Todos" n={total} />
      {statuses.map((s) => (
        <Tab key={s.id} id={s.id} label={s.name} color={s.color} n={counts?.[s.id]} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Tabla
function SortTh({ label, sortKeys, sort, onSort }) {
  if (!sortKeys) return <th>{label}</th>;
  const active = sortKeys.includes(sort);
  return (
    <th>
      <button type="button" className={`lead-th-sort${active ? ' on' : ''}`} onClick={() => onSort(active && sortKeys[1] ? (sort === sortKeys[0] ? sortKeys[1] : sortKeys[0]) : sortKeys[0])}>
        {label}
        <Icon name="arrow-up-down" size={12} />
      </button>
    </th>
  );
}

export function LeadTable({ rows, loading, emptyText, config, showBranch, selected, allOnPage, onToggleAll, onToggle, sort, onSort, canDelete, onDelete }) {
  const { open, menu } = useLeadActions({ canDelete, onDelete });
  return (
    <div className="card scroll-x lead-table-card">
      <table className="lead-table">
        <thead>
          <tr>
            <th style={{ width: 40 }}>
              <input type="checkbox" checked={allOnPage} onChange={onToggleAll} aria-label="Seleccionar página" />
            </th>
            <SortTh label="Nombre" sortKeys={['name_asc']} sort={sort} onSort={onSort} />
            <th>Contacto</th>
            <th>Empresa</th>
            <th>Estado</th>
            <th>Fuente</th>
            <th>Responsable</th>
            <th>Etiquetas</th>
            <SortTh label="Último contacto" sortKeys={['activity_desc']} sort={sort} onSort={onSort} />
            <SortTh label="Creado" sortKeys={['created_desc', 'created_asc']} sort={sort} onSort={onSort} />
            <th style={{ width: 56, textAlign: 'center' }}>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td colSpan={11} className="lead-empty">
                Cargando…
              </td>
            </tr>
          )}
          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={11} className="lead-empty">
                {emptyText}
              </td>
            </tr>
          )}
          {!loading &&
            rows.map((r) => {
              const sel = selected.includes(r.id);
              return (
                <tr key={r.id} className={sel ? 'sel' : ''} onClick={() => open(r)}>
                  <td onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={sel} onChange={() => onToggle(r.id)} aria-label="Seleccionar lead" />
                  </td>
                  <td>
                    <div className="lead-name">{fullName(r)}</div>
                    {showBranch && config.maps.branch[r.branch_id] && (
                      <div className="lead-sub">
                        <Icon name="map-pin" size={12} style={{ color: 'var(--color-primary)' }} /> {config.maps.branch[r.branch_id].name}
                      </div>
                    )}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <div>{r.phone_normalized || '—'}</div>
                    {r.email_normalized && <div className="lead-sub">{r.email_normalized}</div>}
                  </td>
                  <td>{r.company_name || <span className="lead-muted">—</span>}</td>
                  <td>
                    <StatusBadge status={config.maps.status[r.status_id]} />
                  </td>
                  <td>
                    <Source source={config.maps.source[r.source_id]} />
                  </td>
                  <td>
                    <Owner user={config.maps.user[r.assigned_user_id]} />
                  </td>
                  <td>
                    <TagChips tagIds={r.tag_ids} tagMap={config.maps.tag} />
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{r.last_activity_at ? relTime(r.last_activity_at) : <span className="lead-muted">Sin contacto</span>}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{new Date(r.created_at).toLocaleDateString('es-CO')}</td>
                  <td onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center' }}>
                    <CardMenu items={menu(r)} />
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------- Tarjetas
export function LeadGrid({ rows, loading, emptyText, config, showBranch, selected, onToggle, canDelete, onDelete }) {
  const { open, call, menu } = useLeadActions({ canDelete, onDelete });
  if (loading) return <div className="card lead-empty">Cargando…</div>;
  if (!rows.length) return <div className="card lead-empty">{emptyText}</div>;
  return (
    <div className="lead-grid">
      {rows.map((r) => {
        const name = fullName(r);
        const sel = selected.includes(r.id);
        const branch = config.maps.branch[r.branch_id]?.name;
        return (
          <article key={r.id} className={`card lead-card${sel ? ' sel' : ''}`} onClick={() => open(r)}>
            <header className="lead-card-head">
              <LeadAvatar name={name} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="lead-name lead-clamp" title={name}>
                  {name}
                </div>
                <div className="lead-sub lead-ellipsis">{showBranch && branch ? branch : r.company_name || config.maps.user[r.assigned_user_id]?.name || 'Sin asignar'}</div>
              </div>
              <StatusBadge status={config.maps.status[r.status_id]} />
              <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center' }}>
                <input type="checkbox" checked={sel} onChange={() => onToggle(r.id)} aria-label="Seleccionar lead" className="lead-card-check" />
                <CardMenu items={menu(r)} />
              </div>
            </header>

            <div className="lead-card-info">
              <span>
                <Icon name="phone" size={14} /> {r.phone_normalized || '—'}
              </span>
              <span>
                <Source source={config.maps.source[r.source_id]} />
              </span>
              <span>
                <Icon name="clock" size={14} /> {r.last_activity_at ? relTime(r.last_activity_at) : 'Sin contacto'}
              </span>
              <span className="lead-ellipsis">
                <Icon name="user" size={14} /> {config.maps.user[r.assigned_user_id]?.name ?? 'Sin asignar'}
              </span>
            </div>

            <div className="lead-card-tags">
              <TagChips tagIds={r.tag_ids} tagMap={config.maps.tag} />
            </div>

            <footer className="lead-card-actions" onClick={(e) => e.stopPropagation()}>
              <button type="button" title="Llamar" disabled={!r.phone_normalized} onClick={() => call(r)}>
                <Icon name="phone" size={17} />
              </button>
              <button type="button" title="WhatsApp" onClick={() => open(r, 'whatsapp')}>
                <Icon name="message-circle" size={17} style={{ color: '#25D366' }} />
              </button>
              <button type="button" title="Actividad y notas" onClick={() => open(r, 'actividad')}>
                <Icon name="message-square" size={17} />
              </button>
              <button type="button" title="Tareas" onClick={() => open(r, 'tareas')}>
                <Icon name="calendar" size={17} />
              </button>
            </footer>
          </article>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- Paginación
function pageList(page, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set([1, 2, total, page - 1, page, page + 1].filter((p) => p >= 1 && p <= total));
  if (page <= 4) [3, 4, 5].forEach((p) => set.add(p));
  if (page >= total - 3) [total - 4, total - 3, total - 2, total - 1].forEach((p) => p > 0 && set.add(p));
  const arr = [...set].sort((a, b) => a - b);
  const out = [];
  arr.forEach((p, i) => {
    if (i && p - arr[i - 1] > 1) out.push('…');
    out.push(p);
  });
  return out;
}

export function Pager({ page, pageSize, total, sizes, onPage, onSize }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="lead-pager">
      <span className="lead-muted">
        Mostrando {from.toLocaleString('es-CO')} a {to.toLocaleString('es-CO')} de {total.toLocaleString('es-CO')} leads
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <nav className="lead-pages" aria-label="Páginas">
          <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Anterior">
            <Icon name="chevron-left" size={16} />
          </button>
          {pageList(page, pages).map((p, i) =>
            p === '…' ? (
              <span key={`e${i}`} className="lead-muted" style={{ padding: '0 4px' }}>
                …
              </span>
            ) : (
              <button type="button" key={p} className={p === page ? 'on' : ''} onClick={() => onPage(p)} aria-current={p === page ? 'page' : undefined}>
                {p}
              </button>
            )
          )}
          <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Siguiente">
            <Icon name="chevron-right" size={16} />
          </button>
        </nav>
        <select className="input" style={{ width: 'auto', height: 36 }} value={pageSize} onChange={(e) => onSize(Number(e.target.value))} aria-label="Leads por página">
          {sizes.map((n) => (
            <option key={n} value={n}>
              {n} por página
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}