'use client';
// Ruta: components/ui/sidebar.js
// Menú según permisos efectivos + selector de sucursal activa.

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from '../../lib/supabase/auth';
import { useSession } from '../../lib/auth/sessionContext';
import ThemeToggle from './themeToggle';

// show(session) decide si el enlace aparece
const LINKS = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊', show: () => true },
  { href: '/leads', label: 'Leads', icon: '👥', show: (s) => s.can('leads.view') },
  { href: '/llamadas', label: 'Llamadas', icon: '📞', show: (s) => s.can('leads.view') },
  { href: '/comunicacion', label: 'Comunicación', icon: '💬', show: (s) => !!s.profile },
  { href: '/funnels', label: 'Embudos', icon: '🔀', show: (s) => s.can('leads.view') },
  { href: '/imports', label: 'Importar', icon: '📥', show: (s) => s.can('leads.import') },
];

const SETTINGS_LINKS = [
  { href: '/settings/usuarios', label: 'Usuarios', show: (s) => s.can('users.view') },
  { href: '/settings/actividad', label: 'Actividad', show: (s) => s.can('audit.view') },
  { href: '/settings/plantillas', label: 'Plantillas', show: (s) => s.can('roles.manage') },
  { href: '/settings/numeros', label: 'Números', show: (s) => s.can('settings.manage') },
  { href: '/settings/integraciones', label: 'Integraciones', show: (s) => s.can('settings.manage') },
  { href: '/settings/organizaciones', label: 'Organizaciones', show: (s) => s.isPlatformOwner },
  { href: '/settings', label: 'Preferencias', show: () => true },
];

const HIDDEN_ON = ['/login', '/', '/set-password', '/auth/aceptar-invitacion'];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const session = useSession();
  const { user, profile, organization, branches, activeBranchId, setActiveBranchId, isPlatformOwner } = session;
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(pathname?.startsWith('/settings'));

  useEffect(() => {
    if (pathname?.startsWith('/settings')) setSettingsOpen(true);
  }, [pathname]);

  async function handleSignOut() {
    await signOut();
    router.push('/login');
  }

  if (HIDDEN_ON.includes(pathname) || !user) return null;

  const displayName = profile?.full_name || user.email || 'Cuenta';
  const links = LINKS.filter((l) => l.show(session));
  const settingsLinks = SETTINGS_LINKS.filter((l) => l.show(session));

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
      <div style={{ padding: '1.1rem 1rem 0.6rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>Leads</div>
          <div
            style={{
              fontSize: '0.75rem',
              color: 'var(--color-text-muted)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {organization?.name ?? (isPlatformOwner ? 'Platform Owner' : '')}
          </div>
        </div>
        <ThemeToggle />
      </div>

      {branches.length > 1 && (
        <div style={{ padding: '0 0.85rem 0.6rem' }}>
          <select
            className="input"
            value={activeBranchId ?? ''}
            onChange={(e) => setActiveBranchId(e.target.value || null)}
            aria-label="Sucursal activa"
            style={{ fontSize: '0.82rem', height: 34 }}
          >
            <option value="">Todas mis sucursales</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {branches.length === 1 && (
        <div style={{ padding: '0 1rem 0.6rem', fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
          📍 {branches[0].name}
        </div>
      )}

      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, padding: '0 0.6rem', overflowY: 'auto' }}>
        {links.map((link) => {
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

        {settingsLinks.length > 0 && (
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
                {settingsLinks.map((link) => {
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