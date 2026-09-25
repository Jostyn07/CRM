'use client';
// Ruta: app/comunicacion/page.js

import { Suspense } from 'react';
import ComunicacionApp from './app';

export default function ComunicacionPage() {
  return (
    <Suspense fallback={null}>
      <ComunicacionApp />
    </Suspense>
  );
}