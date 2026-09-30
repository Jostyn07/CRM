'use client';
// Ruta: components/ui/topBar.js
// Barra superior de todas las pantallas: menú (móvil), notificaciones,
// tema claro/oscuro y el usuario con su organización.

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '../../lib/auth/sessionContext';
import { useTheme } from '../../lib/theme/themeContext';
import { signOut } from '../../lib/supabase/auth';
import NotificationsBell from './notificationsBell';
import Icon from './icon';
import Avatar from './avatar';
import { toggleSidebar } from './sidebar';

export default function TopBar() {
  const router = useRouter();
  const { user, profile, organization, activeBranch, branches, isPlatformOwner } = useSession();
  const { resolvedTheme, toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  if (!user) return null;
  const name = profile?.full_name || user.email;
  const where = organization?.name ?? (isPlatformOwner ? 'Platform Owner' : '');
  const branch = activeBranch?.name ?? (branches.length === 1 ? branches[0].name : null);

  return (
    <header className="topbar">
      <button className="topbar-icon topbar-menu" onClick={() => toggleSidebar()} aria-label="Abrir menú">
        <Icon name="menu" size={20} />
      </button>
      {profile?.organization_id && <NotificationsBell userId={user.id} />}
      <button className="topbar-icon" onClick={toggleTheme} title={resolvedTheme === 'light' ? 'Tema oscuro' : 'Tema claro'} aria-label="Cambiar tema">
        <Icon name={resolvedTheme === 'light' ? 'moon' : 'sun'} size={20} />
      </button>
      <div ref={ref} style={{ position: 'relative', marginLeft: 6 }}>
        <button className="topbar-user" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open}>
          <Avatar name={name} size={40} gold />
          <span className="topbar-user-text" style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 650, fontSize: '0.92rem', whiteSpace: 'nowrap' }}>{name}</div>
            <div style={{ fontSize: '0.76rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{branch ? `${where} · ${branch}` : where}</div>
          </span>
          <Icon name="chevron-down" size={16} style={{ color: 'var(--color-text-muted)' }} />
        </button>
        {open && (
          <div className="pop" role="menu">
            <a className="pop-item" href="/settings">
              <Icon name="user" size={15} />
              Mi cuenta
            </a>
            <button
              className="pop-item"
              style={{ color: 'var(--color-danger)' }}
              onClick={async () => {
                await signOut();
                router.push('/login');
              }}
            >
              <Icon name="log-out" size={15} />
              Cerrar sesión
            </button>
          </div>
        )}
      </div>
    </header>
  );
}