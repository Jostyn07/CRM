'use client';
// Ruta: app/auth/sso/page.js
// Destino del inicio de sesión desde otra plataforma (SSO).
// Recibe ?t=<ticket de un solo uso>, lo canjea en la Edge Function "sso"
// y abre la sesión con el enlace que genera el servidor. La contraseña
// nunca pasa por el navegador.
// Mientras tanto muestra la pantalla "Conectando tu cuenta de Xiris"
// (public/conexion/index.html?modo=entrar), que abre el candado al terminar.

import { useEffect, useRef } from 'react';
import { supabase } from '../../../lib/supabase/client';

const MINIMO_MS = 1200;

export default function SsoPage() {
  const frame = useRef(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    let cargada = false;
    let destino = null;
    const pendientes = [];
    const enviar = (m) => (cargada ? frame.current?.contentWindow?.postMessage(m, window.location.origin) : pendientes.push(m));
    const ir = () => destino && window.location.replace(destino);

    const onMsg = (e) => {
      if (e.origin !== window.location.origin || e.source !== frame.current?.contentWindow) return;
      const d = e.data || {};
      if (d.type === 'xiris-conexion:cargada') {
        cargada = true;
        pendientes.splice(0).forEach((m) => frame.current.contentWindow.postMessage(m, window.location.origin));
      }
      if (d.type === 'xiris-conexion:fin') ir();
      if (d.type === 'xiris-conexion:cerrar') window.location.replace('/login');
    };
    window.addEventListener('message', onMsg);

    (async () => {
      const inicio = Date.now();
      const params = new URLSearchParams(window.location.search);
      const token = params.get('t');
      // El ticket no se queda en la barra ni en el historial
      window.history.replaceState(null, '', '/auth/sso');
      try {
        if (!token) throw new Error('El enlace no es válido.');
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
        destino = data.redirect || '/dashboard';
        setTimeout(() => enviar({ type: 'xiris-conexion:listo' }), Math.max(0, MINIMO_MS - (Date.now() - inicio)));
        // Respaldo: si la pantalla no cargó, se entra igual
        setTimeout(() => !cargada && ir(), MINIMO_MS + 2500);
      } catch (e) {
        if (!cargada) {
          // La pantalla no cargó: se va al inicio de sesión con el aviso
          setTimeout(() => !cargada && window.location.replace('/login'), 4000);
        }
        enviar({ type: 'xiris-conexion:error', msg: e.message, boton: 'Ir al inicio de sesión' });
      }
    })();

    return () => window.removeEventListener('message', onMsg);
  }, []);

  return (
    <iframe
      ref={frame}
      src="/conexion/index.html?modo=entrar"
      title="Conectando con Xiris"
      style={{ position: 'fixed', inset: 0, zIndex: 9999, width: '100%', height: '100%', border: 0, background: '#0D0D0F' }}
    />
  );
}