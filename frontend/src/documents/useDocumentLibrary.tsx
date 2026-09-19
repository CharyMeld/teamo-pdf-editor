import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import {
  archiveDocument,
  deleteDocument,
  duplicateDocument,
  getDocumentHistory,
  getDocumentVersions,
  listDocuments,
  renameDocument,
  unarchiveDocument,
  type DocumentHistoryEntry,
  type DocumentSummary,
  type DocumentVersionSummary,
} from "../lib/api";
import { extractErrorMessage } from "../lib/errors";

interface DocumentLibraryContextValue {
  dialogOpen: boolean;
  openDialog: () => void;
  closeDialog: () => void;

  documents: DocumentSummary[];
  loading: boolean;
  error: string | null;
  searchQuery: string;
  setSearchQuery: (q: string) => void;

  busyId: string | null;
  rename: (id: string, title: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  duplicate: (id: string) => Promise<DocumentSummary | null>;
  archive: (id: string) => Promise<void>;
  unarchive: (id: string) => Promise<void>;

  propertiesOpen: boolean;
  openProperties: () => void;
  closeProperties: () => void;
  versions: DocumentVersionSummary[];
  history: DocumentHistoryEntry[];
  propertiesLoading: boolean;
  loadProperties: (id: string) => Promise<void>;
}

const DocumentLibraryContext = createContext<DocumentLibraryContextValue | null>(null);

/**
 * Phase 13 (document management) — a plain CRUD provider over the
 * user's whole document collection, independent of whatever's
 * currently open (see WorkspaceProviders.tsx's placement reasoning
 * for AiSettingsProvider — this sits alongside it for the same
 * "no dependency on anything else" reason). Deliberately separate
 * from useOpenDocument's `recentDocuments` (the Open dialog's fast,
 * unsearchable quick-pick) — this is the fuller management surface
 * the ribbon's own `home.recent` command is for.
 */
export function DocumentLibraryProvider({ children }: { children: ReactNode }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQueryState] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [versions, setVersions] = useState<DocumentVersionSummary[]>([]);
  const [history, setHistory] = useState<DocumentHistoryEntry[]>([]);
  const [propertiesLoading, setPropertiesLoading] = useState(false);

  const refetch = useCallback(async (query: string) => {
    setLoading(true);
    setError(null);
    try {
      setDocuments(await listDocuments(query || undefined));
    } catch (err) {
      setError(extractErrorMessage(err, "Couldn't load your documents."));
    } finally {
      setLoading(false);
    }
  }, []);

  const openDialog = useCallback(() => {
    setDialogOpen(true);
    setSearchQueryState("");
    void refetch("");
  }, [refetch]);

  const closeDialog = useCallback(() => setDialogOpen(false), []);

  const setSearchQuery = useCallback(
    (q: string) => {
      setSearchQueryState(q);
      void refetch(q);
    },
    [refetch],
  );

  const runMutating = useCallback(
    async (id: string, action: () => Promise<DocumentSummary | void>): Promise<DocumentSummary | null> => {
      setBusyId(id);
      setError(null);
      try {
        const result = await action();
        await refetch(searchQuery);
        return result ?? null;
      } catch (err) {
        setError(extractErrorMessage(err, "That change couldn't be applied."));
        return null;
      } finally {
        setBusyId(null);
      }
    },
    [refetch, searchQuery],
  );

  const rename = useCallback(
    async (id: string, title: string) => {
      await runMutating(id, () => renameDocument(id, title));
    },
    [runMutating],
  );

  const remove = useCallback(
    async (id: string) => {
      await runMutating(id, () => deleteDocument(id));
    },
    [runMutating],
  );

  const duplicate = useCallback(
    (id: string) => runMutating(id, () => duplicateDocument(id)),
    [runMutating],
  );

  const archive = useCallback(
    async (id: string) => {
      await runMutating(id, () => archiveDocument(id));
    },
    [runMutating],
  );

  const unarchive = useCallback(
    async (id: string) => {
      await runMutating(id, () => unarchiveDocument(id));
    },
    [runMutating],
  );

  const openProperties = useCallback(() => setPropertiesOpen(true), []);
  const closeProperties = useCallback(() => {
    setPropertiesOpen(false);
    setVersions([]);
    setHistory([]);
  }, []);

  const loadProperties = useCallback(async (id: string) => {
    setPropertiesLoading(true);
    try {
      const [v, h] = await Promise.all([getDocumentVersions(id), getDocumentHistory(id)]);
      setVersions(v);
      setHistory(h);
    } catch (err) {
      setError(extractErrorMessage(err, "Couldn't load document properties."));
    } finally {
      setPropertiesLoading(false);
    }
  }, []);

  const value: DocumentLibraryContextValue = {
    dialogOpen,
    openDialog,
    closeDialog,
    documents,
    loading,
    error,
    searchQuery,
    setSearchQuery,
    busyId,
    rename,
    remove,
    duplicate,
    archive,
    unarchive,
    propertiesOpen,
    openProperties,
    closeProperties,
    versions,
    history,
    propertiesLoading,
    loadProperties,
  };

  return <DocumentLibraryContext.Provider value={value}>{children}</DocumentLibraryContext.Provider>;
}

export function useDocumentLibrary(): DocumentLibraryContextValue {
  const ctx = useContext(DocumentLibraryContext);
  if (!ctx) {
    throw new Error("useDocumentLibrary must be used within a DocumentLibraryProvider");
  }
  return ctx;
}
