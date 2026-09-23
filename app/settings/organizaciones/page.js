'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase/client';
import Button from '../../../components/ui/button';
import Input from '../../../components/ui/input';
import Modal from '../../../components/ui/modal';
import CardMenu from '../../../components/ui/cardMenu';
import DataTable from '../../../components/tables/dataTable';
import RequireOwner from '../../../components/ui/requireOwner';

export default function OrganizacionesPage() {
  return (
    <RequireOwner>
      <OrganizacionesPageContent />
    </RequireOwner>
  );
}

function OrganizacionesPageContent() {
  const [organizations, setOrganizations] = useState([]);
  const [userCounts, setUserCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  const [editingOrg, setEditingOrg] = useState(null); // null = cerrado, {} = crear, {id,...} = editar
  const [deletingOrg, setDeletingOrg] = useState(null);
  const [accessMsg, setAccessMsg] = useState(null);
  const [requestingAccessFor, setRequestingAccessFor] = useState(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setErrorMsg(null);

    const [{ data: orgsData, error: orgsError }, { data: profilesData }] = await Promise.all([
      supabase.from('organizations').select('id, name, created_at').order('name'),
      supabase.from('profiles').select('organization_id'),
    ]);

    if (orgsError) {
      setErrorMsg(orgsError.message);
    } else {
      setOrganizations(orgsData ?? []);
      const counts = {};
      (profilesData ?? []).forEach((p) => {
        if (p.organization_id) counts[p.organization_id] = (counts[p.organization_id] || 0) + 1;
      });
      setUserCounts(counts);
    }
    setLoading(false);
  }

  async function handleSave(form) {
    if (form.id) {
      // Renombrar una organización existente -- no toca administradores.
      const { error } = await supabase.from('organizations').update({ name: form.name.trim() }).eq('id', form.id);
      if (!error) {
        setEditingOrg(null);
        load();
      }
      return error;
    }

    // Nueva organización: se crea junto con su primer administrador en
    // un solo paso -- el owner nunca crea operadores sueltos, solo la
    // organización y quien la va a administrar de ahí en adelante.
    const { data: newOrg, error: orgError } = await supabase
      .from('organizations')
      .insert({ name: form.name.trim() })
      .select('id')
      .single();

    if (orgError) return orgError;

    const { data, error: fnError } = await supabase.functions.invoke('admin-create-user', {
      body: {
        full_name: form.admin_full_name.trim(),
        email: form.admin_email.trim(),
        role: 'admin',
        organization_id: newOrg.id,
      },
    });

    if (fnError || data?.error) {
      // La organización ya quedó creada aunque falle el administrador --
      // se puede invitar al admin después desde Usuarios, o borrar la
      // organización y reintentar. No se revierte solo para no ocultar
      // que la organización sí existe.
      return { message: (data?.error || fnError.message) + ' (la organización sí se creó, puedes invitar al administrador después desde Usuarios)' };
    }

    setEditingOrg(null);
    load();
    return null;
  }

  async function handleDelete(org) {
    const { error } = await supabase.from('organizations').delete().eq('id', org.id);
    if (!error) {
      setDeletingOrg(null);
      load();
    }
    return error;
  }

  // (Fase 3) Ya no se ven los leads/llamadas de una organización por
  // defecto -- hay que pedirlo explícitamente. Queda registrado en
  // audit_logs (motivo incluido) y da acceso de lectura por 4 horas.
  async function handleRequestAccess(org) {
    setRequestingAccessFor(org.id);
    setAccessMsg(null);
    const { error } = await supabase.rpc('request_org_data_access', {
      p_organization_id: org.id,
      p_motivo: null,
    });
    setRequestingAccessFor(null);
    if (error) {
      setAccessMsg({ type: 'error', text: `No se pudo pedir el acceso: ${error.message}` });
      return;
    }
    setAccessMsg({
      type: 'ok',
      text: `Acceso a los leads y llamadas de "${org.name}" concedido por 4 horas. Ya puedes verlos en Leads y Llamadas.`,
    });
  }

  const columns = [
    { key: 'nombre', label: 'Nombre', render: (o) => <span style={{ fontWeight: 600 }}>{o.name}</span> },
    { key: 'usuarios', label: 'Usuarios', render: (o) => userCounts[o.id] || 0 },
    {
      key: 'creada',
      label: 'Creada',
      render: (o) => new Date(o.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    },
    {
      key: 'acciones',
      label: '',
      render: (o) => (
        <CardMenu
          items={[
            {
              label: requestingAccessFor === o.id ? 'Pidiendo acceso…' : 'Ver datos (4h)',
              onClick: () => handleRequestAccess(o),
            },
            { label: 'Renombrar', onClick: () => setEditingOrg(o) },
            { label: 'Eliminar', onClick: () => setDeletingOrg(o), danger: true },
          ]}
        />
      ),
    },
  ];

  return (
    <main style={{ padding: '28px 32px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ fontSize: '1.9rem', fontWeight: 750, letterSpacing: '-0.02em' }}>Organizaciones</h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
            Cada cliente de la plataforma es una organización — sus usuarios y leads quedan aislados entre sí.
            Ya no ves sus leads ni llamadas por defecto: pide acceso desde el menú de cada fila (queda registrado
            y dura 4 horas).
          </p>
        </div>
        <Button onClick={() => setEditingOrg({})}>+ Nueva organización</Button>
      </div>

      {errorMsg && <p style={{ color: 'var(--color-danger)', marginBottom: '1rem' }}>{errorMsg}</p>}
      {accessMsg && (
        <p style={{ color: accessMsg.type === 'error' ? 'var(--color-danger)' : 'var(--color-status-custom-text)', marginBottom: '1rem', fontSize: '0.85rem' }}>
          {accessMsg.text}
        </p>
      )}

      {loading ? (
        <p>Cargando…</p>
      ) : (
        <DataTable columns={columns} rows={organizations} emptyMessage="Todavía no hay organizaciones. Crea la primera con “+ Nueva organización”." />
      )}

      <p style={{ fontSize: '0.8rem', color: 'var(--color-text-tertiary)', marginTop: '1rem' }}>
        Para mover a alguien de una organización a otra, edítalo desde{' '}
        <a href="/settings/usuarios" style={{ color: 'var(--color-primary)' }}>Configuración → Usuarios</a>.
      </p>

      <OrgModal org={editingOrg} onClose={() => setEditingOrg(null)} onSave={handleSave} />

      <ConfirmDeleteModal
        org={deletingOrg}
        usageCount={deletingOrg ? userCounts[deletingOrg.id] || 0 : 0}
        onClose={() => setDeletingOrg(null)}
        onConfirm={handleDelete}
      />
    </main>
  );
}

function OrgModal({ org, onClose, onSave }) {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (org) {
      setForm({ id: org.id || null, name: org.name || '', admin_full_name: '', admin_email: '' });
      setError(null);
    } else {
      setForm(null);
    }
  }, [org]);

  if (!org || !form) return null;

  const isNew = !form.id;

  async function handleSave() {
    if (!form.name.trim()) {
      setError('El nombre es obligatorio.');
      return;
    }
    if (isNew && (!form.admin_full_name.trim() || !form.admin_email.trim())) {
      setError('El nombre y el correo del administrador son obligatorios.');
      return;
    }
    setSaving(true);
    const err = await onSave(form);
    setSaving(false);
    if (err) setError(err.message);
  }

  return (
    <Modal open={!!org} onClose={onClose} title={isNew ? 'Nueva organización' : 'Renombrar organización'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <Input
          label="Nombre de la organización"
          placeholder="Ej. Astra Insurance Agency LLC"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />

        {isNew && (
          <>
            <p style={{ fontSize: '0.78rem', color: 'var(--color-text-tertiary)', marginTop: 4 }}>
              Toda organización nace con su primer administrador — de ahí en adelante, es él quien crea a sus propios usuarios.
            </p>
            <Input
              label="Nombre del administrador"
              placeholder="Ej. Andreina García"
              value={form.admin_full_name}
              onChange={(e) => setForm({ ...form, admin_full_name: e.target.value })}
            />
            <Input
              label="Correo del administrador"
              type="email"
              placeholder="admin@empresa.com"
              value={form.admin_email}
              onChange={(e) => setForm({ ...form, admin_email: e.target.value })}
            />
            <p style={{ fontSize: '0.78rem', color: 'var(--color-text-tertiary)' }}>
              Se le envía un correo de invitación para que defina su propia contraseña.
            </p>
          </>
        )}

        {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem' }}>{error}</p>}
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: 4 }}>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Creando…' : isNew ? 'Crear organización' : 'Guardar'}</Button>
        </div>
      </div>
    </Modal>
  );
}

function ConfirmDeleteModal({ org, usageCount, onClose, onConfirm }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  if (!org) return null;

  async function handleConfirm() {
    setDeleting(true);
    const err = await onConfirm(org);
    setDeleting(false);
    if (err) setError(err.message);
  }

  return (
    <Modal open={!!org} onClose={onClose} title="Eliminar organización">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <p style={{ fontSize: '0.9rem' }}>
          ¿Eliminar <strong>{org.name}</strong>?
        </p>
        {usageCount > 0 && (
          <p style={{ fontSize: '0.85rem', color: 'var(--color-danger)' }}>
            Tiene {usageCount} usuario{usageCount === 1 ? '' : 's'} asignado{usageCount === 1 ? '' : 's'} — Postgres va a rechazar el borrado hasta que los muevas a otra organización o los elimines. No se pierden datos por accidente.
          </p>
        )}
        {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem' }}>{error}</p>}
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: 4 }}>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="danger" onClick={handleConfirm} disabled={deleting}>{deleting ? 'Eliminando…' : 'Eliminar'}</Button>
        </div>
      </div>
    </Modal>
  );
}