'use client';
// Ruta: app/settings/embudos/page.js
// Configuración de embudos: embudos, etapas (orden, color, probabilidad),
// motivos de pérdida, moneda y estado del lead al ganar.

import { useEffect, useState } from 'react';
import RequirePermission from '../../../components/ui/requirePermission';
import { SettingsHeader, bodyRow, cell, errorText, headRow } from '../../../components/settings/settingsTabs';
import { supabase } from '../../../lib/supabase/client';
import { useFunnelConfig } from '../../../lib/opportunities/api';
import { useLeadConfig } from '../../../lib/leads/useLeadConfig';

const CURRENCIES = ['USD', 'COP', 'MXN', 'EUR', 'PEN', 'CLP', 'ARS', 'DOP', 'GTQ'];
const KIND = { open: 'En proceso', won: 'Ganada', lost: 'Perdida' };

export default function FunnelSettingsPage() {
  return (
    <RequirePermission perm="funnels.manage">
      <FunnelSettings />
    </RequirePermission>
  );
}

function FunnelSettings() {
  const fc = useFunnelConfig();
  const lc = useLeadConfig();
  const [funnelId, setFunnelId] = useState('');
  const [msg, setMsg] = useState(null);
  const [newFunnel, setNewFunnel] = useState('');
  const [newStage, setNewStage] = useState({ name: '', color: '#6366f1', probability: 25 });
  const [newReason, setNewReason] = useState('');

  useEffect(() => {
    if (!funnelId && fc.funnels.length) setFunnelId(fc.funnels[0].id);
  }, [fc.funnels, funnelId]);

  async function run(promise, ok) {
    setMsg(null);
    const { error } = await promise;
    setMsg(error ? { error: await errorText(error) } : ok ? { ok } : null);
    await fc.reload();
    return !error;
  }

  async function saveSetting(patch) {
    const { data } = await supabase.from('organization_settings').select('organization_id, settings').maybeSingle();
    await run(
      supabase.from('organization_settings').update({ settings: { ...(data?.settings ?? {}), ...patch } }).eq('organization_id', data.organization_id),
      'Configuración guardada.'
    );
  }

  const stages = fc.stagesOf(funnelId);
  const open = stages.filter((s) => s.kind === 'open');
  const funnel = fc.funnels.find((f) => f.id === funnelId);

  async function moveStage(i, dir) {
    const a = open[i];
    const b = open[i + dir];
    if (!b) return;
    await supabase.from('funnel_stages').update({ position: b.position }).eq('id', a.id);
    await run(supabase.from('funnel_stages').update({ position: a.position === b.position ? a.position + dir : a.position }).eq('id', b.id));
  }

  if (fc.loading) return <main style={{ padding: '1.5rem' }}>Cargando…</main>;

  return (
    <main style={{ padding: '1.5rem', maxWidth: 1050 }}>
      <SettingsHeader title="Embudos" subtitle="Embudos de toda la organización, sus etapas y los motivos de pérdida." />
      {msg?.error && <p style={{ color: 'var(--color-danger)', fontSize: '0.86rem', marginBottom: '0.8rem' }}>{msg.error}</p>}
      {msg?.ok && <p style={{ fontSize: '0.86rem', marginBottom: '0.8rem' }}>{msg.ok}</p>}

      {/* Generales */}
      <div className="card" style={{ marginBottom: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        <label>
          <span style={{ fontSize: '0.82rem' }}>Moneda de la organización</span>
          <select className="input" value={fc.currency} onChange={(e) => saveSetting({ currency: e.target.value })}>
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <span style={{ fontSize: '0.74rem', color: 'var(--color-text-muted)' }}>Aplica a las oportunidades nuevas.</span>
        </label>
        <label>
          <span style={{ fontSize: '0.82rem' }}>Al ganar una oportunidad, el lead pasa a</span>
          <select className="input" value={fc.wonLeadStatusId ?? ''} onChange={(e) => saveSetting({ won_lead_status_id: e.target.value || null })}>
            <option value="">No cambiar el estado</option>
            {lc.statuses
              .filter((s) => s.is_active)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </label>
      </div>

      {/* Embudos */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.8rem' }}>
        {fc.funnels.map((f) => (
          <button key={f.id} className={f.id === funnelId ? 'btn btn-primary' : 'btn btn-secondary'} onClick={() => setFunnelId(f.id)} style={{ opacity: f.is_active ? 1 : 0.6 }}>
            {f.name}
          </button>
        ))}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newFunnel.trim()) return;
            const { data, error } = await supabase
              .from('funnels')
              .insert({ name: newFunnel.trim(), position: fc.funnels.length + 1 })
              .select('id')
              .single();
            if (error) return setMsg({ error: await errorText(error) });
            setNewFunnel('');
            await fc.reload();
            setFunnelId(data.id);
          }}
          style={{ display: 'flex', gap: 6 }}
        >
          <input className="input" style={{ width: 200 }} placeholder="Nuevo embudo" value={newFunnel} onChange={(e) => setNewFunnel(e.target.value)} />
          <button className="btn btn-secondary">+ Crear</button>
        </form>
      </div>

      {funnel && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: '0.8rem', flexWrap: 'wrap' }}>
            <input
              className="input"
              style={{ maxWidth: 280 }}
              defaultValue={funnel.name}
              key={funnel.id}
              onBlur={(e) => e.target.value.trim() && e.target.value !== funnel.name && run(supabase.from('funnels').update({ name: e.target.value.trim() }).eq('id', funnel.id))}
            />
            <label style={{ fontSize: '0.84rem', display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={funnel.is_active} onChange={(e) => run(supabase.from('funnels').update({ is_active: e.target.checked }).eq('id', funnel.id))} />
              Activo
            </label>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
            <thead>
              <tr style={headRow}>
                <th style={cell}>Orden</th>
                <th style={cell}>Color</th>
                <th style={cell}>Etapa</th>
                <th style={cell}>Tipo</th>
                <th style={cell}>Probabilidad</th>
                <th style={cell}>Activa</th>
                <th style={cell} />
              </tr>
            </thead>
            <tbody>
              {stages.map((s) => {
                const i = open.findIndex((x) => x.id === s.id);
                return (
                  <tr key={s.id} style={{ ...bodyRow, opacity: s.is_active ? 1 : 0.55 }}>
                    <td style={cell}>
                      {s.kind === 'open' && (
                        <>
                          <button className="btn btn-secondary" style={{ padding: '0 0.4rem' }} disabled={i === 0} onClick={() => moveStage(i, -1)} aria-label="Subir">
                            ↑
                          </button>{' '}
                          <button className="btn btn-secondary" style={{ padding: '0 0.4rem' }} disabled={i === open.length - 1} onClick={() => moveStage(i, 1)} aria-label="Bajar">
                            ↓
                          </button>
                        </>
                      )}
                    </td>
                    <td style={cell}>
                      <input
                        type="color"
                        value={s.color}
                        onChange={(e) => run(supabase.from('funnel_stages').update({ color: e.target.value }).eq('id', s.id))}
                        style={{ width: 36, height: 30, border: 'none', background: 'none', padding: 0 }}
                      />
                    </td>
                    <td style={cell}>
                      <input
                        className="input"
                        defaultValue={s.name}
                        onBlur={(e) => e.target.value.trim() && e.target.value !== s.name && run(supabase.from('funnel_stages').update({ name: e.target.value.trim() }).eq('id', s.id))}
                      />
                    </td>
                    <td style={cell}>{KIND[s.kind]}</td>
                    <td style={cell}>
                      {s.kind === 'open' ? (
                        <input
                          className="input"
                          type="number"
                          min="0"
                          max="100"
                          style={{ width: 80 }}
                          defaultValue={s.probability}
                          onBlur={(e) => Number(e.target.value) !== s.probability && run(supabase.from('funnel_stages').update({ probability: Number(e.target.value) }).eq('id', s.id))}
                        />
                      ) : (
                        `${s.probability}%`
                      )}
                    </td>
                    <td style={cell}>
                      <input
                        type="checkbox"
                        checked={s.is_active}
                        disabled={s.kind !== 'open'}
                        onChange={(e) => run(supabase.from('funnel_stages').update({ is_active: e.target.checked }).eq('id', s.id))}
                      />
                    </td>
                    <td style={{ ...cell, textAlign: 'right' }}>
                      {s.kind === 'open' && (
                        <button className="btn btn-secondary" onClick={() => confirm(`¿Eliminar la etapa "${s.name}"?`) && run(supabase.from('funnel_stages').delete().eq('id', s.id))}>
                          Eliminar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!newStage.name.trim()) return;
              const pos = (open.at(-1)?.position ?? 0) + 1;
              const ok = await run(
                supabase.from('funnel_stages').insert({ funnel_id: funnel.id, name: newStage.name.trim(), color: newStage.color, probability: Number(newStage.probability), position: pos })
              );
              if (ok) setNewStage({ name: '', color: '#6366f1', probability: 25 });
            }}
            style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: '0.8rem', flexWrap: 'wrap' }}
          >
            <input type="color" value={newStage.color} onChange={(e) => setNewStage({ ...newStage, color: e.target.value })} style={{ width: 36, height: 30, border: 'none', background: 'none', padding: 0 }} />
            <input className="input" style={{ maxWidth: 240 }} placeholder="Nueva etapa" value={newStage.name} onChange={(e) => setNewStage({ ...newStage, name: e.target.value })} />
            <input className="input" type="number" min="0" max="100" style={{ width: 90 }} value={newStage.probability} onChange={(e) => setNewStage({ ...newStage, probability: e.target.value })} aria-label="Probabilidad" />
            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>%</span>
            <button className="btn btn-primary">+ Agregar etapa</button>
          </form>
          <p style={{ fontSize: '0.76rem', color: 'var(--color-text-muted)', marginTop: 8 }}>
            Las etapas Ganada y Perdida son fijas. Una etapa con oportunidades no se elimina: desactívala.
          </p>
        </div>
      )}

      {/* Motivos de pérdida */}
      <h3 style={{ fontSize: '0.95rem', marginBottom: '0.5rem' }}>Motivos de pérdida</h3>
      <div className="card" style={{ padding: 0 }}>
        {fc.lostReasons.map((r) => (
          <div key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '0.45rem 0.75rem', borderBottom: '1px solid var(--color-border)', opacity: r.is_active ? 1 : 0.55 }}>
            <input
              className="input"
              defaultValue={r.name}
              onBlur={(e) => e.target.value.trim() && e.target.value !== r.name && run(supabase.from('lost_reasons').update({ name: e.target.value.trim() }).eq('id', r.id))}
            />
            <label style={{ fontSize: '0.82rem', display: 'flex', gap: 4, alignItems: 'center', whiteSpace: 'nowrap' }}>
              <input type="checkbox" checked={r.is_active} onChange={(e) => run(supabase.from('lost_reasons').update({ is_active: e.target.checked }).eq('id', r.id))} /> Activo
            </label>
          </div>
        ))}
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!newReason.trim()) return;
          if (await run(supabase.from('lost_reasons').insert({ name: newReason.trim(), position: fc.lostReasons.length + 1 }))) setNewReason('');
        }}
        style={{ display: 'flex', gap: 8, marginTop: '0.7rem', maxWidth: 440 }}
      >
        <input className="input" placeholder="Nuevo motivo" value={newReason} onChange={(e) => setNewReason(e.target.value)} />
        <button className="btn btn-primary">+ Agregar</button>
      </form>
    </main>
  );
}