'use client';
// Ruta: app/settings/numeros/page.js
// Pendiente: se reconstruye en su fase sobre el esquema nuevo.

import RequirePermission from '../../../components/ui/requirePermission';
import { SettingsHeader } from '../../../components/settings/settingsTabs';

export default function Page() {
  return (
    <RequirePermission perm="settings.manage">
      <main style={{ padding: '1.5rem', maxWidth: 1000 }}>
        <SettingsHeader title="Números" />
        <div className="card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
          El catálogo de números de Telnyx, su asignación a usuarios como caller ID y los minutos llegan con la integración de telefonía (la siguiente fase), sobre el nuevo modelo de organizaciones y sucursales.
        </div>
      </main>
    </RequirePermission>
  );
}