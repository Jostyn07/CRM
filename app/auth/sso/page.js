'use client';
// Ruta: app/auth/sso/page.js
// Destino del inicio de sesión desde otra plataforma (SSO).
// Recibe ?t=<ticket de un solo uso>, lo canjea en la Edge Function "sso"
// y abre la sesión con el enlace que genera el servidor. La contraseña
// nunca pasa por el navegador.

import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabase/client';
import Icon from '../../../components/ui/icon';

export default function SsoPage() {
  const [error, setError] = useState(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const token = params.get('t');
      // El ticket no se queda en la barra ni en el historial
      window.history.replaceState(null, '', '/auth/sso');
      if (!token) return setError('El enlace no es válido.');
      try {
        // Si había otra sesión abierta en este navegador, se cierra primero
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
        try {
          window.localStorage.removeItem('lf_session_cache');
        } catch {}
        const { data, error: fnErr } = await supabase.functions.invoke('sso', { body: { action: 'redeem', token } });
        if (fnErr) {
          let msg = 'No se pudo validar el acceso.';
          try {
            msg = (await fnErr.context.json()).error || msg;
          } catch {}
          throw new Error(msg);
        }
        const { error: otpErr } = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: 'magiclink' });
        if (otpErr) throw new Error('No se pudo abrir la sesión. Vuelve a intentarlo desde la plataforma.');
        window.location.replace(data.redirect || '/dashboard');
      } catch (e) {
        setError(e.message);
      }
    })();
  }, []);

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className="soft-card" style={{ padding: '2rem 2.2rem', maxWidth: 420, textAlign: 'center', display: 'grid', gap: 12, justifyItems: 'center' }}>
        <img src="/logo-mark.png" alt="" width={72} height={72} style={{ borderRadius: '50%', objectFit: 'cover' }} />
        {error ? (
          <>
            <Icon name="triangle-alert" size={26} style={{ color: 'var(--color-danger)' }} />
            <p style={{ margin: 0, fontWeight: 600 }}>{error}</p>
            <a className="btn btn-secondary" href="/login">
              Ir al inicio de sesión
            </a>
          </>
        ) : (
          <>
            <Icon name="loader-circle" size={26} style={{ color: 'var(--color-primary)', animation: 'spin 1s linear infinite' }} />
            <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>Entrando a Xiris…</p>
          </>
        )}
      </div>
      <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
    </main>
  );
}