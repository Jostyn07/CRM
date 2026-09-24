// Ruta: lib/activity/tracker.js
// Registro de actividad de usuarios → public.log_activity (Supabase).
//
// Uso en cualquier parte de la app:
//   import { trackEvent, trackTab } from '@/lib/activity/tracker';
//   trackTab('lead', 'informacion', 'llamadas', { entityType: 'leads', entityId: lead.id });
//   trackEvent('lead.search', { metadata: { term } });
//
// Los eventos se acumulan y se envían en lotes (cada 5 s o 20
// eventos). Al ocultar o cerrar la pestaña se envía lo pendiente
// con fetch keepalive, para no perder los últimos eventos.

const FLUSH_INTERVAL_MS = 5000;
const FLUSH_SIZE = 20;
const MAX_QUEUE = 1000;
const SESSION_KEY = 'lf_activity_session_id';

let supabase = null;
let accessToken = null;
let queue = [];
let timer = null;
let flushing = false;
let context = { branchId: null };

function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// Una sesión de actividad por pestaña del navegador
export function getSessionId() {
  if (typeof window === 'undefined') return null;
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = uuid();
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export function resetSession() {
  if (typeof window !== 'undefined') sessionStorage.removeItem(SESSION_KEY);
}

// Llamar una vez con el cliente de Supabase del navegador
export function initTracker(client) {
  if (supabase || typeof window === 'undefined') return;
  supabase = client;

  supabase.auth.getSession().then(({ data }) => {
    accessToken = data.session?.access_token ?? null;
  });
  supabase.auth.onAuthStateChange((_event, session) => {
    accessToken = session?.access_token ?? null;
  });

  timer = setInterval(() => flush(), FLUSH_INTERVAL_MS);
}

// Sucursal activa en la UI (si el usuario tiene varias)
export function setActivityContext(ctx) {
  context = { ...context, ...ctx };
}

export function trackEvent(eventType, { path, entityType, entityId, metadata, branchId } = {}) {
  if (typeof window === 'undefined') return;

  queue.push({
    session_id: getSessionId(),
    event_type: eventType,
    path: path ?? window.location.pathname + window.location.search,
    entity_type: entityType ?? null,
    entity_id: entityId ?? null,
    branch_id: branchId ?? context.branchId ?? null,
    metadata: metadata ?? {},
    occurred_at: new Date().toISOString(),
  });

  if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
  if (queue.length >= FLUSH_SIZE) flush();
}

// Cambio de pestaña dentro de la app (tabs de la ficha, configuración, etc.)
export function trackTab(area, from, to, { entityType, entityId } = {}) {
  trackEvent(`${area}.tab_change`, { entityType, entityId, metadata: { from, to } });
}

export async function flush() {
  if (!supabase || !accessToken || flushing || queue.length === 0) return;
  flushing = true;
  const batch = queue.splice(0, 200);
  try {
    const { error } = await supabase.rpc('log_activity', {
      p_events: batch,
      p_user_agent: navigator.userAgent,
    });
    if (error) throw error;
  } catch {
    queue = batch.concat(queue).slice(-MAX_QUEUE); // se reintenta en el próximo ciclo
  } finally {
    flushing = false;
  }
}

// Envío que sobrevive al cierre de la pestaña
export function flushOnExit() {
  if (!accessToken || queue.length === 0) return;
  const batch = queue.splice(0, 200);
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/log_activity`;
  try {
    fetch(url, {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ p_events: batch, p_user_agent: navigator.userAgent }),
    });
  } catch {
    queue = batch.concat(queue);
  }
}

// Llamar en el login y el logout
export async function trackLogin() {
  resetSession();
  trackEvent('auth.login');
  await flush();
}

export async function trackLogout() {
  trackEvent('auth.logout');
  await flush();
  resetSession();
}

export function stopTracker() {
  if (timer) clearInterval(timer);
  timer = null;
}