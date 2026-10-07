'use client';
// Ruta: lib/tickets/api.js
// Tickets de errores internos: lectura (RLS) y cambios (RPC con permisos).

import { useEffect, useState } from 'react';
import { supabase } from '../supabase/client';

export const STATUS = {
  new: { label: 'Nuevo', tone: 'info' },
  analysis: { label: 'En análisis', tone: 'info' },
  awaiting_approval: { label: 'Requiere aprobación', tone: 'warn' },
  approved: { label: 'Aprobado', tone: 'ok' },
  in_progress: { label: 'En progreso', tone: 'accent' },
  blocked: { label: 'Bloqueado', tone: 'danger' },
  resolved: { label: 'Resuelto', tone: 'ok' },
  verification: { label: 'Verificación', tone: 'warn' },
  closed: { label: 'Cerrado', tone: 'muted' },
  reopened: { label: 'Reabierto', tone: 'danger' },
  rejected: { label: 'Rechazado', tone: 'muted' },
};

export const PRIORITY = {
  critica: { label: 'Crítica', tone: 'danger' },
  alta: { label: 'Alta', tone: 'warn' },
  media: { label: 'Media', tone: 'info' },
  baja: { label: 'Baja', tone: 'muted' },
};

export const CATEGORIES = {
  interfaz: 'Interfaz',
  datos: 'Datos',
  integracion: 'Integraciones',
  rendimiento: 'Rendimiento',
  acceso: 'Acceso y permisos',
  telefonia: 'Telefonía',
  whatsapp: 'WhatsApp',
  comunicacion: 'Comunicación',
  otro: 'Otro',
};

export const SOURCE = { chat_ai: 'Detectado por IA en el chat', manual: 'Reporte manual', api: 'API' };

export const OPEN_STATES = ['new', 'analysis', 'awaiting_approval', 'approved', 'in_progress', 'blocked', 'reopened'];

// Acciones que se ofrecen según el estado (el servidor vuelve a validar)
export function nextActions(t, can) {
  const a = [];
  const s = t.status;
  if (t.merged_into) return a;
  if (s === 'new' && can.work) a.push({ to: 'analysis', label: 'Analizar', icon: 'search' });
  if (['new', 'analysis', 'approved', 'blocked', 'reopened'].includes(s) && can.work)
    a.push({ to: 'in_progress', label: t.requires_approval && !t.approved_at ? 'Pedir aprobación' : 'Empezar a trabajar', icon: 'play', primary: true });
  if (s === 'awaiting_approval' && can.approve) {
    a.push({ to: 'approved', label: 'Aprobar', icon: 'shield-check', primary: true });
    a.push({ to: 'rejected', label: 'Rechazar', icon: 'ban', note: true });
  }
  if (['new', 'analysis'].includes(s) && can.approve) a.push({ to: 'rejected', label: 'No es un error', icon: 'ban', note: true });
  if (s === 'in_progress' && can.work) a.push({ to: 'blocked', label: 'Bloqueado', icon: 'pause', note: true });
  if (['in_progress', 'blocked', 'approved', 'reopened'].includes(s) && can.resolve)
    a.push({ to: 'resolved', label: 'Marcar resuelto', icon: 'circle-check', primary: true, note: true });
  if (s === 'resolved' && can.resolve) a.push({ to: 'verification', label: 'Pasar a verificación', icon: 'eye' });
  if (['resolved', 'verification'].includes(s) && can.close) a.push({ to: 'closed', label: 'Verificado y cerrar', icon: 'shield-check', primary: s === 'verification' });
  if (['resolved', 'verification', 'closed', 'rejected'].includes(s) && can.work) a.push({ to: 'reopened', label: 'Reabrir', icon: 'rotate-ccw', note: true });
  return a;
}

export async function listTickets() {
  const { data, error } = await supabase
    .from('tickets')
    .select('*')
    .is('merged_into', null)
    .order('priority_score', { ascending: false })
    .order('last_reported_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  return data ?? [];
}

export async function getTicketDetail(id) {
  const [t, occ, com, ev, att] = await Promise.all([
    supabase.from('tickets').select('*').eq('id', id).maybeSingle(),
    supabase.from('ticket_occurrences').select('*').eq('ticket_id', id).order('created_at', { ascending: false }).limit(100),
    supabase.from('ticket_comments').select('*').eq('ticket_id', id).order('created_at'),
    supabase.from('ticket_events').select('*').eq('ticket_id', id).order('created_at', { ascending: false }).limit(100),
    supabase.from('ticket_attachments').select('*').eq('ticket_id', id).order('created_at'),
  ]);
  const err = [t, occ, com, ev].find((x) => x.error)?.error;
  if (err) throw err;
  // Capturas: enlaces firmados (el bucket del chat es privado)
  const files = att.data ?? [];
  let attachments = [];
  if (files.length) {
    const { data: signed } = await supabase.storage.from('chat-files').createSignedUrls(files.map((f) => f.path), 3600);
    attachments = files.map((f, i) => ({ ...f, url: signed?.[i]?.signedUrl ?? null }));
  }
  return { ticket: t.data, occurrences: occ.data ?? [], comments: com.data ?? [], events: ev.data ?? [], attachments };
}

async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}

export const ticketsSummary = () => rpc('tickets_summary');
export const reportProblem = (text, title) => rpc('ticket_report', { p_text: text, p_title: title || null });
export const setStatus = (id, status, note) => rpc('ticket_set_status', { p_ticket: id, p_status: status, p_note: note || null });
export const updateTicket = (id, patch) => rpc('ticket_update', { p_ticket: id, p_patch: patch });
export const commentTicket = (id, body) => rpc('ticket_comment', { p_ticket: id, p_body: body });
export const mergeTicket = (from, into) => rpc('ticket_merge', { p_from: from, p_into: into });
export const deleteTicket = (id) => rpc('ticket_delete', { p_ticket: id });
export const manualQueue = () => rpc('ticket_manual_queue');
export const manualResolve = (id, action, title, into) => rpc('ticket_manual_resolve', { p_inbox: id, p_action: action, p_title: title || null, p_into: into || null });
export const scanStats = () => rpc('ticket_scan_stats');
export const reviewTicketsNow = () => rpc('ticket_review_now');
export const getTicketSettings = () => rpc('ticket_settings_get');
export const saveTicketSettings = (p) => rpc('ticket_settings_save', { p });

// Se vuelve a llamar cuando algo cambia en tickets (tiempo real)
export function useTicketsRealtime(onChange, enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;
    let t = null;
    const fire = () => {
      clearTimeout(t);
      t = setTimeout(onChange, 400);
    };
    const ch = supabase
      .channel(`tickets-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, fire)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ticket_comments' }, fire)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ticket_events' }, fire)
      .subscribe();
    return () => {
      clearTimeout(t);
      supabase.removeChannel(ch);
    };
  }, [onChange, enabled]);
}

export function timeAgo(iso) {
  if (!iso) return '';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'hace un momento';
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  const d = Math.round(s / 86400);
  return d === 1 ? 'ayer' : `hace ${d} días`;
}

export function useTicketBadge(enabled) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    const load = () => ticketsSummary().then((s) => alive && setN(s?.mine ?? 0)).catch(() => {});
    load();
    const id = setInterval(load, 120000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [enabled]);
  return n;
}