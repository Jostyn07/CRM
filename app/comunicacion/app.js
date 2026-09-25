'use client';
// Ruta: app/comunicacion/app.js
// Chat interno (Fase 4): conversaciones 1 a 1 y grupos de la
// organización, en tiempo real. Texto con formato, emojis, stickers,
// imágenes, videos, audios/notas de voz, documentos, respuestas a
// mensajes y reacciones. Los mensajes no se borran; el texto se edita
// durante 15 minutos. Separado de la comunicación con clientes.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '../../lib/supabase/client';
import { useSession } from '../../lib/auth/sessionContext';
import { useOrgUsers } from '../../lib/tasks/useOrgUsers';
import { trackEvent } from '../../lib/activity/tracker';
import { getAvatarColors, getInitials } from '../../components/leads/avatarColor';
import Modal from '../../components/ui/modal';
import MessageBubble from '../../components/chat/messageBubble';
import Composer from '../../components/chat/composer';
import { CreateGroupDialog, GroupInfoDialog } from '../../components/chat/groupDialogs';
import {
  EDIT_MINUTES, MSG_COLS, diaSeparador, editMessage, fechaCorta, getMessages, getReactions, getReads, groupMembers, kindFromMime,
  listConversations, listStickers, markRead, openDirect, saveAsSticker, sendMessage, toggleReaction, uploadChatFile,
} from '../../lib/chat/api';

function Avatar({ name, size = 34, group }) {
  const c = getAvatarColors(name);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: group ? 'var(--color-active-bg)' : c.bg,
        color: group ? 'var(--color-primary)' : c.color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: group ? size * 0.5 : size * 0.34,
        flexShrink: 0,
      }}
    >
      {group ? '👥' : getInitials(name)}
    </div>
  );
}

export default function ComunicacionApp() {
  const { user, profile } = useSession();
  const { users, userMap } = useOrgUsers();
  const router = useRouter();
  const searchParams = useSearchParams();
  const me = user?.id;
  const orgId = profile?.organization_id;

  const [conversations, setConversations] = useState(null);
  const [selectedId, setSelectedId] = useState(searchParams.get('c'));
  const [messages, setMessages] = useState([]);
  const [extraRefs, setExtraRefs] = useState({}); // mensajes citados que no están cargados
  const [reactions, setReactions] = useState({}); // id → [{user_id, emoji}]
  const [reads, setReads] = useState({}); // id → [{user_id, read_at}]
  const [members, setMembers] = useState([]); // [{user_id, joined_at}]
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState(null);
  const [editId, setEditId] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [pendingOther, setPendingOther] = useState(null);
  const [newGroup, setNewGroup] = useState(false);
  const [groupInfo, setGroupInfo] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [toast, setToast] = useState(null);
  const [savedStickers, setSavedStickers] = useState(() => new Set());
  const [notifPerm, setNotifPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'denied');
  const [, setTick] = useState(0);
  const endRef = useRef(null);
  const stickToBottom = useRef(true);

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

  // Stickers que ya tengo guardados (para marcar "Guardado")
  const loadSaved = useCallback(() => {
    listStickers()
      .then((list) => setSavedStickers(new Set(list.map((x) => x.path))))
      .catch(() => {});
  }, []);
  useEffect(() => {
    loadSaved();
  }, [loadSaved]);

  const loadReactions = useCallback(async (ids) => {
    const rows = await getReactions(ids);
    setReactions((prev) => {
      const next = { ...prev };
      for (const id of ids) next[id] = [];
      for (const r of rows) (next[r.message_id] ||= []).push(r);
      return next;
    });
  }, []);

  // "Visto" de mis mensajes
  const loadReads = useCallback(
    async (msgs) => {
      const mine = msgs.filter((m) => m.sender_id === me && m.kind !== 'system').map((m) => m.id);
      if (!mine.length) return;
      const rows = await getReads(mine);
      setReads((prev) => {
        const next = { ...prev };
        for (const id of mine) next[id] = [];
        for (const r of rows) next[r.message_id].push(r);
        return next;
      });
    },
    [me]
  );

  const loadMembers = useCallback(async (id) => {
    try {
      setMembers(await groupMembers(id));
    } catch {
      setMembers([]);
    }
  }, []);

  // Citas de mensajes antiguos que no están en la página cargada
  const ensureRefs = useCallback(async (msgs) => {
    const loaded = new Set(msgs.map((m) => m.id));
    const missing = [...new Set(msgs.map((m) => m.reply_to_id).filter((id) => id && !loaded.has(id)))];
    if (!missing.length) return;
    const { data } = await supabase.from('chat_messages').select(MSG_COLS).in('id', missing);
    if (data?.length) setExtraRefs((prev) => ({ ...prev, ...Object.fromEntries(data.map((m) => [m.id, m])) }));
  }, []);

  const openConversation = useCallback(
    async (id) => {
      setSelectedId(id);
      setEditId(null);
      setReplyTo(null);
      setError(null);
      setReactions({});
      setReads({});
      setMembers([]);
      setExtraRefs({});
      stickToBottom.current = true;
      window.__chatOpenConversation = id;
      const url = new URL(window.location.href);
      url.searchParams.set('c', id);
      router.replace(url.pathname + url.search, { scroll: false });
      try {
        const msgs = await getMessages(id);
        setMessages(msgs);
        setHasMore(msgs.length === 50);
        loadReactions(msgs.map((m) => m.id));
        loadReads(msgs);
        loadMembers(id);
        ensureRefs(msgs);
        await markRead(id);
        loadConversations();
        trackEvent('chat.open', { entityType: 'chat_conversations', entityId: id });
      } catch (e) {
        setError(e.message);
      }
    },
    [router, loadConversations, loadReactions, loadReads, loadMembers, ensureRefs]
  );

  useEffect(() => {
    const initial = searchParams.get('c');
    if (initial) openConversation(initial);
    return () => {
      window.__chatOpenConversation = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tiempo real: mensajes y reacciones
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
          if (payload.eventType === 'INSERT' && m.reply_to_id) ensureRefs([m]);
          if (payload.eventType === 'INSERT' && m.kind === 'system') loadMembers(m.conversation_id);
          if (payload.eventType === 'INSERT' && m.sender_id !== me && document.visibilityState === 'visible') {
            await markRead(m.conversation_id);
          }
        }
        loadConversations();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_message_reads' }, (payload) => {
        const r = payload.new;
        if (!r || r.conversation_id !== window.__chatOpenConversation) return;
        setReads((prev) => {
          if (!(r.message_id in prev)) return prev; // no es un mensaje mío cargado
          if (prev[r.message_id].some((x) => x.user_id === r.user_id)) return prev;
          return { ...prev, [r.message_id]: [...prev[r.message_id], r] };
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_reactions' }, (payload) => {
        const id = payload.new?.message_id ?? payload.old?.message_id;
        if (id) loadReactions([id]);
      })
      .subscribe();
    const timer = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(timer);
    };
  }, [me, loadConversations, loadReactions, loadMembers, ensureRefs]);

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
    if (stickToBottom.current) endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, selectedId]);

  // Si me sacaron del grupo abierto, cerrarlo
  useEffect(() => {
    if (conversations && selectedId && !pendingOther && !conversations.some((c) => c.conversation_id === selectedId)) {
      const t = setTimeout(() => {
        setConversations((cs) => {
          if (cs && !cs.some((c) => c.conversation_id === window.__chatOpenConversation)) {
            setSelectedId(null);
            setMessages([]);
            window.__chatOpenConversation = null;
          }
          return cs;
        });
      }, 1500);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [conversations, selectedId, pendingOther]);

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
    stickToBottom.current = false;
    const older = await getMessages(selectedId, { before: messages[0].created_at });
    setHasMore(older.length === 50);
    setMessages((prev) => [...older, ...prev]);
    loadReactions(older.map((m) => m.id));
    loadReads(older);
    ensureRefs(older);
  }

  const addLocal = (m) => {
    stickToBottom.current = true;
    setReads((prev) => (m.id in prev ? prev : { ...prev, [m.id]: [] }));
    setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
  };

  // Envío: texto, archivos (el comentario va con el primero) o sticker
  async function handleSend({ text, files = [], replyTo: reply, sticker, durationMs }) {
    const conv = selectedId;
    const replyId = reply?.id ?? null;
    if (sticker) {
      addLocal(await sendMessage(conv, { kind: 'sticker', attachment_path: sticker.path, attachment_mime: sticker.mime, reply_to_id: replyId }));
      trackEvent('chat.sticker_sent', { entityType: 'chat_conversations', entityId: conv });
    } else if (files.length) {
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const path = await uploadChatFile(orgId, conv, f);
        addLocal(
          await sendMessage(conv, {
            kind: kindFromMime(f.type),
            body: i === 0 && text ? text : null,
            attachment_path: path,
            attachment_name: f.name,
            attachment_mime: f.type || 'application/octet-stream',
            attachment_size: f.size,
            duration_ms: durationMs ?? null,
            reply_to_id: i === 0 ? replyId : null,
          })
        );
      }
      trackEvent('chat.files_sent', { entityType: 'chat_conversations', entityId: conv, metadata: { count: files.length } });
    } else if (text) {
      addLocal(await sendMessage(conv, { body: text, reply_to_id: replyId }));
    }
    loadConversations();
  }

  async function handleEdit(id, text) {
    const body = text.trim();
    if (!body) return;
    try {
      const m = await editMessage(id, body);
      setMessages((prev) => prev.map((x) => (x.id === id ? m : x)));
      setEditId(null);
      trackEvent('chat.message_edited', { entityType: 'chat_messages', entityId: id });
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleReact(m, emoji, has) {
    try {
      await toggleReaction(m.id, me, emoji, has);
      loadReactions([m.id]);
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleSaveSticker(m) {
    try {
      await saveAsSticker(orgId, me, m.attachment_path);
      setSavedStickers((prev) => new Set(prev).add(m.attachment_path));
      loadSaved();
      setToast('Guardado en tus stickers ⭐');
      setTimeout(() => setToast(null), 2500);
    } catch (e) {
      setError(e.message);
    }
  }

  function jumpTo(id) {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.animate?.([{ opacity: 0.4 }, { opacity: 1 }], { duration: 900 });
  }

  async function enableNotifications() {
    if (typeof Notification === 'undefined') return;
    setNotifPerm(await Notification.requestPermission());
  }

  const conv = conversations?.find((c) => c.conversation_id === selectedId);
  const isGroup = conv?.kind === 'group';
  const otherId = conv?.other_user_id ?? (conv ? null : pendingOther);
  const title = isGroup ? conv.title : userMap[otherId]?.name ?? (otherId ? 'Usuario' : '');
  const nameOf = (c) => (c.kind === 'group' ? c.title : userMap[c.other_user_id]?.name ?? 'Usuario');

  const q = search.trim().toLowerCase();
  const results = useMemo(
    () => (q ? users.filter((u) => u.id !== me && `${u.name} ${u.email}`.toLowerCase().includes(q)).slice(0, 8) : []),
    [q, users, me]
  );
  const byId = useMemo(() => ({ ...extraRefs, ...Object.fromEntries(messages.map((m) => [m.id, m])) }), [messages, extraRefs]);

  if (!profile) return null;

  let lastDay = null;
  let lastSender = null;

  return (
    <main style={{ padding: '1.5rem', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: 8, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: '1.3rem' }}>Comunicación interna</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {notifPerm === 'default' && (
            <button className="btn btn-secondary" onClick={enableNotifications}>
              🔔 Activar avisos
            </button>
          )}
          <button className="btn btn-primary" onClick={() => setNewGroup(true)}>
            👥 Nuevo grupo
          </button>
        </div>
      </div>

      <div className="card" style={{ display: 'grid', gridTemplateColumns: '300px 1fr', height: '74vh', padding: 0, overflow: 'hidden' }}>
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
                Busca a un compañero arriba o crea un grupo para empezar.
              </p>
            ) : (
              conversations.map((c) => {
                const name = nameOf(c);
                const active = c.conversation_id === selectedId;
                const unread = Number(c.unread) || 0;
                const who = c.last_sender_id === me ? 'Tú: ' : c.kind === 'group' && c.last_sender_id ? `${(userMap[c.last_sender_id]?.name ?? '').split(' ')[0]}: ` : '';
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
                    <Avatar name={name} group={c.kind === 'group'} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                        <span style={{ fontWeight: unread ? 700 : 500, fontSize: '0.86rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
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
                          {who}
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
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
          {!selectedId ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: '0.9rem', padding: '1rem', textAlign: 'center' }}>
              Elige una conversación, busca a un compañero o crea un grupo.
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.7rem 1rem', borderBottom: '1px solid var(--color-border)' }}>
                {title && <Avatar name={title} size={32} group={isGroup} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ fontSize: '0.95rem' }}>{title}</strong>
                  {isGroup && <div style={{ fontSize: '0.74rem', color: 'var(--color-text-muted)' }}>{conv.member_count} miembros</div>}
                </div>
                {isGroup && (
                  <button className="btn btn-secondary" onClick={() => setGroupInfo(true)}>
                    Info del grupo
                  </button>
                )}
              </div>

              <div
                style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '0.8rem 1.4rem', display: 'flex', flexDirection: 'column', gap: 6 }}
                onScroll={(e) => {
                  const el = e.currentTarget;
                  stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
                }}
              >
                {hasMore && (
                  <button className="btn btn-secondary" style={{ alignSelf: 'center', marginBottom: 8 }} onClick={loadOlder}>
                    Ver mensajes anteriores
                  </button>
                )}
                {messages.length === 0 && (
                  <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem', marginTop: '2rem' }}>Escribe el primer mensaje.</p>
                )}
                {messages.map((m) => {
                  const day = diaSeparador(m.created_at);
                  const showDay = day !== lastDay;
                  const showSender = isGroup && (showDay || lastSender !== m.sender_id) && m.kind !== 'system';
                  lastDay = day;
                  lastSender = m.kind === 'system' ? null : m.sender_id;
                  return (
                    <div key={m.id} style={{ display: 'contents' }}>
                      {showDay && (
                        <div style={{ alignSelf: 'center', fontSize: '0.72rem', color: 'var(--color-text-muted)', margin: '0.5rem 0', textTransform: 'capitalize' }}>{day}</div>
                      )}
                      <MessageBubble
                        m={m}
                        me={me}
                        userMap={userMap}
                        showSender={showSender}
                        replyTo={m.reply_to_id ? byId[m.reply_to_id] : null}
                        reactions={reactions[m.id]}
                        editing={editId === m.id}
                        onReply={setReplyTo}
                        onReact={handleReact}
                        onStartEdit={(msg) => setEditId(msg.id)}
                        onCancelEdit={() => setEditId(null)}
                        onSaveEdit={handleEdit}
                        onSaveSticker={handleSaveSticker}
                        stickerSaved={savedStickers.has(m.attachment_path)}
                        isGroup={isGroup}
                        readInfo={
                          m.sender_id === me && m.kind !== 'system'
                            ? {
                                recipients: members
                                  .filter((x) => x.user_id !== me && new Date(x.joined_at) <= new Date(m.created_at))
                                  .map((x) => x.user_id),
                                reads: reads[m.id] ?? [],
                              }
                            : null
                        }
                        onJumpTo={jumpTo}
                        onOpenImage={setLightbox}
                      />
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>

              {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.82rem', padding: '0 1rem' }}>{error}</p>}
              <Composer orgId={orgId} userId={me} userMap={userMap} replyTo={replyTo} onCancelReply={() => setReplyTo(null)} onSend={handleSend} />
            </>
          )}
        </div>
      </div>
      <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 8 }}>
        Formato: *negrita*, _cursiva_, ++subrayado++, ~tachado~. Puedes arrastrar o pegar archivos (máx. 50 MB). Los mensajes no se borran y solo puedes editar
        los tuyos durante {EDIT_MINUTES} minutos. Los administradores pueden revisar las conversaciones.
      </p>

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.8)', color: '#fff', padding: '8px 16px', borderRadius: 999, fontSize: '0.85rem', zIndex: 60 }}>
          {toast}
        </div>
      )}

      <CreateGroupDialog
        open={newGroup}
        onClose={() => setNewGroup(false)}
        users={users}
        me={me}
        onCreated={async (id) => {
          setNewGroup(false);
          trackEvent('chat.group_created', { entityType: 'chat_conversations', entityId: id });
          await loadConversations();
          openConversation(id);
        }}
      />
      <GroupInfoDialog
        open={groupInfo}
        onClose={() => setGroupInfo(false)}
        conversation={conv}
        users={users}
        userMap={userMap}
        me={me}
        onChanged={loadConversations}
        onLeft={() => {
          setGroupInfo(false);
          setSelectedId(null);
          setMessages([]);
          window.__chatOpenConversation = null;
          loadConversations();
        }}
      />
      <Modal open={!!lightbox} onClose={() => setLightbox(null)} title="Imagen" width={900}>
        {lightbox && (
          <div style={{ textAlign: 'center' }}>
            <img src={lightbox} alt="" style={{ maxWidth: '100%', maxHeight: '75vh', borderRadius: 8 }} />
            <div style={{ marginTop: 8 }}>
              <a className="btn btn-secondary" href={lightbox} target="_blank" rel="noopener noreferrer">
                Abrir en otra pestaña
              </a>
            </div>
          </div>
        )}
      </Modal>
    </main>
  );
}