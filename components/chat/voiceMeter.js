'use client';
// Ruta: components/chat/voiceMeter.js
// Onda de voz en vivo mientras se graba una nota de voz: barras que se
// mueven con el volumen del micrófono (Web Audio API, AnalyserNode).
// Si no llega sonido, las barras quedan planas y se avisa.

import { useEffect, useRef, useState } from 'react';

const BARS = 48;

export default function VoiceMeter({ stream, height = 36 }) {
  const canvasRef = useRef(null);
  const [silent, setSilent] = useState(false);

  useEffect(() => {
    if (!stream) return undefined;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return undefined;

    const ctx = new AudioCtx();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.6;
    source.connect(analyser);

    const data = new Uint8Array(analyser.fftSize);
    const levels = new Array(BARS).fill(0.04);
    const color = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() || '#6366f1';
    let raf;
    let lastPush = 0;
    let quietSince = performance.now();

    const draw = (t) => {
      raf = requestAnimationFrame(draw);
      analyser.getByteTimeDomainData(data);
      // Volumen (RMS) de la muestra actual
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      const level = Math.min(1, Math.max(0.04, rms * 4.5));

      if (rms > 0.02) quietSince = t;
      setSilent(t - quietSince > 2500);

      // Una barra nueva cada ~60 ms: la onda "avanza" como en WhatsApp
      if (t - lastPush > 60) {
        levels.shift();
        levels.push(level);
        lastPush = t;
      } else {
        levels[levels.length - 1] = Math.max(levels[levels.length - 1], level);
      }

      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      const g = canvas.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const gap = 2;
      const bw = Math.max(2, (w - gap * (BARS - 1)) / BARS);
      g.fillStyle = color;
      levels.forEach((lv, i) => {
        const bh = Math.max(3, lv * h);
        const x = i * (bw + gap);
        const y = (h - bh) / 2;
        g.globalAlpha = 0.35 + 0.65 * (i / BARS);
        if (g.roundRect) {
          g.beginPath();
          g.roundRect(x, y, bw, bh, bw / 2);
          g.fill();
        } else {
          g.fillRect(x, y, bw, bh);
        }
      });
      g.globalAlpha = 1;
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      source.disconnect();
      ctx.close().catch(() => {});
    };
  }, [stream]);

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <canvas ref={canvasRef} style={{ width: '100%', height, display: 'block' }} />
      {silent && (
        <span style={{ fontSize: '0.72rem', color: 'var(--color-danger)' }}>
          No se detecta sonido. Revisa que el micrófono correcto esté activo y sin silenciar.
        </span>
      )}
    </div>
  );
}