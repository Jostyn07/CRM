'use client';
// Ruta: components/settings/orgLogoCard.js
// Logo de la organización (se ve arriba del menú lateral). Solo el
// administrador de organización lo cambia. PNG, JPG, WEBP o SVG, máx. 2 MB.

import { useState } from 'react';
import { supabase } from '../../lib/supabase/client';
import { useSession } from '../../lib/auth/sessionContext';
import { trackEvent } from '../../lib/activity/tracker';
import Icon from '../ui/icon';
import { initials } from '../ui/avatar';

const TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

export default function OrgLogoCard() {
  const { organization, can, isPlatformOwner, refresh } = useSession();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);
  const canEdit = can('org.logo') || can('settings.manage', 'organization') || isPlatformOwner;
  if (!organization || !canEdit) return null;

  async function upload(file) {
    setMsg(null);
    setError(null);
    if (!TYPES.includes(file.type)) return setError('Usa una imagen PNG, JPG, WEBP o SVG.');
    if (file.size > 2 * 1024 * 1024) return setError('La imagen debe pesar menos de 2 MB.');
    setBusy(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
      const path = `${organization.id}/logo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('org-logos').upload(path, file, { upsert: true, contentType: file.type, cacheControl: '3600' });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from('org-logos').getPublicUrl(path);
      const { error: rpcErr } = await supabase.rpc('set_org_logo', { p_url: data.publicUrl });
      if (rpcErr) throw rpcErr;
      trackEvent('organization.logo_updated');
      await refresh();
      setMsg('Logo actualizado.');
    } catch (e) {
      setError(e.message || 'No se pudo subir el logo.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    const { error: rpcErr } = await supabase.rpc('set_org_logo', { p_url: null });
    setBusy(false);
    if (rpcErr) return setError(rpcErr.message);
    await refresh();
    setMsg('Logo quitado.');
  }

  return (
    <div className="card">
      <h3 style={{ fontSize: '0.95rem', marginBottom: '0.7rem' }}>Logo de la organización</h3>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span className="sb-logo-ring" style={{ width: 88, height: 88, flexShrink: 0 }}>
          {organization.logo_url ? <img src={organization.logo_url} alt="Logo actual" /> : <span className="sb-logo-initials" style={{ fontSize: '1.6rem' }}>{initials(organization.name)}</span>}
        </span>
        <div style={{ display: 'grid', gap: 8 }}>
          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: 0 }}>Se muestra arriba del menú lateral para todos los usuarios. Imagen cuadrada, PNG, JPG, WEBP o SVG, máximo 2 MB.</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <label className="btn btn-primary" style={{ cursor: busy ? 'wait' : 'pointer' }}>
              <Icon name="upload" size={15} />
              {busy ? 'Subiendo…' : organization.logo_url ? 'Cambiar logo' : 'Subir logo'}
              <input type="file" accept={TYPES.join(',')} hidden disabled={busy} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            </label>
            {organization.logo_url && (
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={remove}>
                <Icon name="trash-2" size={15} />
                Quitar
              </button>
            )}
          </div>
        </div>
      </div>
      {msg && <p style={{ fontSize: '0.84rem', marginTop: 10 }}>{msg}</p>}
      {error && <p style={{ fontSize: '0.84rem', marginTop: 10, color: 'var(--color-danger)' }}>{error}</p>}
    </div>
  );
}