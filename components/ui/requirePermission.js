'use client';
// Ruta: components/ui/requirePermission.js
// Protege una página según permisos. Solo mejora la experiencia:
// la protección real está en RLS.
//
//   <RequirePermission perm="leads.import"> … </RequirePermission>
//   <RequirePermission any={['users.view', 'roles.manage']}> … </RequirePermission>
//   <RequirePermission perm="leads.assign" scope="organization"> … </RequirePermission>
//   <RequirePermission platformOwner> … </RequirePermission>

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '../../lib/auth/sessionContext';

export default function RequirePermission({ perm, any, scope, platformOwner, children }) {
  const router = useRouter();
  const { loading, user, can, isPlatformOwner } = useSession();

  let allowed = false;
  if (!loading && user) {
    if (platformOwner) allowed = isPlatformOwner;
    else if (perm) allowed = can(perm, scope);
    else if (any) allowed = any.some((p) => can(p, scope));
    else allowed = true;
  }

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    else if (!allowed) router.replace('/dashboard');
  }, [loading, user, allowed, router]);

  if (loading) {
    return (
      <main style={{ padding: '1.5rem' }}>
        <p>Cargando…</p>
      </main>
    );
  }
  if (!allowed) return null;
  return children;
}