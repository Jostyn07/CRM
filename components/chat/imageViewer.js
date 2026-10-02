'use client';
// Ruta: components/chat/imageViewer.js
// Visor de imágenes del chat: abre una imagen y permite pasar por las demás
// imágenes de la conversación (flechas, teclado ← → y Esc).

import { useEffect, useState } from 'react';
import Icon from '../ui/icon';
import { hora, useSignedUrl } from '../../lib/chat/api';

export default function ImageViewer({ images, startId, userMap, me, onClose }) {
  const [i, setI] = useState(() => Math.max(0, images.findIndex((m) => m.id === startId)));
  const total = images.length;
  const cur = images[Math.min(i, total - 1)];
  const url = useSignedUrl(cur?.attachment_path);
  // Precarga la anterior y la siguiente para que el cambio sea inmediato
  useSignedUrl(images[i - 1]?.attachment_path);
  useSignedUrl(images[i + 1]?.attachment_path);

  const prev = () => setI((x) => Math.max(0, x - 1));
  const next = () => setI((x) => Math.min(total - 1, x + 1));

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

  if (!cur) return null;
  const who = cur.sender_id === me ? 'Tú' : userMap?.[cur.sender_id]?.name ?? 'Usuario';
  const fecha = new Date(cur.created_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });

  return (
    <div className="img-viewer" role="dialog" aria-modal="true" aria-label="Imágenes del chat" onClick={onClose}>
      <div className="img-viewer-top" onClick={(e) => e.stopPropagation()}>
        <div style={{ minWidth: 0 }}>
          <strong>{who}</strong>
          <span>
            {fecha} · {hora(cur.created_at)}
            {total > 1 ? ` · ${i + 1} de ${total}` : ''}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {url && (
            <a className="img-viewer-btn" href={url} target="_blank" rel="noopener noreferrer" title="Abrir en otra pestaña">
              <Icon name="external-link" size={18} />
            </a>
          )}
          <button type="button" className="img-viewer-btn" onClick={onClose} title="Cerrar (Esc)">
            <Icon name="x" size={20} />
          </button>
        </div>
      </div>

      {i > 0 && (
        <button type="button" className="img-viewer-nav left" onClick={(e) => (e.stopPropagation(), prev())} title="Anterior (←)">
          <Icon name="chevron-left" size={28} />
        </button>
      )}
      <div className="img-viewer-stage">
        {url ? (
          <img key={cur.id} src={url} alt={cur.attachment_name || 'imagen'} onClick={(e) => e.stopPropagation()} />
        ) : (
          <div className="img-viewer-loading" />
        )}
        {cur.body && <p onClick={(e) => e.stopPropagation()}>{cur.body}</p>}
      </div>
      {i < total - 1 && (
        <button type="button" className="img-viewer-nav right" onClick={(e) => (e.stopPropagation(), next())} title="Siguiente (→)">
          <Icon name="chevron-right" size={28} />
        </button>
      )}
    </div>
  );
}