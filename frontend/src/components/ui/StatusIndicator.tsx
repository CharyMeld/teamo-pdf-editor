import Spinner from "./Spinner";

type Status = "success" | "warning" | "danger" | "loading" | "neutral";

interface StatusIndicatorProps {
  status: Status;
  label: string;
}

const DOT_CLASSES: Record<Exclude<Status, "loading">, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  neutral: "bg-text-subtle",
};

/** Dot + label used for real, observed states only (e.g. backend
 * connectivity) — never implies progress on something that isn't
 * actually running. */
export default function StatusIndicator({ status, label }: StatusIndicatorProps) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-text-muted">
      {status === "loading" ? (
        <Spinner size={10} label={label} />
      ) : (
        <span className={`h-1.5 w-1.5 rounded-full ${DOT_CLASSES[status]}`} />
      )}
      <span>{label}</span>
    </span>
  );
}
