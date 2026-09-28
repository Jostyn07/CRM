'use client';
// Ruta: components/ui/brandLogo.js
// Logo de Xiris en el sidebar. Imagen: public/logo-mark.png

export default function BrandLogo({ compact = false }) {
  return (
    <a href="/dashboard" aria-label="Xiris — Ir al dashboard" className="brand-logo">
      <img
        src="/logo-mark.png"
        alt=""
        aria-hidden="true"
        width={32}
        height={32}
        className="brand-logo-mark"
        style={{ borderRadius: 8, objectFit: 'cover', background: 'none', padding: 0 }}
      />
      <span className="brand-logo-copy">
        <span className="brand-logo-name">Xiris</span>
        {!compact && <span className="brand-logo-sub">CRM</span>}
      </span>
    </a>
  );
}