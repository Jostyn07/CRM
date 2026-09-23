'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase/client';
import { signOut } from '../../lib/supabase/auth';
import ThemeToggle from './themeToggle';

const LINKS = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/leads', label: 'Leads', icon: '👥' },
  { href: '/llamadas', label: 'Llamadas', icon: '📞' },
  { href: '/comunicacion', label: 'Comunicación', icon: '💬' },
  { href: '/funnels', label: 'Embudos', icon: '🔀' },
  { href: '/imports', label: 'Importar', icon: '📥', ownerOnly: true },
];

const SETTINGS_LINKS = [
  { href: '/settings/usuarios', label: 'Usuarios' },
  { href: '/settings/plantillas', label: 'Plantillas' },
  { href: '/settings/organizaciones', label: 'Organizaciones', ownerOnly: true },
  { href: '/settings', label: 'Preferencias' },
  { href: '/settings/integraciones', label: 'Integraciones' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(pathname?.startsWith('/settings'));

  useEffect(() => {
    if (pathname === '/login' || pathname === '/') return;
    loadProfile();
  }, [pathname]);

  useEffect(() => {
    if (pathname?.startsWith('/settings')) setSettingsOpen(true);
  }, [pathname]);

  async function loadProfile() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase.from('profiles').select('full_name, role').eq('id', user.id).single();
    setProfile({ email: user.email, fullName: data?.full_name, role: data?.role || 'user' });
  }

  async function handleSignOut() {
    await signOut();
    router.push('/login');
  }

  if (pathname === '/login' || pathname === '/') return null;

  const displayName = profile?.fullName || profile?.email || 'Cuenta';
  const isAdmin = profile?.role === 'admin';
  const isOwner = profile?.role === 'owner';
  const canSeeSettings = isAdmin || isOwner;

  return (
    <aside
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        bottom: 0,
        width: 'var(--sidebar-width)',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--color-sidebar-bg)',
        borderRight: '1px solid var(--color-border)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        zIndex: 30,
      }}
    >
      <div
        style={{
          padding: '1.1rem 1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontWeight: 700, fontSize: '1.05rem' }}>Leads</span>
        <ThemeToggle />
      </div>

      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, padding: '0 0.6rem', overflowY: 'auto' }}>
        {LINKS.filter((link) => (!link.adminOnly || isAdmin) && (!link.ownerOnly || isOwner)).map((link) => {
          const active = pathname?.startsWith(link.href);
          return (
            <a
              key={link.href}
              href={link.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                height: 44,
                padding: '0 0.85rem',
                borderRadius: 'var(--radius)',
                fontSize: '0.9rem',
                fontWeight: active ? 600 : 400,
                background: active ? 'var(--color-active-bg)' : 'transparent',
                color: active ? 'var(--color-active-text)' : 'var(--color-text)',
                boxShadow: active ? 'inset 3px 0 0 var(--color-primary)' : 'none',
              }}
            >
              <span aria-hidden>{link.icon}</span>
              {link.label}
            </a>
          );
        })}

        {canSeeSettings && (
          <div>
            <button
              onClick={() => setSettingsOpen((v) => !v)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                height: 44,
                padding: '0 0.85rem',
                borderRadius: 'var(--radius)',
                fontSize: '0.9rem',
                background: 'transparent',
                border: 'none',
                color: 'var(--color-text)',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span aria-hidden>⚙️</span>
                Configuración
              </span>
              <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>{settingsOpen ? '▾' : '▸'}</span>
            </button>

            {settingsOpen && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingLeft: '1.7rem', marginTop: 2 }}>
                {SETTINGS_LINKS.filter((link) => !link.ownerOnly || isOwner).map((link) => {
                  const active = pathname === link.href;
                  return (
                    <a
                      key={link.href}
                      href={link.href}
                      style={{
                        height: 36,
                        display: 'flex',
                        alignItems: 'center',
                        padding: '0 0.6rem',
                        borderRadius: 'var(--radius)',
                        fontSize: '0.85rem',
                        background: active ? 'var(--color-active-bg)' : 'transparent',
                        color: active ? 'var(--color-active-text)' : 'var(--color-text-muted)',
                        fontWeight: active ? 600 : 400,
                      }}
                    >
                      {link.label}
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </nav>

      {/* Usuario, esquina inferior. Click → menú con opción de cerrar sesión. */}
      <div style={{ position: 'relative', padding: '0.75rem', borderTop: '1px solid var(--color-border)' }}>
        {menuOpen && (
          <div
            className="card"
            style={{ position: 'absolute', bottom: '100%', left: '0.75rem', right: '0.75rem', marginBottom: 8, padding: '0.5rem' }}
          >
            <button
              onClick={handleSignOut}
              className="btn btn-secondary"
              style={{ width: '100%', color: 'var(--color-danger)', justifyContent: 'flex-start' }}
            >
              Cerrar sesión
            </button>
          </div>
        )}
        <button
          onClick={() => setMenuOpen((v) => !v)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            width: '100%',
            background: 'none',
            border: 'none',
            color: 'var(--color-text)',
            padding: '0.4rem',
            borderRadius: 'var(--radius)',
            textAlign: 'left',
          }}
        >
          <span
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: 'var(--color-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.8rem',
              flexShrink: 0,
              color: '#fff',
            }}
          >
            {displayName.charAt(0).toUpperCase()}
          </span>
          <span style={{ fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {displayName}
          </span>
        </button>
      </div>
    </aside>
  );
}