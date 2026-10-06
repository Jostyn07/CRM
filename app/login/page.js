'use client';
// Ruta: app/login/page.js

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signInWithPassword } from '../../lib/supabase/auth';
import { supabase } from '../../lib/supabase/client';
import { getCurrentSubdomain, organizationUrl } from '../../components/ui/subdomainGuard';
import { logAccess, mfaNeedsCode, mfaVerifyLogin } from '../../lib/me/access';

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
  // Verificación en dos pasos: después de la contraseña se pide el código
  const [mfa, setMfa] = useState(null); // { profile, isPlatformOwner } pendiente del código
  const [code, setCode] = useState('');

  // Si ya hay sesión pero falta el código (p. ej. entró por otra vía)
  useEffect(() => {
    if (searchParams.get('mfa') !== '1') return;
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session && (await mfaNeedsCode())) setMfa({ profile: null, isPlatformOwner: false, resume: true });
    });
  }, [searchParams]);

  async function finish({ profile, isPlatformOwner, resume }) {
    logAccess({ login: true });
    if (resume) {
      router.push('/dashboard');
      return;
    }
    // Cada organización entra por su subdominio (si hay dominio configurado)
    if (profile && !isPlatformOwner) {
      const { data: org } = await supabase.from('organizations').select('slug').eq('id', profile.organization_id).single();
      const target = organizationUrl(org?.slug, '/leads');
      const host = window.location.hostname;
      if (target && getCurrentSubdomain() !== org.slug && host !== 'localhost' && !host.endsWith('.vercel.app')) {
        window.location.href = target;
        return;
      }
    }
    router.push(isPlatformOwner && !profile ? '/settings/organizaciones' : '/leads');
  }

  async function submitCode(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await mfaVerifyLogin(code);
      await finish(mfa);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { profile, isPlatformOwner } = await signInWithPassword(email.trim(), password);
      if (await mfaNeedsCode()) {
        setMfa({ profile, isPlatformOwner });
        return;
      }
      await finish({ profile, isPlatformOwner });
    } catch (err) {
      setError(err.message || 'No se pudo iniciar sesión');
    } finally {
      setLoading(false);
    }
  }

  if (mfa) {
    return (
      <main style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <form onSubmit={submitCode} className="card" style={{ width: 320 }}>
          <h1 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>Verificación en dos pasos</h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
            Escribe el código de 6 dígitos que muestra tu aplicación de autenticación.
          </p>
          <input
            className="input"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            style={{ textAlign: 'center', letterSpacing: '0.4em', fontSize: '1.2rem', marginBottom: '1rem' }}
          />
          {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem', marginBottom: '1rem' }}>{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={loading || code.length !== 6} style={{ width: '100%' }}>
            {loading ? 'Verificando…' : 'Verificar'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ width: '100%', marginTop: 8 }}
            onClick={async () => {
              await supabase.auth.signOut();
              setMfa(null);
              setCode('');
              setError(null);
            }}
          >
            Volver
          </button>
        </form>
      </main>
    );
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