'use client';
// Ruta: app/settings/preferencias/page.js
// Ruta antigua: ahora todo está en Mi cuenta (/settings).
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PreferenciasRedirect() {
  const router = useRouter();
  useEffect(() => router.replace('/settings'), [router]);
  return null;
}