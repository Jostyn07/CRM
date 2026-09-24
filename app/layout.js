// Ruta: app/layout.js
import { Suspense } from 'react';
import './globals.css';
import Sidebar from '../components/ui/sidebar';
import BackgroundPicker from '../components/ui/backgroundPicker';
import AppShell from '../components/ui/appShell';
import SubdomainGuard from '../components/ui/subdomainGuard';
import AuthWatcher from '../components/ui/authWatcher';
import ActivityTracker from '../components/ActivityTracker';
import { ThemeProvider } from '../lib/theme/themeContext';
import { SessionProvider } from '../lib/auth/sessionContext';
import { CallProvider } from '../lib/calls/callContext';
import CallUI from '../components/calls/callUI';

export const metadata = {
  title: 'Plataforma de Leads',
  description: 'Gestión de leads por organización y sucursal',
};

// Se ejecuta antes del primer paint (evita el "flash" de tema oscuro
// por defecto cuando el usuario tiene guardado el tema claro).
const themeInitScript = `
(function () {
  try {
    var pref = window.localStorage.getItem('leads-platform-theme') || 'dark';
    var resolved = pref === 'system'
      ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
      : pref;
    document.documentElement.setAttribute('data-theme', resolved);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
`;

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <ThemeProvider>
          <SessionProvider>
            <CallProvider>
            <AuthWatcher />
            <SubdomainGuard />
            <Suspense fallback={null}>
              <ActivityTracker />
            </Suspense>
            <BackgroundPicker />
            <Sidebar />
            <AppShell>{children}</AppShell>
            <CallUI />
            </CallProvider>
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}