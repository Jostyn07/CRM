'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase/client';

export default function RequireOwner({ children }) {
  const router = useRouter();
  const [allowed, setAllowed] = useState(null); // null = verificando

  useEffect(() => {
    checkRole();
  }, []);

  async function checkRole() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.replace('/login');
      return;
    }

    const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single();

    if (data?.role === 'owner') {
      setAllowed(true);
    } else {
      setAllowed(false);
      router.replace('/dashboard');
    }
  }

  // Nota: esto solo mejora la experiencia (evita mostrar la pantalla un
  // instante antes de redirigir). La protección real está en las
  // políticas RLS de Supabase (y en import_leads, que ahora exige
  // is_owner()) — esas son las que de verdad impiden que alguien más
  // importe leads.
  if (allowed === null) {
    return (
      <main style={{ padding: '1.5rem' }}>
        <p>Cargando…</p>
      </main>
    );
  }

  if (!allowed) return null;

  return children;
}