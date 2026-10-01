'use client';
// Ruta: components/ui/soundToggle.js
// Botón para activar o silenciar los sonidos de mensajes (por navegador).

import { useEffect, useState } from 'react';
import { IconText } from './icon';
import { isSoundOn, playReceived, setSoundOn } from '../../lib/sounds';

export default function SoundToggle() {
  const [on, setOn] = useState(true);

  useEffect(() => {
    setOn(isSoundOn());
    const sync = (e) => setOn(Boolean(e.detail));
    window.addEventListener('sounds:change', sync);
    return () => window.removeEventListener('sounds:change', sync);
  }, []);

  return (
    <button
      className="btn btn-secondary"
      title={on ? 'Silenciar sonidos de mensajes' : 'Activar sonidos de mensajes'}
      onClick={() => {
        setSoundOn(!on);
        if (!on) setTimeout(playReceived, 50);
      }}
    >
      <IconText name={on ? 'volume-2' : 'volume-x'} size={16}>
        {on ? 'Sonido' : 'Silenciado'}
      </IconText>
    </button>
  );
}