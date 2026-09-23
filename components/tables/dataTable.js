// Tabla genérica: recibe columnas y filas ya resueltas.
// columns: [{ key, label, render?(row) }]
// rows: array de objetos; cada uno debe tener un `id` único.
export default function DataTable({ columns, rows, emptyMessage = 'Sin resultados.', renderRowExtra }) {
  return (
    <div className="card" style={{ padding: 0 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
            {columns.map((col) => (
              <th key={col.key} style={{ padding: '0.6rem 1rem' }}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
              {columns.map((col) => (
                <td key={col.key} style={{ padding: '0.6rem 1rem' }}>
                  {col.render ? col.render(row) : row[col.key] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={columns.length}
                style={{ padding: '1rem', textAlign: 'center', color: 'var(--color-text-muted)' }}
              >
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}