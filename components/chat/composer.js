'use client';
// Ruta: components/chat/composer.js
// Caja para escribir: formato (negrita, cursiva, subrayado, tachado),
// emojis, stickers, adjuntos (imagen, video, audio, documento), nota de
// voz y respuesta a un mensaje.

import { useEffect, useRef, useState } from 'react';
import EmojiPicker from './emojiPicker';
import StickerPicker from './stickerPicker';
import VoiceMeter from './voiceMeter';
import { MAX_FILE_BYTES, fileSize, kindFromMime, previewOf } from '../../lib/chat/api';
import { wrapSelection } from '../../lib/chat/format';

const FORMATS = [
  { label: 'B', title: 'Negrita (*texto*)', marker: '*', style: { fontWeight: 700 } },
  { label: 'I', title: 'Cursiva (_texto_)', marker: '_', style: { fontStyle: 'italic' } },
  { label: 'U', title: 'Subrayado (++texto++)', marker: '++', style: { textDecoration: 'underline' } },
  { label: 'S', title: 'Tachado (~texto~)', marker: '~', style: { textDecoration: 'line-through' } },
  { label: '</>', title: 'Código (`texto`)', marker: '`', style: { fontFamily: 'monospace', fontSize: '0.75rem' } },
];

export default function Composer({ orgId, userId, userMap, replyTo, onCancelReply, onSend, disabled }) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]); // [{file, url}]
  const [showEmoji, setShowEmoji] = useState(false);
  const [showStickers, setShowStickers] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [recording, setRecording] = useState(null); // {recorder, start}
  const [recSeconds, setRecSeconds] = useState(0);
  const taRef = useRef(null);
  const fileRef = useRef(null);
  const chunksRef = useRef([]);

  useEffect(() => {
    if (replyTo) taRef.current?.focus();
  }, [replyTo]);

  useEffect(() => {
    if (!recording) return undefined;
    const t = setInterval(() => setRecSeconds(Math.floor((Date.now() - recording.start) / 1000)), 250);
    return () => clearInterval(t);
  }, [recording]);

  // Limpia vistas previas
  useEffect(() => () => files.forEach((f) => f.url && URL.revokeObjectURL(f.url)), [files]);

  function addFiles(list) {
    const ok = [];
    for (const file of list) {
      if (file.size > MAX_FILE_BYTES) {
        setError(`"${file.name}" supera el límite de 50 MB.`);
        continue;
      }
      ok.push({ file, url: file.type.startsWith('image/') || file.type.startsWith('video/') ? URL.createObjectURL(file) : null });
    }
    if (ok.length) setFiles((prev) => [...prev, ...ok].slice(0, 10));
  }

  async function submit() {
    if (sending || disabled) return;
    const body = text.trim();
    if (!body && !files.length) return;
    setSending(true);
    setError(null);
    try {
      await onSend({ text: body, files: files.map((f) => f.file), replyTo });
      setText('');
      setFiles([]);
      onCancelReply?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      recorder.start();
      setRecSeconds(0);
      setRecording({ recorder, stream, start: Date.now(), mime });
    } catch {
      setError('No se pudo acceder al micrófono. Revisa los permisos del navegador.');
    }
  }

  function stopRecording(send) {
    const r = recording;
    if (!r) return;
    const duration = Date.now() - r.start;
    r.recorder.onstop = async () => {
      r.stream.getTracks().forEach((t) => t.stop());
      if (!send || duration < 800) return;
      const blob = new Blob(chunksRef.current, { type: r.mime });
      const ext = r.mime.includes('webm') ? 'webm' : 'm4a';
      const file = new File([blob], `nota-de-voz-${Date.now()}.${ext}`, { type: r.mime });
      setSending(true);
      try {
        await onSend({ text: '', files: [file], replyTo, durationMs: duration });
        onCancelReply?.();
      } catch (e) {
        setError(e.message);
      } finally {
        setSending(false);
      }
    };
    r.recorder.stop();
    setRecording(null);
  }

  const iconBtn = { border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '1.25rem', padding: '4px 6px', borderRadius: 8, color: 'var(--color-text)' };

  return (
    <div
      style={{ borderTop: '1px solid var(--color-border)', padding: '0.5rem 0.8rem 0.7rem', position: 'relative' }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        addFiles([...(e.dataTransfer.files || [])]);
      }}
    >
      {replyTo && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', marginBottom: 6, borderLeft: '3px solid var(--color-primary)', background: 'var(--color-active-bg)', borderRadius: 6 }}>
          <div style={{ flex: 1, minWidth: 0, fontSize: '0.8rem' }}>
            <strong style={{ display: 'block', fontSize: '0.74rem', color: 'var(--color-primary)' }}>
              Respondiendo a {replyTo.sender_id === userId ? 'ti mismo' : userMap[replyTo.sender_id]?.name ?? 'Usuario'}
            </strong>
            <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{previewOf(replyTo)}</span>
          </div>
          <button type="button" onClick={onCancelReply} style={iconBtn} title="Cancelar respuesta">
            ×
          </button>
        </div>
      )}

      {files.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 6, overflowX: 'auto', paddingBottom: 4 }}>
          {files.map((f, i) => (
            <div key={i} style={{ position: 'relative', flexShrink: 0 }}>
              {f.file.type.startsWith('image/') ? (
                <img src={f.url} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8 }} />
              ) : f.file.type.startsWith('video/') ? (
                <video src={f.url} style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8 }} />
              ) : (
                <div style={{ width: 150, height: 72, borderRadius: 8, background: 'var(--color-active-bg)', padding: 6, fontSize: '0.72rem', overflow: 'hidden' }}>
                  <div style={{ fontSize: '1.2rem' }}>{kindFromMime(f.file.type) === 'audio' ? '🎤' : '📄'}</div>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.file.name}</div>
                  <div style={{ opacity: 0.7 }}>{fileSize(f.file.size)}</div>
                </div>
              )}
              <button
                type="button"
                onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.65)', color: '#fff', cursor: 'pointer', fontSize: 12, padding: 0 }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Barra de formato */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 4 }}>
        {FORMATS.map((f) => (
          <button
            key={f.label}
            type="button"
            title={f.title}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => wrapSelection(taRef.current, text, f.marker, setText)}
            style={{ ...iconBtn, fontSize: '0.82rem', minWidth: 28, ...f.style }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {recording ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 4px' }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--color-danger)', animation: 'pulse 1s infinite', flexShrink: 0 }} />
          <span style={{ fontSize: '0.88rem', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
            {Math.floor(recSeconds / 60)}:{String(recSeconds % 60).padStart(2, '0')}
          </span>
          <VoiceMeter stream={recording.stream} />
          <button type="button" className="btn btn-secondary" onClick={() => stopRecording(false)}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={() => stopRecording(true)}>
            Enviar audio
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end' }}>
          <div style={{ position: 'relative' }}>
            <button type="button" style={iconBtn} title="Emojis" onClick={() => setShowEmoji((v) => !v)}>
              😊
            </button>
            {showEmoji && (
              <EmojiPicker
                style={{ bottom: 42, left: 0 }}
                onClose={() => setShowEmoji(false)}
                onPick={(e) => {
                  const ta = taRef.current;
                  const pos = ta?.selectionStart ?? text.length;
                  setText(text.slice(0, pos) + e + text.slice(pos));
                  requestAnimationFrame(() => {
                    ta?.focus();
                    ta?.setSelectionRange(pos + e.length, pos + e.length);
                  });
                }}
              />
            )}
          </div>
          <div style={{ position: 'relative' }}>
            <button type="button" style={iconBtn} title="Stickers" onClick={() => setShowStickers((v) => !v)}>
              🏷️
            </button>
            {showStickers && (
              <StickerPicker
                orgId={orgId}
                userId={userId}
                style={{ bottom: 42, left: 0 }}
                onClose={() => setShowStickers(false)}
                onSend={async (s) => {
                  setShowStickers(false);
                  try {
                    await onSend({ sticker: s, replyTo });
                    onCancelReply?.();
                  } catch (e) {
                    setError(e.message);
                  }
                }}
              />
            )}
          </div>
          <button type="button" style={iconBtn} title="Adjuntar imagen, video, audio o documento" onClick={() => fileRef.current?.click()}>
            📎
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              addFiles([...(e.target.files || [])]);
              e.target.value = '';
            }}
          />
          <textarea
            ref={taRef}
            className="input"
            rows={1}
            placeholder={files.length ? 'Agrega un comentario (opcional)…' : 'Escribe un mensaje…'}
            value={text}
            disabled={disabled}
            onChange={(e) => setText(e.target.value)}
            onPaste={(e) => {
              const pasted = [...(e.clipboardData?.files || [])];
              if (pasted.length) {
                e.preventDefault();
                addFiles(pasted);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            style={{ flex: 1, resize: 'none', minHeight: 40, maxHeight: 140 }}
          />
          {text.trim() || files.length ? (
            <button type="button" className="btn btn-primary" disabled={sending || disabled} onClick={submit}>
              {sending ? '…' : 'Enviar'}
            </button>
          ) : (
            <button type="button" style={{ ...iconBtn, fontSize: '1.3rem' }} title="Grabar nota de voz" disabled={sending || disabled} onClick={startRecording}>
              🎙️
            </button>
          )}
        </div>
      )}
      {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.78rem', marginTop: 4 }}>{error}</p>}
    </div>
  );
}