'use client';
// Ruta: components/clients/leadClientTab.js
// Pestaña "Cliente" del lead: la información de Asesorías que coincide con
// el teléfono o el correo del lead (con lista si el número es de varias personas).

import { useEffect, useState } from 'react';
import FamilyPicker from './familyPicker';
import { clientsForLead } from '../../lib/clients/api';

export default function LeadClientTab({ lead }) {
  const [clients, setClients] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    clientsForLead(lead.id)
      .then(setClients)
      .catch((e) => setError(e.message));
  }, [lead.id]);

  if (error) return <p style={{ color: 'var(--color-danger)' }}>{error}</p>;
  if (!clients) return <p>Cargando…</p>;
  if (clients.length === 0)
    return (
      <div className="card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
        Este lead no aparece como cliente en Asesorías (no coincide su teléfono ni su correo).
      </div>
    );
  return (
    <div className="card">
      <FamilyPicker clients={clients} showLeads={false} />
    </div>
  );
}