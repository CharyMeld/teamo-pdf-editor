// Small hand-authored stroke-icon set — original geometry, not pulled from
// any brand's icon library. Deliberately minimal: only the glyphs Phase 1
// actually uses.
export type IconName =
  | "search"
  | "settings"
  | "help"
  | "chevronDown"
  | "close"
  | "menu"
  | "panelLeft"
  | "panelRight"
  | "zoomIn"
  | "zoomOut"
  | "fitPage"
  | "fitWidth"
  | "prev"
  | "next"
  | "more"
  | "lock"
  | "user"
  | "open"
  | "save"
  | "document"
  | "rotate"
  | "trash"
  | "undo"
  | "redo"
  | "duplicate"
  | "crop"
  | "insertPage"
  | "merge"
  | "split"
  | "drag";

interface IconProps {
  name: IconName;
  className?: string;
  size?: number;
}

const PATHS: Record<IconName, string> = {
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm9 2-4.35-4.35",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8-3-1.9-.5.6-1.9-1.5-1.5-1.9.6L14.8 6h-3.6l-.5 1.7-1.9-.6-1.5 1.5.6 1.9L6 12l1.9.5-.6 1.9 1.5 1.5 1.9-.6.5 1.7h3.6l.5-1.7 1.9.6 1.5-1.5-.6-1.9L20 12Z",
  help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5v-.5c0-1 .6-1.5 1.3-2 .7-.5 1.2-1 1.2-2a2.5 2.5 0 0 0-5 0M12 16.5h.01",
  chevronDown: "m6 9 6 6 6-6",
  close: "M6 6l12 12M18 6 6 18",
  menu: "M4 7h16M4 12h16M4 17h16",
  panelLeft: "M4 5h16v14H4V5Zm6 0v14",
  panelRight: "M4 5h16v14H4V5Zm10 0v14",
  zoomIn: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm9 2-4.35-4.35M11 8v6M8 11h6",
  zoomOut: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm9 2-4.35-4.35M8 11h6",
  fitPage: "M4 4h6M4 4v6M20 4h-6M20 4v6M4 20h6M4 20v-6M20 20h-6M20 20v-6",
  fitWidth: "M3 12h18M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3",
  prev: "m15 6-6 6 6 6",
  next: "m9 6 6 6-6 6",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  lock: "M6 11V8a6 6 0 1 1 12 0v3M5 11h14v9H5v-9Z",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0",
  open: "M4 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z",
  save: "M5 4h11l3 3v13H5V4Zm3 0v5h8V4M8 14h8v6H8v-6Z",
  document: "M7 3h7l4 4v14H7V3Zm7 0v4h4",
  rotate: "M4 12a8 8 0 1 1 2.5 5.8M4 12v5M4 17h5",
  trash: "M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13M10 11v6M14 11v6",
  undo: "M8 8H4V4M4 8a8 8 0 1 1-1.5 6",
  redo: "M16 8h4V4M20 8a8 8 0 1 0 1.5 6",
  duplicate: "M8 8h11v11H8V8Z M5 16V5h11",
  crop: "M6 2v14a2 2 0 0 0 2 2h14M18 22V8a2 2 0 0 0-2-2H2",
  insertPage: "M6 3h8l4 4v14H6V3Zm8 0v4h4M12 12v6M9 15h6",
  merge: "M6 3v9a3 3 0 0 0 3 3h6M6 3H3l3-3 3 3H6ZM18 21v-9a3 3 0 0 0-3-3H9M18 21h3l-3 3-3-3h3Z",
  split: "M12 3v6M8 5l4-2 4 2M6 12h5v9H6v-9Zm7 0h5v9h-5v-9Z",
  drag: "M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01",
};

export default function Icon({ name, className, size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
