'use client';
// Ruta: components/ui/requireAdmin.js
// Compatibilidad con las páginas existentes: "admin" ahora significa
// tener algún permiso de administración de la organización.
import RequirePermission from './requirePermission';

export default function RequireAdmin({ children }) {
  return (
    <RequirePermission any={['users.manage', 'roles.manage', 'settings.manage', 'branches.manage']}>
      {children}
    </RequirePermission>
  );
}