'use client';
// Ruta: components/leads/customFieldInput.js
// Un campo personalizado según su tipo (custom_fields.field_type).

export default function CustomFieldInput({ field, value, onChange, disabled }) {
  const common = { className: 'input', disabled, id: `cf-${field.key}` };
  const options = Array.isArray(field.options) ? field.options : [];

  switch (field.field_type) {
    case 'number':
    case 'decimal':
      return (
        <input
          {...common}
          type="number"
          step={field.field_type === 'number' ? '1' : 'any'}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        />
      );
    case 'date':
      return <input {...common} type="date" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} />;
    case 'datetime':
      return (
        <input
          {...common}
          type="datetime-local"
          value={value ? String(value).slice(0, 16) : ''}
          onChange={(e) => onChange(e.target.value || null)}
        />
      );
    case 'boolean':
      return (
        <select {...common} value={value === true ? 'true' : value === false ? 'false' : ''} onChange={(e) => onChange(e.target.value === '' ? null : e.target.value === 'true')}>
          <option value="">—</option>
          <option value="true">Sí</option>
          <option value="false">No</option>
        </select>
      );
    case 'single_select':
      return (
        <select {...common} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">—</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    case 'multi_select': {
      const selected = Array.isArray(value) ? value : [];
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {options.map((o) => {
            const on = selected.includes(o);
            return (
              <button
                key={o}
                type="button"
                disabled={disabled}
                className={on ? 'btn btn-primary' : 'btn btn-secondary'}
                style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
                onClick={() => onChange(on ? selected.filter((x) => x !== o) : [...selected, o])}
              >
                {o}
              </button>
            );
          })}
        </div>
      );
    }
    case 'email':
      return <input {...common} type="email" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
    case 'url':
      return <input {...common} type="url" placeholder="https://" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
    case 'phone':
      return <input {...common} type="tel" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
    default:
      return <input {...common} type="text" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
  }
}
