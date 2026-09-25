// Ruta: lib/chat/api.js
// Chat interno 1 a 1 (Fase 4). Reglas en la base de datos: misma
// organización, edición del autor por 15 minutos, sin borrado,
// auditoría registrada.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase/client';

export const EDIT_MINUTES = 15;

function chatError(error) {
  if (!error) return null;
  const msg = error.message || String(error);
  if (error.code === '42501' && msg.includes('row-level')) return 'No tienes permiso para esta acción.';
  return msg;
}

export const MSG_COLS =
  'id, conversation_id, sender_id, kind, body, attachment_path, attachment_name, attachment_mime, attachment_size, duration_ms, reply_to_id, created_at, edited_at';

export async function openDirect(userId) {
  const { data, error } = await supabase.rpc('chat_open_direct', { p_user: userId });
  if (error) throw new Error(chatError(error));
  return data;
}

export async function listConversations() {
  const { data, error } = await supabase.rpc('chat_my_conversations');
  if (error) throw new Error(chatError(error));
  return data ?? [];
}

// Últimos mensajes (paginado hacia atrás con "before")
export async function getMessages(conversationId, { before, limit = 50 } = {}) {
  let q = supabase.from('chat_messages').select(MSG_COLS).eq('conversation_id', conversationId);
  if (before) q = q.lt('created_at', before);
  const { data, error } = await q.order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error(chatError(error));
  return (data ?? []).reverse();
}

// payload: { body, kind, attachment_path, attachment_name, attachment_mime, attachment_size, duration_ms, reply_to_id }
export async function sendMessage(conversationId, payload) {
  const row = typeof payload === 'string' ? { body: payload } : payload;
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({ conversation_id: conversationId, kind: 'text', ...row })
    .select(MSG_COLS)
    .single();
  if (error) throw new Error(chatError(error));
  return data;
}

export async function editMessage(id, body) {
  const { data, error } = await supabase.from('chat_messages').update({ body }).eq('id', id).select(MSG_COLS).maybeSingle();
  if (error) throw new Error(chatError(error));
  if (!data) throw new Error('Solo el autor puede editar su mensaje.');
  return data;
}

export async function markRead(conversationId) {
  await supabase.rpc('chat_mark_read', { p_conversation: conversationId });
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('chat:read'));
}

export function canEditMessage(m, userId) {
  return (
    m.sender_id === userId &&
    !['system', 'sticker'].includes(m.kind) &&
    Date.now() - new Date(m.created_at).getTime() < EDIT_MINUTES * 60_000
  );
}

// ---------------- Grupos
export async function createGroup(title, memberIds) {
  const { data, error } = await supabase.rpc('chat_create_group', { p_title: title, p_members: memberIds });
  if (error) throw new Error(chatError(error));
  return data;
}
export async function addMembers(conversationId, memberIds) {
  const { error } = await supabase.rpc('chat_add_members', { p_conversation: conversationId, p_members: memberIds });
  if (error) throw new Error(chatError(error));
}
export async function removeMember(conversationId, userId) {
  const { error } = await supabase.rpc('chat_remove_member', { p_conversation: conversationId, p_user: userId });
  if (error) throw new Error(chatError(error));
}
export async function renameGroup(conversationId, title) {
  const { error } = await supabase.rpc('chat_rename_group', { p_conversation: conversationId, p_title: title });
  if (error) throw new Error(chatError(error));
}
export async function setMemberRole(conversationId, userId, role) {
  const { error } = await supabase.rpc('chat_set_member_role', { p_conversation: conversationId, p_user: userId, p_role: role });
  if (error) throw new Error(chatError(error));
}
export async function groupMembers(conversationId) {
  const { data, error } = await supabase.rpc('chat_group_members', { p_conversation: conversationId });
  if (error) throw new Error(chatError(error));
  return data ?? [];
}

// ---------------- Archivos (bucket privado chat-files)
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
const BUCKET = 'chat-files';

export function kindFromMime(mime = '') {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'file';
}

function safeName(name = 'archivo') {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w.\-]+/g, '_').slice(-80) || 'archivo';
}

export async function uploadChatFile(orgId, conversationId, file, fileName) {
  if (file.size > MAX_FILE_BYTES) throw new Error('El archivo supera el límite de 50 MB.');
  const name = fileName || file.name || 'archivo';
  const path = `${orgId}/${conversationId}/${crypto.randomUUID()}-${safeName(name)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

// URLs firmadas con caché (1 hora)
const urlCache = new Map();
export async function signedUrl(path) {
  if (!path) return null;
  const hit = urlCache.get(path);
  if (hit && hit.exp > Date.now()) return hit.url;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error) return null;
  urlCache.set(path, { url: data.signedUrl, exp: Date.now() + 55 * 60_000 });
  return data.signedUrl;
}

export function useSignedUrl(path) {
  const [url, setUrl] = useState(() => {
    const hit = path && urlCache.get(path);
    return hit && hit.exp > Date.now() ? hit.url : null;
  });
  useEffect(() => {
    let alive = true;
    if (path) signedUrl(path).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [path]);
  return url;
}

// ---------------- Stickers (colección personal)
export async function listStickers() {
  const { data, error } = await supabase.from('chat_stickers').select('id, path, mime, created_at').order('created_at', { ascending: false });
  if (error) throw new Error(chatError(error));
  return data ?? [];
}

// Reduce la imagen a máx. 512 px (WebP) para que los stickers pesen poco
async function toStickerBlob(fileOrBlob) {
  if ((fileOrBlob.type || '').includes('gif')) return fileOrBlob; // conserva la animación
  try {
    const bmp = await createImageBitmap(fileOrBlob);
    const scale = Math.min(1, 512 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/webp', 0.9));
    return blob || fileOrBlob;
  } catch {
    return fileOrBlob;
  }
}

export async function addSticker(orgId, userId, fileOrBlob) {
  const blob = await toStickerBlob(fileOrBlob);
  const ext = blob.type === 'image/gif' ? 'gif' : blob.type === 'image/webp' ? 'webp' : 'png';
  const path = `${orgId}/stickers/${userId}/${crypto.randomUUID()}.${ext}`;
  const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || 'image/webp' });
  if (up.error) throw new Error(up.error.message);
  const { data, error } = await supabase.from('chat_stickers').insert({ path, mime: blob.type }).select('id, path, mime, created_at').single();
  if (error) throw new Error(chatError(error));
  return data;
}

// Guardar como sticker una imagen/sticker recibido
export async function saveAsSticker(orgId, userId, path) {
  if (path.startsWith(`${orgId}/stickers/`)) {
    const { data, error } = await supabase.from('chat_stickers').insert({ path }).select('id, path, mime, created_at').single();
    if (error && error.code !== '23505') throw new Error(chatError(error));
    return data;
  }
  const url = await signedUrl(path);
  const blob = await (await fetch(url)).blob();
  return addSticker(orgId, userId, blob);
}

export async function removeSticker(id) {
  const { error } = await supabase.from('chat_stickers').delete().eq('id', id);
  if (error) throw new Error(chatError(error));
}

// ---------------- Reacciones
export async function getReactions(messageIds) {
  if (!messageIds.length) return [];
  const { data } = await supabase.from('chat_reactions').select('message_id, user_id, emoji').in('message_id', messageIds);
  return data ?? [];
}
export async function toggleReaction(messageId, userId, emoji, has) {
  if (has) {
    await supabase.from('chat_reactions').delete().eq('message_id', messageId).eq('user_id', userId).eq('emoji', emoji);
  } else {
    const { error } = await supabase.from('chat_reactions').insert({ message_id: messageId, emoji });
    if (error && error.code !== '23505') throw new Error(chatError(error));
  }
}

export function fileSize(n) {
  if (!n && n !== 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function previewOf(m) {
  if (!m) return '';
  switch (m.kind) {
    case 'image':
      return `📷 ${m.body || 'Foto'}`;
    case 'video':
      return `🎥 ${m.body || 'Video'}`;
    case 'audio':
      return `🎤 ${m.body || 'Audio'}`;
    case 'file':
      return `📄 ${m.body || m.attachment_name || 'Documento'}`;
    case 'sticker':
      return '🏷️ Sticker';
    default:
      return m.body || '';
  }
}

// ---------------- Auditoría (administradores)
export async function auditConversations(userId) {
  const { data, error } = await supabase.rpc('chat_audit_conversations', { p_user: userId || null });
  if (error) throw new Error(chatError(error));
  return data ?? [];
}

export async function auditMessages(conversationId) {
  const { data, error } = await supabase.rpc('chat_audit_messages', { p_conversation: conversationId });
  if (error) throw new Error(chatError(error));
  return data ?? [];
}

// ---------------- No leídos (menú) + aviso del navegador
export function useChatUnread(userId, { notify = true } = {}) {
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase.rpc('chat_unread_total');
    setUnread(Number(data) || 0);
  }, [userId]);

  useEffect(() => {
    if (!userId) return undefined;
    load();
    const channel = supabase
      .channel(`chat-unread-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) => {
        const m = payload.new;
        load();
        if (!notify || m.sender_id === userId) return;
        // Aviso solo si el usuario no está mirando ese chat
        const viewing =
          document.visibilityState === 'visible' &&
          window.location.pathname.startsWith('/comunicacion') &&
          window.__chatOpenConversation === m.conversation_id;
        if (!viewing && 'Notification' in window && Notification.permission === 'granted') {
          try {
            if (m.kind === 'system') return;
            const n = new Notification('Nuevo mensaje', { body: previewOf(m).slice(0, 120), tag: m.conversation_id });
            n.onclick = () => {
              window.focus();
              window.location.href = `/comunicacion?c=${m.conversation_id}`;
            };
          } catch {
            /* algunos navegadores no permiten Notification fuera de un service worker */
          }
        }
      })
      .subscribe();
    const onRead = () => load();
    window.addEventListener('chat:read', onRead);
    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('chat:read', onRead);
    };
  }, [userId, load, notify]);

  return unread;
}

export function hora(iso) {
  return new Date(iso).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true });
}

export function fechaCorta(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const hoy = new Date();
  if (d.toDateString() === hoy.toDateString()) return hora(iso);
  const ayer = new Date(hoy);
  ayer.setDate(hoy.getDate() - 1);
  if (d.toDateString() === ayer.toDateString()) return 'Ayer';
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' });
}

export function diaSeparador(iso) {
  const d = new Date(iso);
  const hoy = new Date();
  if (d.toDateString() === hoy.toDateString()) return 'Hoy';
  const ayer = new Date(hoy);
  ayer.setDate(hoy.getDate() - 1);
  if (d.toDateString() === ayer.toDateString()) return 'Ayer';
  return d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
}