'use client';
// Ruta: components/ActivityTracker.jsx
// Se monta una sola vez en app/layout.js (dentro de <Suspense>):
//   <ActivityTracker />
// Registra automáticamente:
//   session.start      al abrir la app en una pestaña
//   page.view          cada cambio de ruta (con el tiempo en la anterior)
//   window.hidden      el usuario se va a otra pestaña o minimiza
//   window.visible     vuelve (con cuánto tiempo estuvo fuera)
//   window.blur/focus  cambia a otra ventana/aplicación
//   user.idle          5 min sin mover mouse ni teclado
//   user.active        vuelve a interactuar (con la duración de la inactividad)
//   session.end        cierra la pestaña o el navegador
import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { supabase } from '../lib/supabase/client';
import { initTracker, trackEvent, flushOnExit } from '../lib/activity/tracker';

const IDLE_MS = 5 * 60 * 1000;

export default function ActivityTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastPage = useRef({ path: null, since: Date.now() });

  // Inicio + eventos de ventana
  useEffect(() => {
    initTracker(supabase);
    trackEvent('session.start', {
      metadata: { screen: `${window.screen.width}x${window.screen.height}`, lang: navigator.language },
    });

    let hiddenAt = null;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        trackEvent('window.hidden');
        flushOnExit();
      } else {
        trackEvent('window.visible', {
          metadata: { away_seconds: hiddenAt ? Math.round((Date.now() - hiddenAt) / 1000) : null },
        });
        hiddenAt = null;
      }
    };

    const onBlur = () => trackEvent('window.blur');
    const onFocus = () => trackEvent('window.focus');
    const onExit = () => {
      trackEvent('session.end', {
        metadata: { page_seconds: Math.round((Date.now() - lastPage.current.since) / 1000) },
      });
      flushOnExit();
    };

    // Inactividad
    let idleTimer = null;
    let idleSince = null;
    const markIdle = () => {
      idleSince = Date.now();
      trackEvent('user.idle', { metadata: { after_minutes: IDLE_MS / 60000 } });
    };
    const onInput = () => {
      if (idleSince) {
        trackEvent('user.active', { metadata: { idle_seconds: Math.round((Date.now() - idleSince) / 1000) } });
        idleSince = null;
      }
      clearTimeout(idleTimer);
      idleTimer = setTimeout(markIdle, IDLE_MS);
    };
    const inputEvents = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'];

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    window.addEventListener('pagehide', onExit);
    inputEvents.forEach((e) => window.addEventListener(e, onInput, { passive: true }));
    idleTimer = setTimeout(markIdle, IDLE_MS);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pagehide', onExit);
      inputEvents.forEach((e) => window.removeEventListener(e, onInput));
      clearTimeout(idleTimer);
    };
  }, []);

  // Cambios de ruta
  useEffect(() => {
    const query = searchParams?.toString();
    const path = pathname + (query ? `?${query}` : '');
    const prev = lastPage.current;

    trackEvent('page.view', {
      path,
      metadata: {
        from: prev.path,
        previous_page_seconds: prev.path ? Math.round((Date.now() - prev.since) / 1000) : null,
      },
    });
    lastPage.current = { path, since: Date.now() };
  }, [pathname, searchParams]);

  return null;
}
