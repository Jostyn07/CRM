'use client';
// Ruta: components/opportunities/leadOpportunityTab.js
// Pestaña "Oportunidad" de la ficha del lead: la oportunidad abierta
// (máximo una) y las cerradas anteriores.

import { useCallback, useEffect, useState } from 'react';
import Modal from '../ui/modal';
import OpportunityForm from './opportunityForm';
import OpportunityDetail from './opportunityDetail';
import { useSession } from '../../lib/auth/sessionContext';
import { getLeadOpportunities, money, useFunnelConfig } from '../../lib/opportunities/api';
import { fullDate } from '../../lib/leads/format';

const STATUS = { open: 'Abierta', won: 'Ganada', lost: 'Perdida' };

export default function LeadOpportunityTab({ lead, users, onLeadChanged }) {
  const { can } = useSession();
  const fconfig = useFunnelConfig();
  const [opps, setOpps] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setOpps(await getLeadOpportunities(lead.id));
    } catch (e) {
      setError(e.message);
    }
  }, [lead.id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!can('opportunities.view')) return <p style={{ color: 'var(--color-text-muted)' }}>No tienes permiso para ver oportunidades.</p>;
  if (error) return <p style={{ color: 'var(--color-danger)' }}>{error}</p>;
  if (!opps || fconfig.loading) return <p>Cargando…</p>;

  const open = opps.find((o) => o.status === 'open');
  const closed = opps.filter((o) => o.status !== 'open');
  const refresh = async () => {
    await load();
    onLeadChanged?.();
  };

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      {open ? (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: '0.6rem' }}>
            <h3 style={{ fontSize: '1rem' }}>{open.title}</h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
              {fconfig.funnels.find((f) => f.id === open.funnel_id)?.name} · {fconfig.stageMap[open.stage_id]?.name}
            </span>
          </div>
          <OpportunityDetail opportunity={open} fconfig={fconfig} users={users} showLead={false} onChanged={refresh} />
        </div>
      ) : (
        <div className="card" style={{ textAlign: 'center', padding: '1.5rem' }}>
          <p style={{ color: 'var(--color-text-muted)', marginBottom: '0.8rem' }}>Este lead no tiene una oportunidad abierta.</p>
          {can('opportunities.create') && !lead.deleted_at && (
            <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
              + Crear oportunidad
            </button>
          )}
        </div>
      )}

      {closed.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '0.6rem 0.8rem', fontWeight: 600, fontSize: '0.9rem', borderBottom: '1px solid var(--color-border)' }}>Oportunidades anteriores</div>
          {closed.map((o) => (
            <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '0.55rem 0.8rem', borderBottom: '1px solid var(--color-border)', fontSize: '0.86rem' }}>
              <span>
                <strong>{o.title}</strong> · {money(o.value, o.currency)}
                {o.status === 'lost' && <span style={{ color: 'var(--color-text-muted)' }}> · {fconfig.reasonMap[o.lost_reason_id]?.name}</span>}
              </span>
              <span style={{ color: o.status === 'won' ? 'var(--color-status-custom-text)' : 'var(--color-danger)' }}>
                {STATUS[o.status]} · {fullDate(o.closed_at)}
              </span>
            </div>
          ))}
        </div>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Nueva oportunidad" width={560}>
        <OpportunityForm
          lead={lead}
          fconfig={fconfig}
          users={users}
          onCancel={() => setCreateOpen(false)}
          onSaved={() => {
            setCreateOpen(false);
            refresh();
          }}
        />
      </Modal>
    </div>
  );
}