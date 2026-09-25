'use client';
// Ruta: components/chat/emojiPicker.js
// Selector de emojis liviano (sin librerías), por categorías.

import { useEffect, useRef, useState } from 'react';
import { EMOJI_GROUPS } from '../../lib/chat/format';

export default function EmojiPicker({ onPick, onClose, style }) {
  const [group, setGroup] = useState(0);
  const ref = useRef(null);

  useEffect(() => {
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose?.();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="card"
      style={{ position: 'absolute', width: 320, padding: 8, zIndex: 20, boxShadow: '0 8px 30px rgba(0,0,0,0.18)', ...style }}
    >
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--color-border)', paddingBottom: 6, marginBottom: 6 }}>
        {EMOJI_GROUPS.map((g, i) => (
          <button
            key={g.label}
            type="button"
            title={g.label}
            onClick={() => setGroup(i)}
            style={{
              flex: 1,
              fontSize: '1.1rem',
              padding: 4,
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              background: i === group ? 'var(--color-active-bg)' : 'transparent',
            }}
          >
            {g.icon}
          </button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 2, maxHeight: 220, overflowY: 'auto' }}>
        {EMOJI_GROUPS[group].list.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => onPick(e)}
            style={{ fontSize: '1.35rem', padding: 3, border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: 6 }}
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}