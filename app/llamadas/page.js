'use client';
// Ruta: app/llamadas/page.js
// Llamadas: aviso de grabación, indicadores, filtros, historial y panel de
// detalle (grabación, resultado y notas de seguimiento).
// Cada usuario ve según calls.view: las propias, su sucursal o toda la organización.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon, { IconText } from '../../components/ui/icon';
import RequirePermission from '../../components/ui/requirePermission';
import { Transcript } from '../../components/calls/callsTable';
import { useSession } from '../../lib/auth/sessionContext';
import { useCalls } from '../../lib/calls/callContext';
import { useLeadConfig } from '../../lib/leads/useLeadConfig';
import { trackEvent } from '../../lib/activity/tracker';
import {
  RESULTS, TECHNICAL_STATUS, countRecordings, fmtDuration, fmtMinutes, getCallStats, getMinutesSummary, getRecordingUrl, listCalls, setCallResult,
} from '../../lib/calls/api';

const PAGE_SIZE = 25;

export default function CallsPage() {
  return (
    <RequirePermission any={['calls.view', 'calls.make']}>
      <Calls />
    </RequirePermission>
  );
}

const recStatus = (r) => (Array.isArray(r.recording) ? r.recording[0] : r.recording)?.status ?? null;
const contactName = (r) => (r.lead_id ? [r.lead?.first_name, r.lead?.last_name].filter(Boolean).join(' ') || 'Lead' : 'Contacto externo');
const contactNumber = (r) => (r.direction === 'inbound' ? r.from_e164 : r.to_e164) || '—';
const fecha = (iso) => new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
const hora = (iso) => new Date(iso).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
const fechaCorta = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
const mmss = (s) => {
  const v = Math.max(0, Math.round(s || 0));
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
};

function ResultBadge({ value }) {
  if (!value) return <span className="calls-muted">—</span>;
  return <span className={`calls-result r-${value}`}>{RESULTS[value] ?? value}</span>;
}

function Calls() {
  const { user, can, scopeOf, activeBranchId } = useSession();
  const { openDialer, phase } = useCalls();
  const config = useLeadConfig();
  const [filters, setFilters] = useState({});
  const [more, setMore] = useState(false);
  const [info, setInfo] = useState(false);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState(null);
  const [recordings, setRecordings] = useState(null);
  const [minutes, setMinutes] = useState(null);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  const effective = useMemo(() => ({ ...filters, branchId: filters.branchId || activeBranchId || undefined }), [filters, activeBranchId]);
  const seesOthers = ['branch', 'organization'].includes(scopeOf('calls.view'));
  const canEditOthers = seesOthers;

  const load = useCallback(async () => {
    try {
      const [res, st, mi, rc] = await Promise.all([
        listCalls({ page, pageSize: PAGE_SIZE, filters: effective }),
        getCallStats(effective),
        getMinutesSummary(),
        countRecordings(effective),
      ]);
      setRows(res.rows);
      setTotal(res.total);
      setStats(st);
      setMinutes(mi);
      setRecordings(rc);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, [page, effective]);

  useEffect(() => {
    if (can('calls.view')) load();
    else getMinutesSummary().then(setMinutes);
  }, [load, can]);

  useEffect(() => {
    if (phase === 'idle' && can('calls.view')) load();
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const setF = (k, v) => {
    setPage(1);
    setFilters((f) => ({ ...f, [k]: v || undefined }));
  };
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const available = minutes ? minutes.my_assigned_seconds - minutes.my_used_seconds : 0;
  const selected = rows.find((r) => r.id === selectedId) ?? null;

  // Filtros activos (chips)
  const chips = [];
  if (filters.number) chips.push(['number', `Búsqueda: ${filters.number}`]);
  if (filters.from || filters.to)
    chips.push(['dates', `Fecha: ${filters.from ? fechaCorta(filters.from) : '…'} – ${filters.to ? fechaCorta(filters.to) : '…'}`]);
  if (filters.result) chips.push(['result', `Resultado: ${filters.result === '__none' ? 'Sin resultado' : RESULTS[filters.result]}`]);
  if (filters.type) chips.push(['type', filters.type === 'lead' ? 'Solo leads' : 'Solo externas']);
  if (filters.userId) chips.push(['userId', `Colaborador: ${config.maps.user[filters.userId]?.name ?? ''}`]);
  if (filters.status) chips.push(['status', `Estado: ${TECHNICAL_STATUS[filters.status]}`]);
  const removeChip = (k) => {
    setPage(1);
    setFilters((f) => {
      const n = { ...f };
      if (k === 'dates') {
        delete n.from;
        delete n.to;
      } else delete n[k];
      return n;
    });
  };

  const cards = [
    { icon: 'phone', value: stats ? stats.total.toLocaleString('es-CO') : '—', label: 'Llamadas totales' },
    { icon: 'clock', value: stats ? fmtMinutes(stats.duration_seconds) : '—', label: 'Minutos utilizados' },
    { icon: 'mic', value: recordings ?? '—', label: 'Grabaciones' },
    { icon: 'timer', value: stats ? mmss(stats.total ? stats.duration_seconds / stats.total : 0) : '—', label: 'Duración promedio' },
  ];

  return (
    <main className="calls-page">
      <div className="calls-head">
        <div>
          <h1>Llamadas</h1>
          <p>
            Gestiona y consulta el historial de tus llamadas
            {minutes ? ` · Tus minutos: ${fmtMinutes(available)} disponibles de ${fmtMinutes(minutes.my_assigned_seconds)}` : ''}
          </p>
        </div>
        {can('calls.make') && (
          <button className="btn btn-primary" onClick={() => openDialer()}>
            <IconText name="phone" size={16}>Nueva llamada</IconText>
          </button>
        )}
      </div>

      <div className="calls-notice">
        <button type="button" className="calls-notice-row" onClick={() => setInfo((v) => !v)} aria-expanded={info}>
          <span>
            <Icon name="info" size={17} /> Las llamadas se graban. Informa al contacto antes de continuar.
          </span>
          <span className="calls-link">
            Más información <Icon name={info ? 'chevron-up' : 'chevron-down'} size={15} />
          </span>
        </button>
        {info && (
          <p className="calls-notice-more">
            Todas las llamadas realizadas desde la plataforma quedan grabadas y se guardan de forma privada. Solo quienes tienen permiso de
            grabaciones pueden escucharlas. Es responsabilidad de quien llama informar a la persona contactada que la llamada está siendo grabada.
          </p>
        )}
      </div>

      {!can('calls.view') ? (
        <p className="calls-muted">Puedes hacer llamadas, pero no tienes permiso para ver el historial.</p>
      ) : (
        <>
          <div className="calls-kpis">
            {cards.map((c) => (
              <div key={c.label} className="card calls-kpi">
                <span className="calls-kpi-icon">
                  <Icon name={c.icon} size={19} />
                </span>
                <div>
                  <strong>{c.value}</strong>
                  <span>{c.label}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="card calls-filters">
            <div className="calls-filter-grid">
              <label className="calls-field grow">
                <span>Contacto</span>
                <span className="calls-input">
                  <Icon name="search" size={16} />
                  <input placeholder="Buscar teléfono" value={filters.number ?? ''} onChange={(e) => setF('number', e.target.value)} />
                </span>
              </label>
              <div className="calls-field">
                <span>Rango de fechas</span>
                <span className="calls-input dates">
                  <input type="date" value={filters.from ?? ''} onChange={(e) => setF('from', e.target.value)} aria-label="Desde" />
                  <span className="calls-muted">–</span>
                  <input type="date" value={filters.to ?? ''} onChange={(e) => setF('to', e.target.value)} aria-label="Hasta" />
                </span>
              </div>
              <label className="calls-field">
                <span>Resultado</span>
                <select className="input" value={filters.result ?? ''} onChange={(e) => setF('result', e.target.value)}>
                  <option value="">Todos los resultados</option>
                  <option value="__none">Sin resultado</option>
                  {Object.entries(RESULTS).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label className="calls-field">
                <span>Tipo de llamada</span>
                <select className="input" value={filters.type ?? ''} onChange={(e) => setF('type', e.target.value)}>
                  <option value="">Todas las llamadas</option>
                  <option value="lead">Solo leads</option>
                  <option value="external">Solo externas</option>
                </select>
              </label>
              <button type="button" className={`btn btn-secondary calls-more${more ? ' on' : ''}`} onClick={() => setMore((v) => !v)}>
                <IconText name="sliders-horizontal" size={16}>Más filtros</IconText>
              </button>
            </div>
            {more && (
              <div className="calls-filter-grid" style={{ marginTop: 10 }}>
                {seesOthers && (
                  <label className="calls-field">
                    <span>Colaborador</span>
                    <select className="input" value={filters.userId ?? ''} onChange={(e) => setF('userId', e.target.value)}>
                      <option value="">Todos</option>
                      {config.users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="calls-field">
                  <span>Estado técnico</span>
                  <select className="input" value={filters.status ?? ''} onChange={(e) => setF('status', e.target.value)}>
                    <option value="">Todos los estados</option>
                    {Object.entries(TECHNICAL_STATUS).map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            {chips.length > 0 && (
              <div className="calls-chips">
                <span className="calls-muted">
                  {chips.length} filtro{chips.length > 1 ? 's' : ''} activo{chips.length > 1 ? 's' : ''}
                </span>
                {chips.map(([k, l]) => (
                  <button key={k} type="button" className="calls-chip" onClick={() => removeChip(k)} title="Quitar filtro">
                    {l} <Icon name="x" size={12} />
                  </button>
                ))}
                <button type="button" className="calls-link" onClick={() => (setPage(1), setFilters({}))}>
                  Limpiar filtros
                </button>
              </div>
            )}
          </div>

          {error && <p style={{ color: 'var(--color-danger)', marginBottom: 8 }}>{error}</p>}

          <div className={`calls-layout${selected ? ' with-detail' : ''}`}>
            <section className="card calls-table-card">
              <header className="calls-card-head">
                <strong>Historial de llamadas</strong>
                <span className="calls-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8rem' }}>
                  <Icon name="arrow-down" size={14} /> Más recientes primero
                </span>
              </header>
              <div className="scroll-x">
                <table className="calls-table">
                  <thead>
                    <tr>
                      <th>Contacto</th>
                      {seesOthers && <th>Colaborador</th>}
                      <th>Fecha y hora</th>
                      <th>Duración</th>
                      <th>Resultado</th>
                      <th>Grabación</th>
                      <th style={{ width: 70 }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={7} className="calls-empty">
                          No hay llamadas con estos filtros.
                        </td>
                      </tr>
                    )}
                    {rows.map((r) => {
                      const rec = recStatus(r);
                      return (
                        <tr key={r.id} className={r.id === selectedId ? 'sel' : ''} onClick={() => setSelectedId(r.id)}>
                          <td>
                            <div className="calls-name">{contactName(r)}</div>
                            <div className="calls-sub">
                              <Icon name={r.direction === 'inbound' ? 'phone-incoming' : 'phone-outgoing'} size={12} /> {contactNumber(r)}
                              {r.provider === '3cx' ? ' · 3CX' : ''}
                            </div>
                          </td>
                          {seesOthers && <td>{config.maps.user[r.user_id]?.name ?? (r.provider === '3cx' ? 'Sin asesor (3CX)' : '—')}</td>}
                          <td>
                            <div>{fecha(r.initiated_at)}</div>
                            <div className="calls-sub">{hora(r.initiated_at)}</div>
                          </td>
                          <td className="calls-mono">{mmss(r.duration_seconds)}</td>
                          <td>
                            <ResultBadge value={r.commercial_result} />
                          </td>
                          <td>
                            {rec === 'available' ? (
                              <span className="calls-listen">
                                <span className="calls-play">
                                  <Icon name="play" size={12} />
                                </span>
                                Escuchar · {mmss(r.duration_seconds)}
                              </span>
                            ) : rec === 'pending' ? (
                              <span className="calls-muted">Procesando…</span>
                            ) : rec === 'failed' ? (
                              <span style={{ color: 'var(--color-danger)' }}>No disponible</span>
                            ) : (
                              <span className="calls-muted">Sin grabación</span>
                            )}
                          </td>
                          <td onClick={(e) => e.stopPropagation()}>
                            <span style={{ display: 'inline-flex', gap: 4 }}>
                              <button type="button" className="calls-icon-btn" title="Ver detalle" onClick={() => setSelectedId(r.id)}>
                                <Icon name="eye" size={15} />
                              </button>
                              {r.lead_id && (
                                <a className="calls-icon-btn" href={`/leads/${r.lead_id}?tab=llamadas`} title="Abrir lead">
                                  <Icon name="external-link" size={15} />
                                </a>
                              )}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <footer className="calls-card-foot">
                <span className="calls-muted">
                  {total.toLocaleString('es-CO')} llamada{total === 1 ? '' : 's'}
                  {selected ? ' · 1 llamada seleccionada' : ''}
                </span>
                {totalPages > 1 && (
                  <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                    <button className="calls-icon-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Anterior">
                      <Icon name="chevron-left" size={16} />
                    </button>
                    Página {page} de {totalPages}
                    <button className="calls-icon-btn" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} aria-label="Siguiente">
                      <Icon name="chevron-right" size={16} />
                    </button>
                  </span>
                )}
              </footer>
            </section>

            {selected && (
              <CallDetail
                key={selected.id}
                call={selected}
                users={config.maps.user}
                editable={selected.user_id === user?.id || canEditOthers}
                onClose={() => setSelectedId(null)}
                onChanged={load}
              />
            )}
          </div>
        </>
      )}
    </main>
  );
}

// ---------------------------------------------------------------- Detalle
function CallDetail({ call, users, editable, onClose, onChanged }) {
  const { can } = useSession();
  const canListen = can('calls.recordings');
  const canTranscribe = canListen && can('ai.transcribe');
  const rec = recStatus(call);
  const [url, setUrl] = useState(null);
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [result, setResult] = useState(call.commercial_result ?? '');
  const [note, setNote] = useState(call.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  async function listen() {
    setLoadingUrl(true);
    setMsg(null);
    try {
      setUrl(await getRecordingUrl(call.id));
      trackEvent('call.recording_played', { entityType: 'calls', entityId: call.id });
    } catch (e) {
      setMsg(e.message);
    } finally {
      setLoadingUrl(false);
    }
  }

  async function save(nextResult = result, nextNote = note) {
    setSaving(true);
    setMsg(null);
    try {
      await setCallResult(call.id, nextResult || null, nextNote.trim() || null);
      setMsg('Guardado');
      onChanged?.();
    } catch (e) {
      setMsg(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <aside className="card calls-detail">
      <header className="calls-card-head">
        <strong>Detalle de la llamada</strong>
        <button type="button" className="calls-icon-btn" onClick={onClose} aria-label="Cerrar detalle">
          <Icon name="x" size={16} />
        </button>
      </header>

      <section className="calls-detail-sec">
        <div className="calls-detail-contact">
          <span className="calls-detail-avatar">
            <Icon name="user" size={20} />
          </span>
          <div>
            <strong>{contactName(call)}</strong>
            <div className="calls-muted">{contactNumber(call)}</div>
          </div>
        </div>
        <dl className="calls-dl">
          <dt>Colaborador</dt>
          <dd>{users[call.user_id]?.name ?? '—'}</dd>
          <dt>Fecha</dt>
          <dd>{fecha(call.initiated_at)}</dd>
          <dt>Hora</dt>
          <dd>{hora(call.initiated_at)}</dd>
          <dt>Duración</dt>
          <dd>{mmss(call.duration_seconds)}</dd>
          <dt>Estado</dt>
          <dd>{TECHNICAL_STATUS[call.technical_status] ?? '—'}</dd>
          <dt>Resultado</dt>
          <dd>
            {editable ? (
              <select
                className="input"
                style={{ height: 32 }}
                value={result}
                onChange={(e) => {
                  setResult(e.target.value);
                  save(e.target.value, note);
                }}
              >
                <option value="">Sin resultado</option>
                {Object.entries(RESULTS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            ) : (
              <ResultBadge value={call.commercial_result} />
            )}
          </dd>
        </dl>
        {call.lead_id && (
          <a className="calls-link" href={`/leads/${call.lead_id}?tab=llamadas`}>
            Abrir lead <Icon name="arrow-right" size={13} />
          </a>
        )}
      </section>

      <section className="calls-detail-sec">
        <strong className="calls-sec-title">Grabación</strong>
        {rec === 'available' && canListen ? (
          url ? (
            <audio src={url} controls autoPlay style={{ width: '100%' }} />
          ) : (
            <button type="button" className="calls-player" onClick={listen} disabled={loadingUrl}>
              <span className="calls-play big">
                <Icon name="play" size={14} />
              </span>
              {loadingUrl ? 'Cargando…' : `Escuchar · ${mmss(call.duration_seconds)}`}
              <Icon name="volume-2" size={16} style={{ marginLeft: 'auto', opacity: 0.6 }} />
            </button>
          )
        ) : rec === 'available' ? (
          <p className="calls-muted">No tienes permiso para escuchar grabaciones.</p>
        ) : rec === 'pending' ? (
          <p className="calls-muted">La grabación se está procesando…</p>
        ) : (
          <p className="calls-muted">Esta llamada no tiene grabación.</p>
        )}
        {rec === 'available' && canTranscribe && <Transcript callId={call.id} />}
      </section>

      <section className="calls-detail-sec">
        <strong className="calls-sec-title">Notas de seguimiento</strong>
        <textarea
          className="input"
          rows={4}
          placeholder="Escribe una nota de seguimiento…"
          value={note}
          disabled={!editable}
          onChange={(e) => setNote(e.target.value)}
          style={{ resize: 'vertical', fontFamily: 'inherit' }}
        />
        {editable && (
          <button type="button" className="btn btn-primary" style={{ width: '100%' }} disabled={saving || !note.trim()} onClick={() => save()}>
            {saving ? 'Guardando…' : 'Guardar nota'}
          </button>
        )}
        {msg && <p className={msg === 'Guardado' ? 'calls-ok' : 'calls-err'}>{msg}</p>}
      </section>

      <section className="calls-detail-sec calls-detail-foot">
        <strong>Información sobre grabaciones</strong>
        <p>
          Todas las llamadas realizadas mediante esta plataforma son grabadas. Es responsabilidad del usuario informar a la persona contactada que la
          llamada está siendo grabada.
        </p>
      </section>
    </aside>
  );
}