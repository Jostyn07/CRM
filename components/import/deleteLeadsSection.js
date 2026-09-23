'use client';

import { useState } from 'react';
import { supabase } from '../../lib/supabase/client';
import { readExcelFile } from '../../lib/excel/readExcel';
import { normalizePhone } from '../../lib/validations/leads';
import Button from '../ui/button';

export default function DeleteLeadsSection() {
  const [fileName, setFileName] = useState(null);
  const [phones, setPhones] = useState([]);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg(null);
    setResult(null);
    setConfirmText('');
    setFileName(file.name);

    try {
      const { rows } = await readExcelFile(file);
      // Normaliza igual que al importar: si no se hiciera, un +1 en el
      // Excel de borrado no coincidiría con el teléfono guardado (ya
      // normalizado a 10 dígitos) y no se encontraría el lead a borrar.
      const uniquePhones = [...new Set(
        rows.map((r) => normalizePhone(r.phone)).filter((p) => p.length === 10)
      )];
      setPhones(uniquePhones);
    } catch (err) {
      setErrorMsg('No se pudo leer el archivo: ' + err.message);
      setPhones([]);
    }
  }

  async function handleConfirmDelete() {
    if (confirmText !== 'ELIMINAR') return;

    const sure = window.confirm(
      `Esto va a BORRAR PERMANENTEMENTE de la base de datos los leads que coincidan con ${phones.length} teléfono(s). ` +
        'Esta acción no se puede deshacer (no queda en archivados). ¿Continuar?'
    );
    if (!sure) return;

    setDeleting(true);
    setErrorMsg(null);

    const { data, error } = await supabase.rpc('delete_leads_by_phone', { p_phones: phones });

    setDeleting(false);
    if (error) {
      setErrorMsg(error.message);
    } else {
      setResult(data);
      setPhones([]);
      setConfirmText('');
    }
  }

  return (
    <div className="card" style={{ marginTop: '1.5rem', border: '1px solid var(--color-danger)' }}>
      <h2 style={{ fontSize: '1rem', marginBottom: '0.5rem', color: 'var(--color-danger)' }}>
        Eliminar leads por Excel
      </h2>
      <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>
        Sube un Excel con una columna Teléfono. Los leads cuyo teléfono coincida se{' '}
        <strong>borran permanentemente</strong> de la base de datos — no se archivan, no se pueden recuperar
        después.
      </p>

      <input type="file" accept=".xlsx,.xls" onChange={handleFileChange} />

      {errorMsg && <p style={{ color: 'var(--color-danger)', marginTop: '0.75rem' }}>{errorMsg}</p>}

      {phones.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <p style={{ marginBottom: '0.75rem' }}>
            <strong>{fileName}</strong> — {phones.length} teléfono(s) detectados.
          </p>
          <label style={{ display: 'block', marginBottom: '0.75rem', maxWidth: 260 }}>
            <span style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4 }}>
              Escribe <strong>ELIMINAR</strong> para confirmar
            </span>
            <input className="input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
          </label>
          <Button
            variant="danger"
            onClick={handleConfirmDelete}
            disabled={deleting || confirmText !== 'ELIMINAR'}
          >
            {deleting ? 'Eliminando…' : `Eliminar ${phones.length} lead(s) permanentemente`}
          </Button>
        </div>
      )}

      {result && (
        <div style={{ marginTop: '1rem', fontSize: '0.9rem' }}>
          <p>Teléfonos procesados: {result.total}</p>
          <p>Eliminados: {result.deleted}</p>
          <p>No encontrados en el sistema: {result.not_found}</p>
        </div>
      )}
    </div>
  );
}