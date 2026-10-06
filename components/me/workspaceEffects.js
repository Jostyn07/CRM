'use client';
// Ruta: components/me/workspaceEffects.js
// Efectos de "Mi espacio" en toda la plataforma:
//  · Fondo personal (solo para este usuario).
//  · Atajos de teclado (Alt + letra) si están activados.
//  · Disponibilidad automática: "Ausente" tras 15 min sin actividad y de
//    vuelta a "Disponible" al regresar (solo si lo puso el sistema).

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '../../lib/auth/sessionContext';
import { SHORTCUTS, applyAccent, applyBackground, saveMyPrefs, useMyPrefs } from '../../lib/me/workspace';
import { logAccess, mfaNeedsCode, sessionAlive } from '../../lib/me/access';
import { signOut } from '../../lib/supabase/auth';

const IDLE_MS = 15 * 60 * 1000;
const KEYMAP = Object.fromEntries(SHORTCUTS.map((s) => [s.keys.slice(-1).toLowerCase(), s.path]));

export default function WorkspaceEffects() {
  const router = useRouter();
  const { user, profile } = useSession();
  const prefs = useMyPrefs(profile?.organization_id ? user?.id : null);
  const autoAway = useRef(false);
  const last = useRef(Date.now());

  // Registro de este equipo, verificación en dos pasos y sesión cerrada por un administrador
  useEffect(() => {
    if (!user) return undefined;
    let vivo = true;
    logAccess();
    mfaNeedsCode().then((need) => vivo && need && router.replace('/login?mfa=1'));
    const t = setInterval(async () => {
      logAccess();
      if (!(await sessionAlive()) && vivo) {
        try {
          await signOut();
        } catch {}
        window.location.href = '/login?expired=1';
      }
    }, 60000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Color de acento
  useEffect(() => {
    if (prefs) applyAccent(prefs.prefs?.accent || null);
  }, [prefs?.prefs?.accent]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fondo
  useEffect(() => {
    if (prefs) applyBackground(prefs.prefs?.bg || 'seda');
  }, [prefs?.prefs?.bg]); // eslint-disable-line react-hooks/exhaustive-deps

  // Atajos
  useEffect(() => {
    if (!prefs || prefs.prefs?.shortcuts === false) return undefined;
    const onKey = (e) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const path = KEYMAP[(e.key || '').toLowerCase()] || KEYMAP[(e.code || '').replace('Key', '').toLowerCase()];
      if (path) {
        e.preventDefault();
        router.push(path);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prefs?.prefs?.shortcuts, !!prefs, router]); // eslint-disable-line react-hooks/exhaustive-deps

  // Disponibilidad automática
  useEffect(() => {
    if (!prefs || !prefs.availability_auto) return undefined;
    const mark = () => {
      last.current = Date.now();
      if (autoAway.current) {
        autoAway.current = false;
        saveMyPrefs({ availability: 'available' }).catch(() => {});
      }
    };
    const events = ['pointerdown', 'keydown', 'mousemove', 'wheel', 'touchstart'];
    let throttle = 0;
    const onAct = () => {
      const n = Date.now();
      if (n - throttle < 5000 && !autoAway.current) return;
      throttle = n;
      mark();
    };
    events.forEach((ev) => window.addEventListener(ev, onAct, { passive: true }));
    const t = setInterval(() => {
      if (!autoAway.current && prefs.availability === 'available' && Date.now() - last.current > IDLE_MS) {
        autoAway.current = true;
        saveMyPrefs({ availability: 'away' }).catch(() => {});
      }
    }, 30000);
    return () => {
      events.forEach((ev) => window.removeEventListener(ev, onAct));
      clearInterval(t);
    };
  }, [prefs?.availability_auto, prefs?.availability, !!prefs]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}