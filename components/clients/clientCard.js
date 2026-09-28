'use client';
// Ruta: components/clients/clientCard.js
// Ficha de un cliente de Asesorías: datos, pólizas y dependientes.
// La clave de seguridad solo se muestra a quien tiene clients.sensitive.

import { useEffect, useState } from 'react';
import { useSession } from '../../lib/auth/sessionContext';
import { trackEvent } from '../../lib/activity/tracker';
import { HIDDEN_FIELDS, fmtValue, humanize, matchingLeads, money, policySecrets } from '../../lib/clients/api';

const th = { padding: '4px 8px', textAlign: 'left', color: 'var(--color-text-muted)', fontSize: '0.74rem', whiteSpace: 'nowrap' };
const td = { padding: '4px 8px', fontSize: '0.82rem', verticalAlign: 'top' };

export default function ClientCard({ client, showLeads = true, compact = false }) {
  const { can } = useSession();
  const [secrets, setSecrets] = useState(null);
  const [leads, setLeads] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setSecrets(null);
    setError(null);
    if (showLeads) matchingLeads(client.id).then(setLeads).catch(() => setLeads([]));
  }, [client.id, showLeads]);

  const policies = Array.isArray(client.policies) ? client.policies : [];
  const deps = Array.isArray(client.dependents) ? client.dependents : [];
  const other = Object.entries(client.data ?? {}).filter(
    ([k, v]) => !HIDDEN_FIELDS.has(k) && v !== null && v !== '' && typeof v !== 'object' && !/(tel|cel|phone|whats|movil)/i.test(k)
  );

  async function showSecrets() {
    try {
      const rows = await policySecrets(client.id);
      setSecrets(Object.fromEntries(rows.map((r) => [r.policy_external_id, r.clave_seguridad])));
      trackEvent('clients.secret_viewed', { entityType: 'clients', entityId: client.id });
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: compact ? '0.95rem' : '1.05rem' }}>
          {client.full_name || 'Sin nombre'} {client.archived && <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>(archivado)</span>}
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 2 }}>
          {(client.phones ?? []).map((p) => (
            <span key={p}>📞 {p}</span>
          ))}
          {client.email && <span>✉️ {client.email}</span>}
          {client.birth_date && <span>🎂 {fmtValue(client.birth_date)}</span>}
          {client.operator_name && <span>👤 Operador: {client.operator_name}</span>}
        </div>
        {showLeads && leads && (
          <div style={{ fontSize: '0.8rem', marginTop: 4 }}>
            {leads.length === 0 ? (
              <span style={{ color: '#d97706' }}>No está en leads</span>
            ) : (
              <>
                En leads:{' '}
                {leads.map((l, i) => (
                  <span key={l.lead_id}>
                    {i > 0 && ', '}
                    <a href={`/leads/${l.lead_id}`}>{l.name || 'Lead'}</a>
                  </span>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong style={{ fontSize: '0.85rem' }}>Pólizas ({policies.length})</strong>
          {policies.length > 0 && can('clients.sensitive') && !secrets && (
            <button className="btn btn-secondary" style={{ height: 26, fontSize: '0.74rem' }} onClick={showSecrets}>
              🔑 Ver claves
            </button>
          )}
        </div>
        {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.78rem' }}>{error}</p>}
        {policies.length === 0 ? (
          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Sin pólizas.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <th style={th}>Póliza</th>
                  <th style={th}>Compañía / plan</th>
                  <th style={th}>Estado</th>
                  <th style={th}>Prima</th>
                  <th style={th}>Crédito fiscal</th>
                  <th style={th}>Cobertura</th>
                  <th style={th}>Member ID</th>
                  {secrets && <th style={th}>Clave</th>}
                </tr>
              </thead>
              <tbody>
                {policies.map((p, i) => (
                  <tr key={p.id ?? i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={td}>{p.numero_poliza || '—'}</td>
                    <td style={td}>
                      {p.compania || '—'}
                      {p.plan && <div style={{ color: 'var(--color-text-muted)', fontSize: '0.76rem' }}>{p.plan}</div>}
                    </td>
                    <td style={td}>{p.estado || '—'}</td>
                    <td style={td}>{money(p.prima)}</td>
                    <td style={td}>{money(p.credito_fiscal)}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      {fmtValue(p.fecha_inicial_cobertura || p.fecha_efectividad)} – {fmtValue(p.fecha_final_cobertura)}
                    </td>
                    <td style={td}>{p.member_id || '—'}</td>
                    {secrets && <td style={td}>{secrets[String(p.id)] ?? '—'}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <strong style={{ fontSize: '0.85rem' }}>Dependientes ({deps.length})</strong>
        {deps.length === 0 ? (
          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Sin dependientes.</p>
        ) : (
          <ul style={{ paddingLeft: 18, fontSize: '0.82rem', marginTop: 4 }}>
            {deps.map((d, i) => (
              <li key={d.id ?? i}>
                {[d.nombres, d.apellidos].filter(Boolean).join(' ') || 'Sin nombre'}
                {d.relacion && ` · ${d.relacion}`}
                {d.fecha_nacimiento && ` · ${fmtValue(d.fecha_nacimiento)}`}
                {d.aplica === false && ' · no aplica'}
              </li>
            ))}
          </ul>
        )}
      </div>

      {!compact && other.length > 0 && (
        <details>
          <summary style={{ cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}>Otros datos ({other.length})</summary>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 4 }}>
            <tbody>
              {other.map(([k, v]) => (
                <tr key={k} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ ...td, color: 'var(--color-text-muted)', width: '40%' }}>{humanize(k)}</td>
                  <td style={td}>{fmtValue(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
      <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>Información de Asesorías (solo lectura) · actualizada {fmtValue(client.synced_at)}</div>
    </div>
  );
}