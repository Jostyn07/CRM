'use client';
// Ruta: components/whatsapp/waHistoryOverlay.js
// Capa sobre el WhatsApp de la plataforma con la ventana de chat de
// Wazzup (iFrame): muestra el historial completo de la conversación,
// incluidos los mensajes anteriores a la conexión. Se cierra con la ✕.

import { useEffect, useState } from 'react';
import { trackEvent } from '../../lib/activity/tracker';
import { getHistoryUrl } from '../../lib/whatsapp/api';

export default function WaHistoryOverlay({ conversationId, onClose }) {
  const [url, setUrl] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    setUrl(null);
    setError(null);
    getHistoryUrl(conversationId)
      .then((u) => alive && setUrl(u))
      .catch((e) => alive && setError(e.message));
    trackEvent('whatsapp.history_opened', { entityType: 'wa_conversations', entityId: conversationId });
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      alive = false;
      window.removeEventListener('keydown', onKey);
    };
  }, [conversationId, onClose]);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 15,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--color-card-bg, var(--color-bg, #fff))',
        boxShadow: '0 0 0 1px var(--color-border)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.5rem 0.8rem', borderBottom: '1px solid var(--color-border)' }}>
        <span style={{ fontSize: '1.1rem' }}>🕘</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ fontSize: '0.9rem' }}>Historial completo (Wazzup)</strong>
          <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
            Incluye los mensajes anteriores a la conexión. Lo nuevo también queda en la plataforma.
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          title="Cerrar historial (Esc)"
          aria-label="Cerrar historial"
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            border: '1px solid var(--color-border)',
            background: 'transparent',
            cursor: 'pointer',
            fontSize: '1rem',
            color: 'var(--color-text)',
          }}
        >
          ✕
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {error ? (
          <p style={{ padding: '1.5rem', color: 'var(--color-danger)', fontSize: '0.88rem' }}>{error}</p>
        ) : !url ? (
          <p style={{ padding: '1.5rem', color: 'var(--color-text-muted)', fontSize: '0.88rem' }}>Abriendo historial…</p>
        ) : (
          <iframe
            src={url}
            title="Historial de WhatsApp (Wazzup)"
            allow="microphone *; clipboard-write *"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
          />
        )}
      </div>
    </div>
  );
}