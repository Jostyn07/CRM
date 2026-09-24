'use client';
// Ruta: app/settings/sucursales/page.js
// Datos de la organización (nombre, prefijo telefónico por defecto) y
// sucursales. Crear/editar sucursales requiere branches.manage con
// alcance de organización; los datos generales, settings.manage.

import { useCallback, useEffect, useState } from 'react';
import RequirePermission from '../../../components/ui/requirePermission';
import { SettingsHeader, bodyRow, cell, errorText, headRow } from '../../../components/settings/settingsTabs';
import { supabase } from '../../../lib/supabase/client';
import { useSession } from '../../../lib/auth/sessionContext';
import { trackEvent } from '../../../lib/activity/tracker';

const PREFIXES = ['+1', '+57', '+52', '+58', '+51', '+593', '+34'];

export default function BranchesPage() {
  return (
    <RequirePermission any={['branches.manage', 'settings.manage']}>
      <Branches />
    </RequirePermission>
  );
}

function Branches() {
  const { can, organization, refresh } = useSession();
  const canBranches = can('branches.manage', 'organization');
  const canSettings = can('settings.manage');

  const [branches, setBranches] = useState([]);
  const [members, setMembers] = useState({});
  const [orgName, setOrgName] = useState('');
  const [prefix, setPrefix] = useState('+1');
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState({});
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    const [b, ub, s] = await Promise.all([
      supabase.from('branches').select('*').order('name'),
      supabase.from('user_branches').select('branch_id'),
      supabase.from('organization_settings').select('settings').maybeSingle(),
    ]);
    setBranches(b.data ?? []);
    setMembers((ub.data ?? []).reduce((a, x) => ((a[x.branch_id] = (a[x.branch_id] ?? 0) + 1), a), {}));
    setPrefix(s.data?.settings?.default_country_code ?? '+1');
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => setOrgName(organization?.name ?? ''), [organization?.name]);

  async function run(fn, ok) {
    setMsg(null);
    const { error } = await fn();
    if (error) return setMsg(await errorText(error));
    if (ok) setMsg(ok);
    await load();
  }

  async function saveOrg() {
    setMsg(null);
    const { error: e1 } = await supabase.from('organizations').update({ name: orgName.trim() }).eq('id', organization.id);
    if (e1) return setMsg(await errorText(e1));
    const { data: s } = await supabase.from('organization_settings').select('settings').maybeSingle();
    const { error: e2 } = await supabase
      .from('organization_settings')
      .update({ settings: { ...(s?.settings ?? {}), default_country_code: prefix } })
      .eq('organization_id', organization.id);
    if (e2) return setMsg(await errorText(e2));
    trackEvent('organization.settings_saved');
    setMsg('Datos de la organización guardados.');
    refresh();
  }

  return (
    <main style={{ padding: '1.5rem', maxWidth: 1000 }}>
      <SettingsHeader title="Sucursales" subtitle="Datos de tu organización y sus sucursales. Cada lead y cada usuario pertenece a una o más sucursales." />

      {msg && <p style={{ fontSize: '0.86rem', marginBottom: '0.8rem' }}>{msg}</p>}

      {canSettings && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '0.95rem', marginBottom: '0.7rem' }}>Organización</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 10, alignItems: 'end' }}>
            <label>
              <span style={{ fontSize: '0.82rem' }}>Nombre</span>
              <input className="input" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
            </label>
            <label>
              <span style={{ fontSize: '0.82rem' }}>Prefijo telefónico por defecto</span>
              <select className="input" value={prefix} onChange={(e) => setPrefix(e.target.value)}>
                {PREFIXES.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
            <button className="btn btn-primary" onClick={saveOrg} disabled={!orgName.trim()}>
              Guardar
            </button>
          </div>
          <p style={{ fontSize: '0.76rem', color: 'var(--color-text-muted)', marginTop: 6 }}>
            Dirección web: <strong>{organization?.slug}</strong>. El prefijo se usa cuando un teléfono se escribe sin código de país.
          </p>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
          <thead>
            <tr style={headRow}>
              <th style={cell}>Sucursal</th>
              <th style={cell}>Código</th>
              <th style={cell}>Usuarios</th>
              <th style={cell}>Estado</th>
              <th style={cell} />
            </tr>
          </thead>
          <tbody>
            {branches.map((b) => {
              const ed = editing[b.id];
              return (
                <tr key={b.id} style={bodyRow}>
                  <td style={cell}>
                    {ed ? <input className="input" value={ed.name} onChange={(e) => setEditing({ ...editing, [b.id]: { ...ed, name: e.target.value } })} /> : <strong>{b.name}</strong>}
                  </td>
                  <td style={cell}>
                    {ed ? <input className="input" value={ed.code ?? ''} onChange={(e) => setEditing({ ...editing, [b.id]: { ...ed, code: e.target.value } })} /> : b.code || '—'}
                  </td>
                  <td style={cell}>{members[b.id] ?? 0}</td>
                  <td style={cell}>{b.status === 'active' ? 'Activa' : 'Inactiva'}</td>
                  <td style={{ ...cell, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {canBranches && !ed && (
                      <>
                        <button className="btn btn-secondary" onClick={() => setEditing({ ...editing, [b.id]: { name: b.name, code: b.code } })}>
                          Editar
                        </button>{' '}
                        <button
                          className="btn btn-secondary"
                          onClick={() => {
                            if (b.status === 'active' && !confirm(`Al desactivar "${b.name}" sus usuarios dejan de ver sus leads y no se podrán crear leads nuevos ahí. ¿Continuar?`)) return;
                            run(() => supabase.from('branches').update({ status: b.status === 'active' ? 'inactive' : 'active' }).eq('id', b.id));
                          }}
                        >
                          {b.status === 'active' ? 'Desactivar' : 'Activar'}
                        </button>
                      </>
                    )}
                    {ed && (
                      <>
                        <button
                          className="btn btn-primary"
                          onClick={() =>
                            run(() => supabase.from('branches').update({ name: ed.name.trim(), code: ed.code?.trim() || null }).eq('id', b.id)).then(() =>
                              setEditing(({ [b.id]: _, ...rest }) => rest)
                            )
                          }
                        >
                          Guardar
                        </button>{' '}
                        <button className="btn btn-secondary" onClick={() => setEditing(({ [b.id]: _, ...rest }) => rest)}>
                          Cancelar
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {canBranches && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!newName.trim()) return;
            run(() => supabase.from('branches').insert({ name: newName.trim() }), 'Sucursal creada. Recuerda asignarle usuarios en Configuración → Usuarios.').then(() => setNewName(''));
          }}
          style={{ display: 'flex', gap: 8, marginTop: '0.8rem' }}
        >
          <input className="input" placeholder="Nombre de la nueva sucursal" value={newName} onChange={(e) => setNewName(e.target.value)} style={{ maxWidth: 320 }} />
          <button className="btn btn-primary">+ Agregar sucursal</button>
        </form>
      )}
    </main>
  );
}
