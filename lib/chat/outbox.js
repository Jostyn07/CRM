'use client';
// Ruta: lib/chat/outbox.js
// Cola de envíos del chat interno.
//
// Cada mensaje (texto, imagen, archivo, audio o sticker) queda anotado con su
// chat y su hora en el momento exacto en que se da "Enviar". Desde ahí se
// procesa aparte: aunque la persona cambie de chat mientras sube un archivo
// pesado, el mensaje llega al chat donde se envió.
//
// Dentro de un mismo chat los mensajes salen en orden; chats distintos no se
// esperan entre sí. La subida de archivos pasa por una sola función
// (storeChatFile): cuando los archivos se muevan a Cloudflare solo cambia esa.

import { sendMessage, uploadChatFile, kindFromMime } from './api';

const jobs = new Map(); // id → trabajo
const chains = new Map(); // chat → última promesa (para mantener el orden)
const listeners = new Set();

function emit(evt) {
  listeners.forEach((fn) => {
    try {
      fn(evt);
    } catch {
      /* un oyente con error no frena a los demás */
    }
  });
}

function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// Guarda un archivo del chat y devuelve su ruta. Punto único de almacenamiento.
export function storeChatFile(orgId, conversationId, file) {
  return uploadChatFile(orgId, conversationId, file);
}

// Escucha cambios de la cola: { type: 'queued' | 'sent' | 'failed', job, saved? }
export function onOutbox(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Mensajes provisionales de un chat (los que aún no se confirman)
export function outboxFor(conversationId) {
  return [...jobs.values()].filter((j) => j.conv === conversationId).map((j) => j.temp);
}

// ¿Hay envíos sin terminar? (para avisar antes de cerrar la pestaña)
export const outboxBusy = () => [...jobs.values()].some((j) => !j.temp._failed);

async function run(job) {
  try {
    let path = job.item.attachment_path ?? null;
    if (job.item.file) {
      path = await storeChatFile(job.orgId, job.conv, job.item.file);
      // Ya quedó guardado: si el envío falla, el reintento usa esta copia
      job.item = { ...job.item, attachment_path: path };
      delete job.item.file;
    }
    const { file, ...rest } = job.item;
    const saved = await sendMessage(job.conv, { ...rest, id: job.id, attachment_path: path });
    jobs.delete(job.id);
    emit({ type: 'sent', job, saved });
  } catch (e) {
    job.temp = { ...job.temp, _pending: false, _failed: e?.message || 'No se envió' };
    emit({ type: 'failed', job });
  }
}

function schedule(job) {
  const prev = chains.get(job.conv) ?? Promise.resolve();
  const next = prev.then(() => run(job));
  chains.set(job.conv, next);
  next.finally(() => {
    if (chains.get(job.conv) === next) chains.delete(job.conv);
  });
}

// Encola uno o varios mensajes para un chat. items: [{ body, file, kind,
// attachment_path, attachment_mime, duration_ms, reply_to_id }]
export function enqueue({ orgId, conversationId, senderId, items }) {
  const at = Date.now();
  items.forEach((it, i) => {
    const id = uuid();
    const f = it.file;
    const item = {
      kind: it.kind ?? (f ? kindFromMime(f.type) : 'text'),
      body: it.body ?? null,
      reply_to_id: it.reply_to_id ?? null,
      ...(f
        ? {
            file: f,
            attachment_name: f.name,
            attachment_mime: f.type || 'application/octet-stream',
            attachment_size: f.size,
            duration_ms: it.duration_ms ?? null,
          }
        : {}),
      ...(it.attachment_path ? { attachment_path: it.attachment_path, attachment_mime: it.attachment_mime } : {}),
    };
    const temp = {
      id,
      conversation_id: conversationId,
      sender_id: senderId,
      kind: item.kind,
      body: item.body,
      reply_to_id: item.reply_to_id,
      attachment_path: it.attachment_path ?? null,
      attachment_name: item.attachment_name ?? null,
      attachment_mime: item.attachment_mime ?? null,
      attachment_size: item.attachment_size ?? null,
      duration_ms: item.duration_ms ?? null,
      created_at: new Date(at + i).toISOString(),
      _pending: true,
      _uploading: !!f,
    };
    const job = { id, conv: conversationId, orgId, item, temp };
    jobs.set(id, job);
    emit({ type: 'queued', job });
    schedule(job);
  });
}

// Reintenta un envío que falló (mismo chat, mismo contenido)
export function retry(id) {
  const job = jobs.get(id);
  if (!job) return;
  job.temp = { ...job.temp, _pending: true, _failed: null };
  emit({ type: 'queued', job });
  schedule(job);
}

// Descarta un envío que falló
export function discard(id) {
  const job = jobs.get(id);
  if (!job) return;
  jobs.delete(id);
  emit({ type: 'discarded', job });
}