---
description: "Use when writing or modifying JavaScript, TypeScript, React, PDF viewer, annotation overlay, or frontend state code for the ACORD annotation UI. Covers the approved frontend stack: react-pdf, PDF.js viewport transforms, react-konva, Zustand, and React Hook Form with Zod."
applyTo:
  - "**/*.js"
  - "**/*.jsx"
  - "**/*.ts"
  - "**/*.tsx"
---
# Frontend Stack

- Start with `react-pdf` for PDF rendering and use the underlying PDF.js viewport as the browser-side transform authority.
- Only drop to direct PDF.js if lower-level viewport or overlay control becomes necessary.
- Use `react-konva` and Konva for rectangle drawing, selection, resize handles, layers, and hit-testing. Do not build a custom canvas engine.
- Keep browser-side coordinate conversion explicit through `viewportRectToPdfBbox()` and `pdfBboxToViewportRect()`.
- Use Zustand for annotation and session state.
- Use React Hook Form with Zod for sidebar draft state, validation, and keyboard-save behavior.
- Keep three explicit UI states separate: transient rectangle, editable draft field, and saved recipe field.
- Let PDF.js own viewport transforms and let the overlay follow rendered page dimensions.
