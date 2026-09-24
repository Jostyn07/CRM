'use client';
// Ruta: components/ui/requireOwner.js
// Compatibilidad con las páginas existentes: "owner" es el Platform Owner.
import RequirePermission from './requirePermission';

export default function RequireOwner({ children }) {
  return <RequirePermission platformOwner>{children}</RequirePermission>;
}