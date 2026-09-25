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

const MSG_COLS = 'id, conversation_id, sender_id, body, created_at, edited_at';

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

export async function sendMessage(conversationId, body) {
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({ conversation_id: conversationId, body })
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
  return m.sender_id === userId && Date.now() - new Date(m.created_at).getTime() < EDIT_MINUTES * 60_000;
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
            const n = new Notification('Nuevo mensaje', { body: String(m.body).slice(0, 120), tag: m.conversation_id });
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