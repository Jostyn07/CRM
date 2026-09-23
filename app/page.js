'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentSession } from '../lib/supabase/auth';

export default function HomePage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    getCurrentSession()
      .then((session) => {
        router.replace(session ? '/leads' : '/login');
      })
      .finally(() => setChecking(false));
  }, [router]);

  if (checking) {
    return (
      <main style={{ padding: '2rem' }}>
        <p>Cargando…</p>
      </main>
    );
  }

  return null;
}