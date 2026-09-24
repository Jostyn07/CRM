'use client';
// Ruta: lib/calls/callContext.js
// Proveedor global de llamadas: la llamada sigue activa aunque el
// usuario cambie de página. Cualquier pantalla abre el marcador con:
//   const { openDialer } = useCalls();
//   openDialer({ to: '+13055551234', leadId, leadName });

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase/client';
import { getTelnyxClient } from '../telnyx/client';
import { markClientEnded, prepareCall, setCallResult } from './api';
import { trackEvent } from '../activity/tracker';

const CallContext = createContext(null);

// Estados de la llamada en el navegador (el estado oficial lo pone el servidor)
// idle → dialing → ringing → active → ended (→ se guarda el resultado) → idle
export function CallProvider({ children }) {
  const [dialer, setDialer] = useState(null); // { to, leadId, leadName } cuando el marcador está abierto
  const [call, setCall] = useState(null); // { id, to, from, leadId, leadName, callType }
  const [phase, setPhase] = useState('idle');
  const [serverStatus, setServerStatus] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [muted, setMuted] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [error, setError] = useState(null);

  const rtcCall = useRef(null);
  const clientRef = useRef(null);
  const handlerRef = useRef(null);
  const connected = useRef(false);
  const ended = useRef(false);
  const timer = useRef(null);

  const cleanupListener = () => {
    if (clientRef.current && handlerRef.current) clientRef.current.off('telnyx.notification', handlerRef.current);
    handlerRef.current = null;
  };

  const openDialer = useCallback((opts = {}) => {
    if (phase !== 'idle') {
      setMinimized(false);
      return;
    }
    setError(null);
    setDialer(opts);
  }, [phase]);

  const closeDialer = useCallback(() => setDialer(null), []);

  // Estado del servidor en tiempo real (webhooks de Telnyx)
  useEffect(() => {
    if (!call?.id) return;
    const channel = supabase
      .channel(`call:${call.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'calls', filter: `id=eq.${call.id}` }, (p) =>
        setServerStatus(p.new?.technical_status ?? null)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [call?.id]);

  function finish(reasonIfNotConnected) {
    if (ended.current) return; // hangup y destroy pueden llegar ambos
    ended.current = true;
    clearInterval(timer.current);
    cleanupListener();
    rtcCall.current = null;
    if (!connected.current && call?.id) markClientEnded(call.id, reasonIfNotConnected);
    setPhase('ended');
    setMinimized(false);
  }

  const startCall = useCallback(async ({ to, leadId, leadName, fromNumberId }) => {
    setError(null);
    setPhase('dialing');
    connected.current = false;
    ended.current = false;
    setElapsed(0);
    setMuted(false);
    let prepared = null;
    try {
      // 1. El servidor valida permiso, minutos y número, y crea el registro
      prepared = await prepareCall({ to, leadId, fromNumberId });
      const current = { id: prepared.call_id, to: prepared.to, from: prepared.from, leadId: prepared.lead_id, leadName, callType: prepared.call_type };
      setCall(current);
      setDialer(null);
      trackEvent('call.start', { entityType: 'calls', entityId: prepared.call_id, metadata: { type: prepared.call_type } });

      // 2. Conexión WebRTC y marcado
      const client = await getTelnyxClient();
      clientRef.current = client;

      const onNotification = (n) => {
        if (n.type !== 'callUpdate') return;
        const s = n.call?.state;
        if (s === 'ringing' || s === 'early') setPhase('ringing');
        if (s === 'active') {
          if (!connected.current) {
            connected.current = true;
            timer.current = setInterval(() => setElapsed((e) => e + 1), 1000);
          }
          setPhase('active');
        }
        if (s === 'hangup' || s === 'destroy') finishRef.current?.('cancelada');
      };
      handlerRef.current = onNotification;
      client.on('telnyx.notification', onNotification);

      let c = client.newCall({
        destinationNumber: prepared.to,
        callerNumber: prepared.from,
        clientState: prepared.client_state,
      });
      if (c && typeof c.then === 'function') c = await c;
      rtcCall.current = c;
    } catch (e) {
      cleanupListener();
      ended.current = true;
      if (prepared?.call_id) markClientEnded(prepared.call_id, 'fallida');
      setError(e?.message || 'No se pudo iniciar la llamada.');
      setPhase(prepared ? 'ended' : 'idle');
      if (!prepared) setDialer((d) => d ?? { to, leadId, leadName });
    }
  }, []);

  // Referencia estable para usar dentro del manejador de eventos
  const finishRef = useRef(null);
  finishRef.current = finish;

  const hangup = useCallback(async () => {
    try {
      await rtcCall.current?.hangup();
    } catch {}
    finishRef.current?.('cancelada');
  }, []);

  const toggleMute = useCallback(() => {
    if (!rtcCall.current) return;
    if (muted) rtcCall.current.unmuteAudio();
    else rtcCall.current.muteAudio();
    setMuted((m) => !m);
  }, [muted]);

  const sendDtmf = useCallback((digit) => rtcCall.current?.dtmf(digit), []);

  const saveResult = useCallback(
    async (result, notes) => {
      if (result) await setCallResult(call.id, result, notes);
      trackEvent('call.result_saved', { entityType: 'calls', entityId: call.id, metadata: { result } });
      setCall(null);
      setServerStatus(null);
      setPhase('idle');
    },
    [call]
  );

  // Evita cerrar la pestaña con una llamada en curso
  useEffect(() => {
    const warn = (e) => {
      if (phase === 'active' || phase === 'ringing' || phase === 'dialing') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [phase]);

  useEffect(() => () => clearInterval(timer.current), []);

  const value = {
    dialer,
    openDialer,
    closeDialer,
    startCall,
    call,
    phase,
    serverStatus,
    elapsed,
    muted,
    minimized,
    setMinimized,
    error,
    hangup,
    toggleMute,
    sendDtmf,
    saveResult,
  };

  return (
    <CallContext.Provider value={value}>
      {children}
      {/* Audio remoto de Telnyx (lo usa lib/telnyx/client.js) */}
      <audio id="telnyx-remote-audio" autoPlay playsInline />
    </CallContext.Provider>
  );
}

export function useCalls() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCalls debe usarse dentro de <CallProvider>');
  return ctx;
}