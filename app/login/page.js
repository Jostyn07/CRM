'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signInWithPassword } from '../../lib/supabase/auth';
import { supabase } from '../../lib/supabase/client';

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN;

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const expired = searchParams.get('expired') === '1';
  const inactive = searchParams.get('inactive') === '1';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotError, setForgotError] = useState(null);
  const [forgotLoading, setForgotLoading] = useState(false);

  async function handleForgotSubmit(e) {
    e.preventDefault();
    setForgotError(null);
    setForgotLoading(true);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/set-password`,
    });

    setForgotLoading(false);

    if (resetError) {
      setForgotError(resetError.message);
      return;
    }
    setForgotSent(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { user } = await signInWithPassword(email, password);

      // Si hay dominio configurado y el usuario tiene subdominio propio
      // (y no es admin), lo mandamos directo a su subdominio.
      if (ROOT_DOMAIN && user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role, subdomain')
          .eq('id', user.id)
          .single();

        if (profile && profile.role !== 'admin' && profile.role !== 'owner' && profile.subdomain) {
          const currentHost = window.location.hostname;
          const expectedHost = `${profile.subdomain}.${ROOT_DOMAIN}`;
          if (currentHost !== expectedHost) {
            window.location.href = `https://${expectedHost}/leads`;
            return;
          }
        }
      }

      router.push('/leads');
    } catch (err) {
      setError(err.message || 'No se pudo iniciar sesión');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
      <form onSubmit={handleSubmit} className="card" style={{ width: 320 }}>
        <h1 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Iniciar sesión</h1>

        {expired && !error && (
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
            Tu sesión expiró. Inicia sesión de nuevo para continuar.
          </p>
        )}

        {inactive && !error && (
          <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem', marginBottom: '1rem' }}>
            Tu cuenta está inactiva. Contacta a un administrador.
          </p>
        )}

        <label style={{ display: 'block', marginBottom: '0.75rem' }}>
          <span style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4 }}>Correo</span>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>

        <label style={{ display: 'block', marginBottom: '1rem' }}>
          <span style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4 }}>Contraseña</span>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        {error && (
          <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem', marginBottom: '1rem' }}>
            {error}
          </p>
        )}

        <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%' }}>
          {loading ? 'Ingresando…' : 'Ingresar'}
        </button>

        <button
          type="button"
          onClick={() => {
            setShowForgot((v) => !v);
            setForgotSent(false);
            setForgotError(null);
            setForgotEmail(email);
          }}
          style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', fontSize: '0.82rem', marginTop: '0.75rem', cursor: 'pointer', width: '100%', textAlign: 'center' }}
        >
          ¿Olvidaste tu contraseña?
        </button>

        {showForgot && (
          <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--color-border)' }}>
            {forgotSent ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                Si <strong>{forgotEmail}</strong> tiene una cuenta, te llegará un correo con un link para definir una nueva contraseña.
              </p>
            ) : (
              <>
                <label style={{ display: 'block', marginBottom: '0.5rem' }}>
                  <span style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4 }}>Correo</span>
                  <input
                    className="input"
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    required
                  />
                </label>
                {forgotError && (
                  <p style={{ color: 'var(--color-danger)', fontSize: '0.82rem', marginBottom: '0.5rem' }}>{forgotError}</p>
                )}
                <button className="btn btn-secondary" type="button" onClick={handleForgotSubmit} disabled={forgotLoading} style={{ width: '100%' }}>
                  {forgotLoading ? 'Enviando…' : 'Enviar link de recuperación'}
                </button>
              </>
            )}
          </div>
        )}
      </form>
    </main>
  );
}