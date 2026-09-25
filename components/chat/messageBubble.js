'use client';
// Ruta: components/chat/messageBubble.js
// Un mensaje del chat: texto con formato, imagen, video, audio,
// documento o sticker; cita del mensaje respondido; reacciones y
// acciones (responder, reaccionar, editar, guardar sticker).

import { useEffect, useRef, useState } from 'react';
import { EDIT_MINUTES, canEditMessage, fileSize, hora, previewOf, useSignedUrl } from '../../lib/chat/api';
import { QUICK_REACTIONS, renderFormatted } from '../../lib/chat/format';
import EmojiPicker from './emojiPicker';

function Attachment({ m, mine, onOpenImage }) {
  const url = useSignedUrl(m.attachment_path);
  if (!url) return <div style={{ width: 200, height: 120, borderRadius: 8, background: 'rgba(0,0,0,0.08)' }} />;

  if (m.kind === 'image' || m.kind === 'sticker') {
    const sticker = m.kind === 'sticker';
    return (
      <img
        src={url}
        alt={m.attachment_name || (sticker ? 'sticker' : 'imagen')}
        onClick={() => !sticker && onOpenImage?.(url)}
        style={{
          display: 'block',
          maxWidth: sticker ? 160 : 280,
          maxHeight: sticker ? 160 : 320,
          borderRadius: sticker ? 0 : 8,
          cursor: sticker ? 'default' : 'zoom-in',
          objectFit: 'contain',
        }}
      />
    );
  }
  if (m.kind === 'video') {
    return <video src={url} controls preload="metadata" style={{ display: 'block', maxWidth: 320, maxHeight: 320, borderRadius: 8 }} />;
  }
  if (m.kind === 'audio') {
    return <audio src={url} controls preload="metadata" style={{ display: 'block', width: 260, maxWidth: '100%' }} />;
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      download={m.attachment_name || true}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '0.5rem 0.6rem',
        borderRadius: 8,
        background: mine ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.06)',
        color: 'inherit',
        textDecoration: 'none',
        minWidth: 200,
      }}
    >
      <span style={{ fontSize: '1.6rem' }}>📄</span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 600, fontSize: '0.84rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>
          {m.attachment_name || 'Documento'}
        </span>
        <span style={{ fontSize: '0.72rem', opacity: 0.8 }}>{fileSize(m.attachment_size)} · Descargar</span>
      </span>
    </a>
  );
}

export default function MessageBubble({
  m,
  me,
  userMap,
  showSender,
  replyTo,
  reactions = [],
  readOnly,
  editing,
  onReply,
  onReact,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onSaveSticker,
  stickerSaved,
  isGroup,
  readInfo,
  onJumpTo,
  onOpenImage,
}) {
  const [hover, setHover] = useState(false);
  const [picker, setPicker] = useState(false);
  const [editText, setEditText] = useState(m.body ?? '');
  const hideTimer = useRef(null);
  const mine = m.sender_id === me;

  // Se oculta con una pequeña demora para alcanzar a llegar a los botones
  const show = () => {
    clearTimeout(hideTimer.current);
    setHover(true);
  };
  const hideSoon = () => {
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      setHover(false);
      setPicker(false);
    }, 450);
  };
  useEffect(() => () => clearTimeout(hideTimer.current), []);

  if (m.kind === 'system') {
    return (
      <div style={{ alignSelf: 'center', fontSize: '0.74rem', color: 'var(--color-text-muted)', background: 'var(--color-active-bg)', padding: '3px 10px', borderRadius: 999, margin: '4px 0', textAlign: 'center' }}>
        {m.body}
      </div>
    );
  }

  const sticker = m.kind === 'sticker';
  const media = ['image', 'video', 'sticker'].includes(m.kind);

  // Agrupa reacciones: emoji → [usuarios]
  const grouped = reactions.reduce((acc, r) => ((acc[r.emoji] ||= []).push(r.user_id), acc), {});

  return (
    <div
      id={`msg-${m.id}`}
      onMouseEnter={show}
      onMouseLeave={() => !picker && hideSoon()}
      style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '75%', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start' }}
    >
      {showSender && !mine && (
        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-primary)', margin: '0 0 2px 6px' }}>{userMap[m.sender_id]?.name ?? 'Usuario'}</span>
      )}

      <div
        style={{
          padding: sticker ? 0 : media && !m.body && !replyTo ? 4 : '0.5rem 0.75rem',
          borderRadius: 12,
          borderBottomRightRadius: mine && !sticker ? 4 : 12,
          borderBottomLeftRadius: !mine && !sticker ? 4 : 12,
          background: sticker ? 'transparent' : mine ? 'var(--color-primary)' : 'var(--color-active-bg)',
          color: mine && !sticker ? '#fff' : 'var(--color-text)',
          fontSize: '0.88rem',
          position: 'relative',
        }}
      >
        {replyTo && (
          <button
            type="button"
            onClick={() => onJumpTo?.(replyTo.id)}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              border: 'none',
              borderLeft: `3px solid ${mine ? '#fff' : 'var(--color-primary)'}`,
              background: mine ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.06)',
              color: 'inherit',
              padding: '4px 8px',
              borderRadius: 6,
              marginBottom: 6,
              cursor: 'pointer',
              fontSize: '0.78rem',
            }}
          >
            <strong style={{ display: 'block', fontSize: '0.72rem' }}>{replyTo.sender_id === me ? 'Tú' : userMap[replyTo.sender_id]?.name ?? 'Usuario'}</strong>
            <span style={{ opacity: 0.85, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>{previewOf(replyTo)}</span>
          </button>
        )}

        {m.attachment_path && <Attachment m={m} mine={mine} onOpenImage={onOpenImage} />}

        {editing ? (
          <div style={{ display: 'grid', gap: 6, minWidth: 240, marginTop: m.attachment_path ? 6 : 0 }}>
            <textarea
              className="input"
              rows={2}
              value={editText}
              autoFocus
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  onSaveEdit(m.id, editText);
                }
                if (e.key === 'Escape') onCancelEdit();
              }}
            />
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={onCancelEdit}>
                Cancelar
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => onSaveEdit(m.id, editText)}>
                Guardar
              </button>
            </div>
          </div>
        ) : (
          m.body && (
            <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: m.attachment_path ? 6 : 0, padding: media && !replyTo ? '0 4px' : 0 }}>
              {renderFormatted(m.body)}
            </div>
          )
        )}

        <div
          style={{
            fontSize: '0.66rem',
            textAlign: 'right',
            marginTop: 2,
            display: 'flex',
            gap: 8,
            justifyContent: 'flex-end',
            ...(sticker
              ? { background: 'rgba(0,0,0,0.45)', color: '#fff', borderRadius: 999, padding: '1px 6px', width: 'fit-content', marginLeft: 'auto' }
              : { opacity: 0.75, padding: media && !m.body ? '0 4px 2px' : 0 }),
          }}
        >
          {m.edited_at && <span>editado</span>}
          <span>{hora(m.created_at)}</span>
          {readInfo && <ReadTicks info={readInfo} userMap={userMap} isGroup={isGroup} mine={mine} sticker={sticker} />}
        </div>
      </div>

      {Object.keys(grouped).length > 0 && (
        <div style={{ display: 'flex', gap: 4, marginTop: -4, flexWrap: 'wrap', zIndex: 1 }}>
          {Object.entries(grouped).map(([emoji, users]) => (
            <button
              key={emoji}
              type="button"
              disabled={readOnly}
              title={users.map((u) => userMap[u]?.name ?? 'Usuario').join(', ')}
              onClick={() => onReact?.(m, emoji, users.includes(me))}
              style={{
                fontSize: '0.78rem',
                padding: '1px 6px',
                borderRadius: 999,
                border: users.includes(me) ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                background: 'var(--color-card-bg, var(--color-bg, #fff))',
                cursor: readOnly ? 'default' : 'pointer',
                color: 'var(--color-text)',
              }}
            >
              {emoji} {users.length > 1 ? users.length : ''}
            </button>
          ))}
        </div>
      )}

      {/* Acciones al pasar el mouse. El contenedor exterior es transparente
          y queda pegado al mensaje (sin hueco), así el mouse no "se sale"
          al moverse hacia los botones. */}
      {!readOnly && (hover || picker) && !editing && (
        <div
          onMouseEnter={show}
          onMouseLeave={() => !picker && hideSoon()}
          style={{
            position: 'absolute',
            top: showSender && !mine ? 14 : -6,
            [mine ? 'left' : 'right']: 0,
            transform: mine ? 'translateX(-100%)' : 'translateX(100%)',
            [mine ? 'paddingRight' : 'paddingLeft']: 6,
            zIndex: 5,
          }}
        >
          <div
            style={{
              display: 'flex',
              gap: 2,
              background: 'var(--color-card-bg, var(--color-bg, #fff))',
              border: '1px solid var(--color-border)',
              borderRadius: 999,
              padding: '3px 6px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
              position: 'relative',
              whiteSpace: 'nowrap',
            }}
          >
            {QUICK_REACTIONS.slice(0, 3).map((e) => (
              <button key={e} type="button" title="Reaccionar" onClick={() => onReact?.(m, e, (grouped[e] ?? []).includes(me))} style={actionBtn}>
                {e}
              </button>
            ))}
            <button type="button" title="Más reacciones" onClick={() => setPicker((v) => !v)} style={actionBtn}>
              ☺︎
            </button>
            <button type="button" title="Responder" onClick={() => onReply?.(m)} style={actionBtn}>
              ↩
            </button>
            {canEditMessage(m, me) && (
              <button type="button" title={`Editar (hasta ${EDIT_MINUTES} min)`} onClick={() => onStartEdit?.(m)} style={actionBtn}>
                ✎
              </button>
            )}
            {(m.kind === 'image' || (m.kind === 'sticker' && !stickerSaved)) && (
              <button
                type="button"
                title="Guardar en mis stickers"
                onClick={() => onSaveSticker?.(m)}
                style={{ ...actionBtn, fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: 3 }}
              >
                ⭐ <span>Guardar sticker</span>
              </button>
            )}
            {picker && (
              <EmojiPicker
                style={{ top: 36, [mine ? 'right' : 'left']: 0 }}
                onClose={() => {
                  setPicker(false);
                  hideSoon();
                }}
                onPick={(e) => {
                  setPicker(false);
                  setHover(false);
                  onReact?.(m, e, (grouped[e] ?? []).includes(me));
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ✓ enviado · ✓✓ azul: lo vieron todos. Clic: quién lo vio y cuándo.
function ReadTicks({ info, userMap, isGroup, sticker }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const readBy = new Map(info.reads.map((r) => [r.user_id, r.read_at]));
  const seen = info.recipients.filter((u) => readBy.has(u));
  const pending = info.recipients.filter((u) => !readBy.has(u));
  const all = info.recipients.length > 0 && pending.length === 0;

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const when = (iso) => {
    const d = new Date(iso);
    const today = new Date().toDateString() === d.toDateString();
    return today
      ? `hoy ${hora(iso)}`
      : d.toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const summary = all
    ? isGroup
      ? 'Visto por todos'
      : `Visto ${when(readBy.get(info.recipients[0]))}`
    : isGroup && seen.length
      ? `Visto por ${seen.length} de ${info.recipients.length}`
      : 'Enviado · aún no lo han visto';

  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        title={summary}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        style={{
          border: 'none',
          background: 'transparent',
          padding: 0,
          cursor: 'pointer',
          fontSize: '0.78rem',
          fontWeight: 700,
          letterSpacing: '-3px',
          paddingRight: 3,
          lineHeight: 1,
          color: all ? (sticker ? '#7dd3fc' : '#7dd3fc') : 'inherit',
          opacity: all ? 1 : 0.85,
        }}
      >
        {all ? '✓✓' : '✓'}
      </button>
      {open && (
        <span
          className="card"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            bottom: '140%',
            right: 0,
            zIndex: 30,
            minWidth: 230,
            maxWidth: 280,
            padding: '0.6rem 0.7rem',
            color: 'var(--color-text)',
            textAlign: 'left',
            fontSize: '0.78rem',
            letterSpacing: 'normal',
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            display: 'block',
            whiteSpace: 'normal',
          }}
        >
          <strong style={{ display: 'block', marginBottom: 4 }}>Info del mensaje</strong>
          {seen.length > 0 && (
            <>
              <span style={{ display: 'block', color: '#0ea5e9', fontWeight: 600, marginTop: 4 }}>✓✓ Visto por</span>
              {seen
                .sort((a, b) => new Date(readBy.get(a)) - new Date(readBy.get(b)))
                .map((u) => (
                  <span key={u} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '2px 0' }}>
                    <span>{userMap[u]?.name ?? 'Usuario'}</span>
                    <span style={{ color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{when(readBy.get(u))}</span>
                  </span>
                ))}
            </>
          )}
          {pending.length > 0 && (
            <>
              <span style={{ display: 'block', color: 'var(--color-text-muted)', fontWeight: 600, marginTop: 6 }}>✓ Aún no lo ha visto</span>
              {pending.map((u) => (
                <span key={u} style={{ display: 'block', padding: '2px 0' }}>
                  {userMap[u]?.name ?? 'Usuario'}
                </span>
              ))}
            </>
          )}
          {info.recipients.length === 0 && <span style={{ color: 'var(--color-text-muted)' }}>Sin destinatarios.</span>}
        </span>
      )}
    </span>
  );
}

const actionBtn = {
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  fontSize: '0.95rem',
  padding: '2px 4px',
  borderRadius: 6,
  color: 'var(--color-text)',
};