'use client';
// Ruta: app/comunicacion/app.js
// Chat interno 1 a 1 (Fase 4): cualquier usuario de la organización,
// en tiempo real, con no leídos, edición por 15 minutos y sin borrado.
// Separado de la comunicación con clientes (WhatsApp).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '../../lib/supabase/client';
import { useSession } from '../../lib/auth/sessionContext';
import { useOrgUsers } from '../../lib/tasks/useOrgUsers';
import { trackEvent } from '../../lib/activity/tracker';
import { getAvatarColors, getInitials } from '../../components/leads/avatarColor';
import {
  EDIT_MINUTES, canEditMessage, diaSeparador, editMessage, fechaCorta, getMessages, hora,
  listConversations, markRead, openDirect, sendMessage,
} from '../../lib/chat/api';

function Avatar({ name, size = 34 }) {
  const c = getAvatarColors(name);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: c.bg,
        color: c.color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: size * 0.34,
        flexShrink: 0,
      }}
    >
      {getInitials(name)}
    </div>
  );
}

export default function ComunicacionApp() {
  const { user, profile } = useSession();
  const { users, userMap } = useOrgUsers();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [conversations, setConversations] = useState(null);
  const [selectedId, setSelectedId] = useState(searchParams.get('c'));
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const [editId, setEditId] = useState(null);
  const [pendingOther, setPendingOther] = useState(null);
  const [editText, setEditText] = useState('');
  const [notifPerm, setNotifPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'denied');
  const [, setTick] = useState(0);
  const endRef = useRef(null);

  const me = user?.id;

  const loadConversations = useCallback(async () => {
    try {
      setConversations(await listConversations());
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Conversación abierta: mensajes + marcar leído
  const openConversation = useCallback(
    async (id) => {
      setSelectedId(id);
      setEditId(null);
      setError(null);
      window.__chatOpenConversation = id;
      const url = new URL(window.location.href);
      url.searchParams.set('c', id);
      router.replace(url.pathname + url.search, { scroll: false });
      try {
        const msgs = await getMessages(id);
        setMessages(msgs);
        setHasMore(msgs.length === 50);
        await markRead(id);
        loadConversations();
        trackEvent('chat.open', { entityType: 'chat_conversations', entityId: id });
      } catch (e) {
        setError(e.message);
      }
    },
    [router, loadConversations]
  );

  useEffect(() => {
    const initial = searchParams.get('c');
    if (initial) openConversation(initial);
    return () => {
      window.__chatOpenConversation = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tiempo real: mensajes nuevos o editados
  useEffect(() => {
    if (!me) return undefined;
    const channel = supabase
      .channel(`chat-page-${me}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, async (payload) => {
        const m = payload.new;
        if (m?.conversation_id && m.conversation_id === window.__chatOpenConversation) {
          setMessages((prev) => {
            const i = prev.findIndex((x) => x.id === m.id);
            if (i === -1) return [...prev, m];
            const next = prev.slice();
            next[i] = m;
            return next;
          });
          if (payload.eventType === 'INSERT' && m.sender_id !== me && document.visibilityState === 'visible') {
            await markRead(m.conversation_id);
          }
        }
        loadConversations();
      })
      .subscribe();
    const timer = setInterval(() => setTick((t) => t + 1), 30_000); // oculta "Editar" al pasar 15 min
    return () => {
      supabase.removeChannel(channel);
      clearInterval(timer);
    };
  }, [me, loadConversations]);

  // Al volver a la pestaña, marcar leído lo que llegó mientras tanto
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && window.__chatOpenConversation) {
        markRead(window.__chatOpenConversation).then(loadConversations);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [loadConversations]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, selectedId]);

  async function startWith(userId) {
    setSearch('');
    try {
      const id = await openDirect(userId);
      setPendingOther(userId);
      trackEvent('chat.start', { entityType: 'chat_conversations', entityId: id, metadata: { with: userId } });
      await openConversation(id);
    } catch (e) {
      setError(e.message);
    }
  }

  async function loadOlder() {
    if (!messages.length) return;
    const older = await getMessages(selectedId, { before: messages[0].created_at });
    setHasMore(older.length === 50);
    setMessages((prev) => [...older, ...prev]);
  }

  async function send(e) {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || !selectedId) return;
    setSending(true);
    setError(null);
    try {
      const m = await sendMessage(selectedId, text);
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      setDraft('');
      loadConversations();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  async function saveEdit(id) {
    const text = editText.trim();
    if (!text) return;
    try {
      const m = await editMessage(id, text);
      setMessages((prev) => prev.map((x) => (x.id === id ? m : x)));
      setEditId(null);
      trackEvent('chat.message_edited', { entityType: 'chat_messages', entityId: id });
    } catch (err) {
      setError(err.message);
    }
  }

  async function enableNotifications() {
    if (typeof Notification === 'undefined') return;
    setNotifPerm(await Notification.requestPermission());
  }

  const conv = conversations?.find((c) => c.conversation_id === selectedId);
  const otherId = conv?.other_user_id ?? pendingOther;
  const otherName = userMap[otherId]?.name ?? (otherId ? 'Usuario' : '');

  const q = search.trim().toLowerCase();
  const results = useMemo(
    () => (q ? users.filter((u) => u.id !== me && `${u.name} ${u.email}`.toLowerCase().includes(q)).slice(0, 8) : []),
    [q, users, me]
  );

  if (!profile) return null;

  let lastDay = null;

  return (
    <main style={{ padding: '1.5rem', maxWidth: 1150, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: 8, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: '1.3rem' }}>Comunicación interna</h1>
        {notifPerm === 'default' && (
          <button className="btn btn-secondary" onClick={enableNotifications}>
            🔔 Activar avisos de mensajes
          </button>
        )}
      </div>

      <div className="card" style={{ display: 'grid', gridTemplateColumns: '300px 1fr', height: '72vh', padding: 0, overflow: 'hidden' }}>
        {/* Lista */}
        <div style={{ borderRight: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: '0.75rem', borderBottom: '1px solid var(--color-border)', position: 'relative' }}>
            <input className="input" placeholder="Buscar compañero para escribirle…" value={search} onChange={(e) => setSearch(e.target.value)} />
            {results.length > 0 && (
              <div className="card" style={{ position: 'absolute', left: 12, right: 12, top: '100%', zIndex: 5, padding: 4, marginTop: 4 }}>
                {results.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => startWith(u.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '0.45rem', background: 'none', border: 'none', color: 'var(--color-text)', cursor: 'pointer', textAlign: 'left', borderRadius: 'var(--radius)' }}
                  >
                    <Avatar name={u.name} size={26} />
                    <span style={{ fontSize: '0.85rem' }}>{u.name}</span>
                  </button>
                ))}
              </div>
            )}
            {q && results.length === 0 && <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: 6 }}>Sin resultados.</p>}
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {!conversations ? (
              <p style={{ padding: '1rem', fontSize: '0.85rem' }}>Cargando…</p>
            ) : conversations.length === 0 ? (
              <p style={{ padding: '1rem', fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
                Busca a un compañero arriba para empezar una conversación.
              </p>
            ) : (
              conversations.map((c) => {
                const name = userMap[c.other_user_id]?.name ?? 'Usuario';
                const active = c.conversation_id === selectedId;
                const unread = Number(c.unread) || 0;
                return (
                  <button
                    key={c.conversation_id}
                    onClick={() => openConversation(c.conversation_id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      width: '100%',
                      padding: '0.65rem 0.75rem',
                      background: active ? 'var(--color-active-bg)' : 'transparent',
                      border: 'none',
                      borderBottom: '1px solid var(--color-border)',
                      textAlign: 'left',
                      color: 'var(--color-text)',
                      cursor: 'pointer',
                    }}
                  >
                    <Avatar name={name} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                        <span style={{ fontWeight: unread ? 700 : 500, fontSize: '0.86rem' }}>{name}</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', flexShrink: 0 }}>{fechaCorta(c.last_message_at)}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span
                          style={{
                            flex: 1,
                            fontSize: '0.78rem',
                            color: unread ? 'var(--color-text)' : 'var(--color-text-muted)',
                            fontWeight: unread ? 600 : 400,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {c.last_sender_id === me ? 'Tú: ' : ''}
                          {c.last_message_preview}
                        </span>
                        {unread > 0 && (
                          <span style={{ minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999, background: 'var(--color-primary)', color: '#fff', fontSize: '0.68rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                            {unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Hilo */}
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {!selectedId ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: '0.9rem', padding: '1rem', textAlign: 'center' }}>
              Elige una conversación o busca a un compañero para escribirle.
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.7rem 1rem', borderBottom: '1px solid var(--color-border)' }}>
                {otherName && <Avatar name={otherName} size={32} />}
                <strong style={{ fontSize: '0.95rem' }}>{otherName}</strong>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '0.8rem 1rem', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {hasMore && (
                  <button className="btn btn-secondary" style={{ alignSelf: 'center', marginBottom: 8 }} onClick={loadOlder}>
                    Ver mensajes anteriores
                  </button>
                )}
                {messages.length === 0 && (
                  <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem', marginTop: '2rem' }}>
                    Escribe el primer mensaje.
                  </p>
                )}
                {messages.map((m) => {
                  const mine = m.sender_id === me;
                  const day = diaSeparador(m.created_at);
                  const showDay = day !== lastDay;
                  lastDay = day;
                  return (
                    <div key={m.id} style={{ display: 'contents' }}>
                      {showDay && (
                        <div style={{ alignSelf: 'center', fontSize: '0.72rem', color: 'var(--color-text-muted)', margin: '0.5rem 0', textTransform: 'capitalize' }}>{day}</div>
                      )}
                      <div
                        style={{
                          alignSelf: mine ? 'flex-end' : 'flex-start',
                          maxWidth: '72%',
                          padding: '0.5rem 0.75rem',
                          borderRadius: 12,
                          borderBottomRightRadius: mine ? 4 : 12,
                          borderBottomLeftRadius: mine ? 12 : 4,
                          background: mine ? 'var(--color-primary)' : 'var(--color-active-bg)',
                          color: mine ? '#fff' : 'var(--color-text)',
                          fontSize: '0.88rem',
                        }}
                      >
                        {editId === m.id ? (
                          <div style={{ display: 'grid', gap: 6, minWidth: 240 }}>
                            <textarea
                              className="input"
                              rows={2}
                              value={editText}
                              autoFocus
                              onChange={(e) => setEditText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault();
                                  saveEdit(m.id);
                                }
                                if (e.key === 'Escape') setEditId(null);
                              }}
                            />
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                              <button className="btn btn-secondary" onClick={() => setEditId(null)}>
                                Cancelar
                              </button>
                              <button className="btn btn-secondary" onClick={() => saveEdit(m.id)}>
                                Guardar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.body}</div>
                        )}
                        <div style={{ fontSize: '0.66rem', opacity: 0.75, textAlign: 'right', marginTop: 2, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                          {m.edited_at && <span>editado</span>}
                          <span>{hora(m.created_at)}</span>
                          {canEditMessage(m, me) && editId !== m.id && (
                            <button
                              onClick={() => {
                                setEditId(m.id);
                                setEditText(m.body);
                              }}
                              title={`Puedes editar durante ${EDIT_MINUTES} minutos`}
                              style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '0.66rem', textDecoration: 'underline', padding: 0 }}
                            >
                              Editar
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>

              {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.82rem', padding: '0 1rem' }}>{error}</p>}
              <form onSubmit={send} style={{ display: 'flex', gap: 8, padding: '0.7rem 1rem', borderTop: '1px solid var(--color-border)', alignItems: 'flex-end' }}>
                <textarea
                  className="input"
                  rows={1}
                  placeholder="Escribe un mensaje…  (Enter para enviar, Shift + Enter para salto de línea)"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  style={{ flex: 1, resize: 'none', minHeight: 40, maxHeight: 140 }}
                />
                <button className="btn btn-primary" disabled={sending || !draft.trim()}>
                  Enviar
                </button>
              </form>
            </>
          )}
        </div>
      </div>
      <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 8 }}>
        Los mensajes no se pueden borrar y solo puedes editar los tuyos durante {EDIT_MINUTES} minutos. Los administradores pueden revisar las conversaciones.
      </p>
    </main>
  );
}