'use client';
// Ruta: components/automations/ruleEditor.js
// Editor de una automatización: Cuando (disparador) → Si (condiciones) → Hacer (acciones).

import { useMemo, useState } from 'react';
import { ACTIONS, PLACEHOLDERS, PRIORITIES, RECIPIENTS, TRIGGERS, newAction, saveRule } from '../../lib/automations/api';

const box = { border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '0.85rem', marginBottom: '0.85rem' };
const label = { display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4 };
const row = { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' };

function Chips({ options, value = [], onChange, empty = 'No hay opciones' }) {
  if (!options.length) return <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{empty}</span>;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.map((o) => {
        const on = value.includes(o.id);
        return (
          <button
            type="button"
            key={o.id}
            onClick={() => onChange(on ? value.filter((v) => v !== o.id) : [...value, o.id])}
            style={{
              padding: '4px 10px',
              borderRadius: 999,
              fontSize: '0.78rem',
              cursor: 'pointer',
              border: `1px solid ${on ? 'var(--color-primary)' : 'var(--color-border)'}`,
              background: on ? 'var(--color-active-bg)' : 'transparent',
              color: on ? 'var(--color-active-text)' : 'var(--color-text)',
              fontWeight: on ? 600 : 400,
            }}
          >
            {on ? '✓ ' : ''}
            {o.name}
          </button>
        );
      })}
    </div>
  );
}

export default function RuleEditor({ initial, config, fconfig, branchOptions, canGeneral, onSaved, onCancel }) {
  const [rule, setRule] = useState(() => ({
    name: '',
    description: '',
    branch_id: canGeneral ? '' : branchOptions[0]?.id ?? '',
    is_active: true,
    trigger: 'lead_created',
    trigger_config: {},
    conditions: {},
    actions: [newAction('notify')],
    ...initial,
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const set = (patch) => setRule((r) => ({ ...r, ...patch }));
  const setCfg = (patch) => setRule((r) => ({ ...r, trigger_config: { ...r.trigger_config, ...patch } }));
  const setCond = (patch) => setRule((r) => ({ ...r, conditions: { ...r.conditions, ...patch } }));
  const setAction = (i, patch) => setRule((r) => ({ ...r, actions: r.actions.map((a, j) => (j === i ? { ...a, ...patch } : a)) }));
  const moveAction = (i, d) =>
    setRule((r) => {
      const xs = [...r.actions];
      const j = i + d;
      if (j < 0 || j >= xs.length) return r;
      [xs[i], xs[j]] = [xs[j], xs[i]];
      return { ...r, actions: xs };
    });

  // Usuarios elegibles: los de la sucursal de la regla (o todos si es general)
  const users = useMemo(
    () => (rule.branch_id ? config.users.filter((u) => u.branchIds.includes(rule.branch_id)) : config.users),
    [config.users, rule.branch_id]
  );
  const userOpts = users.map((u) => ({ id: u.id, name: u.name }));
  const statuses = config.statuses.filter((s) => s.is_active);
  const stages = rule.trigger_config.funnel_id ? fconfig.stagesOf(rule.trigger_config.funnel_id) : [];
  const leadTrigger = !['task_overdue'].includes(rule.trigger);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const saved = await saveRule(rule);
      onSaved(saved);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card" style={{ padding: '1.1rem', marginBottom: '1rem' }}>
      <h2 style={{ fontSize: '1.05rem', marginBottom: '0.9rem' }}>{rule.id ? 'Editar automatización' : 'Nueva automatización'}</h2>

      <div style={{ ...row, marginBottom: '0.85rem' }}>
        <div style={{ flex: '2 1 260px' }}>
          <label style={label}>Nombre</label>
          <input className="input" required maxLength={120} value={rule.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ej. Repartir leads de WhatsApp" />
        </div>
        <div style={{ flex: '1 1 200px' }}>
          <label style={label}>Aplica en</label>
          <select className="input" value={rule.branch_id ?? ''} onChange={(e) => set({ branch_id: e.target.value })}>
            {canGeneral && <option value="">Todas las sucursales</option>}
            {branchOptions.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div style={{ marginBottom: '0.85rem' }}>
        <label style={label}>Descripción (opcional)</label>
        <input className="input" value={rule.description ?? ''} onChange={(e) => set({ description: e.target.value })} />
      </div>

      {/* ---------- CUANDO ---------- */}
      <div style={box}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>1. Cuando…</div>
        <select className="input" value={rule.trigger} onChange={(e) => set({ trigger: e.target.value, trigger_config: e.target.value === 'lead_no_contact' ? { hours: 2 } : {} })}>
          {Object.entries(TRIGGERS).map(([k, t]) => (
            <option key={k} value={k}>
              {t.icon} {t.label}
            </option>
          ))}
        </select>
        {TRIGGERS[rule.trigger]?.help && <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: 6 }}>{TRIGGERS[rule.trigger].help}</p>}

        <div style={{ ...row, marginTop: 8 }}>
          {rule.trigger === 'lead_no_contact' && (
            <div>
              <label style={label}>Horas sin contacto</label>
              <input className="input" type="number" min={1} max={720} step={0.5} style={{ width: 130 }} value={rule.trigger_config.hours ?? ''} onChange={(e) => setCfg({ hours: e.target.value === '' ? '' : Number(e.target.value) })} required />
            </div>
          )}
          {rule.trigger === 'lead_status_changed' && (
            <>
              <div>
                <label style={label}>Desde (opcional)</label>
                <select className="input" value={rule.trigger_config.from_status_id ?? ''} onChange={(e) => setCfg({ from_status_id: e.target.value || undefined })}>
                  <option value="">Cualquiera</option>
                  {config.statuses.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={label}>Hacia (opcional)</label>
                <select className="input" value={rule.trigger_config.to_status_id ?? ''} onChange={(e) => setCfg({ to_status_id: e.target.value || undefined })}>
                  <option value="">Cualquiera</option>
                  {config.statuses.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
          {['opportunity_stage_changed', 'opportunity_won', 'opportunity_lost'].includes(rule.trigger) && (
            <div>
              <label style={label}>Embudo (opcional)</label>
              <select className="input" value={rule.trigger_config.funnel_id ?? ''} onChange={(e) => setCfg({ funnel_id: e.target.value || undefined, to_stage_id: undefined })}>
                <option value="">Todos</option>
                {fconfig.funnels.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {rule.trigger === 'opportunity_stage_changed' && rule.trigger_config.funnel_id && (
            <div>
              <label style={label}>A la etapa (opcional)</label>
              <select className="input" value={rule.trigger_config.to_stage_id ?? ''} onChange={(e) => setCfg({ to_stage_id: e.target.value || undefined })}>
                <option value="">Cualquiera</option>
                {stages
                  .filter((s) => s.kind === 'open')
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </div>
          )}
          {rule.trigger === 'call_ended' && (
            <div>
              <label style={label}>Resultado</label>
              <select className="input" value={rule.trigger_config.result ?? 'any'} onChange={(e) => setCfg({ result: e.target.value })}>
                <option value="any">Cualquiera</option>
                <option value="answered">Contestada</option>
                <option value="not_answered">No contestada</option>
              </select>
            </div>
          )}
          {['whatsapp_received', 'call_ended'].includes(rule.trigger) && (
            <div>
              <label style={label}>No repetir por lead antes de (min)</label>
              <input className="input" type="number" min={0} max={10080} style={{ width: 150 }} placeholder={rule.trigger === 'whatsapp_received' ? '60' : '0'} value={rule.trigger_config.cooldown_minutes ?? ''} onChange={(e) => setCfg({ cooldown_minutes: e.target.value === '' ? undefined : Number(e.target.value) })} />
            </div>
          )}
        </div>
      </div>

      {/* ---------- SI ---------- */}
      <div style={box}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>2. Solo si… <span style={{ fontWeight: 400, fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>(vacío = siempre)</span></div>
        {!rule.branch_id && (
          <div style={{ marginBottom: 10 }}>
            <label style={label}>Sucursal del lead</label>
            <Chips options={config.allBranches} value={rule.conditions.branch_ids ?? []} onChange={(v) => setCond({ branch_ids: v })} />
          </div>
        )}
        <div style={{ marginBottom: 10 }}>
          <label style={label}>Fuente del lead</label>
          <Chips options={config.sources.filter((s) => s.is_active)} value={rule.conditions.source_ids ?? []} onChange={(v) => setCond({ source_ids: v })} />
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={label}>Estado actual del lead</label>
          <Chips options={config.statuses} value={rule.conditions.status_ids ?? []} onChange={(v) => setCond({ status_ids: v })} />
        </div>
        <div style={{ ...row }}>
          <div>
            <label style={label}>Responsable del lead</label>
            <select className="input" value={rule.conditions.assigned ?? 'any'} onChange={(e) => setCond({ assigned: e.target.value })}>
              <option value="any">Con o sin responsable</option>
              <option value="unassigned">Sin responsable</option>
              <option value="assigned">Con responsable</option>
            </select>
          </div>
        </div>
        {!leadTrigger && <p style={{ fontSize: '0.76rem', color: 'var(--color-text-muted)', marginTop: 8 }}>Las tareas sin lead no cumplen condiciones de fuente, estado o responsable del lead.</p>}
      </div>

      {/* ---------- HACER ---------- */}
      <div style={box}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>3. Hacer… <span style={{ fontWeight: 400, fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>(en este orden)</span></div>
        {rule.actions.map((a, i) => (
          <div key={i} style={{ border: '1px dashed var(--color-border)', borderRadius: 'var(--radius)', padding: '0.7rem', marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <strong style={{ fontSize: '0.88rem' }}>
                {i + 1}. {ACTIONS[a.type]?.icon} {ACTIONS[a.type]?.label}
              </strong>
              <span style={{ display: 'flex', gap: 4 }}>
                <button type="button" className="btn btn-secondary" style={{ height: 28, padding: '0 8px' }} onClick={() => moveAction(i, -1)} disabled={i === 0} aria-label="Subir">
                  ↑
                </button>
                <button type="button" className="btn btn-secondary" style={{ height: 28, padding: '0 8px' }} onClick={() => moveAction(i, 1)} disabled={i === rule.actions.length - 1} aria-label="Bajar">
                  ↓
                </button>
                <button type="button" className="btn btn-secondary" style={{ height: 28, padding: '0 8px', color: 'var(--color-danger)' }} onClick={() => set({ actions: rule.actions.filter((_, j) => j !== i) })} aria-label="Quitar">
                  ✕
                </button>
              </span>
            </div>
            <ActionFields a={a} onChange={(p) => setAction(i, p)} userOpts={userOpts} statuses={statuses} />
          </div>
        ))}
        {rule.actions.length < 10 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {Object.entries(ACTIONS).map(([k, x]) => (
              <button key={k} type="button" className="btn btn-secondary" style={{ height: 32, fontSize: '0.8rem' }} onClick={() => set({ actions: [...rule.actions, newAction(k)] })}>
                + {x.icon} {x.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <p style={{ color: 'var(--color-danger)', marginBottom: 10, fontSize: '0.85rem' }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy || rule.actions.length === 0}>
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  );
}

function ActionFields({ a, onChange, userOpts, statuses }) {
  if (a.type === 'assign') {
    return (
      <>
        <div style={{ ...row, marginBottom: 8 }}>
          <div>
            <label style={label}>Método</label>
            <select className="input" value={a.method} onChange={(e) => onChange({ method: e.target.value })}>
              <option value="round_robin">Por turnos (uno a uno)</option>
              <option value="least_load">Al que tenga menos leads</option>
            </select>
          </div>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.82rem', height: 38 }}>
            <input type="checkbox" checked={a.only_unassigned !== false} onChange={(e) => onChange({ only_unassigned: e.target.checked })} />
            Solo si el lead no tiene responsable
          </label>
        </div>
        <label style={label}>Repartir entre (se saltan los inactivos y los que no son de la sucursal del lead)</label>
        <Chips options={userOpts} value={a.user_ids ?? []} onChange={(v) => onChange({ user_ids: v })} empty="No hay usuarios en esta sucursal" />
      </>
    );
  }
  if (a.type === 'create_task') {
    return (
      <>
        <div style={{ ...row, marginBottom: 8 }}>
          <div style={{ flex: '2 1 240px' }}>
            <label style={label}>Título</label>
            <input className="input" required maxLength={200} value={a.title} onChange={(e) => onChange({ title: e.target.value })} />
          </div>
          <div>
            <label style={label}>Prioridad</label>
            <select className="input" value={a.priority} onChange={(e) => onChange({ priority: e.target.value })}>
              {Object.entries(PRIORITIES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={label}>Vence en (horas)</label>
            <input className="input" type="number" min={0} step={0.5} style={{ width: 120 }} value={a.due_hours ?? ''} onChange={(e) => onChange({ due_hours: e.target.value })} placeholder="Sin fecha" />
          </div>
        </div>
        <div style={{ ...row, marginBottom: 8 }}>
          <div>
            <label style={label}>Responsable</label>
            <select className="input" value={a.assign_to} onChange={(e) => onChange({ assign_to: e.target.value })}>
              <option value="owner">El responsable del lead / tarea</option>
              <option value="user">Un usuario fijo</option>
            </select>
          </div>
          {(a.assign_to === 'user' || a.assign_to === 'owner') && (
            <div>
              <label style={label}>{a.assign_to === 'user' ? 'Usuario' : 'Si no hay responsable, asignar a (opcional)'}</label>
              <select className="input" value={a.user_id ?? ''} onChange={(e) => onChange({ user_id: e.target.value })} required={a.assign_to === 'user'}>
                <option value="">{a.assign_to === 'user' ? 'Elige…' : 'Nadie (se omite)'}</option>
                {userOpts.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <label style={label}>Notas (opcional)</label>
        <textarea className="input" rows={2} value={a.notes ?? ''} onChange={(e) => onChange({ notes: e.target.value })} />
        <Placeholders />
      </>
    );
  }
  if (a.type === 'change_status') {
    return (
      <select className="input" value={a.status_id} onChange={(e) => onChange({ status_id: e.target.value })} required>
        <option value="">Elige el estado…</option>
        {statuses.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    );
  }
  if (a.type === 'notify') {
    const to = a.to ?? [];
    const ch = a.channels ?? [];
    return (
      <>
        <label style={label}>A quién</label>
        <Chips options={Object.entries(RECIPIENTS).map(([id, name]) => ({ id, name }))} value={to} onChange={(v) => onChange({ to: v })} />
        <div style={{ marginTop: 8 }}>
          <label style={label}>Y además a estos usuarios</label>
          <Chips options={userOpts} value={a.user_ids ?? []} onChange={(v) => onChange({ user_ids: v })} />
        </div>
        <div style={{ ...row, margin: '8px 0' }}>
          {[
            ['app', '🔔 En la plataforma'],
            ['email', '✉️ Por correo'],
          ].map(([k, l]) => (
            <label key={k} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.84rem' }}>
              <input type="checkbox" checked={ch.includes(k)} onChange={(e) => onChange({ channels: e.target.checked ? [...ch, k] : ch.filter((x) => x !== k) })} />
              {l}
            </label>
          ))}
        </div>
        <label style={label}>Título (opcional)</label>
        <input className="input" maxLength={200} value={a.title ?? ''} onChange={(e) => onChange({ title: e.target.value })} placeholder="Por defecto, el nombre de la automatización" style={{ marginBottom: 8 }} />
        <label style={label}>Mensaje</label>
        <textarea className="input" rows={2} required value={a.message ?? ''} onChange={(e) => onChange({ message: e.target.value })} placeholder="Ej. {lead} lleva 2 horas sin contacto. Responsable: {responsable}" />
        <Placeholders />
      </>
    );
  }
  if (a.type === 'webhook') {
    return (
      <>
        <label style={label}>URL (https)</label>
        <input className="input" type="url" required pattern="https://.*" value={a.url} onChange={(e) => onChange({ url: e.target.value })} placeholder="https://tu-n8n.com/webhook/…" style={{ marginBottom: 8 }} />
        <label style={label}>Clave secreta (opcional, para verificar la firma)</label>
        <input className="input" value={a.secret ?? ''} onChange={(e) => onChange({ secret: e.target.value })} autoComplete="off" />
        <p style={{ fontSize: '0.76rem', color: 'var(--color-text-muted)', marginTop: 6 }}>
          Se envía un POST con JSON (evento, lead, oportunidad o tarea). Con clave, el header <code>X-Leads-Signature</code> lleva <code>sha256=HMAC</code> del cuerpo. Hasta 3 intentos.
        </p>
      </>
    );
  }
  return null;
}

function Placeholders() {
  return (
    <p style={{ fontSize: '0.74rem', color: 'var(--color-text-muted)', marginTop: 6 }}>
      Puedes usar: {PLACEHOLDERS.map((p) => <code key={p} style={{ marginRight: 6 }}>{p}</code>)}
    </p>
  );
}