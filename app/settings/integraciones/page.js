'use client';
// Ruta: app/settings/integraciones/page.js
// Integraciones de la organización. WhatsApp (Wazzup, temporal):
// conectar la API key (se guarda solo en el servidor), sincronizar los
// números, asignar cada número a una sucursal, activarlo y elegir qué
// usuarios pueden verlo y usarlo.

import { useCallback, useEffect, useState } from 'react';
import RequirePermission from '../../../components/ui/requirePermission';
import { SettingsHeader } from '../../../components/settings/settingsTabs';
import { supabase } from '../../../lib/supabase/client';
import { useSession } from '../../../lib/auth/sessionContext';
import { useOrgUsers } from '../../../lib/tasks/useOrgUsers';
import { trackEvent } from '../../../lib/activity/tracker';
import { fullDate } from '../../../lib/leads/format';
import {
  connectWazzup, integrationStatus, listChannelUsers, listChannels, setChannelUser, syncWazzup, updateChannel,
} from '../../../lib/whatsapp/api';

export default function IntegrationsPage() {
  return (
    <RequirePermission perm="whatsapp.manage">
      <main style={{ padding: '1.5rem', maxWidth: 1100 }}>
        <SettingsHeader title="Integraciones" subtitle="Conexiones con servicios externos. Las credenciales se guardan solo en el servidor." />
        <WhatsappSection />
      </main>
    </RequirePermission>
  );
}

function WhatsappSection() {
  const { profile, scopeOf } = useSession();
  const { users, userMap } = useOrgUsers();
  const isOrgAdmin = scopeOf('whatsapp.manage') === 'organization';
  const [status, setStatus] = useState(undefined);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);
  const [channels, setChannels] = useState([]);
  const [access, setAccess] = useState([]);
  const [branches, setBranches] = useState([]);
  const [openCh, setOpenCh] = useState(null);

  const load = useCallback(async () => {
    const [s, ch, acc, br] = await Promise.all([
      integrationStatus(),
      listChannels(),
      listChannelUsers(),
      supabase.from('branches').select('id, name, status').order('name'),
    ]);
    setStatus(s);
    setChannels(ch);
    setAccess(acc);
    setBranches((br.data ?? []).filter((b) => b.status !== 'inactive'));
  }, []);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  async function run(fn, okText) {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const r = await fn();
      setMsg(okText(r));
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const has = (ch, u) => access.some((a) => a.channel_id === ch && a.user_id === u);

  async function toggleUser(ch, u) {
    const on = !has(ch, u);
    setAccess((prev) => (on ? [...prev, { channel_id: ch, user_id: u }] : prev.filter((a) => !(a.channel_id === ch && a.user_id === u))));
    try {
      await setChannelUser(ch, u, profile.organization_id, on);
      trackEvent(on ? 'whatsapp.channel_user_added' : 'whatsapp.channel_user_removed', { entityType: 'wa_channels', entityId: ch, metadata: { user_id: u } });
    } catch (e) {
      setError(e.message);
      load();
    }
  }

  async function patch(ch, values) {
    setError(null);
    try {
      await updateChannel(ch.id, values);
      await load();
    } catch (e) {
      setError(e.message.includes('wa_channels_active_branch') ? 'Asigna una sucursal antes de activar el número.' : e.message);
    }
  }

  const connected = status?.status === 'connected';

  return (
    <div className="card" style={{ display: 'grid', gap: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: '1.6rem' }}>🟢</span>
        <div style={{ flex: 1 }}>
          <h3 style={{ fontSize: '1rem' }}>WhatsApp · Wazzup</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
            Proveedor temporal mientras se aprueba la conexión oficial con Meta. Los mensajes llegan a la bandeja de WhatsApp y a la ficha de cada lead.
          </p>
        </div>
        <span
          style={{
            fontSize: '0.75rem',
            fontWeight: 600,
            padding: '3px 10px',
            borderRadius: 999,
            background: connected ? 'rgba(37,211,102,0.15)' : status?.status === 'error' ? 'rgba(220,38,38,0.12)' : 'var(--color-active-bg)',
            color: connected ? '#15803d' : status?.status === 'error' ? 'var(--color-danger)' : 'var(--color-text-muted)',
          }}
        >
          {status === undefined ? '…' : connected ? 'Conectado' : status?.status === 'error' ? 'Error' : 'Sin conectar'}
        </span>
      </div>

      {status?.last_error && <p style={{ color: 'var(--color-danger)', fontSize: '0.82rem' }}>Último error: {status.last_error}</p>}
      {connected && (
        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
          API key {status.key_hint} · conectado {fullDate(status.connected_at)}
        </p>
      )}

      {isOrgAdmin ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            className="input"
            type="password"
            autoComplete="off"
            placeholder={connected ? 'Nueva API key de Wazzup (opcional)' : 'API key de Wazzup'}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            style={{ flex: 1, minWidth: 260 }}
          />
          <button
            className="btn btn-primary"
            disabled={busy || key.trim().length < 10}
            onClick={() =>
              run(async () => {
                const r = await connectWazzup(key.trim());
                setKey('');
                return r;
              }, (r) => `Conectado. Se encontraron ${r.channels} número(s) de WhatsApp.`)
            }
          >
            {busy ? 'Conectando…' : connected ? 'Cambiar llave' : 'Conectar'}
          </button>
          {connected && (
            <button className="btn btn-secondary" disabled={busy} onClick={() => run(syncWazzup, (r) => `Sincronizado: ${r.channels} número(s).`)}>
              Sincronizar números
            </button>
          )}
        </div>
      ) : (
        <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>Solo el administrador de la organización puede conectar la cuenta y asignar números.</p>
      )}
      <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
        La API key está en Wazzup → Integraciones → API. Al conectar, el webhook de tu cuenta de Wazzup pasa a esta plataforma (reemplaza el que tuviera).
      </p>

      {msg && <p style={{ color: '#15803d', fontSize: '0.85rem' }}>{msg}</p>}
      {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem' }}>{error}</p>}

      {channels.length > 0 && (
        <div>
          <h4 style={{ fontSize: '0.92rem', marginBottom: 6 }}>Números</h4>
          <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)' }}>
            {channels.map((ch) => {
              const allowed = access.filter((a) => a.channel_id === ch.id).map((a) => a.user_id);
              return (
                <div key={ch.id} style={{ borderBottom: '1px solid var(--color-border)', padding: '0.7rem 0.8rem' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                      className="input"
                      style={{ width: 200 }}
                      defaultValue={ch.name ?? ''}
                      disabled={!isOrgAdmin}
                      onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== ch.name && patch(ch, { name: e.target.value.trim() })}
                    />
                    <span style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', minWidth: 130 }}>
                      {ch.phone || '—'} {ch.provider_state && ch.provider_state !== 'active' ? `· ${ch.provider_state}` : ''}
                    </span>
                    <select className="input" style={{ width: 180 }} value={ch.branch_id ?? ''} disabled={!isOrgAdmin} onChange={(e) => patch(ch, { branch_id: e.target.value || null, ...(e.target.value ? {} : { is_active: false }) })}>
                      <option value="">Sin sucursal</option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                    <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.82rem' }}>
                      <input type="checkbox" checked={ch.is_active} disabled={!isOrgAdmin} onChange={(e) => patch(ch, { is_active: e.target.checked })} />
                      Activo
                    </label>
                    <button className="btn btn-secondary" style={{ marginLeft: 'auto' }} onClick={() => setOpenCh(openCh === ch.id ? null : ch.id)}>
                      👥 Quién lo ve ({allowed.length})
                    </button>
                  </div>
                  {openCh === ch.id && (
                    <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 4 }}>
                      {users.map((u) => (
                        <label key={u.id} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.84rem', padding: '3px 0' }}>
                          <input type="checkbox" checked={allowed.includes(u.id)} disabled={!isOrgAdmin} onChange={() => toggleUser(ch.id, u.id)} />
                          {u.name}
                        </label>
                      ))}
                      <p style={{ gridColumn: '1 / -1', fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
                        Cada persona ve las conversaciones de este número según su alcance de WhatsApp (propias, sucursal u organización), que puedes ajustar individualmente en Usuarios → Editar → permisos, sin cambiar su rol.
                        Los administradores de la organización ven todos los números.
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 6 }}>
            Los mensajes de un número solo se registran cuando está <strong>activo</strong> y tiene sucursal. {Object.keys(userMap).length ? '' : ''}
          </p>
        </div>
      )}
    </div>
  );
}