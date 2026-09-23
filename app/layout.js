import './globals.css';
import Sidebar from '../components/ui/sidebar';
import BackgroundPicker from '../components/ui/backgroundPicker';
import AppShell from '../components/ui/appShell';
import SubdomainGuard from '../components/ui/subdomainGuard';
import AuthWatcher from '../components/ui/authWatcher';
import { ThemeProvider } from '../lib/theme/themeContext';

export const metadata = {
  title: 'Plataforma de Leads',
  description: 'Organización de leads por embudos y etapas',
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
          <AuthWatcher />
          <SubdomainGuard />
          <BackgroundPicker />
          <Sidebar />
          <AppShell>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}