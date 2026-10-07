'use client';
// Ruta: components/tickets/reportDialog.js
// "Reportar un problema": pasa por la IA para clasificarlo y unirlo a un
// ticket existente si es el mismo problema.

import { useState } from 'react';
import Modal from '../ui/modal';
import { trackEvent } from '../../lib/activity/tracker';
import { reportProblem } from '../../lib/tickets/api';

export default function ReportDialog({ onClose, onDone, initialText = '' }) {
  const [title, setTitle] = useState('');
  const [text, setText] = useState(initialText);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);
  async function send() {
    setBusy(true);
    setError(null);
    try {
      const r = await reportProblem(text, title);
      trackEvent('ticket.reported');
      setMsg(r?.queued ? 'Gracias. La IA lo está revisando: si ya existe un ticket igual, se suma a ese; si no, se crea uno nuevo.' : 'Gracias. El ticket quedó creado.');
      onDone?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title="Reportar un problema" width={520}>
      {msg ? (
        <>
          <p>{msg}</p>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" onClick={onClose}>
              Listo
            </button>
          </div>
        </>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          <label className="tk-label">
            Título (opcional)
            <input className="input" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej.: La pantalla de Clientes queda en blanco" />
          </label>
          <label className="tk-label">
            ¿Qué ocurrió?
            <textarea
              className="input"
              rows={5}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Qué estabas haciendo, qué esperabas que pasara y qué pasó. Si sale un mensaje, cópialo."
            />
          </label>
          {error && <p className="tk-error">{error}</p>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button className="btn btn-primary" disabled={busy || text.trim().length < 8} onClick={send}>
              {busy ? 'Enviando…' : 'Enviar reporte'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}