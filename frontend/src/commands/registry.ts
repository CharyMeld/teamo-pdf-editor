import type { Command, SelectionType, TabId } from "./types";

// The command registry: every command the ribbon and command search know
// about. Most are `status: "unavailable"` because their feature is a future
// phase — this is an honest declaration, not a fake button. A handful of
// VIEW commands are genuinely implemented (zoom/fit are real client-side UI
// state in Phase 1) and get their `run` wired at render time by the
// component that owns that state (see useDocumentViewState / StatusBar) —
// this file only marks them `status: "available"` and leaves `run`
// undefined; callers that render an available command must supply `run`
// or the command is treated as inert.

const UNIMPLEMENTED = "unavailable" as const;

export const REGISTRY: Command[] = [
  // ---- HOME --------------------------------------------------------------
  {
    id: "home.open",
    label: "Open",
    description: "Open a PDF document from your computer",
    tab: "HOME",
    group: "Document",
    keywords: ["upload", "import", "load", "file"],
    icon: "open",
    shortcut: "Ctrl+O",
    // Real as of Phase 2 (PDF viewing/rendering) — see useOpenDocument
    // and DocumentController. This is the first command in the registry
    // to flip from "unavailable"; its `run` is wired by whichever
    // component renders it (CommandRibbon, AppHeader's search, PdfCanvas's
    // empty state), all via the same onRun mechanism CommandButton
    // already supports — never a special case outside the registry.
    status: "available",
  },
  {
    id: "home.save",
    label: "Save",
    description: "Save changes to the current document as a new version",
    tab: "HOME",
    group: "Document",
    keywords: ["save version", "persist"],
    icon: "save",
    shortcut: "Ctrl+S",
    // Real as of Phase 3 (page-management engine) — see useWorkingDocument.
    // Original file stays untouched; Save creates a new DocumentVersion.
    status: "available",
  },
  {
    id: "home.saveAs",
    label: "Save a Copy",
    description: "Save the current document as a new, independent file",
    tab: "HOME",
    group: "Document",
    keywords: ["duplicate", "export copy"],
    status: "available",
  },
  {
    id: "home.close",
    label: "Close",
    description: "Close the current document",
    tab: "HOME",
    group: "Document",
    keywords: ["exit document"],
    status: UNIMPLEMENTED,
  },
  {
    id: "home.recent",
    label: "Recent Documents",
    description: "Browse recently opened documents",
    tab: "HOME",
    group: "Recent",
    keywords: ["history", "last opened"],
    status: UNIMPLEMENTED,
  },
  {
    id: "home.properties",
    label: "Document Properties",
    description: "View title, author, and file details",
    tab: "HOME",
    group: "Recent",
    keywords: ["metadata", "info"],
    status: UNIMPLEMENTED,
  },

  // ---- EDIT ----------------------------------------------------------------
  {
    id: "edit.addText",
    label: "Add Text",
    description: "Insert a text box on the current page",
    tab: "EDIT",
    group: "Content",
    keywords: ["text box", "type"],
    icon: "text",
    // Real as of Phase 4 (content-editing engine) — see
    // useContentEditorRunHandlers / content-editor/useContentObjects.
    status: "available",
  },
  {
    id: "edit.addImage",
    label: "Add Image",
    description: "Insert an image on the current page",
    tab: "EDIT",
    group: "Content",
    keywords: ["picture", "insert image"],
    icon: "image",
    status: "available",
  },
  {
    id: "edit.editText",
    label: "Edit Text",
    description: "Cover existing text with new text (overlay edit)",
    tab: "EDIT",
    group: "Content",
    keywords: ["modify text", "change text"],
    icon: "text",
    status: "available",
  },
  {
    id: "edit.undo",
    label: "Undo",
    description: "Undo the last page-management change",
    tab: "EDIT",
    group: "History",
    keywords: ["revert"],
    icon: "undo",
    shortcut: "Ctrl+Z",
    // Real as of Phase 3 — currently covers ORGANIZE's page operations,
    // the only editable state that exists so far (see useWorkingDocument).
    status: "available",
  },
  {
    id: "edit.redo",
    label: "Redo",
    description: "Redo the last undone change",
    tab: "EDIT",
    group: "History",
    keywords: ["repeat"],
    icon: "redo",
    shortcut: "Ctrl+Y",
    status: "available",
  },

  // ---- VIEW — genuinely implemented in Phase 1 (client-side UI state) ------
  {
    id: "view.zoomIn",
    label: "Zoom In",
    description: "Increase the zoom level",
    tab: "VIEW",
    group: "Zoom",
    keywords: ["magnify", "larger"],
    icon: "zoomIn",
    shortcut: "Ctrl+=",
    status: "available",
  },
  {
    id: "view.zoomOut",
    label: "Zoom Out",
    description: "Decrease the zoom level",
    tab: "VIEW",
    group: "Zoom",
    keywords: ["shrink", "smaller"],
    icon: "zoomOut",
    shortcut: "Ctrl+-",
    status: "available",
  },
  {
    id: "view.fitPage",
    label: "Fit Page",
    description: "Fit the whole page in the viewport",
    tab: "VIEW",
    group: "Zoom",
    keywords: ["fit height", "whole page"],
    icon: "fitPage",
    status: "available",
  },
  {
    id: "view.fitWidth",
    label: "Fit Width",
    description: "Fit the page width to the viewport",
    tab: "VIEW",
    group: "Zoom",
    keywords: ["fit horizontal"],
    icon: "fitWidth",
    status: "available",
  },
  {
    id: "view.nextPage",
    label: "Next Page",
    description: "Go to the next page",
    tab: "VIEW",
    group: "Navigation",
    keywords: ["forward"],
    icon: "next",
    status: "available",
  },
  {
    id: "view.prevPage",
    label: "Previous Page",
    description: "Go to the previous page",
    tab: "VIEW",
    group: "Navigation",
    keywords: ["back"],
    icon: "prev",
    status: "available",
  },
  {
    id: "view.search",
    label: "Search Document",
    description: "Search text within the open document",
    tab: "VIEW",
    group: "Navigation",
    keywords: ["find", "text search"],
    status: UNIMPLEMENTED,
  },

  // ---- ORGANIZE --------------------------------------------------------------
  // Real as of Phase 3 — every command below calls the qpdf/Ghostscript-
  // backed operation engine (see ARCHITECTURE.md's Phase 3 sections). Their
  // `run` handlers are wired at render time from useWorkingDocument +
  // usePageSelection, same pattern as HOME's Open (Phase 2) and VIEW's
  // zoom/fit (Phase 1).
  {
    id: "organize.rotate",
    label: "Rotate",
    description: "Rotate the selected page(s)",
    tab: "ORGANIZE",
    group: "Pages",
    keywords: ["turn", "orientation"],
    icon: "rotate",
    status: "available",
    dropdown: [
      {
        id: "organize.rotate.left",
        label: "Rotate Left",
        description: "Rotate the selected page(s) 90° counter-clockwise",
        tab: "ORGANIZE",
        group: "Pages",
        keywords: ["rotate ccw"],
        status: "available",
      },
      {
        id: "organize.rotate.right",
        label: "Rotate Right",
        description: "Rotate the selected page(s) 90° clockwise",
        tab: "ORGANIZE",
        group: "Pages",
        keywords: ["rotate cw"],
        status: "available",
      },
    ],
  },
  {
    id: "organize.deletePage",
    label: "Delete",
    description: "Remove the selected page(s) from the document",
    tab: "ORGANIZE",
    group: "Pages",
    keywords: ["remove page", "delete page"],
    icon: "trash",
    status: "available",
  },
  {
    id: "organize.duplicatePage",
    label: "Duplicate",
    description: "Duplicate the selected page(s)",
    tab: "ORGANIZE",
    group: "Pages",
    keywords: ["copy page", "clone page"],
    icon: "duplicate",
    status: "available",
  },
  {
    id: "organize.insertPage",
    label: "Insert",
    description: "Insert a blank page or a page from another file",
    tab: "ORGANIZE",
    group: "Pages",
    keywords: ["add page", "new page"],
    icon: "insertPage",
    status: "available",
  },
  {
    id: "organize.replacePage",
    label: "Replace",
    description: "Replace a page's content with a page from another file",
    tab: "ORGANIZE",
    group: "Pages",
    keywords: ["swap page"],
    icon: "open",
    status: "available",
  },
  {
    id: "organize.cropPage",
    label: "Crop",
    description: "Crop the selected page to a custom area",
    tab: "ORGANIZE",
    group: "Pages",
    keywords: ["trim page", "crop box"],
    icon: "crop",
    status: "available",
  },
  {
    id: "organize.reorderPages",
    label: "Reorder Pages",
    description: "Drag pages in the thumbnail panel to change their order",
    tab: "ORGANIZE",
    group: "Pages",
    keywords: ["move page", "rearrange", "drag"],
    icon: "drag",
    status: "available",
  },
  {
    id: "organize.extractPages",
    label: "Extract Pages",
    description: "Save selected pages as a new document",
    tab: "ORGANIZE",
    group: "Combine",
    keywords: ["pull pages"],
    icon: "split",
    status: "available",
  },
  {
    id: "organize.splitDocument",
    label: "Split Document",
    description: "Split the document into multiple new documents by page range",
    tab: "ORGANIZE",
    group: "Combine",
    keywords: ["divide document"],
    icon: "split",
    status: "available",
  },
  {
    id: "organize.merge",
    label: "Merge Documents",
    description: "Combine another document into this one",
    tab: "ORGANIZE",
    group: "Combine",
    keywords: ["combine", "append document"],
    icon: "merge",
    status: "available",
  },

  // ---- ANNOTATE --------------------------------------------------------------
  // Real as of Phase 5 (annotation engine) — see useAnnotationRunHandlers /
  // annotations/useAnnotations.
  {
    id: "annotate.highlight",
    label: "Highlight",
    description: "Highlight an area of the page",
    tab: "ANNOTATE",
    group: "Markup",
    keywords: ["marker"],
    icon: "highlight",
    status: "available",
  },
  {
    id: "annotate.underline",
    label: "Underline",
    description: "Draw an underline under an area of the page",
    tab: "ANNOTATE",
    group: "Markup",
    keywords: ["line under text"],
    icon: "underline",
    status: "available",
  },
  {
    id: "annotate.strikethrough",
    label: "Strikethrough",
    description: "Draw a strikethrough over an area of the page",
    tab: "ANNOTATE",
    group: "Markup",
    keywords: ["cross out", "line through"],
    icon: "strikethrough",
    status: "available",
  },
  {
    id: "annotate.freehand",
    label: "Freehand Draw",
    description: "Draw freehand on the page",
    tab: "ANNOTATE",
    group: "Markup",
    keywords: ["pen", "draw"],
    icon: "pen",
    status: "available",
  },
  {
    id: "annotate.rectangle",
    label: "Rectangle",
    description: "Draw a rectangle on the page",
    tab: "ANNOTATE",
    group: "Shapes",
    keywords: ["square", "box"],
    icon: "rectangle",
    status: "available",
  },
  {
    id: "annotate.circle",
    label: "Circle",
    description: "Draw a circle or ellipse on the page",
    tab: "ANNOTATE",
    group: "Shapes",
    keywords: ["ellipse", "oval"],
    icon: "circle",
    status: "available",
  },
  {
    id: "annotate.arrow",
    label: "Arrow",
    description: "Draw an arrow on the page",
    tab: "ANNOTATE",
    group: "Shapes",
    keywords: ["pointer"],
    icon: "arrow",
    status: "available",
  },
  {
    id: "annotate.textBox",
    label: "Text Box",
    description: "Add a text box annotation to the page",
    tab: "ANNOTATE",
    group: "Text & Notes",
    keywords: ["callout", "comment box"],
    icon: "text",
    status: "available",
  },
  {
    id: "annotate.note",
    label: "Sticky Note",
    description: "Add a note comment to the page",
    tab: "ANNOTATE",
    group: "Text & Notes",
    keywords: ["comment"],
    icon: "stickyNote",
    status: "available",
  },
  {
    id: "annotate.stamp",
    label: "Stamp",
    description: "Add a stamp to the page",
    tab: "ANNOTATE",
    group: "Text & Notes",
    keywords: ["approved", "reviewed"],
    icon: "stamp",
    status: "available",
  },

  // ---- FORMS --------------------------------------------------------------
  {
    id: "forms.addTextField",
    label: "Add Text Field",
    description: "Insert a fillable text field",
    tab: "FORMS",
    group: "Fields",
    keywords: ["form field", "input"],
    // Real as of Phase 10 (PDF forms) — a genuine, native, interactive
    // AcroForm widget (verified via pdftk dump_data_fields), not a
    // drawing — see forms/useFormFields and FormFieldLayer.
    status: "available",
  },
  {
    id: "forms.addCheckbox",
    label: "Add Checkbox",
    description: "Insert a checkbox field",
    tab: "FORMS",
    group: "Fields",
    keywords: ["form field"],
    status: "available",
  },
  {
    id: "forms.addRadioButton",
    label: "Add Radio Button",
    description: "Insert a radio-button option",
    tab: "FORMS",
    group: "Fields",
    keywords: ["form field", "radio group", "option"],
    status: "available",
  },
  {
    id: "forms.addDropdown",
    label: "Add Dropdown",
    description: "Insert a dropdown/choice field",
    tab: "FORMS",
    group: "Fields",
    keywords: ["form field", "combo box", "select"],
    status: "available",
  },
  {
    id: "forms.addDateField",
    label: "Add Date Field",
    description: "Insert a date field",
    tab: "FORMS",
    group: "Fields",
    keywords: ["form field", "date"],
    status: "available",
  },
  {
    id: "forms.addSignatureField",
    label: "Add Signature Field",
    // Deliberately honest: this places a visual placeholder only, not an
    // interactive/cryptographic signature field — see
    // FormFieldEngine's docblock. Full signing is a later phase.
    description: "Insert a placeholder area for a future signature",
    tab: "FORMS",
    group: "Fields",
    keywords: ["form field", "sign here"],
    status: "available",
  },
  {
    id: "forms.clearAll",
    label: "Clear All Fields",
    description: "Reset every fillable field's value",
    tab: "FORMS",
    group: "Tools",
    keywords: ["reset form", "clear values"],
    status: "available",
  },
  {
    id: "forms.detectFields",
    label: "Auto-Detect Fields",
    description: "Scan the document for fillable fields",
    tab: "FORMS",
    group: "Tools",
    keywords: ["autodetect"],
    // Stays unimplemented — reliably detecting candidate fields in an
    // arbitrary existing PDF isn't achievable with this stack's tools;
    // not faked (see ARCHITECTURE.md's Phase 10 section).
    status: UNIMPLEMENTED,
  },

  // ---- OCR --------------------------------------------------------------
  {
    id: "ocr.run",
    label: "Run OCR",
    description: "Recognize text in scanned pages",
    tab: "OCR",
    group: "Recognition",
    keywords: ["scan", "recognize text", "searchable pdf"],
    status: "available",
  },
  {
    id: "ocr.language",
    label: "OCR Language",
    description: "Choose the language used for text recognition",
    tab: "OCR",
    group: "Recognition",
    keywords: ["language pack"],
    status: "available",
  },
  {
    id: "ocr.reviewResults",
    label: "Review OCR Results",
    description: "Review and correct recognized text",
    tab: "OCR",
    group: "Recognition",
    keywords: ["proofread"],
    status: "available",
  },

  // ---- CONVERT --------------------------------------------------------------
  {
    id: "convert.toText",
    label: "Convert to Text",
    description: "Extract the document's text as a .txt file",
    tab: "CONVERT",
    group: "Export",
    keywords: ["txt", "extract text", "plain text"],
    // Real as of Phase 8 (document conversion) — see
    // conversion/useConversionWorkflow and ExportDialog.
    status: "available",
  },
  {
    id: "convert.toWord",
    label: "Convert to Word",
    description: "Export the document as a Word file",
    tab: "CONVERT",
    group: "Export",
    keywords: ["docx", "word document"],
    // Real as of Phase 8 — text/paragraph-level conversion (pdftohtml ->
    // pandoc), not pixel-perfect layout preservation; ExportDialog says so.
    status: "available",
  },
  {
    id: "convert.toImage",
    label: "Convert to Images",
    description: "Export pages as image files",
    tab: "CONVERT",
    group: "Export",
    keywords: ["png", "jpg", "image export"],
    // Real as of Phase 8 — see conversion/useConversionWorkflow and
    // ExportDialog (scope + PNG/JPEG choice, zipped for download).
    status: "available",
  },
  {
    id: "convert.fromImage",
    label: "Create PDF from Images",
    description: "Combine images into a new PDF",
    tab: "CONVERT",
    group: "Import",
    keywords: ["image to pdf"],
    icon: "image",
    // Real as of Phase 6 (scanning/image-import) — see
    // scanning/useScanWorkflow and CreatePdfFromImagesDialog. Unlike
    // EDIT/ANNOTATE's commands, this needs no document currently open —
    // it always creates a brand-new one, same as Merge/Split.
    status: "available",
  },
  {
    id: "convert.fromOffice",
    label: "Create PDF from Word Document",
    // Deliberately narrowed from "Word, Excel, or PowerPoint" — Phase 8
    // verified no engine on this host can reliably read .xlsx/.pptx (no
    // LibreOffice/soffice/unoconv, and pandoc has no input support for
    // either); only real .docx -> PDF (pandoc + wkhtmltopdf) is real here.
    description: "Convert a real .docx Word document to PDF",
    tab: "CONVERT",
    group: "Import",
    keywords: ["docx", "word to pdf"],
    // Real as of Phase 8 — see conversion/useConversionWorkflow and
    // OfficeToPdfDialog.
    status: "available",
  },

  // ---- COMPRESS --------------------------------------------------------------
  {
    id: "compress.maxQuality",
    label: "Compress (Maximum Quality)",
    description: "Minimal size reduction, best visual quality",
    tab: "COMPRESS",
    group: "Reduce Size",
    keywords: ["high quality", "light compression"],
    // Real as of Phase 9 (compression) — see
    // compression/useCompressionWorkflow and CompressDialog.
    status: "available",
  },
  {
    id: "compress.standard",
    label: "Compress (Standard)",
    description: "Reduce file size with balanced quality",
    tab: "COMPRESS",
    group: "Reduce Size",
    keywords: ["shrink", "optimize", "reduce file size", "balanced"],
    status: "available",
  },
  {
    id: "compress.strong",
    label: "Compress (Strong)",
    description: "Maximize file size reduction",
    tab: "COMPRESS",
    group: "Reduce Size",
    keywords: ["shrink more", "aggressive compression", "maximum compression"],
    status: "available",
  },
  {
    id: "compress.custom",
    label: "Compress (Custom)",
    description: "Choose image DPI, quality, metadata, and cleanup options",
    tab: "COMPRESS",
    group: "Reduce Size",
    keywords: ["custom compression", "dpi", "image quality"],
    status: "available",
  },

  // ---- SIGN --------------------------------------------------------------
  {
    id: "sign.draw",
    label: "Draw Signature",
    description: "Draw and place your signature",
    tab: "SIGN",
    group: "Signature",
    keywords: ["sign document"],
    status: UNIMPLEMENTED,
  },
  {
    id: "sign.request",
    label: "Request Signature",
    description: "Send this document for signature",
    tab: "SIGN",
    group: "Signature",
    keywords: ["send for signing"],
    status: UNIMPLEMENTED,
  },
  {
    id: "sign.certificate",
    label: "Add Digital Certificate",
    description: "Sign with a digital certificate",
    tab: "SIGN",
    group: "Signature",
    keywords: ["certificate signing"],
    status: UNIMPLEMENTED,
  },

  // ---- AI --------------------------------------------------------------
  {
    id: "ai.summarize",
    label: "Summarize Document",
    description: "Generate a summary using local AI",
    tab: "AI",
    group: "Assist",
    keywords: ["summary", "tldr"],
    status: UNIMPLEMENTED,
  },
  {
    id: "ai.ask",
    label: "Ask About This Document",
    description: "Ask a question about the document's contents",
    tab: "AI",
    group: "Assist",
    keywords: ["question", "chat"],
    status: UNIMPLEMENTED,
  },
  {
    id: "ai.redactSuggest",
    label: "Suggest Redactions",
    description: "Suggest sensitive content to redact",
    tab: "AI",
    group: "Assist",
    keywords: ["redact", "sensitive data"],
    status: UNIMPLEMENTED,
  },

  // ---- HELP --------------------------------------------------------------
  {
    id: "help.shortcuts",
    label: "Keyboard Shortcuts",
    description: "View all keyboard shortcuts",
    tab: "HELP",
    group: "Reference",
    keywords: ["hotkeys"],
    status: UNIMPLEMENTED,
  },
  {
    id: "help.support",
    label: "Contact Support",
    description: "Get help from TeamO Digital Solutions",
    tab: "HELP",
    group: "Reference",
    keywords: ["contact", "support"],
    status: UNIMPLEMENTED,
  },
  {
    id: "help.about",
    label: "About TeamO PDF Editor",
    description: "Version and build information",
    tab: "HELP",
    group: "Reference",
    keywords: ["version", "build info"],
    status: UNIMPLEMENTED,
  },
];

export function getCommand(id: string): Command | undefined {
  for (const command of REGISTRY) {
    if (command.id === id) return command;
    if (command.dropdown) {
      const nested = command.dropdown.find((c) => c.id === id);
      if (nested) return nested;
    }
  }
  return undefined;
}

export function commandsForTab(tab: TabId): Command[] {
  return REGISTRY.filter((c) => c.tab === tab);
}

// Contextual commands: appended to the ribbon as an extra group when a
// selection of that type exists. Kept separate from REGISTRY's per-tab
// listing because the same contextual group can apply regardless of which
// tab is active.
export const CONTEXTUAL_COMMANDS: Record<Exclude<SelectionType, "none">, Command[]> = {
  // Real as of Phase 3 — sourced from real thumbnail-panel selection
  // (usePageSelection), not the dev simulator (see DevSelectionSimulator).
  // Crop/Replace only make sense for a single page; CommandRibbon supplies
  // a disabledReason for those two when the selection count isn't exactly 1.
  page: [
    {
      id: "context.page.rotate",
      label: "Rotate",
      description: "Rotate the selected page(s) 90° clockwise",
      tab: "ORGANIZE",
      group: "Selected Page",
      keywords: ["rotate"],
      icon: "rotate",
      status: "available",
    },
    {
      id: "context.page.duplicate",
      label: "Duplicate",
      description: "Duplicate the selected page(s)",
      tab: "ORGANIZE",
      group: "Selected Page",
      keywords: ["duplicate", "copy"],
      icon: "duplicate",
      status: "available",
    },
    {
      id: "context.page.crop",
      label: "Crop",
      description: "Crop the selected page to a custom area",
      tab: "ORGANIZE",
      group: "Selected Page",
      keywords: ["crop"],
      icon: "crop",
      status: "available",
    },
    {
      id: "context.page.replace",
      label: "Replace",
      description: "Replace the selected page's content with another file",
      tab: "ORGANIZE",
      group: "Selected Page",
      keywords: ["replace"],
      icon: "open",
      status: "available",
    },
    {
      id: "context.page.extract",
      label: "Extract",
      description: "Save the selected page(s) as a new document",
      tab: "ORGANIZE",
      group: "Selected Page",
      keywords: ["extract"],
      icon: "split",
      status: "available",
    },
    {
      id: "context.page.delete",
      label: "Delete",
      description: "Remove the selected page(s)",
      tab: "ORGANIZE",
      group: "Selected Page",
      keywords: ["delete"],
      icon: "trash",
      status: "available",
    },
  ],
  text: [
    {
      id: "context.text.style",
      label: "Text Style",
      description: "Change font, size, and color of the selected text",
      tab: "EDIT",
      group: "Selected Text",
      keywords: ["font", "style"],
      status: UNIMPLEMENTED,
    },
    {
      id: "context.text.highlight",
      label: "Highlight Selection",
      description: "Highlight the selected text",
      tab: "ANNOTATE",
      group: "Selected Text",
      keywords: ["highlight"],
      status: UNIMPLEMENTED,
    },
    {
      id: "context.text.delete",
      label: "Delete Text",
      description: "Delete the selected text",
      tab: "EDIT",
      group: "Selected Text",
      keywords: ["remove text"],
      icon: "trash",
      // Real as of Phase 4 — see useContentEditorRunHandlers.
      status: "available",
    },
  ],
  image: [
    {
      id: "context.image.resize",
      label: "Resize Image",
      description: "Resize the selected image",
      tab: "EDIT",
      group: "Selected Image",
      keywords: ["scale"],
      status: UNIMPLEMENTED,
    },
    {
      id: "context.image.replace",
      label: "Replace Image",
      description: "Replace the selected image with another file",
      tab: "EDIT",
      group: "Selected Image",
      keywords: ["swap image"],
      status: UNIMPLEMENTED,
    },
    {
      id: "context.image.delete",
      label: "Delete Image",
      description: "Remove the selected image",
      tab: "EDIT",
      group: "Selected Image",
      keywords: ["remove image"],
      icon: "trash",
      // Real as of Phase 4 — see useContentEditorRunHandlers.
      status: "available",
    },
  ],
  annotation: [
    {
      id: "context.annotation.color",
      label: "Change Color",
      description: "Change the color of the selected annotation",
      tab: "ANNOTATE",
      group: "Selected Annotation",
      keywords: ["color"],
      status: UNIMPLEMENTED,
    },
    {
      id: "context.annotation.reply",
      label: "Reply",
      description: "Reply to the selected annotation",
      tab: "ANNOTATE",
      group: "Selected Annotation",
      keywords: ["comment reply"],
      status: UNIMPLEMENTED,
    },
    {
      id: "context.annotation.delete",
      label: "Delete Annotation",
      description: "Remove the selected annotation",
      tab: "ANNOTATE",
      group: "Selected Annotation",
      keywords: ["remove annotation"],
      icon: "trash",
      // Real as of Phase 5 — see useAnnotationRunHandlers. "Change Color"
      // stays unavailable here (redundant with the Smart Inspector's own
      // real color controls, same precedent Phase 4 set for text/image);
      // "Reply" stays unavailable since no comment-thread system exists.
      status: "available",
    },
  ],
  form: [
    {
      id: "context.form.duplicate",
      label: "Duplicate",
      description: "Duplicate the selected form field",
      tab: "FORMS",
      group: "Selected Field",
      keywords: ["duplicate", "copy"],
      icon: "duplicate",
      status: "available",
    },
    {
      id: "context.form.delete",
      label: "Delete Field",
      description: "Remove the selected form field",
      tab: "FORMS",
      group: "Selected Field",
      keywords: ["remove field"],
      icon: "trash",
      status: "available",
    },
  ],
};
