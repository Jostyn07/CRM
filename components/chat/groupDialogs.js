'use client';
// Ruta: components/chat/groupDialogs.js
// Crear grupo e información del grupo (miembros, administradores,
// agregar/quitar, renombrar, salir).

import { useCallback, useEffect, useMemo, useState } from 'react';
import Modal from '../ui/modal';
import { addMembers, createGroup, groupMembers, removeMember, renameGroup, setMemberRole } from '../../lib/chat/api';
import { getAvatarColors, getInitials } from '../leads/avatarColor';

function Avatar({ name, size = 28 }) {
  const c = getAvatarColors(name);
  return (
    <span
      style={{ width: size, height: size, borderRadius: '50%', background: c.bg, color: c.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: size * 0.36, flexShrink: 0 }}
    >
      {getInitials(name)}
    </span>
  );
}

function UserPicker({ users, selected, onToggle, exclude = [] }) {
  const [q, setQ] = useState('');
  const list = useMemo(
    () => users.filter((u) => !exclude.includes(u.id) && `${u.name} ${u.email}`.toLowerCase().includes(q.trim().toLowerCase())),
    [users, exclude, q]
  );
  return (
    <div>
      <input className="input" placeholder="Buscar personas…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 6 }} />
      <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)' }}>
        {list.map((u) => (
          <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.45rem 0.6rem', borderBottom: '1px solid var(--color-border)', cursor: 'pointer', fontSize: '0.86rem' }}>
            <input type="checkbox" checked={selected.includes(u.id)} onChange={() => onToggle(u.id)} />
            <Avatar name={u.name} size={24} />
            {u.name}
          </label>
        ))}
        {!list.length && <p style={{ padding: '0.6rem', fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>Sin resultados.</p>}
      </div>
    </div>
  );
}

export function CreateGroupDialog({ open, onClose, users, me, onCreated }) {
  const [title, setTitle] = useState('');
  const [selected, setSelected] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setTitle('');
      setSelected([]);
      setError(null);
    }
  }, [open]);

  async function submit(e) {
    e.preventDefault();
    if (!title.trim()) return setError('Escribe el nombre del grupo.');
    if (!selected.length) return setError('Agrega al menos una persona.');
    setSaving(true);
    try {
      const id = await createGroup(title.trim(), selected);
      onCreated(id);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Nuevo grupo" width={480}>
      <form onSubmit={submit} style={{ display: 'grid', gap: '0.8rem' }}>
        <label>
          <span style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4 }}>Nombre del grupo *</span>
          <input className="input" autoFocus maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej. Equipo Bogotá" />
        </label>
        <div>
          <span style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4 }}>Miembros ({selected.length})</span>
          <UserPicker users={users} exclude={[me]} selected={selected} onToggle={(id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))} />
        </div>
        {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem' }}>{error}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" disabled={saving}>
            {saving ? 'Creando…' : 'Crear grupo'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function GroupInfoDialog({ open, onClose, conversation, users, userMap, me, onChanged, onLeft }) {
  const [members, setMembers] = useState(null);
  const [adding, setAdding] = useState(false);
  const [toAdd, setToAdd] = useState([]);
  const [title, setTitle] = useState('');
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!conversation) return;
    try {
      setMembers(await groupMembers(conversation.conversation_id));
    } catch (e) {
      setError(e.message);
    }
  }, [conversation]);

  useEffect(() => {
    if (open) {
      setTitle(conversation?.title ?? '');
      setAdding(false);
      setToAdd([]);
      setError(null);
      load();
    }
  }, [open, conversation, load]);

  const iAmAdmin = members?.some((m) => m.user_id === me && m.role === 'admin');
  const run = async (fn) => {
    setError(null);
    try {
      await fn();
      await load();
      onChanged?.();
    } catch (e) {
      setError(e.message);
    }
  };

  if (!conversation) return null;
  const convId = conversation.conversation_id;

  return (
    <Modal open={open} onClose={onClose} title="Información del grupo" width={500}>
      <div style={{ display: 'grid', gap: '1rem' }}>
        {iAmAdmin ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="input" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!title.trim() || title.trim() === conversation.title}
              onClick={() => run(() => renameGroup(convId, title.trim()))}
            >
              Renombrar
            </button>
          </div>
        ) : (
          <h3 style={{ fontSize: '1.05rem' }}>{conversation.title}</h3>
        )}

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <strong style={{ fontSize: '0.9rem' }}>Miembros ({members?.length ?? '…'})</strong>
            {iAmAdmin && !adding && (
              <button type="button" className="btn btn-secondary" onClick={() => setAdding(true)}>
                + Agregar
              </button>
            )}
          </div>

          {adding && (
            <div style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
              <UserPicker
                users={users}
                exclude={(members ?? []).map((m) => m.user_id)}
                selected={toAdd}
                onToggle={(id) => setToAdd((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))}
              />
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setAdding(false)}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!toAdd.length}
                  onClick={() =>
                    run(async () => {
                      await addMembers(convId, toAdd);
                      setAdding(false);
                      setToAdd([]);
                    })
                  }
                >
                  Agregar {toAdd.length || ''}
                </button>
              </div>
            </div>
          )}

          <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', maxHeight: 300, overflowY: 'auto' }}>
            {(members ?? []).map((m) => {
              const name = userMap[m.user_id]?.name ?? 'Usuario';
              return (
                <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.5rem 0.6rem', borderBottom: '1px solid var(--color-border)', fontSize: '0.86rem' }}>
                  <Avatar name={name} />
                  <span style={{ flex: 1 }}>
                    {name}
                    {m.user_id === me && ' (tú)'}
                  </span>
                  {m.role === 'admin' && <span style={{ fontSize: '0.7rem', padding: '1px 6px', borderRadius: 999, background: 'var(--color-active-bg)' }}>Admin</span>}
                  {iAmAdmin && m.user_id !== me && (
                    <>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '2px 8px', fontSize: '0.72rem' }}
                        onClick={() => run(() => setMemberRole(convId, m.user_id, m.role === 'admin' ? 'member' : 'admin'))}
                      >
                        {m.role === 'admin' ? 'Quitar admin' : 'Hacer admin'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '2px 8px', fontSize: '0.72rem', color: 'var(--color-danger)' }}
                        onClick={() => window.confirm(`¿Quitar a ${name} del grupo?`) && run(() => removeMember(convId, m.user_id))}
                      >
                        Quitar
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem' }}>{error}</p>}

        <button
          type="button"
          className="btn btn-secondary"
          style={{ color: 'var(--color-danger)', justifySelf: 'start' }}
          onClick={async () => {
            if (!window.confirm('¿Salir del grupo? Dejarás de ver sus mensajes.')) return;
            try {
              await removeMember(convId, me);
              onLeft?.();
            } catch (e) {
              setError(e.message);
            }
          }}
        >
          Salir del grupo
        </button>
      </div>
    </Modal>
  );
}