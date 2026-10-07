'use client';
// Ruta: app/settings/tareas-asesorias/page.js
// Sincronización de tareas con Asesorías (recordatorios), en tiempo real y
// en los dos sentidos. Aquí se activa, se ve el estado y se obtienen los
// datos que hay que pegar en Asesorías (dirección, organización y secreto).

import { useCallback, useEffect, useState } from 'react';
import RequirePermission from '../../../components/ui/requirePermission';
import { SettingsHeader } from '../../../components/settings/settingsTabs';
import Icon, { IconText } from '../../../components/ui/icon';
import { supabase } from '../../../lib/supabase/client';
import { trackEvent } from '../../../lib/activity/tracker';

const FN_URL = `${(process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '')}/functions/v1/tasks-sync`;

async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}

const when = (iso) => (iso ? new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

export default function TaskSyncPage() {
  return (
    <RequirePermission perm="clients.manage">
      <main style={{ padding: '1.5rem', maxWidth: 980 }}>
        <SettingsHeader
          title="Tareas con Asesorías"
          subtitle="Las tareas de Xiris y los recordatorios de Asesorías son la misma tarea: crear, editar, notas, completar, reabrir y cancelar se reflejan en las dos al instante."
        />
        <TaskSync />
      </main>
    </RequirePermission>
  );
}

function Copy({ label, value, mono = true }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="ts-copy">
      <small>{label}</small>
      <div>
        <code style={{ fontFamily: mono ? undefined : 'inherit' }}>{value || '—'}</code>
        {value && (
          <button
            type="button"
            className="ts-copy-btn"
            title="Copiar"
            onClick={() => {
              navigator.clipboard?.writeText(value);
              setOk(true);
              setTimeout(() => setOk(false), 1500);
            }}
          >
            <Icon name={ok ? 'check' : 'copy'} size={15} />
          </button>
        )}
      </div>
    </div>
  );
}

function TaskSync() {
  const [s, setS] = useState(null);
  const [url, setUrl] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [secret, setSecret] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const d = await rpc('task_sync_status');
      setS(d);
      setUrl(d.peer_url ?? '');
      setEnabled(!!d.enabled);
    } catch (e) {
      setError(e.message);
    }
  }, []);
  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  async function run(fn, okMsg) {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const r = await fn();
      if (okMsg) setMsg(typeof okMsg === 'function' ? okMsg(r) : okMsg);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!s) return <p style={{ color: 'var(--color-text-muted)' }}>{error ?? 'Cargando…'}</p>;

  const healthy = s.enabled && s.last_ok_at && (!s.last_error_at || new Date(s.last_ok_at) > new Date(s.last_error_at));

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <section className="card ts-status">
        <span className={`ts-dot ${!s.enabled ? 'off' : healthy ? 'ok' : s.last_error ? 'err' : 'wait'}`} />
        <div>
          <strong>{!s.enabled ? 'Apagada' : healthy ? 'Funcionando' : s.last_error ? 'Con errores' : 'Esperando el primer envío'}</strong>
          <small>
            Último envío correcto: {when(s.last_ok_at)}
            {s.last_error && s.last_error_at && ` · Último error: ${when(s.last_error_at)}`}
          </small>
        </div>
        <div className="ts-nums">
          <span>
            <b>{s.linked}</b> vinculadas
          </span>
          <span>
            <b>{s.pending}</b> en cola
          </span>
          <span className={s.failed ? 'bad' : ''}>
            <b>{s.failed}</b> fallidas
          </span>
          <span>
            <b>{s.skipped}</b> sin usuario
          </span>
          <span>
            <b>{s.received_today}</b> recibidas hoy
          </span>
        </div>
      </section>

      <section className="card" style={{ display: 'grid', gap: 12 }}>
        <h3 style={{ fontSize: '0.98rem', margin: 0 }}>Conexión</h3>
        <label className="tk-check">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span>
            <b>Sincronizar tareas con Asesorías</b>
            <small>Solo viajan las tareas cuyo responsable existe en las dos plataformas con el mismo correo.</small>
          </span>
        </label>
        <label className="tk-label">
          Dirección de la función de Asesorías (xiris-tareas)
          <input className="input" placeholder="https://<proyecto-asesorias>.supabase.co/functions/v1/xiris-tareas" value={url} onChange={(e) => setUrl(e.target.value)} />
        </label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const r = await rpc('task_sync_save', { p_enabled: enabled, p_peer_url: url });
                trackEvent('task_sync.saved', { metadata: { enabled } });
                return r;
              }, 'Guardado.')
            }
          >
            Guardar
          </button>
          <button className="btn btn-secondary" disabled={busy || !s.enabled} onClick={() => run(() => rpc('task_sync_backfill', { p_days: 60 }), (n) => `${n} tarea(s) abiertas enviadas a Asesorías.`)}>
            <IconText name="upload" size={15}>Enviar tareas abiertas existentes</IconText>
          </button>
          {s.failed > 0 && (
            <button className="btn btn-secondary" disabled={busy} onClick={() => run(() => rpc('task_sync_retry_failed'), (n) => `${n} evento(s) se volverán a enviar.`)}>
              <IconText name="refresh-cw" size={15}>Reintentar fallidas</IconText>
            </button>
          )}
        </div>
        {msg && <p style={{ fontSize: '0.85rem', margin: 0 }}>{msg}</p>}
        {error && <p className="tk-error">{error}</p>}
      </section>

      <section className="card" style={{ display: 'grid', gap: 10 }}>
        <h3 style={{ fontSize: '0.98rem', margin: 0 }}>Datos para Asesorías</h3>
        <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', margin: 0 }}>
          En el SQL Editor de Asesorías se corre <code>SELECT public.xiris_sync_configurar(dirección de Xiris, organización, secreto, dirección de xiris-tareas);</code> con estos datos.
        </p>
        <Copy label="Dirección de Xiris (tasks-sync)" value={FN_URL} />
        <Copy label="Organización en Xiris" value={s.organization_id} />
        <div className="ts-copy">
          <small>Secreto compartido</small>
          {secret ? (
            <>
              <Copy label="" value={secret} />
              <p style={{ fontSize: '0.78rem', color: 'var(--color-warning, #c9861d)', margin: 0 }}>
                Cópialo ahora: no se vuelve a mostrar. Si lo cambias, hay que actualizarlo también en Asesorías.
              </p>
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <code>{s.secret_hint}</code>
              <button
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => {
                  if (s.enabled && !confirm('Si generas un secreto nuevo, la sincronización se detiene hasta que lo pegues en Asesorías. ¿Continuar?')) return;
                  run(async () => {
                    const v = await rpc('task_sync_rotate_secret');
                    setSecret(v);
                    return v;
                  });
                }}
              >
                <IconText name="key-round" size={15}>Generar secreto nuevo</IconText>
              </button>
            </div>
          )}
        </div>
      </section>

      {s.recent_errors?.length > 0 && (
        <section className="card">
          <h3 style={{ fontSize: '0.98rem', margin: '0 0 8px' }}>Avisos recientes</h3>
          <ul className="ts-errors">
            {s.recent_errors.map((e, i) => (
              <li key={i}>
                <small>
                  {when(e.at)} · {e.direction === 'in' ? 'Llegó de Asesorías' : 'Hacia Asesorías'}
                  {e.title ? ` · ${e.title}` : ''}
                </small>
                <span>{e.error}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}