'use client';
// Ruta: components/ui/appShell.js

import { usePathname } from 'next/navigation';
import { useSession } from '../../lib/auth/sessionContext';

const NO_SIDEBAR = ['/login', '/', '/set-password', '/auth/aceptar-invitacion', '/registro'];

export default function AppShell({ children }) {
  const pathname = usePathname();
  const { user } = useSession();
  const hideSidebar = NO_SIDEBAR.includes(pathname) || !user;

  return (
    <div style={{ marginLeft: hideSidebar ? 0 : 'var(--sidebar-width)', minHeight: '100vh' }}>
      {children}
    </div>
  );
}
