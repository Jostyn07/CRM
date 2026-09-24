'use client';
// Ruta: app/funnels/[id]/page.js
// Ruta antigua: ahora cada embudo se abre en el tablero.
import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function FunnelRedirect() {
  const { id } = useParams();
  const router = useRouter();
  useEffect(() => router.replace(`/funnels?funnel=${id}`), [id, router]);
  return null;
}