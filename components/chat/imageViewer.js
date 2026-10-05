'use client';
// Ruta: components/chat/imageViewer.js
// Visor de imágenes de los chats (Comunicación y WhatsApp):
//  · Pasa por las demás imágenes de la conversación (flechas, ← →).
//  · Zoom: rueda del mouse, doble clic, botones + / − o teclas + − 0.
//    Con zoom, se arrastra la imagen para moverla.
//
// items: [{ id, title, subtitle, caption, src }]   (src = lo que recibe useUrl)
// useUrl: hook que devuelve la URL de la imagen a partir de item.src

import { useEffect, useRef, useState } from 'react';
import Icon from '../ui/icon';

const MIN = 1;
const MAX = 5;

export default function ImageViewer({ items, startId, useUrl, onClose }) {
  const [i, setI] = useState(() => Math.max(0, items.findIndex((m) => m.id === startId)));
  const total = items.length;
  const cur = items[Math.min(i, total - 1)];
  const url = useUrl(cur?.src);
  // Precarga la anterior y la siguiente
  useUrl(items[i - 1]?.src);
  useUrl(items[i + 1]?.src);

  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef(null);

  const resetZoom = () => {
    setScale(1);
    setPos({ x: 0, y: 0 });
  };
  const zoomTo = (next) => {
    const s = Math.min(MAX, Math.max(MIN, next));
    setScale(s);
    if (s === 1) setPos({ x: 0, y: 0 });
  };
  const prev = () => {
    setI((x) => Math.max(0, x - 1));
    resetZoom();
  };
  const next = () => {
    setI((x) => Math.min(total - 1, x + 1));
    resetZoom();
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
      if (e.key === 'Escape') onClose();
      if (e.key === '+' || e.key === '=') setScale((s) => Math.min(MAX, s + 0.5));
      if (e.key === '-') {
        setScale((s) => {
          const n = Math.max(MIN, s - 0.5);
          if (n === 1) setPos({ x: 0, y: 0 });
          return n;
        });
      }
      if (e.key === '0') resetZoom();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

  if (!cur) return null;

  const onWheel = (e) => {
    e.stopPropagation();
    zoomTo(scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
  };
  const onPointerDown = (e) => {
    if (scale <= 1) return;
    e.preventDefault();
    drag.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    setPos({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y });
  };
  const endDrag = () => {
    drag.current = null;
  };

  return (
    <div className="img-viewer" role="dialog" aria-modal="true" aria-label="Imágenes del chat" onClick={onClose} onWheel={onWheel}>
      <div className="img-viewer-top" onClick={(e) => e.stopPropagation()}>
        <div style={{ minWidth: 0 }}>
          <strong>{cur.title}</strong>
          <span>
            {cur.subtitle}
            {total > 1 ? ` · ${i + 1} de ${total}` : ''}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button type="button" className="img-viewer-btn" onClick={() => zoomTo(scale - 0.5)} disabled={scale <= MIN} title="Alejar (−)">
            <Icon name="minus" size={18} />
          </button>
          <button type="button" className="img-viewer-zoom" onClick={resetZoom} title="Tamaño original (0)">
            {Math.round(scale * 100)}%
          </button>
          <button type="button" className="img-viewer-btn" onClick={() => zoomTo(scale + 0.5)} disabled={scale >= MAX} title="Acercar (+)">
            <Icon name="plus" size={18} />
          </button>
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
          <img
            key={cur.id}
            src={url}
            alt={cur.caption || 'imagen'}
            draggable={false}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (scale > 1) resetZoom();
              else zoomTo(2.5);
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            style={{
              transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
              cursor: scale > 1 ? (drag.current ? 'grabbing' : 'grab') : 'zoom-in',
              transition: drag.current ? 'none' : 'transform .12s ease-out',
              touchAction: 'none',
            }}
          />
        ) : (
          <div className="img-viewer-loading" />
        )}
        {cur.caption && scale === 1 && <p onClick={(e) => e.stopPropagation()}>{cur.caption}</p>}
      </div>
      {i < total - 1 && (
        <button type="button" className="img-viewer-nav right" onClick={(e) => (e.stopPropagation(), next())} title="Siguiente (→)">
          <Icon name="chevron-right" size={28} />
        </button>
      )}
    </div>
  );
}