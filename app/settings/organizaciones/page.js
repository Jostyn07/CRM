'use client';
// Ruta: app/settings/organizaciones/page.js
// Panel del Platform Owner: organizaciones, alta con su primer
// administrador (Edge Function create-organization), suspensión y
// modo soporte (lectura temporal, explícita y auditada).

import { useCallback, useEffect, useState } from 'react';
import RequirePermission from '../../../components/ui/requirePermission';
import Modal from '../../../components/ui/modal';
import { SettingsHeader, bodyRow, cell, errorText, headRow } from '../../../components/settings/settingsTabs';
import { supabase } from '../../../lib/supabase/client';
import { fullDate } from '../../../lib/leads/format';

export default function OrganizationsPage() {
  return (
    <RequirePermission platformOwner>
      <Organizations />
    </RequirePermission>
  );
}

function slugify(t) {
  return t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function Organizations() {
  const [orgs, setOrgs] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [msg, setMsg] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [supportFor, setSupportFor] = useState(null);

  const load = useCallback(async () => {
    const [o, b, p, s] = await Promise.all([
      supabase.from('organizations').select('*').order('created_at', { ascending: false }),
      supabase.from('branches').select('organization_id'),
      supabase.from('profiles').select('organization_id'),
      supabase.from('platform_support_sessions').select('*').is('ended_at', null).gt('expires_at', new Date().toISOString()),
    ]);
    const count = (rows) => (rows ?? []).reduce((a, x) => ((a[x.organization_id] = (a[x.organization_id] ?? 0) + 1), a), {});
    const bc = count(b.data);
    const pc = count(p.data);
    setOrgs((o.data ?? []).map((x) => ({ ...x, branches: bc[x.id] ?? 0, users: pc[x.id] ?? 0 })));
    setSessions(s.data ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(org) {
    const next = org.status === 'active' ? 'suspended' : 'active';
    if (next === 'suspended' && !confirm(`Al suspender "${org.name}" ningún usuario de esa organización podrá operar. ¿Continuar?`)) return;
    const { error } = await supabase.from('organizations').update({ status: next }).eq('id', org.id);
    setMsg(error ? await errorText(error) : null);
    load();
  }

  async function endSession(id) {
    const { error } = await supabase.rpc('end_support_session', { p_session: id });
    setMsg(error ? await errorText(error) : 'Modo soporte cerrado.');
    load();
  }

  const activeSession = (orgId) => sessions.find((s) => s.organization_id === orgId);

  return (
    <main style={{ padding: '1.5rem', maxWidth: 1200 }}>
      <SettingsHeader
        title="Organizaciones"
        subtitle="Panel del Platform Owner. No ves datos de las organizaciones salvo en modo soporte, que es temporal y queda registrado."
        action={
          <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
            + Nueva organización
          </button>
        }
      />
      {msg && <p style={{ fontSize: '0.86rem', marginBottom: '0.8rem' }}>{msg}</p>}

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
          <thead>
            <tr style={headRow}>
              <th style={cell}>Organización</th>
              <th style={cell}>Sucursales</th>
              <th style={cell}>Usuarios</th>
              <th style={cell}>Creada</th>
              <th style={cell}>Estado</th>
              <th style={cell} />
            </tr>
          </thead>
          <tbody>
            {orgs.length === 0 && (
              <tr>
                <td colSpan={6} style={{ ...cell, textAlign: 'center', padding: '1.5rem', color: 'var(--color-text-muted)' }}>
                  Todavía no hay organizaciones.
                </td>
              </tr>
            )}
            {orgs.map((o) => {
              const s = activeSession(o.id);
              return (
                <tr key={o.id} style={bodyRow}>
                  <td style={cell}>
                    <strong>{o.name}</strong>
                    <div style={{ fontSize: '0.76rem', color: 'var(--color-text-muted)' }}>{o.slug}</div>
                  </td>
                  <td style={cell}>{o.branches}</td>
                  <td style={cell}>{o.users}</td>
                  <td style={cell}>{fullDate(o.created_at)}</td>
                  <td style={cell}>{o.status === 'active' ? 'Activa' : 'Suspendida'}</td>
                  <td style={{ ...cell, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {s ? (
                      <button className="btn btn-secondary" onClick={() => endSession(s.id)}>
                        Cerrar soporte (vence {new Date(s.expires_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })})
                      </button>
                    ) : (
                      <button className="btn btn-secondary" onClick={() => setSupportFor(o)}>
                        Modo soporte
                      </button>
                    )}{' '}
                    <button className="btn btn-secondary" style={{ color: o.status === 'active' ? 'var(--color-danger)' : undefined }} onClick={() => toggle(o)}>
                      {o.status === 'active' ? 'Suspender' : 'Activar'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Nueva organización" width={520}>
        <CreateOrg
          onDone={(text) => {
            setCreateOpen(false);
            setMsg(text);
            load();
          }}
        />
      </Modal>

      <Modal open={!!supportFor} onClose={() => setSupportFor(null)} title={supportFor ? `Modo soporte: ${supportFor.name}` : ''} width={480}>
        {supportFor && (
          <StartSupport
            org={supportFor}
            onDone={(text) => {
              setSupportFor(null);
              setMsg(text);
              load();
            }}
          />
        )}
      </Modal>
    </main>
  );
}

function CreateOrg({ onDone }) {
  const [v, setV] = useState({ name: '', slug: '', branches: 'Principal', admin_name: '', admin_email: '' });
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const slug = slugTouched ? v.slug : slugify(v.name);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.functions.invoke('create-organization', {
      body: {
        name: v.name,
        slug,
        branches: v.branches.split(',').map((x) => x.trim()).filter(Boolean),
        admin: { email: v.admin_email, full_name: v.admin_name },
      },
    });
    setSaving(false);
    if (err) return setError(await errorText(err, 'No se pudo crear la organización.'));
    onDone(`Organización creada. Se envió la invitación a ${v.admin_email}.`);
  }

  const f = (label, input) => (
    <label style={{ display: 'block', marginBottom: '0.7rem' }}>
      <span style={{ fontSize: '0.84rem' }}>{label}</span>
      {input}
    </label>
  );

  return (
    <form onSubmit={submit}>
      {f('Nombre', <input className="input" required value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />)}
      {f(
        'Dirección web (slug)',
        <input
          className="input"
          required
          value={slug}
          onChange={(e) => {
            setSlugTouched(true);
            setV({ ...v, slug: slugify(e.target.value) });
          }}
        />
      )}
      {f('Sucursales (separadas por coma)', <input className="input" required value={v.branches} onChange={(e) => setV({ ...v, branches: e.target.value })} />)}
      {f('Nombre del administrador', <input className="input" required value={v.admin_name} onChange={(e) => setV({ ...v, admin_name: e.target.value })} />)}
      {f('Correo del administrador', <input className="input" type="email" required value={v.admin_email} onChange={(e) => setV({ ...v, admin_email: e.target.value })} />)}
      {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem', marginBottom: '0.6rem' }}>{error}</p>}
      <button className="btn btn-primary" disabled={saving} style={{ width: '100%' }}>
        {saving ? 'Creando…' : 'Crear e invitar al administrador'}
      </button>
    </form>
  );
}

function StartSupport({ org, onDone }) {
  const [reason, setReason] = useState('');
  const [minutes, setMinutes] = useState(60);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    const { error: err } = await supabase.rpc('start_support_session', { p_org: org.id, p_reason: reason, p_minutes: Number(minutes) });
    if (err) return setError(await errorText(err));
    onDone(`Modo soporte activo en ${org.name} por ${minutes} min (solo lectura). Queda registrado en su auditoría.`);
  }

  return (
    <form onSubmit={submit}>
      <p style={{ fontSize: '0.84rem', color: 'var(--color-text-muted)', marginBottom: '0.8rem' }}>
        Tendrás acceso de solo lectura a los datos de esta organización durante el tiempo elegido. El motivo queda en su registro de auditoría.
      </p>
      <label style={{ display: 'block', marginBottom: '0.7rem' }}>
        <span style={{ fontSize: '0.84rem' }}>Motivo (mínimo 10 caracteres)</span>
        <textarea className="input" rows={3} required minLength={10} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <label style={{ display: 'block', marginBottom: '0.8rem' }}>
        <span style={{ fontSize: '0.84rem' }}>Duración</span>
        <select className="input" value={minutes} onChange={(e) => setMinutes(e.target.value)}>
          {[15, 30, 60, 120, 240].map((m) => (
            <option key={m} value={m}>
              {m} minutos
            </option>
          ))}
        </select>
      </label>
      {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem', marginBottom: '0.6rem' }}>{error}</p>}
      <button className="btn btn-primary" style={{ width: '100%' }}>
        Iniciar modo soporte
      </button>
    </form>
  );
}