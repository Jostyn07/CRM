'use client';
// Ruta: app/auth/sso/page.js
// Destino del inicio de sesión desde otra plataforma (SSO).
// Recibe ?t=<ticket de un solo uso>, lo canjea en la Edge Function "sso"
// y abre la sesión con el enlace que genera el servidor. La contraseña
// nunca pasa por el navegador.
// Mientras tanto muestra una pantalla de carga (oscura, con el logo).

import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabase/client';

const log = (...a) => console.info('[Xiris SSO]', ...a);

export default function SsoPage() {
  const [error, setError] = useState(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const limite = setTimeout(() => setError('La conexión está tardando demasiado. Vuelve a intentarlo.'), 20000);
    (async () => {
      const token = new URLSearchParams(window.location.search).get('t');
      // El ticket no se queda en la barra ni en el historial
      window.history.replaceState(null, '', '/auth/sso');
      try {
        if (!token) throw new Error('El enlace no es válido.');
        // Si había otra sesión abierta en este navegador, se cierra primero
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
        try {
          window.localStorage.removeItem('lf_session_cache');
        } catch {}
        log('canjeando ticket');
        const { data, error: fnErr } = await supabase.functions.invoke('sso', { body: { action: 'redeem', token } });
        if (fnErr) {
          let msg = 'No se pudo validar el acceso.';
          try {
            msg = (await fnErr.context.json()).error || msg;
          } catch {}
          throw new Error(msg);
        }
        log('abriendo sesión');
        const { error: otpErr } = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: 'magiclink' });
        if (otpErr) throw new Error('No se pudo abrir la sesión. Vuelve a intentarlo desde la plataforma.');
        log('entrando');
        window.location.replace(data.redirect || '/dashboard');
      } catch (e) {
        clearTimeout(limite);
        log('error:', e.message);
        setError(e.message);
      }
    })();
    return () => clearTimeout(limite);
  }, []);

  return (
    <main className="sso-carga">
      <div className="sso-logo">
        <span className="sso-anillo" />
        <img src="/conexion/logo-xiris.png" alt="Xiris" />
      </div>
      {error ? (
        <>
          <p className="sso-error">{error}</p>
          <a className="sso-btn" href="/login">
            Ir al inicio de sesión
          </a>
        </>
      ) : (
        <>
          <p className="sso-texto">Cargando Xiris</p>
          <div className="sso-barra">
            <span />
          </div>
        </>
      )}
      <style>{`
        .sso-carga{position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;
          background:radial-gradient(ellipse at 50% 40%,#1F1F23 0%,#0D0D0F 70%);color:#F5F5F5;font-family:'Outfit',system-ui,sans-serif;padding:16px;text-align:center}
        .sso-logo{position:relative;width:120px;height:120px}
        .sso-logo img{position:absolute;inset:8px;width:104px;height:104px;border-radius:50%;object-fit:cover;box-shadow:0 0 40px rgba(217,160,78,.35)}
        .sso-anillo{position:absolute;inset:0;border-radius:50%;border:2px solid rgba(217,160,78,.18);border-top-color:#F2C77A;animation:sso-giro 1.1s linear infinite}
        .sso-texto{margin:0;font-size:17px;letter-spacing:.04em;color:#D9D9D9}
        .sso-barra{width:180px;height:3px;border-radius:3px;background:rgba(217,160,78,.18);overflow:hidden}
        .sso-barra span{display:block;width:40%;height:100%;border-radius:3px;background:linear-gradient(90deg,#D9A04E,#F2C77A);animation:sso-barra 1.3s ease-in-out infinite}
        .sso-error{margin:0;max-width:380px;color:#F0A4A4;font-size:16px}
        .sso-btn{color:#F2C77A;border:1px solid #D9A04E;border-radius:999px;padding:8px 22px;text-decoration:none}
        @keyframes sso-giro{to{transform:rotate(360deg)}}
        @keyframes sso-barra{0%{transform:translateX(-100%)}100%{transform:translateX(250%)}}
        @media (prefers-reduced-motion:reduce){.sso-anillo,.sso-barra span{animation:none}}
      `}</style>
    </main>
  );
}