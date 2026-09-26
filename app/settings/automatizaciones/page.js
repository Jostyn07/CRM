'use client';
// Ruta: app/settings/automatizaciones/page.js
// Automatizaciones (Fase 6): reglas "Cuando → Si → Hacer".
// Admin de organización: reglas generales o por sucursal.
// Admin de sucursal: solo reglas de sus sucursales (ve las generales sin editarlas).

import { useCallback, useEffect, useMemo, useState } from 'react';
import RequirePermission from '../../../components/ui/requirePermission';
import { SettingsHeader } from '../../../components/settings/settingsTabs';
import RuleEditor from '../../../components/automations/ruleEditor';
import RunsLog from '../../../components/automations/runsLog';
import { useSession } from '../../../lib/auth/sessionContext';
import { useLeadConfig } from '../../../lib/leads/useLeadConfig';
import { useFunnelConfig } from '../../../lib/opportunities/api';
import { trackEvent } from '../../../lib/activity/tracker';
import { relTime } from '../../../lib/leads/format';
import { TRIGGERS, deleteRule, describeRule, listRules, newAction, setRuleActive } from '../../../lib/automations/api';

// Plantillas para empezar rápido
const TEMPLATES = [
  {
    key: 'rr',
    title: 'Repartir leads nuevos por turnos',
    desc: 'Cada lead sin responsable se asigna al siguiente usuario y se le avisa.',
    rule: {
      name: 'Repartir leads nuevos',
      trigger: 'lead_created',
      conditions: { assigned: 'unassigned' },
      actions: [
        { ...newAction('assign') },
        { ...newAction('notify'), channels: ['app', 'email'], title: 'Nuevo lead asignado: {lead}', message: 'Te asignaron a {lead} ({telefono}). Contáctalo lo antes posible.' },
      ],
    },
  },
  {
    key: 'nocontact',
    title: 'Alerta de lead sin contacto',
    desc: 'Si en 2 horas nadie lo contacta, avisa al responsable y al supervisor.',
    rule: {
      name: 'Lead sin contacto 2 h',
      trigger: 'lead_no_contact',
      trigger_config: { hours: 2 },
      actions: [{ ...newAction('notify'), to: ['owner', 'supervisors'], channels: ['app', 'email'], message: '{lead} lleva 2 horas sin contacto. Responsable: {responsable}.' }],
    },
  },
  {
    key: 'missed',
    title: 'Tarea al no contestar',
    desc: 'Si la llamada no se contesta, crea una tarea para volver a llamar mañana.',
    rule: {
      name: 'Volver a llamar',
      trigger: 'call_ended',
      trigger_config: { result: 'not_answered', cooldown_minutes: 240 },
      actions: [{ ...newAction('create_task'), title: 'Volver a llamar a {lead}', due_hours: 24 }],
    },
  },
  {
    key: 'won',
    title: 'Enviar ventas ganadas a n8n / Zapier',
    desc: 'Cuando se gana una oportunidad, envía los datos a otro sistema.',
    rule: { name: 'Ganadas a n8n', trigger: 'opportunity_won', actions: [newAction('webhook')] },
  },
];

export default function AutomationsPage() {
  return (
    <RequirePermission perm="automations.manage">
      <Automations />
    </RequirePermission>
  );
}

function Automations() {
  const { scopeOf, branches } = useSession();
  const config = useLeadConfig();
  const fconfig = useFunnelConfig();
  const isOrg = scopeOf('automations.manage') === 'organization';
  const [rules, setRules] = useState(null);
  const [editing, setEditing] = useState(null); // regla o {} para nueva
  const [history, setHistory] = useState(null);
  const [error, setError] = useState(null);

  const branchOptions = useMemo(() => (isOrg ? config.allBranches.filter((b) => b.status === 'active') : branches), [isOrg, config.allBranches, branches]);
  const myBranchIds = useMemo(() => branches.map((b) => b.id), [branches]);
  const canEdit = (r) => isOrg || (r.branch_id && myBranchIds.includes(r.branch_id));

  const load = useCallback(() => {
    listRules()
      .then(setRules)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function toggle(r) {
    try {
      await setRuleActive(r.id, !r.is_active);
      trackEvent('automations.toggled', { entityType: 'automation_rule', entityId: r.id, metadata: { active: !r.is_active } });
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function remove(r) {
    if (!window.confirm(`¿Eliminar la automatización “${r.name}”? Se borra también su historial.`)) return;
    try {
      await deleteRule(r.id);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  function startNew(template) {
    setHistory(null);
    setEditing({ ...(template ? structuredClone(template.rule) : {}), branch_id: isOrg ? '' : branchOptions[0]?.id ?? '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <main style={{ padding: '1.5rem', maxWidth: 1100 }}>
      <SettingsHeader
        title="Automatizaciones"
        subtitle="Reglas que trabajan solas: cuando pasa algo, si se cumplen condiciones, la plataforma asigna, crea tareas, cambia estados, avisa o envía un webhook."
        action={
          !editing && (
            <button className="btn btn-primary" onClick={() => startNew(null)}>
              + Nueva automatización
            </button>
          )
        }
      />
      {error && <p style={{ color: 'var(--color-danger)', margin: '0.6rem 0' }}>{error}</p>}

      {editing && (
        <RuleEditor
          key={editing.id ?? 'new'}
          initial={editing}
          config={config}
          fconfig={fconfig}
          branchOptions={branchOptions}
          canGeneral={isOrg}
          onCancel={() => setEditing(null)}
          onSaved={(saved) => {
            trackEvent('automations.saved', { entityType: 'automation_rule', entityId: saved.id });
            setEditing(null);
            load();
          }}
        />
      )}

      {history && <RunsLog rule={history} userMap={config.maps.user} onClose={() => setHistory(null)} />}

      {rules === null ? (
        <p>Cargando…</p>
      ) : (
        <>
          {rules.length === 0 && !editing && (
            <div style={{ marginBottom: '1.2rem' }}>
              <p style={{ fontSize: '0.9rem', marginBottom: 10 }}>Aún no hay automatizaciones. Empieza con una plantilla:</p>
            </div>
          )}
          {!editing && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10, marginBottom: '1.4rem' }}>
              {TEMPLATES.map((t) => (
                <button key={t.key} className="card" onClick={() => startNew(t)} style={{ textAlign: 'left', cursor: 'pointer', padding: '0.8rem', border: '1px dashed var(--color-border)' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                    {TRIGGERS[t.rule.trigger].icon} {t.title}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: 4 }}>{t.desc}</div>
                </button>
              ))}
            </div>
          )}

          <div style={{ display: 'grid', gap: 10 }}>
            {rules.map((r) => {
              const d = describeRule(r, config.maps);
              const editable = canEdit(r);
              return (
                <div key={r.id} className="card" style={{ padding: '0.85rem 1rem', opacity: r.is_active ? 1 : 0.6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 700 }}>
                        {TRIGGERS[r.trigger]?.icon} {r.name}
                        <span style={{ marginLeft: 8, fontSize: '0.72rem', fontWeight: 500, padding: '2px 8px', borderRadius: 999, background: 'var(--color-active-bg)', color: 'var(--color-active-text)' }}>
                          {r.branch_id ? config.maps.branch[r.branch_id]?.name ?? 'Sucursal' : 'Todas las sucursales'}
                        </span>
                        {!r.is_active && <span style={{ marginLeft: 6, fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>(pausada)</span>}
                      </div>
                      <div style={{ fontSize: '0.83rem', marginTop: 4 }}>
                        <strong>Cuando:</strong> {d.when} &nbsp;→&nbsp; <strong>Hace:</strong> {d.does}
                      </div>
                      {r.description && <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: 2 }}>{r.description}</div>}
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
                        {r.run_count} ejecucion(es){r.last_run_at ? ` · última ${relTime(r.last_run_at)}` : ''}
                        {r.error_count > 0 && <span style={{ color: 'var(--color-danger)' }}> · {r.error_count} con errores</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button className="btn btn-secondary" style={{ height: 32 }} onClick={() => { setEditing(null); setHistory(r); }}>
                        Historial
                      </button>
                      {editable && (
                        <>
                          <button className="btn btn-secondary" style={{ height: 32 }} onClick={() => toggle(r)}>
                            {r.is_active ? 'Pausar' : 'Activar'}
                          </button>
                          <button className="btn btn-secondary" style={{ height: 32 }} onClick={() => { setHistory(null); setEditing(structuredClone(r)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                            Editar
                          </button>
                          <button className="btn btn-secondary" style={{ height: 32, color: 'var(--color-danger)' }} onClick={() => remove(r)}>
                            Eliminar
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}