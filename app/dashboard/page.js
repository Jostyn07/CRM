'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase/client';

export default function DashboardPage() {
  const [totals, setTotals] = useState({ total: 0, inFunnels: 0, unassigned: 0 });
  const [byFunnel, setByFunnel] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    setLoading(true);
    setErrorMsg(null);

    const { count: total, error: totalError } = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active');

    const { count: inFunnels, error: inFunnelsError } = await supabase
      .from('lead_funnel')
      .select('lead_id', { count: 'exact', head: true });

    const { data: funnelsData, error: funnelsError } = await supabase
      .from('funnels')
      .select('id, name')
      .order('name');

    const firstError = totalError || inFunnelsError || funnelsError;
    if (firstError) {
      setErrorMsg(firstError.message);
      setLoading(false);
      return;
    }

    const withCounts = await Promise.all(
      (funnelsData ?? []).map(async (funnel) => {
        const { count } = await supabase
          .from('lead_funnel')
          .select('lead_id', { count: 'exact', head: true })
          .eq('funnel_id', funnel.id);
        return { ...funnel, leadCount: count ?? 0 };
      })
    );

    setTotals({
      total: total ?? 0,
      inFunnels: inFunnels ?? 0,
      unassigned: (total ?? 0) - (inFunnels ?? 0),
    });
    setByFunnel(withCounts);
    setLoading(false);
  }

  if (loading) {
    return (
      <main style={{ padding: '1.5rem', maxWidth: 720, margin: '0 auto' }}>
        <p>Cargando…</p>
      </main>
    );
  }

  return (
    <main style={{ padding: '1.5rem', maxWidth: 720, margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Dashboard</h1>

      {errorMsg && (
        <p style={{ color: 'var(--color-danger)', marginBottom: '1rem' }}>{errorMsg}</p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
        <div className="card">
          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Total leads</p>
          <p style={{ fontSize: '1.5rem', fontWeight: 600 }}>{totals.total}</p>
        </div>
        <div className="card">
          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>En embudos</p>
          <p style={{ fontSize: '1.5rem', fontWeight: 600 }}>{totals.inFunnels}</p>
        </div>
        <div className="card">
          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Sin asignar</p>
          <p style={{ fontSize: '1.5rem', fontWeight: 600 }}>{totals.unassigned}</p>
        </div>
      </div>

      <div className="card">
        <h2 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Leads por embudo</h2>
        {byFunnel.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)' }}>Aún no hay embudos.</p>
        ) : (
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {byFunnel.map((f) => (
              <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                <a href="/funnels">{f.name}</a>
                <span>{f.leadCount} leads</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}