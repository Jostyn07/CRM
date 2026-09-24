'use client';
// Ruta: app/leads/[id]/page.js
// Ficha del lead (secciones 9.9 y 21.3): cabecera con contexto y
// acciones, y pestañas. Cada cambio de pestaña queda en la actividad.

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import RequirePermission from '../../../components/ui/requirePermission';
import Modal from '../../../components/ui/modal';
import LeadForm from '../../../components/leads/leadForm';
import { StatusPill, TagChips } from '../../../components/leads/tagPicker';
import { useSession } from '../../../lib/auth/sessionContext';
import { useLeadConfig } from '../../../lib/leads/useLeadConfig';
import { getLead, getLeadActivity, restore, softDelete } from '../../../lib/leads/api';
import { describeEvent, fullDate, relTime } from '../../../lib/leads/format';
import { trackEvent, trackTab } from '../../../lib/activity/tracker';

const TABS = [
  { key: 'informacion', label: 'Información' },
  { key: 'actividad', label: 'Actividad' },
  { key: 'llamadas', label: 'Llamadas' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'tareas', label: 'Tareas' },
  { key: 'oportunidad', label: 'Oportunidad' },
];

export default function LeadDetailPage() {
  return (
    <RequirePermission perm="leads.view">
      <Suspense fallback={null}>
        <LeadDetail />
      </Suspense>
    </RequirePermission>
  );
}

function LeadDetail() {
  const { id } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can } = useSession();
  const config = useLeadConfig();

  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [tab, setTab] = useState(TABS.some((t) => t.key === searchParams.get('tab')) ? searchParams.get('tab') : 'informacion');

  const load = useCallback(async () => {
    try {
      const data = await getLead(id);
      setLead(data);
      if (!data) setError('Este lead no existe o no tienes acceso a él.');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
    trackEvent('lead.view', { entityType: 'leads', entityId: id });
  }, [id, load]);

  function changeTab(next) {
    if (next === tab) return;
    trackTab('lead', tab, next, { entityType: 'leads', entityId: id });
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', next);
    window.history.replaceState(null, '', url);
  }

  async function handleDelete() {
    if (!confirm('¿Enviar este lead a la papelera?')) return;
    try {
      await softDelete([id]);
      router.push('/leads');
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleRestore() {
    try {
      await restore([id]);
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  if (loading || config.loading) return <main style={{ padding: '1.5rem' }}>Cargando…</main>;
  if (!lead) {
    return (
      <main style={{ padding: '1.5rem' }}>
        <p style={{ color: 'var(--color-danger)' }}>{error}</p>
        <a href="/leads" className="btn btn-secondary" style={{ marginTop: '1rem', display: 'inline-flex' }}>
          ← Volver a leads
        </a>
      </main>
    );
  }

  const { maps } = config;
  const deleted = !!lead.deleted_at;

  return (
    <main style={{ padding: '1.5rem', maxWidth: 1100 }}>
      <a href="/leads" style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
        ← Leads
      </a>

      {/* Cabecera */}
      <div className="card" style={{ marginTop: '0.6rem', marginBottom: '1rem' }}>
        {deleted && (
          <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem', marginBottom: '0.6rem' }}>
            Este lead está en la papelera desde el {fullDate(lead.deleted_at)}.
          </p>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 700 }}>
              {lead.first_name} {lead.last_name}
            </h1>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 6, fontSize: '0.88rem' }}>
              <StatusPill status={maps.status[lead.status_id]} />
              {lead.phone_normalized && <a href={`tel:${lead.phone_normalized}`}>📞 {lead.phone_normalized}</a>}
              {lead.email_normalized && <a href={`mailto:${lead.email_normalized}`}>✉️ {lead.email_normalized}</a>}
              {lead.company_name && <span>🏢 {lead.company_name}</span>}
            </div>
            <div style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginTop: 6 }}>
              Responsable: {maps.user[lead.assigned_user_id]?.name ?? 'sin asignar'} · Sucursal: {maps.branch[lead.branch_id]?.name ?? '—'} · Fuente:{' '}
              {maps.source[lead.source_id]?.name ?? '—'}
            </div>
            <div style={{ marginTop: 8 }}>
              <TagChips tagIds={lead.tag_ids} tagMap={maps.tag} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            {!deleted && can('leads.update') && (
              <button
                className="btn btn-primary"
                onClick={() => {
                  setEditOpen(true);
                  trackEvent('lead.edit_open', { entityType: 'leads', entityId: id });
                }}
              >
                Editar
              </button>
            )}
            {!deleted && can('leads.delete') && (
              <button className="btn btn-secondary" style={{ color: 'var(--color-danger)' }} onClick={handleDelete}>
                Papelera
              </button>
            )}
            {deleted && can('leads.delete') && (
              <button className="btn btn-primary" onClick={handleRestore}>
                Restaurar
              </button>
            )}
          </div>
        </div>
        {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem', marginTop: 8 }}>{error}</p>}
      </div>

      {/* Pestañas */}
      <div className="tabs-bar" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={`tab-link${tab === t.key ? ' active' : ''}`}
            onClick={() => changeTab(t.key)}
            style={{ background: 'none', border: 'none', borderBottom: tab === t.key ? '2px solid var(--color-primary)' : '2px solid transparent', cursor: 'pointer' }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'informacion' && <InfoTab lead={lead} config={config} />}
      {tab === 'actividad' && <ActivityTab leadId={id} maps={maps} canView={can('audit.view')} />}
      {tab === 'llamadas' && <Upcoming text="El historial de llamadas llega con la integración de Telnyx." />}
      {tab === 'whatsapp' && <Upcoming text="Las conversaciones de WhatsApp llegan en la Fase 4 (Comunicación)." />}
      {tab === 'tareas' && <Upcoming text="Las tareas llegan en la Fase 3 (Actividades y tareas)." />}
      {tab === 'oportunidad' && <Upcoming text="Las oportunidades llegan en la Fase 2 (Embudos)." />}

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Editar lead" width={720}>
        <LeadForm
          lead={lead}
          config={config}
          onCancel={() => setEditOpen(false)}
          onSaved={async () => {
            setEditOpen(false);
            await load();
          }}
        />
      </Modal>
    </main>
  );
}

function Row({ label, children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 8, padding: '0.45rem 0', borderBottom: '1px solid var(--color-border)', fontSize: '0.88rem' }}>
      <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
      <span>{children || '—'}</span>
    </div>
  );
}

function InfoTab({ lead, config }) {
  const fmtCustom = (f, v) => {
    if (v === undefined || v === null || v === '') return null;
    if (Array.isArray(v)) return v.join(', ');
    if (v === true) return 'Sí';
    if (v === false) return 'No';
    if (f.field_type === 'url') return <a href={v} target="_blank" rel="noreferrer">{v}</a>;
    return String(v);
  };
  const fields = config.customFields.filter((f) => f.is_active || lead.custom_data?.[f.key] != null);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
      <div className="card">
        <h3 style={{ fontSize: '0.95rem', marginBottom: '0.5rem' }}>Datos del lead</h3>
        <Row label="Nombre">{`${lead.first_name} ${lead.last_name ?? ''}`}</Row>
        <Row label="Teléfono">{lead.phone_normalized}</Row>
        <Row label="Teléfono (como se escribió)">{lead.phone_raw}</Row>
        <Row label="Correo">{lead.email_normalized}</Row>
        <Row label="Empresa">{lead.company_name}</Row>
        <Row label="País">{lead.country}</Row>
        <Row label="Estado / Departamento">{lead.state}</Row>
        <Row label="Ciudad">{lead.city}</Row>
        <Row label="Dirección">{lead.address}</Row>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {fields.length > 0 && (
          <div className="card">
            <h3 style={{ fontSize: '0.95rem', marginBottom: '0.5rem' }}>Campos personalizados</h3>
            {fields.map((f) => (
              <Row key={f.id} label={f.name}>
                {fmtCustom(f, lead.custom_data?.[f.key])}
              </Row>
            ))}
          </div>
        )}
        <div className="card">
          <h3 style={{ fontSize: '0.95rem', marginBottom: '0.5rem' }}>Trazabilidad</h3>
          <Row label="Creado">{fullDate(lead.created_at)}</Row>
          <Row label="Creado por">{config.maps.user[lead.created_by]?.name}</Row>
          <Row label="Última modificación">{fullDate(lead.updated_at)}</Row>
          <Row label="Última actividad">{relTime(lead.last_activity_at)}</Row>
        </div>
      </div>
    </div>
  );
}

function ActivityTab({ leadId, maps, canView }) {
  const [events, setEvents] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!canView) return;
    getLeadActivity(leadId)
      .then(setEvents)
      .catch((e) => setError(e.message));
  }, [leadId, canView]);

  if (!canView) return <Upcoming text="No tienes permiso para ver la actividad." />;
  if (error) return <p style={{ color: 'var(--color-danger)' }}>{error}</p>;
  if (!events) return <p>Cargando…</p>;
  if (!events.length) return <Upcoming text="Todavía no hay actividad registrada." />;

  return (
    <div className="card" style={{ padding: 0 }}>
      {events.map((ev) => (
        <div key={`${ev.source}-${ev.id}`} style={{ display: 'flex', gap: 12, padding: '0.6rem 0.9rem', borderBottom: '1px solid var(--color-border)', fontSize: '0.86rem' }}>
          <span style={{ width: 150, flexShrink: 0, color: 'var(--color-text-muted)' }}>{fullDate(ev.occurred_at)}</span>
          <span style={{ width: 160, flexShrink: 0, fontWeight: 500 }}>{maps.user[ev.user_id]?.name ?? 'Sistema'}</span>
          <span>{describeEvent(ev, maps)}</span>
        </div>
      ))}
    </div>
  );
}

function Upcoming({ text }) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
      {text}
    </div>
  );
}
