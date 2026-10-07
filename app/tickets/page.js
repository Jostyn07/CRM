'use client';
// Ruta: app/tickets/page.js
// Tickets de errores internos. La IA los detecta en el chat interno (o
// llegan por "Reportar problema"), une los repetidos y crea una tarea para
// el responsable. Aquí se trabajan: estados, aprobación, observaciones,
// responsable, unir duplicados y configuración.

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Modal from '../../components/ui/modal';
import Icon, { IconText } from '../../components/ui/icon';
import { useSession } from '../../lib/auth/sessionContext';
import { useOrgUsers } from '../../lib/tasks/useOrgUsers';
import { trackEvent } from '../../lib/activity/tracker';
import ReportDialog from '../../components/tickets/reportDialog';
import { PhotoViewer } from '../../components/me/profileCard';
import {
  CATEGORIES, OPEN_STATES, PRIORITY, SOURCE, STATUS, commentTicket, deleteTicket, getTicketDetail, getTicketSettings,
  listTickets, manualQueue, manualResolve, mergeTicket, nextActions, saveTicketSettings, scanStats, setStatus, ticketsSummary, timeAgo, updateTicket,
  useTicketsRealtime,
} from '../../lib/tickets/api';

const VIEWS = [
  { key: 'open', label: 'Abiertos', test: (t) => OPEN_STATES.includes(t.status) },
  { key: 'new', label: 'Nuevos', test: (t) => t.status === 'new' },
  { key: 'critical', label: 'Críticos', test: (t) => t.priority === 'critica' && OPEN_STATES.includes(t.status) },
  { key: 'recurring', label: 'Recurrentes', test: (t) => t.occurrence_count >= 2 && !['closed', 'rejected'].includes(t.status) },
  { key: 'progress', label: 'En progreso', test: (t) => ['in_progress', 'approved', 'blocked'].includes(t.status) },
  { key: 'waiting', label: 'Esperando', test: (t) => ['awaiting_approval', 'verification'].includes(t.status) },
  { key: 'resolved', label: 'Resueltos', test: (t) => ['resolved', 'closed'].includes(t.status) },
  { key: 'mine', label: 'Mis tickets', test: (t, me) => t.assigned_to === me && !['closed', 'rejected'].includes(t.status) },
  { key: 'all', label: 'Todos', test: () => true },
];

const EVENT_TEXT = {
  ai_created: 'La IA detectó el problema y creó el ticket',
  created: 'Ticket creado',
  occurrence: 'Nuevo reporte del mismo problema',
  status: 'Cambio de estado',
  updated: 'Datos actualizados',
  reopened: 'Se reabrió',
  merged_into: 'Se unió a otro ticket',
  merged_from: 'Se le unió un ticket duplicado',
};

const Pill = ({ tone, children }) => <span className={`tk-pill tk-${tone}`}>{children}</span>;

export default function TicketsPage() {
  return (
    <Suspense fallback={null}>
      <Tickets />
    </Suspense>
  );
}

function Tickets() {
  const { user } = useSession();
  const me = user?.id;
  const router = useRouter();
  const params = useSearchParams();
  const { users, userMap } = useOrgUsers();
  const [rows, setRows] = useState(null);
  const [sum, setSum] = useState(null);
  const [view, setView] = useState('open');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [selected, setSelected] = useState(params.get('id'));
  const [reporting, setReporting] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [error, setError] = useState(null);
  const [manual, setManual] = useState([]);
  const [scan, setScan] = useState(null);

  const load = useCallback(async () => {
    try {
      const [r, s] = await Promise.all([listTickets(), ticketsSummary()]);
      setRows(r);
      setSum(s);
      manualQueue().then((m) => setManual(m ?? [])).catch(() => {});
      scanStats().then(setScan).catch(() => {});
    } catch (e) {
      setError(e.message);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useTicketsRealtime(load);

  useEffect(() => {
    const id = params.get('id');
    if (id) setSelected(id);
  }, [params]);

  const can = sum?.can ?? {};
  const counts = useMemo(() => Object.fromEntries(VIEWS.map((v) => [v.key, (rows ?? []).filter((t) => v.test(t, me)).length])), [rows, me]);
  const list = useMemo(() => {
    const v = VIEWS.find((x) => x.key === view);
    const nq = q.trim().toLowerCase();
    return (rows ?? []).filter(
      (t) =>
        v.test(t, me) &&
        (!cat || t.category === cat) &&
        (!nq || `#${t.number} ${t.title} ${t.description ?? ''} ${t.ai_summary ?? ''}`.toLowerCase().includes(nq))
    );
  }, [rows, view, q, cat, me]);

  const open = (id) => {
    setSelected(id);
    router.replace(id ? `/tickets?id=${id}` : '/tickets', { scroll: false });
  };

  if (sum && !can.view && !can.create && rows?.length === 0) {
    return (
      <main className="tk-page">
        <div className="card" style={{ maxWidth: 520 }}>
          <h2 style={{ fontSize: '1.05rem' }}>Tickets</h2>
          <p style={{ color: 'var(--color-text-muted)' }}>No tienes acceso a los tickets. Pídeselo a tu administrador.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="tk-page">
      <header className="tk-head">
        <div>
          <h1>Tickets</h1>
          <p>Errores de la plataforma que la IA detecta en el chat interno o que el equipo reporta.</p>
        </div>
        <div className="tk-head-actions">
          {can.manage && (
            <button className="btn btn-secondary" onClick={() => setSettingsOpen(true)}>
              <IconText name="settings" size={16}>Configuración</IconText>
            </button>
          )}
          {can.create && (
            <button className="btn btn-primary" onClick={() => setReporting(true)}>
              <IconText name="bug" size={16}>Reportar problema</IconText>
            </button>
          )}
        </div>
      </header>

      {error && <p className="tk-error">{error}</p>}

      <section className="tk-kpis">
        <Kpi icon="ticket" label="Abiertos" value={sum?.open} onClick={() => setView('open')} />
        <Kpi icon="flame" label="Críticos" value={sum?.critical} tone="danger" onClick={() => setView('critical')} />
        <Kpi icon="play" label="En progreso" value={sum?.in_progress} onClick={() => setView('progress')} />
        <Kpi icon="hourglass" label="Esperando revisión" value={sum?.waiting} tone="warn" onClick={() => setView('waiting')} />
        <Kpi icon="circle-check" label="Resueltos (30 días)" value={sum?.resolved} tone="ok" onClick={() => setView('resolved')} />
      </section>

      {scan && (
        <p className="tk-scan">
          <Icon name="sparkles" size={14} /> La IA revisa el chat interno cuando cada persona deja de escribir 5 minutos.
          <span>
            Analizados hoy <b>{scan.analyzed}</b> · En espera <b>{scan.pending}</b>
            {scan.failed > 0 && (
              <>
                {' '}· <b className="bad">{scan.failed}</b> para revisión manual
              </>
            )}
          </span>
        </p>
      )}

      {can.work && manual.length > 0 && (
        <ManualReview items={manual} tickets={rows ?? []} userMap={userMap} onDone={load} />
      )}

      <div className={`tk-body${selected ? ' has-detail' : ''}`}>
        <section className="tk-listcard card">
          <div className="tk-views" role="tablist">
            {VIEWS.map((v) => (
              <button key={v.key} role="tab" aria-selected={view === v.key} className={view === v.key ? 'on' : ''} onClick={() => setView(v.key)}>
                {v.label}
                <b>{counts[v.key] ?? 0}</b>
              </button>
            ))}
          </div>
          <div className="tk-filters">
            <label className="tk-search">
              <Icon name="search" size={16} />
              <input placeholder="Buscar por número, título o descripción" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            <select className="input" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Categoría">
              <option value="">Todas las categorías</option>
              {Object.entries(CATEGORIES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          {!rows ? (
            <p className="tk-empty">Cargando…</p>
          ) : list.length === 0 ? (
            <div className="tk-empty">
              <Icon name="circle-check" size={28} />
              <p>No hay tickets en esta vista.</p>
            </div>
          ) : (
            <ul className="tk-list">
              {list.map((t) => (
                <li key={t.id}>
                  <button className={`tk-row${selected === t.id ? ' on' : ''}`} onClick={() => open(t.id)}>
                    <span className={`tk-prio-bar tk-${PRIORITY[t.priority]?.tone}`} aria-hidden="true" />
                    <span className="tk-row-main">
                      <span className="tk-row-top">
                        <span className="tk-num">#{String(t.number).padStart(5, '0')}</span>
                        <strong>{t.title}</strong>
                      </span>
                      <span className="tk-row-meta">
                        <Pill tone={STATUS[t.status]?.tone}>{STATUS[t.status]?.label}</Pill>
                        <Pill tone={PRIORITY[t.priority]?.tone}>{PRIORITY[t.priority]?.label}</Pill>
                        <span>{CATEGORIES[t.category]}</span>
                        {t.source === 'chat_ai' && (
                          <span className="tk-ai">
                            <Icon name="sparkles" size={13} /> IA
                          </span>
                        )}
                        <span>· {timeAgo(t.last_reported_at)}</span>
                      </span>
                    </span>
                    <span className="tk-row-side">
                      <span className="tk-occ" title="Incidencias reportadas">
                        {t.occurrence_count}
                        <small>{t.occurrence_count === 1 ? 'reporte' : 'reportes'}</small>
                      </span>
                      <span className="tk-assignee">{userMap[t.assigned_to]?.name ?? 'Sin responsable'}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {selected ? (
          <TicketDetail
            key={selected}
            id={selected}
            can={can}
            users={users}
            userMap={userMap}
            allTickets={rows ?? []}
            onClose={() => open(null)}
            onChanged={load}
          />
        ) : (
          <aside className="tk-side card">
            <h3>
              <Icon name="flame" size={16} /> Problemas recurrentes
            </h3>
            {(sum?.recurring ?? []).length === 0 ? (
              <p className="tk-muted">Ningún problema se ha repetido.</p>
            ) : (
              <ul className="tk-rec">
                {sum.recurring.map((r) => (
                  <li key={r.id}>
                    <button onClick={() => open(r.id)}>
                      <span className="tk-num">#{String(r.number).padStart(5, '0')}</span>
                      <strong>{r.title}</strong>
                      <span className="tk-rec-facts">
                        <span>
                          Incidencias <b>{r.occurrence_count}</b>
                        </span>
                        <span>
                          Personas <b>{r.affected_users}</b>
                        </span>
                        <span>Último {timeAgo(r.last_reported_at)}</span>
                        <Pill tone={PRIORITY[r.priority]?.tone}>{PRIORITY[r.priority]?.label}</Pill>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="tk-howto">
              <h4>Cómo funciona</h4>
              <p>La IA revisa los mensajes del chat interno que parecen errores. Si ya hay un ticket del mismo problema le suma una incidencia; si no, crea uno nuevo y una tarea para el responsable.</p>
              <p>La IA nunca resuelve ni cierra tickets: eso lo hace una persona, después de verificar.</p>
            </div>
          </aside>
        )}
      </div>

      {reporting && <ReportDialog onClose={() => setReporting(false)} onDone={load} />}
      {settingsOpen && <SettingsDialog users={users} onClose={() => setSettingsOpen(false)} />}
    </main>
  );
}

function Kpi({ icon, label, value, tone, onClick }) {
  return (
    <button className={`tk-kpi card${tone ? ` tk-kpi-${tone}` : ''}`} onClick={onClick}>
      <span className="tk-kpi-icon">
        <Icon name={icon} size={18} />
      </span>
      <span>
        <b>{value ?? '–'}</b>
        <small>{label}</small>
      </span>
    </button>
  );
}

function TicketDetail({ id, can, users, userMap, allTickets, onClose, onChanged }) {
  const [d, setD] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(null); // acción que pide comentario
  const [editing, setEditing] = useState(false);
  const [merging, setMerging] = useState(false);
  const [tab, setTab] = useState('activity');
  const [photo, setPhoto] = useState(null);

  const load = useCallback(() => getTicketDetail(id).then(setD).catch((e) => setError(e.message)), [id]);
  useEffect(() => {
    load();
  }, [load]);
  useTicketsRealtime(load);

  const t = d?.ticket;
  const name = (uid) => (uid ? userMap[uid]?.name ?? 'Usuario' : 'IA');

  async function run(fn, done) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      done?.();
      await Promise.all([load(), onChanged()]);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!d) return <aside className="tk-detail card">{error ? <p className="tk-error">{error}</p> : <p className="tk-muted">Cargando…</p>}</aside>;
  if (!t)
    return (
      <aside className="tk-detail card">
        <p className="tk-muted">Este ticket no existe o no tienes acceso.</p>
        <button className="btn btn-secondary" onClick={onClose}>
          Cerrar
        </button>
      </aside>
    );

  const actions = nextActions(t, can);
  const canEdit = can.work && !t.merged_into;

  return (
    <aside className="tk-detail card" aria-label={`Ticket ${t.number}`}>
      <div className="tk-d-head">
        <div>
          <span className="tk-num">#{String(t.number).padStart(5, '0')}</span>
          <h2>{t.title}</h2>
          <div className="tk-row-meta">
            <Pill tone={STATUS[t.status]?.tone}>{STATUS[t.status]?.label}</Pill>
            <Pill tone={PRIORITY[t.priority]?.tone}>Prioridad {PRIORITY[t.priority]?.label?.toLowerCase()}</Pill>
            {t.requires_approval && t.status !== 'awaiting_approval' && t.status !== 'approved' && (
              <Pill tone={t.approved_at ? 'ok' : 'warn'}>{t.approved_at ? 'Aprobado' : 'Necesita aprobación para trabajarse'}</Pill>
            )}
          </div>
        </div>
        <button className="tk-x" onClick={onClose} aria-label="Cerrar detalle">
          <Icon name="x" size={18} />
        </button>
      </div>

      <div className="tk-d-stats">
        <div>
          <b>{t.occurrence_count}</b>
          <small>Incidencias</small>
        </div>
        <div>
          <b>{t.affected_users}</b>
          <small>Personas</small>
        </div>
        <div>
          <b>{t.priority_score}</b>
          <small>Puntaje</small>
        </div>
        <div>
          <b>{timeAgo(t.last_reported_at)}</b>
          <small>Último reporte</small>
        </div>
      </div>

      {t.merged_into && (
        <p className="tk-note">
          Se unió a otro ticket.{' '}
          <a href={`/tickets?id=${t.merged_into}`}>Ver el principal</a>
        </p>
      )}

      {actions.length > 0 && (
        <div className="tk-actions">
          {actions.map((a) => (
            <button
              key={a.to}
              className={`btn ${a.primary ? 'btn-primary' : 'btn-secondary'}`}
              disabled={busy}
              onClick={() => (a.note ? setPending(a) : run(() => setStatus(t.id, a.to)))}
            >
              <IconText name={a.icon} size={15}>
                {a.label}
              </IconText>
            </button>
          ))}
        </div>
      )}
      {pending && (
        <div className="tk-pending">
          <label>
            {pending.label}: observación {pending.to === 'resolved' ? '(qué se hizo)' : '(opcional)'}
            <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
          </label>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={() => setPending(null)}>
              Cancelar
            </button>
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={() =>
                run(
                  () => setStatus(t.id, pending.to, note),
                  () => {
                    setPending(null);
                    setNote('');
                  }
                )
              }
            >
              Confirmar
            </button>
          </div>
        </div>
      )}
      {error && <p className="tk-error">{error}</p>}

      <section className="tk-d-section">
        <h4>Descripción</h4>
        <p className="tk-desc">{t.description || 'Sin descripción.'}</p>
        {t.ai_summary && (
          <div className="tk-aibox">
            <span>
              <Icon name="sparkles" size={14} /> Resumen de la IA
              {t.ai_confidence != null && <em>Confianza {Math.round(t.ai_confidence * 100)}%</em>}
            </span>
            <p>{t.ai_summary}</p>
          </div>
        )}
      </section>

      {d.attachments?.length > 0 && (
        <section className="tk-d-section">
          <h4>Capturas ({d.attachments.length})</h4>
          <div className="tk-shots">
            {d.attachments.map((a) =>
              a.url && /^image\//.test(a.mime || '') ? (
                <button key={a.id} className="tk-shot" onClick={() => setPhoto({ src: a.url, title: `${a.name || 'Captura'} · ${name(a.uploaded_by)}` })}>
                  <img src={a.url} alt={a.name || 'Captura'} loading="lazy" />
                </button>
              ) : (
                <a key={a.id} className="tk-file" href={a.url || '#'} target="_blank" rel="noopener noreferrer">
                  <Icon name="paperclip" size={14} /> {a.name || 'Archivo'}
                </a>
              )
            )}
          </div>
        </section>
      )}

      <section className="tk-d-grid">
        <div>
          <small>Categoría</small>
          {editing ? (
            <select className="input" defaultValue={t.category} onChange={(e) => run(() => updateTicket(t.id, { category: e.target.value }))}>
              {Object.entries(CATEGORIES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          ) : (
            <span>{CATEGORIES[t.category]}</span>
          )}
        </div>
        <div>
          <small>Severidad</small>
          {editing ? (
            <select className="input" defaultValue={t.severity} onChange={(e) => run(() => updateTicket(t.id, { severity: e.target.value }))}>
              {Object.entries(PRIORITY).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          ) : (
            <span>{PRIORITY[t.severity]?.label}</span>
          )}
        </div>
        <div>
          <small>Responsable</small>
          {can.assign && !t.merged_into ? (
            <select className="input" value={t.assigned_to ?? ''} disabled={busy} onChange={(e) => run(() => updateTicket(t.id, { assigned_to: e.target.value || null }))}>
              <option value="">Sin responsable</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          ) : (
            <span>{t.assigned_to ? name(t.assigned_to) : 'Sin responsable'}</span>
          )}
        </div>
        <div>
          <small>Origen</small>
          <span>{SOURCE[t.source]}</span>
        </div>
        <div>
          <small>Reportado por</small>
          <span>{t.created_by ? name(t.created_by) : '—'}</span>
        </div>
        <div>
          <small>Primer reporte</small>
          <span>{new Date(t.first_reported_at).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}</span>
        </div>
      </section>

      {(canEdit || can.delete) && (
        <div className="tk-tools">
          {canEdit && (
            <button className="tk-link" onClick={() => setEditing((x) => !x)}>
              <IconText name="pencil" size={14}>{editing ? 'Listo' : 'Editar categoría y severidad'}</IconText>
            </button>
          )}
          {canEdit && (
            <button className="tk-link" onClick={() => setMerging(true)}>
              <IconText name="git-merge" size={14}>Es duplicado de…</IconText>
            </button>
          )}
          {t.task_id && (
            <a className="tk-link" href={`/tareas?task=${t.task_id}`}>
              <IconText name="square-check-big" size={14}>Ver tarea</IconText>
            </a>
          )}
          {can.delete && (
            <button
              className="tk-link danger"
              onClick={() => {
                if (confirm(`¿Eliminar el ticket #${t.number}? No se puede deshacer.`)) run(() => deleteTicket(t.id), onClose);
              }}
            >
              <IconText name="trash-2" size={14}>Eliminar</IconText>
            </button>
          )}
        </div>
      )}

      <div className="tk-tabs" role="tablist">
        <button className={tab === 'activity' ? 'on' : ''} onClick={() => setTab('activity')}>
          Observaciones y actividad
        </button>
        <button className={tab === 'reports' ? 'on' : ''} onClick={() => setTab('reports')}>
          Reportes ({d.occurrences.length})
        </button>
      </div>

      {tab === 'activity' ? (
        <section className="tk-d-section">
          {can.comment && !t.merged_into && (
            <div className="tk-comment">
              <textarea className="input" rows={2} placeholder="Escribir observación…" value={note} onChange={(e) => setNote(e.target.value)} disabled={!!pending} />
              <button
                className="btn btn-primary"
                disabled={busy || !note.trim() || !!pending}
                onClick={() =>
                  run(
                    () => commentTicket(t.id, note),
                    () => {
                      setNote('');
                      trackEvent('ticket.commented', { entityType: 'tickets', entityId: t.id });
                    }
                  )
                }
              >
                <Icon name="send" size={15} />
              </button>
            </div>
          )}
          <ul className="tk-timeline">
            {[
              ...d.comments.map((c) => ({ k: `c${c.id}`, at: c.created_at, who: name(c.user_id), text: c.body, comment: true })),
              ...d.events
                .filter((e) => e.action !== 'status' || !e.data?.note)
                .map((e) => ({
                  k: `e${e.id}`,
                  at: e.created_at,
                  who: name(e.user_id),
                  ai: !e.user_id,
                  text:
                    e.action === 'status'
                      ? `${STATUS[e.data?.from]?.label ?? e.data?.from} → ${STATUS[e.data?.to]?.label ?? e.data?.to}`
                      : e.action === 'merged_into' || e.action === 'merged_from'
                        ? `${EVENT_TEXT[e.action]} (#${e.data?.number})`
                        : e.action === 'occurrence' && e.data?.text
                          ? `${EVENT_TEXT.occurrence}: “${e.data.text}”`
                          : EVENT_TEXT[e.action] ?? e.action,
                })),
            ]
              .sort((a, b) => new Date(b.at) - new Date(a.at))
              .map((x) => (
                <li key={x.k} className={x.comment ? 'is-comment' : ''}>
                  <span className="tk-tl-dot">{x.ai ? <Icon name="sparkles" size={12} /> : null}</span>
                  <div>
                    <span className="tk-tl-head">
                      <strong>{x.who}</strong> · {new Date(x.at).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                    <p>{x.text}</p>
                  </div>
                </li>
              ))}
          </ul>
        </section>
      ) : (
        <section className="tk-d-section">
          <ul className="tk-occs">
            {d.occurrences.map((o) => (
              <li key={o.id}>
                <span className="tk-tl-head">
                  <strong>{o.reported_by ? name(o.reported_by) : 'Desconocido'}</strong> · {SOURCE[o.source] ?? o.source} ·{' '}
                  {new Date(o.created_at).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
                  {o.similarity != null && o.similarity < 1 && <em> · parecido {Math.round(o.similarity * 100)}%</em>}
                </span>
                <p>{o.description}</p>
                {o.conversation_id && (
                  <a className="tk-link" href={`/comunicacion?c=${o.conversation_id}`}>
                    Ver en el chat
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {photo && <PhotoViewer src={photo.src} title={photo.title} onClose={() => setPhoto(null)} />}
      {merging && (
        <MergeDialog
          ticket={t}
          candidates={allTickets.filter((x) => x.id !== t.id && !x.merged_into && x.status !== 'rejected')}
          onClose={() => setMerging(false)}
          onMerge={(into) => run(() => mergeTicket(t.id, into), () => setMerging(false))}
        />
      )}
    </aside>
  );
}

// Tandas que la IA no pudo analizar: crear ticket, sumarlo a uno existente, reintentar o descartar
function ManualReview({ items, tickets, userMap, onDone }) {
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [into, setInto] = useState({});
  const openTickets = tickets.filter((t) => OPEN_STATES.includes(t.status));
  async function act(id, action) {
    setBusy(id);
    setError(null);
    try {
      await manualResolve(id, action, null, action === 'create' ? into[id] || null : null);
      await onDone();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className="card tk-manual">
      <button className="tk-manual-head" onClick={() => setOpen((x) => !x)}>
        <Icon name="triangle-alert" size={16} />
        <strong>Revisión manual ({items.length})</strong>
        <span>La IA no pudo analizar estas tandas del chat. Lo demás ya quedó revisado.</span>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} />
      </button>
      {open && (
        <ul>
          {items.map((it) => (
            <li key={it.id}>
              <pre>{it.text}</pre>
              <small>
                <b>{userMap[it.reported_by]?.name ?? 'Usuario'}</b> · {timeAgo(it.created_at)}
                {it.attachments > 0 && ` · ${it.attachments} adjunto(s)`}
                {it.error && ` · ${it.error}`}
              </small>
              <div className="tk-manual-actions">
                <select className="input" value={into[it.id] ?? ''} onChange={(e) => setInto((x) => ({ ...x, [it.id]: e.target.value }))}>
                  <option value="">Ticket nuevo</option>
                  {openTickets.map((t) => (
                    <option key={t.id} value={t.id}>
                      Sumar a #{t.number} {t.title.slice(0, 50)}
                    </option>
                  ))}
                </select>
                <button className="btn btn-primary" disabled={busy === it.id} onClick={() => act(it.id, 'create')}>
                  {into[it.id] ? 'Sumar' : 'Crear ticket'}
                </button>
                <button className="btn btn-secondary" disabled={busy === it.id} onClick={() => act(it.id, 'retry')}>
                  <IconText name="refresh-cw" size={14}>Reintentar IA</IconText>
                </button>
                <button className="btn btn-secondary" disabled={busy === it.id} onClick={() => act(it.id, 'dismiss')}>
                  No es un error
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="tk-error">{error}</p>}
    </section>
  );
}

function MergeDialog({ ticket, candidates, onClose, onMerge }) {
  const [q, setQ] = useState('');
  const list = candidates.filter((c) => `#${c.number} ${c.title}`.toLowerCase().includes(q.toLowerCase())).slice(0, 30);
  return (
    <Modal open onClose={onClose} title={`Unir #${ticket.number} a otro ticket`} width={520}>
      <p style={{ fontSize: '0.84rem', color: 'var(--color-text-muted)', marginTop: 0 }}>
        Sus reportes pasan al ticket que elijas y este queda cerrado como duplicado.
      </p>
      <input className="input" placeholder="Buscar ticket" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <ul className="tk-merge-list">
        {list.map((c) => (
          <li key={c.id}>
            <button onClick={() => onMerge(c.id)}>
              <span className="tk-num">#{String(c.number).padStart(5, '0')}</span> {c.title}
              <small>
                {STATUS[c.status]?.label} · {c.occurrence_count} reportes
              </small>
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="tk-muted">Sin resultados.</li>}
      </ul>
    </Modal>
  );
}

function SettingsDialog({ users, onClose }) {
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    getTicketSettings().then(setS).catch((e) => setError(e.message));
  }, []);
  const set = (k, v) => setS((x) => ({ ...x, [k]: v }));
  async function save() {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const r = await saveTicketSettings({
        ai_detect: s.ai_detect,
        default_assignee: s.default_assignee || null,
        create_task: s.create_task,
        approval_on_critical: s.approval_on_critical,
        approval_categories: s.approval_categories ?? [],
        min_confidence: Number(s.min_confidence),
        dup_threshold: Number(s.dup_threshold),
      });
      setS(r);
      setMsg('Guardado.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title="Configuración de tickets" width={560}>
      {!s ? (
        <p className="tk-muted">{error ?? 'Cargando…'}</p>
      ) : (
        <div className="tk-settings">
          <label className="tk-check">
            <input type="checkbox" checked={s.ai_detect} onChange={(e) => set('ai_detect', e.target.checked)} />
            <span>
              <b>Detectar errores en el chat interno con IA</b>
              <small>Un filtro sin costo descarta los mensajes que no hablan de fallas; solo los sospechosos pasan a la IA. Usa el presupuesto de IA de la organización.</small>
            </span>
          </label>
          <label className="tk-label">
            Responsable por defecto de los tickets nuevos
            <select className="input" value={s.default_assignee ?? ''} onChange={(e) => set('default_assignee', e.target.value)}>
              <option value="">Sin responsable</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
          <label className="tk-check">
            <input type="checkbox" checked={s.create_task} onChange={(e) => set('create_task', e.target.checked)} />
            <span>
              <b>Crear una tarea pendiente para el responsable</b>
              <small>Se completa sola cuando el ticket se resuelve y se reabre si el problema vuelve.</small>
            </span>
          </label>
          <h4>Aprobación antes de trabajar</h4>
          <label className="tk-check">
            <input type="checkbox" checked={s.approval_on_critical} onChange={(e) => set('approval_on_critical', e.target.checked)} />
            <span>
              <b>Los tickets críticos requieren aprobación</b>
            </span>
          </label>
          <div className="tk-chips">
            {Object.entries(CATEGORIES).map(([k, v]) => {
              const on = (s.approval_categories ?? []).includes(k);
              return (
                <button
                  key={k}
                  type="button"
                  className={on ? 'on' : ''}
                  onClick={() => set('approval_categories', on ? s.approval_categories.filter((x) => x !== k) : [...(s.approval_categories ?? []), k])}
                >
                  {on && <Icon name="check" size={13} />} {v}
                </button>
              );
            })}
          </div>
          <small className="tk-muted">Las categorías marcadas también pasan por aprobación.</small>
          <h4>Sensibilidad de la IA</h4>
          <label className="tk-label">
            Confianza mínima para crear un ticket: {Math.round(s.min_confidence * 100)}%
            <input type="range" min="0.4" max="0.95" step="0.05" value={s.min_confidence} onChange={(e) => set('min_confidence', e.target.value)} />
          </label>
          <label className="tk-label">
            Parecido mínimo para sumarlo a un ticket existente: {Math.round(s.dup_threshold * 100)}%
            <input type="range" min="0.5" max="0.95" step="0.05" value={s.dup_threshold} onChange={(e) => set('dup_threshold', e.target.value)} />
          </label>
          <small className="tk-muted">Quién puede ver o trabajar los tickets se define en Roles y permisos, o por persona en Usuarios › Permisos individuales.</small>
          {error && <p className="tk-error">{error}</p>}
          {msg && <p style={{ fontSize: '0.84rem' }}>{msg}</p>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={onClose}>
              Cerrar
            </button>
            <button className="btn btn-primary" disabled={busy} onClick={save}>
              {busy ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}