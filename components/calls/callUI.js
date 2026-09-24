'use client';
// Ruta: components/calls/callUI.js
// Marcador ("Nueva llamada") y panel de la llamada en curso.
// Se monta una sola vez en app/layout.js.

import { useEffect, useState } from 'react';
import Modal from '../ui/modal';
import { useCalls } from '../../lib/calls/callContext';
import { useSession } from '../../lib/auth/sessionContext';
import { RESULTS, TECHNICAL_STATUS, fmtDuration, fmtMinutes, getMinutesSummary, getMyNumbers } from '../../lib/calls/api';

const PREFIXES = ['+1', '+57', '+52', '+58', '+51', '+593', '+34'];
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

export default function CallUI() {
  const { can, user } = useSession();
  const calls = useCalls();
  if (!user || !can('calls.make')) return null;
  return (
    <>
      <Dialer />
      {calls.phase !== 'idle' && <InCall />}
    </>
  );
}

// ------------------------------------------------------------ Marcador
function Dialer() {
  const { branches } = useSession();
  const { dialer, closeDialer, startCall, error, phase } = useCalls();
  const [numbers, setNumbers] = useState([]);
  const [minutes, setMinutes] = useState(null);
  const [prefix, setPrefix] = useState('+1');
  const [number, setNumber] = useState('');
  const [fromId, setFromId] = useState('');

  useEffect(() => {
    if (!dialer) return;
    setNumber(dialer.to ?? '');
    getMyNumbers().then((list) => {
      const mine = list.filter((n) => branches.some((b) => b.id === n.branch_id));
      setNumbers(mine);
      setFromId('');
    });
    getMinutesSummary().then(setMinutes);
  }, [dialer, branches]);

  if (!dialer) return null;

  const available = minutes ? minutes.my_assigned_seconds - minutes.my_used_seconds : null;
  const full = number.trim().startsWith('+') || number.trim().startsWith('00') ? number.trim() : `${prefix} ${number.trim()}`;

  return (
    <Modal open onClose={closeDialer} title="Nueva llamada" width={400} zIndex={60}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!number.trim() && !dialer.leadId) return;
          startCall({ to: number.trim() ? full : null, leadId: dialer.leadId, leadName: dialer.leadName, fromNumberId: fromId || null });
        }}
      >
        {dialer.leadName && (
          <p style={{ fontSize: '0.9rem', marginBottom: '0.6rem' }}>
            Llamar a <strong>{dialer.leadName}</strong>
          </p>
        )}
        <div style={{ display: 'flex', gap: 6, marginBottom: '0.7rem' }}>
          <select className="input" style={{ width: 90 }} value={prefix} onChange={(e) => setPrefix(e.target.value)} disabled={number.trim().startsWith('+')} aria-label="Prefijo">
            {PREFIXES.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
          <input className="input" type="tel" autoFocus value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Número a llamar" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: '0.8rem' }}>
          {KEYS.map((k) => (
            <button key={k} type="button" className="btn btn-secondary" style={{ justifyContent: 'center', fontSize: '1.05rem' }} onClick={() => setNumber((n) => n + k)}>
              {k}
            </button>
          ))}
        </div>

        <label style={{ display: 'block', marginBottom: '0.7rem' }}>
          <span style={{ fontSize: '0.82rem' }}>Llamar desde</span>
          <select className="input" value={fromId} onChange={(e) => setFromId(e.target.value)}>
            <option value="">Automático (número de la sucursal)</option>
            {numbers.map((n) => (
              <option key={n.id} value={n.id}>
                {n.e164}
                {n.label ? ` · ${n.label}` : ''}
              </option>
            ))}
          </select>
        </label>
        {numbers.length === 0 && (
          <p style={{ fontSize: '0.8rem', color: 'var(--color-danger)', marginBottom: '0.6rem' }}>Tu sucursal todavía no tiene números de salida.</p>
        )}

        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
          Minutos disponibles: <strong>{available == null ? '—' : fmtMinutes(available)}</strong> · Llamada por Telnyx
        </p>
        <p style={{ fontSize: '0.78rem', padding: '0.45rem 0.6rem', borderRadius: 'var(--radius)', background: 'var(--color-status-default-bg)', marginBottom: '0.8rem' }}>
          🔴 Esta llamada será grabada. Informa a la persona al inicio de la conversación.
        </p>

        {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem', marginBottom: '0.6rem' }}>{error}</p>}
        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={phase !== 'idle' || (!number.trim() && !dialer.leadId)}>
          📞 Llamar
        </button>
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------ Llamada en curso
function InCall() {
  const { call, phase, serverStatus, elapsed, muted, minimized, setMinimized, hangup, toggleMute, sendDtmf, saveResult, error } = useCalls();
  const [showKeys, setShowKeys] = useState(false);
  const [result, setResult] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  useEffect(() => {
    if (phase === 'ended') {
      setResult(elapsed > 0 ? '' : 'no_contesto');
      setNotes('');
      setSaveError(null);
    }
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const label =
    phase === 'dialing' ? 'Conectando…' : phase === 'ringing' ? 'Sonando…' : phase === 'active' ? fmtDuration(elapsed) : phase === 'ended' ? 'Llamada terminada' : '';
  const who = call?.leadName || call?.to || '';

  if (minimized && phase !== 'ended') {
    return (
      <button
        onClick={() => setMinimized(false)}
        className="btn btn-primary"
        style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 70, borderRadius: 999, boxShadow: '0 6px 20px rgba(0,0,0,0.3)' }}
      >
        📞 {who} · {label}
      </button>
    );
  }

  return (
    <div className="card" style={{ position: 'fixed', bottom: 20, right: 20, width: 330, zIndex: 70, boxShadow: '0 10px 30px rgba(0,0,0,0.35)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontWeight: 700 }}>{who}</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
            {call?.to} · {call?.callType === 'external' ? 'Externa' : 'Lead'}
          </div>
        </div>
        {phase !== 'ended' && (
          <button onClick={() => setMinimized(true)} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)' }} aria-label="Minimizar">
            ▁
          </button>
        )}
      </div>

      <div style={{ fontSize: '1.4rem', fontWeight: 700, textAlign: 'center', margin: '0.8rem 0 0.2rem' }}>{label}</div>
      {phase === 'active' && <div style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--color-danger)' }}>● Grabando</div>}
      {serverStatus && (
        <div style={{ textAlign: 'center', fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>Estado registrado: {TECHNICAL_STATUS[serverStatus]}</div>
      )}
      {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.82rem', marginTop: 6 }}>{error}</p>}

      {phase !== 'ended' ? (
        <>
          {showKeys && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5, margin: '0.7rem 0' }}>
              {KEYS.map((k) => (
                <button key={k} className="btn btn-secondary" style={{ justifyContent: 'center' }} onClick={() => sendDtmf(k)}>
                  {k}
                </button>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, marginTop: '0.8rem' }}>
            <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={toggleMute} disabled={phase !== 'active'}>
              {muted ? '🔇 Activar' : '🎙️ Silenciar'}
            </button>
            <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setShowKeys((v) => !v)} disabled={phase !== 'active'}>
              ⌨️ Teclado
            </button>
          </div>
          <button className="btn btn-primary" onClick={hangup} style={{ width: '100%', justifyContent: 'center', marginTop: 8, background: 'var(--color-danger)' }}>
            Colgar
          </button>
        </>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setSaving(true);
            setSaveError(null);
            try {
              await saveResult(result, notes);
            } catch (err) {
              setSaveError(err.message);
            } finally {
              setSaving(false);
            }
          }}
          style={{ marginTop: '0.8rem' }}
        >
          <label style={{ display: 'block', marginBottom: 6 }}>
            <span style={{ fontSize: '0.82rem' }}>Resultado</span>
            <select className="input" value={result} onChange={(e) => setResult(e.target.value)} required>
              <option value="" disabled>
                Selecciona…
              </option>
              {Object.entries(RESULTS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <textarea className="input" rows={2} placeholder="Notas (opcional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          {saveError && <p style={{ color: 'var(--color-danger)', fontSize: '0.8rem', marginTop: 4 }}>{saveError}</p>}
          <button className="btn btn-primary" disabled={saving || !result} style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>
            {saving ? 'Guardando…' : 'Guardar resultado'}
          </button>
        </form>
      )}
    </div>
  );
}