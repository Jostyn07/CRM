'use client';
// Ruta: app/settings/numeros/page.js
// Números de salida. El Platform Owner registra los números que compra
// en Telnyx y los asigna a una sucursal de una organización. El admin de
// la organización puede moverlos entre sus sucursales, renombrarlos y
// activarlos o desactivarlos.

import { useCallback, useEffect, useState } from 'react';
import RequirePermission from '../../../components/ui/requirePermission';
import { SettingsHeader, bodyRow, cell, errorText, headRow } from '../../../components/settings/settingsTabs';
import { supabase } from '../../../lib/supabase/client';
import { useSession } from '../../../lib/auth/sessionContext';

export default function NumbersPage() {
  return (
    <RequirePermission any={['calls.manage_numbers', 'calls.make']} allowPlatformOwner>
      <Numbers />
    </RequirePermission>
  );
}

function Numbers() {
  const { isPlatformOwner, can } = useSession();
  const canEdit = isPlatformOwner || can('calls.manage_numbers');
  const [numbers, setNumbers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [msg, setMsg] = useState(null);
  const [draft, setDraft] = useState({ e164: '', label: '', organization_id: '', branch_id: '', telnyx_number_id: '' });

  const load = useCallback(async () => {
    const [n, b, o] = await Promise.all([
      supabase.from('phone_numbers').select('*').order('e164'),
      supabase.from('branches').select('id, name, organization_id, status').order('name'),
      isPlatformOwner ? supabase.from('organizations').select('id, name').order('name') : Promise.resolve({ data: [] }),
    ]);
    setNumbers(n.data ?? []);
    setBranches(b.data ?? []);
    setOrgs(o.data ?? []);
  }, [isPlatformOwner]);

  useEffect(() => {
    load();
  }, [load]);

  async function run(promise, ok) {
    setMsg(null);
    const { error } = await promise;
    setMsg(error ? await errorText(error) : ok ?? null);
    await load();
    return !error;
  }

  const branchName = (id) => branches.find((b) => b.id === id)?.name ?? '—';
  const orgName = (id) => orgs.find((o) => o.id === id)?.name ?? '';

  return (
    <main style={{ padding: '1.5rem', maxWidth: 1100 }}>
      <SettingsHeader title="Números" subtitle="Números de salida (caller ID). Cada número pertenece a una sucursal y lo usan sus usuarios." />
      {msg && <p style={{ fontSize: '0.86rem', marginBottom: '0.8rem' }}>{msg}</p>}

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
          <thead>
            <tr style={headRow}>
              <th style={cell}>Número</th>
              {isPlatformOwner && <th style={cell}>Organización</th>}
              <th style={cell}>Sucursal</th>
              <th style={cell}>Etiqueta</th>
              <th style={cell}>Activo</th>
              {isPlatformOwner && <th style={cell} />}
            </tr>
          </thead>
          <tbody>
            {numbers.length === 0 && (
              <tr>
                <td colSpan={6} style={{ ...cell, textAlign: 'center', padding: '1.5rem', color: 'var(--color-text-muted)' }}>
                  {isPlatformOwner ? 'Todavía no hay números. Agrega el primero abajo.' : 'Tu organización todavía no tiene números asignados.'}
                </td>
              </tr>
            )}
            {numbers.map((n) => (
              <tr key={n.id} style={{ ...bodyRow, opacity: n.is_active ? 1 : 0.55 }}>
                <td style={{ ...cell, fontWeight: 600 }}>{n.e164}</td>
                {isPlatformOwner && <td style={cell}>{orgName(n.organization_id)}</td>}
                <td style={cell}>
                  {canEdit ? (
                    <select className="input" style={{ height: 32 }} value={n.branch_id} onChange={(e) => run(supabase.from('phone_numbers').update({ branch_id: e.target.value }).eq('id', n.id))}>
                      {branches
                        .filter((b) => b.organization_id === n.organization_id && b.status === 'active')
                        .map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                    </select>
                  ) : (
                    branchName(n.branch_id)
                  )}
                </td>
                <td style={cell}>
                  {canEdit ? (
                    <input
                      className="input"
                      defaultValue={n.label ?? ''}
                      onBlur={(e) => e.target.value !== (n.label ?? '') && run(supabase.from('phone_numbers').update({ label: e.target.value || null }).eq('id', n.id))}
                    />
                  ) : (
                    n.label || '—'
                  )}
                </td>
                <td style={cell}>
                  <input type="checkbox" disabled={!canEdit} checked={n.is_active} onChange={(e) => run(supabase.from('phone_numbers').update({ is_active: e.target.checked }).eq('id', n.id))} />
                </td>
                {isPlatformOwner && (
                  <td style={{ ...cell, textAlign: 'right' }}>
                    <button
                      className="btn btn-secondary"
                      onClick={() => confirm(`¿Quitar ${n.e164} del catálogo? Las llamadas hechas con él se conservan.`) && run(supabase.from('phone_numbers').delete().eq('id', n.id))}
                    >
                      Quitar
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isPlatformOwner && (
        <form
          className="card"
          style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8, alignItems: 'end' }}
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run(
              supabase.from('phone_numbers').insert({
                e164: draft.e164.replace(/[^\d+]/g, ''),
                label: draft.label || null,
                organization_id: draft.organization_id,
                branch_id: draft.branch_id,
                telnyx_number_id: draft.telnyx_number_id || null,
              }),
              'Número agregado.'
            );
            if (ok) setDraft({ e164: '', label: '', organization_id: draft.organization_id, branch_id: '', telnyx_number_id: '' });
          }}
        >
          <label>
            <span style={{ fontSize: '0.8rem' }}>Número (E.164)</span>
            <input className="input" required placeholder="+13055550100" value={draft.e164} onChange={(e) => setDraft({ ...draft, e164: e.target.value })} />
          </label>
          <label>
            <span style={{ fontSize: '0.8rem' }}>Organización</span>
            <select className="input" required value={draft.organization_id} onChange={(e) => setDraft({ ...draft, organization_id: e.target.value, branch_id: '' })}>
              <option value="">Selecciona…</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span style={{ fontSize: '0.8rem' }}>Sucursal</span>
            <select className="input" required value={draft.branch_id} onChange={(e) => setDraft({ ...draft, branch_id: e.target.value })}>
              <option value="">Selecciona…</option>
              {branches
                .filter((b) => b.organization_id === draft.organization_id && b.status === 'active')
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            <span style={{ fontSize: '0.8rem' }}>Etiqueta</span>
            <input className="input" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
          </label>
          <label>
            <span style={{ fontSize: '0.8rem' }}>ID en Telnyx (opcional)</span>
            <input className="input" value={draft.telnyx_number_id} onChange={(e) => setDraft({ ...draft, telnyx_number_id: e.target.value })} />
          </label>
          <button className="btn btn-primary">+ Agregar número</button>
        </form>
      )}
      {isPlatformOwner && (
        <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: 8 }}>
          El número debe estar comprado en tu cuenta de Telnyx y asociado al Outbound Voice Profile de la conexión de WebRTC.
        </p>
      )}
    </main>
  );
}