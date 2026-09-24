'use client';
// Ruta: components/leads/leadForm.js
// Formulario de crear/editar lead (sección 21.2 del documento).
// Las reglas reales (duplicados, sucursal, responsable, campos
// obligatorios) las valida la base de datos; aquí solo se ayuda al usuario.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from '../../lib/auth/sessionContext';
import { checkDuplicates, createLead, updateLead } from '../../lib/leads/api';
import { trackEvent } from '../../lib/activity/tracker';
import CustomFieldInput from './customFieldInput';
import TagPicker from './tagPicker';

const COUNTRY_CODES = [
  { code: '+1', label: '🇺🇸 +1' },
  { code: '+57', label: '🇨🇴 +57' },
  { code: '+52', label: '🇲🇽 +52' },
  { code: '+58', label: '🇻🇪 +58' },
  { code: '+51', label: '🇵🇪 +51' },
  { code: '+593', label: '🇪🇨 +593' },
  { code: '+34', label: '🇪🇸 +34' },
];

const EMPTY = {
  first_name: '',
  last_name: '',
  phone: '',
  email: '',
  company_name: '',
  country: '',
  state: '',
  city: '',
  address: '',
  branch_id: '',
  status_id: '',
  source_id: '',
  assigned_user_id: '',
  custom_data: {},
  tag_ids: [],
};

function Section({ title, children }) {
  return (
    <fieldset style={{ border: 'none', padding: 0, margin: '0 0 1.1rem' }}>
      <legend style={{ fontSize: '0.78rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
        {title}
      </legend>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.7rem' }}>{children}</div>
    </fieldset>
  );
}

function Field({ label, required, children, full }) {
  return (
    <label style={{ display: 'block', gridColumn: full ? '1 / -1' : undefined }}>
      <span style={{ display: 'block', fontSize: '0.82rem', marginBottom: 4 }}>
        {label}
        {required && <span style={{ color: 'var(--color-danger)' }}> *</span>}
      </span>
      {children}
    </label>
  );
}

export default function LeadForm({ lead, config, onSaved, onCancel }) {
  const isEdit = !!lead;
  const { branches, activeBranchId, can } = useSession();
  const [values, setValues] = useState(EMPTY);
  const [prefix, setPrefix] = useState(config.defaultCountryCode || '+1');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [dupes, setDupes] = useState([]);
  const dupTimer = useRef(null);

  const canAssign = isEdit ? can('leads.assign') : can('leads.create', 'branch') || can('leads.assign');
  const canMoveBranch = isEdit && can('leads.assign', 'organization');

  useEffect(() => {
    if (isEdit) {
      setValues({
        ...EMPTY,
        ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, lead[k] ?? EMPTY[k]])),
        phone: lead.phone_normalized ?? lead.phone_raw ?? '',
        email: lead.email ?? '',
        custom_data: lead.custom_data ?? {},
        tag_ids: lead.tag_ids ?? [],
      });
    } else {
      const defaultStatus = config.statuses.find((s) => s.is_default && s.is_active);
      const manual = config.sources.find((s) => s.key === 'manual');
      setValues({
        ...EMPTY,
        branch_id: activeBranchId ?? (branches.length === 1 ? branches[0].id : ''),
        status_id: defaultStatus?.id ?? '',
        source_id: manual?.id ?? '',
      });
    }
  }, [lead, isEdit, config.statuses, config.sources, activeBranchId, branches]);

  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e?.target ? e.target.value : e }));
  const setCustom = (key) => (val) => setValues((v) => ({ ...v, custom_data: { ...v.custom_data, [key]: val } }));

  // El número completo que se envía: con + o 00 se respeta; si no, se antepone el prefijo
  const fullPhone = useMemo(() => {
    const p = values.phone.trim();
    if (!p) return '';
    if (p.startsWith('+') || p.startsWith('00')) return p;
    return `${prefix} ${p}`;
  }, [values.phone, prefix]);

  // Aviso de duplicados mientras se escribe
  useEffect(() => {
    clearTimeout(dupTimer.current);
    dupTimer.current = setTimeout(async () => {
      const digits = fullPhone.replace(/\D/g, '');
      const email = values.email.trim();
      if (digits.length < 7 && !email.includes('@')) {
        setDupes([]);
        return;
      }
      setDupes(await checkDuplicates(digits.length >= 7 ? fullPhone : null, email.includes('@') ? email : null, lead?.id ?? null));
    }, 500);
    return () => clearTimeout(dupTimer.current);
  }, [fullPhone, values.email, lead?.id]);

  // Si cambia la sucursal, el responsable debe ser de esa sucursal
  const branchUsers = config.usersOfBranch(values.branch_id || null);
  useEffect(() => {
    if (values.assigned_user_id && values.branch_id && !branchUsers.some((u) => u.id === values.assigned_user_id)) {
      setValues((v) => ({ ...v, assigned_user_id: '' }));
    }
  }, [values.branch_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeFields = config.customFields.filter((f) => f.is_active || (isEdit && lead.custom_data?.[f.key] != null));
  const statuses = config.statuses.filter((s) => s.is_active || s.id === values.status_id);
  const sources = config.sources.filter((s) => s.is_active || s.id === values.source_id);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!values.first_name.trim()) return setError('El nombre es obligatorio.');
    if (!values.phone.trim() && !values.email.trim()) return setError('Agrega al menos un teléfono o un correo.');
    if (!isEdit && branches.length > 1 && !values.branch_id) return setError('Selecciona la sucursal del lead.');
    const missing = activeFields.find((f) => f.required && f.is_active && isEmpty(values.custom_data[f.key]));
    if (missing) return setError(`El campo "${missing.name}" es obligatorio.`);

    setSaving(true);
    try {
      const payload = { ...values, phone: fullPhone };
      if (isEdit) {
        if (!canMoveBranch) delete payload.branch_id;
        await updateLead(lead.id, payload, lead.tag_ids ?? []);
        trackEvent('lead.updated_form', { entityType: 'leads', entityId: lead.id });
        onSaved?.(lead.id);
      } else {
        const res = await createLead(payload);
        if (res?.duplicate) {
          setDupes(res.matches ?? []);
          setError('No se creó el lead: ese teléfono o correo ya existe.');
          return;
        }
        onSaved?.(res.lead_id);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Section title="Información básica">
        <Field label="Nombre" required>
          <input className="input" value={values.first_name} onChange={set('first_name')} autoFocus={!isEdit} />
        </Field>
        <Field label="Apellido">
          <input className="input" value={values.last_name} onChange={set('last_name')} />
        </Field>
      </Section>

      <Section title="Contacto">
        <Field label="Teléfono">
          <div style={{ display: 'flex', gap: 6 }}>
            <select
              className="input"
              style={{ width: 96, flexShrink: 0 }}
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              disabled={values.phone.trim().startsWith('+')}
              aria-label="Prefijo del país"
            >
              {COUNTRY_CODES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
            <input className="input" type="tel" value={values.phone} onChange={set('phone')} placeholder="(305) 555-1234" />
          </div>
          <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
            Otro país: escribe el número con + (ej. +44 20 7946 0958)
          </span>
        </Field>
        <Field label="Correo">
          <input className="input" type="email" value={values.email} onChange={set('email')} />
        </Field>
      </Section>

      {dupes.length > 0 && (
        <div
          role="alert"
          style={{
            margin: '-0.4rem 0 1rem',
            padding: '0.6rem 0.8rem',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--color-status-error-border)',
            background: 'var(--color-status-error-bg)',
            fontSize: '0.84rem',
          }}
        >
          {dupes.map((d, i) =>
            d.visible ? (
              <div key={i}>
                Ya existe un lead con el mismo {d.match === 'phone' ? 'teléfono' : 'correo'}:{' '}
                <a href={`/leads/${d.lead_id}`} style={{ textDecoration: 'underline' }}>
                  {d.name}
                </a>
              </div>
            ) : (
              <div key={i}>{d.message}. No se puede crear de nuevo.</div>
            )
          )}
        </div>
      )}

      <Section title="Empresa y ubicación">
        <Field label="Empresa">
          <input className="input" value={values.company_name} onChange={set('company_name')} />
        </Field>
        <Field label="País">
          <input className="input" value={values.country} onChange={set('country')} />
        </Field>
        <Field label="Estado / Departamento">
          <input className="input" value={values.state} onChange={set('state')} />
        </Field>
        <Field label="Ciudad">
          <input className="input" value={values.city} onChange={set('city')} />
        </Field>
        <Field label="Dirección" full>
          <input className="input" value={values.address} onChange={set('address')} />
        </Field>
      </Section>

      <Section title="Clasificación">
        {(!isEdit ? branches.length > 1 : canMoveBranch) && (
          <Field label="Sucursal" required>
            <select className="input" value={values.branch_id} onChange={set('branch_id')}>
              <option value="">Selecciona…</option>
              {(canMoveBranch ? config.allBranches.filter((b) => b.status === 'active') : branches).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Estado">
          <select className="input" value={values.status_id} onChange={set('status_id')}>
            {statuses.map((s) => (
              <option key={s.id} value={s.id} disabled={!s.is_active}>
                {s.name}
                {!s.is_active ? ' (desactivado)' : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Fuente">
          <select className="input" value={values.source_id} onChange={set('source_id')}>
            {sources.map((s) => (
              <option key={s.id} value={s.id} disabled={!s.is_active}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        {canAssign && (
          <Field label="Responsable">
            <select className="input" value={values.assigned_user_id} onChange={set('assigned_user_id')}>
              <option value="">Sin asignar</option>
              {branchUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </Field>
        )}
      </Section>

      <Section title="Etiquetas">
        <div style={{ gridColumn: '1 / -1' }}>
          <TagPicker tags={config.tags} value={values.tag_ids} onChange={set('tag_ids')} />
        </div>
      </Section>

      {activeFields.length > 0 && (
        <Section title="Campos personalizados">
          {activeFields.map((f) => (
            <Field key={f.id} label={f.name + (f.is_active ? '' : ' (desactivado)')} required={f.required && f.is_active} full={f.field_type === 'multi_select'}>
              <CustomFieldInput field={f} value={values.custom_data[f.key]} onChange={setCustom(f.key)} disabled={!f.is_active} />
            </Field>
          ))}
        </Section>
      )}

      {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem', marginBottom: '0.8rem' }}>{error}</p>}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        {onCancel && (
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
            Cancelar
          </button>
        )}
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear lead'}
        </button>
      </div>
    </form>
  );
}

function isEmpty(v) {
  return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
}