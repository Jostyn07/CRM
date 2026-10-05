'use client';
// Ruta: app/comunicacion/app.js
// Chat interno (Fase 4): conversaciones 1 a 1 y grupos de la
// organización, en tiempo real. Texto con formato, emojis, stickers,
// imágenes, videos, audios/notas de voz, documentos, respuestas a
// mensajes y reacciones. El autor puede borrar sus mensajes; el texto se edita
// durante 15 minutos. Separado de la comunicación con clientes.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '../../lib/supabase/client';
import { useSession } from '../../lib/auth/sessionContext';
import { useOrgUsers } from '../../lib/tasks/useOrgUsers';
import { trackEvent } from '../../lib/activity/tracker';
import { getAvatarColors, getInitials } from '../../components/leads/avatarColor';
import Icon, { IconText } from '../../components/ui/icon';
import MessageBubble from '../../components/chat/messageBubble';
import Composer from '../../components/chat/composer';
import { CreateGroupDialog, GroupInfoDialog } from '../../components/chat/groupDialogs';
import ForwardDialog from '../../components/chat/forwardDialog';
import {
  EDIT_MINUTES, MSG_COLS, diaSeparador, hora, useSignedUrl, editMessage, fechaCorta, getMessages, getReactions, getReads, groupMembers, kindFromMime,
  clearChat, deleteMessage, listConversations, listStickers, markRead, openDirect, openNotes, setNoReply, setReadLater, saveAsSticker, sendMessage, toggleReaction, uploadChatFile,
} from '../../lib/chat/api';
import { playSent } from '../../lib/sounds';
import SoundToggle from '../../components/ui/soundToggle';
import CardMenu from '../../components/ui/cardMenu';
import FileDropZone from '../../components/ui/fileDropZone';
import ImageViewer from '../../components/chat/imageViewer';

function Avatar({ name, size = 34, group, icon }) {
  const c = getAvatarColors(name);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: group || icon ? 'var(--color-active-bg)' : c.bg,
        color: group || icon ? 'var(--color-primary)' : c.color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: group ? size * 0.5 : size * 0.34,
        flexShrink: 0,
      }}
    >
      {icon ? <Icon name={icon} size={Math.round(size * 0.5)} /> : group ? <Icon name="users" size={Math.round(size * 0.5)} /> : getInitials(name)}
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
  const [dropped, setDropped] = useState(null); // archivos soltados en el chat
  const convsRef = useRef([]);
  convsRef.current = conversations || [];
  const [messages, setMessages] = useState([]);
  const [extraRefs, setExtraRefs] = useState({}); // mensajes citados que no están cargados
  const [reactions, setReactions] = useState({}); // id → [{user_id, emoji}]
  const [reads, setReads] = useState({}); // id → [{user_id, read_at}]
  const [members, setMembers] = useState([]); // [{user_id, joined_at}]
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('chats');
  const searchRef = useRef(null);
  const [error, setError] = useState(null);
  const [editId, setEditId] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [pendingOther, setPendingOther] = useState(null);
  const [newGroup, setNewGroup] = useState(false);
  const [groupInfo, setGroupInfo] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [toast, setToast] = useState(null);
  const [forwardMsg, setForwardMsg] = useState(null);
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

  // Usuarios creados antes de las Notas: se crean la primera vez
  useEffect(() => {
    if (conversations && !conversations.some((c) => c.kind === 'notes')) {
      openNotes()
        .then(() => loadConversations())
        .catch(() => {});
    }
  }, [conversations, loadConversations]);

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
      const list = await groupMembers(id);
      if (window.__chatOpenConversation === id) setMembers(list);
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
        const clearedAt = convsRef.current.find((x) => x.conversation_id === id)?.cleared_at;
        const msgs = await getMessages(id, { after: clearedAt || undefined });
        // Si mientras cargaba se abrió otro chat, esta respuesta se descarta
        if (window.__chatOpenConversation !== id) return;
        setMessages(msgs);
        setHasMore(msgs.hasMore);
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
        const cleared = convsRef.current.find((x) => x.conversation_id === m?.conversation_id)?.cleared_at;
        if (m?.conversation_id && m.conversation_id === window.__chatOpenConversation && !(cleared && m.created_at <= cleared)) {
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

  const loadingOlder = useRef(false);
  const listRef = useRef(null);
  async function loadOlder() {
    if (!messages.length || loadingOlder.current) return;
    loadingOlder.current = true;
    stickToBottom.current = false;
    const el = listRef.current;
    const prevHeight = el ? el.scrollHeight : 0;
    try {
      const clearedAt = convsRef.current.find((x) => x.conversation_id === selectedId)?.cleared_at;
      const id = selectedId;
      const older = await getMessages(id, { before: messages[0].created_at, after: clearedAt || undefined });
      if (window.__chatOpenConversation !== id) return;
      setHasMore(older.hasMore);
      setMessages((prev) => [...older.filter((o) => !prev.some((p) => p.id === o.id)), ...prev]);
      loadReactions(older.map((m) => m.id));
      loadReads(older);
      ensureRefs(older);
      // Mantiene la vista en el mismo mensaje (no salta)
      requestAnimationFrame(() => {
        if (el) el.scrollTop += el.scrollHeight - prevHeight;
      });
    } catch (e) {
      setError(e.message);
    } finally {
      loadingOlder.current = false;
    }
  }

  const addLocal = (m) => {
    // Un envío lento no debe aparecer en otro chat que se abrió después
    if (m?.conversation_id && m.conversation_id !== window.__chatOpenConversation) return;
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
    playSent();
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

  async function handleDelete(m) {
    if (!window.confirm('¿Eliminar este mensaje? Los demás verán "Mensaje eliminado".')) return;
    try {
      await deleteMessage(m.id);
      setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, deleted_at: new Date().toISOString(), body: null, attachment_path: null } : x)));
      loadConversations();
      trackEvent('chat.message_deleted', { entityType: 'chat_messages', entityId: m.id });
    } catch (e) {
      setError(e.message);
    }
  }

  // Leer más tarde: se cierra el chat para que la marca no se quite al leer
  async function handleReadLater(c, on) {
    try {
      await setReadLater(c.conversation_id, on);
      if (on && c.conversation_id === selectedId) closeConversation();
      setToast(on ? 'Marcado para leer más tarde' : 'Quitado de leer más tarde');
      setTimeout(() => setToast(null), 2500);
      loadConversations();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleNoReply(c, on = true) {
    try {
      await setNoReply(c.conversation_id, on);
      loadConversations();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleClearChat(c) {
    if (!window.confirm('¿Borrar este chat? Se borra solo para ti; los demás lo seguirán viendo.')) return;
    try {
      await clearChat(c.conversation_id);
      if (c.conversation_id === selectedId) {
        if (c.kind === 'direct') closeConversation();
        else setMessages([]);
      }
      setToast('Chat borrado');
      setTimeout(() => setToast(null), 2500);
      loadConversations();
      trackEvent('chat.cleared', { entityType: 'chat_conversations', entityId: c.conversation_id });
    } catch (e) {
      setError(e.message);
    }
  }

  function closeConversation() {
    setSelectedId(null);
    setMessages([]);
    window.__chatOpenConversation = null;
    const url = new URL(window.location.href);
    url.searchParams.delete('c');
    router.replace(url.pathname + url.search, { scroll: false });
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
      setToast('Guardado en tus stickers');
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
  const isNotes = conv?.kind === 'notes';
  const otherId = conv?.other_user_id ?? (conv ? null : pendingOther);
  const title = isNotes ? 'Notas' : isGroup ? conv.title : userMap[otherId]?.name ?? (otherId ? 'Usuario' : '');
  const nameOf = (c) => (c.kind === 'notes' ? 'Notas' : c.kind === 'group' ? c.title : userMap[c.other_user_id]?.name ?? 'Usuario');
  // Ícono: Notas, grupo General, grupo de sucursal
  const iconOf = (c) => (c?.kind === 'notes' ? 'notebook-pen' : c?.system_key === 'org' ? 'building-2' : c?.system_key ? 'map-pin' : null);

  const q = search.trim().toLowerCase();
  const results = useMemo(
    () => (q ? users.filter((u) => u.id !== me && `${u.name} ${u.email}`.toLowerCase().includes(q)).slice(0, 8) : []),
    [q, users, me]
  );
  const byId = useMemo(() => ({ ...extraRefs, ...Object.fromEntries(messages.map((m) => [m.id, m])) }), [messages, extraRefs]);

  if (!profile) return null;

  let lastDay = null;
  let lastSender = null;

  const initials = (n) =>
    String(n || '')
      .replace(/[^\p{L}\s]/gu, ' ')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('') || '?';
  const exit = () => {
    let back = '/dashboard';
    try {
      const saved = sessionStorage.getItem('xiris.lastPath');
      // Nunca volver a una pantalla completa (evita que la X "no haga nada")
      if (saved && !/^\/(comunicacion|whatsapp)(\/|\?|$)/.test(saved)) back = saved;
    } catch {}
    router.push(back);
  };
  const tabCount = {
    chats: (conversations ?? []).filter((c) => c.kind !== 'group').length,
    groups: (conversations ?? []).filter((c) => c.kind === 'group').length,
    saved: (conversations ?? []).filter((c) => c.read_later).length,
  };
  const visibles = (conversations ?? []).filter((c) =>
    tab === 'groups' ? c.kind === 'group' : tab === 'saved' ? c.read_later : c.kind !== 'group'
  );

  return (
    <main className="cm-page">
      <header className="wa-topbar">
        <div className="wa-topbar-brand">
          <span className="wa-topbar-logo">
            <Icon name="message-square" size={18} />
          </span>
          <strong>Comunicación interna</strong>
          <span className="wa-topbar-sep" />
          <span className="wa-topbar-sub">Equipo</span>
        </div>
        <div className="wa-page-tools">
          <SoundToggle />
          {notifPerm === 'default' && (
            <button className="btn btn-secondary" onClick={enableNotifications}>
              <IconText name="bell" size={16}>Activar avisos</IconText>
            </button>
          )}
          <span className="wa-topbar-avatar" title={profile.full_name || ''}>
            {initials(profile.full_name)}
          </span>
          <button type="button" className="wa-topbar-close" onClick={exit} title="Salir de Comunicación interna" aria-label="Salir">
            <Icon name="x" size={20} />
          </button>
        </div>
      </header>

      <div className="cm-head">
        <div>
          <h1>Comunicación interna</h1>
          <p>Un espacio para conversar, compartir y trabajar en equipo.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => setNewGroup(true)}>
            <IconText name="users" size={16}>Nuevo grupo</IconText>
          </button>
          <button className="btn cm-btn-gold" onClick={() => searchRef.current?.focus()}>
            <IconText name="plus" size={16}>Nuevo chat</IconText>
          </button>
        </div>
      </div>

      <div className="cm-layout">
        {/* Lista */}
        <section className="card cm-list">
          <div className="cm-list-top">
            <strong className="cm-list-title">Conversaciones</strong>
            <div className="cm-search">
              <Icon name="search" size={16} />
              <input ref={searchRef} placeholder="Buscar compañero para escribirle…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            {results.length > 0 && (
              <div className="card cm-results">
                {results.map((u) => (
                  <button key={u.id} onClick={() => startWith(u.id)} className="cm-result">
                    <Avatar name={u.name} size={26} />
                    <span>{u.name}</span>
                  </button>
                ))}
              </div>
            )}
            {q && results.length === 0 && <p className="cm-muted" style={{ marginTop: 6 }}>Sin resultados.</p>}
            <div className="cm-tabs" role="tablist">
              {[
                ['chats', 'Chats'],
                ['groups', 'Grupos'],
                ['saved', 'Guardados'],
              ].map(([k, l]) => (
                <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>
                  {l}
                  <span>{tabCount[k]}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="cm-items">
            {!conversations ? (
              <p className="cm-muted" style={{ padding: '1rem' }}>Cargando…</p>
            ) : visibles.length === 0 ? (
              <p className="cm-muted" style={{ padding: '1rem' }}>
                {tab === 'saved' ? 'No tienes conversaciones guardadas para leer más tarde.' : tab === 'groups' ? 'Aún no perteneces a ningún grupo.' : 'Busca a un compañero arriba o crea un grupo para empezar.'}
              </p>
            ) : (
              visibles.map((c) => {
                const name = nameOf(c);
                const active = c.conversation_id === selectedId;
                const unread = Number(c.unread) || 0;
                const who = c.last_sender_id === me ? 'Tú: ' : c.kind === 'group' && c.last_sender_id ? `${(userMap[c.last_sender_id]?.name ?? '').split(' ')[0]}: ` : '';
                return (
                  <button key={c.conversation_id} onClick={() => openConversation(c.conversation_id)} className={`cm-item${active ? ' active' : ''}${unread ? ' unread' : ''}`}>
                    <Avatar name={name} group={c.kind === 'group'} icon={iconOf(c)} />
                    <div className="cm-item-body">
                      <div className="cm-item-row">
                        <span className="cm-item-name">{name}</span>
                        <span className="cm-item-time">{fechaCorta(c.last_message_at)}</span>
                      </div>
                      <div className="cm-item-row">
                        <span className="cm-item-prev">
                          {c.kind === 'notes' && !c.last_message_preview ? 'Solo tú puedes ver tus notas' : (
                            <>
                              {c.kind === 'notes' ? '' : who}
                              {c.last_message_preview}
                            </>
                          )}
                        </span>
                        {c.read_later && <Icon name="bookmark" size={13} style={{ color: '#c99a3d', flexShrink: 0 }} title="Leer más tarde" />}
                        {unread > 0 && <span className="cm-unread">{unread}</span>}
                      </div>
                      {c.needs_reply && (
                        <span className="cm-pending" title="Te escribió y aún no le contestas">
                          <Icon name="clock" size={12} /> Pendiente de respuesta
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
          <footer className="cm-list-foot">
            <Icon name="arrow-up-down" size={13} /> Ordenadas por actividad reciente
          </footer>
        </section>

        {/* Hilo (se pueden soltar archivos en cualquier parte) */}
        <FileDropZone
          disabled={!selectedId}
          hint="Máximo 50 MB por archivo"
          onFiles={(files) => setDropped({ files, n: Date.now() })}
          className="card cm-thread"
        >
          {!selectedId ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: '0.9rem', padding: '1rem', textAlign: 'center' }}>
              Elige una conversación, busca a un compañero o crea un grupo.
            </div>
          ) : (
            <>
              <div className="cm-thread-head">
                {title && <Avatar name={title} size={40} group={isGroup} icon={iconOf(conv)} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ fontSize: '1rem' }}>{title}</strong>
                  {!isGroup && !isNotes && <div className="cm-muted">Conversación interna</div>}
                  {isGroup && (
                    <div style={{ fontSize: '0.74rem', color: 'var(--color-text-muted)' }}>
                      {conv.member_count} miembros{conv.system_key ? ' · grupo automático' : ''}
                    </div>
                  )}
                  {isNotes && (
                    <div style={{ fontSize: '0.74rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Icon name="lock" size={12} /> Privado: solo tú puedes ver tus notas
                    </div>
                  )}
                </div>
                {isGroup && (
                  <button className="cm-chip" onClick={() => setGroupInfo(true)}>
                    Info del grupo
                  </button>
                )}
                {conv?.needs_reply && (
                  <button className="cm-chip" onClick={() => handleNoReply(conv, true)} title="Quita la marca de pendiente por responder">
                    <IconText name="check" size={15}>No necesita respuesta</IconText>
                  </button>
                )}
                {conv && (
                  <CardMenu
                    items={[
                      conv.read_later
                        ? { label: 'Quitar de leer más tarde', onClick: () => handleReadLater(conv, false) }
                        : { label: 'Marcar para leer más tarde', onClick: () => handleReadLater(conv, true) },
                      { label: 'Borrar chat', danger: true, onClick: () => handleClearChat(conv) },
                    ]}
                  />
                )}
              </div>

              <div
                style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '0.8rem 1.4rem', display: 'flex', flexDirection: 'column', gap: 6 }}
                ref={listRef}
                onScroll={(e) => {
                  const el = e.currentTarget;
                  stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
                  // Al llegar arriba se cargan solos los mensajes anteriores
                  if (el.scrollTop < 60 && hasMore) loadOlder();
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
                        onDelete={handleDelete}
                        onSaveSticker={handleSaveSticker}
                        onForward={setForwardMsg}
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
                        onOpenImage={(m) => setLightbox(m.id)}
                      />
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>

              {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.82rem', padding: '0 1rem' }}>{error}</p>}
              <Composer orgId={orgId} userId={me} userMap={userMap} replyTo={replyTo} onCancelReply={() => setReplyTo(null)} onSend={handleSend} droppedFiles={dropped} />
            </>
          )}
          <footer className="cm-thread-foot">
            <Icon name="info" size={13} />
            <span>
              Formato: *negrita*, _cursiva_, ++subrayado++, ~tachado~. Puedes arrastrar o pegar archivos (máx. 50 MB). Puedes eliminar tus mensajes (los demás verán "Mensaje eliminado") y
              editarlos durante {EDIT_MINUTES} minutos. Los administradores pueden revisar las conversaciones.
            </span>
          </footer>
        </FileDropZone>
      </div>

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
      <ForwardDialog
        message={forwardMsg}
        onClose={() => setForwardMsg(null)}
        conversations={conversations}
        users={users}
        userMap={userMap}
        me={me}
        orgId={orgId}
        onDone={(n) => {
          playSent();
          trackEvent('chat.forward', { entityType: 'chat_messages', entityId: forwardMsg?.id, metadata: { targets: n } });
          setForwardMsg(null);
          setToast(n > 1 ? `Reenviado a ${n} chats` : 'Reenviado');
          setTimeout(() => setToast(null), 2500);
          loadConversations();
        }}
      />
      {lightbox && (
        <ImageViewer
          items={messages
            .filter((x) => x.kind === 'image' && x.attachment_path && !x.deleted_at)
            .map((x) => ({
              id: x.id,
              src: x.attachment_path,
              title: x.sender_id === me ? 'Tú' : userMap[x.sender_id]?.name ?? 'Usuario',
              subtitle: `${new Date(x.created_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })} · ${hora(x.created_at)}`,
              caption: x.body,
            }))}
          startId={lightbox}
          useUrl={useSignedUrl}
          onClose={() => setLightbox(null)}
        />
      )}
    </main>
  );
}