export default function Input({ label, style, ...props }) {
  if (!label) {
    return <input className="input" style={style} {...props} />;
  }

  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4 }}>{label}</span>
      <input className="input" style={style} {...props} />
    </label>
  );
}