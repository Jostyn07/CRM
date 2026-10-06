'use client';
// Ruta: components/ui/soundToggle.js
// Botón para activar o silenciar los sonidos de mensajes (por navegador).
// channel: 'chat' (Comunicación) o 'wa' (WhatsApp); cada uno es independiente.

import { useEffect, useState } from 'react';
import { IconText } from './icon';
import { isSoundOn, playReceived, setSoundOn } from '../../lib/sounds';

export default function SoundToggle({ channel = 'chat' }) {
  const [on, setOn] = useState(true);

  useEffect(() => {
    setOn(isSoundOn(channel));
    const sync = (e) => {
      if (e.detail?.ch === channel) setOn(Boolean(e.detail.on));
    };
    window.addEventListener('sounds:change', sync);
    return () => window.removeEventListener('sounds:change', sync);
  }, [channel]);

  return (
    <button
      className="btn btn-secondary"
      title={on ? 'Silenciar sonidos de mensajes' : 'Activar sonidos de mensajes'}
      onClick={() => {
        setSoundOn(!on, channel);
        if (!on) setTimeout(() => playReceived(channel), 50);
      }}
    >
      <IconText name={on ? 'volume-2' : 'volume-x'} size={16}>
        {on ? 'Sonido' : 'Silenciado'}
      </IconText>
    </button>
  );
}