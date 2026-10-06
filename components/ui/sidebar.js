'use client';
// Ruta: components/ui/sidebar.js
// Menú lateral oscuro con acento dorado:
//   · logo de la organización (Configuración › Mi cuenta),
//   · organización + sucursal activa (selector),
//   · enlaces según permisos, con contadores (tareas, WhatsApp, chat),
//   · usuario con su rol y menú (Mi cuenta, tema, cerrar sesión).
// En pantallas pequeñas se abre como panel desde la barra superior.

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from '../../lib/supabase/auth';
import { useSession } from '../../lib/auth/sessionContext';
import { useTheme } from '../../lib/theme/themeContext';
import { useMyTaskCounts } from '../../lib/tasks/api';
import { useChatUnread } from '../../lib/chat/api';
import { useWaUnread } from '../../lib/whatsapp/api';
import Icon from './icon';
import Avatar, { initials } from './avatar';

// show(session) decide si el enlace aparece
const LINKS = [
  { href: '/dashboard', label: 'Dashboard', icon: 'layout-dashboard', show: (s) => s.can('reports.view') },
  { href: '/leads', label: 'Leads', icon: 'users', show: (s) => s.can('leads.view') },
  { href: '/tareas', label: 'Tareas', icon: 'square-check-big', show: (s) => !!s.profile?.organization_id, badge: 'tasks' },
  { href: '/llamadas', label: 'Llamadas', icon: 'phone', show: (s) => s.can('calls.view') || s.can('calls.make') },
  { href: '/whatsapp', label: 'WhatsApp', icon: 'message-circle', show: (s) => s.can('whatsapp.view'), badge: 'wa' },
  { href: '/comunicacion', label: 'Comunicación', icon: 'message-square', show: (s) => !!s.profile?.organization_id, badge: 'chat' },
  { href: '/reportes', label: 'Reportes', icon: 'chart-column', show: (s) => s.can('reports.view') },
  { href: '/clientes', label: 'Clientes', icon: 'id-card', show: (s) => s.can('clients.view') },
  { href: '/funnels', label: 'Embudos', icon: 'kanban', show: (s) => s.can('opportunities.view') },
  { href: '/imports', label: 'Importar', icon: 'upload', show: (s) => s.can('leads.import') },
];

const SETTINGS_LINKS = [
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
  { href: '/settings/telefonia', label: 'Telefonía', show: (s) => s.can('calls.manage_providers') },
  { href: '/settings/minutos', label: 'Minutos', show: (s) => s.can('calls.manage_minutes') },
  { href: '/settings/automatizaciones', label: 'Automatizaciones', show: (s) => s.can('automations.manage') },
  { href: '/settings/ia', label: 'Inteligencia artificial', show: (s) => s.can('ai.manage') },
  { href: '/settings/integraciones', label: 'Integraciones', show: (s) => s.can('whatsapp.manage') },
  { href: '/settings/sso', label: 'Inicio de sesión externo', show: (s) => s.can('sso.manage', 'organization') },
  { href: '/settings/organizaciones', label: 'Organizaciones', show: (s) => s.isPlatformOwner },
  { href: '/settings', label: 'Mi cuenta', show: () => true },
];

// Logo: el de la organización (Mi cuenta) o, si no hay, el de la
// plataforma en public/logo.svg (y public/logo-mark.png como respaldo)
const DEFAULT_LOGOS = ['/logo.svg', '/logo-mark.png'];
function LogoImage({ src, alt, fallbackText }) {
  const list = [src, ...DEFAULT_LOGOS].filter(Boolean);
  const [i, setI] = useState(0);
  if (i >= list.length) return <span className="sb-logo-initials">{fallbackText}</span>;
  return <img key={list[i]} src={list[i]} alt={alt} onError={() => setI((n) => n + 1)} />;
}

const HIDDEN_ON = ['/login', '/', '/set-password', '/auth/aceptar-invitacion', '/auth/sso', '/registro'];

// Abre/cierra el menú en móvil (lo usa la barra superior)
export function toggleSidebar(open) {
  window.dispatchEvent(new CustomEvent('xiris:sidebar', { detail: open }));
}

// Cierra un menú desplegable al hacer clic afuera
function useOutside(ref, onOutside) {
  useEffect(() => {
    const h = (e) => ref.current && !ref.current.contains(e.target) && onOutside();
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref, onOutside]);
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const session = useSession();
  const { resolvedTheme, toggleTheme } = useTheme();
  const { user, profile, organization, roleName, branches, activeBranch, setActiveBranchId, isPlatformOwner } = session;
  const [mobileOpen, setMobileOpen] = useState(false);
  const hoverOpen = useRef(false); // abierto al pasar el mouse por el borde izquierdo
  const [branchOpen, setBranchOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(pathname?.startsWith('/settings'));
  const branchRef = useRef(null);
  const userRef = useRef(null);
  useOutside(branchRef, () => setBranchOpen(false));
  useOutside(userRef, () => setUserOpen(false));

  const orgUser = profile?.organization_id ? user?.id : null;
  const taskCounts = useMyTaskCounts(orgUser);
  const chatUnread = useChatUnread(orgUser);
  const waUnread = useWaUnread(profile?.organization_id && session.can('whatsapp.view') ? user?.id : null);

  useEffect(() => {
    if (pathname?.startsWith('/settings')) setSettingsOpen(true);
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    const h = (e) => {
      hoverOpen.current = false;
      setMobileOpen(typeof e.detail === 'boolean' ? e.detail : (v) => !v);
    };
    window.addEventListener('xiris:sidebar', h);
    return () => window.removeEventListener('xiris:sidebar', h);
  }, []);

  async function handleSignOut() {
    await signOut();
    router.push('/login');
  }

  // WhatsApp y Comunicación van a pantalla completa: el menú queda oculto y
  // se saca con el botón de 3 líneas o pasando el mouse por el borde izquierdo.
  const floating = pathname?.startsWith('/whatsapp') || pathname?.startsWith('/comunicacion');
  if (HIDDEN_ON.includes(pathname) || !user) return null;

  const displayName = profile?.full_name || user.email || 'Cuenta';
  const orgName = organization?.name ?? (isPlatformOwner ? 'Platform Owner' : 'Xiris');
  const branchLabel = activeBranch ? `Sucursal ${activeBranch.name}` : branches.length > 1 ? 'Todas mis sucursales' : branches[0] ? `Sucursal ${branches[0].name}` : '';
  const links = LINKS.filter((l) => l.show(session));
  const settingsLinks = SETTINGS_LINKS.filter((l) => l.show(session));

  function badgeFor(kind) {
    if (kind === 'tasks' && taskCounts.open > 0) {
      const overdue = taskCounts.overdue > 0;
      return (
        <span
          className={`sb-badge${overdue ? ' danger' : ''}`}
          title={overdue ? `${taskCounts.overdue} vencida(s) de ${taskCounts.open} pendiente(s)` : `${taskCounts.open} pendiente(s)`}
        >
          {overdue ? taskCounts.overdue : taskCounts.open}
        </span>
      );
    }
    if (kind === 'wa' && waUnread > 0)
      return (
        <span className="sb-badge wa" title={`${waUnread} mensaje(s) de WhatsApp sin leer`}>
          {waUnread > 99 ? '99+' : waUnread}
        </span>
      );
    if (kind === 'chat' && chatUnread > 0)
      return (
        <span className="sb-badge" title={`${chatUnread} mensaje(s) sin leer`}>
          {chatUnread > 99 ? '99+' : chatUnread}
        </span>
      );
    return null;
  }

  return (
    <>
      {floating && (
        <div
          className="sb-edge"
          aria-hidden="true"
          onMouseEnter={() => {
            if (mobileOpen) return;
            hoverOpen.current = true;
            setMobileOpen(true);
          }}
        />
      )}
      {mobileOpen && <div className={`sb-scrim${floating ? ' sb-scrim-float' : ''}`} onClick={() => setMobileOpen(false)} />}
      <aside
        className={`sb${floating ? ' sb-float' : ''}${mobileOpen ? ' open' : ''}`}
        aria-label="Menú principal"
        onMouseLeave={() => {
          if (hoverOpen.current) {
            hoverOpen.current = false;
            setMobileOpen(false);
          }
        }}
        onClick={() => {
          hoverOpen.current = false;
        }}
      >
        {/* Logo de la organización */}
        <div className="sb-logo">
          <a href="/dashboard" className="sb-logo-mark" aria-label={`${orgName} — Inicio`}>
            <LogoImage src={organization?.logo_url} alt={orgName} fallbackText={initials(orgName)} />
          </a>
        </div>

        {/* Organización y sucursal activa */}
        <div className="sb-org" ref={branchRef}>
          <button className="sb-org-btn" onClick={() => branches.length > 1 && setBranchOpen((v) => !v)} style={{ cursor: branches.length > 1 ? 'pointer' : 'default' }}>
            <span className="sb-org-avatar">
              {organization?.logo_url ? <img src={organization.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Icon name="building-2" size={16} />}
            </span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <div className="sb-org-name">{orgName}</div>
              {branchLabel && <div className="sb-org-sub">{branchLabel}</div>}
            </span>
            {branches.length > 1 && <Icon name={branchOpen ? 'chevron-up' : 'chevron-down'} size={16} style={{ color: 'var(--sb-muted)' }} />}
          </button>
          {branchOpen && (
            <div className="sb-menu" role="menu">
              <div className="sb-menu-label">Sucursal activa</div>
              <button
                className={`sb-menu-item${!activeBranch ? ' active' : ''}`}
                onClick={() => {
                  setActiveBranchId(null);
                  setBranchOpen(false);
                }}
              >
                <Icon name="layers" size={15} />
                Todas mis sucursales
                {!activeBranch && <Icon name="check" size={15} style={{ marginLeft: 'auto' }} />}
              </button>
              {branches.map((b) => (
                <button
                  key={b.id}
                  className={`sb-menu-item${activeBranch?.id === b.id ? ' active' : ''}`}
                  onClick={() => {
                    setActiveBranchId(b.id);
                    setBranchOpen(false);
                  }}
                >
                  <Icon name="map-pin" size={15} />
                  {b.name}
                  {activeBranch?.id === b.id && <Icon name="check" size={15} style={{ marginLeft: 'auto' }} />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Navegación */}
        <nav className="sb-nav">
          {links.map((link) => {
            const active = pathname?.startsWith(link.href);
            return (
              <a key={link.href} href={link.href} className={`sb-link${active ? ' active' : ''}`} aria-current={active ? 'page' : undefined}>
                <Icon name={link.icon} size={19} strokeWidth={1.8} />
                {link.label}
                {link.badge && badgeFor(link.badge)}
              </a>
            );
          })}

          {settingsLinks.length > 0 && (
            <>
              <button className={`sb-link${pathname?.startsWith('/settings') && !settingsOpen ? ' active' : ''}`} onClick={() => setSettingsOpen((v) => !v)} aria-expanded={settingsOpen}>
                <Icon name="settings" size={19} strokeWidth={1.8} />
                Configuración
                <Icon name={settingsOpen ? 'chevron-down' : 'chevron-right'} size={15} style={{ marginLeft: 'auto', color: 'var(--sb-muted)' }} />
              </button>
              {settingsOpen && (
                <div className="sb-sub">
                  {settingsLinks.map((link) => (
                    <a key={link.href} href={link.href} className={`sb-sublink${pathname === link.href ? ' active' : ''}`}>
                      {link.label}
                    </a>
                  ))}
                </div>
              )}
            </>
          )}
        </nav>

        {/* Usuario */}
        <div className="sb-footer" ref={userRef}>
          {userOpen && (
            <div className="sb-menu up" role="menu" style={{ left: '0.85rem', right: '0.85rem' }}>
              <a className="sb-menu-item" href="/settings">
                <Icon name="user" size={15} />
                Mi cuenta
              </a>
              <button className="sb-menu-item" onClick={toggleTheme}>
                <Icon name={resolvedTheme === 'light' ? 'moon' : 'sun'} size={15} />
                {resolvedTheme === 'light' ? 'Tema oscuro' : 'Tema claro'}
              </button>
              <button className="sb-menu-item" onClick={handleSignOut} style={{ color: '#f08a82' }}>
                <Icon name="log-out" size={15} />
                Cerrar sesión
              </button>
            </div>
          )}
          <button className="sb-user" onClick={() => setUserOpen((v) => !v)} aria-haspopup="menu" aria-expanded={userOpen}>
            <Avatar name={displayName} size={40} gold />
            <span style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 650, fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName}</div>
              <div style={{ fontSize: '0.76rem', color: 'var(--sb-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {isPlatformOwner ? 'Dueño de la plataforma' : roleName || 'Usuario'}
              </div>
            </span>
            <Icon name="ellipsis-vertical" size={18} style={{ color: 'var(--sb-muted)' }} />
          </button>
        </div>
      </aside>
    </>
  );
}