import { useEffect, useState } from "react";
import { useAiSettings } from "../../ai/useAiSettings";
import type { AiConnectionStatus, AiProviderSettingsSummary } from "../../lib/api";
import Button from "../ui/Button";
import Dialog from "../ui/Dialog";
import Spinner from "../ui/Spinner";
import StatusIndicator from "../ui/StatusIndicator";

function statusTone(status: AiConnectionStatus): "success" | "warning" | "danger" {
  if (status === "CONNECTED") return "success";
  if (status === "PROVIDER_UNAVAILABLE") return "warning";
  return "danger";
}

const STATUS_LABEL: Record<AiConnectionStatus, string> = {
  CONNECTED: "Connected",
  AUTHENTICATION_FAILED: "Authentication failed",
  PROVIDER_UNAVAILABLE: "Not available",
  INVALID_CONFIGURATION: "Invalid configuration",
  MODEL_UNAVAILABLE: "Model unavailable",
  UNKNOWN_ERROR: "Unknown error",
};

/** One provider's credential row — local draft state only; the API key
 * field always starts empty (the backend never returns a stored key,
 * see AiSettingsController's docblock) and is cleared again after any
 * Save/Test so it never lingers in this component's state longer than
 * the single request it was typed for. */
function ProviderRow({ provider }: { provider: AiProviderSettingsSummary }) {
  const { saving, testingProvider, testResults, saveCredential, removeCredential, testConnection } =
    useAiSettings();
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(provider.model ?? "");

  const busy = saving || testingProvider === provider.identifier;
  const result = testResults[provider.identifier];

  return (
    <div className="rounded-md border border-border p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-text">{provider.displayName}</span>
        <StatusIndicator
          status={provider.configured ? "success" : "neutral"}
          label={provider.configured ? "Configured" : "Not configured"}
        />
      </div>

      <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          API key
          <input
            type="password"
            autoComplete="off"
            placeholder={provider.configured ? "•••••••• (unchanged)" : "Paste API key"}
            value={apiKey}
            disabled={busy}
            onChange={(e) => setApiKey(e.target.value)}
            className="rounded border border-border bg-bg px-2 py-1 text-xs text-text"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          Model (optional)
          <input
            type="text"
            placeholder="Provider default"
            value={model}
            disabled={busy}
            onChange={(e) => setModel(e.target.value)}
            className="rounded border border-border bg-bg px-2 py-1 text-xs text-text"
          />
        </label>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="primary"
            disabled={busy || apiKey.trim() === ""}
            onClick={() => {
              void saveCredential(provider.identifier, apiKey, model.trim() === "" ? null : model.trim());
              setApiKey("");
            }}
          >
            Save
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => void testConnection(provider.identifier, apiKey || undefined, model || undefined)}
          >
            Test Connection
          </Button>
          {provider.configured && (
            <Button size="sm" variant="danger" disabled={busy} onClick={() => void removeCredential(provider.identifier)}>
              Remove
            </Button>
          )}
        </div>
        {testingProvider === provider.identifier && <Spinner size={14} label="Testing…" />}
      </div>

      {result && (
        <p className="mt-2 text-[11px]">
          <StatusIndicator status={statusTone(result.status)} label={`${STATUS_LABEL[result.status]} — ${result.message}`} />
        </p>
      )}
      {provider.lastTestStatus && !result && (
        <p className="mt-2 text-[11px] text-text-subtle">
          Last tested {provider.lastTestedAt ? new Date(provider.lastTestedAt).toLocaleString() : ""}:{" "}
          {STATUS_LABEL[provider.lastTestStatus as AiConnectionStatus] ?? provider.lastTestStatus}
        </p>
      )}
    </div>
  );
}

/**
 * Phase 12.3's AI settings area — global enable toggles, a default-
 * provider choice, and one credential row per known provider (real
 * catalog entries, no adapter implemented yet — see AiCredentialService's
 * docblock for why testing any of them today honestly reports
 * PROVIDER_UNAVAILABLE rather than a fake success). Opened from
 * AppHeader's app menu.
 */
export default function AiSettingsDialog() {
  const { dialogOpen, closeDialog, settings, loading, error, setEnabled, setExternalProcessingEnabled, setDefaultProvider } =
    useAiSettings();

  // Optimistic local overlay for the three toggles — the same fix
  // [[phase6_scanning_findings]] and Phase 10's form panels already
  // established: a checkbox/select bound directly to server-derived
  // state visibly snaps back for the duration of its PATCH round-trip.
  // Reset whenever the dialog (re)opens, since that's this component's
  // only "which record am I showing" boundary (there's no per-item
  // selection here, just one global settings object).
  const [localEnabled, setLocalEnabled] = useState<boolean | null>(null);
  const [localExternal, setLocalExternal] = useState<boolean | null>(null);
  const [localDefaultProvider, setLocalDefaultProvider] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (dialogOpen) {
      setLocalEnabled(null);
      setLocalExternal(null);
      setLocalDefaultProvider(undefined);
    }
  }, [dialogOpen]);

  return (
    <Dialog open={dialogOpen} onClose={closeDialog} title="AI Settings" size="lg">
      {loading || !settings ? (
        <div className="flex items-center justify-center py-8">
          <Spinner size={20} label="Loading AI settings…" />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {error && <p className="rounded bg-danger-subtle px-2 py-1.5 text-xs text-danger">{error}</p>}

          <label className="flex items-center justify-between gap-2 text-sm text-text">
            <span>
              Enable AI
              <span className="ml-1.5 block text-[11px] font-normal text-text-subtle">
                Master switch — off means every AI feature in this app is inert, no matter what's configured below.
              </span>
            </span>
            <input
              type="checkbox"
              checked={localEnabled ?? settings.enabled}
              onChange={(e) => {
                setLocalEnabled(e.target.checked);
                void setEnabled(e.target.checked);
              }}
              className="h-4 w-4"
            />
          </label>

          <label className="flex items-center justify-between gap-2 text-sm text-text">
            <span>
              Allow sending document content to external providers
              <span className="ml-1.5 block text-[11px] font-normal text-text-subtle">
                Off by default. This is a visual-signature-style honesty control, not a technical guarantee by
                itself — later phases add consent prompts before any actual document content is sent.
              </span>
            </span>
            <input
              type="checkbox"
              checked={localExternal ?? settings.externalProcessingEnabled}
              onChange={(e) => {
                setLocalExternal(e.target.checked);
                void setExternalProcessingEnabled(e.target.checked);
              }}
              className="h-4 w-4"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm text-text">
            Default provider
            <select
              value={(localDefaultProvider !== undefined ? localDefaultProvider : settings.defaultProvider) ?? ""}
              onChange={(e) => {
                const next = e.target.value === "" ? null : e.target.value;
                setLocalDefaultProvider(next);
                void setDefaultProvider(next);
              }}
              className="w-56 rounded border border-border bg-bg px-2 py-1 text-xs text-text"
            >
              <option value="">— none —</option>
              {settings.providers.map((p) => (
                <option key={p.identifier} value={p.identifier}>
                  {p.displayName}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-text-subtle">Providers</h3>
            {settings.providers.map((p) => (
              <ProviderRow key={p.identifier} provider={p} />
            ))}
          </div>
        </div>
      )}
    </Dialog>
  );
}
