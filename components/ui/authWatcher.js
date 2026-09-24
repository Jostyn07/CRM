'use client';
// Ruta: components/ui/authWatcher.js
// Vigila la sesión:
//  - Sesión cerrada o expirada → /login
//  - Enlace de invitación o recuperación → /set-password
//  - Un admin desactiva o suspende al usuario → cierre inmediato (Realtime)

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '../../lib/supabase/client';
import { useSession } from '../../lib/auth/sessionContext';

const PUBLIC_PATHS = ['/login', '/', '/set-password', '/auth/aceptar-invitacion', '/registro'];

export default function AuthWatcher() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, profile, loading } = useSession();

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      // SIGNED_OUT también llega cuando falla la renovación del token
      if (event === 'SIGNED_OUT' && !PUBLIC_PATHS.includes(pathname)) {
        router.replace('/login?expired=1');
      }
      if (event === 'SIGNED_IN' && session?.user) {
        const hash = typeof window !== 'undefined' ? window.location.hash : '';
        if (/type=(invite|recovery)/.test(hash) && pathname !== '/set-password') {
          router.replace('/set-password');
        }
      }
    });
    return () => listener.subscription.unsubscribe();
  }, [pathname, router]);

  // Sin sesión en una ruta privada → login
  useEffect(() => {
    if (!loading && !user && !PUBLIC_PATHS.includes(pathname)) {
      router.replace('/login');
    }
  }, [loading, user, pathname, router]);

  // Estado del perfil al cargar y en tiempo real
  useEffect(() => {
    if (!profile?.id) return;

    const blocked = (status) => status === 'inactive' || status === 'suspended';
    if (blocked(profile.status)) {
      supabase.auth.signOut().then(() => router.replace('/login?inactive=1'));
      return;
    }

    const channel = supabase
      .channel(`profile-status:${profile.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${profile.id}` },
        (payload) => {
          if (blocked(payload.new?.status)) {
            supabase.auth.signOut().then(() => router.replace('/login?inactive=1'));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id, profile?.status, router]);

  return null;
}
