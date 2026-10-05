'use client';
// Ruta: app/whatsapp/page.js
// Bandeja de atención de WhatsApp: conversaciones (según los números
// permitidos y mi alcance) con filtros, la conversación al centro y la
// ficha del cliente a la derecha.

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import RequirePermission from '../../components/ui/requirePermission';
import WaThread from '../../components/whatsapp/waThread';
import WazzupFrame from '../../components/whatsapp/wazzupFrame';
import WaModeToggle from '../../components/whatsapp/waModeToggle';
import Icon, { IconText } from '../../components/ui/icon';
import { supabase } from '../../lib/supabase/client';
import { useSession } from '../../lib/auth/sessionContext';
import { useOrgUsers } from '../../lib/tasks/useOrgUsers';
import { trackEvent } from '../../lib/activity/tracker';
import { fechaCorta } from '../../lib/chat/api';
import { formatChat, listChannels, listConversations, setNoReply, setReadLater, useWaMode } from '../../lib/whatsapp/api';
import SoundToggle from '../../components/ui/soundToggle';
import WaClientPanel from '../../components/whatsapp/waClientPanel';
import { bulkUpdate } from '../../lib/leads/api';

// Filtros de la bandeja
const FILTERS = [
  { key: 'all', label: 'Todas', test: () => true },
  { key: 'reply', label: 'Por responder', test: (c) => c.needs_reply },
  { key: 'unassigned', label: 'Sin asignar', test: (c) => !c.assigned_user_id },
  { key: 'mine', label: 'Mis conversaciones', test: (c, me) => c.assigned_user_id === me },
  { key: 'unread', label: 'No leídas', test: (c) => Number(c.unread) > 0 },
  { key: 'later', label: 'Más tarde', test: (c) => c.read_later },
  { key: 'resolved', label: 'Resueltas', test: (c) => !!c.no_reply_by },
];

// Estado de la conversación para el equipo
function statusOf(c) {
  if (c.needs_reply) return { key: 'reply', label: 'Por responder' };
  if (c.no_reply_by) return { key: 'resolved', label: 'Resuelta' };
  return { key: 'follow', label: 'En seguimiento' };
}

function initials(name) {
  const parts = (name || '').replace(/[^\p{L}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '#';
  return (parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[1][0]).toUpperCase();
}

export default function WhatsappPage() {
  return (
    <RequirePermission perm="whatsapp.view">
      <Suspense fallback={null}>
        <Inbox />
      </Suspense>
    </RequirePermission>
  );
}

function Inbox() {
  const { user, profile, can, scopeOf } = useSession();
  const [mode, setMode] = useWaMode();
  const canGlobal = scopeOf('whatsapp.view') === 'organization';
  const { users, userMap } = useOrgUsers();
  const router = useRouter();
  const params = useSearchParams();
  const [channels, setChannels] = useState([]);
  const [channel, setChannel] = useState('');
  const [convs, setConvs] = useState(null);
  const [selected, setSelected] = useState(params.get('c'));
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all'); // all | reply | unassigned | mine | unread | resolved | later
  const [panel, setPanel] = useState(true); // ficha del cliente visible
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setConvs(await listConversations(channel));
    } catch (e) {
      setError(e.message);
    }
  }, [channel]);

  useEffect(() => {
    listChannels().then((c) => setChannels(c.filter((x) => x.is_active))).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    // Muchos cambios seguidos = una sola recarga de la bandeja
    let timer;
    const later = () => {
      clearTimeout(timer);
      timer = setTimeout(load, 1200);
    };
    const ch = supabase
      .channel(`wa-inbox-${user?.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wa_conversations' }, later)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'wa_messages' }, later)
      .subscribe();
    const onRead = () => load();
    window.addEventListener('wa:read', onRead);
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(ch);
      window.removeEventListener('wa:read', onRead);
    };
  }, [load, user?.id]);

  function open(id) {
    setSelected(id);
    const url = new URL(window.location.href);
    url.searchParams.set('c', id);
    router.replace(url.pathname + url.search, { scroll: false });
    trackEvent('whatsapp.open', { entityType: 'wa_conversations', entityId: id });
  }

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (convs ?? [])
      .filter((c) => FILTERS.find((f) => f.key === filter).test(c, user?.id))
      .filter((c) => !term || `${c.lead_name ?? ''} ${c.contact_name ?? ''} ${c.chat_id}`.toLowerCase().includes(term.replace(/\D/g, '') || term))
      .sort((a, b) => (b.read_later ? 1 : 0) - (a.read_later ? 1 : 0)); // "leer más tarde" arriba
  }, [convs, q, filter, user?.id]);

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.key, (convs ?? []).filter((c) => f.test(c, user?.id)).length])),
    [convs, user?.id]
  );

  async function assign(c, userId) {
    if (!c.lead_id) return;
    try {
      await bulkUpdate([c.lead_id], { assigned_user_id: userId || null });
      trackEvent('whatsapp.assign', { entityType: 'leads', entityId: c.lead_id });
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function markNoReply(c, on) {
    try {
      await setNoReply(c.id, on);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  // Leer más tarde: al marcarla se cierra, para que no se quite al leer
  async function toggleReadLater(c) {
    try {
      await setReadLater(c.id, !c.read_later);
      if (!c.read_later) {
        setSelected(null);
        const url = new URL(window.location.href);
        url.searchParams.delete('c');
        router.replace(url.pathname + url.search, { scroll: false });
      }
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  const conv = convs?.find((c) => c.id === selected);
  const chName = (id) => channels.find((c) => c.id === id)?.name;

  if (!profile) return null;

  // Salir: vuelve a la página donde estaba antes de entrar a WhatsApp
  function exit() {
    let back = '/dashboard';
    try {
      const saved = sessionStorage.getItem('xiris.lastPath');
      // Nunca volver a una pantalla completa (evita que la X "no haga nada")
      if (saved && !/^\/(comunicacion|whatsapp)(\/|\?|$)/.test(saved)) back = saved;
    } catch {}
    router.push(back);
  }

  const nameOf = (c) => c.lead_name || c.contact_name || formatChat(c.chat_id);
  const showPanel = panel && conv && mode !== 'wazzup' && selected !== '__wazzup__';

  return (
    <main className="wa-page">
      {/* Barra superior propia: WhatsApp se usa a pantalla completa */}
      <header className="wa-topbar">
        <div className="wa-topbar-brand">
          <span className="wa-topbar-logo">
            <Icon name="message-circle" size={18} />
          </span>
          <strong>WhatsApp</strong>
          <span className="wa-topbar-sep" />
          <span className="wa-topbar-sub">Atención al cliente</span>
        </div>
        <div className="wa-page-tools">
          <SoundToggle />
          <WaModeToggle
            mode={mode}
            onChange={(m) => {
              setMode(m);
              if (selected === '__wazzup__' && m === 'app') setSelected(null);
            }}
          />
          {channels.length > 1 && (
            <select className="input" style={{ width: 220 }} value={channel} onChange={(e) => setChannel(e.target.value)} aria-label="Número">
              <option value="">Todos mis números</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.phone ? `(${c.phone})` : ''}
                </option>
              ))}
            </select>
          )}
          <span className="wa-topbar-avatar" title={profile.full_name || ''}>
            {initials(profile.full_name || user?.email || '')}
          </span>
          <button type="button" className="wa-topbar-close" onClick={exit} title="Salir de WhatsApp" aria-label="Salir de WhatsApp">
            <Icon name="x" size={20} />
          </button>
        </div>
      </header>

      <div className="wa-page-head">
        <div>
          <h1>Bandeja de atención</h1>
          <p>Un espacio para atender a tus clientes, en equipo.</p>
        </div>
        <span className="wa-page-badge">
          <strong>WhatsApp</strong> · Atención al cliente
        </span>
      </div>

      {error && <p style={{ color: 'var(--color-danger)', margin: '0 1.5rem 8px' }}>{error}</p>}

      <div className={`wa-layout${showPanel ? ' with-panel' : ''}`}>
        {/* ---------------- Conversaciones */}
        <section className="card wa-list">
          <header className="wa-list-head">
            <strong>Conversaciones</strong>
            <span className="wa-chip-count">{FILTERS.find((f) => f.key === filter).label}</span>
          </header>
          <div className="wa-list-tools">
            <label className="wa-search">
              <Icon name="search" size={15} />
              <input placeholder="Buscar por nombre o número…" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            <div className="wa-filters">
              {FILTERS.map((f) => (
                <button key={f.key} type="button" className={filter === f.key ? 'on' : ''} onClick={() => setFilter(f.key)}>
                  {f.label}
                  {f.key !== 'all' && counts[f.key] > 0 && <span>{counts[f.key]}</span>}
                </button>
              ))}
            </div>
            {mode === 'wazzup' && canGlobal && (
              <button className={`btn ${selected === '__wazzup__' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setSelected('__wazzup__')}>
                <IconText name="inbox" size={16}>Bandeja completa de Wazzup</IconText>
              </button>
            )}
          </div>
          <div className="wa-list-items">
            {!convs ? (
              <p className="wa-empty">Cargando…</p>
            ) : list.length === 0 ? (
              <p className="wa-empty">{channels.length ? 'No hay conversaciones con este filtro.' : 'No tienes números de WhatsApp asignados. Pide acceso al administrador.'}</p>
            ) : (
              list.map((c) => {
                const unread = Number(c.unread) || 0;
                const st = statusOf(c);
                return (
                  <button key={c.id} type="button" className={`wa-item${c.id === selected ? ' on' : ''}`} onClick={() => open(c.id)}>
                    <div className="wa-item-row">
                      <span className={`wa-item-name${unread ? ' bold' : ''}`}>{nameOf(c)}</span>
                      <span className="wa-item-time">{fechaCorta(c.last_message_at)}</span>
                    </div>
                    <div className="wa-item-row">
                      <span className={`wa-item-preview${unread ? ' bold' : ''}`}>
                        {c.last_direction === 'out' ? <Icon name="reply" size={12} style={{ verticalAlign: '-2px', marginRight: 4, transform: 'scaleX(-1)' }} /> : ''}
                        {c.last_message_preview}
                      </span>
                      {unread > 0 && <span className="wa-unread">{unread > 99 ? '99+' : unread}</span>}
                    </div>
                    <div className="wa-item-row">
                      <span className="wa-item-owner">
                        <Icon name="user" size={12} />
                        {c.assigned_user_id ? userMap[c.assigned_user_id]?.name ?? '' : 'Sin asignar'}
                        {channels.length > 1 && chName(c.channel_id) ? ` · ${chName(c.channel_id)}` : ''}
                      </span>
                      <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                        {c.read_later && (
                          <span className="wa-status later" title="Leer más tarde">
                            <Icon name="bookmark" size={11} />
                          </span>
                        )}
                        <span className={`wa-status ${st.key}`}>{st.label}</span>
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
          <footer className="wa-list-foot">Ordenadas por actividad reciente</footer>
        </section>

        {/* ---------------- Conversación */}
        <section className="card wa-center">
          {!selected ? (
            <div className="wa-placeholder">
              <Icon name="messages-square" size={34} />
              <strong>Elige una conversación</strong>
              <span>{mode === 'wazzup' ? 'Se abrirá en la ventana de Wazzup, con todo su historial.' : 'Aquí verás los mensajes y podrás responder.'}</span>
            </div>
          ) : selected === '__wazzup__' ? (
            <WazzupFrame global />
          ) : (
            <>
              {conv && (
                <header className="wa-head">
                  <div className="wa-head-main">
                    <span className="wa-avatar">{initials(nameOf(conv))}</span>
                    <div style={{ minWidth: 0 }}>
                      <h2>{nameOf(conv)}</h2>
                      <div className="wa-head-sub">
                        Cliente · WhatsApp · {formatChat(conv.chat_id)}
                      </div>
                    </div>
                    <div className="wa-head-actions">
                      <button className="btn btn-secondary" onClick={() => toggleReadLater(conv)} title={conv.read_later ? 'Quitar la marca' : 'Se marca y se cierra; la verás arriba en la lista'}>
                        <IconText name="bookmark" size={15}>{conv.read_later ? 'Quitar de más tarde' : 'Leer más tarde'}</IconText>
                      </button>
                      {conv.needs_reply ? (
                        <button className="btn btn-secondary" onClick={() => markNoReply(conv, true)} title="Marca la conversación como resuelta: no necesita respuesta (queda registrado quién lo hizo)">
                          <IconText name="check" size={15}>Resolver</IconText>
                        </button>
                      ) : conv.no_reply_by ? (
                        <button className="btn btn-secondary" onClick={() => markNoReply(conv, false)} title="Vuelve a dejarla pendiente">
                          <IconText name="rotate-ccw" size={15}>Reabrir</IconText>
                        </button>
                      ) : null}
                      {!showPanel && mode !== 'wazzup' && (
                        <button className="wa-icon-btn" onClick={() => setPanel(true)} title="Ver ficha del cliente">
                          <Icon name="id-card" size={17} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="wa-head-row">
                    <span className="wa-owner">
                      <Icon name="user" size={14} />
                      Responsable:{' '}
                      {conv.lead_id && can('leads.assign') ? (
                        <select value={conv.assigned_user_id || ''} onChange={(e) => assign(conv, e.target.value)} aria-label="Responsable">
                          <option value="">Sin asignar</option>
                          {users.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <strong>{conv.assigned_user_id ? userMap[conv.assigned_user_id]?.name ?? '' : 'Sin asignar'}</strong>
                      )}
                    </span>
                    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {conv.no_reply_by && (
                        <span className="wa-head-sub" title={new Date(conv.no_reply_at).toLocaleString('es-CO')}>
                          Resuelta por {userMap[conv.no_reply_by]?.name ?? 'un usuario'}
                        </span>
                      )}
                      <span className={`wa-status ${statusOf(conv).key}`}>{statusOf(conv).label}</span>
                      {conv.lead_id && (
                        <a className="wa-link" href={`/leads/${conv.lead_id}`}>
                          Ver lead <Icon name="arrow-right" size={13} />
                        </a>
                      )}
                    </span>
                  </div>
                </header>
              )}
              <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                {mode === 'wazzup' ? (
                  <WazzupFrame conversationId={selected} />
                ) : (
                  <WaThread
                    conversationId={selected}
                    orgId={profile.organization_id}
                    userMap={userMap}
                    canSend={can('whatsapp.send')}
                    leadId={conv?.lead_id ?? null}
                    contactName={conv ? nameOf(conv) : 'Cliente'}
                    showClientBar={false}
                  />
                )}
              </div>
            </>
          )}
        </section>

        {/* ---------------- Ficha del cliente */}
        {showPanel && <WaClientPanel conv={conv} onClose={() => setPanel(false)} />}
      </div>
    </main>
  );
}