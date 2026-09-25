'use client';
// Ruta: components/settings/settingsTabs.js
// Pestañas de Configuración, visibles según los permisos del usuario.

import { usePathname } from 'next/navigation';
import { useSession } from '../../lib/auth/sessionContext';

export const SETTINGS_TABS = [
  { href: '/settings/usuarios', label: 'Usuarios', show: (s) => s.can('users.view') },
  { href: '/settings/sucursales', label: 'Sucursales', show: (s) => s.can('branches.manage') || s.can('settings.manage') },
  { href: '/settings/plantillas', label: 'Roles y permisos', show: (s) => s.can('roles.manage') },
  {
    href: '/settings/leads',
    label: 'Leads',
    show: (s) => ['leads.manage_statuses', 'leads.manage_sources', 'leads.manage_tags', 'leads.manage_fields'].some((p) => s.can(p)),
  },
  { href: '/settings/embudos', label: 'Embudos', show: (s) => s.can('funnels.manage') },
  { href: '/settings/actividad', label: 'Actividad', show: (s) => s.can('audit.view') },
  { href: '/settings/chat-auditoria', label: 'Auditoría de chat', show: (s) => s.can('chat.audit') },
  { href: '/settings/numeros', label: 'Números', show: (s) => s.isPlatformOwner || s.can('calls.manage_numbers') },
  { href: '/settings/minutos', label: 'Minutos', show: (s) => s.can('calls.manage_minutes') },
  { href: '/settings/organizaciones', label: 'Organizaciones', show: (s) => s.isPlatformOwner },
  { href: '/settings', label: 'Mi cuenta', show: () => true },
];

export default function SettingsTabs() {
  const pathname = usePathname();
  const session = useSession();
  return (
    <nav className="tabs-bar" style={{ flexWrap: 'wrap' }}>
      {SETTINGS_TABS.filter((t) => t.show(session)).map((t) => (
        <a key={t.href} href={t.href} className={`tab-link${pathname === t.href ? ' active' : ''}`}>
          {t.label}
        </a>
      ))}
    </nav>
  );
}

export function SettingsHeader({ title, subtitle, action }) {
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700 }}>{title}</h1>
          {subtitle && <p style={{ fontSize: '0.86rem', color: 'var(--color-text-muted)', marginTop: 4 }}>{subtitle}</p>}
        </div>
        {action}
      </div>
      <SettingsTabs />
    </>
  );
}

// Mensaje de error de Supabase / Edge Function en texto legible
export async function errorText(error, fallback = 'Ocurrió un error.') {
  if (!error) return null;
  try {
    const body = await error.context?.json?.();
    if (body?.error) return body.error;
  } catch {}
  if (error.code === '23505') return 'Ya existe un registro con ese nombre.';
  if (error.code === '42501' || error.message?.includes('row-level security')) return 'No tienes permiso para esta acción.';
  return error.message || fallback;
}

export const cell = { padding: '0.55rem 0.75rem', verticalAlign: 'middle' };
export const headRow = { textAlign: 'left', color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-border)', fontSize: '0.8rem' };
export const bodyRow = { borderBottom: '1px solid var(--color-border)' };