interface SpinnerProps {
  size?: number;
  label?: string;
}

/** Real loading indicator — only ever rendered while something is
 * genuinely in flight (e.g. the backend health check), never as set
 * dressing on an unimplemented feature. */
export default function Spinner({ size = 14, label = "Loading" }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className="inline-block animate-spin rounded-full border-2 border-border border-t-accent"
      style={{ width: size, height: size }}
    />
  );
}
