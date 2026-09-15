import { useId, useState } from "react";
import { useOpenDocument } from "../../hooks/useOpenDocument";
import Button from "../ui/Button";
import Icon from "../ui/Icon";
import Spinner from "../ui/Spinner";

/**
 * Shown in place of the canvas whenever the open document's status is
 * `password_protected`. Submitting calls the real
 * POST /api/documents/{id}/unlock endpoint (see useOpenDocument.unlock) —
 * a wrong password shows a real inline error and the form stays open for
 * another try; a correct one transitions the document into the normal
 * processing → ready flow.
 */
export default function PasswordPrompt() {
  const { unlock, unlocking, unlockError } = useOpenDocument();
  const [password, setPassword] = useState("");
  const inputId = useId();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (password.trim() === "" || unlocking) return;
    void unlock(password);
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="text-text-subtle">
        <Icon name="lock" size={28} />
      </span>
      <p className="text-sm font-medium text-text-muted">This document is password protected</p>
      <p className="max-w-64 text-xs text-text-subtle">
        Enter the password to unlock and render this document.
      </p>
      <form onSubmit={handleSubmit} className="flex w-full max-w-56 flex-col gap-2">
        <label htmlFor={inputId} className="sr-only">
          Document password
        </label>
        <input
          id={inputId}
          type="password"
          autoComplete="off"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={unlocking}
          placeholder="Password"
          className="h-8 rounded-md border border-border bg-surface px-2 text-xs text-text placeholder:text-text-subtle disabled:opacity-60"
        />
        <Button type="submit" variant="primary" size="sm" disabled={unlocking || password.trim() === ""}>
          {unlocking ? <Spinner size={12} label="Unlocking…" /> : "Unlock"}
        </Button>
        {unlockError && (
          <p role="alert" className="text-xs text-danger">
            {unlockError}
          </p>
        )}
      </form>
    </div>
  );
}
