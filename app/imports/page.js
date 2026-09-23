'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase/client';
import { readExcelFile } from '../../lib/excel/readExcel';
import { validateLeadRows } from '../../lib/validations/leads';
import ImportPreviewTable from '../../components/import/importPreviewTable';
import DeleteLeadsSection from '../../components/import/deleteLeadsSection';
import ExportLeadsSection from '../../components/import/exportLeadsSection';
import RequireOwner from '../../components/ui/requireOwner';

export default function ImportsPage() {
  return (
    <RequireOwner>
      <ImportsPageContent />
    </RequireOwner>
  );
}

function ImportsPageContent() {
  const [fileName, setFileName] = useState(null);
  const [preview, setPreview] = useState(null); // { rows, total, validCount, invalidCount }
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(''); // '' = quien importa (yo mismo)

  const [organizations, setOrganizations] = useState([]);
  const [selectedOrgId, setSelectedOrgId] = useState('');

  const [progress, setProgress] = useState(null); // { done, totalBatches }

  const BATCH_SIZE = 150;
  const MAX_RETRIES = 6;

  useEffect(() => {
    loadUsers();
    loadOrganizations();
  }, []);

  async function loadUsers() {
    const { data } = await supabase.from('profiles').select('id, full_name').order('full_name');
    setUsers(data ?? []);
  }

  async function loadOrganizations() {
    const { data } = await supabase.from('organizations').select('id, name').order('name');
    setOrganizations(data ?? []);
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg(null);
    setResult(null);
    setFileName(file.name);

    try {
      const { rows } = await readExcelFile(file);
      const validated = validateLeadRows(rows);
      setPreview(validated);
    } catch (err) {
      setErrorMsg('No se pudo leer el archivo: ' + err.message);
      setPreview(null);
    }
  }

  async function handleConfirmImport() {
    if (!preview) return;
    if (!selectedOrgId) {
      setErrorMsg('Selecciona a qué organización van estos leads antes de importar.');
      return;
    }
    setImporting(true);
    setErrorMsg(null);

    const validRows = preview.rows
      .filter((r) => r.valid)
      .map((r) => ({ name: r.name, phone: r.phone, address: r.address, email: r.email }));

    // Con archivos grandes, se manda en lotes: una sola llamada con miles
    // de filas puede exceder el límite de tamaño de la API o cortarse a
    // medio camino (eso produce el error "Empty or invalid json").
    const batches = [];
    for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
      batches.push(validRows.slice(i, i + BATCH_SIZE));
    }

    const accumulated = { total: 0, inserted: 0, duplicated: 0, invalid: preview.invalidCount };
    const failedBatches = [];

    for (let i = 0; i < batches.length; i++) {
      setProgress({ done: i, totalBatches: batches.length });

      let lastError = null;
      let succeeded = false;

      for (let attempt = 1; attempt <= MAX_RETRIES && !succeeded; attempt++) {
        try {
          const { data, error } = await supabase.rpc('import_leads', {
            p_rows: batches[i],
            p_file_name: fileName,
            p_organization_id: selectedOrgId,
            p_owner_id: selectedUserId || null,
          });

          if (!error) {
            accumulated.total += data.total;
            accumulated.inserted += data.inserted;
            accumulated.duplicated += data.duplicated;
            succeeded = true;
          } else {
            lastError = error;
          }
        } catch (err) {
          // Errores de red genuinos (conexión caída, etc.) llegan aquí en
          // vez de como { error }; se tratan igual, con reintento.
          lastError = err;
        }

        if (!succeeded && attempt < MAX_RETRIES) {
          // Espera creciente entre intentos (1s, 2s, 3s...) — le da
          // tiempo a que un problema pasajero del servidor se resuelva.
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        }
      }

      if (!succeeded) {
        failedBatches.push({ index: i + 1, error: lastError?.message ?? 'error desconocido' });
      }

      // Pequeña pausa entre lotes (incluso los que sí funcionaron) para
      // no saturar la API con peticiones seguidas una tras otra.
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    setProgress(null);
    setResult({ ...accumulated, failedBatches });
    setPreview(null);
    setImporting(false);
  }

  return (
    <main style={{ padding: '1.5rem', maxWidth: 720, margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Importar leads desde Excel</h1>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.75rem', maxWidth: 320 }}>
          <span style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4 }}>
            Organización destino <span style={{ color: 'var(--color-danger)' }}>*</span>
          </span>
          <select
            className="input"
            value={selectedOrgId}
            onChange={(e) => setSelectedOrgId(e.target.value)}
          >
            <option value="">Selecciona una organización…</option>
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </label>

        <label style={{ display: 'block', marginBottom: '0.75rem', maxWidth: 320 }}>
          <span style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4 }}>
            Importar para el usuario
          </span>
          <select
            className="input"
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
          >
            <option value="">Yo mismo</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.full_name || u.id}</option>
            ))}
          </select>
        </label>
        <input type="file" accept=".xlsx,.xls" onChange={handleFileChange} />
        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '0.5rem' }}>
          Columnas esperadas: Nombre, Teléfono, Dirección (opcional), Correo electrónico (opcional).
        </p>
      </div>

      {errorMsg && (
        <p style={{ color: 'var(--color-danger)', marginBottom: '1rem' }}>{errorMsg}</p>
      )}

      {preview && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Vista previa: {fileName}</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
            Se importarán a{' '}
            <strong>{organizations.find((o) => o.id === selectedOrgId)?.name || 'organización sin seleccionar'}</strong>
            {' '}para:{' '}
            <strong>
              {selectedUserId ? users.find((u) => u.id === selectedUserId)?.full_name : 'ti mismo'}
            </strong>
          </p>
          <p style={{ marginBottom: '1rem' }}>
            Registros encontrados: <strong>{preview.total}</strong> ·{' '}
            Válidos: <strong>{preview.validCount}</strong> ·{' '}
            Inválidos: <strong>{preview.invalidCount}</strong>
          </p>

          <ImportPreviewTable rows={preview.rows} />
          {preview.total > 50 && (
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '0.5rem' }}>
              Mostrando los primeros 50 de {preview.total} registros.
            </p>
          )}

          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-secondary" onClick={() => setPreview(null)}>
              Cancelar
            </button>
            <button
              className="btn btn-primary"
              onClick={handleConfirmImport}
              disabled={importing || preview.validCount === 0 || !selectedOrgId}
            >
              {importing
                ? progress
                  ? `Importando lote ${progress.done + 1} de ${progress.totalBatches}…`
                  : 'Importando…'
                : `Importar ${preview.validCount} válidos`}
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className="card">
          <h2 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Resultado de la importación</h2>
          <p>Total procesados: {result.total}</p>
          <p>Nuevos insertados: {result.inserted}</p>
          <p>Ya existentes (duplicados por teléfono): {result.duplicated}</p>
          <p>Inválidos: {result.invalid}</p>

          {result.failedBatches && result.failedBatches.length > 0 && (
            <div style={{ marginTop: '1rem', padding: '0.75rem', border: '1px solid var(--color-danger)', borderRadius: 8 }}>
              <p style={{ color: 'var(--color-danger)', fontWeight: 500, marginBottom: 4 }}>
                {result.failedBatches.length} lote(s) no se pudieron importar después de varios intentos:
              </p>
              <ul style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem', paddingLeft: '1.2rem' }}>
                {result.failedBatches.map((b) => (
                  <li key={b.index}>Lote {b.index}: {b.error}</li>
                ))}
              </ul>
              <p style={{ fontSize: '0.85rem' }}>
                Vuelve a subir el mismo archivo Excel completo — los que ya se importaron se
                detectan como duplicados por teléfono y se saltan solos, sin riesgo de duplicarlos.
              </p>
            </div>
          )}

          <a href="/leads" className="btn btn-primary" style={{ marginTop: '1rem', display: 'inline-flex' }}>
            Ver leads
          </a>
        </div>
      )}

      <ExportLeadsSection />
      <DeleteLeadsSection />
    </main>
  );
}