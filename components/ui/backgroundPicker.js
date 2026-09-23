'use client';

import { useEffect, useState } from 'react';

// Fondos curados (picsum.photos con seed fijo = misma imagen siempre,
// sin necesidad de API key ni subir archivos). "none" = solo el color
// de fondo sólido, sin imagen.
const BACKGROUNDS = [
  { id: 'none', label: 'Ninguno', url: null },
  { id: 'aurora', label: 'Aurora', url: 'https://picsum.photos/seed/aurora-leads/1920/1080' },
  { id: 'ocean', label: 'Océano', url: 'https://picsum.photos/seed/ocean-leads/1920/1080' },
  { id: 'forest', label: 'Bosque', url: 'https://picsum.photos/seed/forest-leads/1920/1080' },
  { id: 'city', label: 'Ciudad', url: 'https://picsum.photos/seed/city-leads/1920/1080' },
  { id: 'abstract', label: 'Abstracto', url: 'https://picsum.photos/seed/abstract-leads/1920/1080' },
];

const STORAGE_KEY = 'leads-platform-bg';

export default function BackgroundPicker() {
  const [selectedId, setSelectedId] = useState('aurora');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) setSelectedId(saved);
  }, []);

  function handleSelect(id) {
    setSelectedId(id);
    window.localStorage.setItem(STORAGE_KEY, id);
    setOpen(false);
  }

  const current = BACKGROUNDS.find((b) => b.id === selectedId) || BACKGROUNDS[0];

  return (
    <>
      {/* Capas de fondo: imagen borrosa + degradado oscuro encima para
          que las tarjetas (con su propio blur/translucidez) se distingan
          con buen contraste. */}
      <div
        className="bg-layer"
        style={{ backgroundImage: current.url ? `url(${current.url})` : 'none' }}
      />
      <div className="bg-overlay" />

      {/* Botón flotante para elegir fondo */}
      <div style={{ position: 'fixed', bottom: '1rem', right: '1rem', zIndex: 40 }}>
        {open && (
          <div
            className="card"
            style={{ marginBottom: '0.5rem', display: 'grid', gap: '0.4rem', width: 180 }}
          >
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: 2 }}>
              Fondo
            </p>
            {BACKGROUNDS.map((bg) => (
              <button
                key={bg.id}
                onClick={() => handleSelect(bg.id)}
                className={bg.id === selectedId ? 'btn btn-primary' : 'btn btn-secondary'}
                style={{ justifyContent: 'flex-start', fontSize: '0.85rem' }}
              >
                {bg.label}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={() => setOpen((v) => !v)}
          className="btn btn-secondary"
          title="Cambiar fondo"
          style={{ borderRadius: '50%', width: 42, height: 42, padding: 0, fontSize: '1.1rem' }}
        >
          🎨
        </button>
      </div>
    </>
  );
}

//
