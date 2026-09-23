'use client';

import { useTheme } from '../../lib/theme/themeContext';

export default function ThemeToggle() {
  const { resolvedTheme, toggleTheme } = useTheme();
  const isLight = resolvedTheme === 'light';

  return (
    <button
      onClick={toggleTheme}
      className="theme-toggle"
      title={isLight ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro'}
      aria-label={isLight ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro'}
    >
      {isLight ? '☀️' : '🌙'}
    </button>
  );
}