'use client';
// Ruta: components/ui/growTextarea.js
// Caja de texto para escribir mensajes:
//  · Crece sola mientras se escribe (de 1 línea hasta ~160 px) y luego
//    muestra su propia barra de desplazamiento.
//  · Se puede agrandar o achicar a mano arrastrando la manija de arriba
//    (hasta 260 px). Doble clic en la manija vuelve al tamaño normal.
//  · El tamaño elegido se recuerda en este navegador (storageKey).

import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';

const MIN = 44;
const AUTO_MAX = 160;
const MAX = 260;

const useIsoLayout = typeof window === 'undefined' ? useEffect : useLayoutEffect;

function readSaved(key) {
  if (!key) return null;
  try {
    const v = Number(localStorage.getItem(`xiris.ta.${key}`));
    return v >= MIN && v <= MAX ? v : null;
  } catch {
    return null;
  }
}
function save(key, v) {
  if (!key) return;
  try {
    if (v) localStorage.setItem(`xiris.ta.${key}`, String(Math.round(v)));
    else localStorage.removeItem(`xiris.ta.${key}`);
  } catch {}
}

const GrowTextarea = forwardRef(function GrowTextarea({ storageKey, value, style, className = 'input', ...rest }, ref) {
  const ta = useRef(null);
  const [manual, setManual] = useState(null); // altura mínima elegida a mano
  const drag = useRef(null);
  useImperativeHandle(ref, () => ta.current);

  useEffect(() => setManual(readSaved(storageKey)), [storageKey]);

  const fit = useCallback(() => {
    const el = ta.current;
    if (!el) return;
    const cap = Math.max(AUTO_MAX, manual ?? 0);
    el.style.height = 'auto';
    const content = el.scrollHeight + 2;
    const h = Math.min(cap, Math.max(manual ?? MIN, content));
    el.style.height = `${h}px`;
    el.style.overflowY = content > cap ? 'auto' : 'hidden';
  }, [manual]);

  useIsoLayout(fit, [value, fit]);

  const onPointerDown = (e) => {
    e.preventDefault();
    const start = ta.current?.offsetHeight ?? MIN;
    drag.current = { y: e.clientY, start };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    // Arrastrar hacia arriba agranda (la caja está pegada abajo)
    const h = Math.min(MAX, Math.max(MIN, drag.current.start + (drag.current.y - e.clientY)));
    setManual(h);
  };
  const onPointerUp = () => {
    if (!drag.current) return;
    drag.current = null;
    setManual((h) => {
      const v = h && h > MIN + 4 ? h : null;
      save(storageKey, v);
      return v;
    });
  };

  return (
    <div className={`grow-ta${manual ? ' is-manual' : ''}`} style={style}>
      <span
        className="grow-ta-handle"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Arrastra para cambiar el alto de la caja de mensaje"
        title="Arrastra para agrandar · doble clic para volver al tamaño normal"
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => {
          setManual(null);
          save(storageKey, null);
        }}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
          e.preventDefault();
          const cur = manual ?? ta.current?.offsetHeight ?? MIN;
          const v = Math.min(MAX, Math.max(MIN, cur + (e.key === 'ArrowUp' ? 20 : -20)));
          const keep = v > MIN + 4 ? v : null;
          setManual(keep);
          save(storageKey, keep);
        }}
      />
      <textarea ref={ta} className={`${className} grow-ta-input`} rows={1} value={value} {...rest} />
    </div>
  );
});

export default GrowTextarea;