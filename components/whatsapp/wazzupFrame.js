'use client';
// Ruta: components/whatsapp/wazzupFrame.js
// Ventana de chat de Wazzup dentro de la plataforma (iFrame). Muestra el
// historial completo y permite escribir desde Wazzup. Lo que se envía o
// recibe ahí también queda en la plataforma (llega por el webhook).

import { useEffect, useState } from 'react';
import { trackEvent } from '../../lib/activity/tracker';
import { getWazzupUrl } from '../../lib/whatsapp/api';

export default function WazzupFrame({ conversationId, global = false }) {
  const [url, setUrl] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    setUrl(null);
    setError(null);
    getWazzupUrl({ conversationId, global })
      .then((u) => alive && setUrl(u))
      .catch((e) => alive && setError(e.message));
    trackEvent(global ? 'whatsapp.wazzup_inbox_opened' : 'whatsapp.wazzup_chat_opened', {
      entityType: 'wa_conversations',
      entityId: conversationId ?? null,
    });
    return () => {
      alive = false;
    };
  }, [conversationId, global]);

  if (error) return <p style={{ padding: '1.5rem', color: 'var(--color-danger)', fontSize: '0.88rem' }}>{error}</p>;
  if (!url) return <p style={{ padding: '1.5rem', color: 'var(--color-text-muted)', fontSize: '0.88rem' }}>Abriendo Wazzup…</p>;
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <iframe
        src={url}
        title="WhatsApp (Wazzup)"
        allow="microphone *; clipboard-write *"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
      />
    </div>
  );
}