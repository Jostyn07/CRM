'use client';
// Ruta: components/opportunities/opportunityDetail.js
// Detalle de una oportunidad: datos, mover de etapa, historial,
// editar y eliminar. Se usa en el tablero y en la ficha del lead.

import { useEffect, useState } from 'react';
import OpportunityForm from './opportunityForm';
import LostReasonDialog from './lostReasonDialog';
import { useSession } from '../../lib/auth/sessionContext';
import { deleteOpportunity, getHistory, money, moveOpportunity } from '../../lib/opportunities/api';
import { fullDate } from '../../lib/leads/format';
import { trackEvent } from '../../lib/activity/tracker';

const STATUS = { open: 'Abierta', won: 'Ganada', lost: 'Perdida' };

function fmtSpan(s) {
  if (s == null) return '';
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min`;
  if (s < 86400) return `${Math.round(s / 3600)} h`;
  return `${Math.round(s / 86400)} d`;
}

export default function OpportunityDetail({ opportunity: o, fconfig, users, showLead = true, onChanged, onClose }) {
  const { can } = useSession();
  const [editing, setEditing] = useState(false);
  const [history, setHistory] = useState([]);
  const [askLost, setAskLost] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getHistory(o.id).then(setHistory);
  }, [o.id, o.stage_id]);

  const stages = fconfig.stagesOf(o.funnel_id).filter((s) => s.is_active || s.id === o.stage_id);
  const userName = (id) => users.find((u) => u.id === id)?.name ?? '—';

  async function move(stageId, lost) {
    setError(null);
    const stage = fconfig.stageMap[stageId];
    if (stage.kind === 'lost' && !lost) return setAskLost(stageId);
    try {
      await moveOpportunity(o.id, stageId, lost);
      trackEvent('opportunity.moved', { entityType: 'opportunities', entityId: o.id, metadata: { to: stage.name } });
      setAskLost(null);
      onChanged?.();
    } catch (e) {
      setError(e.message);
    }
  }

  if (editing) {
    return (
      <OpportunityForm
        opportunity={o}
        fconfig={fconfig}
        users={users}
        onCancel={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          onChanged?.();
        }}
      />
    );
  }

  const row = (label, value) => (
    <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', padding: '0.35rem 0', borderBottom: '1px solid var(--color-border)', fontSize: '0.86rem' }}>
      <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
      <span>{value || '—'}</span>
    </div>
  );

  return (
    <div>
      {row('Estado', STATUS[o.status])}
      {showLead &&
        row(
          'Lead',
          <a href={`/leads/${o.lead_id}?tab=oportunidad`} style={{ color: 'var(--color-primary)' }}>
            {o.lead?.first_name} {o.lead?.last_name}
          </a>
        )}
      {row('Valor', money(o.value, o.currency))}
      {row('Responsable', userName(o.assigned_user_id))}
      {row('Cierre estimado', o.expected_close_date)}
      {o.status === 'lost' && row('Motivo de pérdida', `${fconfig.reasonMap[o.lost_reason_id]?.name ?? ''}${o.lost_note ? ` — ${o.lost_note}` : ''}`)}
      {o.closed_at && row('Cerrada', fullDate(o.closed_at))}
      {row('Creada', fullDate(o.created_at))}
      {o.notes && row('Notas', o.notes)}

      {can('opportunities.update') && (
        <div style={{ marginTop: '0.9rem' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: 6 }}>Mover a</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {stages.map((s) => (
              <button
                key={s.id}
                className={s.id === o.stage_id ? 'btn btn-primary' : 'btn btn-secondary'}
                disabled={s.id === o.stage_id}
                onClick={() => move(s.id)}
                style={{ borderLeft: `4px solid ${s.color}` }}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}
      {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.84rem', marginTop: 8 }}>{error}</p>}

      <h4 style={{ fontSize: '0.88rem', margin: '1rem 0 0.4rem' }}>Historial</h4>
      <div style={{ maxHeight: 200, overflowY: 'auto', fontSize: '0.84rem' }}>
        {history.map((h) => (
          <div key={h.id} style={{ padding: '0.3rem 0', borderBottom: '1px solid var(--color-border)' }}>
            <span style={{ color: 'var(--color-text-muted)' }}>{fullDate(h.moved_at)}</span> · {userName(h.moved_by)}:{' '}
            {h.from_stage_id ? (
              <>
                {fconfig.stageMap[h.from_stage_id]?.name} → <strong>{fconfig.stageMap[h.to_stage_id]?.name}</strong>
                {h.seconds_in_previous != null && <span style={{ color: 'var(--color-text-muted)' }}> (estuvo {fmtSpan(h.seconds_in_previous)})</span>}
              </>
            ) : (
              <>
                creó la oportunidad en <strong>{fconfig.stageMap[h.to_stage_id]?.name}</strong>
              </>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: '1rem' }}>
        {can('opportunities.delete') ? (
          <button
            className="btn btn-secondary"
            style={{ color: 'var(--color-danger)' }}
            onClick={async () => {
              if (!confirm('¿Eliminar esta oportunidad? Se borra con su historial.')) return;
              try {
                await deleteOpportunity(o.id);
                onChanged?.();
                onClose?.();
              } catch (e) {
                setError(e.message);
              }
            }}
          >
            Eliminar
          </button>
        ) : (
          <span />
        )}
        {can('opportunities.update') && (
          <button className="btn btn-primary" onClick={() => setEditing(true)}>
            Editar
          </button>
        )}
      </div>

      <LostReasonDialog open={!!askLost} reasons={fconfig.lostReasons} onCancel={() => setAskLost(null)} onConfirm={(lost) => move(askLost, lost)} />
    </div>
  );
}