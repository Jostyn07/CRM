'use client';
// Ruta: app/auth/aceptar-invitacion/page.js
// Destino del enlace de invitación (Edge Functions invite-user y
// create-organization). Supabase procesa el token del enlace y
// AuthWatcher envía a /set-password para definir la contraseña.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase/client';

export default function AceptarInvitacionPage() {
  const router = useRouter();

  useEffect(() => {
    // Si el token ya se procesó antes de montar, se redirige aquí
    const t = setTimeout(async () => {
      const { data } = await supabase.auth.getSession();
      router.replace(data.session ? '/set-password' : '/login');
    }, 1500);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <main style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: 'var(--color-text-muted)' }}>Validando tu invitación…</p>
    </main>
  );
}