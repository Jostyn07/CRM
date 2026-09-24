'use client';
// Ruta: app/settings/minutos/page.js
// Reparto de minutos: la organización tiene una bolsa (la carga el
// Platform Owner) y el administrador la reparte entre sus usuarios.
// Solo consume el tiempo conectado de las llamadas.

import { useCallback, useEffect, useState } from 'react';
import RequirePermission from '../../../components/ui/requirePermission';
import { SettingsHeader, bodyRow, cell, errorText, headRow } from '../../../components/settings/settingsTabs';
import { supabase } from '../../../lib/supabase/client';
import { fmtMinutes } from '../../../lib/calls/api';
import { fullDate } from '../../../lib/leads/format';

export default function MinutesPage() {
  return (
    <RequirePermission perm="calls.manage_minutes">
      <Minutes />
    </RequirePermission>
  );
}

function Minutes() {
  const [summary, setSummary] = useState(null);
  const [users, setUsers] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [amounts, setAmounts] = useState({});
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    const [s, p, um, l] = await Promise.all([
      supabase.rpc('get_minutes_summary'),
      supabase.from('profiles').select('id, full_name, email, status').in('status', ['active', 'invited']).order('full_name'),
      supabase.from('user_minutes').select('*'),
      supabase.from('minute_ledger').select('*').order('created_at', { ascending: false }).limit(30),
    ]);
    const byUser = Object.fromEntries((um.data ?? []).map((m) => [m.user_id, m]));
    setSummary(s.data);
    setUsers((p.data ?? []).map((u) => ({ ...u, name: u.full_name || u.email, m: byUser[u.id] ?? { assigned_seconds: 0, used_seconds: 0 } })));
    setLedger(l.data ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function assign(userId, sign) {
    const n = Number(amounts[userId]);
    if (!n || n <= 0) return setMsg('Escribe una cantidad de minutos mayor que cero.');
    setMsg(null);
    const { error } = await supabase.rpc('assign_user_minutes', { p_user: userId, p_minutes: sign * Math.round(n) });
    if (error) return setMsg(await errorText(error));
    setAmounts((a) => ({ ...a, [userId]: '' }));
    load();
  }

  const unassigned = summary ? summary.granted_seconds - summary.assigned_seconds : 0;
  const name = (id) => users.find((u) => u.id === id)?.name ?? '—';
  const KIND = { org_grant: 'Carga a la organización', user_assign: 'Asignación a usuario', call_usage: 'Consumo de llamada' };

  return (
    <main style={{ padding: '1.5rem', maxWidth: 1100 }}>
      <SettingsHeader title="Minutos" subtitle="Reparte la bolsa de minutos de tu organización. Solo se descuenta el tiempo en que la llamada estuvo conectada." />

      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: '1rem' }}>
          {[
            ['Bolsa de la organización', summary.granted_seconds],
            ['Repartidos a usuarios', summary.assigned_seconds],
            ['Sin repartir', unassigned],
            ['Consumidos', summary.used_seconds],
          ].map(([l, v]) => (
            <div key={l} className="card" style={{ padding: '0.7rem 1rem' }}>
              <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>{fmtMinutes(v)}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>{l}</div>
            </div>
          ))}
        </div>
      )}
      {summary && summary.granted_seconds === 0 && (
        <p style={{ fontSize: '0.85rem', marginBottom: '0.8rem' }}>Tu organización todavía no tiene minutos. Contacta al proveedor de la plataforma para adquirirlos.</p>
      )}
      {msg && <p style={{ color: 'var(--color-danger)', fontSize: '0.86rem', marginBottom: '0.8rem' }}>{msg}</p>}

      <div className="card" style={{ padding: 0, overflowX: 'auto', marginBottom: '1.2rem' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
          <thead>
            <tr style={headRow}>
              <th style={cell}>Usuario</th>
              <th style={cell}>Asignados</th>
              <th style={cell}>Usados</th>
              <th style={cell}>Disponibles</th>
              <th style={cell}>Ajustar (minutos)</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={bodyRow}>
                <td style={cell}>
                  <strong>{u.name}</strong>
                  <div style={{ fontSize: '0.76rem', color: 'var(--color-text-muted)' }}>{u.email}</div>
                </td>
                <td style={cell}>{fmtMinutes(u.m.assigned_seconds)}</td>
                <td style={cell}>{fmtMinutes(u.m.used_seconds)}</td>
                <td style={cell}>{fmtMinutes(u.m.assigned_seconds - u.m.used_seconds)}</td>
                <td style={{ ...cell, whiteSpace: 'nowrap' }}>
                  <input
                    className="input"
                    type="number"
                    min="1"
                    style={{ width: 90, height: 32 }}
                    value={amounts[u.id] ?? ''}
                    onChange={(e) => setAmounts((a) => ({ ...a, [u.id]: e.target.value }))}
                  />{' '}
                  <button className="btn btn-primary" onClick={() => assign(u.id, 1)}>
                    + Dar
                  </button>{' '}
                  <button className="btn btn-secondary" onClick={() => assign(u.id, -1)}>
                    − Quitar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 style={{ fontSize: '0.95rem', marginBottom: '0.5rem' }}>Movimientos recientes</h3>
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
          <thead>
            <tr style={headRow}>
              <th style={cell}>Fecha</th>
              <th style={cell}>Movimiento</th>
              <th style={cell}>Usuario</th>
              <th style={cell}>Minutos</th>
              <th style={cell}>Nota</th>
            </tr>
          </thead>
          <tbody>
            {ledger.map((l) => (
              <tr key={l.id} style={bodyRow}>
                <td style={cell}>{fullDate(l.created_at)}</td>
                <td style={cell}>{KIND[l.kind]}</td>
                <td style={cell}>{l.user_id ? name(l.user_id) : '—'}</td>
                <td style={{ ...cell, color: l.delta_seconds < 0 ? 'var(--color-danger)' : undefined }}>
                  {l.delta_seconds < 0 ? '−' : '+'}
                  {(Math.abs(l.delta_seconds) / 60).toLocaleString('es-CO', { maximumFractionDigits: 1 })}
                </td>
                <td style={cell}>{l.note ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}