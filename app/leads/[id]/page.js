'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '../../../lib/supabase/client';
import LeadDetailForm from '../../../components/leads/leadDetailForm';
import Button from '../../../components/ui/button';
import LeadCallsTab from '../../../components/telefonia/leadCallsTab';
import CallInProgress from '../../../components/telefonia/callInProgress';

const TABS = [
  { key: 'informacion', label: 'Información' },
  { key: 'llamadas', label: 'Llamadas' },
];

export default function LeadDetailPage() {
  const { id: leadId } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const [isAdmin, setIsAdmin] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [users, setUsers] = useState([]);
  const [reassigning, setReassigning] = useState(false);

  const [activeTab, setActiveTab] = useState(searchParams.get('tab') === 'llamadas' ? 'llamadas' : 'informacion');
  const [activeCall, setActiveCall] = useState(null);

  useEffect(() => {
    if (leadId) {
      loadLead();
      loadRole();
    }
  }, [leadId]);

  async function loadRole() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (data?.role === 'admin' || data?.role === 'owner') {
      setIsAdmin(data.role === 'admin');
      setIsOwner(data.role === 'owner');
      const { data: profiles } = await supabase.from('profiles').select('id, full_name').order('full_name');
      setUsers(profiles ?? []);
    }
  }

  async function loadLead() {
    setLoading(true);
    setErrorMsg(null);

    const { data, error } = await supabase
      .from('leads')
      .select(
        `
        id, name, phone, address, email, status, owner_id,
        lead_funnel ( funnel_id, funnels ( name ) ),
        owner:profiles!leads_owner_id_fkey ( full_name )
      `
      )
      .eq('id', leadId)
      .single();

    if (error) {
      setErrorMsg(error.message);
    } else {
      setLead(data);
    }
    setLoading(false);
  }

  async function handleSave(updates) {
    setSaving(true);
    setErrorMsg(null);

    const { error } = await supabase.from('leads').update(updates).eq('id', leadId);

    setSaving(false);
    if (error) {
      setErrorMsg(error.message);
    } else {
      await loadLead();
    }
  }

  async function handleReassign(newOwnerId) {
    setReassigning(true);
    setErrorMsg(null);

    const { error } = await supabase.from('leads').update({ owner_id: newOwnerId }).eq('id', leadId);

    setReassigning(false);
    if (error) {
      setErrorMsg(error.message);
    } else {
      await loadLead();
    }
  }

  async function handleArchive() {
    const confirmed = window.confirm('¿Archivar este lead?');
    if (!confirmed) return;

    const { error } = await supabase.from('leads').update({ status: 'archived' }).eq('id', leadId);
    if (error) {
      setErrorMsg(error.message);
    } else {
      router.push('/leads');
    }
  }

  if (loading) {
    return (
      <main style={{ padding: '1.5rem', maxWidth: 560, margin: '0 auto' }}>
        <p>Cargando…</p>
      </main>
    );
  }

  if (!lead) {
    return (
      <main style={{ padding: '1.5rem', maxWidth: 560, margin: '0 auto' }}>
        <p style={{ color: 'var(--color-danger)' }}>{errorMsg || 'Lead no encontrado.'}</p>
        <a href="/leads" className="btn btn-secondary" style={{ marginTop: '1rem', display: 'inline-flex' }}>
          Volver a Leads
        </a>
      </main>
    );
  }

  const rel = Array.isArray(lead.lead_funnel) ? lead.lead_funnel[0] : lead.lead_funnel;
  const owner = Array.isArray(lead.owner) ? lead.owner[0] : lead.owner;
  const canManage = isAdmin || isOwner;

  return (
    <main style={{ padding: '1.5rem', maxWidth: activeTab === 'llamadas' ? 960 : 560, margin: '0 auto', transition: 'max-width 0.15s ease' }}>
      <a href="/leads" style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
        ← Leads
      </a>
      <h1 style={{ fontSize: '1.25rem', margin: '0.5rem 0 0.75rem' }}>{lead.name}</h1>

      <div className="tabs-bar">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`tab-link${activeTab === t.key ? ' active' : ''}`}
            style={{ background: 'none', border: 'none', cursor: 'pointer' }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {errorMsg && <p style={{ color: 'var(--color-danger)', marginBottom: '1rem' }}>{errorMsg}</p>}

      {activeTab === 'informacion' ? (
        <>
          <div className="card" style={{ marginBottom: '1rem' }}>
            <p style={{ fontSize: '0.9rem', marginBottom: 4 }}>
              <strong>Embudo:</strong> {rel?.funnels?.name || 'Sin asignar'}
            </p>
            <p style={{ fontSize: '0.9rem', marginBottom: canManage ? 8 : 0 }}>
              <strong>Estado:</strong> {lead.status === 'archived' ? 'Archivado' : 'Activo'}
            </p>

            {canManage ? (
              <label style={{ display: 'block', marginTop: 8 }}>
                <span style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4 }}>
                  <strong>Propietario</strong>
                </span>
                <select
                  className="input"
                  value={lead.owner_id || ''}
                  onChange={(e) => handleReassign(e.target.value)}
                  disabled={reassigning}
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.full_name || u.id}</option>
                  ))}
                </select>
              </label>
            ) : (
              owner?.full_name && (
                <p style={{ fontSize: '0.9rem' }}>
                  <strong>Propietario:</strong> {owner.full_name}
                </p>
              )
            )}
          </div>

          <div className="card" style={{ marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Información del contacto</h2>
            {canManage ? (
              <LeadDetailForm lead={lead} onSave={handleSave} saving={saving} />
            ) : (
              <div style={{ display: 'grid', gap: '0.6rem' }}>
                <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: 4 }}>
                  Solo un administrador o el dueño de la plataforma puede editar estos datos.
                </p>
                <div>
                  <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Nombre</span>
                  <span>{lead.name}</span>
                </div>
                <div>
                  <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Teléfono</span>
                  <span>{lead.phone}</span>
                </div>
                <div>
                  <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Dirección</span>
                  <span>{lead.address || '—'}</span>
                </div>
                <div>
                  <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Correo</span>
                  <span>{lead.email || '—'}</span>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {lead.phone && (
              <button
                className="btn btn-secondary"
                onClick={() => setActiveCall({ name: lead.name, numero: lead.phone, leadId: lead.id })}
              >
                📞 Llamar
              </button>
            )}
            {lead.phone && (
              <a
                href={`https://wa.me/${lead.phone.replace(/\D/g, '')}`}
                target="_blank"
                rel="noreferrer"
                className="btn btn-secondary"
              >
                WhatsApp
              </a>
            )}
            {lead.status !== 'archived' && (
              <Button variant="danger" onClick={handleArchive}>
                Archivar
              </Button>
            )}
          </div>
        </>
      ) : (
        <LeadCallsTab lead={lead} onCall={setActiveCall} />
      )}

      {activeCall && (
        <CallInProgress
          call={activeCall}
          onClose={() => setActiveCall(null)}
          onSaveResult={async () => {
            // CallInProgress ya insertó la fila real en `calls` -- si el
            // usuario vuelve a abrir la pestaña Llamadas del lead, ya la
            // va a ver (LeadCallsTab la recarga al montar).
          }}
        />
      )}
    </main>
  );
}