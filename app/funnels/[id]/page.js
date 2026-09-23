'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '../../../lib/supabase/client';
import StageEditor, { stageColors } from '../../../components/funnels/stageEditor';

const STAGE_COLORS = stageColors();

export default function FunnelDetailPage() {
  const { id: funnelId } = useParams();

  const [funnel, setFunnel] = useState(null);
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  const [newStageName, setNewStageName] = useState('');
  const [newStageColor, setNewStageColor] = useState(STAGE_COLORS[0]);
  const [saving, setSaving] = useState(false);

  const [editingStageId, setEditingStageId] = useState(null);
  const [editStageName, setEditStageName] = useState('');
  const [editStageColor, setEditStageColor] = useState(STAGE_COLORS[0]);

  useEffect(() => {
    if (funnelId) loadData();
  }, [funnelId]);

  async function loadData() {
    setLoading(true);
    setErrorMsg(null);

    const [{ data: funnelData, error: funnelError }, { data: stagesData, error: stagesError }] =
      await Promise.all([
        supabase.from('funnels').select('id, name, description').eq('id', funnelId).single(),
        supabase
          .from('funnel_stages')
          .select('id, name, position, color')
          .eq('funnel_id', funnelId)
          .order('position', { ascending: true }),
      ]);

    if (funnelError) {
      setErrorMsg(funnelError.message);
    } else {
      setFunnel(funnelData);
    }

    if (stagesError) {
      setErrorMsg(stagesError.message);
    } else {
      setStages(stagesData ?? []);
    }

    setLoading(false);
  }

  function nextPosition() {
    return stages.length === 0 ? 1 : Math.max(...stages.map((s) => s.position)) + 1;
  }

  async function handleAddStage(e) {
    e.preventDefault();
    if (!newStageName.trim()) return;
    setSaving(true);
    setErrorMsg(null);

    const { error } = await supabase.from('funnel_stages').insert({
      funnel_id: funnelId,
      name: newStageName.trim(),
      position: nextPosition(),
      color: newStageColor,
    });

    if (error) {
      setErrorMsg(error.message);
    } else {
      setNewStageName('');
      setNewStageColor(STAGE_COLORS[0]);
      await loadData();
    }
    setSaving(false);
  }

  function startEditStage(stage) {
    setEditingStageId(stage.id);
    setEditStageName(stage.name);
    setEditStageColor(stage.color || STAGE_COLORS[0]);
  }

  async function handleSaveStageEdit(stageId) {
    if (!editStageName.trim()) return;
    setErrorMsg(null);

    const { error } = await supabase
      .from('funnel_stages')
      .update({ name: editStageName.trim(), color: editStageColor })
      .eq('id', stageId);

    if (error) {
      setErrorMsg(error.message);
    } else {
      setEditingStageId(null);
      await loadData();
    }
  }

  async function handleDeleteStage(stage) {
    const confirmed = window.confirm(
      `¿Eliminar la etapa "${stage.name}"? Los leads que estén en esta etapa quedarán sin embudo asignado.`
    );
    if (!confirmed) return;

    setErrorMsg(null);
    const { error } = await supabase.from('funnel_stages').delete().eq('id', stage.id);
    if (error) {
      setErrorMsg(error.message);
    } else {
      await loadData();
    }
  }

  // Reordenar intercambiando la posición con la etapa vecina.
  // Se usa una posición temporal negativa para no violar el índice
  // único (funnel_id, position) mientras se hace el intercambio.
  async function moveStage(index, direction) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= stages.length) return;

    const current = stages[index];
    const target = stages[targetIndex];
    setErrorMsg(null);

    const { error: errTemp } = await supabase
      .from('funnel_stages')
      .update({ position: -1 })
      .eq('id', current.id);

    const { error: errTarget } = await supabase
      .from('funnel_stages')
      .update({ position: current.position })
      .eq('id', target.id);

    const { error: errCurrent } = await supabase
      .from('funnel_stages')
      .update({ position: target.position })
      .eq('id', current.id);

    const firstError = errTemp || errTarget || errCurrent;
    if (firstError) {
      setErrorMsg(firstError.message);
    }
    await loadData();
  }

  if (loading) {
    return (
      <main style={{ padding: '1.5rem', maxWidth: 720, margin: '0 auto' }}>
        <p>Cargando…</p>
      </main>
    );
  }

  if (!funnel) {
    return (
      <main style={{ padding: '1.5rem', maxWidth: 720, margin: '0 auto' }}>
        <p style={{ color: 'var(--color-danger)' }}>{errorMsg || 'Embudo no encontrado.'}</p>
        <a href="/funnels" className="btn btn-secondary" style={{ marginTop: '1rem', display: 'inline-flex' }}>
          Volver a Embudos
        </a>
      </main>
    );
  }

  return (
    <main style={{ padding: '1.5rem', maxWidth: 720, margin: '0 auto' }}>
      <a href="/funnels" style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
        ← Embudos
      </a>
      <h1 style={{ fontSize: '1.25rem', margin: '0.5rem 0' }}>{funnel.name}</h1>
      {funnel.description && (
        <p style={{ color: 'var(--color-text-muted)', marginBottom: '1rem' }}>{funnel.description}</p>
      )}

      {errorMsg && (
        <p style={{ color: 'var(--color-danger)', marginBottom: '1rem' }}>{errorMsg}</p>
      )}

      <div className="card" style={{ marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Etapas</h2>

        {stages.length === 0 && (
          <p style={{ color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>
            Este embudo aún no tiene etapas.
          </p>
        )}

        <div style={{ display: 'grid', gap: '0.5rem', marginBottom: '1rem' }}>
          {stages.map((stage, index) => (
            <StageEditor
              key={stage.id}
              stage={stage}
              index={index}
              total={stages.length}
              editing={editingStageId === stage.id}
              editState={{ name: editStageName, setName: setEditStageName, color: editStageColor, setColor: setEditStageColor }}
              onStartEdit={() => startEditStage(stage)}
              onCancelEdit={() => setEditingStageId(null)}
              onSaveEdit={() => handleSaveStageEdit(stage.id)}
              onDelete={() => handleDeleteStage(stage)}
              onMoveUp={() => moveStage(index, -1)}
              onMoveDown={() => moveStage(index, 1)}
            />
          ))}
        </div>

        <form onSubmit={handleAddStage} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
          <label style={{ flex: 1 }}>
            <span style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4 }}>Nueva etapa</span>
            <input
              className="input"
              value={newStageName}
              onChange={(e) => setNewStageName(e.target.value)}
              placeholder="Ej. Contactado"
              required
            />
          </label>
          <label>
            <span style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4 }}>Color</span>
            <select
              value={newStageColor}
              onChange={(e) => setNewStageColor(e.target.value)}
              style={{ padding: '0.55rem' }}
            >
              {STAGE_COLORS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? 'Agregando…' : '+ Agregar etapa'}
          </button>
        </form>
      </div>
    </main>
  );
}