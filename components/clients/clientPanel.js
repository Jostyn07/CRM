'use client';
// Ruta: components/clients/clientPanel.js
// Panel lateral "Ficha del cliente" de la página Clientes: datos, pólizas,
// dependientes y otros datos de Asesorías (solo lectura). La clave de
// seguridad solo se muestra a quien tiene clients.sensitive.

import { useEffect, useState } from 'react';
import { useSession } from '../../lib/auth/sessionContext';
import Icon, { IconText } from '../ui/icon';
import { trackEvent } from '../../lib/activity/tracker';
import { HIDDEN_FIELDS, MAIN_FIELDS, fmtValue, humanize, matchingLeads, money, policySecrets } from '../../lib/clients/api';

export function statusTone(s) {
  const v = String(s || '').toLowerCase();
  if (!v) return 'muted';
  if (/activ|vigente|aprobad|efectiv/.test(v) && !/inactiv/.test(v)) return 'ok';
  if (/pendien|proceso|revisi|espera/.test(v)) return 'warn';
  if (/cancel|rechaz|vencid|terminad|baja/.test(v)) return 'bad';
  return 'muted';
}

export function StatusPill({ value }) {
  if (!value) return <span className="cl-pill muted">No informado</span>;
  return <span className={`cl-pill ${statusTone(value)}`}>{value}</span>;
}

const initials = (n) =>
  String(n || '')
    .replace(/[^\p{L}\s]/gu, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || '?';

export default function ClientPanel({ client, onClose }) {
  const { can } = useSession();
  const [secrets, setSecrets] = useState(null);
  const [leads, setLeads] = useState(null);
  const [error, setError] = useState(null);
  const [showOther, setShowOther] = useState(false);

  useEffect(() => {
    setSecrets(null);
    setError(null);
    setShowOther(false);
    setLeads(null);
    if (client?.id) matchingLeads(client.id).then(setLeads).catch(() => setLeads([]));
  }, [client?.id]);

  if (!client) {
    return (
      <aside className="card cl-panel cl-panel-empty">
        <Icon name="contact" size={28} />
        <strong>Ficha del cliente</strong>
        <span>Elige un cliente de la lista para ver sus datos, pólizas y dependientes.</span>
      </aside>
    );
  }

  const policies = Array.isArray(client.policies) ? client.policies : [];
  const deps = Array.isArray(client.dependents) ? client.dependents : [];
  const data = client.data ?? {};
  const mainKeys = new Set(MAIN_FIELDS.map(([k]) => k));
  const main = MAIN_FIELDS.filter(([k]) => data[k] !== null && data[k] !== undefined && data[k] !== '');
  const other = Object.entries(data).filter(
    ([k, v]) => !HIDDEN_FIELDS.has(k) && !mainKeys.has(k) && v !== null && v !== '' && typeof v !== 'object' && !/(tel|cel|phone|whats|movil)/i.test(k)
  );
  const extra = [...main.map(([k, l]) => [l, k === 'ingreso_anual' ? money(data[k]) : fmtValue(data[k])]), ...other.map(([k, v]) => [humanize(k), fmtValue(v)])];

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
    <aside className="card cl-panel">
      <header className="cl-panel-head">
        <strong>Ficha del cliente</strong>
        {onClose && (
          <button type="button" className="cl-icon-btn" onClick={onClose} title="Ocultar ficha">
            <Icon name="x" size={17} />
          </button>
        )}
      </header>

      <section className="cl-sec">
        <div className="cl-hero">
          <span className="cl-avatar">{initials(client.full_name)}</span>
          <h2>
            {client.full_name || 'Sin nombre'}
            {client.archived && <small> (archivado)</small>}
          </h2>
        </div>
        <div className="cl-links">
          {leads === null ? null : leads.length ? (
            leads.map((l) => (
              <a key={l.lead_id} href={`/leads/${l.lead_id}?tab=cliente`}>
                <Icon name="link" size={14} /> Ver lead: <b>{l.name || 'Lead'}</b> <Icon name="external-link" size={13} />
              </a>
            ))
          ) : (
            <span className="cl-muted">
              <Icon name="link" size={14} /> Sin lead vinculado
            </span>
          )}
          {client.operator_name && (
            <span className="cl-muted">
              <Icon name="user" size={14} /> Operador: {client.operator_name}
            </span>
          )}
        </div>
      </section>

      <section className="cl-sec">
        <h3>Datos del cliente</h3>
        <div className="cl-facts">
          {(client.phones ?? []).map((p) => (
            <Fact key={p} icon="phone" label="Teléfono" value={p} />
          ))}
          {client.email && <Fact icon="mail" label="Correo electrónico" value={client.email} />}
          {client.birth_date && <Fact icon="calendar" label="Fecha de nacimiento" value={fmtValue(client.birth_date)} />}
          {!client.phones?.length && !client.email && !client.birth_date && <span className="cl-muted">Sin datos de contacto.</span>}
        </div>
      </section>

      <section className="cl-sec">
        <div className="cl-sec-row">
          <h3>Pólizas ({policies.length})</h3>
          {policies.length > 0 && can('clients.sensitive') && !secrets && (
            <button className="btn btn-secondary cl-small-btn" onClick={showSecrets}>
              <IconText name="key-round" size={14}>Ver claves</IconText>
            </button>
          )}
        </div>
        {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.78rem' }}>{error}</p>}
        {policies.length === 0 ? (
          <span className="cl-muted">Sin pólizas.</span>
        ) : (
          <div className="cl-policies">
            {policies.map((p, i) => (
              <div key={p.id ?? i} className="cl-policy">
                <div className="cl-policy-top">
                  <div>
                    <small>Compañía</small>
                    <strong>{p.compania || '—'}</strong>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <small>Estado</small>
                    <StatusPill value={p.estado_compania || p.estado} />
                  </div>
                </div>
                <div className="cl-kv">
                  <small>Plan</small>
                  <span>{p.plan || '—'}</span>
                </div>
                {p.estado_mercado && (
                  <div className="cl-kv">
                    <small>Estado en el Mercado</small>
                    <span>{p.estado_mercado}</span>
                  </div>
                )}
                <hr />
                <div className="cl-kv">
                  <small>Número de póliza</small>
                  <span>{p.numero_poliza || '—'}</span>
                </div>
                <div className="cl-grid2">
                  <div className="cl-kv">
                    <small>Inicio de cobertura</small>
                    <span>{fmtValue(p.fecha_inicial_cobertura || p.fecha_efectividad)}</span>
                  </div>
                  <div className="cl-kv">
                    <small>Fin de cobertura</small>
                    <span>{fmtValue(p.fecha_final_cobertura)}</span>
                  </div>
                </div>
                <div className="cl-grid2">
                  <div className="cl-money">
                    <small>Prima</small>
                    <b>{money(p.prima)}</b>
                  </div>
                  <div className="cl-money">
                    <small>Crédito fiscal</small>
                    <b>{money(p.credito_fiscal)}</b>
                  </div>
                </div>
                <div className="cl-grid2">
                  <div className="cl-kv">
                    <small>Member ID</small>
                    <span>{p.member_id || 'No informado'}</span>
                  </div>
                  <div className="cl-kv">
                    <small>Pagado hasta</small>
                    <span>{fmtValue(p.pagado_hasta)}</span>
                  </div>
                </div>
                {(p.documentos_pendientes || p.estado_documentos) && (
                  <div className="cl-kv">
                    <small>Documentos</small>
                    <span style={p.documentos_pendientes ? { color: '#b7791f' } : undefined}>
                      {p.documentos_pendientes || p.estado_documentos}
                      {p.fecha_plazo_documentos && ` (plazo ${fmtValue(p.fecha_plazo_documentos)})`}
                    </span>
                  </div>
                )}
                {secrets && (
                  <div className="cl-kv">
                    <small>Clave</small>
                    <span>{secrets[String(p.id)] ?? '—'}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="cl-sec">
        <h3>Dependientes ({deps.length})</h3>
        {deps.length === 0 ? (
          <span className="cl-muted">
            <Icon name="users" size={14} /> Sin dependientes
          </span>
        ) : (
          <ul className="cl-deps">
            {deps.map((d, i) => (
              <li key={d.id ?? i}>
                <strong>{[d.nombres, d.apellidos].filter(Boolean).join(' ') || 'Sin nombre'}</strong>
                <span>{[d.relacion, d.sexo, d.fecha_nacimiento && fmtValue(d.fecha_nacimiento), d.aplica === false && 'no aplica'].filter(Boolean).join(' · ')}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {extra.length > 0 && (
        <section className="cl-sec">
          <button type="button" className="cl-other-btn" onClick={() => setShowOther((v) => !v)} aria-expanded={showOther}>
            <h3>Otros datos ({extra.length})</h3>
            <Icon name={showOther ? 'chevron-down' : 'chevron-right'} size={16} />
          </button>
          {showOther && (
            <div className="cl-other">
              {extra.map(([l, v]) => (
                <div key={l} className="cl-kv">
                  <small>{l}</small>
                  <span>{v}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <footer className="cl-panel-foot">
        <span>
          <Icon name="lock" size={12} /> Información de Asesorías · Solo lectura
        </span>
        <span>Actualizada {fmtValue(client.synced_at)}</span>
      </footer>
    </aside>
  );
}

function Fact({ icon, label, value }) {
  return (
    <div className="cl-fact">
      <span className="cl-fact-icon">
        <Icon name={icon} size={16} />
      </span>
      <div>
        <small>{label}</small>
        <span>{value}</span>
      </div>
    </div>
  );
}