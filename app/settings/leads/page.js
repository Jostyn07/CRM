'use client';
// Ruta: app/settings/leads/page.js
// Configuración de leads (sección 9.3 y 9.4): estados, fuentes,
// etiquetas y campos personalizados. Lo que tiene historia no se borra:
// se desactiva.

import { useCallback, useEffect, useState } from 'react';
import RequirePermission from '../../../components/ui/requirePermission';
import { SettingsHeader, bodyRow, cell, errorText, headRow } from '../../../components/settings/settingsTabs';
import { supabase } from '../../../lib/supabase/client';
import { useSession } from '../../../lib/auth/sessionContext';
import { trackTab } from '../../../lib/activity/tracker';

const SECTIONS = [
  { key: 'statuses', label: 'Estados', perm: 'leads.manage_statuses' },
  { key: 'sources', label: 'Fuentes', perm: 'leads.manage_sources' },
  { key: 'tags', label: 'Etiquetas', perm: 'leads.manage_tags' },
  { key: 'fields', label: 'Campos personalizados', perm: 'leads.manage_fields' },
];

const FIELD_TYPES = {
  text: 'Texto',
  number: 'Número entero',
  decimal: 'Número decimal',
  date: 'Fecha',
  datetime: 'Fecha y hora',
  boolean: 'Sí / No',
  single_select: 'Lista (una opción)',
  multi_select: 'Lista (varias opciones)',
  phone: 'Teléfono',
  email: 'Correo',
  url: 'Enlace (URL)',
};

export default function LeadSettingsPage() {
  return (
    <RequirePermission any={SECTIONS.map((s) => s.perm)}>
      <LeadSettings />
    </RequirePermission>
  );
}

function LeadSettings() {
  const { can } = useSession();
  const sections = SECTIONS.filter((s) => can(s.perm));
  const [tab, setTab] = useState(sections[0]?.key);
  const [msg, setMsg] = useState(null);

  function change(next) {
    trackTab('settings_leads', tab, next);
    setTab(next);
    setMsg(null);
  }

  // Ejecuta una operación y muestra el error si lo hay
  const run = useCallback(async (promise, reload) => {
    setMsg(null);
    const { error } = await promise;
    if (error) {
      setMsg(await errorText(error));
      return false;
    }
    await reload?.();
    return true;
  }, []);

  return (
    <main style={{ padding: '1.5rem', maxWidth: 1000 }}>
      <SettingsHeader title="Configuración de leads" subtitle="Estados, fuentes, etiquetas y campos que usa tu organización." />
      <div style={{ display: 'flex', gap: 6, marginBottom: '1rem', flexWrap: 'wrap' }}>
        {sections.map((s) => (
          <button key={s.key} className={tab === s.key ? 'btn btn-primary' : 'btn btn-secondary'} onClick={() => change(s.key)}>
            {s.label}
          </button>
        ))}
      </div>
      {msg && <p style={{ color: 'var(--color-danger)', fontSize: '0.86rem', marginBottom: '0.8rem' }}>{msg}</p>}
      {tab === 'statuses' && <Statuses run={run} />}
      {tab === 'sources' && <Sources run={run} />}
      {tab === 'tags' && <Tags run={run} />}
      {tab === 'fields' && <Fields run={run} />}
    </main>
  );
}

function useTable(table, order) {
  const [rows, setRows] = useState([]);
  const load = useCallback(async () => {
    const { data } = await supabase.from(table).select('*').order(order);
    setRows(data ?? []);
  }, [table, order]);
  useEffect(() => {
    load();
  }, [load]);
  return [rows, load];
}

function Swatch({ value, onChange }) {
  return <input type="color" value={value} onChange={(e) => onChange(e.target.value)} style={{ width: 36, height: 30, border: 'none', background: 'none', padding: 0 }} />;
}

// ---------------------------------------------------------------- Estados
function Statuses({ run }) {
  const [rows, load] = useTable('lead_statuses', 'position');
  const [name, setName] = useState('');
  const [color, setColor] = useState('#6366f1');

  async function move(i, dir) {
    const a = rows[i];
    const b = rows[i + dir];
    if (!b) return;
    await run(supabase.from('lead_statuses').update({ position: b.position }).eq('id', a.id));
    await run(supabase.from('lead_statuses').update({ position: a.position === b.position ? a.position + dir : a.position }).eq('id', b.id), load);
  }

  return (
    <>
      <div className="card" style={{ padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
          <thead>
            <tr style={headRow}>
              <th style={cell}>Orden</th>
              <th style={cell}>Color</th>
              <th style={cell}>Nombre</th>
              <th style={cell}>Por defecto</th>
              <th style={cell}>Activo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s, i) => (
              <tr key={s.id} style={{ ...bodyRow, opacity: s.is_active ? 1 : 0.55 }}>
                <td style={cell}>
                  <button className="btn btn-secondary" style={{ padding: '0 0.4rem' }} disabled={i === 0} onClick={() => move(i, -1)} aria-label="Subir">
                    ↑
                  </button>{' '}
                  <button className="btn btn-secondary" style={{ padding: '0 0.4rem' }} disabled={i === rows.length - 1} onClick={() => move(i, 1)} aria-label="Bajar">
                    ↓
                  </button>
                </td>
                <td style={cell}>
                  <Swatch value={s.color} onChange={(c) => run(supabase.from('lead_statuses').update({ color: c }).eq('id', s.id), load)} />
                </td>
                <td style={cell}>
                  <input
                    className="input"
                    defaultValue={s.name}
                    onBlur={(e) => e.target.value.trim() && e.target.value !== s.name && run(supabase.from('lead_statuses').update({ name: e.target.value.trim() }).eq('id', s.id), load)}
                  />
                </td>
                <td style={cell}>
                  <input
                    type="radio"
                    name="default-status"
                    checked={s.is_default}
                    disabled={!s.is_active}
                    onChange={() => run(supabase.from('lead_statuses').update({ is_default: true }).eq('id', s.id), load)}
                  />
                </td>
                <td style={cell}>
                  <input
                    type="checkbox"
                    checked={s.is_active}
                    disabled={s.is_default}
                    title={s.is_default ? 'Marca otro estado por defecto antes de desactivar este' : ''}
                    onChange={(e) => run(supabase.from('lead_statuses').update({ is_active: e.target.checked }).eq('id', s.id), load)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', margin: '0.5rem 0' }}>
        Un estado desactivado deja de aparecer para leads nuevos, pero los leads que ya lo tienen lo conservan.
      </p>
      <AddRow
        onAdd={() =>
          run(supabase.from('lead_statuses').insert({ name: name.trim(), color, position: (rows.at(-1)?.position ?? 0) + 1 }), load).then((ok) => ok && setName(''))
        }
        disabled={!name.trim()}
      >
        <Swatch value={color} onChange={setColor} />
        <input className="input" placeholder="Nuevo estado" value={name} onChange={(e) => setName(e.target.value)} />
      </AddRow>
    </>
  );
}

// ---------------------------------------------------------------- Fuentes
function Sources({ run }) {
  const [rows, load] = useTable('lead_sources', 'name');
  const [name, setName] = useState('');
  return (
    <>
      <div className="card" style={{ padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
          <thead>
            <tr style={headRow}>
              <th style={cell}>Nombre</th>
              <th style={cell}>Tipo</th>
              <th style={cell}>Activa</th>
              <th style={cell} />
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} style={{ ...bodyRow, opacity: s.is_active ? 1 : 0.55 }}>
                <td style={cell}>
                  {s.is_system ? (
                    <strong>{s.name}</strong>
                  ) : (
                    <input
                      className="input"
                      defaultValue={s.name}
                      onBlur={(e) => e.target.value.trim() && e.target.value !== s.name && run(supabase.from('lead_sources').update({ name: e.target.value.trim() }).eq('id', s.id), load)}
                    />
                  )}
                </td>
                <td style={cell}>{s.is_system ? 'De sistema' : 'Comercial'}</td>
                <td style={cell}>
                  <input
                    type="checkbox"
                    checked={s.is_active}
                    disabled={s.is_system}
                    onChange={(e) => run(supabase.from('lead_sources').update({ is_active: e.target.checked }).eq('id', s.id), load)}
                  />
                </td>
                <td style={{ ...cell, textAlign: 'right' }}>
                  {!s.is_system && (
                    <button
                      className="btn btn-secondary"
                      onClick={() => confirm(`¿Eliminar la fuente "${s.name}"? Si ya tiene leads, desactívala en su lugar.`) && run(supabase.from('lead_sources').delete().eq('id', s.id), load)}
                    >
                      Eliminar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <AddRow onAdd={() => run(supabase.from('lead_sources').insert({ name: name.trim() }), load).then((ok) => ok && setName(''))} disabled={!name.trim()}>
        <input className="input" placeholder="Nueva fuente (ej. Facebook, Referido)" value={name} onChange={(e) => setName(e.target.value)} />
      </AddRow>
    </>
  );
}

// ---------------------------------------------------------------- Etiquetas
function Tags({ run }) {
  const [rows, load] = useTable('tags', 'name');
  const [name, setName] = useState('');
  const [color, setColor] = useState('#3b82f6');
  return (
    <>
      <div className="card" style={{ padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
          <thead>
            <tr style={headRow}>
              <th style={cell}>Color</th>
              <th style={cell}>Nombre</th>
              <th style={cell} />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} style={{ ...cell, textAlign: 'center', color: 'var(--color-text-muted)', padding: '1.2rem' }}>
                  Todavía no hay etiquetas.
                </td>
              </tr>
            )}
            {rows.map((t) => (
              <tr key={t.id} style={bodyRow}>
                <td style={cell}>
                  <Swatch value={t.color} onChange={(c) => run(supabase.from('tags').update({ color: c }).eq('id', t.id), load)} />
                </td>
                <td style={cell}>
                  <input
                    className="input"
                    defaultValue={t.name}
                    onBlur={(e) => e.target.value.trim() && e.target.value !== t.name && run(supabase.from('tags').update({ name: e.target.value.trim() }).eq('id', t.id), load)}
                  />
                </td>
                <td style={{ ...cell, textAlign: 'right' }}>
                  <button
                    className="btn btn-secondary"
                    onClick={() => confirm(`¿Eliminar la etiqueta "${t.name}"? Se quitará de todos los leads.`) && run(supabase.from('tags').delete().eq('id', t.id), load)}
                  >
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <AddRow onAdd={() => run(supabase.from('tags').insert({ name: name.trim(), color }), load).then((ok) => ok && setName(''))} disabled={!name.trim()}>
        <Swatch value={color} onChange={setColor} />
        <input className="input" placeholder="Nueva etiqueta (ej. VIP)" value={name} onChange={(e) => setName(e.target.value)} />
      </AddRow>
    </>
  );
}

// ---------------------------------------------------------------- Campos
function keyFromName(name) {
  let k = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50);
  if (!/^[a-z]/.test(k)) k = `c_${k}`;
  return k;
}

function Fields({ run }) {
  const [rows, load] = useTable('custom_fields', 'position');
  const [draft, setDraft] = useState({ name: '', field_type: 'text', required: false, options: '' });
  const isSelect = (t) => t === 'single_select' || t === 'multi_select';
  const parseOptions = (s) => [...new Set(s.split(',').map((x) => x.trim()).filter(Boolean))];

  function add() {
    const options = isSelect(draft.field_type) ? parseOptions(draft.options) : [];
    return run(
      supabase.from('custom_fields').insert({
        name: draft.name.trim(),
        key: keyFromName(draft.name),
        field_type: draft.field_type,
        required: draft.required,
        options,
        position: (rows.at(-1)?.position ?? 0) + 1,
      }),
      load
    ).then((ok) => ok && setDraft({ name: '', field_type: 'text', required: false, options: '' }));
  }

  return (
    <>
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
          <thead>
            <tr style={headRow}>
              <th style={cell}>Nombre</th>
              <th style={cell}>Tipo</th>
              <th style={cell}>Opciones</th>
              <th style={cell}>Obligatorio</th>
              <th style={cell}>Activo</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} style={{ ...cell, textAlign: 'center', color: 'var(--color-text-muted)', padding: '1.2rem' }}>
                  Todavía no hay campos personalizados.
                </td>
              </tr>
            )}
            {rows.map((f) => (
              <tr key={f.id} style={{ ...bodyRow, opacity: f.is_active ? 1 : 0.55 }}>
                <td style={cell}>
                  <input
                    className="input"
                    defaultValue={f.name}
                    onBlur={(e) => e.target.value.trim() && e.target.value !== f.name && run(supabase.from('custom_fields').update({ name: e.target.value.trim() }).eq('id', f.id), load)}
                  />
                  <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: 2 }}>Clave: {f.key}</div>
                </td>
                <td style={cell}>{FIELD_TYPES[f.field_type]}</td>
                <td style={cell}>
                  {isSelect(f.field_type) ? (
                    <input
                      className="input"
                      defaultValue={(f.options ?? []).join(', ')}
                      title="Separadas por coma. Quitar una opción no borra los valores ya guardados."
                      onBlur={(e) => {
                        const opts = parseOptions(e.target.value);
                        if (opts.length && opts.join('|') !== (f.options ?? []).join('|')) run(supabase.from('custom_fields').update({ options: opts }).eq('id', f.id), load);
                      }}
                    />
                  ) : (
                    '—'
                  )}
                </td>
                <td style={cell}>
                  <input type="checkbox" checked={f.required} onChange={(e) => run(supabase.from('custom_fields').update({ required: e.target.checked }).eq('id', f.id), load)} />
                </td>
                <td style={cell}>
                  <input type="checkbox" checked={f.is_active} onChange={(e) => run(supabase.from('custom_fields').update({ is_active: e.target.checked }).eq('id', f.id), load)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', margin: '0.5rem 0' }}>
        El tipo de un campo no se puede cambiar después de creado (protege los datos ya guardados). Si necesitas otro tipo, crea un campo nuevo y desactiva el anterior.
      </p>
      <div className="card" style={{ display: 'grid', gridTemplateColumns: '2fr 1.4fr 2fr auto auto', gap: 8, alignItems: 'center' }}>
        <input className="input" placeholder="Nombre del campo" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <select className="input" value={draft.field_type} onChange={(e) => setDraft({ ...draft, field_type: e.target.value })}>
          {Object.entries(FIELD_TYPES).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        <input
          className="input"
          placeholder={isSelect(draft.field_type) ? 'Opciones separadas por coma' : '—'}
          disabled={!isSelect(draft.field_type)}
          value={draft.options}
          onChange={(e) => setDraft({ ...draft, options: e.target.value })}
        />
        <label style={{ fontSize: '0.82rem', display: 'flex', gap: 4, alignItems: 'center' }}>
          <input type="checkbox" checked={draft.required} onChange={(e) => setDraft({ ...draft, required: e.target.checked })} /> Obligatorio
        </label>
        <button
          className="btn btn-primary"
          disabled={!draft.name.trim() || (isSelect(draft.field_type) && !parseOptions(draft.options).length)}
          onClick={add}
        >
          + Agregar
        </button>
      </div>
    </>
  );
}

function AddRow({ children, onAdd, disabled }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!disabled) onAdd();
      }}
      style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: '0.8rem', maxWidth: 480 }}
    >
      {children}
      <button className="btn btn-primary" disabled={disabled}>
        + Agregar
      </button>
    </form>
  );
}