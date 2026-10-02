'use client';
// Ruta: components/ui/fileDropZone.js
// Zona para soltar archivos (Comunicación y WhatsApp). Cubre todo el chat
// —mensajes y caja de texto— y, mientras se arrastra un archivo encima,
// muestra un recuadro punteado con "Suelta tu archivo aquí".

import { useRef, useState } from 'react';
import Icon from './icon';

const tieneArchivos = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');

export default function FileDropZone({ onFiles, disabled, hint, children, style }) {
  const [over, setOver] = useState(false);
  const depth = useRef(0); // evita parpadeo al pasar sobre elementos internos

  const handlers = disabled
    ? {}
    : {
        onDragEnter: (e) => {
          if (!tieneArchivos(e)) return;
          e.preventDefault();
          depth.current += 1;
          setOver(true);
        },
        onDragOver: (e) => {
          if (!tieneArchivos(e)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        },
        onDragLeave: (e) => {
          if (!tieneArchivos(e)) return;
          depth.current = Math.max(0, depth.current - 1);
          if (depth.current === 0) setOver(false);
        },
        onDrop: (e) => {
          if (!tieneArchivos(e)) return;
          e.preventDefault();
          depth.current = 0;
          setOver(false);
          const files = [...(e.dataTransfer.files || [])];
          if (files.length) onFiles(files);
        },
      };

  return (
    <div {...handlers} style={{ position: 'relative', ...style }}>
      {children}
      {over && (
        <div className="file-drop-overlay" aria-hidden="true">
          <div className="file-drop-box">
            <Icon name="upload" size={34} />
            <strong>Suelta tu archivo aquí</strong>
            {hint && <span>{hint}</span>}
          </div>
        </div>
      )}
    </div>
  );
}