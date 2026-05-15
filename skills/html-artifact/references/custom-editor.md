# Custom Editor Artifacts

Use when artifact is a throwaway interface for editing, ranking, tuning, filtering, annotating, or exporting structured decisions.

## Design guidance

- Build for one task and one dataset. Do not turn it into reusable product.
- End with export: copy JSON, copy markdown, copy prompt, or copy diff.
- Keep original data visible enough that user trusts edits.
- Show constraints and warnings inline, near the control that triggers them.
- Prefer forms, lists, columns, sliders, filters, and drag-like grouping over freeform text when structure matters.
- Make changed state obvious. Include reset only when useful.
- If generated output is meant for agent input, make it concise and deterministic.
- Keep all state in the page unless user asks for persistence.
- Use simple JS only for task-specific interaction and export.
- Avoid general admin UI patterns that do not help current editing task.

## Useful primitives

- `.split` for editor plus live preview/export.
- `.toolbar` for filters/actions.
- `.field`, inputs, selects, textareas, ranges for editing.
- `.panel` and `.grid` for buckets/cards.
- Copy helper for export buttons.
