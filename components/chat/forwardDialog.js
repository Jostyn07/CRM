'use client';
// Ruta: components/chat/forwardDialog.js
// Reenviar un mensaje (archivo, video, imagen, audio o texto) a uno o
// varios chats: conversaciones recientes, grupos, mis Notas o cualquier
// persona de la organización (se puede buscar por nombre o correo).

import { useMemo, useState } from 'react';
import Modal from '../ui/modal';
import Icon from '../ui/icon';
import Avatar from '../ui/avatar';
import { forwardMessage } from '../../lib/chat/api';

const KIND_LABEL = { image: 'Imagen', video: 'Video', audio: 'Audio', file: 'Archivo', text: 'Mensaje' };

const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

export default function ForwardDialog({ message, onClose, conversations, users, userMap, me, orgId, onDone }) {
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState({}); // key → {conversationId?, userId?, label}
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // Chats existentes (grupos, Notas y 1 a 1) y luego personas sin chat aún
  const options = useMemo(() => {
    const convs = (conversations ?? []).map((c) => {
      const label = c.kind === 'notes' ? 'Notas (solo tú)' : c.kind === 'group' ? c.title : userMap[c.other_user_id]?.name ?? 'Usuario';
      const sub = c.kind === 'group' ? `${c.member_count} miembros` : c.kind === 'notes' ? 'Privado' : userMap[c.other_user_id]?.email ?? '';
      return {
        key: `c:${c.conversation_id}`,
        target: { conversationId: c.conversation_id },
        label,
        sub,
        icon: c.kind === 'notes' ? 'notebook-pen' : c.kind === 'group' ? (c.system_key === 'org' ? 'building-2' : c.system_key ? 'map-pin' : 'users') : null,
        directWith: c.kind === 'direct' ? c.other_user_id : null,
      };
    });
    const withChat = new Set(convs.map((o) => o.directWith).filter(Boolean));
    const people = (users ?? [])
      .filter((u) => u.id !== me && !withChat.has(u.id))
      .map((u) => ({ key: `u:${u.id}`, target: { userId: u.id }, label: u.name, sub: u.email, icon: null }));
    return { convs, people };
  }, [conversations, users, userMap, me]);

  const nq = norm(q.trim());
  const match = (o) => !nq || norm(`${o.label} ${o.sub}`).includes(nq);
  const convs = options.convs.filter(match);
  const people = options.people.filter(match);
  const count = Object.keys(picked).length;

  function toggle(o) {
    setPicked((p) => {
      const n = { ...p };
      if (n[o.key]) delete n[o.key];
      else n[o.key] = o;
      return n;
    });
  }

  async function send() {
    setBusy(true);
    setError(null);
    const fails = [];
    for (const o of Object.values(picked)) {
      try {
        await forwardMessage(message, o.target, orgId);
      } catch (e) {
        fails.push(`${o.label}: ${e.message}`);
      }
    }
    setBusy(false);
    if (fails.length) return setError(fails.join(' · '));
    onDone?.(count);
  }

  const Row = (o) => (
    <label key={o.key} className="fwd-row">
      <input type="checkbox" checked={!!picked[o.key]} onChange={() => toggle(o)} />
      {o.icon ? (
        <span className="avatar" style={{ width: 34, height: 34, background: 'var(--color-active-bg)', color: 'var(--color-primary)' }}>
          <Icon name={o.icon} size={17} />
        </span>
      ) : (
        <Avatar name={o.label} size={34} />
      )}
      <span style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: '0.88rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.label}</div>
        {o.sub && <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.sub}</div>}
      </span>
    </label>
  );

  return (
    <Modal open={!!message} onClose={busy ? () => {} : onClose} title="Reenviar" width={520}>
      {message && (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.84rem', color: 'var(--color-text-muted)', padding: '0.55rem 0.7rem', borderRadius: 10, background: 'var(--color-active-bg)' }}>
            <Icon name="forward" size={15} />
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {KIND_LABEL[message.kind] ?? 'Mensaje'}
              {message.attachment_name ? `: ${message.attachment_name}` : message.body ? `: ${message.body}` : ''}
            </span>
          </div>
          <div className="field-wrap">
            <Icon name="search" size={16} />
            <input className="input" autoFocus placeholder="Buscar persona, grupo o chat…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div style={{ maxHeight: 360, overflowY: 'auto', display: 'grid', gap: 2 }}>
            {convs.length > 0 && <div className="fwd-label">Chats</div>}
            {convs.map(Row)}
            {people.length > 0 && <div className="fwd-label">Personas</div>}
            {people.map(Row)}
            {!convs.length && !people.length && <p style={{ fontSize: '0.84rem', color: 'var(--color-text-muted)', padding: 8 }}>Sin resultados.</p>}
          </div>
          {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.82rem', margin: 0 }}>{error}</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn btn-secondary" onClick={onClose} disabled={busy}>
              Cancelar
            </button>
            <button className="btn btn-primary" onClick={send} disabled={busy || !count}>
              <Icon name="send" size={15} />
              {busy ? 'Reenviando…' : `Reenviar${count ? ` (${count})` : ''}`}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}