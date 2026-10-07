'use client';
// Ruta: app/settings/telefonia/page.js
// Telefonía: conexión con 3CX (admin de organización) y por dónde llama
// cada usuario — Telnyx, 3CX o que él elija (admins de organización y sucursal).

import Icon, { IconText } from '../../../components/ui/icon';
import { useCallback, useEffect, useMemo, useState } from 'react';
import RequirePermission from '../../../components/ui/requirePermission';
import { SettingsHeader } from '../../../components/settings/settingsTabs';
import { useLeadConfig } from '../../../lib/leads/useLeadConfig';
import { trackEvent } from '../../../lib/activity/tracker';
import { relTime } from '../../../lib/leads/format';
import {
  MODES, buildTemplateXml, functionUrl, getPbxStatus, listUserCallSettings, savePbx, setUserCallSetting, testPbx,
} from '../../../lib/calls/pbx';

const label = { display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4 };

export default function TelephonyPage() {
  return (
    <RequirePermission perm="calls.manage_providers">
      <main style={{ padding: '1.5rem', maxWidth: 1100 }}>
        <SettingsHeader title="Telefonía" subtitle="Telnyx y 3CX conviven: elige por dónde llama cada usuario. Las llamadas de ambos quedan en el lead, en reportes y en automatizaciones." />
        <Telephony />
      </main>
    </RequirePermission>
  );
}

function Telephony() {
  const config = useLeadConfig();
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => {
    getPbxStatus()
      .then(setStatus)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  if (!status) return <p>{error ?? 'Cargando…'}</p>;
  return (
    <>
      {status.can_configure && <Connection status={status} branches={config.allBranches} onSaved={setStatus} />}
      {!status.can_configure && !status.connected && (
        <p className="card" style={{ padding: '0.9rem', marginBottom: '1rem', fontSize: '0.88rem' }}>
          3CX todavía no está conectado. Un administrador de la organización debe conectarlo. Mientras tanto, todos llaman por Telnyx.
        </p>
      )}
      <UsersTable status={status} branchMap={config.maps.branch} />
    </>
  );
}

// ---------------------------------------------------------------- Conexión
function Connection({ status, branches, onSaved }) {
  const [form, setForm] = useState({
    baseUrl: status.base_url ?? '',
    defaultBranchId: status.default_branch_id ?? '',
    defaultMode: status.default_mode ?? 'telnyx',
    clientId: status.client_id ?? '',
    clientSecret: '',
    active: status.is_active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);
  const [test, setTest] = useState(null);
  const [showKey, setShowKey] = useState(false);
  const set = (p) => setForm((f) => ({ ...f, ...p }));

  async function save(extra = {}) {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const st = await savePbx({ ...form, clientSecret: form.clientSecret || null, ...extra });
      onSaved(st);
      set({ clientSecret: '' });
      setMsg(extra.rotateKey ? 'Nueva clave generada. Descarga la plantilla otra vez y súbela a 3CX.' : 'Guardado.');
      trackEvent('pbx.saved', { metadata: { rotate: !!extra.rotateKey } });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function runTest() {
    setTest({ running: true });
    try {
      setTest(await testPbx());
    } catch (e) {
      setTest({ error: e.message });
    }
  }

  function download() {
    const xml = buildTemplateXml(status.lookup_key);
    const blob = new Blob([xml], { type: 'application/xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'plantilla-crm-3cx.xml';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <section className="card" style={{ padding: '1.1rem', marginBottom: '1.2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <h2 style={{ fontSize: '1.05rem' }}><IconText name="phone" size={18}>Conexión con 3CX</IconText></h2>
        {status.connected && (
          <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
            {status.last_event_at ? `Último contacto de 3CX ${relTime(status.last_event_at)}` : '3CX todavía no se ha comunicado'}
          </span>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={label}>Dirección de tu 3CX</label>
            <input className="input" required value={form.baseUrl} onChange={(e) => set({ baseUrl: e.target.value })} placeholder="https://miempresa.3cx.us" />
          </div>
          <div>
            <label style={label}>Sucursal para llamadas sin asesor</label>
            <select className="input" value={form.defaultBranchId} onChange={(e) => set({ defaultBranchId: e.target.value })}>
              <option value="">La primera sucursal</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={label}>Modo por defecto de los usuarios</label>
            <select className="input" value={form.defaultMode} onChange={(e) => set({ defaultMode: e.target.value })}>
              {Object.entries(MODES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>

        <details style={{ marginBottom: 12 }}>
          <summary style={{ cursor: 'pointer', fontSize: '0.86rem', fontWeight: 600 }}>
            Opcional: API de 3CX (marcar desde la plataforma y traer grabaciones) {status.has_api ? <IconText name="circle-check" size={14} style={{ color: 'var(--color-success, #16a34a)' }}>configurada</IconText> : ''}
          </summary>
          <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', margin: '8px 0' }}>
            Requiere licencia 8SC+ Enterprise. En 3CX: Integraciones › API › Agregar, marca “Call Control API” y “Configuration API” (XAPI), incluye las extensiones de los asesores y copia el Client ID y la API key.
            Sin esto, “Llamar” abre la app de 3CX del asesor y las llamadas se registran igual.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
            <div>
              <label style={label}>Client ID</label>
              <input className="input" value={form.clientId} onChange={(e) => set({ clientId: e.target.value })} autoComplete="off" />
            </div>
            <div>
              <label style={label}>API key {status.has_api ? '(vacío = conservar la actual)' : ''}</label>
              <input className="input" type="password" value={form.clientSecret} onChange={(e) => set({ clientSecret: e.target.value })} autoComplete="new-password" />
            </div>
          </div>
          {status.has_api && (
            <button type="button" className="btn btn-secondary" style={{ marginTop: 8, color: 'var(--color-danger)' }} disabled={busy} onClick={() => save({ clientSecret: '' })}>
              Quitar credenciales de API
            </button>
          )}
        </details>

        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.85rem', marginBottom: 12 }}>
          <input type="checkbox" checked={form.active} onChange={(e) => set({ active: e.target.checked })} />
          Integración activa
        </label>

        {error && <p style={{ color: 'var(--color-danger)', marginBottom: 8 }}>{error}</p>}
        {msg && <p style={{ color: 'var(--color-success, #16a34a)', marginBottom: 8 }}>{msg}</p>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Guardando…' : status.connected ? 'Guardar' : 'Conectar 3CX'}
          </button>
          {status.connected && (
            <button type="button" className="btn btn-secondary" onClick={runTest} disabled={test?.running}>
              {test?.running ? 'Probando…' : 'Probar conexión'}
            </button>
          )}
        </div>
      </form>

      {test && !test.running && (
        <div style={{ marginTop: 10, fontSize: '0.84rem' }}>
          {test.error ? (
            <p style={{ color: 'var(--color-danger)' }}>{test.error}</p>
          ) : (
            <ul style={{ paddingLeft: 18 }}>
              <li><Icon name={test.reachable ? 'circle-check' : 'circle-x'} size={14} style={{ color: test.reachable ? 'var(--color-success, #16a34a)' : 'var(--color-danger)', marginRight: 4 }} /> La central responde en {status.base_url}</li>
              {test.api !== null && <li>{test.api ? <IconText name="circle-check" size={14}>Credenciales de API válidas</IconText> : <IconText name="circle-x" size={14}>{test.api_error}</IconText>}</li>}
              {test.call_control !== null && test.call_control !== undefined && (
                <li>{test.call_control ? <IconText name="circle-check" size={14}>Call Control API (marcar desde la plataforma)</IconText> : <IconText name="circle-x" size={14}>{`Call Control API no disponible (HTTP ${test.call_control_status})`}</IconText>}</li>
              )}
              {test.recordings !== null && test.recordings !== undefined && (
                <li>{test.recordings ? <IconText name="circle-check" size={14}>Acceso a grabaciones</IconText> : <IconText name="circle-x" size={14}>{`Sin acceso a grabaciones (HTTP ${test.recordings_status})`}</IconText>}</li>
              )}
            </ul>
          )}
        </div>
      )}

      {status.connected && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--color-border)' }}>
          <h3 style={{ fontSize: '0.95rem', marginBottom: 6 }}>Plantilla CRM para 3CX</h3>
          <ol style={{ fontSize: '0.83rem', paddingLeft: 18, lineHeight: 1.6, marginBottom: 10 }}>
            <li>Descarga la plantilla (ya lleva la clave de tu organización).</li>
            <li>En 3CX: <strong>Integraciones › CRM › Agregar plantilla</strong> y súbela.</li>
            <li>Selecciónala como CRM, activa “Registrar llamadas” y, en Contactos, la búsqueda de contactos en el CRM.</li>
            <li>En la app de 3CX de cada asesor, activa abrir el contacto del CRM al recibir la llamada.</li>
          </ol>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="btn btn-primary" onClick={download}>
              <IconText name="download" size={16}>Descargar plantilla</IconText>
            </button>
            <button className="btn btn-secondary" onClick={() => setShowKey((v) => !v)}>
              {showKey ? 'Ocultar datos técnicos' : 'Ver datos técnicos'}
            </button>
            <button
              className="btn btn-secondary"
              style={{ color: 'var(--color-danger)' }}
              disabled={busy}
              onClick={() => window.confirm('La plantilla actual dejará de funcionar hasta que subas la nueva. ¿Generar nueva clave?') && save({ rotateKey: true })}
            >
              Generar nueva clave
            </button>
          </div>
          {showKey && (
            <div style={{ marginTop: 10, fontSize: '0.78rem', fontFamily: 'monospace', wordBreak: 'break-all', background: 'var(--color-status-default-bg)', padding: 10, borderRadius: 'var(--radius)' }}>
              <div>Búsqueda: {functionUrl()}?action=lookup&number=[Number]&key={status.lookup_key}</div>
              <div>Búsqueda por texto: {functionUrl()}?action=search&q=[SearchText]&key={status.lookup_key}</div>
              <div>Registro de llamadas (POST JSON): {functionUrl()}?action=journal&key={status.lookup_key}</div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- Usuarios
function UsersTable({ status, branchMap }) {
  const [rows, setRows] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState(null);
  const [msg, setMsg] = useState(null);
  const [q, setQ] = useState('');

  const load = useCallback(() => {
    listUserCallSettings()
      .then((r) => {
        setRows(r);
        setDrafts(Object.fromEntries(r.map((u) => [u.user_id, { mode: u.mode ?? '', extension: u.extension ?? '' }])));
      })
      .catch((e) => setMsg({ error: e.message }));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(
    () => (rows ?? []).filter((u) => !q || `${u.full_name ?? ''} ${u.email}`.toLowerCase().includes(q.toLowerCase())),
    [rows, q]
  );

  async function save(u) {
    const d = drafts[u.user_id];
    setSaving(u.user_id);
    setMsg(null);
    try {
      await setUserCallSetting(u.user_id, d.mode, d.extension);
      trackEvent('pbx.user_setting', { entityType: 'profiles', entityId: u.user_id, metadata: { mode: d.mode || 'default' } });
      setMsg({ ok: `Guardado: ${u.full_name || u.email}` });
      load();
    } catch (e) {
      setMsg({ error: e.message });
    } finally {
      setSaving(null);
    }
  }

  const orgDefault = MODES[status.default_mode ?? 'telnyx'];

  return (
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        <h2 style={{ fontSize: '1.05rem' }}>¿Por dónde llama cada usuario?</h2>
        <input className="input" style={{ maxWidth: 260 }} placeholder="Buscar usuario…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: 10 }}>
        Con “El usuario elige”, el asesor ve los dos botones al llamar. Para 3CX se necesita su número de extensión (también sirve para saber quién atendió cada llamada).
        {!status.connected && ' Conecta 3CX para poder usar esas opciones.'}
      </p>
      {msg?.error && <p style={{ color: 'var(--color-danger)', marginBottom: 8 }}>{msg.error}</p>}
      {msg?.ok && <p style={{ color: 'var(--color-success, #16a34a)', marginBottom: 8 }}>{msg.ok}</p>}
      {rows === null ? (
        <p>Cargando…</p>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-border)', fontSize: '0.78rem' }}>
                <th style={{ padding: '0.55rem 0.7rem' }}>Usuario</th>
                <th style={{ padding: '0.55rem 0.7rem' }}>Sucursal</th>
                <th style={{ padding: '0.55rem 0.7rem' }}>Llama por</th>
                <th style={{ padding: '0.55rem 0.7rem' }}>Extensión 3CX</th>
                <th style={{ padding: '0.55rem 0.7rem' }} />
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => {
                const d = drafts[u.user_id] ?? { mode: '', extension: '' };
                const dirty = (d.mode || null) !== (u.mode || null) || (d.extension || null) !== (u.extension || null);
                return (
                  <tr key={u.user_id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '0.5rem 0.7rem' }}>
                      <div style={{ fontWeight: 600 }}>{u.full_name || u.email}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{u.email}</div>
                    </td>
                    <td style={{ padding: '0.5rem 0.7rem', fontSize: '0.8rem' }}>{(u.branch_ids ?? []).map((b) => branchMap[b]?.name).filter(Boolean).join(', ') || '—'}</td>
                    <td style={{ padding: '0.5rem 0.7rem' }}>
                      <select
                        className="input"
                        style={{ minWidth: 210, height: 34 }}
                        value={d.mode}
                        disabled={!u.can_edit}
                        onChange={(e) => setDrafts((x) => ({ ...x, [u.user_id]: { ...d, mode: e.target.value } }))}
                      >
                        <option value="">Por defecto ({orgDefault})</option>
                        {Object.entries(MODES).map(([k, v]) => (
                          <option key={k} value={k} disabled={k !== 'telnyx' && !status.connected}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: '0.5rem 0.7rem' }}>
                      <input
                        className="input"
                        style={{ width: 110, height: 34 }}
                        inputMode="numeric"
                        placeholder="Ej. 101"
                        value={d.extension}
                        disabled={!u.can_edit}
                        onChange={(e) => setDrafts((x) => ({ ...x, [u.user_id]: { ...d, extension: e.target.value.replace(/\D/g, '') } }))}
                      />
                    </td>
                    <td style={{ padding: '0.5rem 0.7rem' }}>
                      {u.can_edit && (
                        <button className="btn btn-primary" style={{ height: 32 }} disabled={!dirty || saving === u.user_id} onClick={() => save(u)}>
                          {saving === u.user_id ? '…' : 'Guardar'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}