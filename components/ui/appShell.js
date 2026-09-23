'use client';

import { usePathname } from 'next/navigation';

export default function AppShell({ children }) {
  const pathname = usePathname();
  const hideSidebar = pathname === '/login' || pathname === '/';

  return (
    <div style={{ marginLeft: hideSidebar ? 0 : 'var(--sidebar-width)', minHeight: '100vh' }}>
      {children}
    </div>
  );
}

//
