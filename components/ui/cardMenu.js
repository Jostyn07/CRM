'use client';

import { useState, useRef, useEffect } from 'react';

export default function CardMenu({ items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--color-text-muted)',
          fontSize: '1.15rem',
          padding: '2px 8px',
          lineHeight: 1,
        }}
        aria-label="Más opciones"
      >
        ⋮
      </button>
      {open && (
        <div
          className="card"
          style={{
            position: 'absolute',
            right: 0,
            top: '100%',
            marginTop: 4,
            minWidth: 190,
            padding: '0.4rem',
            zIndex: 20,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {items.map((item, i) => (
            <button
              key={i}
              onClick={() => {
                item.onClick();
                setOpen(false);
              }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                background: 'none',
                border: 'none',
                padding: '0.5rem 0.6rem',
                borderRadius: 6,
                fontSize: '0.85rem',
                color: item.danger ? 'var(--color-danger)' : 'var(--color-text)',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-btn-secondary-bg-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}