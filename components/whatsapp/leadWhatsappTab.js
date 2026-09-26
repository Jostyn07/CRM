'use client';
// Ruta: components/whatsapp/leadWhatsappTab.js
// Pestaña "WhatsApp" de la ficha del lead: su conversación (una por
// número de la empresa) y la opción de escribirle por primera vez.

import { useCallback, useEffect, useState } from 'react';
import WaThread from './waThread';
import WazzupFrame from './wazzupFrame';
import WaModeToggle from './waModeToggle';
import { useSession } from '../../lib/auth/sessionContext';
import { formatChat, getLeadConversations, listChannels, startConversation, useWaMode } from '../../lib/whatsapp/api';

export default function LeadWhatsappTab({ lead, userMap, deleted }) {
  const { profile, can } = useSession();
  const [convs, setConvs] = useState(null);
  const [channels, setChannels] = useState([]);
  const [active, setActive] = useState(null);
  const [channel, setChannel] = useState('');
  const [error, setError] = useState(null);
  const [starting, setStarting] = useState(false);
  const [mode, setMode] = useWaMode();

  const load = useCallback(async () => {
    try {
      const [c, ch] = await Promise.all([getLeadConversations(lead.id), listChannels()]);
      setConvs(c);
      const usable = ch.filter((x) => x.is_active);
      setChannels(usable);
      setActive((prev) => prev ?? c[0]?.id ?? null);
      setChannel((prev) => prev || usable.find((x) => x.branch_id === lead.branch_id)?.id || usable[0]?.id || '');
    } catch (e) {
      setError(e.message);
    }
  }, [lead.id, lead.branch_id]);

  useEffect(() => {
    load();
  }, [load]);

  async function start() {
    setStarting(true);
    setError(null);
    try {
      const id = await startConversation(lead.id, channel);
      await load();
      setActive(id);
    } catch (e) {
      setError(e.message);
    } finally {
      setStarting(false);
    }
  }

  if (!can('whatsapp.view')) return <p style={{ color: 'var(--color-text-muted)' }}>No tienes permiso para ver WhatsApp.</p>;
  if (!convs) return <p>Cargando…</p>;

  const chName = (id) => channels.find((c) => c.id === id)?.name ?? 'WhatsApp';
  const canStart = !deleted && can('whatsapp.send') && lead.phone_normalized && channels.length > 0;
  const usedChannels = new Set(convs.map((c) => c.channel_id));

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '0.6rem 0.9rem', borderBottom: '1px solid var(--color-border)', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: '0.92rem' }}>WhatsApp {lead.phone_normalized ? `· ${formatChat(lead.phone_normalized)}` : ''}</strong>
        <span style={{ flex: 1 }} />
        {active && <WaModeToggle mode={mode} onChange={setMode} compact />}
        {convs.length > 1 &&
          convs.map((c) => (
            <button key={c.id} className={`btn ${c.id === active ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '3px 10px', fontSize: '0.78rem' }} onClick={() => {
                setActive(c.id);
              }}>
              {chName(c.channel_id)}
            </button>
          ))}
        {canStart && channels.some((c) => !usedChannels.has(c.id)) && (
          <>
            <select className="input" style={{ width: 200, height: 32 }} value={channel} onChange={(e) => setChannel(e.target.value)}>
              {channels
                .filter((c) => !usedChannels.has(c.id))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    Desde {c.name}
                  </option>
                ))}
            </select>
            <button className="btn btn-secondary" disabled={starting || !channel || usedChannels.has(channel)} onClick={start}>
              {starting ? '…' : 'Escribir por WhatsApp'}
            </button>
          </>
        )}
      </div>
      {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.82rem', padding: '0.5rem 0.9rem' }}>{error}</p>}
      {active ? (
        <div style={{ height: '60vh', position: 'relative' }}>
          {mode === 'wazzup' ? (
            <WazzupFrame conversationId={active} />
          ) : (
            <WaThread conversationId={active} orgId={profile.organization_id} userMap={userMap} canSend={can('whatsapp.send') && !deleted} />
          )}
        </div>
      ) : (
        <p style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.88rem' }}>
          {!lead.phone_normalized
            ? 'El lead no tiene teléfono.'
            : channels.length
              ? 'Aún no hay conversación de WhatsApp con este lead. Usa "Escribir por WhatsApp".'
              : 'No tienes números de WhatsApp asignados.'}
        </p>
      )}
    </div>
  );
}