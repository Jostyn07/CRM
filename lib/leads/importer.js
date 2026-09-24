// Ruta: lib/leads/importer.js
// Lectura de CSV/XLSX, sugerencia de mapeo de columnas y armado de las
// filas que recibe import_leads_batch(). Las validaciones definitivas
// (teléfono, duplicados, campos personalizados) las hace la base de datos.

import * as XLSX from 'xlsx';

export const MAX_ROWS = 10000;
export const BATCH_SIZE = 500;

// Campos estándar del lead y encabezados que se reconocen solos
export const STANDARD_FIELDS = [
  { key: 'full_name', label: 'Nombre completo (se divide)', aliases: ['nombre completo', 'full name', 'cliente', 'contacto'] },
  { key: 'first_name', label: 'Nombre', aliases: ['nombre', 'nombres', 'first name', 'name', 'primer nombre'] },
  { key: 'last_name', label: 'Apellido', aliases: ['apellido', 'apellidos', 'last name', 'surname'] },
  { key: 'phone', label: 'Teléfono', aliases: ['telefono', 'phone', 'celular', 'movil', 'mobile', 'whatsapp', 'tel'] },
  { key: 'email', label: 'Correo', aliases: ['correo', 'email', 'e-mail', 'correo electronico', 'mail'] },
  { key: 'company_name', label: 'Empresa', aliases: ['empresa', 'company', 'compania', 'negocio'] },
  { key: 'country', label: 'País', aliases: ['pais', 'country'] },
  { key: 'state', label: 'Estado / Departamento', aliases: ['estado/departamento', 'departamento', 'state', 'provincia'] },
  { key: 'city', label: 'Ciudad', aliases: ['ciudad', 'city', 'municipio'] },
  { key: 'address', label: 'Dirección', aliases: ['direccion', 'address', 'domicilio'] },
  { key: 'status', label: 'Estado del lead', aliases: ['estado del lead', 'status', 'etapa'] },
  { key: 'source', label: 'Fuente', aliases: ['fuente', 'source', 'origen', 'canal'] },
  { key: 'assigned_email', label: 'Correo del responsable', aliases: ['responsable', 'asesor', 'agente', 'correo del responsable', 'assigned'] },
  { key: 'tags', label: 'Etiquetas (separadas por coma)', aliases: ['etiquetas', 'tags', 'etiqueta'] },
];

export function normalizeHeader(h) {
  return String(h ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[_\s]+/g, ' ');
}

// Lee el archivo y devuelve el libro para elegir hoja
export async function readWorkbook(file) {
  const buffer = await file.arrayBuffer();
  return XLSX.read(buffer, { type: 'array', cellDates: true });
}

// Filas de una hoja como objetos { encabezado: valor }
export function sheetRows(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
  const headers = rows.length ? Object.keys(rows[0]) : [];
  // Descarta filas totalmente vacías
  const clean = rows.filter((r) => headers.some((h) => String(r[h] ?? '').trim() !== ''));
  return { headers, rows: clean };
}

// Sugiere a qué campo va cada columna. Destinos: 'std:<campo>', 'cf:<clave>' o ''.
export function suggestMapping(headers, customFields) {
  const mapping = {};
  const used = new Set();
  for (const h of headers) {
    const n = normalizeHeader(h);
    let target = '';
    const cf = customFields.find((f) => f.is_active && (normalizeHeader(f.name) === n || normalizeHeader(f.key) === n));
    if (cf) target = `cf:${cf.key}`;
    else {
      const std = STANDARD_FIELDS.find((f) => normalizeHeader(f.label) === n || f.aliases.includes(n));
      if (std) target = `std:${std.key}`;
    }
    if (target && used.has(target)) target = '';
    if (target) used.add(target);
    mapping[h] = target;
  }
  // Si hay nombre y apellido, no usar "nombre completo"
  return mapping;
}

function toText(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v ?? '').trim();
}

// Convierte un valor del archivo al tipo del campo personalizado.
// Devuelve undefined si está vacío.
function toCustom(field, v) {
  const s = toText(v);
  if (s === '') return undefined;
  switch (field.field_type) {
    case 'number': {
      const n = Number(s.replace(/[^\d-]/g, ''));
      return Number.isFinite(n) ? Math.trunc(n) : s;
    }
    case 'decimal': {
      const n = Number(s.replace(/[^\d.,-]/g, '').replace(',', '.'));
      return Number.isFinite(n) ? n : s;
    }
    case 'boolean':
      return ['si', 'sí', 'yes', 'true', '1', 'x'].includes(s.toLowerCase());
    case 'date':
      return v instanceof Date ? v.toISOString().slice(0, 10) : s;
    case 'datetime':
      return v instanceof Date ? v.toISOString() : s;
    case 'multi_select':
      return s.split(/[,;]/).map((x) => x.trim()).filter(Boolean);
    default:
      return s;
  }
}

// Arma las filas para la base de datos. rowOffset = número de fila en Excel (encabezado = 1)
export function buildImportRows(rows, mapping, customFields) {
  const cfByKey = Object.fromEntries(customFields.map((f) => [f.key, f]));
  return rows.map((raw, i) => {
    const out = { row_number: i + 2 };
    const custom = {};
    for (const [header, target] of Object.entries(mapping)) {
      if (!target) continue;
      const value = raw[header];
      if (target.startsWith('cf:')) {
        const f = cfByKey[target.slice(3)];
        const v = f ? toCustom(f, value) : undefined;
        if (v !== undefined) custom[f.key] = v;
      } else {
        const key = target.slice(4);
        const text = toText(value);
        if (!text) continue;
        if (key === 'full_name') {
          const parts = text.split(/\s+/);
          out.first_name ??= parts.shift();
          if (parts.length) out.last_name ??= parts.join(' ');
        } else {
          out[key] = text;
        }
      }
    }
    if (Object.keys(custom).length) out.custom = custom;
    return out;
  });
}

// Revisión previa en el navegador (lo mínimo; el resto lo valida la BD)
export function precheck(row) {
  if (!row.first_name) return 'Falta el nombre';
  if (!row.phone && !row.email) return 'Falta teléfono o correo';
  if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) return 'Correo inválido';
  if (row.phone && row.phone.replace(/\D/g, '').length < 7) return 'Teléfono muy corto';
  return null;
}

// Reporte descargable con el resultado de cada fila
export function downloadReport(fileName, reportRows) {
  const data = reportRows.map((r) => ({
    Fila: r.row_number,
    Resultado: { created: 'Creado', duplicate: 'Duplicado', error: 'Error', skipped: 'Omitido' }[r.result] ?? r.result,
    Mensaje: r.message ?? '',
    Nombre: [r.raw?.first_name, r.raw?.last_name].filter(Boolean).join(' '),
    Teléfono: r.raw?.phone ?? '',
    Correo: r.raw?.email ?? '',
  }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(data), 'Resultado');
  const base = fileName.replace(/\.[^.]+$/, '');
  XLSX.writeFile(book, `resultado_${base}.xlsx`);
}
