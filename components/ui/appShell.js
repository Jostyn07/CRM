'use client';
// Ruta: components/ui/appShell.js

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from '../../lib/auth/sessionContext';
import TopBar from './topBar';

const NO_SIDEBAR = ['/login', '/', '/set-password', '/auth/aceptar-invitacion', '/auth/sso', '/registro'];

export default function AppShell({ children }) {
  const pathname = usePathname();
  const { user } = useSession();
  // Pantallas a pantalla completa (sin menú ni barra superior)
  const fullScreen = pathname?.startsWith('/whatsapp') || pathname?.startsWith('/comunicacion');
  const hideSidebar = NO_SIDEBAR.includes(pathname) || fullScreen || !user;

  // Última página visitada fuera de WhatsApp (para el botón "Salir")
  useEffect(() => {
    if (!pathname || fullScreen || NO_SIDEBAR.includes(pathname)) return;
    try {
      sessionStorage.setItem('xiris.lastPath', window.location.pathname + window.location.search);
    } catch {}
  }, [pathname, fullScreen]);

  return (
    <div style={{ marginLeft: hideSidebar ? 0 : 'var(--sidebar-width)', minHeight: '100vh' }}>
      {!hideSidebar && <TopBar />}
      {children}
    </div>
  );
}