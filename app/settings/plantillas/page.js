'use client';
// Ruta: app/settings/plantillas/page.js
// Roles y permisos: cada rol otorga permisos con un alcance
// (Propio / Sucursal / Organización). Reemplaza las "plantillas" viejas.
// La base de datos impide dar más alcance del que tiene quien edita.

import { useCallback, useEffect, useMemo, useState } from 'react';
import RequirePermission from '../../../components/ui/requirePermission';
import Modal from '../../../components/ui/modal';
import { SettingsHeader, errorText } from '../../../components/settings/settingsTabs';
import { supabase } from '../../../lib/supabase/client';
import { trackEvent } from '../../../lib/activity/tracker';

const SCOPES = [
  ['', 'Sin acceso'],
  ['own', 'Propio'],
  ['branch', 'Sucursal'],
  ['organization', 'Organización'],
];
const MODULE_LABEL = { leads: 'Leads', users: 'Usuarios', roles: 'Roles', branches: 'Sucursales', settings: 'Configuración', audit: 'Auditoría' };

export default function RolesPage() {
  return (
    <RequirePermission perm="roles.manage">
      <Roles />
    </RequirePermission>
  );
}

function slugKey(name) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

function Roles() {
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [grants, setGrants] = useState([]); // role_permissions
  const [counts, setCounts] = useState({});
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    const [r, p, rp, ur] = await Promise.all([
      supabase.from('roles').select('*').order('is_system', { ascending: false }).order('name'),
      supabase.from('permissions').select('*').order('key'),
      supabase.from('role_permissions').select('role_id, permission_key, scope'),
      supabase.from('user_roles').select('role_id'),
    ]);
    const err = [r, p, rp, ur].find((x) => x.error)?.error;
    if (err) return setMsg(await errorText(err));
    setRoles(r.data);
    setPermissions(p.data);
    setGrants(rp.data);
    setCounts(ur.data.reduce((a, x) => ((a[x.role_id] = (a[x.role_id] ?? 0) + 1), a), {}));
    setSelectedId((id) => id ?? r.data[0]?.id ?? null);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selected = roles.find((r) => r.id === selectedId);
  // El rol de administrador de organización no se edita: evita que alguien se quite el acceso
  const locked = selected?.key === 'organization_admin';

  const current = useMemo(
    () => Object.fromEntries(grants.filter((g) => g.role_id === selectedId).map((g) => [g.permission_key, g.scope])),
    [grants, selectedId]
  );

  useEffect(() => {
    setDraft(current);
    setMsg(null);
  }, [current]);

  const modules = useMemo(() => {
    const m = {};
    for (const p of permissions) (m[p.module] ||= []).push(p);
    return m;
  }, [permissions]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(current);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const keys = new Set([...Object.keys(current), ...Object.keys(draft)]);
      for (const key of keys) {
        const a = current[key];
        const b = draft[key];
        if (a === b) continue;
        let res;
        if (!b) res = await supabase.from('role_permissions').delete().eq('role_id', selectedId).eq('permission_key', key);
        else if (!a) res = await supabase.from('role_permissions').insert({ role_id: selectedId, permission_key: key, scope: b });
        else res = await supabase.from('role_permissions').update({ scope: b }).eq('role_id', selectedId).eq('permission_key', key);
        if (res.error) throw Object.assign(res.error, { permKey: key });
      }
      trackEvent('role.permissions_saved', { entityType: 'roles', entityId: selectedId });
      setMsg('Cambios guardados.');
      await load();
    } catch (e) {
      const txt = await errorText(e);
      setMsg(e.permKey ? `${e.permKey}: ${txt === 'No tienes permiso para esta acción.' ? 'no puedes dar más alcance del que tienes' : txt}` : txt);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function removeRole() {
    if (!selected || selected.is_system) return;
    if (counts[selected.id]) return setMsg('No puedes eliminar un rol que tiene usuarios asignados.');
    if (!confirm(`¿Eliminar el rol "${selected.name}"?`)) return;
    const { error } = await supabase.from('roles').delete().eq('id', selected.id);
    if (error) return setMsg(await errorText(error));
    setSelectedId(null);
    load();
  }

  return (
    <main style={{ padding: '1.5rem', maxWidth: 1200 }}>
      <SettingsHeader
        title="Roles y permisos"
        subtitle="Cada rol otorga permisos con un alcance: Propio (solo lo suyo), Sucursal (sus sucursales) u Organización (todo)."
        action={
          <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
            + Nuevo rol
          </button>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) 1fr', gap: '1rem', alignItems: 'start' }}>
        <div className="card" style={{ padding: '0.4rem' }}>
          {roles.map((r) => (
            <button
              key={r.id}
              onClick={() => setSelectedId(r.id)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '0.55rem 0.7rem',
                borderRadius: 'var(--radius)',
                border: 'none',
                background: r.id === selectedId ? 'var(--color-active-bg)' : 'transparent',
                color: 'var(--color-text)',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{r.name}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                {r.is_system ? 'De sistema · ' : ''}
                {counts[r.id] ?? 0} usuario(s)
              </div>
            </button>
          ))}
        </div>

        {selected && (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: '0.8rem' }}>
              <div>
                <h2 style={{ fontSize: '1.05rem' }}>{selected.name}</h2>
                {locked && (
                  <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                    Este rol siempre tiene todos los permisos, para que la organización nunca se quede sin administrador.
                  </p>
                )}
              </div>
              {!selected.is_system && (
                <button className="btn btn-secondary" style={{ color: 'var(--color-danger)' }} onClick={removeRole}>
                  Eliminar rol
                </button>
              )}
            </div>

            {Object.entries(modules).map(([mod, perms]) => (
              <div key={mod} style={{ marginBottom: '0.8rem' }}>
                <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 4 }}>{MODULE_LABEL[mod] ?? mod}</div>
                {perms.map((p) => (
                  <div key={p.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '0.3rem 0', borderBottom: '1px solid var(--color-border)', fontSize: '0.86rem' }}>
                    <span>{p.description}</span>
                    <select
                      className="input"
                      style={{ width: 170, height: 32 }}
                      disabled={locked}
                      value={draft[p.key] ?? ''}
                      onChange={(e) =>
                        setDraft((d) => {
                          const n = { ...d };
                          if (e.target.value) n[p.key] = e.target.value;
                          else delete n[p.key];
                          return n;
                        })
                      }
                    >
                      {SCOPES.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            ))}

            {msg && <p style={{ fontSize: '0.85rem', marginBottom: '0.6rem' }}>{msg}</p>}
            {!locked && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button className="btn btn-secondary" disabled={!dirty || saving} onClick={() => setDraft(current)}>
                  Descartar
                </button>
                <button className="btn btn-primary" disabled={!dirty || saving} onClick={save}>
                  {saving ? 'Guardando…' : 'Guardar cambios'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Nuevo rol">
        <CreateRole
          onDone={async (id) => {
            setCreateOpen(false);
            await load();
            setSelectedId(id);
          }}
        />
      </Modal>
    </main>
  );
}

function CreateRole({ onDone }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    const key = slugKey(name);
    if (!key) return setError('Escribe un nombre.');
    const { data, error: err } = await supabase.from('roles').insert({ name: name.trim(), key, description: description || null }).select('id').single();
    if (err) return setError(await errorText(err));
    trackEvent('role.created', { entityType: 'roles', entityId: data.id });
    onDone(data.id);
  }

  return (
    <form onSubmit={submit}>
      <label style={{ display: 'block', marginBottom: '0.7rem' }}>
        <span style={{ fontSize: '0.85rem' }}>Nombre</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Ej. Coordinador de llamadas" />
      </label>
      <label style={{ display: 'block', marginBottom: '0.7rem' }}>
        <span style={{ fontSize: '0.85rem' }}>Descripción</span>
        <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.7rem' }}>Se crea sin permisos; luego los asignas en la matriz.</p>
      {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem', marginBottom: '0.6rem' }}>{error}</p>}
      <button className="btn btn-primary" style={{ width: '100%' }}>
        Crear rol
      </button>
    </form>
  );
}
