'use client';
// Ruta: components/ai/aiAnalysis.js
// Análisis comercial con IA (Reportes → Análisis IA). A la IA solo viajan
// cifras agregadas del período elegido, nunca los datos de los clientes.

import { useState } from 'react';
import { trackEvent } from '../../lib/activity/tracker';
import { aiAnalytics, usd } from '../../lib/ai/api';

export default function AiAnalysis({ filters, period }) {
  const [state, setState] = useState(null); // { loading, result, error }

  async function run() {
    setState({ loading: true });
    try {
      const r = await aiAnalytics({ from: filters.from, to: filters.to, branch_id: filters.branchId || null });
      setState({ result: r });
      trackEvent('ai.analytics', { metadata: { from: filters.from, to: filters.to } });
    } catch (e) {
      setState({ error: e.message });
    }
  }

  const r = state?.result;
  const Section = ({ title, items, color }) =>
    items?.length ? (
      <div className="card">
        <h3 style={{ fontSize: '0.95rem', marginBottom: 8, color }}>{title}</h3>
        <ul style={{ paddingLeft: 18, display: 'grid', gap: 6, fontSize: '0.88rem', lineHeight: 1.45 }}>
          {items.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      </div>
    ) : null;

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 700 }}>✨ Análisis comercial con IA</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
            {period}. La IA recibe solo totales (leads, fuentes, embudo, motivos de pérdida, llamadas, WhatsApp y tiempos de respuesta) y los compara con el período anterior.
          </div>
        </div>
        <button className="btn btn-primary" onClick={run} disabled={state?.loading}>
          {state?.loading ? 'Analizando…' : r ? '🔄 Analizar de nuevo' : 'Analizar período'}
        </button>
      </div>
      {state?.error && <p style={{ color: 'var(--color-danger)' }}>{state.error}</p>}
      {r && (
        <>
          {r.headline && (
            <div className="card" style={{ borderLeft: '3px solid #8b5cf6', fontSize: '1rem', fontWeight: 600 }}>
              {r.headline}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
            <Section title="📊 Hallazgos" items={r.findings} />
            <Section title="⚠️ Alertas" items={r.alerts} color="var(--color-danger)" />
            <Section title="✅ Recomendaciones para esta semana" items={r.recommendations} />
          </div>
          <details style={{ fontSize: '0.78rem' }}>
            <summary style={{ cursor: 'pointer', color: 'var(--color-text-muted)' }}>Ver las cifras que recibió la IA · costo {usd(r.cost_usd, 4)}</summary>
            <pre style={{ whiteSpace: 'pre-wrap', marginTop: 6, fontSize: '0.74rem' }}>{JSON.stringify(r.data, null, 2)}</pre>
          </details>
          <p style={{ fontSize: '0.74rem', color: 'var(--color-text-muted)' }}>El análisis es una ayuda: verifica las cifras en las otras pestañas antes de tomar decisiones.</p>
        </>
      )}
    </div>
  );
}