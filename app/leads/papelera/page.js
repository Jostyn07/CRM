'use client';
// Ruta: app/leads/papelera/page.js
// Papelera (sección 9.10): leads con borrado lógico. Restaurar requiere
// leads.delete; el borrado permanente solo lo permite la base de datos
// a quien tiene leads.delete con alcance de organización.

import { useCallback, useEffect, useState } from 'react';
import RequirePermission from '../../../components/ui/requirePermission';
import { useSession } from '../../../lib/auth/sessionContext';
import { useLeadConfig } from '../../../lib/leads/useLeadConfig';
import { deletePermanently, listTrash, restore } from '../../../lib/leads/api';
import { fullDate } from '../../../lib/leads/format';
import { trackEvent } from '../../../lib/activity/tracker';

const PAGE_SIZE = 25;

export default function TrashPage() {
  return (
    <RequirePermission perm="leads.delete">
      <Trash />
    </RequirePermission>
  );
}

function Trash() {
  const { can } = useSession();
  const { maps } = useLeadConfig();
  const canPurge = can('leads.delete', 'organization');

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await listTrash({ page, pageSize: PAGE_SIZE });
      setRows(res.rows);
      setTotal(res.total);
      setSelected([]);
    } catch (e) {
      setMsg(e.message);
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  async function run(action, fn, confirmText) {
    if (!selected.length || (confirmText && !confirm(confirmText))) return;
    setBusy(true);
    try {
      const n = await fn(selected);
      trackEvent(`lead.trash_${action}`, { metadata: { count: n } });
      setMsg(`${n} lead(s) ${action === 'restore' ? 'restaurados' : 'eliminados permanentemente'}.`);
      await load();
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main style={{ padding: '1.5rem', maxWidth: 1100 }}>
      <a href="/leads" style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
        ← Leads
      </a>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: '0.4rem 0 0.2rem' }}>Papelera</h1>
      <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
        {total} lead(s). Los leads en la papelera no aparecen en la lista ni bloquean su teléfono o correo.
      </p>

      {selected.length > 0 && (
        <div className="card" style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '0.5rem 0.75rem', marginBottom: '0.75rem' }}>
          <strong style={{ fontSize: '0.86rem' }}>{selected.length} seleccionado(s)</strong>
          <button className="btn btn-primary" disabled={busy} onClick={() => run('restore', restore)}>
            Restaurar
          </button>
          {canPurge && (
            <button
              className="btn btn-secondary"
              style={{ color: 'var(--color-danger)' }}
              disabled={busy}
              onClick={() => run('purge', deletePermanently, `¿Eliminar permanentemente ${selected.length} lead(s)? Esta acción no se puede deshacer.`)}
            >
              Eliminar permanentemente
            </button>
          )}
        </div>
      )}
      {msg && <p style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>{msg}</p>}

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-border)' }}>
              <th style={cell}>
                <input
                  type="checkbox"
                  checked={rows.length > 0 && rows.every((r) => selected.includes(r.id))}
                  onChange={(e) => setSelected(e.target.checked ? rows.map((r) => r.id) : [])}
                  aria-label="Seleccionar todo"
                />
              </th>
              <th style={cell}>Nombre</th>
              <th style={cell}>Contacto</th>
              <th style={cell}>Sucursal</th>
              <th style={cell}>Eliminado</th>
              <th style={cell}>Eliminado por</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} style={{ ...cell, textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>
                  La papelera está vacía.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={cell}>
                  <input
                    type="checkbox"
                    checked={selected.includes(r.id)}
                    onChange={() => setSelected((s) => (s.includes(r.id) ? s.filter((x) => x !== r.id) : [...s, r.id]))}
                    aria-label="Seleccionar lead"
                  />
                </td>
                <td style={cell}>
                  <a href={`/leads/${r.id}`}>
                    {r.first_name} {r.last_name}
                  </a>
                </td>
                <td style={cell}>{r.phone_normalized || r.email_normalized}</td>
                <td style={cell}>{maps.branch[r.branch_id]?.name ?? '—'}</td>
                <td style={cell}>{fullDate(r.deleted_at)}</td>
                <td style={cell}>{maps.user[r.deleted_by]?.name ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center', marginTop: '0.75rem', fontSize: '0.85rem' }}>
          <button className="btn btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            ← Anterior
          </button>
          <span>
            Página {page} de {totalPages}
          </span>
          <button className="btn btn-secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Siguiente →
          </button>
        </div>
      )}
    </main>
  );
}

const cell = { padding: '0.6rem 0.75rem' };