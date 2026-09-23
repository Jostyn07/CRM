'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase/client';
import Button from '../../components/ui/button';
import Input from '../../components/ui/input';
import Modal from '../../components/ui/modal';
import CardMenu from '../../components/ui/cardMenu';
import DataTable from '../../components/tables/dataTable';
import CallInProgress from '../../components/telefonia/callInProgress';
import { RESULTADO_LABEL, RESULTADO_STYLE, pillStyle } from '../../lib/telefonia/resultados';

const PAGE_SIZE_OPTIONS = [10, 20, 40];

function minutos(segundos) {
  return Math.round((segundos || 0) / 60);
}

function formatDuracion(segundos) {
  const s = segundos || 0;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

function formatFechaHora(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const fecha = d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const hora = d.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${fecha} · ${hora}`;
}

// Reutilizado tanto por el botón ▶ (reproducir) como por "Descargar
// grabación" del menú -- misma Edge Function, ambas URLs en una sola
// llamada, cada una válida solo por unos minutos.
async function fetchRecordingUrls(recordingId) {
  const { data, error } = await supabase.functions.invoke('get-recording-url', {
    body: { recording_id: recordingId },
  });

  if (error || data?.error) {
    let detail = data?.error || error?.message;
    if (error?.context) {
      try {
        const body = await error.context.json();
        if (body?.error) detail = body.error;
      } catch {
        // sin cuerpo legible -- nos quedamos con el mensaje genérico
      }
    }
    throw new Error(detail || 'No se pudo cargar la grabación.');
  }

  return data;
}

export default function LlamadasPage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const canSeeAll = isAdmin || isOwner;
  const [currentUserId, setCurrentUserId] = useState(null);
  const [usuarios, setUsuarios] = useState([]);

  const [calls, setCalls] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [filterResultado, setFilterResultado] = useState('');
  const [filterTipo, setFilterTipo] = useState('');
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [filterUsuario, setFilterUsuario] = useState('');

  const [stats, setStats] = useState(null);
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const [nuevaLlamadaOpen, setNuevaLlamadaOpen] = useState(false);
  const [activeCall, setActiveCall] = useState(null);
  const [recordingBusyId, setRecordingBusyId] = useState(null);
  const [recordingError, setRecordingError] = useState(null);

  async function handlePlayRecording(recordingId) {
    setRecordingError(null);
    setRecordingBusyId(recordingId);
    try {
      const { play_url } = await fetchRecordingUrls(recordingId);
      // Se abre en pestaña nueva -- el navegador reproduce audio/mpeg
      // directo, sin necesidad de un reproductor embebido en la tabla.
      window.open(play_url, '_blank', 'noopener');
    } catch (err) {
      setRecordingError(err.message);
    } finally {
      setRecordingBusyId(null);
    }
  }

  async function handleDownloadRecording(recordingId) {
    setRecordingError(null);
    setRecordingBusyId(recordingId);
    try {
      const { download_url, filename } = await fetchRecordingUrls(recordingId);
      const a = document.createElement('a');
      a.href = download_url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      setRecordingError(err.message);
    } finally {
      setRecordingBusyId(null);
    }
  }

  useEffect(() => {
    loadContext();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    loadCalls();
    loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, debouncedSearch, fechaDesde, fechaHasta, filterResultado, filterTipo, filterUsuario, currentUserId]);

  async function loadContext() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    setCurrentUserId(user.id);

    const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    const admin = data?.role === 'admin';
    const owner = data?.role === 'owner';
    setIsAdmin(admin);
    setIsOwner(owner);
    if (admin || owner) {
      const { data: profiles } = await supabase.from('profiles').select('id, full_name').order('full_name');
      setUsuarios(profiles ?? []);
    }
  }

  // Filtros comunes que aplican tanto a la lista paginada como a las
  // estadísticas (que se calculan sobre TODO lo que matchea, sin range).
  function applyFilters(query) {
    if (debouncedSearch.trim()) {
      query = query.ilike('numero', `%${debouncedSearch.trim().replace(/[%,]/g, '')}%`);
      // Nota: la búsqueda por nombre de lead no está incluida — PostgREST
      // no permite un .or() limpio contra una tabla relacionada (leads.name).
      // Si hace falta, se resuelve con una vista o función en Supabase.
    }
    if (fechaDesde) query = query.gte('created_at', `${fechaDesde}T00:00:00`);
    if (fechaHasta) query = query.lte('created_at', `${fechaHasta}T23:59:59`);
    if (filterResultado) query = query.eq('resultado', filterResultado);
    if (filterTipo) query = query.eq('tipo', filterTipo);
    if (canSeeAll && filterUsuario) query = query.eq('user_id', filterUsuario);
    return query;
  }

  async function loadCalls() {
    setLoading(true);
    setErrorMsg(null);

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from('calls')
      .select(
        `id, tipo, numero, estado_tecnico, resultado, duracion_segundos, hora_inicio, created_at, user_id,
         leads ( id, name ),
         profiles ( full_name ),
         call_recordings ( id, disponible, duracion_segundos )`,
        { count: 'exact' }
      );

    query = applyFilters(query).order('created_at', { ascending: false }).range(from, to);

    const { data, error, count } = await query;

    if (error) {
      setErrorMsg(error.message);
    } else {
      setCalls(data ?? []);
      setTotalCount(count ?? 0);
    }
    setLoading(false);
  }

  async function loadStats() {
    // Una sola consulta liviana (sin range) para calcular minutos
    // utilizados, duración promedio y grabaciones sobre TODO lo que
    // matchea los filtros actuales — no solo la página visible.
    let query = supabase.from('calls').select('duracion_segundos, call_recordings ( disponible )');
    query = applyFilters(query);
    const { data } = await query;
    const rows = data ?? [];

    const conectadas = rows.filter((r) => (r.duracion_segundos || 0) > 0);
    const minutosUtilizados = minutos(rows.reduce((sum, r) => sum + (r.duracion_segundos || 0), 0));
    const duracionPromedioSeg = conectadas.length
      ? Math.round(conectadas.reduce((sum, r) => sum + r.duracion_segundos, 0) / conectadas.length)
      : 0;
    const grabaciones = rows.filter((r) => {
      const rec = Array.isArray(r.call_recordings) ? r.call_recordings[0] : r.call_recordings;
      return rec?.disponible;
    }).length;

    const targetUserId = canSeeAll ? filterUsuario : currentUserId;

    let minutosDisponibles = null;
    if (targetUserId) {
      const { data: perfil } = await supabase
        .from('profiles')
        .select('minutos_disponibles_segundos')
        .eq('id', targetUserId)
        .single();
      minutosDisponibles = minutos(perfil?.minutos_disponibles_segundos);
    }

    setStats({
      totalLlamadas: rows.length,
      minutosUtilizados,
      duracionPromedio: formatDuracion(duracionPromedioSeg),
      minutosDisponibles,
      grabaciones,
    });
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const showGlobalCard = canSeeAll && !filterUsuario;

  const columns = [
    { key: 'fecha', label: 'Fecha y hora', render: (c) => formatFechaHora(c.created_at) },
    {
      key: 'lead',
      label: canSeeAll && !filterUsuario ? 'Lead / Número · Usuario' : 'Lead / Número',
      render: (c) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{c.leads?.name || c.numero}</div>
          {c.tipo === 'lead' ? (
            <div style={{ fontSize: '0.78rem', color: 'var(--color-text-tertiary)' }}>{c.numero}</div>
          ) : (
            <span className="status-pill" style={{ ...pillStyle('none'), marginTop: 2 }}>Número externo</span>
          )}
          {canSeeAll && !filterUsuario && (
            <div style={{ fontSize: '0.74rem', color: 'var(--color-text-tertiary)', marginTop: 2 }}>{c.profiles?.full_name || '—'}</div>
          )}
        </div>
      ),
    },
    { key: 'duracion', label: 'Duración', render: (c) => formatDuracion(c.duracion_segundos) },
    {
      key: 'resultado',
      label: 'Resultado',
      render: (c) =>
        c.resultado ? (
          <span className="status-pill" style={pillStyle(RESULTADO_STYLE[c.resultado] || 'none')}>
            {RESULTADO_LABEL[c.resultado]}
          </span>
        ) : (
          <span style={{ color: 'var(--color-text-tertiary)', fontSize: '0.82rem' }}>—</span>
        ),
    },
    {
      key: 'grabacion',
      label: 'Grabación',
      render: (c) => {
        const rec = Array.isArray(c.call_recordings) ? c.call_recordings[0] : c.call_recordings;
        if (!rec?.disponible) return <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>;
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              className="btn btn-secondary"
              onClick={() => handlePlayRecording(rec.id)}
              disabled={recordingBusyId === rec.id}
              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
            >
              {recordingBusyId === rec.id ? '…' : '▶'}
            </button>
            <span style={{ fontSize: '0.78rem', color: 'var(--color-text-tertiary)' }}>{formatDuracion(rec.duracion_segundos)}</span>
          </div>
        );
      },
    },
    {
      key: 'tipo',
      label: 'Tipo',
      render: (c) => (
        <span className="status-pill" style={{ background: 'var(--color-primary-soft)', color: 'var(--color-primary)', borderColor: 'transparent' }}>
          {c.tipo === 'lead' ? 'Lead' : 'Externa'}
        </span>
      ),
    },
    {
      key: 'acciones',
      label: '',
      render: (c) => {
        const rec = Array.isArray(c.call_recordings) ? c.call_recordings[0] : c.call_recordings;
        const items = [{ label: 'Ver detalle', onClick: () => (window.location.href = c.leads?.id ? `/leads/${c.leads.id}?tab=llamadas` : '#') }];
        if (rec?.disponible) {
          items.push({ label: 'Descargar grabación', onClick: () => handleDownloadRecording(rec.id) });
        }
        return <CardMenu items={items} />;
      },
    },
  ];

  return (
    <main style={{ padding: '28px 32px', maxWidth: 1500, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ fontSize: '1.9rem', fontWeight: 750, letterSpacing: '-0.02em' }}>Llamadas</h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginTop: 4 }}>Gestiona y consulta el historial de tus llamadas</p>
        </div>
        <Button onClick={() => setNuevaLlamadaOpen(true)}>📞 Nueva llamada</Button>
      </div>

      {!noticeDismissed && (
        <div
          className="card"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            padding: '0.75rem 1rem',
            marginBottom: '1.1rem',
            background: 'var(--color-primary-soft)',
            border: 'none',
          }}
        >
          <span aria-hidden>ℹ️</span>
          <p style={{ fontSize: '0.85rem', flex: 1, color: 'var(--color-text)' }}>
            Todas las llamadas realizadas mediante esta plataforma son grabadas. Es responsabilidad del usuario informar a la persona contactada que la llamada está siendo grabada.
          </p>
          <button onClick={() => setNoticeDismissed(true)} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)' }} aria-label="Cerrar aviso">✕</button>
        </div>
      )}

      {errorMsg && <p style={{ color: 'var(--color-danger)', marginBottom: '1rem' }}>{errorMsg}</p>}
      {recordingError && <p style={{ color: 'var(--color-danger)', marginBottom: '1rem' }}>{recordingError}</p>}

      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(150px, 1fr))', gap: '0.75rem', marginBottom: '1.1rem' }}>
          <StatCard icon="📞" value={stats.totalLlamadas} label={showGlobalCard ? 'Llamadas totales' : 'Mis llamadas'} />
          <StatCard icon="🕒" value={`${stats.minutosUtilizados} min`} label="Minutos utilizados" />
          {showGlobalCard ? (
            <StatCard icon="🎙️" value={stats.grabaciones} label="Grabaciones" />
          ) : (
            <StatCard icon="📊" value={stats.minutosDisponibles ?? '—'} label="Minutos disponibles" color="var(--color-status-custom-text)" />
          )}
          <StatCard icon="📈" value={stats.duracionPromedio} label="Duración promedio" />
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: showMoreFilters ? '0.6rem' : '1rem', alignItems: 'center' }}>
        <div style={{ position: 'relative', width: 260, maxWidth: '100%' }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>🔎</span>
          <Input placeholder="Buscar por número…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ paddingLeft: '2rem', height: 42 }} />
        </div>
        <Input type="date" value={fechaDesde} onChange={(e) => { setFechaDesde(e.target.value); setPage(1); }} style={{ height: 42, width: 150 }} />
        <Input type="date" value={fechaHasta} onChange={(e) => { setFechaHasta(e.target.value); setPage(1); }} style={{ height: 42, width: 150 }} />
        <select className="input" style={{ maxWidth: 190, height: 42 }} value={filterResultado} onChange={(e) => { setFilterResultado(e.target.value); setPage(1); }}>
          <option value="">Todos los resultados</option>
          {Object.entries(RESULTADO_LABEL).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <select className="input" style={{ maxWidth: 160, height: 42 }} value={filterTipo} onChange={(e) => { setFilterTipo(e.target.value); setPage(1); }}>
          <option value="">Todas las llamadas</option>
          <option value="lead">Lead</option>
          <option value="externa">Externa</option>
        </select>
        {canSeeAll && (
          <button className="btn btn-secondary" onClick={() => setShowMoreFilters((v) => !v)} style={{ marginLeft: 'auto' }}>
            ▤ Filtros
          </button>
        )}
      </div>

      {canSeeAll && showMoreFilters && (
        <div style={{ marginBottom: '1rem' }}>
          <select className="input" style={{ maxWidth: 220, height: 42 }} value={filterUsuario} onChange={(e) => { setFilterUsuario(e.target.value); setPage(1); }}>
            <option value="">Todos los usuarios</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>{u.full_name || u.id}</option>
            ))}
          </select>
        </div>
      )}

      {loading ? (
        <p>Cargando…</p>
      ) : (
        <>
          <DataTable columns={columns} rows={calls} emptyMessage="No hay llamadas que coincidan con la búsqueda o los filtros." />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
              Mostrando {calls.length === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalCount)} de {totalCount} llamadas
            </span>

            {totalPages > 1 && (
              <div style={{ display: 'flex', gap: '0.35rem' }}>
                <button className="btn btn-secondary" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: '0.4rem 0.6rem' }}>←</button>
                <span style={{ padding: '0.4rem 0.7rem', fontSize: '0.85rem' }}>{page} / {totalPages}</span>
                <button className="btn btn-secondary" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ padding: '0.4rem 0.6rem' }}>→</button>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>por página</span>
              <select className="input" style={{ width: 80 }} value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          </div>
        </>
      )}

      <NuevaLlamadaModal open={nuevaLlamadaOpen} onClose={() => setNuevaLlamadaOpen(false)} onStartCall={setActiveCall} />

      {activeCall && (
        <CallInProgress
          call={activeCall}
          onClose={() => setActiveCall(null)}
          onSaveResult={async () => {
            // CallInProgress ya insertó la fila real en `calls` con los
            // IDs de Telnyx -- acá solo hace falta refrescar la lista.
            loadCalls();
            loadStats();
          }}
        />
      )}
    </main>
  );
}

function StatCard({ icon, value, label, color }) {
  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.85rem 1rem' }}>
      <span style={{ fontSize: '1.1rem' }}>{icon}</span>
      <div>
        <div style={{ fontWeight: 750, fontSize: '1.1rem', color: color || 'var(--color-text)' }}>{value}</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{label}</div>
      </div>
    </div>
  );
}

// Marcar un número y llamar requiere el SDK WebRTC de Telnyx +
// la Edge Function que genera el Access Token — pendiente hasta que
// retomemos esa fase. Por ahora, "Llamar" abre la ventana de Llamada en
// curso directamente (sin conexión real) para poder ver y probar esa
// interfaz — onStartCall es lo único que hay que cambiar cuando el
// Voice SDK exista de verdad.
const KEYPAD_KEYS = [
  { key: '1', sub: '' }, { key: '2', sub: 'ABC' }, { key: '3', sub: 'DEF' },
  { key: '4', sub: 'GHI' }, { key: '5', sub: 'JKL' }, { key: '6', sub: 'MNO' },
  { key: '7', sub: 'PQRS' }, { key: '8', sub: 'TUV' }, { key: '9', sub: 'WXYZ' },
  { key: '*', sub: '' }, { key: '0', sub: '+' }, { key: '#', sub: '' },
];

const AVATAR_COLORS = ['#6366f1', '#8b5cf6', '#22c55e', '#f59e0b', '#ec4899', '#06b6d4'];

function avatarColorFor(seed) {
  let hash = 0;
  for (let i = 0; i < String(seed).length; i++) hash = String(seed).charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initialsFor(name) {
  if (!name) return '#';
  return name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

function formatRelativeTime(iso) {
  if (!iso) return '';
  const fecha = new Date(iso);
  const diffMin = Math.floor((Date.now() - fecha.getTime()) / 60000);
  if (diffMin < 1) return 'Ahora';
  if (diffMin < 60) return `Hace ${diffMin} min`;

  const hora = fecha.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
  const hoy = new Date().toDateString() === fecha.toDateString();
  if (hoy) return `Hoy, ${hora}`;

  const ayer = new Date(Date.now() - 86400000).toDateString() === fecha.toDateString();
  if (ayer) return `Ayer, ${hora}`;

  return `${fecha.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}, ${hora}`;
}

function ContactRow({ nombre, numero, subtitulo, onCall, avatarSeed }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div
        style={{
          width: 38, height: 38, borderRadius: '50%', background: avatarColorFor(avatarSeed), color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700, flexShrink: 0,
        }}
      >
        {initialsFor(nombre || numero)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {nombre || 'Número externo'}
        </div>
        <div style={{ fontSize: '0.76rem', color: 'var(--color-text-muted)' }}>{numero}</div>
        {subtitulo && <div style={{ fontSize: '0.72rem', color: 'var(--color-text-tertiary)' }}>{subtitulo}</div>}
      </div>
      <button
        onClick={onCall}
        aria-label={`Llamar a ${nombre || numero}`}
        style={{
          width: 32, height: 32, borderRadius: '50%', border: 'none', background: 'var(--color-whatsapp-bg)',
          color: 'var(--color-whatsapp)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
        }}
      >
        📞
      </button>
    </div>
  );
}

function NuevaLlamadaModal({ open, onClose, onStartCall }) {
  const [numero, setNumero] = useState('');
  const [panelView, setPanelView] = useState('recientes'); // 'recientes' | 'contactos'
  const [recientes, setRecientes] = useState([]);
  const [contactos, setContactos] = useState([]);
  const [contactoQuery, setContactoQuery] = useState('');
  const [loadingPanel, setLoadingPanel] = useState(false);
  const [audioDevices, setAudioDevices] = useState([]);
  const [audioDeviceId, setAudioDeviceId] = useState('default');
  const [showAudioMenu, setShowAudioMenu] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNumero('');
    setPanelView('recientes');
    setContactoQuery('');
    loadRecientes();
    loadAudioDevices();
  }, [open]);

  async function loadRecientes() {
    setLoadingPanel(true);
    // La tabla `leads` tiene columnas `name` y `phone` (no `nombre`/
    // `telefono`) -- con el nombre equivocado Supabase devolvía error
    // en el select anidado y `data` quedaba vacío, por eso nunca
    // aparecían llamadas recientes.
    const { data, error } = await supabase
      .from('calls')
      .select('numero, created_at, leads ( id, name )')
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) {
      console.error('No se pudieron cargar las llamadas recientes:', error.message);
      setRecientes([]);
      setLoadingPanel(false);
      return;
    }

    const seen = new Set();
    const list = [];
    for (const row of data ?? []) {
      if (seen.has(row.numero)) continue;
      seen.add(row.numero);
      list.push(row);
      if (list.length >= 5) break;
    }
    setRecientes(list);
    setLoadingPanel(false);
  }

  async function loadContactos(query) {
    setLoadingPanel(true);
    let q = supabase.from('leads').select('id, name, phone').not('phone', 'is', null).order('created_at', { ascending: false }).limit(20);
    if (query) q = q.ilike('name', `%${query}%`);
    const { data, error } = await q;
    if (error) {
      console.error('No se pudieron cargar los contactos:', error.message);
      setContactos([]);
      setLoadingPanel(false);
      return;
    }
    setContactos(data ?? []);
    setLoadingPanel(false);
  }

  async function loadAudioDevices() {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      setAudioDevices(devices.filter((d) => d.kind === 'audiooutput'));
    } catch {
      setAudioDevices([]);
    }
  }

  async function handlePegar() {
    try {
      const text = await navigator.clipboard.readText();
      setNumero((text || '').replace(/[^\d+]/g, ''));
    } catch {
      // el navegador puede negar el permiso de portapapeles -- no rompe nada
    }
  }

  function handleCall(target) {
    const finalNumero = (target?.phone || target?.numero || numero || '').trim();
    if (!finalNumero) return;
    onStartCall({ name: target?.name || null, numero: finalNumero, leadId: target?.id || null });
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} width={760}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.9rem', marginBottom: '1.4rem' }}>
        <div
          style={{
            width: 52, height: 52, borderRadius: '50%', background: 'var(--color-primary-soft)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', flexShrink: 0,
          }}
        >
          📞
        </div>
        <div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 700, margin: 0 }}>Nueva llamada</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: '2px 0 0' }}>
            Marca un número para iniciar la llamada
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: '1.5rem' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 6 }}>Número de teléfono</label>
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--color-focus-border)',
              borderRadius: 'var(--radius)', padding: '0.55rem 0.75rem', marginBottom: '1.1rem',
              boxShadow: '0 0 0 3px var(--color-focus-shadow)', background: 'var(--color-input-bg)',
            }}
          >
            <span style={{ fontSize: '1.1rem' }}>🇺🇸</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>▾</span>
            <input
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              placeholder="+1 305 555 1234"
              style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', color: 'var(--color-text)', fontSize: '1rem' }}
            />
            {numero && (
              <button
                onClick={() => setNumero('')}
                aria-label="Limpiar"
                style={{
                  background: 'var(--color-border)', border: 'none', borderRadius: '50%', width: 22, height: 22,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: '0.65rem', flexShrink: 0,
                }}
              >
                ✕
              </button>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem', marginBottom: '0.9rem' }}>
            {KEYPAD_KEYS.map((k) => (
              <button
                key={k.key}
                onClick={() => setNumero((n) => n + k.key)}
                style={{
                  background: 'var(--color-btn-secondary-bg)', border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius)', padding: '0.85rem 0', display: 'flex', flexDirection: 'column',
                  alignItems: 'center', gap: 2, cursor: 'pointer',
                }}
              >
                <span style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--color-text)' }}>{k.key}</span>
                <span style={{ fontSize: '0.6rem', color: 'var(--color-text-tertiary)', letterSpacing: '0.05em' }}>{k.sub}</span>
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem' }}>
            <button
              className="btn btn-secondary"
              onClick={() => { setPanelView('contactos'); loadContactos(''); }}
              style={{ flexDirection: 'column', gap: 2, padding: '0.6rem 0', fontSize: '0.76rem' }}
            >
              <span>👥</span>Contactos
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => { setPanelView('recientes'); loadRecientes(); }}
              style={{ flexDirection: 'column', gap: 2, padding: '0.6rem 0', fontSize: '0.76rem' }}
            >
              <span>🕐</span>Recientes
            </button>
            <button
              className="btn btn-secondary"
              onClick={handlePegar}
              style={{ flexDirection: 'column', gap: 2, padding: '0.6rem 0', fontSize: '0.76rem' }}
            >
              <span>📋</span>Pegar
            </button>
          </div>
        </div>

        <div style={{ borderLeft: '1px solid var(--color-border)', paddingLeft: '1.2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>
              {panelView === 'recientes' ? 'Contactos recientes' : 'Contactos'}
            </span>
            {panelView === 'contactos' && (
              <button
                onClick={() => setPanelView('recientes')}
                style={{ background: 'none', border: 'none', color: 'var(--color-primary)', fontSize: '0.78rem', cursor: 'pointer' }}
              >
                Ver recientes
              </button>
            )}
          </div>

          {panelView === 'contactos' && (
            <input
              className="input"
              placeholder="Buscar contacto…"
              value={contactoQuery}
              onChange={(e) => { setContactoQuery(e.target.value); loadContactos(e.target.value); }}
              style={{ marginBottom: '0.75rem', fontSize: '0.82rem', padding: '0.4rem 0.6rem' }}
            />
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', maxHeight: 320, overflowY: 'auto' }}>
            {loadingPanel ? (
              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Cargando…</span>
            ) : panelView === 'recientes' ? (
              recientes.length === 0 ? (
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Sin llamadas recientes.</span>
              ) : (
                recientes.map((r) => (
                  <ContactRow
                    key={r.numero}
                    nombre={r.leads?.name}
                    numero={r.numero}
                    subtitulo={formatRelativeTime(r.created_at)}
                    avatarSeed={r.numero}
                    onCall={() => handleCall({ name: r.leads?.name, numero: r.numero, id: r.leads?.id })}
                  />
                ))
              )
            ) : contactos.length === 0 ? (
              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Sin contactos.</span>
            ) : (
              contactos.map((c) => (
                <ContactRow
                  key={c.id}
                  nombre={c.name}
                  numero={c.phone}
                  avatarSeed={c.id}
                  onCall={() => handleCall(c)}
                />
              ))
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '1.3rem', paddingTop: '1.1rem', borderTop: '1px solid var(--color-border)' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <button
            className="btn btn-secondary"
            onClick={() => setShowAudioMenu((v) => !v)}
            style={{ width: '100%', justifyContent: 'space-between' }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              🎧
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.2 }}>
                <span style={{ fontSize: '0.68rem', color: 'var(--color-text-tertiary)' }}>Dispositivo de audio</span>
                <span style={{ fontSize: '0.82rem' }}>
                  {audioDeviceId === 'default' ? 'Por defecto' : audioDevices.find((d) => d.deviceId === audioDeviceId)?.label || 'Por defecto'}
                </span>
              </span>
            </span>
            <span>▾</span>
          </button>
          {showAudioMenu && (
            <div
              style={{
                position: 'absolute', bottom: '110%', left: 0, right: 0, background: 'var(--color-surface-solid)',
                border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                zIndex: 5, maxHeight: 160, overflowY: 'auto',
              }}
            >
              <button
                onClick={() => { setAudioDeviceId('default'); setShowAudioMenu(false); }}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.5rem 0.75rem', background: 'none', border: 'none', fontSize: '0.82rem', color: 'var(--color-text)', cursor: 'pointer' }}
              >
                Por defecto
              </button>
              {audioDevices.map((d) => (
                <button
                  key={d.deviceId}
                  onClick={() => { setAudioDeviceId(d.deviceId); setShowAudioMenu(false); }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.5rem 0.75rem', background: 'none', border: 'none', fontSize: '0.82rem', color: 'var(--color-text)', cursor: 'pointer' }}
                >
                  {d.label || 'Dispositivo de audio'}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          className="btn btn-primary"
          onClick={() => handleCall()}
          disabled={!numero.trim()}
          style={{ padding: '0.75rem 1.75rem', fontSize: '0.95rem', fontWeight: 600, opacity: numero.trim() ? 1 : 0.5 }}
        >
          📞 Llamar
        </button>
      </div>
    </Modal>
  );
}