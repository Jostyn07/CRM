'use client';
// Ruta: components/tickets/scanChatDialog.js
// "Revisar chat completo con IA": manda a la IA todo el chat (por días)
// para sacar tickets que se hayan perdido. Permiso tickets.scan_chat.

import { useState } from 'react';
import { createPortal } from 'react-dom';
import Modal from '../ui/modal';
import Icon from '../ui/icon';
import { scanConversation } from '../../lib/tickets/api';
import { trackEvent } from '../../lib/activity/tracker';

export default function ScanChatDialog({ conversationId, onClose }) {
  const [days, setDays] = useState(30);
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const r = await scanConversation(conversationId, days, force);
      trackEvent('tickets.scan_chat', { entityType: 'chat_conversations', entityId: conversationId, metadata: { days, force } });
      setResult(r);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (typeof document === 'undefined') return null;
  return createPortal(
    <Modal open onClose={onClose} title="Revisar chat completo con IA" width={480} zIndex={130}>
      {result ? (
        <div style={{ display: 'grid', gap: 10 }}>
          <p style={{ margin: 0 }}>
            {result.messages ? (
              <>
                Se enviaron <b>{result.messages}</b> mensaje(s) en <b>{result.batches}</b> tanda(s) a la IA. Los tickets aparecen en Tickets en unos segundos;
                si es el mismo problema de un ticket existente, se suma a ese.
              </>
            ) : (
              'No había mensajes nuevos para revisar en ese periodo.'
            )}
          </p>
          {result.skipped > 0 && (
            <small style={{ color: 'var(--color-text-muted)' }}>
              {result.skipped} mensaje(s) ya estaban revisados o en cola y no se volvieron a enviar.
            </small>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <a className="btn btn-secondary" href="/tickets">
              Ir a Tickets
            </a>
            <button className="btn btn-primary" onClick={onClose}>
              Listo
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          <p style={{ margin: 0, fontSize: '0.88rem' }}>
            La IA lee el chat completo, agrupado por quién escribe, y crea los tickets que falten (incluye los mensajes de antes de activar los tickets y las
            capturas que se enviaron).
          </p>
          <label className="tk-label">
            Periodo
            <select className="input" value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={7}>Últimos 7 días</option>
              <option value={30}>Últimos 30 días</option>
              <option value={90}>Últimos 90 días</option>
              <option value={180}>Últimos 180 días</option>
            </select>
          </label>
          <label className="tk-check">
            <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
            <span>
              <b>Volver a revisar también lo ya analizado</b>
              <small>Por defecto solo se manda lo que la IA no ha revisado, para no gastar dos veces.</small>
            </span>
          </label>
          <small style={{ color: 'var(--color-text-muted)', display: 'flex', gap: 6 }}>
            <Icon name="info" size={14} /> Máximo 400 mensajes por revisión. Usa el presupuesto de IA de la organización.
          </small>
          {error && <p className="tk-error">{error}</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button className="btn btn-primary" disabled={busy} onClick={run}>
              {busy ? 'Enviando…' : 'Revisar ahora'}
            </button>
          </div>
        </div>
      )}
    </Modal>,
    document.body
  );
}