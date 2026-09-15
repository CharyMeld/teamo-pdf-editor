// Command registry types. See ARCHITECTURE.md "API / service boundary rule" —
// commands describe UI affordances only; any command whose underlying feature
// requires server-side processing stays `status: "unavailable"` until that
// module ships real logic.

export const TAB_IDS = [
  "HOME",
  "EDIT",
  "VIEW",
  "ORGANIZE",
  "ANNOTATE",
  "FORMS",
  "OCR",
  "CONVERT",
  "COMPRESS",
  "SIGN",
  "AI",
  "HELP",
] as const;

export type TabId = (typeof TAB_IDS)[number];

export type CommandStatus = "available" | "unavailable";

export interface Command {
  /** Stable, unique identifier — e.g. "documents.open". */
  id: string;
  label: string;
  /** Shown in search results and tooltips for unavailable commands. */
  description?: string;
  tab: TabId;
  /** Group label the command renders under within its tab. */
  group: string;
  /** Extra search terms beyond label/description (e.g. synonyms). */
  keywords: string[];
  /** Name of an icon in components/ui/Icon.tsx, if the command has one. */
  icon?: string;
  shortcut?: string;
  status: CommandStatus;
  /** Only present for genuinely implemented (status "available") commands. */
  run?: () => void;
  /** Sub-commands rendered in an attached dropdown menu, if any. */
  dropdown?: Command[];
}

export type SelectionType = "none" | "page" | "text" | "image" | "annotation";

export const SELECTION_TYPES: SelectionType[] = [
  "none",
  "page",
  "text",
  "image",
  "annotation",
];
