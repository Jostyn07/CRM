// Ruta: lib/whatsapp/api.js
// WhatsApp (Fase 4, proveedor temporal Wazzup). La API key nunca pasa por
// el navegador: conectar y enviar se hace por Edge Functions.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase/client';

const BUCKET = 'whatsapp-media';
export const WA_MAX_BYTES = 10 * 1024 * 1024; // límite de Wazzup para WhatsApp

async function fnError(error, fallback) {
  try {
    const body = await error?.context?.json?.();
    if (body?.error) return body.error;
  } catch {
    /* sin cuerpo */
  }
  return error?.message || fallback;
}

const MSG_COLS =
  'id, conversation_id, provider_message_id, direction, from_phone_app, sender_user_id, kind, body, media_url, media_path, media_mime, media_name, status, error, reply_to_provider_id, is_edited, is_deleted, created_at';

// ---------------- Conversaciones
export async function listConversations(channelId) {
  const { data, error } = await supabase.rpc('wa_my_conversations', { p_channel: channelId || null, p_limit: 300 });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getConversation(id) {
  const { data } = await supabase.from('wa_conversations').select('*').eq('id', id).maybeSingle();
  return data;
}

export async function getLeadConversations(leadId) {
  const { data, error } = await supabase
    .from('wa_conversations')
    .select('*')
    .eq('lead_id', leadId)
    .order('last_message_at', { ascending: false, nullsFirst: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getMessages(conversationId, { before, limit = 60 } = {}) {
  let q = supabase.from('wa_messages').select(MSG_COLS).eq('conversation_id', conversationId);
  if (before) q = q.lt('created_at', before);
  const { data, error } = await q.order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).reverse();
}

export async function markRead(conversationId) {
  await supabase.rpc('wa_mark_read', { p_conversation: conversationId });
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('wa:read'));
}

export async function startConversation(leadId, channelId) {
  const { data, error } = await supabase.rpc('wa_start_conversation', { p_lead: leadId, p_channel: channelId });
  if (error) throw new Error(error.message);
  return data;
}

// ---------------- Envío
export function kindFromMime(mime = '') {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'document';
}

function safeName(name = 'archivo') {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\-]+/g, '_').slice(-80) || 'archivo';
}

export async function sendText(conversationId, text, replyTo) {
  const { data, error } = await supabase.functions.invoke('whatsapp-send', {
    body: { conversation_id: conversationId, text, reply_to: replyTo || undefined },
  });
  if (error) throw new Error(await fnError(error, 'No se pudo enviar el mensaje'));
  return data;
}

export async function sendFile(orgId, conversationId, file, caption, replyTo) {
  if (file.size > WA_MAX_BYTES) throw new Error(`"${file.name}" supera el límite de 10 MB de WhatsApp.`);
  const path = `${orgId}/${conversationId}/${crypto.randomUUID()}-${safeName(file.name)}`;
  const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined });
  if (up.error) throw new Error(up.error.message);
  const { data, error } = await supabase.functions.invoke('whatsapp-send', {
    body: {
      conversation_id: conversationId,
      kind: kindFromMime(file.type),
      text: caption || undefined,
      media_path: path,
      media_mime: file.type || 'application/octet-stream',
      media_name: file.name,
      reply_to: replyTo || undefined,
    },
  });
  if (error) throw new Error(await fnError(error, 'No se pudo enviar el archivo'));
  // Wazzup no admite texto junto al archivo: el comentario va en otro mensaje
  if (caption) await sendText(conversationId, caption);
  return data;
}

// URL firmada (1 h) del archivo guardado, o la del proveedor mientras se copia
const cache = new Map();
export function useMediaUrl(message) {
  const key = message.media_path || message.media_url;
  const [url, setUrl] = useState(() => (key && cache.get(key)?.exp > Date.now() ? cache.get(key).url : null));
  useEffect(() => {
    let alive = true;
    if (!key) return undefined;
    if (!message.media_path) {
      setUrl(message.media_url);
      return undefined;
    }
    const hit = cache.get(key);
    if (hit && hit.exp > Date.now()) {
      setUrl(hit.url);
      return undefined;
    }
    supabase.storage
      .from(BUCKET)
      .createSignedUrl(message.media_path, 3600)
      .then(({ data }) => {
        if (!data?.signedUrl) return;
        cache.set(key, { url: data.signedUrl, exp: Date.now() + 55 * 60_000 });
        if (alive) setUrl(data.signedUrl);
      });
    return () => {
      alive = false;
    };
  }, [key, message.media_path, message.media_url]);
  return url;
}

// ---------------- Configuración (administrador)
export async function integrationStatus() {
  const { data } = await supabase.rpc('wa_integration_status');
  return data;
}

export async function connectWazzup(apiKey) {
  const { data, error } = await supabase.functions.invoke('whatsapp-setup', { body: { action: 'connect', api_key: apiKey } });
  if (error) throw new Error(await fnError(error, 'No se pudo conectar Wazzup'));
  return data;
}

export async function syncWazzup() {
  const { data, error } = await supabase.functions.invoke('whatsapp-setup', { body: { action: 'sync' } });
  if (error) throw new Error(await fnError(error, 'No se pudo sincronizar'));
  return data;
}

export async function listChannels() {
  const { data, error } = await supabase.from('wa_channels').select('*').order('created_at');
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function updateChannel(id, patch) {
  const { error } = await supabase.from('wa_channels').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function listChannelUsers() {
  const { data } = await supabase.from('wa_channel_users').select('channel_id, user_id');
  return data ?? [];
}

export async function setChannelUser(channelId, userId, orgId, on) {
  const q = on
    ? supabase.from('wa_channel_users').insert({ channel_id: channelId, user_id: userId, organization_id: orgId })
    : supabase.from('wa_channel_users').delete().eq('channel_id', channelId).eq('user_id', userId);
  const { error } = await q;
  if (error && error.code !== '23505') throw new Error(error.message);
}

// ---------------- No leídos (menú)
export function useWaUnread(userId) {
  const [unread, setUnread] = useState(0);
  const load = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase.rpc('wa_unread_total');
    setUnread(Number(data) || 0);
  }, [userId]);

  useEffect(() => {
    if (!userId) return undefined;
    load();
    const ch = supabase
      .channel(`wa-unread-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'wa_messages' }, (p) => {
        load();
        const m = p.new;
        if (m?.direction !== 'in') return;
        const viewing = document.visibilityState === 'visible' && window.__waOpenConversation === m.conversation_id;
        if (!viewing && 'Notification' in window && Notification.permission === 'granted') {
          try {
            const n = new Notification('WhatsApp', { body: previewOf(m).slice(0, 120), tag: `wa-${m.conversation_id}` });
            n.onclick = () => {
              window.focus();
              window.location.href = `/whatsapp?c=${m.conversation_id}`;
            };
          } catch {
            /* ignorado */
          }
        }
      })
      .subscribe();
    const onRead = () => load();
    window.addEventListener('wa:read', onRead);
    return () => {
      supabase.removeChannel(ch);
      window.removeEventListener('wa:read', onRead);
    };
  }, [userId, load]);
  return unread;
}

export function previewOf(m) {
  switch (m?.kind) {
    case 'image':
      return `📷 ${m.body || 'Foto'}`;
    case 'video':
      return `🎥 ${m.body || 'Video'}`;
    case 'audio':
      return '🎤 Audio';
    case 'document':
      return `📄 ${m.body || m.media_name || 'Documento'}`;
    case 'missing_call':
      return '📞 Llamada perdida';
    case 'geo':
      return '📍 Ubicación';
    case 'vcard':
      return '👤 Contacto';
    default:
      return m?.body || '';
  }
}

export function formatChat(chatId) {
  const d = String(chatId || '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) return `+1 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  return `+${d}`;
}

// Ventana de chat de Wazzup (iFrame). conversationId → ese chat;
// global → bandeja completa (solo alcance de organización).
export async function getWazzupUrl({ conversationId, global } = {}) {
  const body = global ? { scope: 'global' } : { conversation_id: conversationId };
  const { data, error } = await supabase.functions.invoke('whatsapp-iframe', { body });
  if (error) throw new Error(await fnError(error, 'No se pudo abrir Wazzup'));
  return data.url;
}

// Modo de trabajo elegido por cada usuario: 'app' (plataforma) o 'wazzup'
export function useWaMode() {
  const [mode, setModeState] = useState('app');
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('wa_mode');
      if (saved === 'app' || saved === 'wazzup') setModeState(saved);
    } catch {
      /* sin almacenamiento: queda en 'app' */
    }
  }, []);
  const setMode = useCallback((m) => {
    setModeState(m);
    try {
      window.localStorage.setItem('wa_mode', m);
    } catch {
      /* ignorado */
    }
  }, []);
  return [mode, setMode];
}