'use client';
// Ruta: components/chat/stickerPicker.js
// Colección personal de stickers: enviar, agregar (imagen o GIF) y quitar.

import { useEffect, useRef, useState } from 'react';
import { addSticker, listStickers, removeSticker, useSignedUrl } from '../../lib/chat/api';

function StickerThumb({ sticker, onSend, onRemove }) {
  const url = useSignedUrl(sticker.path);
  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => onSend(sticker)}
        style={{ width: '100%', aspectRatio: '1', border: 'none', background: 'transparent', cursor: 'pointer', padding: 2, borderRadius: 8 }}
      >
        {url ? <img src={url} alt="sticker" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : null}
      </button>
      <button
        type="button"
        title="Quitar de mis stickers"
        onClick={() => onRemove(sticker)}
        style={{ position: 'absolute', top: 0, right: 0, width: 18, height: 18, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 11, cursor: 'pointer', lineHeight: '18px', padding: 0 }}
      >
        ×
      </button>
    </div>
  );
}

export default function StickerPicker({ orgId, userId, onSend, onClose, reloadKey, style }) {
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const ref = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    listStickers().then(setItems).catch((e) => setError(e.message));
  }, [reloadKey]);

  useEffect(() => {
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose?.();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [onClose]);

  async function onFiles(e) {
    const files = [...(e.target.files || [])].filter((f) => f.type.startsWith('image/'));
    e.target.value = '';
    if (!files.length) return;
    setBusy(true);
    setError(null);
    try {
      for (const f of files) {
        const s = await addSticker(orgId, userId, f);
        setItems((prev) => [s, ...(prev ?? [])]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(s) {
    await removeSticker(s.id);
    setItems((prev) => prev.filter((x) => x.id !== s.id));
  }

  return (
    <div ref={ref} className="card" style={{ position: 'absolute', width: 340, padding: 8, zIndex: 20, boxShadow: '0 8px 30px rgba(0,0,0,0.18)', ...style }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <strong style={{ fontSize: '0.85rem' }}>Mis stickers</strong>
        <button type="button" className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.78rem' }} disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? 'Subiendo…' : '+ Agregar'}
        </button>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onFiles} />
      </div>
      {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.78rem' }}>{error}</p>}
      {!items ? (
        <p style={{ fontSize: '0.82rem' }}>Cargando…</p>
      ) : items.length === 0 ? (
        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', padding: '0.8rem 0' }}>
          Aún no tienes stickers. Agrega imágenes o GIF con “+ Agregar”, o guarda los que te envíen con “Guardar sticker”.
        </p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
          {items.map((s) => (
            <StickerThumb key={s.id} sticker={s} onSend={onSend} onRemove={remove} />
          ))}
        </div>
      )}
    </div>
  );
}