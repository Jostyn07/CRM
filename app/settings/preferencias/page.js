'use client';

import { useState } from 'react';
import { supabase } from '../../../lib/supabase/client';
import Button from '../../../components/ui/button';
import Input from '../../../components/ui/input';

export default function PreferenciasPage() {
  return (
    <main style={{ padding: '28px 32px', maxWidth: 640, margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.9rem', fontWeight: 750, letterSpacing: '-0.02em', marginBottom: '1.5rem' }}>Preferencias</h1>

      <section className="card" style={{ padding: '1.25rem 1.5rem' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 650, marginBottom: 4 }}>Seguridad</h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '1.25rem' }}>
          Cambia tu contraseña confirmando la actual, o pide un link al correo si no la recuerdas.
        </p>
        <ChangePasswordForm />
      </section>
    </main>
  );
}

function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const [sendingLink, setSendingLink] = useState(false);
  const [linkSent, setLinkSent] = useState(false);
  const [linkError, setLinkError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword.length < 8) {
      setError('La contraseña nueva debe tener al menos 8 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Las contraseñas nuevas no coinciden.');
      return;
    }

    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) {
      setSaving(false);
      setError('No se pudo determinar tu correo. Vuelve a iniciar sesión e intenta de nuevo.');
      return;
    }

    // Supabase no tiene un "verificar contraseña actual" directo -- la
    // forma de confirmarla es intentar iniciar sesión con ella. Si es
    // incorrecta, esto falla solo y no toca nada; la sesión activa del
    // usuario no se ve afectada por un signInWithPassword fallido.
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });

    if (reauthError) {
      setSaving(false);
      setError('La contraseña actual no es correcta.');
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setSuccess(true);
  }

  async function handleSendLink() {
    setLinkError(null);
    setSendingLink(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) {
      setSendingLink(false);
      setLinkError('No se pudo determinar tu correo.');
      return;
    }

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/set-password`,
    });

    setSendingLink(false);

    if (resetError) {
      setLinkError(resetError.message);
      return;
    }
    setLinkSent(true);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <Input
          label="Contraseña actual"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
        <Input
          label="Contraseña nueva"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <Input
          label="Confirmar contraseña nueva"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />

        {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem' }}>{error}</p>}
        {success && <p style={{ color: 'var(--color-success, #4ade80)', fontSize: '0.85rem' }}>Contraseña actualizada correctamente.</p>}

        <Button type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Cambiar contraseña'}</Button>
      </form>

      <div style={{ borderTop: '1px solid var(--color-border)', marginTop: '0.5rem', paddingTop: '0.75rem' }}>
        <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
          ¿No recuerdas tu contraseña actual?
        </p>
        {linkSent ? (
          <p style={{ fontSize: '0.82rem' }}>Te enviamos un link a tu correo para definir una nueva contraseña.</p>
        ) : (
          <>
            <Button variant="secondary" onClick={handleSendLink} disabled={sendingLink}>
              {sendingLink ? 'Enviando…' : 'Enviarme un link al correo'}
            </Button>
            {linkError && <p style={{ color: 'var(--color-danger)', fontSize: '0.82rem', marginTop: 6 }}>{linkError}</p>}
          </>
        )}
      </div>
    </div>
  );
}