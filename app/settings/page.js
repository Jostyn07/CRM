'use client';
// Ruta: app/settings/page.js
// Mi cuenta: datos del usuario, su organización, sucursales, roles y
// permisos efectivos. El nombre y el teléfono se editan aquí; el correo
// y la contraseña solo los gestiona un administrador.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SettingsHeader, errorText } from '../../components/settings/settingsTabs';
import { supabase } from '../../lib/supabase/client';
import { signOut } from '../../lib/supabase/auth';
import { useSession } from '../../lib/auth/sessionContext';

const SCOPE_LABEL = { own: 'Propio', branch: 'Sucursal', organization: 'Organización' };

export default function AccountPage() {
  const router = useRouter();
  const { user, profile, organization, branches, permissions, isPlatformOwner, loading, refresh } = useSession();
  const [form, setForm] = useState({ full_name: '', phone: '' });
  const [roles, setRoles] = useState([]);
  const [perms, setPerms] = useState([]);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    setForm({ full_name: profile?.full_name ?? '', phone: profile?.phone ?? '' });
  }, [profile]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('user_roles')
      .select('role:roles(name)')
      .eq('user_id', user.id)
      .then(({ data }) => setRoles((data ?? []).map((r) => r.role?.name).filter(Boolean)));
    supabase
      .from('permissions')
      .select('key, description')
      .order('key')
      .then(({ data }) => setPerms(data ?? []));
  }, [user]);

  async function save(e) {
    e.preventDefault();
    const { error } = await supabase.from('profiles').update({ full_name: form.full_name.trim(), phone: form.phone.trim() || null }).eq('id', user.id);
    setMsg(error ? await errorText(error) : 'Datos guardados.');
    if (!error) refresh();
  }

  if (loading) return <main style={{ padding: '1.5rem' }}>Cargando…</main>;

  return (
    <main style={{ padding: '1.5rem', maxWidth: 900 }}>
      <SettingsHeader title="Mi cuenta" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
        <form className="card" onSubmit={save}>
          <h3 style={{ fontSize: '0.95rem', marginBottom: '0.7rem' }}>Datos personales</h3>
          {profile ? (
            <>
              <label style={{ display: 'block', marginBottom: '0.7rem' }}>
                <span style={{ fontSize: '0.82rem' }}>Nombre completo</span>
                <input className="input" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
              </label>
              <label style={{ display: 'block', marginBottom: '0.7rem' }}>
                <span style={{ fontSize: '0.82rem' }}>Teléfono</span>
                <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </label>
            </>
          ) : null}
          <p style={{ fontSize: '0.86rem', marginBottom: '0.7rem' }}>
            <strong>Correo:</strong> {user?.email}
          </p>
          <p style={{ fontSize: '0.76rem', color: 'var(--color-text-muted)', marginBottom: '0.8rem' }}>
            Para cambiar tu correo o tu contraseña, pídeselo a un administrador de tu organización.
          </p>
          {msg && <p style={{ fontSize: '0.84rem', marginBottom: '0.6rem' }}>{msg}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            {profile && <button className="btn btn-primary">Guardar</button>}
            <button
              type="button"
              className="btn btn-secondary"
              style={{ color: 'var(--color-danger)' }}
              onClick={async () => {
                await signOut();
                router.push('/login');
              }}
            >
              Cerrar sesión
            </button>
          </div>
        </form>

        <div className="card">
          <h3 style={{ fontSize: '0.95rem', marginBottom: '0.7rem' }}>Acceso</h3>
          <p style={{ fontSize: '0.86rem', marginBottom: 6 }}>
            <strong>Organización:</strong> {organization?.name ?? (isPlatformOwner ? 'Platform Owner' : '—')}
          </p>
          <p style={{ fontSize: '0.86rem', marginBottom: 6 }}>
            <strong>Rol:</strong> {roles.join(', ') || '—'}
          </p>
          <p style={{ fontSize: '0.86rem', marginBottom: 10 }}>
            <strong>Sucursales:</strong> {branches.map((b) => b.name).join(', ') || '—'}
          </p>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: 4 }}>Permisos efectivos</div>
          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            {perms
              .filter((p) => permissions[p.key])
              .map((p) => (
                <div key={p.key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', padding: '0.2rem 0', borderBottom: '1px solid var(--color-border)' }}>
                  <span>{p.description}</span>
                  <span style={{ color: 'var(--color-text-muted)' }}>{SCOPE_LABEL[permissions[p.key]]}</span>
                </div>
              ))}
          </div>
        </div>
      </div>
    </main>
  );
}
