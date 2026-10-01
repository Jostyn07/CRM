'use client';
// Ruta: app/settings/sso/page.js
// Inicio de sesión externo (SSO): claves de API para que otra plataforma
// (p. ej. Asesorías) envíe a sus usuarios directo a Xiris con la sesión
// abierta. La clave se muestra una sola vez y se guarda solo su huella.

import { useCallback, useEffect, useState } from 'react';
import RequirePermission from '../../../components/ui/requirePermission';
import Icon, { IconText } from '../../../components/ui/icon';
import { SettingsHeader, bodyRow, cell, errorText, headRow } from '../../../components/settings/settingsTabs';
import { supabase } from '../../../lib/supabase/client';
import { relTime } from '../../../lib/leads/format';
import { trackEvent } from '../../../lib/activity/tracker';

const FN_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/sso`;

export default function SsoSettingsPage() {
  return (
    <RequirePermission perm="sso.manage">
      <SsoSettings />
    </RequirePermission>
  );
}

function SsoSettings() {
  const [rows, setRows] = useState(null);
  const [name, setName] = useState('');
  const [path, setPath] = useState('/dashboard');
  const [created, setCreated] = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.rpc('sso_list_clients');
    if (e) setError(await errorText(e));
    else setRows(data ?? []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('sso_create_client', { p_name: name, p_default_path: path || '/dashboard' });
    setBusy(false);
    if (err) return setError(await errorText(err));
    setCreated({ name, key: data.key });
    setName('');
    trackEvent('sso.client_created');
    load();
  }

  async function revoke(r) {
    if (!window.confirm(`¿Revocar la clave "${r.name}"? La otra plataforma dejará de poder iniciar sesiones en Xiris.`)) return;
    const { error: err } = await supabase.rpc('sso_revoke_client', { p_id: r.id });
    if (err) return setError(await errorText(err));
    trackEvent('sso.client_revoked');
    load();
  }

  const example = `POST ${FN_URL}
x-api-key: <clave>
Content-Type: application/json

{ "action": "issue", "email": "usuario@empresa.com", "redirect": "/tareas" }

→ { "url": "https://…/auth/sso?t=…", "expires_in": 60 }`;

  return (
    <main style={{ padding: '1.5rem', maxWidth: 1000 }}>
      <SettingsHeader title="Inicio de sesión externo" subtitle="Permite que otra plataforma envíe a sus usuarios directo a Xiris, con la sesión abierta y sin escribir la contraseña." />

      {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.86rem', marginBottom: 10 }}>{error}</p>}

      {created && (
        <div className="card" style={{ marginBottom: '1rem', borderColor: 'var(--color-primary)' }}>
          <h3 style={{ fontSize: '0.95rem', marginBottom: 6 }}>
            <IconText name="key-round" size={16}>Clave creada para {created.name}</IconText>
          </h3>
          <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginBottom: 8 }}>Cópiala ahora y guárdala en el servidor de la otra plataforma: no se volverá a mostrar.</p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <code style={{ flex: '1 1 400px', padding: '0.6rem 0.8rem', borderRadius: 10, background: 'var(--color-btn-secondary-bg-hover)', fontSize: '0.8rem', wordBreak: 'break-all' }}>{created.key}</code>
            <button
              className="btn btn-secondary"
              onClick={async () => {
                await navigator.clipboard.writeText(created.key).catch(() => {});
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              <IconText name={copied ? 'check' : 'copy'} size={15}>{copied ? 'Copiada' : 'Copiar'}</IconText>
            </button>
            <button className="btn btn-secondary" onClick={() => setCreated(null)}>
              Listo
            </button>
          </div>
        </div>
      )}

      <form className="card" onSubmit={create} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <label style={{ flex: '1 1 220px' }}>
          <span style={{ fontSize: '0.82rem' }}>Plataforma</span>
          <input className="input" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Asesorías" />
        </label>
        <label style={{ flex: '1 1 180px' }}>
          <span style={{ fontSize: '0.82rem' }}>Página de llegada</span>
          <input className="input" value={path} onChange={(e) => setPath(e.target.value)} placeholder="/dashboard" />
        </label>
        <button className="btn btn-primary" disabled={busy}>
          <Icon name="plus" size={16} />
          {busy ? 'Creando…' : 'Crear clave'}
        </button>
      </form>

      <div className="card" style={{ padding: 0, marginBottom: '1rem' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
          <thead>
            <tr style={headRow}>
              <th style={cell}>Plataforma</th>
              <th style={cell}>Clave</th>
              <th style={cell}>Llegada</th>
              <th style={cell}>Último uso</th>
              <th style={cell}>Estado</th>
              <th style={cell} />
            </tr>
          </thead>
          <tbody>
            {rows === null && (
              <tr>
                <td colSpan={6} style={{ ...cell, textAlign: 'center' }}>
                  Cargando…
                </td>
              </tr>
            )}
            {rows?.length === 0 && (
              <tr>
                <td colSpan={6} style={{ ...cell, textAlign: 'center', color: 'var(--color-text-muted)' }}>
                  Aún no hay claves.
                </td>
              </tr>
            )}
            {rows?.map((r) => (
              <tr key={r.id} style={bodyRow}>
                <td style={{ ...cell, fontWeight: 600 }}>{r.name}</td>
                <td style={cell}>
                  <code>{r.key_prefix}…</code>
                </td>
                <td style={cell}>{r.default_path}</td>
                <td style={cell}>{r.last_used_at ? relTime(r.last_used_at) : '—'}</td>
                <td style={cell}>{r.active ? 'Activa' : 'Revocada'}</td>
                <td style={{ ...cell, textAlign: 'right' }}>
                  {r.active && (
                    <button className="btn btn-secondary" style={{ color: 'var(--color-danger)' }} onClick={() => revoke(r)}>
                      Revocar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3 style={{ fontSize: '0.95rem', marginBottom: 8 }}>Cómo se conecta</h3>
        <ol style={{ fontSize: '0.85rem', lineHeight: 1.7, paddingLeft: 18, margin: '0 0 10px' }}>
          <li>El usuario hace clic en "Ir a Xiris" en la otra plataforma.</li>
          <li>El <strong>servidor</strong> de esa plataforma (nunca el navegador) pide un acceso con la clave y el correo del usuario.</li>
          <li>Xiris responde una URL de un solo uso que vence en 60 segundos, y la otra plataforma redirige al usuario allí.</li>
          <li>El usuario queda dentro de Xiris con su propia cuenta, rol y sucursales.</li>
        </ol>
        <pre style={{ fontSize: '0.78rem', padding: '0.8rem', borderRadius: 10, background: 'var(--color-btn-secondary-bg-hover)', overflowX: 'auto', margin: 0 }}>{example}</pre>
        <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: 8 }}>
          El correo debe ser el de un usuario activo de esta organización en Xiris. Si la clave se filtra, revócala y crea otra.
        </p>
      </div>
    </main>
  );
}