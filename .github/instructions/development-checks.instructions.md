---
description: "Use when writing or modifying Python, JavaScript, TypeScript, or React code in this repo. Run the matching Makefile *check target during development: `make pycheck` for Python/backend work, `make jscheck` for JS/TS/frontend work, and both if a change spans both areas."
applyTo:
  - "**/*.py"
  - "**/*.js"
  - "**/*.jsx"
  - "**/*.ts"
  - "**/*.tsx"
---
# Development Checks

- Use the repo's `*check` Makefile targets during development instead of ad hoc lint and test commands.
- For Python or backend changes, run `make pycheck`.
- For JavaScript, TypeScript, or frontend changes, run `make jscheck`.
- If a change touches both Python and JS/TS code, run both `make pycheck` and `make jscheck`.
- Treat these targets as the default validation path before finishing work in the affected area.