'use client';
// Ruta: app/auth/sso/page.js
// Destino del inicio de sesión desde otra plataforma (SSO).
// Recibe ?t=<ticket de un solo uso>, lo canjea en la Edge Function "sso"
// y abre la sesión con el enlace que genera el servidor. La contraseña
// nunca pasa por el navegador.
// La pantalla "Conectando tu cuenta de Xiris" la dibuja ConexionOverlay
// (layout raíz) y se mantiene hasta que el Dashboard está listo.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase/client';
import { useSession } from '../../../lib/auth/sessionContext';

const log = (...a) => console.info('[Xiris SSO]', ...a);

function avisarError(msg) {
  log('error:', msg);
  window.__conexionError = msg; // por si la pantalla aún no escucha
  window.dispatchEvent(new CustomEvent('conexion:error', { detail: msg }));
}

export default function SsoPage() {
  const router = useRouter();
  const { user, loading } = useSession();
  const [destino, setDestino] = useState(null);
  const started = useRef(false);
  const fuera = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const token = params.get('t');
      const at = params.get('at');
      // El ticket no se queda en la barra ni en el historial
      window.history.replaceState(null, '', at ? `/auth/sso?at=${encodeURIComponent(at)}` : '/auth/sso');
      router.prefetch('/dashboard');
      // Si algo se queda colgado (red, Supabase), se avisa en vez de esperar sin fin
      const limite = setTimeout(() => !fuera.current && avisarError('La conexión está tardando demasiado. Vuelve a intentarlo.'), 20000);
      try {
        log('1. ticket recibido:', Boolean(token));
        if (!token) throw new Error('El enlace no es válido.');
        // Si había otra sesión abierta en este navegador, se cierra primero
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
        try {
          window.localStorage.removeItem('lf_session_cache');
        } catch {}
        log('2. canjeando ticket');
        const { data, error: fnErr } = await supabase.functions.invoke('sso', { body: { action: 'redeem', token } });
        if (fnErr) {
          let msg = 'No se pudo validar el acceso.';
          try {
            msg = (await fnErr.context.json()).error || msg;
          } catch {}
          throw new Error(msg);
        }
        log('3. abriendo sesión');
        const { error: otpErr } = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: 'magiclink' });
        if (otpErr) throw new Error('No se pudo abrir la sesión. Vuelve a intentarlo desde la plataforma.');
        const to = data.redirect || '/dashboard';
        if (to !== '/dashboard') router.prefetch(to);
        log('4. sesión abierta, destino', to);
        setDestino(to);
      } catch (e) {
        clearTimeout(limite);
        avisarError(e.message);
      }
    })();
  }, [router]);

  // Navegación interna (sin recargar) cuando la sesión ya está cargada:
  // la pantalla de conexión sigue visible encima durante el cambio.
  const entrar = useCallback(() => {
    if (fuera.current || !destino) return;
    fuera.current = true;
    log('5. entrando a', destino);
    window.dispatchEvent(new Event('conexion:entrar'));
    router.replace(destino);
  }, [destino, router]);

  useEffect(() => {
    if (destino && !loading && user) entrar();
  }, [destino, loading, user, entrar]);

  // Respaldo: si el perfil tarda en cargar, se entra igual a los 3 s
  useEffect(() => {
    if (!destino) return undefined;
    const t = setTimeout(entrar, 3000);
    return () => clearTimeout(t);
  }, [destino, entrar]);

  return null;
}