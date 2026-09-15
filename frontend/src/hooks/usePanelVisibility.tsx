import { createContext, useContext, useState, type ReactNode } from "react";

interface PanelVisibilityValue {
  thumbnailOpen: boolean;
  inspectorOpen: boolean;
  toggleThumbnail: () => void;
  toggleInspector: () => void;
  openThumbnail: () => void;
  closeThumbnail: () => void;
  closeInspector: () => void;
}

const PanelVisibilityContext = createContext<PanelVisibilityValue | null>(null);

/** Real show/hide state for the thumbnail panel and Smart Inspector on
 * tablet/mobile, where they become toggleable drawers instead of
 * permanently docked panes (see DocumentWorkspace + StatusBar's toggle
 * buttons). On desktop this state is simply unused — both panels render
 * docked regardless. */
export function PanelVisibilityProvider({ children }: { children: ReactNode }) {
  const [thumbnailOpen, setThumbnailOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);

  return (
    <PanelVisibilityContext.Provider
      value={{
        thumbnailOpen,
        inspectorOpen,
        toggleThumbnail: () => setThumbnailOpen((v) => !v),
        toggleInspector: () => setInspectorOpen((v) => !v),
        openThumbnail: () => setThumbnailOpen(true),
        closeThumbnail: () => setThumbnailOpen(false),
        closeInspector: () => setInspectorOpen(false),
      }}
    >
      {children}
    </PanelVisibilityContext.Provider>
  );
}

export function usePanelVisibility(): PanelVisibilityValue {
  const ctx = useContext(PanelVisibilityContext);
  if (!ctx) {
    throw new Error("usePanelVisibility must be used within a PanelVisibilityProvider");
  }
  return ctx;
}
