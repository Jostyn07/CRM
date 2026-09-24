'use client';
// Ruta: app/settings/usuarios/page.js
// Usuarios de la organización: lista, invitación (Edge Function
// invite-user), estado, rol, sucursales, permisos individuales y
// enlace para restablecer contraseña. Todo lo valida la base de datos.

import { useCallback, useEffect, useMemo, useState } from 'react';
import RequirePermission from '../../../components/ui/requirePermission';
import Modal from '../../../components/ui/modal';
import { SettingsHeader, bodyRow, cell, errorText, headRow } from '../../../components/settings/settingsTabs';
import { supabase } from '../../../lib/supabase/client';
import { useSession } from '../../../lib/auth/sessionContext';
import { trackEvent } from '../../../lib/activity/tracker';

const STATUS = {
  active: { label: 'Activo', color: '#22c55e' },
  invited: { label: 'Invitado', color: '#f59e0b' },
  inactive: { label: 'Inactivo', color: '#9ca3af' },
  suspended: { label: 'Suspendido', color: '#ef4444' },
};
const SCOPE_LABEL = { own: 'Propio', branch: 'Sucursal', organization: 'Organización' };

export default function UsersPage() {
  return (
    <RequirePermission perm="users.view">
      <Users />
    </RequirePermission>
  );
}

async function loadAll() {
  const [p, ub, ur, r, b, perms, up] = await Promise.all([
    supabase.from('profiles').select('id, full_name, email, phone, status, created_at').order('full_name'),
    supabase.from('user_branches').select('user_id, branch_id, is_primary'),
    supabase.from('user_roles').select('user_id, role_id'),
    supabase.from('roles').select('id, key, name, is_system').order('name'),
    supabase.from('branches').select('id, name, status').order('name'),
    supabase.from('permissions').select('key, module, description').order('key'),
    supabase.from('user_permissions').select('user_id, permission_key, effect, scope'),
  ]);
  const err = [p, ub, ur, r, b, perms].find((x) => x.error)?.error;
  if (err) throw err;

  const byUser = (rows, key = 'user_id') => rows.reduce((acc, x) => ((acc[x[key]] ||= []).push(x), acc), {});
  const branchesOf = byUser(ub.data);
  const rolesOf = byUser(ur.data);
  const overridesOf = byUser(up.data ?? []);

  return {
    users: p.data.map((u) => ({
      ...u,
      name: u.full_name || u.email,
      branchIds: (branchesOf[u.id] ?? []).sort((a, b) => b.is_primary - a.is_primary).map((x) => x.branch_id),
      roleIds: (rolesOf[u.id] ?? []).map((x) => x.role_id),
      overrides: overridesOf[u.id] ?? [],
    })),
    roles: r.data,
    branches: b.data,
    permissions: perms.data,
  };
}

function Users() {
  const { can, user: me, activeBranchId } = useSession();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [fRole, setFRole] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fBranch, setFBranch] = useState(activeBranchId || '');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const reload = useCallback(async () => {
    try {
      setData(await loadAll());
      setError(null);
    } catch (e) {
      setError(await errorText(e));
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const rows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.users.filter(
      (u) =>
        (!q || `${u.full_name ?? ''} ${u.email ?? ''}`.toLowerCase().includes(q)) &&
        (!fRole || u.roleIds.includes(fRole)) &&
        (!fStatus || u.status === fStatus) &&
        (!fBranch || u.branchIds.includes(fBranch))
    );
  }, [data, search, fRole, fStatus, fBranch]);

  const stats = useMemo(() => {
    const u = data?.users ?? [];
    return [
      ['Usuarios', u.length],
      ['Activos', u.filter((x) => x.status === 'active').length],
      ['Invitados', u.filter((x) => x.status === 'invited').length],
      ['Inactivos o suspendidos', u.filter((x) => x.status === 'inactive' || x.status === 'suspended').length],
    ];
  }, [data]);

  const roleName = (id) => data?.roles.find((r) => r.id === id)?.name ?? '—';
  const branchName = (id) => data?.branches.find((b) => b.id === id)?.name ?? '—';

  return (
    <main style={{ padding: '1.5rem', maxWidth: 1200 }}>
      <SettingsHeader
        title="Usuarios"
        subtitle="Invita a tu equipo y define su rol, sus sucursales y sus permisos."
        action={
          can('users.manage') && (
            <button className="btn btn-primary" onClick={() => setInviteOpen(true)}>
              + Invitar usuario
            </button>
          )
        }
      />
      {error && <p style={{ color: 'var(--color-danger)', marginBottom: '0.8rem' }}>{error}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: '1rem' }}>
        {stats.map(([label, n]) => (
          <div key={label} className="card" style={{ padding: '0.7rem 1rem' }}>
            <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>{n}</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: '0.8rem' }}>
        <input className="input" style={{ flex: '1 1 240px' }} placeholder="Buscar por nombre o correo…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="input" style={{ width: 200 }} value={fRole} onChange={(e) => setFRole(e.target.value)}>
          <option value="">Todos los roles</option>
          {data?.roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <select className="input" style={{ width: 170 }} value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
          <option value="">Todos los estados</option>
          {Object.entries(STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        <select className="input" style={{ width: 180 }} value={fBranch} onChange={(e) => setFBranch(e.target.value)}>
          <option value="">Todas las sucursales</option>
          {data?.branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
          <thead>
            <tr style={headRow}>
              <th style={cell}>Nombre</th>
              <th style={cell}>Rol</th>
              <th style={cell}>Sucursales</th>
              <th style={cell}>Permisos individuales</th>
              <th style={cell}>Estado</th>
              <th style={cell} />
            </tr>
          </thead>
          <tbody>
            {!data && (
              <tr>
                <td colSpan={6} style={{ ...cell, textAlign: 'center', padding: '1.5rem' }}>
                  Cargando…
                </td>
              </tr>
            )}
            {data && rows.length === 0 && (
              <tr>
                <td colSpan={6} style={{ ...cell, textAlign: 'center', padding: '1.5rem', color: 'var(--color-text-muted)' }}>
                  No hay usuarios que coincidan.
                </td>
              </tr>
            )}
            {rows.map((u) => (
              <tr key={u.id} style={bodyRow}>
                <td style={cell}>
                  <div style={{ fontWeight: 600 }}>
                    {u.name}
                    {u.id === me?.id && <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}> (tú)</span>}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>{u.email}</div>
                </td>
                <td style={cell}>{u.roleIds.map(roleName).join(', ') || '—'}</td>
                <td style={cell}>{u.branchIds.map(branchName).join(', ') || '—'}</td>
                <td style={cell}>{u.overrides.length ? `${u.overrides.length} excepción(es)` : '—'}</td>
                <td style={cell}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS[u.status]?.color }} />
                    {STATUS[u.status]?.label ?? u.status}
                  </span>
                </td>
                <td style={{ ...cell, textAlign: 'right' }}>
                  {can('users.manage') && u.id !== me?.id && (
                    <button className="btn btn-secondary" onClick={() => setEditing(u)}>
                      Editar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="Invitar usuario" width={520}>
        {data && (
          <InviteForm
            data={data}
            onDone={() => {
              setInviteOpen(false);
              reload();
            }}
          />
        )}
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing ? `Editar: ${editing.name}` : ''} width={760}>
        {editing && data && (
          <EditUser
            user={editing}
            data={data}
            onClose={() => setEditing(null)}
            onSaved={async () => {
              setEditing(null);
              await reload();
            }}
          />
        )}
      </Modal>
    </main>
  );
}

// ------------------------------------------------------------------
function BranchChecklist({ branches, value, onChange, allowed }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
      {branches
        .filter((b) => b.status === 'active')
        .map((b) => (
          <label key={b.id} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.86rem', opacity: allowed(b.id) ? 1 : 0.5 }}>
            <input
              type="checkbox"
              disabled={!allowed(b.id)}
              checked={value.includes(b.id)}
              onChange={(e) => onChange(e.target.checked ? [...value, b.id] : value.filter((x) => x !== b.id))}
            />
            {b.name}
          </label>
        ))}
    </div>
  );
}

function useBranchAllowed() {
  const { scopeOf, branches: mine } = useSession();
  const orgScope = scopeOf('users.manage') === 'organization';
  return (id) => orgScope || mine.some((b) => b.id === id);
}

function InviteForm({ data, onDone }) {
  const allowed = useBranchAllowed();
  const [v, setV] = useState({ full_name: '', email: '', role_key: 'operator', branch_ids: [] });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    if (!v.branch_ids.length) return setError('Selecciona al menos una sucursal.');
    setSaving(true);
    const { error: fnErr } = await supabase.functions.invoke('invite-user', { body: v });
    setSaving(false);
    if (fnErr) return setError(await errorText(fnErr, 'No se pudo enviar la invitación.'));
    trackEvent('user.invite_sent', { metadata: { role_key: v.role_key, branches: v.branch_ids.length } });
    onDone();
  }

  return (
    <form onSubmit={submit}>
      <label style={{ display: 'block', marginBottom: '0.7rem' }}>
        <span style={{ fontSize: '0.85rem' }}>Nombre completo</span>
        <input className="input" required value={v.full_name} onChange={(e) => setV({ ...v, full_name: e.target.value })} />
      </label>
      <label style={{ display: 'block', marginBottom: '0.7rem' }}>
        <span style={{ fontSize: '0.85rem' }}>Correo</span>
        <input className="input" type="email" required value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
      </label>
      <label style={{ display: 'block', marginBottom: '0.7rem' }}>
        <span style={{ fontSize: '0.85rem' }}>Rol</span>
        <select className="input" value={v.role_key} onChange={(e) => setV({ ...v, role_key: e.target.value })}>
          {data.roles.map((r) => (
            <option key={r.id} value={r.key}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      <div style={{ marginBottom: '0.9rem' }}>
        <span style={{ display: 'block', fontSize: '0.85rem', marginBottom: 6 }}>Sucursales</span>
        <BranchChecklist branches={data.branches} value={v.branch_ids} onChange={(ids) => setV({ ...v, branch_ids: ids })} allowed={allowed} />
      </div>
      <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.8rem' }}>
        Le llegará un correo para crear su contraseña. Solo puedes asignar roles con igual o menor alcance que el tuyo.
      </p>
      {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem', marginBottom: '0.7rem' }}>{error}</p>}
      <button className="btn btn-primary" disabled={saving} style={{ width: '100%' }}>
        {saving ? 'Enviando…' : 'Enviar invitación'}
      </button>
    </form>
  );
}

// ------------------------------------------------------------------
function EditUser({ user, data, onClose, onSaved }) {
  const allowed = useBranchAllowed();
  const [status, setStatus] = useState(user.status);
  const [roleId, setRoleId] = useState(user.roleIds[0] ?? '');
  const [branchIds, setBranchIds] = useState(user.branchIds);
  const [overrides, setOverrides] = useState(() => Object.fromEntries(user.overrides.map((o) => [o.permission_key, o])));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);

  const modules = useMemo(() => {
    const m = {};
    for (const p of data.permissions) (m[p.module] ||= []).push(p);
    return m;
  }, [data.permissions]);

  function setOverride(key, value) {
    setOverrides((o) => {
      const next = { ...o };
      if (value === '') delete next[key];
      else if (value === 'deny') next[key] = { permission_key: key, effect: 'deny', scope: null };
      else next[key] = { permission_key: key, effect: 'allow', scope: value };
      return next;
    });
  }

  async function save() {
    setError(null);
    if (!branchIds.length) return setError('El usuario debe tener al menos una sucursal.');
    setSaving(true);
    try {
      // Estado
      if (status !== user.status) {
        const { error: e } = await supabase.from('profiles').update({ status }).eq('id', user.id);
        if (e) throw e;
      }
      // Rol (uno por usuario en esta pantalla)
      if (roleId && !(user.roleIds.length === 1 && user.roleIds[0] === roleId)) {
        const { error: e1 } = await supabase.from('user_roles').insert({ user_id: user.id, role_id: roleId });
        if (e1 && e1.code !== '23505') throw e1;
        const old = user.roleIds.filter((r) => r !== roleId);
        if (old.length) {
          const { error: e2 } = await supabase.from('user_roles').delete().eq('user_id', user.id).in('role_id', old);
          if (e2) throw e2;
        }
      }
      // Sucursales
      const add = branchIds.filter((b) => !user.branchIds.includes(b));
      const remove = user.branchIds.filter((b) => !branchIds.includes(b));
      if (add.length) {
        const { error: e } = await supabase.from('user_branches').insert(add.map((branch_id) => ({ user_id: user.id, branch_id })));
        if (e) throw e;
      }
      if (remove.length) {
        const { error: e } = await supabase.from('user_branches').delete().eq('user_id', user.id).in('branch_id', remove);
        if (e) throw e;
      }
      // Permisos individuales
      const before = Object.fromEntries(user.overrides.map((o) => [o.permission_key, o]));
      const changedKeys = new Set([...Object.keys(before), ...Object.keys(overrides)]);
      for (const key of changedKeys) {
        const a = before[key];
        const b = overrides[key];
        if (a && b && a.effect === b.effect && a.scope === b.scope) continue;
        if (a) {
          const { error: e } = await supabase.from('user_permissions').delete().eq('user_id', user.id).eq('permission_key', key);
          if (e) throw e;
        }
        if (b) {
          const { error: e } = await supabase.from('user_permissions').insert({ user_id: user.id, permission_key: key, effect: b.effect, scope: b.scope });
          if (e) throw e;
        }
      }
      trackEvent('user.edited', { entityType: 'profiles', entityId: user.id });
      onSaved();
    } catch (e) {
      setError(await errorText(e));
    } finally {
      setSaving(false);
    }
  }

  async function sendReset() {
    const { error: e } = await supabase.auth.resetPasswordForEmail(user.email, { redirectTo: `${window.location.origin}/set-password` });
    trackEvent('user.password_reset_sent', { entityType: 'profiles', entityId: user.id });
    setInfo(e ? await errorText(e) : `Se envió a ${user.email} un enlace para definir una nueva contraseña.`);
  }

  const label = { display: 'block', fontSize: '0.85rem', marginBottom: 6, fontWeight: 600 };

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: '1rem' }}>
        <label>
          <span style={label}>Estado</span>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="active">Activo</option>
            <option value="inactive">Inactivo</option>
            <option value="suspended">Suspendido</option>
            {user.status === 'invited' && <option value="invited">Invitado</option>}
          </select>
        </label>
        <label>
          <span style={label}>Rol</span>
          <select className="input" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            {data.roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <span style={label}>Sucursales</span>
        <BranchChecklist branches={data.branches} value={branchIds} onChange={setBranchIds} allowed={allowed} />
      </div>

      <span style={label}>Permisos individuales</span>
      <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: 8 }}>
        "Según su rol" usa lo que da el rol. Puedes conceder un permiso extra (por ejemplo, Importar) o denegarlo aunque el rol lo tenga.
      </p>
      <div className="card" style={{ padding: 0, maxHeight: 300, overflowY: 'auto', marginBottom: '1rem' }}>
        {Object.entries(modules).map(([mod, perms]) => (
          <div key={mod}>
            <div style={{ padding: '0.4rem 0.75rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', background: 'var(--color-btn-secondary-bg)' }}>{mod}</div>
            {perms.map((p) => {
              const o = overrides[p.key];
              const value = !o ? '' : o.effect === 'deny' ? 'deny' : o.scope;
              return (
                <div key={p.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '0.35rem 0.75rem', borderBottom: '1px solid var(--color-border)', fontSize: '0.84rem' }}>
                  <span>{p.description}</span>
                  <select className="input" style={{ width: 200, height: 32 }} value={value} onChange={(e) => setOverride(p.key, e.target.value)}>
                    <option value="">Según su rol</option>
                    <option value="own">Permitir · {SCOPE_LABEL.own}</option>
                    <option value="branch">Permitir · {SCOPE_LABEL.branch}</option>
                    <option value="organization">Permitir · {SCOPE_LABEL.organization}</option>
                    <option value="deny">Denegar</option>
                  </select>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {info && <p style={{ fontSize: '0.84rem', marginBottom: '0.7rem' }}>{info}</p>}
      {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem', marginBottom: '0.7rem' }}>{error}</p>}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-secondary" onClick={sendReset} disabled={saving}>
          Enviar enlace de contraseña
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}