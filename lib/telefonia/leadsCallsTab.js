'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase/client';
import { RESULTADO_LABEL, RESULTADO_STYLE, pillStyle } from '../../lib/telefonia/resultados';

function formatDuracion(segundos) {
  const s = segundos || 0;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

function formatFechaHora(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const fecha = d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const hora = d.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${fecha} · ${hora}`;
}

// Nota: RLS (calls_select_own_or_admin) hace que un agente normal solo
// vea AQUÍ las llamadas que él mismo hizo a este lead, no las de otros
// agentes — es el mismo comportamiento de privacidad de toda la app
// (punto 20 del doc), no un caso especial de este componente.
export default function LeadCallsTab({ lead, onCall }) {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    if (lead?.id) load();
  }, [lead?.id]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('calls')
      .select('id, tipo, numero, resultado, duracion_segundos, created_at, call_recordings ( disponible, duracion_segundos )')
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: false });
    setCalls(data ?? []);
    setLoading(false);
  }

  const totalLlamadas = calls.length;
  const duracionTotalSeg = calls.reduce((sum, c) => sum + (c.duracion_segundos || 0), 0);
  const ultimaLlamada = calls[0];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 260px', gap: '1rem', alignItems: 'start' }}>
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.9rem' }}>
          <h2 style={{ fontSize: '1rem' }}>Historial de llamadas</h2>
          <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>{totalLlamadas} llamada{totalLlamadas === 1 ? '' : 's'}</span>
        </div>

        {loading ? (
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Cargando…</p>
        ) : calls.length === 0 ? (
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Todavía no hay llamadas registradas con este lead.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {calls.map((c) => {
              const rec = Array.isArray(c.call_recordings) ? c.call_recordings[0] : c.call_recordings;
              const expanded = expandedId === c.id;
              return (
                <div key={c.id} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '0.75rem' }}>
                  <button
                    onClick={() => setExpandedId(expanded ? null : c.id)}
                    style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none' }}
                  >
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{formatFechaHora(c.created_at)}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--color-text-tertiary)' }}>Duración {formatDuracion(c.duracion_segundos)}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {c.resultado && (
                        <span className="status-pill" style={pillStyle(RESULTADO_STYLE[c.resultado] || 'none')}>
                          {RESULTADO_LABEL[c.resultado]}
                        </span>
                      )}
                      <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>{expanded ? '▾' : '▸'}</span>
                    </div>
                  </button>

                  {expanded && (
                    <div style={{ marginTop: '0.7rem', paddingTop: '0.7rem', borderTop: '1px solid var(--color-border)' }}>
                      {rec?.disponible ? (
                        <div
                          style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: 0.6 }}
                          title="Reproducción pendiente de conectar (requiere la Edge Function de grabaciones con signed URLs)"
                        >
                          <button className="btn btn-secondary" disabled style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>▶</button>
                          <span style={{ fontSize: '0.78rem', color: 'var(--color-text-tertiary)' }}>0:00 / {formatDuracion(rec.duracion_segundos)}</span>
                          <button className="btn btn-secondary" disabled style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>↓ Descargar</button>
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.8rem', color: 'var(--color-text-tertiary)' }}>Sin grabación disponible.</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div className="card">
          <h3 style={{ fontSize: '0.9rem', marginBottom: '0.6rem' }}>Resumen del lead</h3>
          <SummaryRow label="Total de llamadas" value={totalLlamadas} />
          <SummaryRow label="Última llamada" value={ultimaLlamada ? formatFechaHora(ultimaLlamada.created_at) : '—'} />
          <SummaryRow label="Duración total" value={formatDuracion(duracionTotalSeg)} />
          <SummaryRow
            label="Último resultado"
            value={
              ultimaLlamada?.resultado ? (
                <span className="status-pill" style={pillStyle(RESULTADO_STYLE[ultimaLlamada.resultado] || 'none')}>
                  {RESULTADO_LABEL[ultimaLlamada.resultado]}
                </span>
              ) : (
                '—'
              )
            }
          />
        </div>

        {lead.phone && (
          <div className="card">
            <h3 style={{ fontSize: '0.88rem', marginBottom: 4 }}>Nueva llamada a este lead</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>
              Llama directamente al número principal de este lead.
            </p>
            <button
              className="btn btn-primary"
              style={{ width: '100%' }}
              onClick={() => onCall({ name: lead.name, numero: lead.phone, leadId: lead.id })}
            >
              📞 Llamar ahora
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0', fontSize: '0.85rem' }}>
      <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}