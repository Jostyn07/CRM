'use client';
// Ruta: components/chat/muteDialog.js
// Silenciar un chat o grupo: 8 horas, 1 semana o siempre. Un chat silenciado
// no suena, no saca aviso del navegador ni suma al contador del menú.

import { useState } from 'react';
import Modal from '../ui/modal';
import Icon from '../ui/icon';

const OPCIONES = [
  { key: '8h', label: '8 horas', ms: 8 * 3600 * 1000 },
  { key: '1w', label: '1 semana', ms: 7 * 86400 * 1000 },
  { key: 'always', label: 'Siempre', ms: null },
];

// Texto para el ícono de la lista: "Silenciado hasta …" o "Silenciado"
export function mutedLabel(until) {
  if (!until) return '';
  const d = new Date(until);
  if (!Number.isFinite(d.getTime()) || d.getFullYear() > 9000) return 'Silenciado';
  return `Silenciado hasta ${d.toLocaleString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })}`;
}

export default function MuteDialog({ conv, onClose, onPick }) {
  const [opt, setOpt] = useState('8h');
  const [busy, setBusy] = useState(false);
  const esGrupo = conv?.kind === 'group';

  async function ok() {
    const o = OPCIONES.find((x) => x.key === opt);
    setBusy(true);
    try {
      await onPick(o.ms == null ? 'infinity' : new Date(Date.now() + o.ms));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={busy ? () => {} : onClose} title={esGrupo ? 'Silenciar grupo' : 'Silenciar chat'} width={400}>
      <div style={{ display: 'grid', gap: 12 }}>
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
          No sonará ni te avisará, y no sumará al contador de mensajes. Los mensajes siguen llegando y los ves al abrir {esGrupo ? 'el grupo' : 'el chat'}.
        </p>
        <div role="radiogroup" style={{ display: 'grid', gap: 4 }}>
          {OPCIONES.map((o) => (
            <label key={o.key} className="fwd-row">
              <input type="radio" name="mute" checked={opt === o.key} onChange={() => setOpt(o.key)} />
              <span style={{ fontSize: '0.9rem' }}>{o.label}</span>
            </label>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8 }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={ok} disabled={busy}>
            <Icon name="bell-off" size={15} />
            {busy ? 'Silenciando…' : 'Silenciar'}
          </button>
        </div>
      </div>
    </Modal>
  );
}