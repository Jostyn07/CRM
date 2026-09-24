'use client';
// Ruta: components/ui/subdomainGuard.js
// Cada organización trabaja en su subdominio: <slug>.<NEXT_PUBLIC_ROOT_DOMAIN>
// Sin NEXT_PUBLIC_ROOT_DOMAIN no hace nada (local y previews de Vercel).
// El Platform Owner no tiene restricción.

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from '../../lib/auth/sessionContext';

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN;

export function getCurrentSubdomain() {
  if (typeof window === 'undefined' || !ROOT_DOMAIN) return null;
  const host = window.location.hostname;
  if (host === ROOT_DOMAIN || host === `www.${ROOT_DOMAIN}` || host.endsWith('.vercel.app')) return null;
  if (host.endsWith(`.${ROOT_DOMAIN}`)) return host.slice(0, -`.${ROOT_DOMAIN}`.length);
  return null;
}

export function organizationUrl(slug, path = '/leads') {
  return ROOT_DOMAIN && slug ? `https://${slug}.${ROOT_DOMAIN}${path}` : null;
}

export default function SubdomainGuard() {
  const pathname = usePathname();
  const { loading, organization, isPlatformOwner } = useSession();

  useEffect(() => {
    if (!ROOT_DOMAIN || loading || isPlatformOwner || !organization?.slug) return;
    if (pathname === '/login' || pathname === '/') return;
    if (window.location.hostname.endsWith('.vercel.app') || window.location.hostname === 'localhost') return;

    if (getCurrentSubdomain() !== organization.slug) {
      window.location.href = organizationUrl(organization.slug, pathname);
    }
  }, [loading, organization?.slug, isPlatformOwner, pathname]);

  return null;
}
