'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase/client';
import DataTable from '../../../components/tables/dataTable';

const TABS = [
  { href: '/settings/usuarios', label: 'Usuarios' },
  { href: '/settings/numeros', label: 'Números' },
  { href: '/settings/plantillas', label: 'Plantillas de permisos' },
  { href: '/settings/organizacion', label: 'Organización' },
  { href: '/settings/actividad', label: 'Registro de actividad' },
];

const ENTITY_LABEL = {
  profiles: 'Usuario',
  call_permission_templates: 'Plantilla de permisos',
  template_permissions: 'Permiso de plantilla',
  user_permission_overrides: 'Permiso individual',
  funnels: 'Embudo',
  organizations: 'Organización',
};

const ACTION_LABEL = { insert: 'Creó', update: 'Modificó', delete: 'Eliminó' };

const PAGE_SIZE = 30;

function formatFecha(iso) {
  return new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function ActividadPage() {
  const [logs, setLogs] = useState([]);
  const [actorNames, setActorNames] = useState({});
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    load(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  async function load(pageNum) {
    setLoading(true);
    setErrorMsg(null);

    const from = (pageNum - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error, count } = await supabase
      .from('audit_logs')
      .select('id, action, entity_type, entity_id, detail, created_at, actor_id', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      setErrorMsg(error.message);
      setLoading(false);
      return;
    }

    setLogs(data ?? []);
    setTotalCount(count ?? 0);

    // Los nombres de quién hizo cada cosa se resuelven aparte -- audit_logs
    // solo guarda el actor_id, no duplicamos el nombre en cada fila.
    const actorIds = [...new Set((data ?? []).map((l) => l.actor_id).filter(Boolean))];
    if (actorIds.length > 0) {
      const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', actorIds);
      const names = {};
      (profiles ?? []).forEach((p) => {
        names[p.id] = p.full_name || 'Usuario';
      });
      setActorNames((prev) => ({ ...prev, ...names }));
    }

    setLoading(false);
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const columns = [
    { key: 'fecha', label: 'Fecha', render: (l) => formatFecha(l.created_at) },
    { key: 'actor', label: 'Quién', render: (l) => actorNames[l.actor_id] || (l.actor_id ? '—' : 'Sistema') },
    { key: 'accion', label: 'Acción', render: (l) => ACTION_LABEL[l.action] || l.action },
    { key: 'entidad', label: 'Sobre', render: (l) => ENTITY_LABEL[l.entity_type] || l.entity_type },
    {
      key: 'detalle',
      label: '',
      render: (l) => (
        <button
          className="btn btn-secondary"
          style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem' }}
          onClick={() => setExpandedId(expandedId === l.id ? null : l.id)}
        >
          {expandedId === l.id ? 'Ocultar' : 'Ver detalle'}
        </button>
      ),
    },
  ];

  return (
    <main style={{ padding: '28px 32px', maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.9rem', fontWeight: 750, letterSpacing: '-0.02em', marginBottom: 4 }}>Registro de actividad</h1>
      <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: '1.25rem' }}>
        Quién creó, modificó o eliminó qué, dentro de tu organización.
      </p>

      <div className="tabs-bar">
        {TABS.map((t) => (
          <a key={t.href} href={t.href} className={`tab-link${t.href === '/settings/actividad' ? ' active' : ''}`}>
            {t.label}
          </a>
        ))}
      </div>

      {errorMsg && <p style={{ color: 'var(--color-danger)', marginTop: '1rem' }}>{errorMsg}</p>}

      {loading ? (
        <p style={{ marginTop: '1rem' }}>Cargando…</p>
      ) : (
        <>
          <DataTable columns={columns} rows={logs} emptyMessage="Todavía no hay actividad registrada." />

          {logs.map((l) =>
            expandedId === l.id ? (
              <pre
                key={`detail-${l.id}`}
                style={{
                  background: 'var(--color-btn-secondary-bg)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius)',
                  padding: '0.75rem',
                  fontSize: '0.78rem',
                  overflowX: 'auto',
                  marginTop: '0.5rem',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {JSON.stringify(l.detail, null, 2)}
              </pre>
            ) : null
          )}

          {totalPages > 1 && (
            <div style={{ display: 'flex', gap: '0.35rem', marginTop: '1.25rem' }}>
              <button className="btn btn-secondary" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: '0.4rem 0.6rem' }}>←</button>
              <span style={{ padding: '0.4rem 0.7rem', fontSize: '0.85rem' }}>{page} / {totalPages}</span>
              <button className="btn btn-secondary" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ padding: '0.4rem 0.6rem' }}>→</button>
            </div>
          )}
        </>
      )}
    </main>
  );
}