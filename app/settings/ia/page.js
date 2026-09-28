'use client';
// Ruta: app/settings/ia/page.js
// IA: activar/desactivar, etiqueta automática de WhatsApp, tope mensual
// en USD y consumo del mes por función y por usuario.

import { useCallback, useEffect, useState } from 'react';
import RequirePermission from '../../../components/ui/requirePermission';
import { SettingsHeader } from '../../../components/settings/settingsTabs';
import { useSession } from '../../../lib/auth/sessionContext';
import { trackEvent } from '../../../lib/activity/tracker';
import { aiStatus, aiUsageSummary, saveAiSettings, usd } from '../../../lib/ai/api';

const FEATURES = {
  classify: 'Etiqueta automática de WhatsApp',
  summarize: 'Resumen y siguiente paso',
  reply: 'Respuestas sugeridas',
  extract: 'Datos detectados',
  transcribe: 'Transcripción de llamadas',
  analytics: 'Análisis comercial',
};

export default function AiSettingsPage() {
  return (
    <RequirePermission perm="ai.manage">
      <main style={{ padding: '1.5rem', maxWidth: 1000 }}>
        <SettingsHeader title="Inteligencia artificial" subtitle="La IA sugiere; las personas deciden. Aquí controlas qué está activo, el tope de gasto mensual y el consumo." />
        <AiSettings />
      </main>
    </RequirePermission>
  );
}

function AiSettings() {
  const { scopeOf } = useSession();
  const canEdit = scopeOf('ai.manage') === 'organization';
  const [status, setStatus] = useState(null);
  const [form, setForm] = useState(null);
  const [usage, setUsage] = useState(null);
  const [month, setMonth] = useState('');
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await aiStatus();
      setStatus(s);
      setForm({ enabled: s.enabled, autoClassify: s.auto_classify, budget: s.monthly_budget_usd });
      setUsage(await aiUsageSummary(month ? `${month}-01` : null));
    } catch (e) {
      setError(e.message);
    }
  }, [month]);
  useEffect(() => {
    load();
  }, [load]);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      setStatus(await saveAiSettings(form));
      setMsg('Guardado.');
      trackEvent('ai.settings_saved', { metadata: form });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!status || !form) return <p>{error ?? 'Cargando…'}</p>;
  const pct = status.monthly_budget_usd > 0 ? Math.min(100, (status.spent_usd / status.monthly_budget_usd) * 100) : 0;

  return (
    <>
      <section className="card" style={{ marginBottom: '1.2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
          <strong>Gasto de este mes</strong>
          <span>
            {usd(status.spent_usd)} de {usd(status.monthly_budget_usd)}
          </span>
        </div>
        <div role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} style={{ height: 10, borderRadius: 999, background: 'var(--color-border)', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: pct >= 100 ? 'var(--color-danger)' : pct >= 80 ? '#d97706' : '#8b5cf6' }} />
        </div>
        <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: 6 }}>
          Al llegar al 80 % se avisa a los administradores; al 100 % la IA se pausa hasta el próximo mes o hasta que subas el tope.
        </p>

        <form onSubmit={save} style={{ marginTop: 12, display: 'grid', gap: 10 }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.88rem' }}>
            <input type="checkbox" disabled={!canEdit} checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
            IA activa en la organización
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.88rem' }}>
            <input type="checkbox" disabled={!canEdit} checked={form.autoClassify} onChange={(e) => setForm({ ...form, autoClassify: e.target.checked })} />
            Etiquetar automáticamente cada WhatsApp entrante (intención y urgencia)
          </label>
          <label style={{ fontSize: '0.85rem' }}>
            Tope mensual (USD)
            <input className="input" type="number" min={0} step={1} disabled={!canEdit} style={{ width: 140, marginLeft: 8 }} value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} />
          </label>
          {canEdit && (
            <div>
              <button className="btn btn-primary" disabled={busy}>
                {busy ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          )}
          {msg && <p style={{ color: 'var(--color-success, #16a34a)', fontSize: '0.85rem' }}>{msg}</p>}
          {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem' }}>{error}</p>}
        </form>
      </section>

      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <h2 style={{ fontSize: '1.05rem' }}>Consumo {usage ? `· ${usd(usage.total_usd)}` : ''}</h2>
          <input className="input" type="month" style={{ width: 170 }} value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Mes" />
        </div>
        {!usage ? (
          <p>Cargando…</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1rem' }}>
            <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-border)' }}>
                    <th style={{ padding: '0.5rem 0.7rem' }}>Función</th>
                    <th style={{ padding: '0.5rem 0.7rem', textAlign: 'right' }}>Usos</th>
                    <th style={{ padding: '0.5rem 0.7rem', textAlign: 'right' }} title="Resultados reutilizados porque nada cambió (costo 0)">Reutilizados</th>
                    <th style={{ padding: '0.5rem 0.7rem', textAlign: 'right' }}>Costo</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.by_feature.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ padding: '1rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                        Sin uso este mes.
                      </td>
                    </tr>
                  )}
                  {usage.by_feature.map((f) => (
                    <tr key={f.feature} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '0.45rem 0.7rem' }}>{FEATURES[f.feature] ?? f.feature}</td>
                      <td style={{ padding: '0.45rem 0.7rem', textAlign: 'right' }}>{f.uses}</td>
                      <td style={{ padding: '0.45rem 0.7rem', textAlign: 'right' }}>{f.reused}</td>
                      <td style={{ padding: '0.45rem 0.7rem', textAlign: 'right' }}>{usd(f.cost, 4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-border)' }}>
                    <th style={{ padding: '0.5rem 0.7rem' }}>Usuario</th>
                    <th style={{ padding: '0.5rem 0.7rem', textAlign: 'right' }}>Usos</th>
                    <th style={{ padding: '0.5rem 0.7rem', textAlign: 'right' }}>Costo</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.by_user.map((u) => (
                    <tr key={u.user_id ?? 'auto'} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '0.45rem 0.7rem' }}>{u.name}</td>
                      <td style={{ padding: '0.45rem 0.7rem', textAlign: 'right' }}>{u.uses}</td>
                      <td style={{ padding: '0.45rem 0.7rem', textAlign: 'right' }}>{usd(u.cost, 4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </>
  );
}