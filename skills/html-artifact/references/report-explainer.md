# Report and Explainer Artifacts

Use when artifact synthesizes research, teaches a concept, explains architecture, or reports status/incident findings.

## Design guidance

- Optimize for one focused read. Make headline, summary, and takeaway obvious.
- Put executive summary before deep evidence.
- Use sections with clear claims. Each section should answer one reader question.
- Use diagrams for systems, timelines for events, stat blocks for key numbers, and tables for comparisons.
- Annotate code or data only when it directly supports understanding.
- Make uncertainty visible: known, unknown, assumption, confidence.
- For architecture, show boundaries, ownership, data flow, and dependency direction.
- For incidents, separate timeline, impact, cause, mitigation, and follow-ups.
- Avoid wall-of-text. Prefer dense, scannable panels and short paragraphs.
- End with implications, recommended next action, or decision needed.

## Useful primitives

- `.stat-grid` for key facts.
- `.sidebar-layout` for long explainers with outline.
- `.timeline` for sequence and incidents.
- SVG `.diagram` for systems.
- `.callout` for takeaways, caveats, and decisions.
