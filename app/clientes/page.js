'use client';
// Ruta: app/clientes/page.js
// Clientes traídos de Asesorías, cruzados con los leads de la plataforma:
// cuáles ya están (y en qué lead), cuáles no, y números compartidos (familias).
// Cada cliente pertenece a un portal de Asesorías y cada portal a una sucursal.
// Los clientes no aparecen en la lista de Leads.

import { Suspense, useCallback, useEffect, useState } from 'react';
import RequirePermission from '../../components/ui/requirePermission';
import Modal from '../../components/ui/modal';
import ClientCard from '../../components/clients/clientCard';
import ClientPanel, { StatusPill } from '../../components/clients/clientPanel';
import { useSession } from '../../lib/auth/sessionContext';
import { trackEvent } from '../../lib/activity/tracker';
import { relTime } from '../../lib/leads/format';
import { createLeadFromClient, listClients, listPortals, saveSource, setPortalBranch, sourceStatus, syncNow } from '../../lib/clients/api';
import CardMenu from '../../components/ui/cardMenu';
import { useCalls } from '../../lib/calls/callContext';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase/client';
import Icon, { IconText } from '../../components/ui/icon';

const FILTERS = [
  { key: 'all', label: 'Todos' },
  { key: 'in_leads', label: 'Con lead' },
  { key: 'not_in_leads', label: 'Sin lead' },
  { key: 'shared_phone', label: 'Teléfono compartido' },
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
  const { can, activeBranchId } = useSession();
  const router = useRouter();
  const { openDialer } = useCalls();
  const [busyId, setBusyId] = useState(null);

  // Lead del cliente: el que ya existe o uno nuevo creado en el momento
  // (sin lead no hay dónde guardar tareas ni el chat de WhatsApp)
  async function ensureLead(c) {
    if (c.lead_ids?.length) return c.lead_ids[0];
    setBusyId(c.id);
    try {
      const r = await createLeadFromClient(c.id, activeBranchId);
      const id = r?.lead_id ?? r?.matches?.[0]?.id ?? r?.matches?.[0]?.lead_id;
      if (!id) throw new Error('No se pudo preparar el cliente para esta acción.');
      trackEvent('clients.lead_created', { entityType: 'leads', entityId: id });
      return id;
    } catch (e) {
      window.alert(e.message || 'No se pudo preparar el cliente para esta acción.');
      return null;
    } finally {
      setBusyId(null);
    }
  }
  async function goLead(c, tab) {
    const id = await ensureLead(c);
    if (id) router.push(`/leads/${id}${tab ? `?tab=${tab}` : ''}`);
  }
  const clientActions = (c) =>
    [
      { label: c.lead_ids?.length ? 'Abrir lead' : 'Abrir como lead', onClick: () => goLead(c, 'cliente') },
      c.phones?.[0] && { label: 'Llamar', onClick: () => openDialer({ to: c.phones[0], leadId: c.lead_ids?.[0], leadName: c.full_name }) },
      c.phones?.[0] && { label: 'WhatsApp', onClick: () => goLead(c, 'whatsapp') },
      { label: 'Tareas', onClick: () => goLead(c, 'tareas') },
    ].filter(Boolean);
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
  const [portal, setPortal] = useState('');
  const [portals, setPortals] = useState([]);
  const [portalsOpen, setPortalsOpen] = useState(false);

  const loadStatus = useCallback(() => sourceStatus().then(setStatus).catch((e) => setError(e.message)), []);
  const load = useCallback(async () => {
    try {
      const r = await listClients({ search: q, filter, page, pageSize: PAGE, archived, portal });
      setRows(r ?? []);
      setTotal(Number(r?.[0]?.total ?? 0));
    } catch (e) {
      setError(e.message);
    }
  }, [q, filter, page, archived, portal]);

  const loadPortals = useCallback(() => listPortals().then((p) => setPortals(p ?? [])).catch(() => {}), []);

  useEffect(() => {
    loadStatus();
    loadPortals();
  }, [loadStatus, loadPortals]);
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
      setMsg(`Sincronización lista: ${r.count ?? 0} cliente(s) ${full ? 'actualizados' : 'nuevos o con cambios'}.`);
      trackEvent('clients.sync', { metadata: { full, count: r.count } });
      loadStatus();
      loadPortals();
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

  const pages = Math.max(1, Math.ceil(total / PAGE));
  const [onlyChanges, setOnlyChanges] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const splitPolicy = (s) => {
    const parts = String(s || '').split(' · ');
    if (parts.length >= 3) return { company: parts[0], plan: parts.slice(1, -1).join(' · '), status: parts[parts.length - 1] };
    if (parts.length === 2) return { company: parts[0], plan: parts[1], status: '' };
    return { company: parts[0] || '', plan: '', status: '' };
  };
  const pageList = () => {
    const out = [];
    for (let i = 1; i <= pages; i++) if (i === 1 || i === pages || Math.abs(i - page) <= 1) out.push(i);
    return out.reduce((acc, n, i) => (i && n - out[i - 1] > 1 ? [...acc, '…', n] : [...acc, n]), []);
  };

  return (
    <main className="cl-page">
      <header className="cl-head">
        <div>
          <h1>
            Clientes
            {status?.connected && <span className="cl-count">{Number(status.total_local ?? total).toLocaleString('es-CO')} clientes</span>}
          </h1>
          <p>Clientes de Asesorías, cruzados con los leads por teléfono y correo.</p>
        </div>
        {can('clients.manage') && (
          <div className="cl-head-actions">
            <button className="btn btn-secondary" onClick={() => setConfig(true)}>
              <IconText name="sliders-horizontal" size={15}>Conexión</IconText>
            </button>
            {portals.length > 0 && (
              <button className="btn btn-secondary" onClick={() => setPortalsOpen(true)}>
                <IconText name="building-2" size={15}>Portales</IconText>
              </button>
            )}
          </div>
        )}
      </header>

      {status && !status.connected && (
        <div className="card cl-syncbar">
          <Icon name="info" size={16} />
          <span>{can('clients.manage') ? 'Conecta la API de clientes de Asesorías con el botón “Conexión”.' : 'Un administrador todavía no ha conectado la fuente de clientes.'}</span>
        </div>
      )}
      {can('clients.manage') && status?.connected && (
        <div className="card cl-syncbar">
          <Icon name="clock" size={17} />
          <strong>{status.last_sync_at ? `Última sincronización ${relTime(status.last_sync_at)}` : 'Aún no se ha sincronizado'}</strong>
          <span className="cl-sep" />
          <span className="cl-muted">Completa: todos los días 7:00 a. m. y 12:00 m. · Cambios: cada 10 min</span>
          <div className="cl-sync-right">
            <label className="cl-check" title="Solo trae los clientes que cambiaron en Asesorías">
              <input type="checkbox" checked={onlyChanges} onChange={(e) => setOnlyChanges(e.target.checked)} />
              <span>
                Solo cambios
                <small>Alcance de la sincronización</small>
              </span>
            </label>
            <button className="btn cl-gold" disabled={syncing} onClick={() => sync(!onlyChanges)}>
              <IconText name="refresh-cw" size={15}>{syncing ? 'Sincronizando…' : 'Sincronizar'}</IconText>
            </button>
          </div>
        </div>
      )}
      {can('clients.manage') && status?.last_status === 'error' && status.last_error && (
        <p className="cl-error">
          <Icon name="triangle-alert" size={15} /> Última sincronización con error: {status.last_error}
        </p>
      )}
      {msg && <p style={{ color: 'var(--color-success, #16a34a)', fontSize: '0.85rem', marginBottom: 8 }}>{msg}</p>}
      {error && <p className="cl-error">{error}</p>}

      <div className="card cl-search">
        <Icon name="search" size={17} />
        <input placeholder="Buscar por nombre, teléfono, correo o póliza" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className={`cl-layout${panelOpen ? '' : ' no-panel'}`}>
        <section className="card cl-list">
          <div className="cl-list-top">
            <span className="cl-muted">Póliza más reciente por cliente</span>
            <div className="cl-list-tools">
              {portals.length > 1 && (
                <select
                  className="input"
                  value={portal}
                  onChange={(e) => {
                    setPortal(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">Todos los portales</option>
                  {portals.map((p) => (
                    <option key={p.portal_key} value={p.portal_key}>
                      {p.name}
                    </option>
                  ))}
                  <option value="__none__">Sin portal</option>
                </select>
              )}
              <label className="cl-check">
                <input
                  type="checkbox"
                  checked={archived}
                  onChange={(e) => {
                    setArchived(e.target.checked);
                    setPage(1);
                  }}
                />
                <span>Incluir archivados</span>
              </label>
              {!panelOpen && (
                <button className="btn btn-secondary" onClick={() => setPanelOpen(true)}>
                  <IconText name="contact" size={15}>Mostrar ficha</IconText>
                </button>
              )}
            </div>
          </div>
          <div className="cl-tabs" role="tablist">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                role="tab"
                aria-selected={filter === f.key}
                className={filter === f.key ? 'active' : ''}
                onClick={() => {
                  setFilter(f.key);
                  setPage(1);
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="cl-table-wrap">
            <table className="cl-table">
              <thead>
                <tr>
                  <th>Cliente ↑</th>
                  <th>Teléfono</th>
                  <th>Compañía / plan · Estado</th>
                  <th className="num">Depend.</th>
                  {portals.length > 0 && <th>Portal</th>}
                  <th>Operador</th>
                  <th>Vínculo con lead</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {!rows && (
                  <tr>
                    <td colSpan={8} className="cl-empty">
                      Cargando…
                    </td>
                  </tr>
                )}
                {rows?.length === 0 && (
                  <tr>
                    <td colSpan={8} className="cl-empty">
                      No hay clientes con ese filtro.
                    </td>
                  </tr>
                )}
                {rows?.map((c) => {
                  const pol = splitPolicy(c.active_policy);
                  return (
                    <tr key={c.id} className={open?.id === c.id ? 'active' : ''} onClick={() => openClient(c.id)}>
                      <td>
                        <div className="cl-name">
                          {c.full_name || 'Sin nombre'} {c.archived && <small>(archivado)</small>}
                        </div>
                        {c.email && <div className="cl-sub">{c.email}</div>}
                      </td>
                      <td className="nowrap">
                        {(c.phones ?? []).join(', ') || '—'}
                        {c.shared_phone_count > 0 && (
                          <>
                            <div className="cl-shared">
                              <Icon name="users" size={12} /> Teléfono compartido
                            </div>
                            <div className="cl-sub">+{c.shared_phone_count} con el mismo número</div>
                          </>
                        )}
                      </td>
                      <td className="cl-policy-cell">
                        {c.active_policy ? (
                          <>
                            <div className="cl-company">{pol.company}</div>
                            {pol.plan && <div className="cl-sub">{pol.plan}</div>}
                            {pol.status && <StatusPill value={pol.status} />}
                          </>
                        ) : (
                          <span className="cl-sub">{c.policies_count ? `${c.policies_count} póliza(s)` : 'Sin pólizas'}</span>
                        )}
                      </td>
                      <td className="num">{c.dependents_count || <span className="cl-sub">No informado</span>}</td>
                      {portals.length > 0 && <td>{c.portal || '—'}</td>}
                      <td>{c.operator_name || '—'}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {c.lead_ids?.length ? (
                          <a className="cl-lead-link" href={`/leads/${c.lead_ids[0]}?tab=cliente`}>
                            Ver lead{c.lead_ids.length > 1 ? ` (+${c.lead_ids.length - 1})` : ''} <Icon name="external-link" size={12} />
                          </a>
                        ) : (
                          <span className="cl-sub">Sin vincular</span>
                        )}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="cl-actions">
                          <button type="button" className={`cl-ficha${open?.id === c.id ? ' on' : ''}`} onClick={() => openClient(c.id)}>
                            Ficha
                          </button>
                          {busyId === c.id ? <span className="cl-sub">Abriendo…</span> : <CardMenu items={clientActions(c)} />}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <footer className="cl-list-foot">
            <span>
              {total.toLocaleString('es-CO')} clientes{filter !== 'all' || q || portal || archived ? ' con este filtro' : ' en la plataforma'}
            </span>
            {pages > 1 && (
              <div className="cl-pager">
                <button disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Anterior">
                  <Icon name="chevron-left" size={15} />
                </button>
                {pageList().map((n, i) =>
                  n === '…' ? (
                    <span key={`d${i}`}>…</span>
                  ) : (
                    <button key={n} className={n === page ? 'on' : ''} onClick={() => setPage(n)}>
                      {n}
                    </button>
                  )
                )}
                <button disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Siguiente">
                  <Icon name="chevron-right" size={15} />
                </button>
              </div>
            )}
          </footer>
        </section>

        {panelOpen && <ClientPanel client={open} onClose={() => setPanelOpen(false)} />}
      </div>

      <Modal open={!!open && !panelOpen} onClose={() => setOpen(null)} title="Cliente" width={860}>
        {open && !panelOpen && <ClientCard client={open} />}
      </Modal>
      <Modal open={portalsOpen} onClose={() => setPortalsOpen(false)} title="Portales de Asesorías" width={620}>
        {portalsOpen && (
          <PortalsForm
            portals={portals}
            canEdit={can('clients.manage')}
            onChanged={() => {
              loadPortals();
              load();
            }}
          />
        )}
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
        <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Sincronizar automáticamente (todos los días 7:00 a. m. y 12:00 m.)
      </label>
      <p style={{ fontSize: '0.76rem', color: 'var(--color-text-muted)' }}>El token se guarda solo en el servidor; nadie puede volver a verlo desde la plataforma.</p>
      {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.84rem' }}>{error}</p>}
      <button className="btn btn-primary" disabled={busy}>
        {busy ? 'Guardando…' : 'Guardar'}
      </button>
    </form>
  );
}

// Cada portal de Asesorías pertenece a una sucursal: define qué clientes ve
// cada administrador de sucursal.
function PortalsForm({ portals, canEdit, onChanged }) {
  const [branches, setBranches] = useState([]);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    supabase
      .from('branches')
      .select('id, name, status')
      .order('name')
      .then(({ data }) => setBranches((data ?? []).filter((b) => b.status === 'active')));
  }, []);

  async function change(p, branchId) {
    setBusy(p.portal_key);
    setError(null);
    try {
      await setPortalBranch(p.portal_key, branchId);
      trackEvent('clients.portal_branch', { metadata: { portal: p.portal_key, branch_id: branchId || null } });
      onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginBottom: 10 }}>
        Los portales llegan con los clientes de Asesorías. Asigna cada uno a su sucursal: los administradores de esa sucursal verán sus clientes. A un usuario también se le pueden asignar portales en Configuración › Usuarios.
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
        <thead>
          <tr style={{ textAlign: 'left', color: 'var(--color-text-muted)', fontSize: '0.78rem', borderBottom: '1px solid var(--color-border)' }}>
            <th style={{ padding: '0.4rem' }}>Portal</th>
            <th style={{ padding: '0.4rem' }}>Clientes</th>
            <th style={{ padding: '0.4rem' }}>Usuarios</th>
            <th style={{ padding: '0.4rem' }}>Sucursal</th>
          </tr>
        </thead>
        <tbody>
          {portals.map((p) => (
            <tr key={p.portal_key} style={{ borderBottom: '1px solid var(--color-border)' }}>
              <td style={{ padding: '0.4rem', fontWeight: 600 }}>{p.name}</td>
              <td style={{ padding: '0.4rem' }}>{p.clients_count}</td>
              <td style={{ padding: '0.4rem' }}>{p.users_count}</td>
              <td style={{ padding: '0.4rem' }}>
                {canEdit ? (
                  <select className="input" style={{ height: 32 }} disabled={busy === p.portal_key} value={p.branch_id ?? ''} onChange={(e) => change(p, e.target.value)}>
                    <option value="">Sin sucursal</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  p.branch_name || 'Sin sucursal'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.84rem', marginTop: 8 }}>{error}</p>}
    </div>
  );
}