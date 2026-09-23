'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '../../lib/supabase/client';

// Dominio raíz configurado (ej. "leadfactory.com"). Sin esta variable,
// el guard no hace nada — así no interfiere en local ni en un deploy
// de Vercel que todavía no tiene dominio propio conectado.
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN;

function getCurrentSubdomain() {
  if (typeof window === 'undefined' || !ROOT_DOMAIN) return null;
  const host = window.location.hostname;
  if (host === ROOT_DOMAIN || host === `www.${ROOT_DOMAIN}` || host.endsWith('.vercel.app')) {
    return null; // dominio raíz o preview de Vercel = sin subdominio
  }
  if (host.endsWith(`.${ROOT_DOMAIN}`)) {
    return host.slice(0, -(`.${ROOT_DOMAIN}`.length));
  }
  return null; // localhost u otro host no reconocido: no aplica el guard
}

export default function SubdomainGuard() {
  const pathname = usePathname();

  useEffect(() => {
    if (!ROOT_DOMAIN) return; // no configurado todavía, no hace nada
    if (pathname === '/login' || pathname === '/') return; // el login maneja su propio redirect
    checkSubdomain();
  }, [pathname]);

  async function checkSubdomain() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, subdomain')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role === 'admin' || profile.role === 'owner') return; // admin/owner sin restricción

    const currentSubdomain = getCurrentSubdomain();
    if (!currentSubdomain && !profile.subdomain) return; // ninguno configurado aún, no bloquea

    if (profile.subdomain && currentSubdomain !== profile.subdomain) {
      window.location.href = `https://${profile.subdomain}.${ROOT_DOMAIN}${pathname}`;
    }
  }

  return null;
}