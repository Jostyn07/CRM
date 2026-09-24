'use client';
// Ruta: components/opportunities/opportunityForm.js
// Crear o editar una oportunidad. Al crear desde el tablero se busca el
// lead; desde la ficha del lead ya viene fijado.

import { useEffect, useState } from 'react';
import { useSession } from '../../lib/auth/sessionContext';
import { createOpportunity, updateOpportunity } from '../../lib/opportunities/api';
import { searchLeads } from '../../lib/leads/api';
import { trackEvent } from '../../lib/activity/tracker';

export default function OpportunityForm({ opportunity, lead, funnelId, fconfig, users, onSaved, onCancel }) {
  const isEdit = !!opportunity;
  const { can, scopeOf } = useSession();
  const [v, setV] = useState({
    title: opportunity?.title ?? '',
    value: opportunity?.value ?? '',
    funnel_id: opportunity?.funnel_id ?? funnelId ?? fconfig.funnels.find((f) => f.is_active)?.id ?? '',
    stage_id: '',
    assigned_user_id: opportunity?.assigned_user_id ?? '',
    expected_close_date: opportunity?.expected_close_date ?? '',
    notes: opportunity?.notes ?? '',
  });
  const [pickedLead, setPickedLead] = useState(lead ?? opportunity?.lead ?? null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const canAssign = scopeOf(isEdit ? 'opportunities.update' : 'opportunities.create') !== 'own';

  // Búsqueda de leads (respeta el alcance del usuario)
  useEffect(() => {
    if (pickedLead || query.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const r = await searchLeads({ filters: { search: query }, pageSize: 8 });
      setResults(r.rows);
    }, 300);
    return () => clearTimeout(t);
  }, [query, pickedLead]);

  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }));
  const openStages = fconfig.stagesOf(v.funnel_id).filter((s) => s.kind === 'open' && s.is_active);
  const branchUsers = pickedLead?.branch_id ? users.filter((u) => u.branchIds.includes(pickedLead.branch_id)) : users;

  async function submit(e) {
    e.preventDefault();
    setError(null);
    if (!pickedLead) return setError('Selecciona el lead.');
    if (!v.title.trim()) return setError('Escribe un título.');
    setSaving(true);
    try {
      if (isEdit) {
        const patch = { title: v.title.trim(), value: Number(v.value || 0), expected_close_date: v.expected_close_date || null, notes: v.notes || null };
        if (canAssign) patch.assigned_user_id = v.assigned_user_id || null;
        await updateOpportunity(opportunity.id, patch);
        onSaved?.(opportunity.id);
      } else {
        const id = await createOpportunity({ ...v, lead_id: pickedLead.id, assigned_user_id: canAssign ? v.assigned_user_id : null });
        trackEvent('opportunity.created_form', { entityType: 'opportunities', entityId: id });
        onSaved?.(id);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const label = { display: 'block', fontSize: '0.82rem', marginBottom: 4 };

  return (
    <form onSubmit={submit}>
      <div style={{ marginBottom: '0.8rem' }}>
        <span style={label}>Lead</span>
        {pickedLead ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} className="card">
            <span>
              <strong>
                {pickedLead.first_name} {pickedLead.last_name}
              </strong>{' '}
              <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>{pickedLead.phone_normalized || pickedLead.email_normalized}</span>
            </span>
            {!isEdit && !lead && (
              <button type="button" className="btn btn-secondary" onClick={() => setPickedLead(null)}>
                Cambiar
              </button>
            )}
          </div>
        ) : (
          <>
            <input className="input" autoFocus placeholder="Busca por nombre, teléfono o correo…" value={query} onChange={(e) => setQuery(e.target.value)} />
            {results.length > 0 && (
              <div className="card" style={{ padding: 4, marginTop: 4 }}>
                {results.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setPickedLead(r)}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.4rem 0.6rem', border: 'none', background: 'none', color: 'var(--color-text)', cursor: 'pointer' }}
                  >
                    {r.first_name} {r.last_name} <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>{r.phone_normalized || r.email_normalized}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <label style={{ display: 'block', marginBottom: '0.7rem' }}>
        <span style={label}>Título</span>
        <input className="input" value={v.title} onChange={set('title')} placeholder="Ej. Póliza familiar 2027" />
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: '0.7rem' }}>
        <label>
          <span style={label}>Valor ({fconfig.currency})</span>
          <input className="input" type="number" min="0" step="0.01" value={v.value} onChange={set('value')} />
        </label>
        <label>
          <span style={label}>Cierre estimado</span>
          <input className="input" type="date" value={v.expected_close_date} onChange={set('expected_close_date')} />
        </label>
      </div>

      {!isEdit && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: '0.7rem' }}>
          <label>
            <span style={label}>Embudo</span>
            <select className="input" value={v.funnel_id} onChange={(e) => setV((x) => ({ ...x, funnel_id: e.target.value, stage_id: '' }))}>
              {fconfig.funnels
                .filter((f) => f.is_active)
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            <span style={label}>Etapa inicial</span>
            <select className="input" value={v.stage_id} onChange={set('stage_id')}>
              <option value="">{openStages[0]?.name ?? '—'} (primera)</option>
              {openStages.slice(1).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {canAssign && (
        <label style={{ display: 'block', marginBottom: '0.7rem' }}>
          <span style={label}>Responsable</span>
          <select className="input" value={v.assigned_user_id} onChange={set('assigned_user_id')}>
            <option value="">Sin asignar</option>
            {branchUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <label style={{ display: 'block', marginBottom: '0.8rem' }}>
        <span style={label}>Notas</span>
        <textarea className="input" rows={3} value={v.notes} onChange={set('notes')} />
      </label>

      {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem', marginBottom: '0.6rem' }}>{error}</p>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        {onCancel && (
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
            Cancelar
          </button>
        )}
        <button className="btn btn-primary" disabled={saving || (!isEdit && !can('opportunities.create'))}>
          {saving ? 'Guardando…' : isEdit ? 'Guardar' : 'Crear oportunidad'}
        </button>
      </div>
    </form>
  );
}