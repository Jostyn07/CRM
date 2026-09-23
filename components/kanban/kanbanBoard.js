'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase/client';
import KanbanColumn from './kanbanColumn';

export default function KanbanBoard({ funnelId }) {
  const [stages, setStages] = useState([]);
  const [leadsByStage, setLeadsByStage] = useState({});
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    if (funnelId) loadBoard();
  }, [funnelId]);

  async function loadBoard() {
    setLoading(true);
    setErrorMsg(null);

    const { data: stagesData, error: stagesError } = await supabase
      .from('funnel_stages')
      .select('id, name, position, color')
      .eq('funnel_id', funnelId)
      .order('position', { ascending: true });

    if (stagesError) {
      setErrorMsg(stagesError.message);
      setLoading(false);
      return;
    }

    const { data: relData, error: relError } = await supabase
      .from('lead_funnel')
      .select('stage_id, leads ( id, name, phone, status )')
      .eq('funnel_id', funnelId);

    if (relError) {
      setErrorMsg(relError.message);
      setLoading(false);
      return;
    }

    const grouped = {};
    (stagesData ?? []).forEach((stage) => {
      grouped[stage.id] = [];
    });
    (relData ?? []).forEach((rel) => {
      if (rel.leads && rel.leads.status === 'active' && grouped[rel.stage_id]) {
        grouped[rel.stage_id].push(rel.leads);
      }
    });

    setStages(stagesData ?? []);
    setLeadsByStage(grouped);
    setLoading(false);
  }

  // Actualización optimista: mueve la tarjeta en pantalla de inmediato
  // y luego persiste en Supabase. Si falla, recarga desde el servidor.
  async function handleDropLead(leadId, newStageId) {
    setLeadsByStage((prev) => {
      const next = {};
      let movedLead = null;
      for (const [stageId, leadsList] of Object.entries(prev)) {
        next[stageId] = leadsList.filter((l) => {
          if (l.id === leadId) {
            movedLead = l;
            return false;
          }
          return true;
        });
      }
      if (movedLead) {
        next[newStageId] = [...(next[newStageId] ?? []), movedLead];
      }
      return next;
    });

    const { error } = await supabase
      .from('lead_funnel')
      .update({ stage_id: newStageId })
      .eq('lead_id', leadId);

    if (error) {
      setErrorMsg(error.message);
      await loadBoard(); // revertir al estado real si falló
    }
  }

  if (loading) return <p>Cargando tablero…</p>;

  if (stages.length === 0) {
    return (
      <p style={{ color: 'var(--color-text-muted)' }}>
        Este embudo aún no tiene etapas.{' '}
        <a href={`/funnels/${funnelId}`} style={{ color: 'var(--color-primary)' }}>
          Crear etapas
        </a>
        .
      </p>
    );
  }

  return (
    <div>
      {errorMsg && (
        <p style={{ color: 'var(--color-danger)', marginBottom: '0.75rem' }}>{errorMsg}</p>
      )}
      <div style={{ display: 'flex', gap: '0.75rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
        {stages.map((stage) => (
          <KanbanColumn
            key={stage.id}
            stage={stage}
            leads={leadsByStage[stage.id] ?? []}
            onDropLead={handleDropLead}
          />
        ))}
      </div>
    </div>
  );
}