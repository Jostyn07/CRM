'use client';
// Ruta: components/clients/waClientBar.js
// Barra en la conversación de WhatsApp: si el número es de uno o varios
// clientes de Asesorías, muestra quién es y permite elegir entre la familia.

import { useEffect, useState } from 'react';
import { useSession } from '../../lib/auth/sessionContext';
import FamilyPicker from './familyPicker';
import { clientsByPhone } from '../../lib/clients/api';
import { getConversation } from '../../lib/whatsapp/api';

export default function WaClientBar({ conversationId }) {
  const { can } = useSession();
  const [clients, setClients] = useState([]);
  const [open, setOpen] = useState(false);
  const enabled = can('clients.view');

  useEffect(() => {
    setClients([]);
    setOpen(false);
    if (!enabled || !conversationId) return;
    let alive = true;
    getConversation(conversationId)
      .then((cv) => (cv?.chat_id ? clientsByPhone(`+${cv.chat_id}`) : []))
      .then((r) => alive && setClients(r ?? []))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [conversationId, enabled]);

  if (!enabled || clients.length === 0) return null;
  const names = clients.map((c) => c.first_name || c.full_name).filter(Boolean);

  return (
    <div style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-active-bg)' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '0.45rem 0.8rem', background: 'none', border: 'none', color: 'var(--color-text)', cursor: 'pointer', fontSize: '0.82rem', textAlign: 'left' }}
      >
        <span>
          {clients.length > 1 ? `👪 Cliente de Asesorías · ${clients.length} personas: ${names.join(', ')}` : `🧾 Cliente de Asesorías: ${clients[0].full_name}`}
        </span>
        <span style={{ color: 'var(--color-text-muted)' }}>{open ? 'Ocultar ▴' : 'Ver información ▾'}</span>
      </button>
      {open && (
        <div style={{ padding: '0.6rem 0.8rem', maxHeight: 360, overflowY: 'auto', background: 'var(--color-card-bg, var(--color-bg))', borderTop: '1px solid var(--color-border)' }}>
          <FamilyPicker clients={clients} compact />
        </div>
      )}
    </div>
  );
}