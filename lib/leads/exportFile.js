// Ruta: lib/leads/exportFile.js
// Convierte el resultado de export_leads() en un archivo Excel o CSV.
// La auditoría la hace la base de datos en la misma llamada.

import * as XLSX from 'xlsx';

const COLUMNS = [
  ['first_name', 'Nombre'],
  ['last_name', 'Apellido'],
  ['phone', 'Teléfono'],
  ['email', 'Correo'],
  ['company_name', 'Empresa'],
  ['country', 'País'],
  ['state', 'Estado/Departamento'],
  ['city', 'Ciudad'],
  ['address', 'Dirección'],
  ['status', 'Estado del lead'],
  ['source', 'Fuente'],
  ['branch', 'Sucursal'],
  ['assigned_to', 'Responsable'],
  ['tags', 'Etiquetas'],
  ['created_at', 'Creado'],
  ['last_activity_at', 'Última actividad'],
];

function fmtDate(v) {
  return v ? new Date(v).toLocaleString('es-CO') : '';
}

export function buildRows(data, customFields = []) {
  return data.map((r) => {
    const row = {};
    for (const [key, label] of COLUMNS) {
      row[label] = key.endsWith('_at') ? fmtDate(r[key]) : r[key] ?? '';
    }
    for (const f of customFields) {
      const v = r.custom_data?.[f.key];
      row[f.name] = Array.isArray(v) ? v.join(', ') : v === true ? 'Sí' : v === false ? 'No' : v ?? '';
    }
    return row;
  });
}

export function downloadLeads(data, customFields, format = 'xlsx') {
  const rows = buildRows(data, customFields);
  const sheet = XLSX.utils.json_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Leads');
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  XLSX.writeFile(book, `leads_${stamp}.${format}`, { bookType: format });
}