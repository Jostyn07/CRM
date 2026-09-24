'use client';
// Ruta: app/login/page.js

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signInWithPassword } from '../../lib/supabase/auth';
import { supabase } from '../../lib/supabase/client';
import { getCurrentSubdomain, organizationUrl } from '../../components/ui/subdomainGuard';

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
  const confirmed = searchParams.get('confirmed') === '1';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { profile, isPlatformOwner } = await signInWithPassword(email.trim(), password);

      // Cada organización entra por su subdominio (si hay dominio configurado)
      if (profile && !isPlatformOwner) {
        const { data: org } = await supabase
          .from('organizations')
          .select('slug')
          .eq('id', profile.organization_id)
          .single();
        const target = organizationUrl(org?.slug, '/leads');
        const host = window.location.hostname;
        if (target && getCurrentSubdomain() !== org.slug && host !== 'localhost' && !host.endsWith('.vercel.app')) {
          window.location.href = target;
          return;
        }
      }

      router.push(isPlatformOwner && !profile ? '/settings/organizaciones' : '/leads');
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

        {confirmed && !error && (
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
            Tu correo quedó confirmado. Ya puedes iniciar sesión.
          </p>
        )}

        {inactive && !error && (
          <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem', marginBottom: '1rem' }}>
            Tu cuenta está inactiva o suspendida. Contacta a un administrador.
          </p>
        )}

        <label style={{ display: 'block', marginBottom: '0.75rem' }}>
          <span style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4 }}>Correo</span>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
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

        {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem', marginBottom: '1rem' }}>{error}</p>}

        <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%' }}>
          {loading ? 'Ingresando…' : 'Ingresar'}
        </button>

        {/* Los usuarios no cambian su contraseña por su cuenta: un
            administrador les envía el enlace de restablecimiento. */}
        <button
          type="button"
          onClick={() => setShowForgot((v) => !v)}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--color-text-muted)',
            fontSize: '0.82rem',
            marginTop: '0.75rem',
            cursor: 'pointer',
            width: '100%',
            textAlign: 'center',
          }}
        >
          ¿Olvidaste tu contraseña?
        </button>
        {showForgot && (
          <p
            style={{
              marginTop: '0.5rem',
              paddingTop: '0.75rem',
              borderTop: '1px solid var(--color-border)',
              fontSize: '0.82rem',
              color: 'var(--color-text-muted)',
            }}
          >
            Pídele a un administrador de tu organización que te envíe un enlace para restablecerla.
          </p>
        )}

        <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border)', textAlign: 'center' }}>
          <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginBottom: 8 }}>¿Tu empresa aún no tiene cuenta?</p>
          <a href="/registro" className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center' }}>
            Registrar mi empresa
          </a>
        </div>
      </form>
    </main>
  );
}
