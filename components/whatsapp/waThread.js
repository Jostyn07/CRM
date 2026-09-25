'use client';
// Ruta: components/whatsapp/waThread.js
// Hilo de una conversación de WhatsApp: mensajes en vivo, estados
// (✓ enviado, ✓✓ entregado, ✓✓ azul leído), adjuntos, responder y
// escribir con emojis. Lo usan la bandeja y la ficha del lead.

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase/client';
import { useSession } from '../../lib/auth/sessionContext';
import { trackEvent } from '../../lib/activity/tracker';
import { renderFormatted } from '../../lib/chat/format';
import { diaSeparador, hora } from '../../lib/chat/api';
import EmojiPicker from '../chat/emojiPicker';
import { WA_MAX_BYTES, getMessages, markRead, previewOf, sendFile, sendText, useMediaUrl } from '../../lib/whatsapp/api';

function Media({ m }) {
  const url = useMediaUrl(m);
  if (!url) return <div style={{ width: 200, height: 110, borderRadius: 8, background: 'rgba(0,0,0,0.08)' }} />;
  if (m.kind === 'image') return <img src={url} alt="" style={{ display: 'block', maxWidth: 280, maxHeight: 320, borderRadius: 8 }} />;
  if (m.kind === 'video') return <video src={url} controls preload="metadata" style={{ display: 'block', maxWidth: 300, borderRadius: 8 }} />;
  if (m.kind === 'audio') return <audio src={url} controls preload="metadata" style={{ display: 'block', width: 260 }} />;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'inherit' }}>
      <span style={{ fontSize: '1.5rem' }}>📄</span>
      <span style={{ textDecoration: 'underline' }}>{m.media_name || 'Documento'}</span>
    </a>
  );
}

function Ticks({ status, error }) {
  if (status === 'pending') return <span title="Enviando…">🕓</span>;
  if (status === 'error') return <span title={error || 'Error al enviar'} style={{ color: '#fecaca' }}>⚠</span>;
  if (status === 'read') return <span title="Leído" style={{ color: '#7dd3fc', fontWeight: 700, letterSpacing: -3, paddingRight: 3 }}>✓✓</span>;
  if (status === 'delivered') return <span title="Entregado" style={{ fontWeight: 700, letterSpacing: -3, paddingRight: 3 }}>✓✓</span>;
  return <span title="Enviado" style={{ fontWeight: 700 }}>✓</span>;
}

export default function WaThread({ conversationId, orgId, userMap, canSend = true, height = '100%' }) {
  const { user } = useSession();
  const [messages, setMessages] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const [replyTo, setReplyTo] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [emoji, setEmoji] = useState(false);
  const endRef = useRef(null);
  const fileRef = useRef(null);
  const taRef = useRef(null);
  const stick = useRef(true);

  const load = useCallback(async () => {
    try {
      const msgs = await getMessages(conversationId);
      setMessages(msgs);
      setHasMore(msgs.length === 60);
      await markRead(conversationId);
    } catch (e) {
      setError(e.message);
    }
  }, [conversationId]);

  useEffect(() => {
    setMessages(null);
    setReplyTo(null);
    stick.current = true;
    window.__waOpenConversation = conversationId;
    load();
    const ch = supabase
      .channel(`wa-thread-${conversationId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'wa_messages', filter: `conversation_id=eq.${conversationId}` },
        (p) => {
          const m = p.new;
          if (!m?.id) return;
          setMessages((prev) => {
            const list = prev ?? [];
            const i = list.findIndex((x) => x.id === m.id);
            if (i === -1) return [...list, m].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            const next = list.slice();
            next[i] = { ...list[i], ...m };
            return next;
          });
          if (p.eventType === 'INSERT' && m.direction === 'in' && document.visibilityState === 'visible') markRead(conversationId);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
      if (window.__waOpenConversation === conversationId) window.__waOpenConversation = null;
    };
  }, [conversationId, load]);

  useEffect(() => {
    if (stick.current) endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages?.length]);

  async function older() {
    stick.current = false;
    const o = await getMessages(conversationId, { before: messages[0].created_at });
    setHasMore(o.length === 60);
    setMessages((prev) => [...o, ...prev]);
  }

  async function submit() {
    const body = text.trim();
    if ((!body && !files.length) || sending) return;
    setSending(true);
    setError(null);
    stick.current = true;
    try {
      if (files.length) {
        for (let i = 0; i < files.length; i++) {
          await sendFile(orgId, conversationId, files[i], i === 0 ? body : '', i === 0 ? replyTo?.id : undefined);
        }
      } else {
        await sendText(conversationId, body, replyTo?.id);
      }
      trackEvent('whatsapp.sent', { entityType: 'wa_conversations', entityId: conversationId, metadata: { files: files.length } });
      setText('');
      setFiles([]);
      setReplyTo(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }

  function addFiles(list) {
    const ok = [];
    for (const f of list) {
      if (f.size > WA_MAX_BYTES) setError(`"${f.name}" supera el límite de 10 MB de WhatsApp.`);
      else ok.push(f);
    }
    if (ok.length) setFiles((p) => [...p, ...ok].slice(0, 5));
  }

  const byProvider = Object.fromEntries((messages ?? []).filter((m) => m.provider_message_id).map((m) => [m.provider_message_id, m]));
  let lastDay = null;
  const iconBtn = { border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '1.2rem', padding: '4px 6px', color: 'var(--color-text)' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height, minHeight: 0 }}>
      <div
        style={{ flex: 1, overflowY: 'auto', padding: '0.8rem 1.2rem', display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--color-bg, transparent)' }}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        {hasMore && (
          <button className="btn btn-secondary" style={{ alignSelf: 'center' }} onClick={older}>
            Ver mensajes anteriores
          </button>
        )}
        {!messages ? (
          <p style={{ textAlign: 'center', fontSize: '0.85rem' }}>Cargando…</p>
        ) : messages.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem', marginTop: '2rem' }}>Aún no hay mensajes en esta conversación.</p>
        ) : (
          messages.map((m) => {
            const out = m.direction === 'out';
            const day = diaSeparador(m.created_at);
            const showDay = day !== lastDay;
            lastDay = day;
            const quoted = m.reply_to_provider_id ? byProvider[m.reply_to_provider_id] : null;
            return (
              <div key={m.id} style={{ display: 'contents' }}>
                {showDay && (
                  <div style={{ alignSelf: 'center', fontSize: '0.72rem', color: 'var(--color-text-muted)', margin: '0.5rem 0', textTransform: 'capitalize' }}>{day}</div>
                )}
                <div
                  onDoubleClick={() => canSend && setReplyTo(m)}
                  title={canSend ? 'Doble clic para responder' : undefined}
                  style={{
                    alignSelf: out ? 'flex-end' : 'flex-start',
                    maxWidth: '75%',
                    padding: m.kind === 'text' || !m.kind ? '0.5rem 0.75rem' : 4,
                    borderRadius: 12,
                    borderBottomRightRadius: out ? 4 : 12,
                    borderBottomLeftRadius: out ? 12 : 4,
                    background: out ? (m.status === 'error' ? '#b91c1c' : '#128C7E') : 'var(--color-active-bg)',
                    color: out ? '#fff' : 'var(--color-text)',
                    fontSize: '0.88rem',
                  }}
                >
                  {out && (
                    <div style={{ fontSize: '0.68rem', opacity: 0.8, marginBottom: 2, padding: m.kind === 'text' ? 0 : '2px 6px 0' }}>
                      {m.sender_user_id ? userMap[m.sender_user_id]?.name ?? 'Usuario' : m.from_phone_app ? '📱 Desde el celular' : ''}
                    </div>
                  )}
                  {quoted && (
                    <div style={{ borderLeft: '3px solid currentColor', opacity: 0.85, padding: '2px 8px', marginBottom: 4, fontSize: '0.78rem', background: 'rgba(0,0,0,0.08)', borderRadius: 6 }}>
                      {previewOf(quoted).slice(0, 80)}
                    </div>
                  )}
                  {(m.media_path || m.media_url) && <Media m={m} />}
                  {m.kind === 'missing_call' && <div>📞 Llamada perdida de WhatsApp</div>}
                  {m.body && (
                    <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', padding: m.kind === 'text' ? 0 : '4px 6px 0' }}>
                      {m.is_deleted ? <em>Mensaje eliminado</em> : renderFormatted(m.body)}
                    </div>
                  )}
                  {!m.body && m.kind === 'unsupported' && <em style={{ opacity: 0.8 }}>Tipo de mensaje no compatible</em>}
                  <div style={{ fontSize: '0.66rem', opacity: 0.8, textAlign: 'right', marginTop: 2, display: 'flex', gap: 6, justifyContent: 'flex-end', padding: m.kind === 'text' ? 0 : '0 6px 2px' }}>
                    {m.is_edited && <span>editado</span>}
                    <span>{hora(m.created_at)}</span>
                    {out && <Ticks status={m.status} error={m.error} />}
                  </div>
                  {out && m.status === 'error' && m.error && <div style={{ fontSize: '0.7rem', marginTop: 2 }}>⚠ {m.error}</div>}
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      {canSend ? (
        <div
          style={{ borderTop: '1px solid var(--color-border)', padding: '0.5rem 0.8rem', position: 'relative' }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            addFiles([...(e.dataTransfer.files || [])]);
          }}
        >
          {replyTo && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 8px', marginBottom: 6, borderLeft: '3px solid #128C7E', background: 'var(--color-active-bg)', borderRadius: 6, fontSize: '0.8rem' }}>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Respondiendo: {previewOf(replyTo)}</span>
              <button style={iconBtn} onClick={() => setReplyTo(null)}>
                ×
              </button>
            </div>
          )}
          {files.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
              {files.map((f, i) => (
                <span key={i} style={{ fontSize: '0.75rem', padding: '3px 8px', borderRadius: 999, background: 'var(--color-active-bg)' }}>
                  📎 {f.name}{' '}
                  <button style={{ ...iconBtn, fontSize: '0.8rem', padding: 0 }} onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}>
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end' }}>
            <div style={{ position: 'relative' }}>
              <button style={iconBtn} title="Emojis" onClick={() => setEmoji((v) => !v)}>
                😊
              </button>
              {emoji && (
                <EmojiPicker
                  style={{ bottom: 42, left: 0 }}
                  onClose={() => setEmoji(false)}
                  onPick={(e) => {
                    const pos = taRef.current?.selectionStart ?? text.length;
                    setText(text.slice(0, pos) + e + text.slice(pos));
                  }}
                />
              )}
            </div>
            <button style={iconBtn} title="Adjuntar (máx. 10 MB)" onClick={() => fileRef.current?.click()}>
              📎
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                addFiles([...(e.target.files || [])]);
                e.target.value = '';
              }}
            />
            <textarea
              ref={taRef}
              className="input"
              rows={1}
              placeholder="Escribe un mensaje de WhatsApp…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onPaste={(e) => {
                const f = [...(e.clipboardData?.files || [])];
                if (f.length) {
                  e.preventDefault();
                  addFiles(f);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              style={{ flex: 1, resize: 'none', minHeight: 40, maxHeight: 140 }}
            />
            <button className="btn btn-primary" style={{ background: '#128C7E', borderColor: '#128C7E' }} disabled={sending || (!text.trim() && !files.length)} onClick={submit}>
              {sending ? '…' : 'Enviar'}
            </button>
          </div>
          {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.78rem', marginTop: 4 }}>{error}</p>}
        </div>
      ) : (
        <p style={{ padding: '0.7rem 1rem', fontSize: '0.8rem', color: 'var(--color-text-muted)', borderTop: '1px solid var(--color-border)' }}>
          No tienes permiso para enviar mensajes en esta conversación.
        </p>
      )}
    </div>
  );
}