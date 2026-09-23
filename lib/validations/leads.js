// Validaciones de una fila de lead, usadas tanto en el formulario
// individual como en la vista previa de importación de Excel.

// Quita todo lo que no sea dígito, y si quedan 11 dígitos empezando en
// "1" (prefijo de país +1, con o sin el "+"), lo quita — no cuenta
// para el total de 10. El resultado es lo que se guarda y se compara
// contra duplicados: así "+17863188004" y "7863188004" quedan como el
// mismo valor ("7863188004") en vez de tratarse como números distintos.
export function normalizePhone(raw) {
  const digits = (raw ?? '').toString().replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.slice(1);
  }
  return digits;
}

export function validateLeadRow(row) {
  const errors = [];

  const name = (row.name ?? row.nombre ?? '').toString().trim();
  const rawPhone = (row.phone ?? row.telefono ?? '').toString().trim();
  const phone = normalizePhone(rawPhone);
  const address = (row.address ?? row.direccion ?? '').toString().trim() || null;
  const email = (row.email ?? row.correo ?? '').toString().trim() || null;

  if (!name) errors.push('Falta el nombre');
  if (!rawPhone) {
    errors.push('Falta el teléfono');
  } else if (phone.length !== 10) {
    errors.push('El teléfono debe tener 10 dígitos (sin contar el +1)');
  }
  // El correo es opcional: si viene, se valida el formato básico;
  // si no viene, queda como null sin generar error.
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push('Correo con formato inválido');
  }

  return {
    name,
    phone,
    address,
    email,
    valid: errors.length === 0,
    errors,
  };
}

export function validateLeadRows(rows) {
  const validated = rows.map(validateLeadRow);
  return {
    rows: validated,
    total: validated.length,
    validCount: validated.filter((r) => r.valid).length,
    invalidCount: validated.filter((r) => !r.valid).length,
  };
}