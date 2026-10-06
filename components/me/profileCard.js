'use client';
// Ruta: components/me/profileCard.js
// Perfil de un compañero (lo que cada uno configura en Mi espacio):
// foto, portada, cargo, descripción, disponibilidad y datos de contacto.
// Las fotos se pueden ver en grande (PhotoViewer).

import { useEffect, useState } from 'react';
import Modal from '../ui/modal';
import Icon from '../ui/icon';
import { supabase } from '../../lib/supabase/client';
import { STATUSES } from '../../lib/me/workspace';

const initials = (n) =>
  String(n || '')
    .replace(/[^\p{L}\s]/gu, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || '?';

// Foto en grande (clic fuera o Esc para cerrar)
export function PhotoViewer({ src, title, onClose }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  if (!src) return null;
  return (
    <div className="photo-viewer" role="dialog" aria-modal="true" aria-label={title || 'Foto'} onClick={onClose}>
      <div className="photo-viewer-top" onClick={(e) => e.stopPropagation()}>
        <strong>{title}</strong>
        <span style={{ display: 'flex', gap: 6 }}>
          <a className="img-viewer-btn" href={src} target="_blank" rel="noopener noreferrer" title="Abrir en otra pestaña">
            <Icon name="external-link" size={18} />
          </a>
          <button type="button" className="img-viewer-btn" onClick={onClose} title="Cerrar (Esc)">
            <Icon name="x" size={20} />
          </button>
        </span>
      </div>
      <img src={src} alt={title || ''} onClick={(e) => e.stopPropagation()} />
    </div>
  );
}

export default function ProfileCard({ userId, fallbackName, onClose, onMessage }) {
  const [data, setData] = useState(null);
  const [photo, setPhoto] = useState(null);

  useEffect(() => {
    if (!userId) return;
    setData(null);
    let vivo = true;
    Promise.all([
      supabase.from('profiles').select('id, full_name, email, phone, status').eq('id', userId).maybeSingle(),
      supabase.from('user_preferences').select('*').eq('user_id', userId).maybeSingle(),
    ]).then(([p, u]) => vivo && setData({ profile: p.data ?? {}, prefs: u.data ?? {} }));
    return () => {
      vivo = false;
    };
  }, [userId]);

  const name = data?.prefs?.display_name || data?.profile?.full_name || fallbackName || 'Usuario';
  const avatar = data?.prefs?.prefs?.avatar_url;
  const cover = data?.prefs?.prefs?.cover_url;
  const st = data?.prefs?.availability ? STATUSES[data.prefs.availability] : null;

  return (
    <>
      <Modal open={!!userId} onClose={onClose} title="Perfil" width={440}>
        {!data ? (
          <p style={{ color: 'var(--color-text-muted)' }}>Cargando…</p>
        ) : (
          <div className="pc">
            <button
              type="button"
              className="pc-cover"
              style={cover ? { backgroundImage: `url("${cover}")` } : undefined}
              onClick={() => cover && setPhoto({ src: cover, title: `Portada de ${name}` })}
              aria-label={cover ? 'Ver portada en grande' : 'Sin portada'}
              disabled={!cover}
            />
            <div className="pc-body">
              <button
                type="button"
                className="pc-avatar"
                onClick={() => avatar && setPhoto({ src: avatar, title: name })}
                aria-label={avatar ? 'Ver foto en grande' : 'Sin foto'}
                disabled={!avatar}
              >
                {avatar ? <img src={avatar} alt="" /> : initials(name)}
                {st && <i style={{ background: st.color }} title={st.label} />}
              </button>
              <h2>{name}</h2>
              {data.prefs.display_name && data.profile.full_name && data.prefs.display_name !== data.profile.full_name && (
                <p className="pc-muted">{data.profile.full_name}</p>
              )}
              {data.prefs.job_title && <p className="pc-title">{data.prefs.job_title}</p>}
              {st && (
                <span className="me-status">
                  <i style={{ background: st.color }} /> {st.label}
                </span>
              )}
              {data.prefs.bio && <p className="pc-bio">{data.prefs.bio}</p>}
              <div className="pc-facts">
                {data.profile.email && (
                  <a href={`mailto:${data.profile.email}`}>
                    <Icon name="mail" size={15} /> {data.profile.email}
                  </a>
                )}
                {data.profile.phone && (
                  <span>
                    <Icon name="phone" size={15} /> {data.profile.phone}
                  </span>
                )}
                {data.prefs.extension && (
                  <span>
                    <Icon name="hash" size={15} /> Extensión {data.prefs.extension}
                  </span>
                )}
              </div>
              {onMessage && (
                <button type="button" className="btn btn-primary" style={{ marginTop: 14 }} onClick={() => onMessage(userId)}>
                  <Icon name="message-square" size={15} /> Enviar mensaje
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>
      {photo && <PhotoViewer src={photo.src} title={photo.title} onClose={() => setPhoto(null)} />}
    </>
  );
}