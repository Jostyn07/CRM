'use client';

import { useEffect, useState, Fragment } from 'react';
import { supabase } from '../../../lib/supabase/client';
import Button from '../../../components/ui/button';
import Input from '../../../components/ui/input';
import Modal from '../../../components/ui/modal';
import CardMenu from '../../../components/ui/cardMenu';
import DataTable from '../../../components/tables/dataTable';

const TABS = [
  { href: '/settings/usuarios', label: 'Usuarios' },
  { href: '/settings/numeros', label: 'Números' },
  { href: '/settings/plantillas', label: 'Plantillas de permisos' },
  { href: '/settings/organizacion', label: 'Organización' },
  { href: '/settings/actividad', label: 'Registro de actividad' },
];

const CATEGORY_ORDER = ['leads', 'llamadas', 'comunicacion', 'usuarios'];
const CATEGORY_LABEL = {
  leads: 'Leads',
  llamadas: 'Llamadas',
  comunicacion: 'Comunicación',
  usuarios: 'Usuarios',
};

function sortPermissions(list) {
  return [...list].sort((a, b) => {
    const catDiff = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
    return catDiff !== 0 ? catDiff : a.key.localeCompare(b.key);
  });
}

export default function PlantillasPage() {
  const [templates, setTemplates] = useState([]);
  const [usageByTemplate, setUsageByTemplate] = useState({});
  const [permissions, setPermissions] = useState([]);
  const [grantedSet, setGrantedSet] = useState(new Set()); // `${template_id}:${permission_key}`
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  const [editingTemplate, setEditingTemplate] = useState(null); // null = cerrado, {} = crear, {id,...} = editar
  const [deletingTemplate, setDeletingTemplate] = useState(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setErrorMsg(null);

    const [
      { data: templatesData, error: templatesError },
      { data: profilesData },
      { data: permissionsData },
      { data: templatePermsData },
    ] = await Promise.all([
      supabase.from('call_permission_templates').select('id, nombre, llamadas_habilitadas, created_at').order('nombre'),
      supabase.from('profiles').select('plantilla_id'),
      supabase.from('permissions').select('key, category, label'),
      supabase.from('template_permissions').select('template_id, permission_key'),
    ]);

    if (templatesError) {
      setErrorMsg(templatesError.message);
    } else {
      setTemplates(templatesData ?? []);
      // Cuántos usuarios tiene asignada cada plantilla — calculado en el
      // cliente, igual que los stats de Usuarios (son pocas filas).
      const counts = {};
      (profilesData ?? []).forEach((p) => {
        if (p.plantilla_id) counts[p.plantilla_id] = (counts[p.plantilla_id] || 0) + 1;
      });
      setUsageByTemplate(counts);

      setPermissions(sortPermissions(permissionsData ?? []));
      setGrantedSet(new Set((templatePermsData ?? []).map((tp) => `${tp.template_id}:${tp.permission_key}`)));
    }
    setLoading(false);
  }

  async function togglePermission(templateId, permissionKey, checked) {
    const cellKey = `${templateId}:${permissionKey}`;

    // Optimista: se ve el cambio de inmediato, se revierte si falla.
    setGrantedSet((prev) => {
      const next = new Set(prev);
      if (checked) next.add(cellKey);
      else next.delete(cellKey);
      return next;
    });

    const { error } = checked
      ? await supabase.from('template_permissions').insert({ template_id: templateId, permission_key: permissionKey })
      : await supabase.from('template_permissions').delete().eq('template_id', templateId).eq('permission_key', permissionKey);

    if (error) {
      setErrorMsg(error.message);
      setGrantedSet((prev) => {
        const next = new Set(prev);
        if (checked) next.delete(cellKey);
        else next.add(cellKey);
        return next;
      });
      return;
    }

    // Compatibilidad hacia atrás: llamadas_habilitadas (el booleano
    // viejo) todavía lo lee la columna "Llamadas" de esta misma tabla
    // y la pantalla de Usuarios -- se mantiene sincronizado para que
    // no muestren algo distinto de lo que la plantilla ahora otorga.
    if (permissionKey === 'llamadas.realizar') {
      await supabase.from('call_permission_templates').update({ llamadas_habilitadas: checked }).eq('id', templateId);
      setTemplates((prev) => prev.map((t) => (t.id === templateId ? { ...t, llamadas_habilitadas: checked } : t)));
    }
  }

  async function handleSave(form) {
    const payload = { nombre: form.nombre.trim(), llamadas_habilitadas: form.llamadas_habilitadas };

    const { error } = form.id
      ? await supabase.from('call_permission_templates').update(payload).eq('id', form.id)
      : await supabase.from('call_permission_templates').insert(payload);

    if (!error) {
      setEditingTemplate(null);
      load();
    }
    return error;
  }

  async function handleDelete(template) {
    const { error } = await supabase.from('call_permission_templates').delete().eq('id', template.id);
    if (!error) {
      setDeletingTemplate(null);
      load();
    }
    return error;
  }

  const columns = [
    { key: 'nombre', label: 'Nombre', render: (t) => <span style={{ fontWeight: 600 }}>{t.nombre}</span> },
    {
      key: 'llamadas',
      label: 'Llamadas',
      render: (t) => (
        <span
          className="status-pill"
          style={
            t.llamadas_habilitadas
              ? { background: 'var(--color-status-custom-bg)', color: 'var(--color-status-custom-text)', borderColor: 'var(--color-status-custom-border)' }
              : { background: 'var(--color-status-error-bg)', color: 'var(--color-status-error-text)', borderColor: 'var(--color-status-error-border)' }
          }
        >
          {t.llamadas_habilitadas ? 'Sí' : 'No'}
        </span>
      ),
    },
    {
      key: 'usuarios',
      label: 'Usuarios asignados',
      render: (t) => usageByTemplate[t.id] || 0,
    },
    {
      key: 'acciones',
      label: '',
      render: (t) => (
        <CardMenu
          items={[
            { label: 'Editar plantilla', onClick: () => setEditingTemplate(t) },
            { label: 'Eliminar plantilla', onClick: () => setDeletingTemplate(t), danger: true },
          ]}
        />
      ),
    },
  ];

  return (
    <main style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ fontSize: '1.9rem', fontWeight: 750, letterSpacing: '-0.02em' }}>Plantillas de permisos</h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
            Grupos reutilizables de permisos — crea o edita el nombre aquí, y ajusta qué otorga cada una en la matriz de abajo.
          </p>
        </div>
        <Button onClick={() => setEditingTemplate({})}>+ Nueva plantilla</Button>
      </div>

      <div className="tabs-bar">
        {TABS.map((t) => (
          <a key={t.href} href={t.href} className={`tab-link${t.href === '/settings/plantillas' ? ' active' : ''}`}>
            {t.label}
          </a>
        ))}
      </div>

      {errorMsg && <p style={{ color: 'var(--color-danger)', marginBottom: '1rem' }}>{errorMsg}</p>}

      {loading ? (
        <p>Cargando…</p>
      ) : (
        <>
          <DataTable columns={columns} rows={templates} emptyMessage="Todavía no hay plantillas. Crea la primera con “+ Nueva plantilla”." />

          {templates.length > 0 && (
            <PermissionsMatrix
              templates={templates}
              permissions={permissions}
              grantedSet={grantedSet}
              onToggle={togglePermission}
            />
          )}
        </>
      )}

      <TemplateModal template={editingTemplate} onClose={() => setEditingTemplate(null)} onSave={handleSave} />

      <ConfirmDeleteModal
        template={deletingTemplate}
        usageCount={deletingTemplate ? usageByTemplate[deletingTemplate.id] || 0 : 0}
        onClose={() => setDeletingTemplate(null)}
        onConfirm={handleDelete}
      />
    </main>
  );
}

function TemplateModal({ template, onClose, onSave }) {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (template) {
      setForm({
        id: template.id || null,
        nombre: template.nombre || '',
        llamadas_habilitadas: template.llamadas_habilitadas ?? true,
      });
      setError(null);
    } else {
      setForm(null);
    }
  }, [template]);

  if (!template || !form) return null;

  async function handleSave() {
    if (!form.nombre.trim()) {
      setError('El nombre es obligatorio.');
      return;
    }
    setSaving(true);
    const err = await onSave(form);
    setSaving(false);
    if (err) setError(err.message);
  }

  return (
    <Modal open={!!template} onClose={onClose} title={form.id ? 'Editar plantilla' : 'Nueva plantilla'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <Input
          label="Nombre"
          placeholder="Ej. Agente estándar"
          value={form.nombre}
          onChange={(e) => setForm({ ...form, nombre: e.target.value })}
        />

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.88rem' }}>
          <input
            type="checkbox"
            checked={form.llamadas_habilitadas}
            onChange={(e) => setForm({ ...form, llamadas_habilitadas: e.target.checked })}
          />
          Llamadas habilitadas
        </label>

        {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem' }}>{error}</p>}

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: 4 }}>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button>
        </div>
      </div>
    </Modal>
  );
}

function PermissionsMatrix({ templates, permissions, grantedSet, onToggle }) {
  let lastCategory = null;

  return (
    <div className="card" style={{ marginTop: '1.25rem', overflowX: 'auto' }}>
      <h2 style={{ fontSize: '1rem', marginBottom: '0.25rem' }}>Matriz de permisos</h2>
      <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
        Cada casilla se guarda al tocarla — no hace falta un botón aparte de "Guardar".
      </p>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--color-border)' }}>Permiso</th>
            {templates.map((t) => (
              <th key={t.id} style={{ textAlign: 'center', padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--color-border)', whiteSpace: 'nowrap' }}>
                {t.nombre}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {permissions.map((perm) => {
            const showCategoryHeader = perm.category !== lastCategory;
            lastCategory = perm.category;
            return (
              <Fragment key={perm.key}>
                {showCategoryHeader && (
                  <tr key={`cat-${perm.category}`}>
                    <td
                      colSpan={templates.length + 1}
                      style={{
                        padding: '0.6rem 0.75rem 0.3rem',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.03em',
                        color: 'var(--color-text-tertiary)',
                      }}
                    >
                      {CATEGORY_LABEL[perm.category] || perm.category}
                    </td>
                  </tr>
                )}
                <tr key={perm.key}>
                  <td style={{ padding: '0.4rem 0.75rem', borderBottom: '1px solid var(--color-border)' }}>{perm.label}</td>
                  {templates.map((t) => {
                    const checked = grantedSet.has(`${t.id}:${perm.key}`);
                    return (
                      <td key={t.id} style={{ textAlign: 'center', padding: '0.4rem 0.75rem', borderBottom: '1px solid var(--color-border)' }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => onToggle(t.id, perm.key, e.target.checked)}
                        />
                      </td>
                    );
                  })}
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ConfirmDeleteModal({ template, usageCount, onClose, onConfirm }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  if (!template) return null;

  async function handleConfirm() {
    setDeleting(true);
    const err = await onConfirm(template);
    setDeleting(false);
    if (err) setError(err.message);
  }

  return (
    <Modal open={!!template} onClose={onClose} title="Eliminar plantilla">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <p style={{ fontSize: '0.9rem' }}>
          ¿Eliminar <strong>{template.nombre}</strong>?
        </p>
        {usageCount > 0 && (
          <p style={{ fontSize: '0.85rem', color: 'var(--color-status-default-text)' }}>
            {usageCount} usuario{usageCount === 1 ? '' : 's'} tiene{usageCount === 1 ? '' : 'n'} esta plantilla asignada — quedará{usageCount === 1 ? '' : 'n'} sin plantilla, no se les quita el permiso de llamadas que ya tengan.
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