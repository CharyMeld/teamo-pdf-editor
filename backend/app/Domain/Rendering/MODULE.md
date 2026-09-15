# Rendering

**Responsibility:** Turning a stored PDF into what the frontend needs to display it
— page thumbnails, page images/text for the canvas. Server-side rendering support
(e.g. `pdftoppm`) plus the client-side contract for `pdf.js` in the frontend.

**Owns:** No tables — reads `document_pages` (owned by Pages) for geometry.

**Phase 0 status:** Scaffolded directory only, no logic. Ships in Phase 1 alongside
the RENDER lifecycle stage.
