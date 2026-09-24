'use client';
// Ruta: app/settings/integraciones/page.js
// Pendiente: se reconstruye en su fase sobre el esquema nuevo.

import RequirePermission from '../../../components/ui/requirePermission';
import { SettingsHeader } from '../../../components/settings/settingsTabs';

export default function Page() {
  return (
    <RequirePermission perm="settings.manage">
      <main style={{ padding: '1.5rem', maxWidth: 1000 }}>
        <SettingsHeader title="Integraciones" />
        <div className="card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
          Las integraciones (Telnyx, WhatsApp y API de leads) se configuran aquí cuando se implementen sus fases. Las credenciales se guardarán como secretos del servidor, nunca en el navegador.
        </div>
      </main>
    </RequirePermission>
  );
}