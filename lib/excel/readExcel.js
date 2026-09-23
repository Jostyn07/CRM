import * as XLSX from 'xlsx';

// Mapea encabezados comunes (con o sin tildes, mayúsculas/minúsculas)
// a los campos internos name / phone / address.
const HEADER_ALIASES = {
  name: ['nombre', 'name'],
  phone: ['telefono', 'teléfono', 'phone', 'celular'],
  address: ['direccion', 'dirección', 'address'],
  email: ['correo', 'correo electronico', 'correo electrónico', 'email', 'e-mail'],
};

function normalizeHeader(header) {
  return header
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // quita tildes
}

function detectField(header) {
  const normalized = normalizeHeader(header);
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.some((alias) => normalizeHeader(alias) === normalized)) {
      return field;
    }
  }
  return null;
}

/**
 * Lee un archivo Excel (File del input) y devuelve un array de filas
 * ya mapeadas a { name, phone, address }.
 */
export async function readExcelFile(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];

  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  if (rawRows.length === 0) {
    return { rows: [], detectedColumns: {} };
  }

  const headers = Object.keys(rawRows[0]);
  const columnMap = {}; // header original → campo interno
  headers.forEach((header) => {
    const field = detectField(header);
    if (field) columnMap[header] = field;
  });

  const rows = rawRows.map((rawRow) => {
    const mapped = { name: '', phone: '', address: '', email: '' };
    Object.entries(rawRow).forEach(([header, value]) => {
      const field = columnMap[header];
      if (field) mapped[field] = value?.toString().trim() ?? '';
    });
    return mapped;
  });

  return { rows, detectedColumns: columnMap };
}