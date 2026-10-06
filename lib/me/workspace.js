'use client';
// Ruta: lib/me/workspace.js
// "Mi espacio": preferencias personales (perfil visible, fondo,
// disponibilidad y atajos). Solo afectan al usuario que las cambia.

import { useEffect, useState } from 'react';
import { supabase } from '../supabase/client';

export const BACKGROUNDS = [
  { key: 'seda', label: 'Seda dorada', light: '#f6f0e4 url(/fondo-seda.svg) top center / cover', dark: '#0f0d0b' },
  { key: 'liso', label: 'Liso', light: '#f7f4ee', dark: '#0f0e0c' },
  { key: 'arena', label: 'Arena', light: 'linear-gradient(160deg, #f6eedf, #ecdfc6)', dark: 'linear-gradient(160deg, #1d1813, #12100c)' },
  { key: 'oceano', label: 'Océano', light: 'linear-gradient(160deg, #eef4f8, #dbe7f0)', dark: 'linear-gradient(160deg, #0f1a22, #0a1015)' },
  { key: 'bosque', label: 'Bosque', light: 'linear-gradient(160deg, #eef3ec, #dbe7d6)', dark: 'linear-gradient(160deg, #101a14, #0a110c)' },
  { key: 'atardecer', label: 'Atardecer', light: 'linear-gradient(160deg, #fbefe6, #f1dde3)', dark: 'linear-gradient(160deg, #22150f, #170e14)' },
  { key: 'lavanda', label: 'Lavanda', light: 'linear-gradient(160deg, #f2eff9, #e3ddf1)', dark: 'linear-gradient(160deg, #17131f, #0f0c15)' },
  { key: 'noche', label: 'Noche', light: 'linear-gradient(160deg, #e9ecf3, #d9dfeb)', dark: 'linear-gradient(160deg, #0d0f16, #151a28)' },
];

export const STATUSES = {
  available: { label: 'Disponible', color: '#22a06b' },
  busy: { label: 'Ocupado', color: '#e0a13a' },
  unavailable: { label: 'No disponible', color: '#d64545' },
  away: { label: 'Ausente', color: '#8a8f98' },
};

export const SHORTCUTS = [
  { keys: 'Alt + D', path: '/dashboard', label: 'Ir al Dashboard' },
  { keys: 'Alt + L', path: '/leads', label: 'Ir a Leads' },
  { keys: 'Alt + T', path: '/tareas', label: 'Ir a Tareas' },
  { keys: 'Alt + K', path: '/llamadas', label: 'Ir a Llamadas' },
  { keys: 'Alt + W', path: '/whatsapp', label: 'Abrir WhatsApp' },
  { keys: 'Alt + C', path: '/comunicacion', label: 'Abrir Comunicación interna' },
  { keys: 'Alt + R', path: '/reportes', label: 'Ir a Reportes' },
  { keys: 'Alt + E', path: '/clientes', label: 'Ir a Clientes' },
  { keys: 'Alt + P', path: '/settings', label: 'Abrir Mi espacio' },
];

export const ACCENTS = [
  { key: 'dorado', label: 'Dorado', color: null, swatch: '#c99a3d' },
  { key: 'azul', label: 'Azul', color: '#3f7bd6', swatch: '#3f7bd6' },
  { key: 'morado', label: 'Morado', color: '#8a63c9', swatch: '#8a63c9' },
  { key: 'verde', label: 'Verde', color: '#2e8b7a', swatch: '#2e8b7a' },
  { key: 'rojo', label: 'Rojo', color: '#c9564b', swatch: '#c9564b' },
  { key: 'rosa', label: 'Rosa', color: '#d0628f', swatch: '#d0628f' },
];

// Widgets del Dashboard que cada persona puede ordenar u ocultar
export const DASHBOARD_WIDGETS = [
  { key: 'kpis', label: 'Indicadores' },
  { key: 'daily', label: 'Leads nuevos por día' },
  { key: 'funnel', label: 'Conversión por etapa' },
  { key: 'tasks', label: 'Tareas de hoy' },
  { key: 'leads', label: 'Leads recientes' },
  { key: 'team', label: 'Top del equipo' },
  { key: 'activity', label: 'Actividad reciente' },
  { key: 'goals', label: 'Metas del mes' },
  { key: 'promo', label: 'Tarjeta de ayuda' },
];

export function dashboardLayout(prefs) {
  const saved = prefs?.prefs?.dashboard ?? {};
  const keys = DASHBOARD_WIDGETS.map((w) => w.key);
  const order = [...(saved.order ?? []).filter((k) => keys.includes(k)), ...keys.filter((k) => !(saved.order ?? []).includes(k))];
  const hidden = new Set((saved.hidden ?? []).filter((k) => keys.includes(k)));
  return { order, hidden };
}

const ACCENT_KEY = 'xiris.accent';
export function applyAccent(color) {
  try {
    if (color) localStorage.setItem(ACCENT_KEY, color);
    else localStorage.removeItem(ACCENT_KEY);
  } catch {}
  if (typeof document === 'undefined') return;
  const st = document.documentElement.style;
  if (!color) {
    ['--accent', '--accent-light', '--accent-strong'].forEach((v) => st.removeProperty(v));
    return;
  }
  st.setProperty('--accent', color);
  st.setProperty('--accent-light', `color-mix(in srgb, ${color} 62%, white)`);
  st.setProperty('--accent-strong', `color-mix(in srgb, ${color} 82%, black)`);
}

// Sube la foto de perfil o la portada (carpeta propia del usuario)
export async function uploadProfileMedia(userId, file, kind) {
  if (!file) return null;
  if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) throw new Error('Usa una imagen PNG, JPG, WEBP o GIF.');
  if (file.size > 5 * 1024 * 1024) throw new Error('La imagen pesa más de 5 MB.');
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `${userId}/${kind}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('profile-media').upload(path, file, { upsert: false, contentType: file.type, cacheControl: '31536000' });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from('profile-media').getPublicUrl(path);
  return data.publicUrl;
}

const BG_KEY = 'xiris.bg';
let cache = null;
let loading = null;
const listeners = new Set();

function emit(p) {
  cache = p;
  listeners.forEach((fn) => fn(p));
}

export function applyBackground(key) {
  try {
    if (key && key !== 'seda') localStorage.setItem(BG_KEY, key);
    else localStorage.removeItem(BG_KEY);
  } catch {}
  if (typeof document !== 'undefined') {
    if (key && key !== 'seda') document.documentElement.setAttribute('data-bg', key);
    else document.documentElement.removeAttribute('data-bg');
  }
}

export async function loadMyPrefs(force = false) {
  if (cache && !force) return cache;
  if (!loading) {
    loading = supabase
      .rpc('my_preferences')
      .then(({ data, error }) => {
        if (error) throw error;
        emit(data);
        if (data?.prefs?.bg) applyBackground(data.prefs.bg);
        applyAccent(data?.prefs?.accent || null);
        return data;
      })
      .finally(() => {
        loading = null;
      });
  }
  return loading;
}

export async function saveMyPrefs(patch) {
  const { data, error } = await supabase.rpc('my_preferences_save', { p: patch });
  if (error) throw new Error(error.message);
  emit(data);
  return data;
}

// Preferencias del usuario actual (se cargan una vez y se comparten)
export function useMyPrefs(userId) {
  const [prefs, setPrefs] = useState(cache);
  useEffect(() => {
    if (!userId) return undefined;
    listeners.add(setPrefs);
    loadMyPrefs().catch(() => {});
    return () => listeners.delete(setPrefs);
  }, [userId]);
  return prefs;
}