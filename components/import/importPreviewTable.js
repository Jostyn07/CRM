export default function ImportPreviewTable({ rows, maxRows = 50 }) {
  return (
    <div style={{ maxHeight: 280, overflow: 'auto', border: '1px solid var(--color-border)', borderRadius: 6 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
            <th style={{ padding: '0.5rem' }}>Nombre</th>
            <th style={{ padding: '0.5rem' }}>Teléfono</th>
            <th style={{ padding: '0.5rem' }}>Dirección</th>
            <th style={{ padding: '0.5rem' }}>Correo</th>
            <th style={{ padding: '0.5rem' }}>Estado</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, maxRows).map((row, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
              <td style={{ padding: '0.5rem' }}>{row.name || '—'}</td>
              <td style={{ padding: '0.5rem' }}>{row.phone || '—'}</td>
              <td style={{ padding: '0.5rem' }}>{row.address || '—'}</td>
              <td style={{ padding: '0.5rem' }}>{row.email || '—'}</td>
              <td style={{ padding: '0.5rem', color: row.valid ? 'inherit' : 'var(--color-danger)' }}>
                {row.valid ? 'Válido' : row.errors.join(', ')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}