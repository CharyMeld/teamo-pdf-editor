import { useId, useRef, useState } from "react";
import teamoLogo from "../../assets/teamo-logo.png";
import { getCommand } from "../../commands/registry";
import { useCommandSearch } from "../../commands/useCommandSearch";
import { useActiveTab } from "../../hooks/useActiveTab";
import { useOpenDocument } from "../../hooks/useOpenDocument";
import { useOrganizeRunHandlers } from "../../hooks/useOrganizeRunHandlers";
import { useWorkingDocument } from "../../hooks/useWorkingDocument";
import { formatBytes } from "../../lib/format";
import { presentDocumentStatus } from "../../lib/documentStatus";
import DropdownMenu from "../ui/DropdownMenu";
import Icon from "../ui/Icon";
import IconButton from "../ui/IconButton";
import StatusIndicator from "../ui/StatusIndicator";

interface CommandSearchProps {
  runHandlers: Record<string, () => void>;
}

function CommandSearch({ runHandlers }: CommandSearchProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const { setActiveTab } = useActiveTab();
  const results = useCommandSearch(query);

  function runResult(index: number) {
    const command = results[index];
    if (!command) return;
    setActiveTab(command.tab);
    if (command.status === "available") (runHandlers[command.id] ?? command.run)?.();
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      runResult(activeIndex === -1 ? 0 : activeIndex);
    } else if (event.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  return (
    <div className="relative w-full max-w-xs">
      <label htmlFor="command-search" className="sr-only">
        Search commands
      </label>
      <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-text-subtle">
        <Icon name="search" size={14} />
      </span>
      <input
        id="command-search"
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls={listboxId}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder='Search commands — try "compress" or "OCR"'
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActiveIndex(-1);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={handleKeyDown}
        className="h-8 w-full rounded-md border border-border bg-surface-muted pl-7 pr-2 text-xs text-text placeholder:text-text-subtle focus-visible:border-accent"
      />
      {open && query.trim() !== "" && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Command search results"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-md border border-border bg-surface py-1 shadow-lg"
        >
          {results.length === 0 && (
            <li className="px-3 py-2 text-xs text-text-subtle">No matching commands.</li>
          )}
          {results.map((command, index) => (
            <li key={command.id} role="option" aria-selected={index === activeIndex}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => runResult(index)}
                onMouseEnter={() => setActiveIndex(index)}
                className={[
                  "flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-xs",
                  index === activeIndex ? "bg-surface-muted" : "",
                ].join(" ")}
              >
                <span>
                  <span className="text-text">{command.label}</span>
                  <span className="ml-1.5 text-text-subtle">— {command.tab}</span>
                </span>
                <span
                  className={
                    command.status === "available"
                      ? "text-[10px] font-medium text-success"
                      : "text-[10px] font-medium text-text-subtle"
                  }
                >
                  {command.status === "available" ? "Available" : "Planned"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The open document's filename/size/status — real data once a document
 * is open (Phase 2), nothing shown otherwise. */
function DocumentInfo() {
  const { document: doc } = useOpenDocument();
  if (!doc) return null;
  const status = presentDocumentStatus(doc.status);

  return (
    <div className="hidden min-w-0 items-center gap-2 rounded-md border border-border px-2 py-1 lg:flex">
      <Icon name="document" size={13} className="shrink-0 text-text-subtle" />
      <span className="max-w-48 truncate text-xs text-text" title={doc.filename}>
        {doc.filename}
      </span>
      <span className="shrink-0 text-[10px] text-text-subtle">{formatBytes(doc.sizeBytes)}</span>
      <StatusIndicator status={status.tone} label={status.label} />
    </div>
  );
}

/** Undo/Redo as persistent header buttons — real page-management history
 * (Phase 3) is a workspace-wide concept, not something that should only be
 * reachable while the EDIT tab happens to be active (the registry still
 * defines edit.undo/edit.redo there too, for ribbon/search discoverability
 * and consistency, but this is the always-visible path a real editor's
 * undo/redo needs, matching the Ctrl+Z/Ctrl+Shift+Z shortcuts' own
 * tab-independent availability). */
function HistoryControls() {
  const { undo, redo, canUndo, canRedo, busy } = useWorkingDocument();
  return (
    <div className="flex shrink-0 items-center gap-0.5 border-r border-border pr-1.5">
      <IconButton
        icon="undo"
        label="Undo"
        size="sm"
        disabled={!canUndo || busy}
        onClick={() => void undo()}
      />
      <IconButton
        icon="redo"
        label="Redo"
        size="sm"
        disabled={!canRedo || busy}
        onClick={() => void redo()}
      />
    </div>
  );
}

export default function AppHeader() {
  const { setActiveTab } = useActiveTab();
  const { showOpenDialog } = useOpenDocument();
  const organize = useOrganizeRunHandlers();
  const settingsCommand = getCommand("home.properties");

  const runHandlers: Record<string, () => void> = {
    "home.open": showOpenDialog,
    ...organize.runHandlers,
  };

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-surface px-3">
      <div className="flex shrink-0 items-center gap-2">
        <img src={teamoLogo} alt="TeamO Digital" className="h-6 w-auto" />
        <span className="h-4 w-px bg-border" aria-hidden="true" />
        <span className="text-sm font-semibold tracking-tight text-text">PDF Editor</span>
      </div>

      <div className="w-56 shrink-0 sm:w-72">
        <CommandSearch runHandlers={runHandlers} />
      </div>

      <HistoryControls />

      <div className="min-w-0 flex-1">
        <DocumentInfo />
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <DropdownMenu
          items={[
            {
              id: "app.settings",
              label: "Settings",
              disabled: true,
              disabledHint: "Not yet available",
              onSelect: settingsCommand?.run,
            },
          ]}
          renderTrigger={(triggerProps) => (
            <IconButton {...triggerProps} icon="settings" label="Application menu" />
          )}
        />
        <IconButton icon="help" label="Help" onClick={() => setActiveTab("HELP")} />
        <div className="ml-1 flex items-center gap-1.5 rounded-md border border-border px-2 py-1">
          <Icon name="user" size={14} className="text-text-subtle" />
          <span className="text-xs text-text-muted">Guest</span>
        </div>
      </div>
    </header>
  );
}
