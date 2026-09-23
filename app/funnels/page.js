'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase/client';
import FunnelColumn from '../../components/funnels/funnelColumn';

const FUNNEL_PAGE_SIZE = 50;

export default function FunnelsPage() {
  const [funnels, setFunnels] = useState([]);
  // { [funnelId]: { leads: [...], total: number, loadingMore: bool } }
  const [funnelLeads, setFunnelLeads] = useState({});
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');

  useEffect(() => {
    loadFunnels();
  }, []);

  async function loadFunnels() {
    setLoading(true);
    setErrorMsg(null);

    const { data: funnelsData, error } = await supabase
      .from('funnels')
      .select('id, name, description, is_protected, is_default_stage')
      .order('is_default_stage', { ascending: false })
      .order('is_protected', { ascending: false })
      .order('created_at', { ascending: true });

    if (error) {
      setErrorMsg(error.message);
      setLoading(false);
      return;
    }

    setFunnels(funnelsData ?? []);

    // Trae la primera página de leads de cada embudo, todas en paralelo.
    const results = await Promise.all(
      (funnelsData ?? []).map((f) => fetchFunnelLeads(f.id, 0, FUNNEL_PAGE_SIZE))
    );

    const grouped = {};
    (funnelsData ?? []).forEach((f, i) => {
      grouped[f.id] = { leads: results[i].leads, total: results[i].total, loadingMore: false };
    });
    setFunnelLeads(grouped);
    setLoading(false);
  }

  // Trae leads de UN embudo específico, en el rango [from, from+size).
  async function fetchFunnelLeads(funnelId, from, size) {
    const { data, error, count } = await supabase
      .from('lead_funnel')
      .select('leads!inner ( id, name, phone, status )', { count: 'exact' })
      .eq('funnel_id', funnelId)
      .eq('leads.status', 'active')
      .range(from, from + size - 1);

    if (error) {
      return { leads: [], total: 0, error };
    }
    return { leads: (data ?? []).map((row) => row.leads), total: count ?? 0 };
  }

  async function handleLoadMore(funnelId) {
    setFunnelLeads((prev) => ({
      ...prev,
      [funnelId]: { ...prev[funnelId], loadingMore: true },
    }));

    const current = funnelLeads[funnelId];
    const result = await fetchFunnelLeads(funnelId, current.leads.length, FUNNEL_PAGE_SIZE);

    setFunnelLeads((prev) => ({
      ...prev,
      [funnelId]: {
        leads: [...prev[funnelId].leads, ...result.leads],
        total: result.total,
        loadingMore: false,
      },
    }));
  }

  // Refresca (desde el inicio) los leads visibles de un embudo específico
  // — se usa tras mover un lead, sin tocar el "cargar más" de las demás
  // columnas.
  async function refreshFunnelColumn(funnelId) {
    const currentlyLoaded = funnelLeads[funnelId]?.leads.length || FUNNEL_PAGE_SIZE;
    const result = await fetchFunnelLeads(funnelId, 0, Math.max(currentlyLoaded, FUNNEL_PAGE_SIZE));
    setFunnelLeads((prev) => ({
      ...prev,
      [funnelId]: { leads: result.leads, total: result.total, loadingMore: false },
    }));
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);
    setErrorMsg(null);

    const { error } = await supabase
      .from('funnels')
      .insert({ name: newName.trim(), description: newDescription.trim() || null });

    if (error) {
      setErrorMsg(error.message);
    } else {
      setNewName('');
      setNewDescription('');
      setShowCreateForm(false);
      await loadFunnels();
    }
    setSaving(false);
  }

  function startEdit(funnel) {
    setEditingId(funnel.id);
    setEditName(funnel.name);
    setEditDescription(funnel.description || '');
  }

  async function handleSaveEdit(funnelId) {
    if (!editName.trim()) return;
    setErrorMsg(null);

    const { error } = await supabase
      .from('funnels')
      .update({ name: editName.trim(), description: editDescription.trim() || null })
      .eq('id', funnelId);

    if (error) {
      setErrorMsg(error.message);
    } else {
      setEditingId(null);
      await loadFunnels();
    }
  }

  async function handleDelete(funnel) {
    const count = funnelLeads[funnel.id]?.total ?? 0;
    const confirmed = window.confirm(
      `¿Eliminar el embudo "${funnel.name}"? Los ${count} leads asignados quedarán sin embudo. Esta acción no se puede deshacer.`
    );
    if (!confirmed) return;

    setErrorMsg(null);
    const { error } = await supabase.from('funnels').delete().eq('id', funnel.id);
    if (error) {
      setErrorMsg(error.message);
    } else {
      await loadFunnels();
    }
  }

  // Arrastrar un lead de una columna a otra: mueve su embudo directamente
  // (los embudos son el único nivel de estado, no hay etapas). Refresca
  // solo las dos columnas afectadas.
  async function handleDropLead(leadId, newFunnelId) {
    // Encuentra en qué columna está ahora mismo (para saber cuál refrescar).
    const sourceFunnelId = Object.keys(funnelLeads).find((fid) =>
      funnelLeads[fid].leads.some((l) => l.id === leadId)
    );

    const { error } = await supabase
      .from('lead_funnel')
      .upsert({ lead_id: leadId, funnel_id: newFunnelId }, { onConflict: 'lead_id' });

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    if (sourceFunnelId && sourceFunnelId !== newFunnelId) {
      await refreshFunnelColumn(sourceFunnelId);
    }
    await refreshFunnelColumn(newFunnelId);
  }

  return (
    <main style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1 style={{ fontSize: '1.25rem' }}>Embudos</h1>
        <button className="btn btn-primary" onClick={() => setShowCreateForm((v) => !v)}>
          {showCreateForm ? 'Cancelar' : '+ Crear embudo'}
        </button>
      </div>

      <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
        Arrastra un lead entre columnas para cambiarlo de embudo.
      </p>

      {errorMsg && (
        <p style={{ color: 'var(--color-danger)', marginBottom: '1rem' }}>{errorMsg}</p>
      )}

      {showCreateForm && (
        <form onSubmit={handleCreate} className="card" style={{ marginBottom: '1rem', maxWidth: 360 }}>
          <label style={{ display: 'block', marginBottom: '0.75rem' }}>
            <span style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4 }}>Nombre</span>
            <input
              className="input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              required
              autoFocus
            />
          </label>
          <label style={{ display: 'block', marginBottom: '1rem' }}>
            <span style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4 }}>Descripción (opcional)</span>
            <input
              className="input"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
            />
          </label>
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? 'Creando…' : 'Crear'}
          </button>
        </form>
      )}

      {loading ? (
        <p>Cargando…</p>
      ) : funnels.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)' }}>Aún no hay embudos creados.</p>
      ) : (
        <div className="scroll-x" style={{ display: 'flex', gap: '1rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
          {funnels.map((funnel) => (
            <FunnelColumn
              key={funnel.id}
              funnel={funnel}
              leads={funnelLeads[funnel.id]?.leads ?? []}
              total={funnelLeads[funnel.id]?.total ?? 0}
              loadingMore={funnelLeads[funnel.id]?.loadingMore ?? false}
              onLoadMore={() => handleLoadMore(funnel.id)}
              editing={editingId === funnel.id}
              editState={{ name: editName, setName: setEditName, description: editDescription, setDescription: setEditDescription }}
              onStartEdit={() => startEdit(funnel)}
              onCancelEdit={() => setEditingId(null)}
              onSaveEdit={() => handleSaveEdit(funnel.id)}
              onDelete={() => handleDelete(funnel)}
              onDropLead={handleDropLead}
            />
          ))}
        </div>
      )}
    </main>
  );
}