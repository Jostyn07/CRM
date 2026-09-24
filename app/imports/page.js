'use client';
// Ruta: app/imports/page.js
// Importador de leads (secciones 9.7 y 20): subir archivo → hoja →
// mapear columnas → opciones y vista previa → procesar por lotes →
// resultado con reporte descargable. Requiere leads.import.

import { useEffect, useMemo, useState } from 'react';
import RequirePermission from '../../components/ui/requirePermission';
import TagPicker from '../../components/leads/tagPicker';
import { supabase } from '../../lib/supabase/client';
import { useSession } from '../../lib/auth/sessionContext';
import { useLeadConfig } from '../../lib/leads/useLeadConfig';
import { friendlyError } from '../../lib/leads/api';
import { fullDate } from '../../lib/leads/format';
import { trackEvent } from '../../lib/activity/tracker';
import {
  BATCH_SIZE,
  MAX_ROWS,
  STANDARD_FIELDS,
  buildImportRows,
  downloadReport,
  precheck,
  readWorkbook,
  sheetRows,
  suggestMapping,
} from '../../lib/leads/importer';

const STEPS = ['Archivo', 'Columnas', 'Revisión', 'Resultado'];

export default function ImportsPage() {
  return (
    <RequirePermission perm="leads.import">
      <Importer />
    </RequirePermission>
  );
}

function Importer() {
  const { branches, activeBranchId, scopeOf } = useSession();
  const config = useLeadConfig();

  const [step, setStep] = useState(0);
  const [file, setFile] = useState(null);
  const [workbook, setWorkbook] = useState(null);
  const [sheet, setSheet] = useState('');
  const [data, setData] = useState({ headers: [], rows: [] });
  const [mapping, setMapping] = useState({});
  const [defaults, setDefaults] = useState({ branch_id: '', status_id: '', source_id: '', assigned_user_id: '', tag_ids: [] });
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(null); // { done, total }
  const [result, setResult] = useState(null);

  // Sucursales donde puede importar: con alcance de organización, todas
  const importBranches = scopeOf('leads.import') === 'organization' ? config.allBranches.filter((b) => b.status === 'active') : branches;

  useEffect(() => {
    if (config.loading) return;
    const manual = config.sources.find((s) => s.key === 'import');
    const def = config.statuses.find((s) => s.is_default);
    setDefaults((d) => ({
      ...d,
      branch_id: d.branch_id || activeBranchId || (importBranches.length === 1 ? importBranches[0].id : ''),
      status_id: d.status_id || def?.id || '',
      source_id: d.source_id || manual?.id || '',
    }));
  }, [config.loading]); // eslint-disable-line react-hooks/exhaustive-deps

  function go(next) {
    trackEvent('import.step', { metadata: { from: STEPS[step], to: STEPS[next] } });
    setStep(next);
  }

  // ---------- Paso 1: archivo
  async function handleFile(f) {
    setError(null);
    if (!f) return;
    if (!/\.(xlsx|xls|csv)$/i.test(f.name)) return setError('Sube un archivo .xlsx, .xls o .csv.');
    try {
      const wb = await readWorkbook(f);
      setFile(f);
      setWorkbook(wb);
      pickSheet(wb, wb.SheetNames[0]);
      trackEvent('import.file_selected', { metadata: { name: f.name, size: f.size, sheets: wb.SheetNames.length } });
    } catch {
      setError('No se pudo leer el archivo. Revisa que no esté dañado o protegido.');
    }
  }

  function pickSheet(wb, name) {
    const d = sheetRows(wb, name);
    setSheet(name);
    setData(d);
    setMapping(suggestMapping(d.headers, config.customFields));
    if (!d.rows.length) setError('La hoja seleccionada no tiene filas con datos.');
    else if (d.rows.length > MAX_ROWS) setError(`La hoja tiene ${d.rows.length.toLocaleString('es-CO')} filas; el máximo por importación es ${MAX_ROWS.toLocaleString('es-CO')}.`);
    else setError(null);
  }

  // ---------- Paso 2 → 3: filas listas para enviar
  const built = useMemo(() => {
    if (step < 2) return null;
    const rows = buildImportRows(data.rows, mapping, config.customFields);
    const checked = rows.map((r) => ({ row: r, issue: precheck(r) }));
    return {
      valid: checked.filter((c) => !c.issue).map((c) => c.row),
      invalid: checked.filter((c) => c.issue),
    };
  }, [step, data.rows, mapping, config.customFields]);

  const mappedTargets = Object.values(mapping).filter(Boolean);
  const hasName = mappedTargets.includes('std:first_name') || mappedTargets.includes('std:full_name');
  const hasContact = mappedTargets.includes('std:phone') || mappedTargets.includes('std:email');

  function setTarget(header, target) {
    setMapping((m) => {
      const next = { ...m };
      if (target) for (const h of Object.keys(next)) if (next[h] === target) next[h] = ''; // cada campo, una columna
      next[header] = target;
      return next;
    });
  }

  // ---------- Paso 3 → 4: procesar
  async function runImport() {
    setError(null);
    if (!defaults.branch_id) return setError('Selecciona la sucursal donde quedarán los leads.');
    if (!built.valid.length) return setError('No hay filas válidas para importar.');

    const total = built.valid.length;
    setProgress({ done: 0, total });
    const totals = { created: 0, duplicates: 0, errors: 0 };
    let importId = null;

    try {
      const { data: id, error: startErr } = await supabase.rpc('start_lead_import', {
        p_branch: defaults.branch_id,
        p_file_name: `${file.name}${workbook.SheetNames.length > 1 ? ` (${sheet})` : ''}`,
        p_total_rows: total,
        p_mapping: mapping,
        p_defaults: {
          status_id: defaults.status_id || null,
          source_id: defaults.source_id || null,
          assigned_user_id: defaults.assigned_user_id || null,
          tag_ids: defaults.tag_ids,
        },
      });
      if (startErr) throw startErr;
      importId = id;

      for (let i = 0; i < total; i += BATCH_SIZE) {
        const batch = built.valid.slice(i, i + BATCH_SIZE);
        const { data: r, error: batchErr } = await supabase.rpc('import_leads_batch', { p_import: importId, p_rows: batch });
        if (batchErr) throw batchErr;
        totals.created += r.created;
        totals.duplicates += r.duplicates;
        totals.errors += r.errors;
        setProgress({ done: Math.min(i + BATCH_SIZE, total), total });
      }

      const { error: finErr } = await supabase.rpc('finish_lead_import', { p_import: importId, p_cancel: false });
      if (finErr) throw finErr;

      setResult({ importId, ...totals, skipped: built.invalid.length });
      go(3);
    } catch (e) {
      // Cierra la importación a medias para que quede registrada como cancelada
      if (importId) await supabase.rpc('finish_lead_import', { p_import: importId, p_cancel: true });
      setError(`La importación se detuvo: ${friendlyError(e)}. Lo procesado hasta ahora quedó guardado.`);
      if (importId) setResult({ importId, ...totals, skipped: built.invalid.length, partial: true });
    } finally {
      setProgress(null);
    }
  }

  async function handleReport() {
    const rows = [];
    for (let from = 0; ; from += 1000) {
      const { data: page } = await supabase
        .from('lead_import_rows')
        .select('row_number, result, message, raw')
        .eq('import_id', result.importId)
        .order('row_number')
        .range(from, from + 999);
      rows.push(...(page ?? []));
      if (!page || page.length < 1000) break;
    }
    const skipped = built.invalid.map((c) => ({ row_number: c.row.row_number, result: 'skipped', message: c.issue, raw: c.row }));
    downloadReport(file.name, [...rows, ...skipped].sort((a, b) => a.row_number - b.row_number));
  }

  function reset() {
    setStep(0);
    setFile(null);
    setWorkbook(null);
    setData({ headers: [], rows: [] });
    setMapping({});
    setResult(null);
    setError(null);
  }

  if (config.loading) return <main style={{ padding: '1.5rem' }}>Cargando…</main>;

  return (
    <main style={{ padding: '1.5rem', maxWidth: 1100 }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Importar leads</h1>
      <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
        Archivos .xlsx, .xls o .csv de hasta {MAX_ROWS.toLocaleString('es-CO')} filas. Cada fila pasa por las mismas reglas que crear un lead a mano.
      </p>

      <ol style={{ display: 'flex', gap: 8, listStyle: 'none', padding: 0, marginBottom: '1.2rem', flexWrap: 'wrap' }}>
        {STEPS.map((s, i) => (
          <li
            key={s}
            style={{
              padding: '0.3rem 0.8rem',
              borderRadius: 999,
              fontSize: '0.82rem',
              background: i === step ? 'var(--color-primary)' : 'var(--color-btn-secondary-bg)',
              color: i === step ? '#fff' : i < step ? 'var(--color-text)' : 'var(--color-text-muted)',
            }}
          >
            {i + 1}. {s}
          </li>
        ))}
      </ol>

      {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.88rem', marginBottom: '0.9rem' }}>{error}</p>}

      {/* ---------------- 1. Archivo */}
      {step === 0 && (
        <>
          <label
            className="card"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleFile(e.dataTransfer.files?.[0]);
            }}
            style={{ display: 'block', textAlign: 'center', padding: '2.5rem 1rem', cursor: 'pointer', borderStyle: 'dashed' }}
          >
            <input type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => handleFile(e.target.files?.[0])} />
            <div style={{ fontSize: '2rem' }}>📄</div>
            <div style={{ fontWeight: 600, marginTop: 6 }}>{file ? file.name : 'Arrastra tu archivo aquí o haz clic para elegirlo'}</div>
            {file && <div style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>{data.rows.length.toLocaleString('es-CO')} filas con datos</div>}
          </label>

          {workbook && workbook.SheetNames.length > 1 && (
            <label style={{ display: 'block', marginTop: '1rem', maxWidth: 320 }}>
              <span style={{ fontSize: '0.85rem' }}>Hoja</span>
              <select className="input" value={sheet} onChange={(e) => pickSheet(workbook, e.target.value)}>
                {workbook.SheetNames.map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <button className="btn btn-primary" disabled={!data.rows.length || data.rows.length > MAX_ROWS} onClick={() => go(1)}>
              Continuar →
            </button>
          </div>
          <ImportHistory />
        </>
      )}

      {/* ---------------- 2. Columnas */}
      {step === 1 && (
        <>
          <p style={{ fontSize: '0.86rem', marginBottom: '0.8rem' }}>
            Indica a qué campo corresponde cada columna. Las reconocidas ya vienen seleccionadas; las que dejes en "No importar" se ignoran.
          </p>
          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-border)' }}>
                  <th style={cell}>Columna del archivo</th>
                  <th style={cell}>Ejemplos</th>
                  <th style={cell}>Importar como</th>
                </tr>
              </thead>
              <tbody>
                {data.headers.map((h) => (
                  <tr key={h} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ ...cell, fontWeight: 600 }}>{h}</td>
                    <td style={{ ...cell, color: 'var(--color-text-muted)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {data.rows
                        .slice(0, 3)
                        .map((r) => (r[h] instanceof Date ? r[h].toLocaleDateString('es-CO') : String(r[h] ?? '')))
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </td>
                    <td style={cell}>
                      <select className="input" value={mapping[h] || ''} onChange={(e) => setTarget(h, e.target.value)} style={{ minWidth: 220 }}>
                        <option value="">No importar</option>
                        <optgroup label="Campos del lead">
                          {STANDARD_FIELDS.map((f) => (
                            <option key={f.key} value={`std:${f.key}`}>
                              {f.label}
                            </option>
                          ))}
                        </optgroup>
                        {config.customFields.some((f) => f.is_active) && (
                          <optgroup label="Campos personalizados">
                            {config.customFields
                              .filter((f) => f.is_active)
                              .map((f) => (
                                <option key={f.key} value={`cf:${f.key}`}>
                                  {f.name}
                                </option>
                              ))}
                          </optgroup>
                        )}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(!hasName || !hasContact) && (
            <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem', marginTop: '0.7rem' }}>
              Asigna al menos una columna de {!hasName ? 'nombre' : ''}
              {!hasName && !hasContact ? ' y una de ' : ''}
              {!hasContact ? 'teléfono o correo' : ''}.
            </p>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem' }}>
            <button className="btn btn-secondary" onClick={() => go(0)}>
              ← Atrás
            </button>
            <button className="btn btn-primary" disabled={!hasName || !hasContact} onClick={() => go(2)}>
              Continuar →
            </button>
          </div>
        </>
      )}

      {/* ---------------- 3. Revisión */}
      {step === 2 && built && (
        <>
          <div className="card" style={{ marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '0.95rem', marginBottom: '0.7rem' }}>Valores para los leads importados</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.7rem' }}>
              <Labeled label="Sucursal *">
                <select className="input" value={defaults.branch_id} onChange={(e) => setDefaults((d) => ({ ...d, branch_id: e.target.value, assigned_user_id: '' }))}>
                  <option value="">Selecciona…</option>
                  {importBranches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </Labeled>
              <Labeled label="Estado (si la fila no trae uno)">
                <select className="input" value={defaults.status_id} onChange={(e) => setDefaults((d) => ({ ...d, status_id: e.target.value }))}>
                  {config.statuses.filter((s) => s.is_active).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Labeled>
              <Labeled label="Fuente (si la fila no trae una)">
                <select className="input" value={defaults.source_id} onChange={(e) => setDefaults((d) => ({ ...d, source_id: e.target.value }))}>
                  {config.sources.filter((s) => s.is_active).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Labeled>
              <Labeled label="Responsable (si la fila no trae uno)">
                <select className="input" value={defaults.assigned_user_id} onChange={(e) => setDefaults((d) => ({ ...d, assigned_user_id: e.target.value }))}>
                  <option value="">Sin asignar</option>
                  {config.usersOfBranch(defaults.branch_id || null).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </Labeled>
            </div>
            <div style={{ marginTop: '0.8rem' }}>
              <span style={{ display: 'block', fontSize: '0.82rem', marginBottom: 4 }}>Etiquetas para todos</span>
              <TagPicker tags={config.tags} value={defaults.tag_ids} onChange={(v) => setDefaults((d) => ({ ...d, tag_ids: v }))} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: '0.8rem' }}>
            <Stat label="Filas listas" value={built.valid.length} />
            <Stat label="Filas con problemas (no se envían)" value={built.invalid.length} danger={built.invalid.length > 0} />
          </div>

          <h3 style={{ fontSize: '0.9rem', margin: '0.4rem 0' }}>Vista previa</h3>
          <PreviewTable rows={built.valid.slice(0, 10)} />
          {built.invalid.length > 0 && (
            <>
              <h3 style={{ fontSize: '0.9rem', margin: '1rem 0 0.4rem', color: 'var(--color-danger)' }}>Filas con problemas</h3>
              <div className="card" style={{ padding: '0.5rem 0.8rem', fontSize: '0.84rem', maxHeight: 200, overflowY: 'auto' }}>
                {built.invalid.slice(0, 50).map((c) => (
                  <div key={c.row.row_number}>
                    Fila {c.row.row_number}: {c.issue}
                  </div>
                ))}
                {built.invalid.length > 50 && <div>…y {built.invalid.length - 50} más (aparecen en el reporte final).</div>}
              </div>
            </>
          )}
          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '0.8rem' }}>
            Los duplicados (dentro del archivo o con leads existentes) se detectan al procesar. Si un contacto ya es de otra persona, se omite y su responsable recibe un aviso.
          </p>

          {progress ? (
            <div style={{ marginTop: '1rem' }}>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} />
              </div>
              <p style={{ fontSize: '0.85rem', marginTop: 6 }}>
                Procesando {progress.done.toLocaleString('es-CO')} de {progress.total.toLocaleString('es-CO')}… No cierres esta pestaña.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem' }}>
              <button className="btn btn-secondary" onClick={() => go(1)}>
                ← Atrás
              </button>
              <button className="btn btn-primary" disabled={!built.valid.length} onClick={runImport}>
                Importar {built.valid.length.toLocaleString('es-CO')} lead(s)
              </button>
            </div>
          )}
          {result?.partial && (
            <button className="btn btn-secondary" style={{ marginTop: '0.8rem' }} onClick={handleReport}>
              Descargar reporte de lo procesado
            </button>
          )}
        </>
      )}

      {/* ---------------- 4. Resultado */}
      {step === 3 && result && (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: '1rem' }}>
            <Stat label="Creados" value={result.created} />
            <Stat label="Duplicados" value={result.duplicates} danger={result.duplicates > 0} />
            <Stat label="Con error" value={result.errors} danger={result.errors > 0} />
            <Stat label="Omitidos antes de enviar" value={result.skipped} danger={result.skipped > 0} />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" onClick={handleReport}>
              📥 Descargar reporte fila por fila
            </button>
            <a className="btn btn-secondary" href="/leads">
              Ver leads
            </a>
            <button className="btn btn-primary" onClick={reset}>
              Importar otro archivo
            </button>
          </div>
        </>
      )}
    </main>
  );
}

function Labeled({ label, children }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontSize: '0.82rem', marginBottom: 4 }}>{label}</span>
      {children}
    </label>
  );
}

function Stat({ label, value, danger }) {
  return (
    <div className="card" style={{ minWidth: 160, padding: '0.7rem 1rem' }}>
      <div style={{ fontSize: '1.4rem', fontWeight: 700, color: danger ? 'var(--color-danger)' : undefined }}>{value.toLocaleString('es-CO')}</div>
      <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>{label}</div>
    </div>
  );
}

function PreviewTable({ rows }) {
  const cols = [
    ['first_name', 'Nombre'],
    ['last_name', 'Apellido'],
    ['phone', 'Teléfono'],
    ['email', 'Correo'],
    ['company_name', 'Empresa'],
    ['status', 'Estado'],
    ['tags', 'Etiquetas'],
  ];
  return (
    <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
        <thead>
          <tr style={{ textAlign: 'left', color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-border)' }}>
            <th style={cell}>Fila</th>
            {cols.map(([k, l]) => (
              <th key={k} style={cell}>
                {l}
              </th>
            ))}
            <th style={cell}>Personalizados</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.row_number} style={{ borderBottom: '1px solid var(--color-border)' }}>
              <td style={cell}>{r.row_number}</td>
              {cols.map(([k]) => (
                <td key={k} style={cell}>
                  {r[k] ?? '—'}
                </td>
              ))}
              <td style={cell}>{r.custom ? Object.keys(r.custom).length : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ImportHistory() {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    supabase
      .from('lead_imports')
      .select('id, file_name, status, total_rows, created_count, duplicate_count, error_count, created_at')
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => setRows(data ?? []));
  }, []);
  if (!rows?.length) return null;
  const label = { processing: 'En proceso', completed: 'Completada', cancelled: 'Cancelada' };
  return (
    <>
      <h3 style={{ fontSize: '0.95rem', margin: '1.6rem 0 0.5rem' }}>Importaciones recientes</h3>
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-border)' }}>
              <th style={cell}>Fecha</th>
              <th style={cell}>Archivo</th>
              <th style={cell}>Estado</th>
              <th style={cell}>Filas</th>
              <th style={cell}>Creados</th>
              <th style={cell}>Duplicados</th>
              <th style={cell}>Errores</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={cell}>{fullDate(r.created_at)}</td>
                <td style={cell}>{r.file_name}</td>
                <td style={cell}>{label[r.status] ?? r.status}</td>
                <td style={cell}>{r.total_rows}</td>
                <td style={cell}>{r.created_count}</td>
                <td style={cell}>{r.duplicate_count}</td>
                <td style={cell}>{r.error_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

const cell = { padding: '0.55rem 0.75rem', verticalAlign: 'top' };