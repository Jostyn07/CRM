'use client';
// Ruta: components/whatsapp/waClientPanel.js
// Panel derecho de la bandeja de WhatsApp: "Ficha del cliente".
// Contacto de WhatsApp, lead vinculado y, si el número es de un cliente de
// Asesorías, su ficha (datos, pólizas y dependientes) en solo lectura.

import { useEffect, useState } from 'react';
import Icon from '../ui/icon';
import FamilyPicker from '../clients/familyPicker';
import { useSession } from '../../lib/auth/sessionContext';
import { clientsByPhone } from '../../lib/clients/api';
import { formatChat } from '../../lib/whatsapp/api';

export default function WaClientPanel({ conv, onClose }) {
  const { can } = useSession();
  const canClients = can('clients.view');
  const [clients, setClients] = useState(null);

  useEffect(() => {
    setClients(null);
    if (!conv?.chat_id || !canClients) return undefined;
    let vivo = true;
    clientsByPhone(`+${conv.chat_id}`)
      .then((r) => vivo && setClients(r ?? []))
      .catch(() => vivo && setClients([]));
    return () => {
      vivo = false;
    };
  }, [conv?.chat_id, canClients]);

  if (!conv) return null;
  const contacto = conv.contact_name || formatChat(conv.chat_id);

  return (
    <aside className="wa-panel card">
      <header className="wa-panel-head">
        <strong>Ficha del cliente</strong>
        {onClose && (
          <button type="button" className="wa-icon-btn" onClick={onClose} title="Ocultar ficha">
            <Icon name="x" size={16} />
          </button>
        )}
      </header>

      <div className="wa-panel-body">
        <section className="wa-panel-sec">
          <div className="wa-panel-label">Contacto de WhatsApp</div>
          <div className="wa-panel-contact">
            <Icon name="message-circle" size={16} style={{ color: '#25D366' }} />
            <span>{contacto}</span>
          </div>
          <div className="wa-panel-muted">{formatChat(conv.chat_id)}</div>
          {conv.lead_id && (
            <a className="wa-panel-link" href={`/leads/${conv.lead_id}`}>
              En leads: {conv.lead_name || 'ver lead'} <Icon name="arrow-right" size={13} />
            </a>
          )}
        </section>

        {canClients && (
          <section className="wa-panel-sec">
            <div className="wa-panel-label">
              <Icon name="link" size={13} /> Cliente de Asesorías
            </div>
            {clients === null ? (
              <div className="wa-panel-muted">Buscando…</div>
            ) : clients.length === 0 ? (
              <div className="wa-panel-muted">Este número no corresponde a ningún cliente de Asesorías.</div>
            ) : (
              <FamilyPicker clients={clients} compact showLeads={false} />
            )}
          </section>
        )}
      </div>

      {canClients && clients?.length > 0 && (
        <footer className="wa-panel-foot">
          <Icon name="lock" size={12} /> Información de Asesorías · Solo lectura
        </footer>
      )}
    </aside>
  );
}