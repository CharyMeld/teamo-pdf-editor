import { useEffect, useState } from "react";
import { checkHealth } from "../../lib/api";

type ConnectionState = "checking" | "connected" | "unreachable";

export default function StatusBar() {
  const [connection, setConnection] = useState<ConnectionState>("checking");

  useEffect(() => {
    let cancelled = false;

    checkHealth()
      .then(() => {
        if (!cancelled) setConnection("connected");
      })
      .catch(() => {
        if (!cancelled) setConnection("unreachable");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const dotColor =
    connection === "connected"
      ? "bg-emerald-500"
      : connection === "unreachable"
        ? "bg-red-500"
        : "bg-slate-300";

  const label =
    connection === "connected"
      ? "Backend: connected"
      : connection === "unreachable"
        ? "Backend: unreachable"
        : "Backend: checking…";

  return (
    <footer className="flex h-7 shrink-0 items-center justify-between border-t border-slate-200 bg-white px-3 text-xs text-slate-500">
      <div className="flex items-center gap-4">
        <span>No document</span>
        <span>Zoom: —</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
        <span>{label}</span>
      </div>
    </footer>
  );
}
