'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase/client';
import { getInitials, getAvatarColors } from '../../components/leads/avatarColor';
import Input from '../../components/ui/input';

function formatHora(iso) {
  return new Date(iso).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatPreviewFecha(iso) {
  const d = new Date(iso);
  const hoy = new Date();
  const esHoy = d.toDateString() === hoy.toDateString();
  return esHoy ? formatHora(iso) : d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' });
}

export default function ComunicacionPage() {
  const [myId, setMyId] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [errorMsg, setErrorMsg] = useState(null);
  const [sending, setSending] = useState(false);

  const messagesEndRef = useRef(null);

  useEffect(() => {
    init();
  }, []);

  async function init() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    setMyId(user.id);
    await loadConversations(user.id);
  }

  async function loadConversations(currentUserId) {
    const uid = currentUserId || myId;
    if (!uid) return;

    const { data: myMemberships } = await supabase
      .from('conversation_members')
      .select('conversation_id, last_read_at')
      .eq('user_id', uid);

    const ids = (myMemberships ?? []).map((m) => m.conversation_id);
    if (ids.length === 0) {
      setConversations([]);
      return;
    }

    const [{ data: otherMembers }, { data: recentMessages }] = await Promise.all([
      supabase.from('conversation_members').select('conversation_id, user_id, profiles ( full_name )').in('conversation_id', ids).neq('user_id', uid),
      supabase.from('messages').select('conversation_id, sender_id, content, created_at').in('conversation_id', ids).order('created_at', { ascending: false }),
    ]);

    const lastByConv = {};
    (recentMessages ?? []).forEach((m) => {
      if (!lastByConv[m.conversation_id]) lastByConv[m.conversation_id] = m;
    });

    const otherByConv = {};
    (otherMembers ?? []).forEach((m) => {
      otherByConv[m.conversation_id] = m;
    });

    const list = (myMemberships ?? [])
      .map((m) => {
        const other = otherByConv[m.conversation_id];
        const last = lastByConv[m.conversation_id];
        const unread = !!(last && last.sender_id !== uid && (!m.last_read_at || new Date(last.created_at) > new Date(m.last_read_at)));
        return {
          conversationId: m.conversation_id,
          otherName: other?.profiles?.full_name || 'Usuario',
          lastMessage: last?.content || null,
          lastAt: last?.created_at || null,
          unread,
        };
      })
      .sort((a, b) => new Date(b.lastAt || 0) - new Date(a.lastAt || 0));

    setConversations(list);
  }

  async function openConversation(conversationId) {
    setSelectedId(conversationId);
    setErrorMsg(null);

    const { data } = await supabase
      .from('messages')
      .select('id, sender_id, content, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at');
    setMessages(data ?? []);

    await supabase.rpc('mark_conversation_read', { p_conversation_id: conversationId });
    setConversations((prev) => prev.map((c) => (c.conversationId === conversationId ? { ...c, unread: false } : c)));

    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }

  // Suscripción en tiempo real a la conversación abierta.
  useEffect(() => {
    if (!selectedId) return;

    const channel = supabase
      .channel(`messages:${selectedId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${selectedId}` },
        (payload) => {
          setMessages((prev) => [...prev, payload.new]);
          setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
          if (payload.new.sender_id !== myId) {
            supabase.rpc('mark_conversation_read', { p_conversation_id: selectedId });
          } else {
            loadConversations();
          }
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, myId]);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!search.trim()) {
        setSearchResults([]);
        return;
      }
      const { data } = await supabase.rpc('search_org_colleagues', { p_query: search.trim() });
      setSearchResults(data ?? []);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  async function startConversation(otherUserId) {
    setErrorMsg(null);
    const { data: conversationId, error } = await supabase.rpc('get_or_create_conversation', { p_other_user_id: otherUserId });
    if (error) {
      setErrorMsg(error.message);
      return;
    }
    setSearch('');
    setSearchResults([]);
    await loadConversations();
    openConversation(conversationId);
  }

  async function handleSend() {
    if (!draft.trim() || !selectedId) return;
    setSending(true);
    setErrorMsg(null);

    const { error } = await supabase.from('messages').insert({
      conversation_id: selectedId,
      sender_id: myId,
      content: draft.trim(),
    });

    setSending(false);
    if (error) {
      setErrorMsg(error.message);
      return;
    }
    setDraft('');
  }

  const selectedConversation = conversations.find((c) => c.conversationId === selectedId);

  return (
    <main style={{ padding: '1.5rem', maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Comunicación</h1>

      <div
        className="card"
        style={{ display: 'grid', gridTemplateColumns: '280px 1fr', height: '70vh', padding: 0, overflow: 'hidden' }}
      >
        {/* Columna izquierda: búsqueda + lista de conversaciones */}
        <div style={{ borderRight: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '0.75rem', borderBottom: '1px solid var(--color-border)' }}>
            <Input placeholder="Buscar compañeros…" value={search} onChange={(e) => setSearch(e.target.value)} />
            {searchResults.length > 0 && (
              <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {searchResults.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => startConversation(u.id)}
                    style={{
                      textAlign: 'left',
                      padding: '0.45rem 0.5rem',
                      borderRadius: 'var(--radius)',
                      background: 'none',
                      border: 'none',
                      // Sin esto, el botón hereda el color de texto por
                      // defecto del navegador (negro) en vez del de la
                      // app -- se veía bien en modo claro (negro sobre
                      // claro) pero era casi invisible en modo oscuro
                      // (negro sobre oscuro).
                      color: 'var(--color-text)',
                      fontSize: '0.85rem',
                    }}
                  >
                    {u.full_name || 'Usuario'}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {conversations.length === 0 ? (
              <p style={{ padding: '1rem', fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
                Busca a un compañero arriba para empezar una conversación.
              </p>
            ) : (
              conversations.map((c) => {
                const initials = getInitials(c.otherName);
                const colors = getAvatarColors(c.otherName);
                const active = c.conversationId === selectedId;
                return (
                  <button
                    key={c.conversationId}
                    onClick={() => openConversation(c.conversationId)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      width: '100%',
                      padding: '0.6rem 0.75rem',
                      background: active ? 'var(--color-active-bg)' : 'transparent',
                      border: 'none',
                      borderBottom: '1px solid var(--color-border)',
                      textAlign: 'left',
                    }}
                  >
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        background: colors.bg,
                        color: colors.color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '0.72rem',
                        flexShrink: 0,
                      }}
                    >
                      {initials}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                        <span style={{ fontWeight: c.unread ? 700 : 500, fontSize: '0.85rem' }}>{c.otherName}</span>
                        {c.lastAt && (
                          <span style={{ fontSize: '0.7rem', color: 'var(--color-text-tertiary)', flexShrink: 0 }}>
                            {formatPreviewFecha(c.lastAt)}
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: '0.78rem',
                          color: c.unread ? 'var(--color-text)' : 'var(--color-text-tertiary)',
                          fontWeight: c.unread ? 600 : 400,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {c.lastMessage || 'Sin mensajes todavía'}
                      </div>
                    </div>
                    {c.unread && (
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-primary)', flexShrink: 0 }} />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Columna derecha: hilo de mensajes */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {!selectedId ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
              Selecciona una conversación o busca a alguien para empezar.
            </div>
          ) : (
            <>
              <div style={{ padding: '0.85rem 1rem', borderBottom: '1px solid var(--color-border)', fontWeight: 700 }}>
                {selectedConversation?.otherName}
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {messages.map((m) => {
                  const mine = m.sender_id === myId;
                  return (
                    <div key={m.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                      <div
                        style={{
                          maxWidth: '70%',
                          padding: '0.5rem 0.75rem',
                          borderRadius: 'var(--radius)',
                          background: mine ? 'var(--color-primary)' : 'var(--color-btn-secondary-bg)',
                          color: mine ? '#fff' : 'var(--color-text)',
                          border: mine ? 'none' : '1px solid var(--color-border)',
                        }}
                      >
                        <div style={{ fontSize: '0.88rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.content}</div>
                        <div style={{ fontSize: '0.68rem', opacity: 0.75, marginTop: 2, textAlign: 'right' }}>{formatHora(m.created_at)}</div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {errorMsg && <p style={{ color: 'var(--color-danger)', fontSize: '0.8rem', padding: '0 1rem' }}>{errorMsg}</p>}

              <div style={{ display: 'flex', gap: 8, padding: '0.75rem', borderTop: '1px solid var(--color-border)' }}>
                <input
                  className="input"
                  placeholder="Escribe un mensaje…"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  style={{ flex: 1 }}
                />
                <button className="btn btn-primary" onClick={handleSend} disabled={sending || !draft.trim()}>
                  Enviar
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}