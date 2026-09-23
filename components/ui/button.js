export default function Button({
  variant = 'primary', // 'primary' | 'secondary' | 'danger'
  children,
  style,
  ...props
}) {
  const base = variant === 'primary' ? 'btn btn-primary' : 'btn btn-secondary';
  const extraStyle = variant === 'danger' ? { color: 'var(--color-danger)', ...style } : style;

  return (
    <button className={base} style={extraStyle} {...props}>
      {children}
    </button>
  );
}