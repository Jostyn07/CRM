'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '../../lib/supabase/client';

export default function AuthWatcher() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      // SIGNED_OUT también se dispara cuando falla la renovación del
      // refresh token (Supabase limpia la sesión sola en ese caso) — no
      // solo cuando alguien hace clic en "Cerrar sesión".
      if (event === 'SIGNED_OUT' && pathname !== '/login' && pathname !== '/') {
        router.replace('/login?expired=1');
      }
      if (event === 'SIGNED_IN' && session?.user) {
        // El link de invitación (y el de "olvidé mi contraseña") trae
        // #access_token=...&type=invite (o type=recovery) en el hash.
        // El cliente de Supabase detecta el token solo y dispara este
        // mismo SIGNED_IN -- sin este chequeo, la persona queda con
        // sesión iniciada pero SIN contraseña definida, y la próxima
        // vez no puede entrar con email/contraseña normal.
        const hash = typeof window !== 'undefined' ? window.location.hash : '';
        const isInviteOrRecovery = /type=(invite|recovery)/.test(hash);

        if (isInviteOrRecovery && pathname !== '/set-password') {
          router.replace('/set-password');
          return;
        }

        checkEstadoOnce(session.user.id);
      }
    });

    return () => listener.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, router]);

  // Revisión de estado UNA sola vez al montar (sesión restaurada del
  // almacenamiento local, que no dispara SIGNED_IN) usando la sesión
  // ya en memoria -- getSession() es local, no llama al servidor.
  useEffect(() => {
    if (pathname === '/login' || pathname === '/') return;

    let channel = null;
    let mounted = true;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!mounted || !session?.user) return;

      await checkEstadoOnce(session.user.id);
      if (!mounted) return;

      // A partir de acá, nos enteramos de un cambio a inactivo en
      // tiempo real (Realtime), sin volver a llamar a getUser() ni
      // hacer polling contra el servidor de Auth.
      channel = supabase
        .channel(`profile-estado:${session.user.id}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${session.user.id}` },
          (payload) => {
            if (payload.new?.estado === 'inactivo') {
              supabase.auth.signOut().then(() => router.replace('/login?inactive=1'));
            }
          }
        )
        .subscribe();
    })();

    return () => {
      // Corta cualquier ejecución huérfana que siga en curso (React
      // Strict Mode monta/desmonta/vuelve a montar cada efecto una vez
      // en desarrollo) -- sin esto, la ejecución vieja terminaba de
      // crear su canal DESPUÉS de que su limpieza ya había corrido,
      // chocando con el canal de la segunda ejecución.
      mounted = false;
      if (channel) supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  async function checkEstadoOnce(userId) {
    const { data } = await supabase.from('profiles').select('estado').eq('id', userId).single();
    if (data?.estado === 'inactivo') {
      await supabase.auth.signOut();
      router.replace('/login?inactive=1');
    }
  }

  return null;
}