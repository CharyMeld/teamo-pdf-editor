import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import {
  deleteAiProviderCredential,
  getAiSettings,
  putAiProviderCredential,
  testAiProviderConnection,
  updateAiSettings,
  type AiConnectionTestResult,
  type AiSettings,
} from "../lib/api";
import { extractErrorMessage } from "../lib/errors";

interface AiSettingsContextValue {
  dialogOpen: boolean;
  openDialog: () => void;
  closeDialog: () => void;

  settings: AiSettings | null;
  loading: boolean;
  saving: boolean;
  error: string | null;

  /** Result of the most recent Test Connection click, keyed by provider identifier. */
  testResults: Record<string, AiConnectionTestResult>;
  /** Which provider's Test Connection request is currently in flight, if any. */
  testingProvider: string | null;

  setEnabled: (enabled: boolean) => Promise<void>;
  setExternalProcessingEnabled: (enabled: boolean) => Promise<void>;
  setDefaultProvider: (provider: string | null) => Promise<void>;
  saveCredential: (provider: string, apiKey: string, model: string | null) => Promise<void>;
  removeCredential: (provider: string) => Promise<void>;
  testConnection: (provider: string, draftApiKey?: string, draftModel?: string | null) => Promise<void>;
}

const AiSettingsContext = createContext<AiSettingsContextValue | null>(null);

/**
 * Phase 12.3 (AI provider settings) — a plain CRUD provider, not tied
 * to the currently-open document (these are account-level settings).
 * The backend never returns a stored API key (see
 * AiSettingsController's docblock); nothing here ever holds one beyond
 * the lifetime of a single save/test request the user just typed it
 * into (never persisted to any client-side state after that request
 * resolves — see AiSettingsDialog, which always renders the key field
 * empty, never pre-filled from `settings`).
 */
export function AiSettingsProvider({ children }: { children: ReactNode }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, AiConnectionTestResult>>({});
  const [testingProvider, setTestingProvider] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSettings(await getAiSettings());
    } catch (err) {
      setError(extractErrorMessage(err, "Couldn't load AI settings."));
    } finally {
      setLoading(false);
    }
  }, []);

  const openDialog = useCallback(() => {
    setDialogOpen(true);
    setTestResults({});
    void refetch();
  }, [refetch]);

  const closeDialog = useCallback(() => setDialogOpen(false), []);

  const runMutating = useCallback(async (action: () => Promise<AiSettings>) => {
    setSaving(true);
    setError(null);
    try {
      setSettings(await action());
    } catch (err) {
      setError(extractErrorMessage(err, "That change couldn't be saved."));
    } finally {
      setSaving(false);
    }
  }, []);

  const setEnabled = useCallback(
    (enabled: boolean) => runMutating(() => updateAiSettings({ enabled })),
    [runMutating],
  );

  const setExternalProcessingEnabled = useCallback(
    (enabled: boolean) => runMutating(() => updateAiSettings({ externalProcessingEnabled: enabled })),
    [runMutating],
  );

  const setDefaultProvider = useCallback(
    (provider: string | null) => runMutating(() => updateAiSettings({ defaultProvider: provider })),
    [runMutating],
  );

  const saveCredential = useCallback(
    async (provider: string, apiKey: string, model: string | null) => {
      await runMutating(() => putAiProviderCredential(provider, { apiKey, model }));
      setTestResults((prev) => {
        const { [provider]: _removed, ...rest } = prev;
        return rest;
      });
    },
    [runMutating],
  );

  const removeCredential = useCallback(
    async (provider: string) => {
      await runMutating(() => deleteAiProviderCredential(provider));
      setTestResults((prev) => {
        const { [provider]: _removed, ...rest } = prev;
        return rest;
      });
    },
    [runMutating],
  );

  const testConnection = useCallback(
    async (provider: string, draftApiKey?: string, draftModel?: string | null) => {
      setTestingProvider(provider);
      setError(null);
      try {
        const result = await testAiProviderConnection(
          provider,
          draftApiKey ? { apiKey: draftApiKey, model: draftModel ?? undefined } : undefined,
        );
        setTestResults((prev) => ({ ...prev, [provider]: result }));
      } catch (err) {
        setError(extractErrorMessage(err, "Couldn't test that connection."));
      } finally {
        setTestingProvider(null);
      }
    },
    [],
  );

  const value: AiSettingsContextValue = {
    dialogOpen,
    openDialog,
    closeDialog,
    settings,
    loading,
    saving,
    error,
    testResults,
    testingProvider,
    setEnabled,
    setExternalProcessingEnabled,
    setDefaultProvider,
    saveCredential,
    removeCredential,
    testConnection,
  };

  return <AiSettingsContext.Provider value={value}>{children}</AiSettingsContext.Provider>;
}

export function useAiSettings(): AiSettingsContextValue {
  const ctx = useContext(AiSettingsContext);
  if (!ctx) {
    throw new Error("useAiSettings must be used within an AiSettingsProvider");
  }
  return ctx;
}
