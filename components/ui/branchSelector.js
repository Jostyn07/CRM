'use client';

export default function BranchSelector({ branches, value, onChange, disabled = false }) {
  if (!branches?.length) return null;

  return (
    <div className="branch-selector-wrap">
      <span className="branch-selector-label">Sucursal</span>
      <select
        className="branch-selector"
        value={value ?? ''}
        onChange={(e) => onChange?.(e.target.value || null)}
        aria-label="Seleccionar sucursal"
        disabled={disabled}
      >
        {branches.length > 1 && <option value="">Todas mis sucursales</option>}
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>
            {branch.name}
          </option>
        ))}
      </select>
    </div>
  );
}
