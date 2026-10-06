'use client';
// Ruta: components/me/accessTable.js
// Tabla de equipos/navegadores donde se ha abierto una cuenta.

import Icon from '../ui/icon';

export default function AccessTable({ rows, mine }) {
  if (!rows.length) return <p className="me-muted">Aún no hay accesos registrados.</p>;
  const when = (d) => new Date(d).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="me-table">
        <thead>
          <tr>
            <th>Equipo</th>
            <th>IP</th>
            <th>Primer acceso</th>
            <th>Último uso</th>
            <th className="num">Ingresos</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <span className="me-device">
                  <Icon name={r.device === 'Celular' ? 'smartphone' : 'monitor'} size={15} />
                  <span>
                    {r.browser} en {r.os}
                    <small>
                      {r.device}
                      {r.client_id === mine ? ' · Este equipo' : ''}
                    </small>
                  </span>
                </span>
              </td>
              <td>{r.ip || '—'}</td>
              <td>{when(r.first_seen_at)}</td>
              <td>{when(r.last_seen_at)}</td>
              <td className="num">{r.logins}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}