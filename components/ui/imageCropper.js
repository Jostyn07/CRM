'use client';
// Ruta: components/ui/imageCropper.js
// Recorte de imagen antes de subirla (foto de perfil, portada, foto de
// grupo, logo). Se arrastra la imagen para ubicarla dentro del marco y se
// acerca o aleja con la barra o la rueda del mouse. Solo se sube la parte
// que queda dentro del marco.
//
// <ImageCropper file={File} aspect={1} round onCancel={…} onDone={(file) => …} />

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Modal from './modal';
import Icon from './icon';

const MAX_ZOOM = 4;

export default function ImageCropper({ file, aspect = 1, round = false, outWidth = 512, outType, title = 'Ajustar imagen', onCancel, onDone }) {
  const [src, setSrc] = useState(null);
  const [img, setImg] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const drag = useRef(null);

  // Tamaño del marco en pantalla
  const frameW = aspect >= 2 ? 440 : 300;
  const frameH = Math.round(frameW / aspect);

  useEffect(() => {
    if (!file) return undefined;
    const url = URL.createObjectURL(file);
    setSrc(url);
    const im = new Image();
    im.onload = () => {
      setImg(im);
      setZoom(1);
    };
    im.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const base = img ? Math.max(frameW / img.naturalWidth, frameH / img.naturalHeight) : 1;
  const scale = base * zoom;
  const dispW = img ? img.naturalWidth * scale : 0;
  const dispH = img ? img.naturalHeight * scale : 0;

  const clamp = useCallback(
    (p, w = dispW, h = dispH) => ({
      x: Math.min(0, Math.max(frameW - w, p.x)),
      y: Math.min(0, Math.max(frameH - h, p.y)),
    }),
    [dispW, dispH, frameW, frameH]
  );

  // Al cargar: centrada
  useEffect(() => {
    if (!img) return;
    const w = img.naturalWidth * base;
    const h = img.naturalHeight * base;
    setPos({ x: (frameW - w) / 2, y: (frameH - h) / 2 });
  }, [img]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cambiar el zoom manteniendo el centro del marco
  function changeZoom(next) {
    if (!img) return;
    const z = Math.min(MAX_ZOOM, Math.max(1, next));
    const newScale = base * z;
    const cx = (frameW / 2 - pos.x) / scale;
    const cy = (frameH / 2 - pos.y) / scale;
    const w = img.naturalWidth * newScale;
    const h = img.naturalHeight * newScale;
    setZoom(z);
    setPos(clamp({ x: frameW / 2 - cx * newScale, y: frameH / 2 - cy * newScale }, w, h));
  }

  const onPointerDown = (e) => {
    e.preventDefault();
    drag.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    setPos(clamp({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y }));
  };
  const endDrag = () => {
    drag.current = null;
  };

  function nudge(dx, dy) {
    setPos((p) => clamp({ x: p.x + dx, y: p.y + dy }));
  }

  async function done() {
    if (!img) return;
    setBusy(true);
    try {
      const outW = outWidth;
      const outH = Math.round(outWidth / aspect);
      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      const sx = -pos.x / scale;
      const sy = -pos.y / scale;
      const sw = frameW / scale;
      const sh = frameH / scale;
      const type = outType || (file.type === 'image/png' ? 'image/png' : 'image/jpeg');
      if (type === 'image/jpeg') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, outW, outH);
      }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
      const blob = await new Promise((res) => canvas.toBlob(res, type, 0.9));
      if (!blob) throw new Error('No se pudo recortar la imagen.');
      const ext = type === 'image/png' ? 'png' : 'jpg';
      const name = (file.name || 'imagen').replace(/\.[^.]+$/, '') + `-recorte.${ext}`;
      await onDone(new File([blob], name, { type }));
    } finally {
      setBusy(false);
    }
  }

  if (typeof document === 'undefined') return null;
  // Portal: así el recorte queda encima de todo aunque se abra dentro de una tarjeta o de otro modal
  return createPortal(
    <Modal open={!!file} onClose={onCancel} title={title} width={frameW + 80} zIndex={130}>
      <div className="crop">
        <p className="crop-help">Arrastra la imagen para ubicarla y usa la barra para acercarla. Solo se guarda lo que queda dentro del marco.</p>
        <div
          className={`crop-frame${round ? ' round' : ''}`}
          style={{ width: frameW, height: frameH }}
          onWheel={(e) => {
            e.preventDefault();
            changeZoom(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08));
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          tabIndex={0}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 20 : 5;
            if (e.key === 'ArrowLeft') nudge(step, 0);
            if (e.key === 'ArrowRight') nudge(-step, 0);
            if (e.key === 'ArrowUp') nudge(0, step);
            if (e.key === 'ArrowDown') nudge(0, -step);
          }}
          role="application"
          aria-label="Zona para ubicar la imagen"
        >
          {src && img ? (
            <img src={src} alt="" draggable={false} style={{ width: dispW, height: dispH, transform: `translate(${pos.x}px, ${pos.y}px)` }} />
          ) : (
            <span className="crop-loading">Cargando…</span>
          )}
          <span className="crop-grid" aria-hidden="true" />
        </div>
        <div className="crop-zoom">
          <Icon name="minus" size={16} />
          <input type="range" min="1" max={MAX_ZOOM} step="0.01" value={zoom} onChange={(e) => changeZoom(Number(e.target.value))} aria-label="Acercar o alejar" />
          <Icon name="plus" size={16} />
        </div>
        <div className="crop-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={done} disabled={busy || !img}>
            {busy ? 'Guardando…' : 'Usar imagen'}
          </button>
        </div>
      </div>
    </Modal>,
    document.body
  );
}