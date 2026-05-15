# Code Review and Understanding Artifacts

Use when artifact explains code, reviews a change, or makes a PR easier to inspect.

## Design guidance

- Start with what changed and why it matters.
- Show reviewer-critical path first: risky files, behavioral changes, data flow, contracts, and test surface.
- Use severity labels consistently: blocker, major, minor, note.
- Keep findings tied to exact code locations or concrete behavior. Avoid vague review prose.
- Use annotated code blocks for snippets; use tables for findings and file summaries.
- For diffs, group by concept rather than raw file order when that improves understanding.
- Highlight hidden coupling: persistence, async behavior, errors, retries, cleanup, auth, and edge cases.
- Include “what to verify” as a short checklist.
- Separate facts from recommendations. Do not imply code was inspected unless it was.
- Avoid recreating full GitHub diff. Show only code needed to understand risk.

## Useful primitives

- `.code-block` for snippets and diff excerpts.
- `.badge`, `.severity-*`, `.status-*` for findings.
- `.table-wrap` for file/risk tables.
- `.flow` or SVG `.diagram` for runtime paths.
- `details` for lower-priority supporting evidence.
