'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase/client';
import { signOut } from '../../lib/supabase/auth';
import Button from '../../components/ui/button';

export default function SettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from('profiles')
      .select('full_name, role')
      .eq('id', user.id)
      .single();

    setProfile({ email: user.email, ...data });
    setLoading(false);
  }

  async function handleSignOut() {
    await signOut();
    router.push('/login');
  }

  if (loading) {
    return (
      <main style={{ padding: '1.5rem', maxWidth: 480, margin: '0 auto' }}>
        <p>Cargando…</p>
      </main>
    );
  }

  return (
    <main style={{ padding: '1.5rem', maxWidth: 480, margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Configuración</h1>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <p style={{ fontSize: '0.9rem', marginBottom: 4 }}>
          <strong>Correo:</strong> {profile?.email || '—'}
        </p>
        <p style={{ fontSize: '0.9rem', marginBottom: 4 }}>
          <strong>Nombre:</strong> {profile?.full_name || '—'}
        </p>
        <p style={{ fontSize: '0.9rem' }}>
          <strong>Rol:</strong> {profile?.role || '—'}
        </p>
      </div>

      <Button variant="danger" onClick={handleSignOut}>
        Cerrar sesión
      </Button>
    </main>
  );
}