'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase/client';
import Button from '../../components/ui/button';
import Input from '../../components/ui/input';

export default function SetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    router.replace('/');
  }

  return (
    <main style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
      <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Define tu contraseña</h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
            Es la primera vez que entras — antes de continuar, elige la contraseña con la que vas a iniciar sesión de ahora en adelante.
          </p>
        </div>

        <Input
          label="Contraseña"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Input
          label="Confirmar contraseña"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />

        {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem' }}>{error}</p>}

        <Button type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar y continuar'}</Button>
      </form>
    </main>
  );
}