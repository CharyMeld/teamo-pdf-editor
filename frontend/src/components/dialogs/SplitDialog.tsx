import { useState } from "react";
import { useWorkingDocument } from "../../hooks/useWorkingDocument";
import Button from "../ui/Button";
import Dialog from "../ui/Dialog";
import IconButton from "../ui/IconButton";
import Spinner from "../ui/Spinner";

interface RangeRow {
  start: string;
  end: string;
}

/** Real Split flow: define one or more page ranges, each becoming a real,
 * independent new document (POST .../operations/split) — the source
 * document's own working state is untouched by this. */
export default function SplitDialog() {
  const working = useWorkingDocument();
  const [rows, setRows] = useState<RangeRow[]>([{ start: "1", end: String(working.pageCount || 1) }]);

  function updateRow(index: number, field: "start" | "end", value: string) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value.replace(/[^0-9]/g, "") } : row)));
  }

  function addRow() {
    setRows((prev) => [...prev, { start: "", end: "" }]);
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  const ranges = rows
    .map((row) => [Number.parseInt(row.start, 10), Number.parseInt(row.end, 10)] as [number, number])
    .filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && start > 0 && end >= start);

  const valid = ranges.length > 0 && ranges.length === rows.length;

  return (
    <Dialog open={working.splitDialogOpen} onClose={working.closeSplitDialog} title="Split document">
      <div className="flex flex-col gap-3">
        <p className="text-xs text-text-muted">
          Document has {working.pageCount} page(s). Each range below becomes a new, separate document.
        </p>

        <div className="flex flex-col gap-2">
          {rows.map((row, index) => (
            <div key={index} className="flex items-center gap-1.5">
              <span className="text-[11px] text-text-subtle">Pages</span>
              <input
                type="text"
                inputMode="numeric"
                value={row.start}
                onChange={(e) => updateRow(index, "start", e.target.value)}
                placeholder="start"
                className="h-7 w-14 rounded border border-border bg-surface px-1.5 text-center text-xs text-text"
              />
              <span className="text-text-subtle">–</span>
              <input
                type="text"
                inputMode="numeric"
                value={row.end}
                onChange={(e) => updateRow(index, "end", e.target.value)}
                placeholder="end"
                className="h-7 w-14 rounded border border-border bg-surface px-1.5 text-center text-xs text-text"
              />
              {rows.length > 1 && (
                <IconButton icon="close" label="Remove range" size="sm" onClick={() => removeRow(index)} />
              )}
            </div>
          ))}
        </div>

        <Button variant="ghost" size="sm" onClick={addRow}>
          + Add range
        </Button>

        {working.busy ? (
          <div className="flex items-center justify-center py-2">
            <Spinner label={working.busyLabel ?? "Splitting…"} />
          </div>
        ) : (
          <Button
            variant="primary"
            size="sm"
            disabled={!valid}
            onClick={() => {
              void working.runSplit(ranges).then(() => working.closeSplitDialog());
            }}
          >
            Split
          </Button>
        )}
      </div>
    </Dialog>
  );
}
