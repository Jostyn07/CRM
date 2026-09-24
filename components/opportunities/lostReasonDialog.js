'use client';
// Ruta: components/opportunities/lostReasonDialog.js
// Al mover una oportunidad a "Perdida" se exige el motivo.

import { useState } from 'react';
import Modal from '../ui/modal';

export default function LostReasonDialog({ open, reasons, onConfirm, onCancel }) {
  const [reasonId, setReasonId] = useState('');
  const [note, setNote] = useState('');
  return (
    <Modal open={open} onClose={onCancel} title="¿Por qué se perdió?" width={420}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (reasonId) onConfirm({ reasonId, note: note.trim() || null });
        }}
      >
        <select className="input" required value={reasonId} onChange={(e) => setReasonId(e.target.value)} style={{ marginBottom: '0.7rem' }}>
          <option value="">Selecciona el motivo…</option>
          {reasons
            .filter((r) => r.is_active)
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
        </select>
        <textarea className="input" rows={3} placeholder="Detalle (opcional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: '0.8rem' }}>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancelar
          </button>
          <button className="btn btn-primary" disabled={!reasonId}>
            Marcar como perdida
          </button>
        </div>
      </form>
    </Modal>
  );
}