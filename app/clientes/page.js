'use client';
// Ruta: app/clientes/page.js
// Clientes traídos de Asesorías, cruzados con los leads de la plataforma:
// cuáles ya están (y en qué lead), cuáles no, y números compartidos (familias).

import { Suspense, useCallback, useEffect, useState } from 'react';
import RequirePermission from '../../components/ui/requirePermission';
import Modal from '../../components/ui/modal';
import ClientCard from '../../components/clients/clientCard';
import { useSession } from '../../lib/auth/sessionContext';
import { trackEvent } from '../../lib/activity/tracker';
import { relTime } from '../../lib/leads/format';
import { createLeadFromClient, listClients, saveSource, sourceStatus, syncNow } from '../../lib/clients/api';
import { supabase } from '../../lib/supabase/client';

const FILTERS = [
  { key: 'all', label: 'Todos' },
  { key: 'in_leads', label: 'Ya están en leads' },
  { key: 'not_in_leads', label: 'No están en leads' },
  { key: 'shared_phone', label: 'Número compartido (familia)' },
];
const PAGE = 50;

export default function ClientsPage() {
  return (
    <RequirePermission perm="clients.view">
      <Suspense fallback={null}>
        <Clients />
      </Suspense>
    </RequirePermission>
  );
}

function Clients() {
  const { can, branches } = useSession();
  const [status, setStatus] = useState(null);
  const [rows, setRows] = useState(null);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [archived, setArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null); // cliente abierto
  const [config, setConfig] = useState(false);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);
  const [syncing, setSyncing] = useState(false);

  const loadStatus = useCallback(() => sourceStatus().then(setStatus).catch((e) => setError(e.message)), []);
  const load = useCallback(async () => {
    try {
      const r = await listClients({ search: q, filter, page, pageSize: PAGE, archived });
      setRows(r ?? []);
      setTotal(Number(r?.[0]?.total ?? 0));
    } catch (e) {
      setError(e.message);
    }
  }, [q, filter, page, archived]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      setQ(search.trim());
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  async function sync(full) {
    setSyncing(true);
    setMsg(null);
    setError(null);
    try {
      const r = await syncNow(full);
      setMsg(`Sincronización lista: ${r.count ?? 0} cliente(s) ${full ? 'importados' : 'nuevos o actualizados'}.`);
      trackEvent('clients.sync', { metadata: { full, count: r.count } });
      loadStatus();
      load();
    } catch (e) {
      setError(e.message);
      loadStatus();
    } finally {
      setSyncing(false);
    }
  }

  async function openClient(id) {
    const { data } = await supabase.from('clients').select('*').eq('id', id).maybeSingle();
    if (data) {
      setOpen(data);
      trackEvent('clients.view', { entityType: 'clients', entityId: id });
    }
  }

  async function toLead(c) {
    const branch = branches.length === 1 ? branches[0].id : null;
    try {
      const r = await createLeadFromClient(c.id, branch);
      if (r?.duplicate) setError('Ya existe un lead con ese teléfono o correo.');
      else if (r?.ok) {
        trackEvent('clients.lead_created', { entityType: 'clients', entityId: c.id });
        window.location.href = `/leads/${r.lead_id}`;
      }
    } catch (e) {
      setError(e.message.includes('sucursal') ? 'Tienes varias sucursales: crea el lead desde Leads eligiendo la sucursal.' : e.message);
    }
  }

  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <main style={{ padding: '1.5rem', maxWidth: 1250 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: '0.8rem' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Clientes</h1>
          <p style={{ fontSize: '0.84rem', color: 'var(--color-text-muted)' }}>
            Traídos de Asesorías (solo lectura) y cruzados con los leads por teléfono y correo.
            {status?.last_sync_at && ` Última sincronización ${relTime(status.last_sync_at)}.`}
            {status?.connected && ` ${status.total_local} en la plataforma${status.total_remote ? ` de ${status.total_remote} en Asesorías` : ''}.`}
          </p>
        </div>
        {can('clients.manage') && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" onClick={() => setConfig(true)}>
              ⚙️ Conexión
            </button>
            {status?.connected && (
              <>
                <button className="btn btn-secondary" disabled={syncing} onClick={() => sync(true)} title="Vuelve a traer todos los clientes">
                  Traer todo
                </button>
                <button className="btn btn-primary" disabled={syncing} onClick={() => sync(false)}>
                  {syncing ? 'Sincronizando…' : '🔄 Sincronizar'}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {status && !status.connected && (
        <div className="card" style={{ marginBottom: '1rem', fontSize: '0.88rem' }}>
          {can('clients.manage') ? 'Conecta la API de clientes de Asesorías con el botón “Conexión”.' : 'Un administrador todavía no ha conectado la fuente de clientes.'}
        </div>
      )}
      {status?.last_status === 'error' && status.last_error && (
        <p style={{ color: 'var(--color-danger)', fontSize: '0.84rem', marginBottom: 8 }}>⚠ Última sincronización con error: {status.last_error}</p>
      )}
      {msg && <p style={{ color: 'var(--color-success, #16a34a)', fontSize: '0.85rem', marginBottom: 8 }}>{msg}</p>}
      {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem', marginBottom: 8 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <input className="input" style={{ maxWidth: 300 }} placeholder="Buscar nombre, teléfono, correo o póliza…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="tabs-bar" style={{ marginBottom: 0 }}>
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={`tab-link${filter === f.key ? ' active' : ''}`}
              onClick={() => {
                setFilter(f.key);
                setPage(1);
              }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', borderBottom: filter === f.key ? '2px solid var(--color-primary)' : '2px solid transparent' }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <label style={{ fontSize: '0.82rem', display: 'flex', gap: 4, alignItems: 'center' }}>
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Incluir archivados
        </label>
      </div>

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-border)', fontSize: '0.78rem' }}>
              <th style={{ padding: '0.55rem 0.7rem' }}>Cliente</th>
              <th style={{ padding: '0.55rem 0.7rem' }}>Teléfono</th>
              <th style={{ padding: '0.55rem 0.7rem' }}>Póliza más reciente</th>
              <th style={{ padding: '0.55rem 0.7rem' }}>Dependientes</th>
              <th style={{ padding: '0.55rem 0.7rem' }}>Operador</th>
              <th style={{ padding: '0.55rem 0.7rem' }}>En la plataforma</th>
            </tr>
          </thead>
          <tbody>
            {rows === null && (
              <tr>
                <td colSpan={6} style={{ padding: '1.2rem', textAlign: 'center' }}>
                  Cargando…
                </td>
              </tr>
            )}
            {rows?.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: '1.2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                  No hay clientes con ese filtro.
                </td>
              </tr>
            )}
            {rows?.map((c) => (
              <tr key={c.id} style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer' }} onClick={() => openClient(c.id)}>
                <td style={{ padding: '0.5rem 0.7rem' }}>
                  <div style={{ fontWeight: 600 }}>
                    {c.full_name || 'Sin nombre'} {c.archived && <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>(archivado)</span>}
                  </div>
                  {c.email && <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{c.email}</div>}
                </td>
                <td style={{ padding: '0.5rem 0.7rem', whiteSpace: 'nowrap' }}>
                  {(c.phones ?? []).join(', ') || '—'}
                  {c.shared_phone_count > 0 && (
                    <div style={{ fontSize: '0.72rem', color: '#7c3aed' }} title="Otras personas tienen este número">
                      👪 +{c.shared_phone_count} con el mismo número
                    </div>
                  )}
                </td>
                <td style={{ padding: '0.5rem 0.7rem' }}>{c.active_policy || (c.policies_count ? `${c.policies_count} póliza(s)` : '—')}</td>
                <td style={{ padding: '0.5rem 0.7rem' }}>{c.dependents_count || '—'}</td>
                <td style={{ padding: '0.5rem 0.7rem' }}>{c.operator_name || '—'}</td>
                <td style={{ padding: '0.5rem 0.7rem' }} onClick={(e) => e.stopPropagation()}>
                  {c.lead_ids?.length ? (
                    <a href={`/leads/${c.lead_ids[0]}?tab=cliente`}>✅ Ver lead{c.lead_ids.length > 1 ? ` (+${c.lead_ids.length - 1})` : ''}</a>
                  ) : can('leads.create') ? (
                    <button className="btn btn-secondary" style={{ height: 28, fontSize: '0.78rem' }} onClick={() => toLead(c)}>
                      + Crear lead
                    </button>
                  ) : (
                    <span style={{ color: '#d97706' }}>No está</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', marginTop: 10, fontSize: '0.85rem' }}>
          <button className="btn btn-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            ←
          </button>
          Página {page} de {pages} · {total} clientes
          <button className="btn btn-secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            →
          </button>
        </div>
      )}

      <Modal open={!!open} onClose={() => setOpen(null)} title="Cliente" width={860}>
        {open && <ClientCard client={open} />}
      </Modal>
      <Modal open={config} onClose={() => setConfig(false)} title="Conexión con Asesorías" width={560}>
        {config && (
          <SourceForm
            status={status}
            onSaved={(s) => {
              setStatus(s);
              setConfig(false);
              setMsg('Conexión guardada. Presiona “Sincronizar” para traer los clientes.');
            }}
          />
        )}
      </Modal>
    </main>
  );
}

function SourceForm({ status, onSaved }) {
  const [url, setUrl] = useState(status?.base_url ?? '');
  const [token, setToken] = useState('');
  const [auto, setAuto] = useState(status?.auto_sync ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          onSaved(await saveSource(url, token, auto));
          trackEvent('clients.source_saved');
        } catch (err) {
          setError(err.message);
        } finally {
          setBusy(false);
        }
      }}
      style={{ display: 'grid', gap: 10 }}
    >
      <label style={{ fontSize: '0.85rem' }}>
        URL de la API
        <input className="input" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://<proyecto>.supabase.co/functions/v1/api-clientes-crm" />
      </label>
      <label style={{ fontSize: '0.85rem' }}>
        Token {status?.token_hint ? `(actual: ${status.token_hint}; vacío = conservarlo)` : ''}
        <input className="input" type="password" autoComplete="new-password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="ast_…" required={!status?.connected} />
      </label>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.85rem' }}>
        <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Sincronizar automáticamente (si se programó la tarea)
      </label>
      <p style={{ fontSize: '0.76rem', color: 'var(--color-text-muted)' }}>El token se guarda solo en el servidor; nadie puede volver a verlo desde la plataforma.</p>
      {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.84rem' }}>{error}</p>}
      <button className="btn btn-primary" disabled={busy}>
        {busy ? 'Guardando…' : 'Guardar'}
      </button>
    </form>
  );
}