'use client';
// Ruta: components/ai/aiLimits.js
// Límites de IA: tokens por minuto (organización y por usuario) y tope
// mensual por usuario, asignados individualmente o por grupo.
// Prioridad: individual > grupo > por defecto. Vacío = sin límite.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { trackEvent } from '../../lib/activity/tracker';
import {
  LIMIT_FROM, deleteAiGroup, listAiGroups, listUserLimits, saveAiGroup, saveAiLimits, setUserLimits, usd,
} from '../../lib/ai/api';

const label = { display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4 };
const th = { padding: '0.5rem 0.7rem', textAlign: 'left', color: 'var(--color-text-muted)', fontSize: '0.78rem' };
const td = { padding: '0.45rem 0.7rem', verticalAlign: 'middle' };
const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('es-CO'));

export default function AiLimits({ status, onChanged }) {
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);
  const [groups, setGroups] = useState([]);
  const [users, setUsers] = useState(null);

  const load = useCallback(async () => {
    try {
      const [g, u] = await Promise.all([listAiGroups(), listUserLimits()]);
      setGroups(g);
      setUsers(u);
    } catch (e) {
      setError(e.message);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const done = (text) => {
    setMsg(text);
    setError(null);
    load();
    onChanged?.();
  };

  return (
    <section style={{ marginBottom: '1.4rem' }}>
      <h2 style={{ fontSize: '1.05rem', marginBottom: 4 }}>Límites de uso</h2>
      <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: 10 }}>
        Prioridad: <strong>individual</strong> &gt; <strong>grupo</strong> &gt; <strong>por defecto</strong>. Vacío = sin límite en ese nivel. Para el límite por minuto, 1 minuto de audio transcrito cuenta como ~1.000 tokens. Una
        petición típica usa entre 1.500 y 3.000 tokens.
      </p>
      {msg && <p style={{ color: 'var(--color-success, #16a34a)', fontSize: '0.85rem', marginBottom: 8 }}>{msg}</p>}
      {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem', marginBottom: 8 }}>{error}</p>}

      <Defaults status={status} onSaved={() => done('Límites generales guardados.')} onError={setError} />
      <Groups groups={groups} onSaved={done} onError={setError} />
      <Users users={users} groups={groups} onSaved={done} onError={setError} />
    </section>
  );
}

function Defaults({ status, onSaved, onError }) {
  const [f, setF] = useState({
    orgTpm: status.org_tpm ?? '',
    userTpmDefault: status.user_tpm_default ?? '',
    userMonthlyDefault: status.user_monthly_default_usd ?? '',
  });
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="card"
      style={{ marginBottom: '1rem' }}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await saveAiLimits(f);
          trackEvent('ai.limits_saved', { metadata: f });
          onSaved();
        } catch (err) {
          onError(err.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, alignItems: 'end' }}>
        <div>
          <label style={label}>Tokens por minuto · toda la organización</label>
          <input className="input" type="number" min={0} step={500} placeholder="Sin límite" value={f.orgTpm} onChange={(e) => setF({ ...f, orgTpm: e.target.value })} />
          <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: 3 }}>Último minuto: {fmt(status.tokens_last_minute)} tokens</div>
        </div>
        <div>
          <label style={label}>Tokens por minuto · por usuario (por defecto)</label>
          <input className="input" type="number" min={0} step={500} placeholder="Sin límite" value={f.userTpmDefault} onChange={(e) => setF({ ...f, userTpmDefault: e.target.value })} />
        </div>
        <div>
          <label style={label}>Tope mensual por usuario en USD (por defecto)</label>
          <input className="input" type="number" min={0} step={0.5} placeholder="Sin límite" value={f.userMonthlyDefault} onChange={(e) => setF({ ...f, userMonthlyDefault: e.target.value })} />
        </div>
      </div>
      <button className="btn btn-primary" style={{ marginTop: 12 }} disabled={busy}>
        {busy ? 'Guardando…' : 'Guardar límites generales'}
      </button>
    </form>
  );
}

function Groups({ groups, onSaved, onError }) {
  const [edit, setEdit] = useState(null); // { id?, name, monthly, tpm }
  const [busy, setBusy] = useState(false);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await saveAiGroup(edit);
      trackEvent('ai.group_saved', { metadata: { name: edit.name } });
      setEdit(null);
      onSaved('Grupo guardado.');
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <strong style={{ fontSize: '0.92rem' }}>Grupos</strong>
        {!edit && (
          <button className="btn btn-secondary" style={{ height: 32 }} onClick={() => setEdit({ name: '', monthly: '', tpm: '' })}>
            + Nuevo grupo
          </button>
        )}
      </div>
      {edit && (
        <form onSubmit={save} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end', marginBottom: 10 }}>
          <div style={{ flex: '2 1 180px' }}>
            <label style={label}>Nombre</label>
            <input className="input" required maxLength={80} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Ej. Operadores ACA" />
          </div>
          <div style={{ flex: '1 1 140px' }}>
            <label style={label}>Tope mensual (USD)</label>
            <input className="input" type="number" min={0} step={0.5} placeholder="Sin límite" value={edit.monthly ?? ''} onChange={(e) => setEdit({ ...edit, monthly: e.target.value })} />
          </div>
          <div style={{ flex: '1 1 140px' }}>
            <label style={label}>Tokens por minuto</label>
            <input className="input" type="number" min={0} step={500} placeholder="Sin límite" value={edit.tpm ?? ''} onChange={(e) => setEdit({ ...edit, tpm: e.target.value })} />
          </div>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? '…' : 'Guardar'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setEdit(null)}>
            Cancelar
          </button>
        </form>
      )}
      {groups.length === 0 ? (
        <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>Sin grupos. Crea uno para asignar el mismo límite a varios usuarios a la vez.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
              <th style={th}>Grupo</th>
              <th style={th}>Tope mensual</th>
              <th style={th}>Tokens / min</th>
              <th style={th} />
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={td}>{g.name}</td>
                <td style={td}>{g.monthly_usd == null ? 'Sin límite' : usd(g.monthly_usd)}</td>
                <td style={td}>{g.tpm == null ? 'Sin límite' : fmt(g.tpm)}</td>
                <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button className="btn btn-secondary" style={{ height: 28 }} onClick={() => setEdit({ id: g.id, name: g.name, monthly: g.monthly_usd ?? '', tpm: g.tpm ?? '' })}>
                    Editar
                  </button>{' '}
                  <button
                    className="btn btn-secondary"
                    style={{ height: 28, color: 'var(--color-danger)' }}
                    onClick={async () => {
                      if (!window.confirm(`¿Eliminar el grupo “${g.name}”? Sus miembros pasan al límite por defecto.`)) return;
                      try {
                        await deleteAiGroup(g.id);
                        onSaved('Grupo eliminado.');
                      } catch (err) {
                        onError(err.message);
                      }
                    }}
                  >
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Users({ users, groups, onSaved, onError }) {
  const [sel, setSel] = useState([]);
  const [bulk, setBulk] = useState({ groupId: '', monthly: '', tpm: '' });
  const [drafts, setDrafts] = useState({});
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const groupMap = useMemo(() => Object.fromEntries(groups.map((g) => [g.id, g])), [groups]);

  useEffect(() => {
    if (!users) return;
    setDrafts(Object.fromEntries(users.map((u) => [u.user_id, { groupId: u.group_id ?? '', monthly: u.own_monthly_usd ?? '', tpm: u.own_tpm ?? '' }])));
  }, [users]);

  if (!users) return <p>Cargando usuarios…</p>;
  const list = users.filter((u) => !q || `${u.name} ${u.email} ${u.role_name ?? ''}`.toLowerCase().includes(q.toLowerCase()));

  async function apply(ids, values, text) {
    setBusy(true);
    try {
      await setUserLimits(ids, values);
      trackEvent('ai.user_limits_saved', { metadata: { count: ids.length, ...values } });
      setSel([]);
      onSaved(text);
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ padding: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '0.8rem 0.9rem' }}>
        <strong style={{ fontSize: '0.92rem' }}>Usuarios</strong>
        <input className="input" style={{ maxWidth: 240 }} placeholder="Buscar usuario o rol…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {sel.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end', padding: '0.6rem 0.9rem', background: 'var(--color-active-bg)' }}>
          <strong style={{ fontSize: '0.82rem', alignSelf: 'center' }}>{sel.length} seleccionado(s):</strong>
          <select className="input" style={{ width: 180, height: 34 }} value={bulk.groupId} onChange={(e) => setBulk({ ...bulk, groupId: e.target.value })} aria-label="Grupo">
            <option value="">Sin grupo</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <input className="input" style={{ width: 130, height: 34 }} type="number" min={0} step={0.5} placeholder="USD/mes propio" value={bulk.monthly} onChange={(e) => setBulk({ ...bulk, monthly: e.target.value })} />
          <input className="input" style={{ width: 130, height: 34 }} type="number" min={0} step={500} placeholder="Tokens/min propio" value={bulk.tpm} onChange={(e) => setBulk({ ...bulk, tpm: e.target.value })} />
          <button className="btn btn-primary" style={{ height: 34 }} disabled={busy} onClick={() => apply(sel, bulk, `Límites aplicados a ${sel.length} usuario(s).`)}>
            Aplicar
          </button>
          <button className="btn btn-secondary" style={{ height: 34 }} onClick={() => setSel([])}>
            Cancelar
          </button>
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
              <th style={th}>
                <input
                  type="checkbox"
                  aria-label="Seleccionar todos"
                  checked={list.length > 0 && list.every((u) => sel.includes(u.user_id))}
                  onChange={(e) => setSel(e.target.checked ? list.map((u) => u.user_id) : [])}
                />
              </th>
              <th style={th}>Usuario</th>
              <th style={th}>Grupo</th>
              <th style={th}>USD/mes propio</th>
              <th style={th}>Tokens/min propio</th>
              <th style={th}>Límite que aplica</th>
              <th style={th}>Gastado este mes</th>
              <th style={th} />
            </tr>
          </thead>
          <tbody>
            {list.map((u) => {
              const d = drafts[u.user_id] ?? { groupId: '', monthly: '', tpm: '' };
              const dirty = (d.groupId || null) !== (u.group_id || null) || String(d.monthly ?? '') !== String(u.own_monthly_usd ?? '') || String(d.tpm ?? '') !== String(u.own_tpm ?? '');
              const ef = u.effective ?? {};
              const pct = ef.monthly_usd ? Math.min(100, (u.spent_usd / ef.monthly_usd) * 100) : 0;
              const set = (p) => setDrafts((x) => ({ ...x, [u.user_id]: { ...d, ...p } }));
              return (
                <tr key={u.user_id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={td}>
                    <input type="checkbox" aria-label={`Seleccionar ${u.name}`} checked={sel.includes(u.user_id)} onChange={(e) => setSel((s) => (e.target.checked ? [...s, u.user_id] : s.filter((x) => x !== u.user_id)))} />
                  </td>
                  <td style={td}>
                    <div style={{ fontWeight: 600 }}>{u.name}</div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--color-text-muted)' }}>{u.role_name ?? ''}</div>
                  </td>
                  <td style={td}>
                    <select className="input" style={{ height: 32, minWidth: 140 }} value={d.groupId} onChange={(e) => set({ groupId: e.target.value })}>
                      <option value="">Sin grupo</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={td}>
                    <input className="input" style={{ width: 100, height: 32 }} type="number" min={0} step={0.5} placeholder="—" value={d.monthly} onChange={(e) => set({ monthly: e.target.value })} />
                  </td>
                  <td style={td}>
                    <input className="input" style={{ width: 100, height: 32 }} type="number" min={0} step={500} placeholder="—" value={d.tpm} onChange={(e) => set({ tpm: e.target.value })} />
                  </td>
                  <td style={{ ...td, fontSize: '0.78rem' }}>
                    <div>{ef.monthly_usd == null ? 'Sin tope mensual' : `${usd(ef.monthly_usd)}/mes (${LIMIT_FROM[ef.monthly_from] ?? ''})`}</div>
                    <div style={{ color: 'var(--color-text-muted)' }}>{ef.tpm == null ? 'Sin límite/min' : `${fmt(ef.tpm)} tokens/min (${LIMIT_FROM[ef.tpm_from] ?? ''})`}</div>
                    {ef.group_name && groupMap[u.group_id] && <div style={{ color: 'var(--color-text-muted)' }}>Grupo: {ef.group_name}</div>}
                  </td>
                  <td style={{ ...td, minWidth: 120 }}>
                    <div>{usd(u.spent_usd)}</div>
                    {ef.monthly_usd != null && (
                      <div style={{ height: 6, borderRadius: 999, background: 'var(--color-border)', marginTop: 4, overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: pct >= 100 ? 'var(--color-danger)' : pct >= 80 ? '#d97706' : '#8b5cf6' }} />
                      </div>
                    )}
                  </td>
                  <td style={td}>
                    <button className="btn btn-primary" style={{ height: 30 }} disabled={!dirty || busy} onClick={() => apply([u.user_id], d, `Límites de ${u.name} guardados.`)}>
                      Guardar
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}