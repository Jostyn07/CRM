'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase/client';
import Modal from '../ui/modal';
import Button from '../ui/button';

export default function LeadBulkActions({ selectedIds, onDone }) {
  const [funnels, setFunnels] = useState([]);
  const [selectedFunnelId, setSelectedFunnelId] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    if (modalOpen) loadFunnels();
  }, [modalOpen]);

  async function loadFunnels() {
    const { data } = await supabase
      .from('funnels')
      .select('id, name')
      .order('is_default_stage', { ascending: false })
      .order('name');
    setFunnels(data ?? []);
    setSelectedFunnelId((prev) => prev || data?.[0]?.id || '');
  }

  async function handleAssign() {
    if (!selectedFunnelId) return;
    setWorking(true);
    setErrorMsg(null);

    // upsert: si el lead ya tenía embudo, lo reemplaza (lead_id es UNIQUE:
    // un lead solo puede estar en un embudo a la vez).
    const rows = selectedIds.map((leadId) => ({ lead_id: leadId, funnel_id: selectedFunnelId }));
    const { error } = await supabase.from('lead_funnel').upsert(rows, { onConflict: 'lead_id' });

    setWorking(false);
    if (error) {
      setErrorMsg(error.message);
    } else {
      setModalOpen(false);
      onDone?.();
    }
  }

  async function handleArchive() {
    const confirmed = window.confirm(`¿Archivar ${selectedIds.length} lead(s) seleccionados?`);
    if (!confirmed) return;

    setWorking(true);
    setErrorMsg(null);
    const { error } = await supabase.from('leads').update({ status: 'archived' }).in('id', selectedIds);
    setWorking(false);

    if (error) {
      setErrorMsg(error.message);
    } else {
      onDone?.();
    }
  }

  if (selectedIds.length === 0) return null;

  return (
    <div
      className="card"
      style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}
    >
      <span style={{ fontSize: '0.9rem' }}>{selectedIds.length} seleccionados</span>
      <Button variant="secondary" onClick={() => setModalOpen(true)}>
        Mover a embudo
      </Button>
      <Button variant="danger" onClick={handleArchive} disabled={working}>
        Archivar
      </Button>

      {errorMsg && <span style={{ color: 'var(--color-danger)', fontSize: '0.85rem' }}>{errorMsg}</span>}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Mover a embudo">
        <label style={{ display: 'block', marginBottom: '1rem' }}>
          <span style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4 }}>Embudo</span>
          <select
            className="input"
            value={selectedFunnelId}
            onChange={(e) => setSelectedFunnelId(e.target.value)}
          >
            {funnels.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </label>

        <Button onClick={handleAssign} disabled={working || !selectedFunnelId}>
          {working ? 'Moviendo…' : `Mover ${selectedIds.length} lead(s)`}
        </Button>
      </Modal>
    </div>
  );
}