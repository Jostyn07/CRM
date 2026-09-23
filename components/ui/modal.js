'use client';

import { useEffect } from 'react';

// zIndex configurable -- CallInProgress necesita quedar por encima de
// cualquier otro modal (ej. Nueva llamada) si llegaran a coexistir un
// instante durante la transición entre uno y otro.
// headerActions permite inyectar botones extra junto al de cerrar (ej.
// "Minimizar" en la llamada en curso) sin que cada pantalla tenga que
// reconstruir su propio header/overlay -- así todos los modales de la
// app comparten exactamente el mismo diseño.
export default function Modal({ open, onClose, title, headerActions, children, width = 420, zIndex = 50 }) {
  // Sin esto, si el contenido detrás del modal (la página) es más alto
  // que el viewport, el body sigue haciendo scroll por debajo del
  // overlay fijo y aparece la barra de scroll nativa del navegador --
  // se ve como un "sidebar" ajeno al modal. La bloqueamos mientras el
  // modal esté abierto y la restauramos al cerrar/desmontar.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{ width, maxWidth: '90vw', maxHeight: '85vh', overflow: 'auto', position: 'relative' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          {title ? <h2 style={{ fontSize: '1rem' }}>{title}</h2> : <span />}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {headerActions}
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', fontSize: '1.1rem', lineHeight: 1 }}
              aria-label="Cerrar"
            >
              ✕
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}