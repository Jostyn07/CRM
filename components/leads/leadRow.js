export default function LeadRow({ lead, selected, onToggleSelect }) {
  const rel = Array.isArray(lead.lead_funnel) ? lead.lead_funnel[0] : lead.lead_funnel;

  return (
    <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
      <td style={{ padding: '0.6rem 1rem' }}>
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(lead.id)}
          aria-label={`Seleccionar ${lead.name}`}
        />
      </td>
      <td style={{ padding: '0.6rem 1rem' }}>
        <a href={`/leads/${lead.id}`}>{lead.name}</a>
      </td>
      <td style={{ padding: '0.6rem 1rem' }}>{lead.phone}</td>
      <td style={{ padding: '0.6rem 1rem' }}>{lead.address || '—'}</td>
      <td style={{ padding: '0.6rem 1rem' }}>{lead.email || '—'}</td>
      <td style={{ padding: '0.6rem 1rem' }}>{rel?.funnels?.name || 'Sin asignar'}</td>
      <td style={{ padding: '0.6rem 1rem' }}>{rel?.funnel_stages?.name || '—'}</td>
    </tr>
  );
}