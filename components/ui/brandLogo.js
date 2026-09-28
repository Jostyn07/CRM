'use client';

export default function BrandLogo({ compact = false }) {
  return (
    <a href="/dashboard" aria-label="Leads — Ir al dashboard" className="brand-logo">
      <span className="brand-logo-mark" aria-hidden="true">↗</span>
      <span className="brand-logo-copy">
        <span className="brand-logo-name">Leads</span>
        {!compact && <span className="brand-logo-sub">CRM</span>}
      </span>
    </a>
  );
}
