'use client';
// Ruta: lib/me/access.js
// Registro de accesos (equipo, navegador, IP) y verificación de que la
// sesión siga abierta en el servidor (si un administrador la cerró).

import { supabase } from '../supabase/client';

const CLIENT_KEY = 'xiris.client_id';
const LAST_KEY = 'xiris.access_logged_at';

export function clientId() {
  try {
    let id = localStorage.getItem(CLIENT_KEY);
    if (!id) {
      id = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`).slice(0, 64);
      localStorage.setItem(CLIENT_KEY, id);
    }
    return id;
  } catch {
    return 'sin-almacenamiento';
  }
}

export function describeUA(ua = typeof navigator !== 'undefined' ? navigator.userAgent : '') {
  const s = ua || '';
  const device = /iPad|Tablet/i.test(s) ? 'Tableta' : /Mobi|Android|iPhone/i.test(s) ? 'Celular' : 'Computador';
  const browser = /Edg\//.test(s)
    ? 'Edge'
    : /OPR\//.test(s)
      ? 'Opera'
      : /Chrome\//.test(s)
        ? 'Chrome'
        : /Firefox\//.test(s)
          ? 'Firefox'
          : /Safari\//.test(s)
            ? 'Safari'
            : 'Otro navegador';
  const os = /Windows/.test(s)
    ? 'Windows'
    : /iPhone|iPad|iOS/.test(s)
      ? 'iOS'
      : /Mac OS X/.test(s)
        ? 'macOS'
        : /Android/.test(s)
          ? 'Android'
          : /Linux/.test(s)
            ? 'Linux'
            : 'Otro sistema';
  return { device, browser, os };
}

// Registra este equipo (al entrar y luego como máximo cada 10 minutos)
export async function logAccess({ login = false } = {}) {
  try {
    const last = Number(localStorage.getItem(LAST_KEY) || 0);
    if (!login && Date.now() - last < 10 * 60 * 1000) return;
    localStorage.setItem(LAST_KEY, String(Date.now()));
  } catch {}
  const { device, browser, os } = describeUA();
  await supabase
    .rpc('log_my_access', {
      p_client_id: clientId(),
      p_device: device,
      p_browser: browser,
      p_os: os,
      p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      p_login: login,
    })
    .then(() => {}, () => {});
}

export async function sessionAlive() {
  const { data, error } = await supabase.rpc('my_session_alive');
  if (error) return true; // ante errores de red no se saca al usuario
  return data !== false;
}

export const listMyAccess = (userId = null) =>
  supabase.rpc('access_log_list', { p_user: userId, p_limit: 50 }).then(({ data, error }) => {
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listTeamAccess = () =>
  supabase.rpc('access_log_team').then(({ data, error }) => {
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const closeUserSessions = (userId) =>
  supabase.rpc('sessions_close_user', { p_user: userId }).then(({ data, error }) => {
    if (error) throw new Error(error.message);
    return data;
  });

// ---------------- Verificación en dos pasos (TOTP)
export async function mfaStatus() {
  try {
  const [{ data: factors }, { data: aal }] = await Promise.all([supabase.auth.mfa.listFactors(), supabase.auth.mfa.getAuthenticatorAssuranceLevel()]);
  const totp = (factors?.totp ?? []).filter((f) => f.status === 'verified');
  return { factors: totp, current: aal?.currentLevel, next: aal?.nextLevel };
  } catch {
    return { factors: [] };
  }
}

export async function mfaNeedsCode() {
  try {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    return data?.nextLevel === 'aal2' && data?.currentLevel !== 'aal2';
  } catch {
    return false;
  }
}

export async function mfaVerifyLogin(code) {
  const { data: factors, error } = await supabase.auth.mfa.listFactors();
  if (error) throw new Error(error.message);
  const f = (factors?.totp ?? []).find((x) => x.status === 'verified');
  if (!f) throw new Error('No hay un método de verificación configurado.');
  const { error: e2 } = await supabase.auth.mfa.challengeAndVerify({ factorId: f.id, code: code.trim() });
  if (e2) throw new Error('El código no es válido o ya venció. Intenta con el siguiente.');
}