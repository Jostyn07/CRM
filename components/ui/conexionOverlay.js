'use client';
// Ruta: components/ui/conexionOverlay.js
// Pantalla "Conectando tu cuenta de Xiris" al entrar desde Asesorías (SSO).
// Vive en el layout raíz para que NO se desmonte al pasar de /auth/sso al
// Dashboard: es la misma pantalla de principio a fin, sin cortes. Se retira
// (candado abierto + desvanecido) solo cuando el Dashboard ya está listo.
//
// La pantalla lee ?at= (segundo del audio) de la URL de esta ventana.
// Comunicación con /auth/sso (mismo documento, eventos de window):
//   'conexion:error'  { detail: mensaje }  -> muestra el error
//   'conexion:entrar'                       -> sesión abierta, navegando al destino

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from '../../lib/auth/sessionContext';

const FLAG = 'xiris-conexion';

export default function ConexionOverlay() {
  const pathname = usePathname();
  const { user, loading } = useSession();
  const [activo, setActivo] = useState(pathname === '/auth/sso');
  const [saliendo, setSaliendo] = useState(false);
  const src = '/conexion/index.html?modo=continuar';
  const frame = useRef(null);
  const cargada = useRef(false);
  const pendientes = useRef([]);
  const entrando = useRef(false);
  const liberado = useRef(false);

  const enviar = (m) => {
    if (cargada.current) frame.current?.contentWindow?.postMessage(m, window.location.origin);
    else pendientes.current.push(m);
  };

  // Activación (en /auth/sso o si la navegación quedó a mitad)
  useEffect(() => {
    if (pathname === '/auth/sso') setActivo(true);
    else {
      try {
        if (sessionStorage.getItem(FLAG)) setActivo(true);
      } catch {}
    }
  }, [pathname]);

  // Mensajes de la pantalla y de /auth/sso
  useEffect(() => {
    if (!activo) return undefined;
    const onMsg = (e) => {
      if (e.origin !== window.location.origin || e.source !== frame.current?.contentWindow) return;
      const d = e.data || {};
      if (d.type === 'xiris-conexion:cargada') {
        cargada.current = true;
        pendientes.current.splice(0).forEach((m) => frame.current.contentWindow.postMessage(m, window.location.origin));
      }
      if (d.type === 'xiris-conexion:fin') {
        setSaliendo(true);
        setTimeout(() => {
          try {
            sessionStorage.removeItem(FLAG);
          } catch {}
          setActivo(false);
          cargada.current = false;
          entrando.current = false;
          liberado.current = false;
          setSaliendo(false);
        }, 750);
      }
      if (d.type === 'xiris-conexion:cerrar') window.location.replace('/login');
    };
    const onError = (e) => enviar({ type: 'xiris-conexion:error', msg: e.detail, boton: 'Ir al inicio de sesión' });
    const onEntrar = () => {
      entrando.current = true;
      try {
        sessionStorage.setItem(FLAG, '1');
      } catch {}
    };
    window.addEventListener('message', onMsg);
    window.addEventListener('conexion:error', onError);
    // Si /auth/sso avisó antes de que esta pantalla escuchara
    if (window.__conexionError) onError({ detail: window.__conexionError });
    window.addEventListener('conexion:entrar', onEntrar);
    return () => {
      window.removeEventListener('message', onMsg);
      window.removeEventListener('conexion:error', onError);
      window.removeEventListener('conexion:entrar', onEntrar);
    };
  }, [activo]);

  // Ya en el destino, con sesión cargada: dar tiempo a que el Dashboard pinte
  useEffect(() => {
    if (!activo || pathname === '/auth/sso' || loading || !user || liberado.current) return undefined;
    liberado.current = true;
    const t = setTimeout(() => {
      requestAnimationFrame(() => requestAnimationFrame(() => enviar({ type: 'xiris-conexion:listo' })));
    }, 1200);
    return () => clearTimeout(t);
  }, [activo, pathname, loading, user]);

  if (!activo) return null;
  return (
    <div
      aria-live="polite"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: '#0D0D0F',
        opacity: saliendo ? 0 : 1,
        transition: 'opacity .7s ease',
        pointerEvents: saliendo ? 'none' : 'auto',
      }}
    >
      {(
        <iframe
          ref={frame}
          src={src}
          title="Conectando con Xiris"
          allow="autoplay"
          style={{ width: '100%', height: '100%', border: 0, display: 'block', background: '#0D0D0F' }}
        />
      )}
    </div>
  );
}