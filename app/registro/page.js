'use client';
// Ruta: app/registro/page.js
// Registro de una empresa nueva (organización + sucursales + administrador).
// Los demás usuarios de la empresa entran por invitación de su administrador.

import { useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase/client';

const COUNTRIES = ['Estados Unidos', 'Colombia', 'México', 'Venezuela', 'Perú', 'Ecuador', 'España', 'Otro'];

function slugify(text) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function Field({ label, hint, children }) {
  return (
    <label style={{ display: 'block', marginBottom: '0.8rem' }}>
      <span style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4 }}>{label}</span>
      {children}
      {hint && <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 3 }}>{hint}</span>}
    </label>
  );
}

const h2 = { fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-muted)', margin: '1.2rem 0 0.6rem' };

export default function RegistroPage() {
  const [company, setCompany] = useState({ name: '', slug: '', country: 'Estados Unidos', phone: '' });
  const [slugTouched, setSlugTouched] = useState(false);
  const [branches, setBranches] = useState(['Principal']);
  const [admin, setAdmin] = useState({ full_name: '', email: '', phone: '', password: '', confirm: '' });
  const [accept, setAccept] = useState(false);
  const [website, setWebsite] = useState(''); // trampa anti-bots
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [doneEmail, setDoneEmail] = useState(null);

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  const slug = slugTouched ? company.slug : slugify(company.name);

  const passwordIssues = useMemo(() => {
    const p = admin.password;
    const issues = [];
    if (p.length < 10) issues.push('mínimo 10 caracteres');
    if (!/[A-Za-z]/.test(p)) issues.push('una letra');
    if (!/\d/.test(p)) issues.push('un número');
    return issues;
  }, [admin.password]);

  const setC = (k) => (e) => setCompany((c) => ({ ...c, [k]: e.target.value }));
  const setA = (k) => (e) => setAdmin((a) => ({ ...a, [k]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    const cleanBranches = branches.map((b) => b.trim()).filter(Boolean);
    if (!company.name.trim()) return setError('Escribe el nombre de la empresa.');
    if (!/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(slug)) return setError('La dirección web debe tener entre 3 y 40 letras, números o guiones.');
    if (!cleanBranches.length) return setError('Agrega al menos una sucursal.');
    if (!admin.full_name.trim()) return setError('Escribe tu nombre completo.');
    if (passwordIssues.length) return setError(`La contraseña necesita: ${passwordIssues.join(', ')}.`);
    if (admin.password !== admin.confirm) return setError('Las contraseñas no coinciden.');
    if (!accept) return setError('Debes aceptar los términos y la política de tratamiento de datos.');

    setSaving(true);
    const { data, error: fnError } = await supabase.functions.invoke('register-organization', {
      body: {
        company: { ...company, slug },
        branches: cleanBranches,
        admin: { full_name: admin.full_name, email: admin.email, phone: admin.phone, password: admin.password },
        accept_terms: accept,
        website,
      },
    });
    setSaving(false);

    if (fnError) {
      let msg = 'No se pudo completar el registro.';
      try {
        msg = (await fnError.context.json()).error || msg;
      } catch {}
      return setError(msg);
    }
    setDoneEmail(data?.email ?? admin.email);
  }

  if (doneEmail) {
    return (
      <main style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
        <div className="card" style={{ maxWidth: 420, textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.2rem', marginBottom: '0.6rem' }}>¡Tu empresa quedó registrada!</h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
            Te enviamos un correo a <strong>{doneEmail}</strong>. Abre el enlace para confirmar tu cuenta y luego inicia sesión.
          </p>
          <a href="/login" className="btn btn-primary" style={{ marginTop: '1.2rem', display: 'inline-flex' }}>
            Ir a iniciar sesión
          </a>
        </div>
      </main>
    );
  }

  return (
    <main style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
      <form onSubmit={handleSubmit} className="card" style={{ width: '100%', maxWidth: 520 }}>
        <h1 style={{ fontSize: '1.2rem', marginBottom: 4 }}>Registra tu empresa</h1>
        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
          Crearás la cuenta de tu empresa y quedarás como su administrador. Después podrás invitar a tu equipo.
        </p>

        <h2 style={h2}>Empresa</h2>
        <Field label="Nombre de la empresa">
          <input className="input" value={company.name} onChange={setC('name')} required />
        </Field>
        <Field label="Dirección web" hint={rootDomain ? `Tu equipo entrará por ${slug || 'tu-empresa'}.${rootDomain}` : 'Identificador único de tu empresa'}>
          <input
            className="input"
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setCompany((c) => ({ ...c, slug: slugify(e.target.value) }));
            }}
            required
          />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="País">
            <select className="input" value={company.country} onChange={setC('country')}>
              {COUNTRIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Teléfono de la empresa">
            <input className="input" type="tel" value={company.phone} onChange={setC('phone')} />
          </Field>
        </div>

        <h2 style={h2}>Sucursales</h2>
        {branches.map((b, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <input
              className="input"
              value={b}
              placeholder={`Sucursal ${i + 1}`}
              onChange={(e) => setBranches((list) => list.map((x, j) => (j === i ? e.target.value : x)))}
            />
            {branches.length > 1 && (
              <button type="button" className="btn btn-secondary" onClick={() => setBranches((list) => list.filter((_, j) => j !== i))} aria-label="Quitar sucursal">
                ✕
              </button>
            )}
          </div>
        ))}
        <button type="button" className="btn btn-secondary" onClick={() => setBranches((list) => [...list, ''])} style={{ fontSize: '0.82rem' }}>
          + Agregar sucursal
        </button>

        <h2 style={h2}>Administrador</h2>
        <Field label="Nombre completo">
          <input className="input" value={admin.full_name} onChange={setA('full_name')} autoComplete="name" required />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Correo">
            <input className="input" type="email" value={admin.email} onChange={setA('email')} autoComplete="email" required />
          </Field>
          <Field label="Teléfono">
            <input className="input" type="tel" value={admin.phone} onChange={setA('phone')} autoComplete="tel" />
          </Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Contraseña" hint={admin.password && passwordIssues.length ? `Falta: ${passwordIssues.join(', ')}` : 'Mínimo 10 caracteres, con letras y números'}>
            <input className="input" type="password" value={admin.password} onChange={setA('password')} autoComplete="new-password" required />
          </Field>
          <Field label="Confirmar contraseña">
            <input className="input" type="password" value={admin.confirm} onChange={setA('confirm')} autoComplete="new-password" required />
          </Field>
        </div>

        {/* Campo trampa: oculto para personas, los bots lo llenan */}
        <input
          type="text"
          name="website"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
        />

        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: '0.83rem', margin: '1rem 0' }}>
          <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} style={{ marginTop: 3 }} />
          <span>
            Acepto los términos del servicio y la política de tratamiento de datos personales (Ley 1581 de 2012), incluido el registro de la actividad de los usuarios en la plataforma.
          </span>
        </label>

        {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem', marginBottom: '0.8rem' }}>{error}</p>}

        <button className="btn btn-primary" type="submit" disabled={saving} style={{ width: '100%' }}>
          {saving ? 'Creando tu empresa…' : 'Crear cuenta'}
        </button>
        <p style={{ fontSize: '0.83rem', textAlign: 'center', marginTop: '0.9rem', color: 'var(--color-text-muted)' }}>
          ¿Ya tienes cuenta? <a href="/login" style={{ color: 'var(--color-primary)' }}>Inicia sesión</a>
        </p>
      </form>
    </main>
  );
}
