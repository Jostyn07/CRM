'use client';
// Ruta: app/whatsapp/page.js
// Bandeja de WhatsApp: conversaciones que puedo ver (según los números
// permitidos y mi alcance), no leídos, filtro por número y búsqueda.

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import RequirePermission from '../../components/ui/requirePermission';
import WaThread from '../../components/whatsapp/waThread';
import WaHistoryOverlay from '../../components/whatsapp/waHistoryOverlay';
import { supabase } from '../../lib/supabase/client';
import { useSession } from '../../lib/auth/sessionContext';
import { useOrgUsers } from '../../lib/tasks/useOrgUsers';
import { trackEvent } from '../../lib/activity/tracker';
import { fechaCorta } from '../../lib/chat/api';
import { formatChat, listChannels, listConversations } from '../../lib/whatsapp/api';

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
  const { user, profile, can } = useSession();
  const { userMap } = useOrgUsers();
  const router = useRouter();
  const params = useSearchParams();
  const [channels, setChannels] = useState([]);
  const [channel, setChannel] = useState('');
  const [convs, setConvs] = useState(null);
  const [selected, setSelected] = useState(params.get('c'));
  const [q, setQ] = useState('');
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState(false);

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
    const ch = supabase
      .channel(`wa-inbox-${user?.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wa_conversations' }, load)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'wa_messages' }, load)
      .subscribe();
    const onRead = () => load();
    window.addEventListener('wa:read', onRead);
    return () => {
      supabase.removeChannel(ch);
      window.removeEventListener('wa:read', onRead);
    };
  }, [load, user?.id]);

  function open(id) {
    setSelected(id);
    setHistory(false);
    const url = new URL(window.location.href);
    url.searchParams.set('c', id);
    router.replace(url.pathname + url.search, { scroll: false });
    trackEvent('whatsapp.open', { entityType: 'wa_conversations', entityId: id });
  }

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (convs ?? []).filter(
      (c) =>
        (!onlyUnread || Number(c.unread) > 0) &&
        (!term || `${c.lead_name ?? ''} ${c.contact_name ?? ''} ${c.chat_id}`.toLowerCase().includes(term.replace(/\D/g, '') || term))
    );
  }, [convs, q, onlyUnread]);

  const closeHistory = useCallback(() => setHistory(false), []);
  const conv = convs?.find((c) => c.id === selected);
  const chName = (id) => channels.find((c) => c.id === id)?.name;

  if (!profile) return null;

  return (
    <main style={{ padding: '1.5rem', maxWidth: 1250, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: '1rem', flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: '1.3rem' }}>WhatsApp</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {channels.length > 1 && (
            <select className="input" style={{ width: 220 }} value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="">Todos mis números</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.phone ? `(${c.phone})` : ''}
                </option>
              ))}
            </select>
          )}
          <label style={{ fontSize: '0.82rem', display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={onlyUnread} onChange={(e) => setOnlyUnread(e.target.checked)} /> Solo no leídos
          </label>
        </div>
      </div>

      {error && <p style={{ color: 'var(--color-danger)' }}>{error}</p>}

      <div className="card" style={{ display: 'grid', gridTemplateColumns: '320px 1fr', height: '74vh', padding: 0, overflow: 'hidden' }}>
        <div style={{ borderRight: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: '0.7rem', borderBottom: '1px solid var(--color-border)' }}>
            <input className="input" placeholder="Buscar por nombre o número…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {!convs ? (
              <p style={{ padding: '1rem', fontSize: '0.85rem' }}>Cargando…</p>
            ) : list.length === 0 ? (
              <p style={{ padding: '1rem', fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
                {channels.length ? 'No hay conversaciones.' : 'No tienes números de WhatsApp asignados. Pide acceso al administrador.'}
              </p>
            ) : (
              list.map((c) => {
                const unread = Number(c.unread) || 0;
                const name = c.lead_name || c.contact_name || formatChat(c.chat_id);
                return (
                  <button
                    key={c.id}
                    onClick={() => open(c.id)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '0.65rem 0.8rem',
                      border: 'none',
                      borderBottom: '1px solid var(--color-border)',
                      background: c.id === selected ? 'var(--color-active-bg)' : 'transparent',
                      color: 'var(--color-text)',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                      <span style={{ fontWeight: unread ? 700 : 500, fontSize: '0.86rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', flexShrink: 0 }}>{fechaCorta(c.last_message_at)}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ flex: 1, fontSize: '0.78rem', color: unread ? 'var(--color-text)' : 'var(--color-text-muted)', fontWeight: unread ? 600 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {c.last_direction === 'out' ? '↪ ' : ''}
                        {c.last_message_preview}
                      </span>
                      {unread > 0 && (
                        <span style={{ minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999, background: '#25D366', color: '#fff', fontSize: '0.68rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                          {unread}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                      {c.assigned_user_id ? `👤 ${userMap[c.assigned_user_id]?.name ?? ''}` : '⚠ Sin asignar'}
                      {channels.length > 1 && chName(c.channel_id) ? ` · ${chName(c.channel_id)}` : ''}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
          {!selected ? (
            <div style={{ margin: 'auto', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>Elige una conversación.</div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.7rem 1rem', borderBottom: '1px solid var(--color-border)' }}>
                <span style={{ fontSize: '1.4rem' }}>🟢</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong>{conv ? conv.lead_name || conv.contact_name || formatChat(conv.chat_id) : ''}</strong>
                  {conv && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                      {formatChat(conv.chat_id)} · {conv.assigned_user_id ? `Responsable: ${userMap[conv.assigned_user_id]?.name ?? ''}` : 'Sin responsable'}
                    </div>
                  )}
                </div>
                <button className="btn btn-secondary" onClick={() => setHistory(true)} title="Ver la conversación completa en Wazzup">
                  🕘 Historial
                </button>
                {conv?.lead_id && (
                  <a className="btn btn-secondary" href={`/leads/${conv.lead_id}`}>
                    Ver lead
                  </a>
                )}
              </div>
              <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                <WaThread conversationId={selected} orgId={profile.organization_id} userMap={userMap} canSend={can('whatsapp.send')} />
                {history && <WaHistoryOverlay conversationId={selected} onClose={closeHistory} />}
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}