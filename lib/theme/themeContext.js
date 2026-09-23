'use client';

import { createContext, useContext, useEffect, useState } from 'react';

// 'light' | 'dark' | 'system'. 'system' sigue la preferencia del SO,
// las otras dos son elección explícita del usuario.
const STORAGE_KEY = 'leads-platform-theme';
const ThemeContext = createContext(null);

function getSystemTheme() {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function resolveTheme(preference) {
  return preference === 'system' ? getSystemTheme() : preference;
}

export function ThemeProvider({ children }) {
  const [preference, setPreference] = useState('dark');
  const [resolvedTheme, setResolvedTheme] = useState('dark');

  // Al montar: lee la preferencia guardada (el script inline en layout.js
  // ya aplicó el atributo data-theme antes del primer paint, esto solo
  // sincroniza el estado de React con lo que ya quedó en el DOM).
  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY) || 'dark';
    setPreference(saved);
    setResolvedTheme(resolveTheme(saved));
  }, []);

  // Si la preferencia es 'system', escucha cambios del SO en vivo.
  useEffect(() => {
    if (preference !== 'system') return;
    const mql = window.matchMedia('(prefers-color-scheme: light)');
    const handler = () => setResolvedTheme(resolveTheme('system'));
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [preference]);

  // Aplica el atributo al <html> y persiste cada vez que cambia.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
  }, [resolvedTheme]);

  function setTheme(nextPreference) {
    setPreference(nextPreference);
    setResolvedTheme(resolveTheme(nextPreference));
    window.localStorage.setItem(STORAGE_KEY, nextPreference);
  }

  function toggleTheme() {
    // El botón ☀️/🌙 solo alterna entre claro y oscuro explícitos
    // (la opción 'system' vive aparte, en Configuración).
    setTheme(resolvedTheme === 'light' ? 'dark' : 'light');
  }

  return (
    <ThemeContext.Provider value={{ preference, resolvedTheme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme debe usarse dentro de <ThemeProvider>');
  return ctx;
}