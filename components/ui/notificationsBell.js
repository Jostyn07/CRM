'use client';
// Ruta: components/ui/notificationsBell.js
// Campana de notificaciones (avisos de las automatizaciones).

import { useEffect, useRef, useState } from 'react';
import { listNotifications, markNotificationsRead, useNotifications } from '../../lib/automations/api';
import { relTime } from '../../lib/leads/format';

export default function NotificationsBell({ userId }) {
  const { unread, reload } = useNotifications(userId);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    setLoading(true);
    listNotifications(30)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open, unread]);

  async function openItem(n) {
    if (!n.read_at) await markNotificationsRead([n.id]);
    reload();
    if (n.link) window.location.href = n.link;
    else setItems((xs) => xs.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
  }

  async function readAll() {
    await markNotificationsRead(null);
    setItems((xs) => xs.map((x) => ({ ...x, read_at: x.read_at ?? new Date().toISOString() })));
    reload();
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={unread ? `${unread} notificaciones sin leer` : 'Notificaciones'}
        title="Notificaciones"
        style={{ position: 'relative', width: 34, height: 34, borderRadius: 999, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text)', cursor: 'pointer', fontSize: '1rem' }}
      >
        🔔
        {unread > 0 && (
          <span
            style={{ position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999, background: 'var(--color-danger)', color: '#fff', fontSize: '0.68rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="card"
          style={{ position: 'fixed', top: 58, left: 12, width: 340, maxWidth: 'calc(100vw - 24px)', maxHeight: '70vh', overflowY: 'auto', padding: 0, zIndex: 60, boxShadow: '0 12px 32px rgba(0,0,0,0.18)' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.7rem 0.9rem', borderBottom: '1px solid var(--color-border)' }}>
            <strong style={{ fontSize: '0.9rem' }}>Notificaciones</strong>
            {items.some((n) => !n.read_at) && (
              <button onClick={readAll} style={{ background: 'none', border: 'none', color: 'var(--color-primary)', fontSize: '0.78rem', cursor: 'pointer' }}>
                Marcar todas como leídas
              </button>
            )}
          </div>
          {loading && items.length === 0 ? (
            <p style={{ padding: '0.9rem', fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>Cargando…</p>
          ) : items.length === 0 ? (
            <p style={{ padding: '0.9rem', fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>No tienes notificaciones.</p>
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                onClick={() => openItem(n)}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.65rem 0.9rem', border: 'none', borderBottom: '1px solid var(--color-border)', background: n.read_at ? 'transparent' : 'var(--color-active-bg)', color: 'var(--color-text)', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: '0.84rem', fontWeight: n.read_at ? 500 : 700 }}>{n.title}</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', flexShrink: 0 }}>{relTime(n.created_at)}</span>
                </div>
                {n.body && <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: 2, whiteSpace: 'pre-line' }}>{n.body}</div>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}