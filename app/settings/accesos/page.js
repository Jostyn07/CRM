'use client';
// Ruta: app/settings/accesos/page.js
// Accesos y sesiones del equipo: dónde se han abierto las cuentas
// (equipo, navegador, IP, último uso) y cierre de sesiones.
// Permisos: account.access_log (ver) y account.sessions (cerrar),
// con alcance de sucursal u organización.

import { Fragment, useCallback, useEffect, useState } from 'react';
import { SettingsHeader } from '../../../components/settings/settingsTabs';
import { useSession } from '../../../lib/auth/sessionContext';
import { closeUserSessions, listMyAccess, listTeamAccess } from '../../../lib/me/access';
import AccessTable from '../../../components/me/accessTable';
import Icon from '../../../components/ui/icon';
import { relTime } from '../../../lib/leads/format';

export default function AccessPage() {
  const { scopeOf, user } = useSession();
  const viewScope = scopeOf('account.access_log');
  const closeScope = scopeOf('account.sessions');
  const canView = viewScope === 'branch' || viewScope === 'organization';
  const canClose = closeScope === 'branch' || closeScope === 'organization';
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const [detail, setDetail] = useState({});
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    listTeamAccess()
      .then(setRows)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (canView) load();
  }, [canView, load]);

  async function toggle(id) {
    if (open === id) return setOpen(null);
    setOpen(id);
    if (!detail[id]) {
      try {
        const d = await listMyAccess(id);
        setDetail((x) => ({ ...x, [id]: d }));
      } catch (e) {
        setError(e.message);
      }
    }
  }

  async function close(r) {
    if (!window.confirm(`¿Cerrar todas las sesiones de ${r.full_name || r.email}? Tendrá que iniciar sesión de nuevo en todos sus equipos.`)) return;
    setError(null);
    try {
      const n = await closeUserSessions(r.user_id);
      setMsg(`Se cerraron ${n} sesión(es) de ${r.full_name || r.email}.`);
      setTimeout(() => setMsg(null), 4000);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  if (!canView) {
    return (
      <main style={{ padding: '1.5rem' }}>
        <SettingsHeader title="Accesos y sesiones" />
        <p className="me-muted">No tienes permiso para ver los accesos del equipo. Tus propios accesos están en Mi espacio › Seguridad.</p>
      </main>
    );
  }

  const shown = (rows ?? []).filter((r) => !q.trim() || `${r.full_name} ${r.email}`.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <main className="me-page">
      <SettingsHeader title="Accesos y sesiones" subtitle="Dónde se han abierto las cuentas de tu equipo y cuántas sesiones tienen abiertas." />
      {msg && <p className="me-ok" style={{ marginBottom: 10 }}>{msg}</p>}
      {error && <p className="me-err" style={{ marginBottom: 10 }}>{error}</p>}
      <div className="rp-search" style={{ maxWidth: 360, marginBottom: 12 }}>
        <Icon name="search" size={15} />
        <input placeholder="Buscar usuario…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <section className="card me-card" style={{ padding: '0 !important' }}>
        {!rows ? (
          <p className="me-muted">Cargando…</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="me-table">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Último acceso</th>
                  <th>Equipo</th>
                  <th>IP</th>
                  <th className="num">Equipos</th>
                  <th className="num">Sesiones abiertas</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <Fragment key={r.user_id}>
                    <tr className="me-row" onClick={() => toggle(r.user_id)}>
                      <td>
                        <strong>{r.full_name || '—'}</strong>
                        {r.user_id === user?.id ? ' (tú)' : ''}
                        <small className="me-sub">
                          {r.email}
                          {r.status !== 'active' ? ` · ${r.status}` : ''}
                        </small>
                      </td>
                      <td>{r.last_seen_at ? relTime(r.last_seen_at) : 'Nunca'}</td>
                      <td>{r.last_browser ? `${r.last_browser} en ${r.last_os} (${r.last_device})` : '—'}</td>
                      <td>{r.last_ip || '—'}</td>
                      <td className="num">{r.devices}</td>
                      <td className="num">{r.active_sessions}</td>
                      <td onClick={(e) => e.stopPropagation()} style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                        {canClose && r.user_id !== user?.id && Number(r.active_sessions) > 0 && (
                          <button className="btn btn-secondary" style={{ color: 'var(--color-danger)' }} onClick={() => close(r)}>
                            Cerrar sesiones
                          </button>
                        )}
                        <Icon name={open === r.user_id ? 'chevron-up' : 'chevron-down'} size={16} style={{ marginLeft: 8, verticalAlign: 'middle' }} />
                      </td>
                    </tr>
                    {open === r.user_id && (
                      <tr>
                        <td colSpan={7} className="me-detail">
                          {detail[r.user_id] ? <AccessTable rows={detail[r.user_id]} /> : <p className="me-muted">Cargando…</p>}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
                {!shown.length && (
                  <tr>
                    <td colSpan={7} className="me-muted" style={{ padding: '1rem' }}>
                      Sin usuarios para mostrar.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="rp-info">
        <Icon name="info" size={14} /> Al cerrar las sesiones de alguien, sale de Xiris en todos sus equipos en menos de un minuto y debe volver a iniciar sesión.
      </p>
    </main>
  );
}