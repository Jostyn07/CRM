'use client';
// Ruta: app/settings/chat-auditoria/page.js
// Auditoría del chat interno: los administradores leen conversaciones de
// otros usuarios (solo lectura). Cada conversación abierta queda
// registrada en la auditoría. Se muestra el texto original de los
// mensajes editados.

import { useCallback, useEffect, useState } from 'react';
import RequirePermission from '../../../components/ui/requirePermission';
import { SettingsHeader, errorText } from '../../../components/settings/settingsTabs';
import { useOrgUsers } from '../../../lib/tasks/useOrgUsers';
import { auditConversations, auditMessages, diaSeparador, fechaCorta } from '../../../lib/chat/api';
import { fullDate } from '../../../lib/leads/format';
import MessageBubble from '../../../components/chat/messageBubble';

export default function ChatAuditPage() {
  return (
    <RequirePermission perm="chat.audit">
      <ChatAudit />
    </RequirePermission>
  );
}

function ChatAudit() {
  const { users, userMap } = useOrgUsers();
  const [userId, setUserId] = useState('');
  const [convs, setConvs] = useState(null);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    setConvs(null);
    try {
      setConvs(await auditConversations(userId));
    } catch (e) {
      setError(errorText ? errorText(e) : e.message);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  async function open(c) {
    setSelected(c);
    setMessages(null);
    try {
      setMessages(await auditMessages(c.conversation_id));
    } catch (e) {
      setError(e.message);
    }
  }

  const names = (ids) => (ids ?? []).map((id) => userMap[id]?.name ?? 'Usuario').join(' ↔ ');
  const label = (c) => (c.kind === 'group' ? `👥 ${c.title}` : names(c.member_ids));
  let lastDay = null;

  return (
    <main style={{ padding: '1.5rem', maxWidth: 1200 }}>
      <SettingsHeader
        title="Auditoría de chat"
        subtitle="Lectura de conversaciones internas. Cada conversación que abres queda registrada en la actividad."
      />

      <div style={{ display: 'flex', gap: 8, marginBottom: '0.8rem' }}>
        <select className="input" style={{ width: 260 }} value={userId} onChange={(e) => setUserId(e.target.value)}>
          <option value="">Todas las conversaciones</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </div>

      {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem', marginBottom: 8 }}>{error}</p>}

      <div className="card" style={{ display: 'grid', gridTemplateColumns: '340px 1fr', height: '68vh', padding: 0, overflow: 'hidden' }}>
        <div style={{ borderRight: '1px solid var(--color-border)', overflowY: 'auto' }}>
          {!convs ? (
            <p style={{ padding: '1rem', fontSize: '0.85rem' }}>Cargando…</p>
          ) : convs.length === 0 ? (
            <p style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>No hay conversaciones que puedas revisar.</p>
          ) : (
            convs.map((c) => (
              <button
                key={c.conversation_id}
                onClick={() => open(c)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '0.6rem 0.8rem',
                  border: 'none',
                  borderBottom: '1px solid var(--color-border)',
                  background: selected?.conversation_id === c.conversation_id ? 'var(--color-active-bg)' : 'transparent',
                  color: 'var(--color-text)',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, fontSize: '0.85rem' }}>
                  <strong>{label(c)}</strong>
                  <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>{fechaCorta(c.last_message_at)}</span>
                </div>
                <div style={{ fontSize: '0.76rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {c.message_count} mensaje(s) · {c.last_message_preview}
                </div>
              </button>
            ))
          )}
        </div>

        <div style={{ overflowY: 'auto', padding: '0.8rem 1rem', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {!selected ? (
            <p style={{ margin: 'auto', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>Elige una conversación para revisarla.</p>
          ) : !messages ? (
            <p>Cargando…</p>
          ) : (
            <>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: 6 }}>
                Solo lectura · {label(selected)}{selected.kind === 'group' ? ` · ${names(selected.member_ids)}` : ''}
              </div>
              {messages.map((m) => {
                const day = diaSeparador(m.created_at);
                const showDay = day !== lastDay;
                lastDay = day;
                const byId = Object.fromEntries(messages.map((x) => [x.id, x]));
                return (
                  <div key={m.id} style={{ display: 'contents' }}>
                    {showDay && (
                      <div style={{ alignSelf: 'center', fontSize: '0.72rem', color: 'var(--color-text-muted)', margin: '0.5rem 0', textTransform: 'capitalize' }}>{day}</div>
                    )}
                    <MessageBubble
                      m={m}
                      me={selected.member_ids?.[0]}
                      userMap={userMap}
                      showSender
                      readOnly
                      replyTo={m.reply_to_id ? byId[m.reply_to_id] : null}
                    />
                    {Array.isArray(m.previous_versions) && m.previous_versions.length > 0 && (
                      <details style={{ alignSelf: m.sender_id === selected.member_ids?.[0] ? 'flex-end' : 'flex-start', fontSize: '0.75rem', color: 'var(--color-text-muted)', maxWidth: '72%' }}>
                        <summary style={{ cursor: 'pointer' }}>Editado · ver versiones anteriores ({m.previous_versions.length})</summary>
                        {m.previous_versions.map((v, i) => (
                          <div key={i} style={{ marginTop: 4, paddingLeft: 8, borderLeft: '2px solid var(--color-border)', whiteSpace: 'pre-wrap' }}>
                            {v.body}
                            <div style={{ fontSize: '0.68rem' }}>reemplazado {fullDate(v.edited_at)}</div>
                          </div>
                        ))}
                      </details>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </main>
  );
}