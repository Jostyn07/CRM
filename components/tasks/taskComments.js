'use client';
// Ruta: components/tasks/taskComments.js
// Respuestas dentro de una tarea: el responsable deja su respuesta y
// quien la creó (o su supervisor) la ve y contesta. En vivo.

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase/client';
import { useSession } from '../../lib/auth/sessionContext';
import { trackEvent } from '../../lib/activity/tracker';
import { fullDate, relTime } from '../../lib/leads/format';
import { NOTE_EDIT_MINUTES, addTaskComment, canEditComment, editTaskComment, getTaskComments } from '../../lib/tasks/api';

export default function TaskComments({ task, userMap }) {
  const { user } = useSession();
  const [items, setItems] = useState(null);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [editId, setEditId] = useState(null);
  const [editText, setEditText] = useState('');
  const endRef = useRef(null);

  const load = useCallback(async () => {
    try {
      setItems(await getTaskComments(task.id));
    } catch (e) {
      setError(e.message);
    }
  }, [task.id]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`task-comments-${task.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_comments', filter: `task_id=eq.${task.id}` }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [task.id, load]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [items?.length]);

  async function send(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const c = await addTaskComment(task.id, text.trim());
      setItems((prev) => [...(prev ?? []).filter((x) => x.id !== c.id), c]);
      setText('');
      trackEvent('task.commented', { entityType: 'tasks', entityId: task.id });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(id) {
    if (!editText.trim()) return;
    try {
      const c = await editTaskComment(id, editText.trim());
      setItems((prev) => prev.map((x) => (x.id === id ? c : x)));
      setEditId(null);
    } catch (err) {
      setError(err.message);
    }
  }

  const isAssignee = task.assigned_to === user?.id;

  return (
    <div>
      <h4 style={{ fontSize: '0.9rem', marginBottom: 6 }}>Respuestas {items?.length ? `(${items.length})` : ''}</h4>

      <div style={{ maxHeight: 260, overflowY: 'auto', display: 'grid', gap: 8, marginBottom: 8 }}>
        {!items ? (
          <p style={{ fontSize: '0.85rem' }}>Cargando…</p>
        ) : !items.length ? (
          <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
            {isAssignee ? 'Deja aquí tu respuesta o avance para quien te asignó la tarea.' : 'Todavía no hay respuestas.'}
          </p>
        ) : (
          items.map((c) => {
            const mine = c.user_id === user?.id;
            const fromAssignee = c.user_id === task.assigned_to;
            return (
              <div
                key={c.id}
                style={{
                  justifySelf: mine ? 'end' : 'start',
                  maxWidth: '85%',
                  padding: '0.5rem 0.7rem',
                  borderRadius: 10,
                  background: mine ? 'var(--color-active-bg)' : 'var(--color-border)',
                  fontSize: '0.86rem',
                }}
              >
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: 2 }}>
                  <strong style={{ color: 'var(--color-text)' }}>{userMap[c.user_id]?.name ?? 'Usuario'}</strong>
                  {fromAssignee && ' · responsable'} · <span title={fullDate(c.created_at)}>{relTime(c.created_at)}</span>
                  {c.edited_at && ' · editada'}
                </div>
                {editId === c.id ? (
                  <div style={{ display: 'grid', gap: 6 }}>
                    <textarea className="input" rows={2} value={editText} onChange={(e) => setEditText(e.target.value)} />
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button type="button" className="btn btn-secondary" onClick={() => setEditId(null)}>
                        Cancelar
                      </button>
                      <button type="button" className="btn btn-primary" onClick={() => saveEdit(c.id)}>
                        Guardar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {c.body}
                    {canEditComment(c, user?.id) && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditId(c.id);
                          setEditText(c.body);
                        }}
                        style={{ marginLeft: 8, background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', fontSize: '0.75rem' }}
                      >
                        Editar
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={send} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea
          className="input"
          rows={2}
          placeholder={isAssignee ? 'Escribe tu respuesta…' : 'Escribe un comentario…'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(e);
          }}
          style={{ flex: 1, resize: 'vertical', minHeight: 44 }}
        />
        <button className="btn btn-primary" disabled={saving || !text.trim()}>
          {saving ? '…' : 'Enviar'}
        </button>
      </form>
      <p style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
        Puedes editar tu respuesta durante {NOTE_EDIT_MINUTES} minutos. Ctrl + Enter para enviar.
      </p>
      {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.82rem' }}>{error}</p>}
    </div>
  );
}