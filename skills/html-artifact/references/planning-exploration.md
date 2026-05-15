# Planning and Exploration Artifacts

Use when artifact helps choose direction, compare approaches, or turn ambiguity into execution plan.

## Design guidance

- Lead with decision context: goal, constraints, current recommendation, and open questions.
- Make options comparable. Use same fields for each option: shape, upside, downside, risk, effort, and best-fit case.
- Show tradeoffs visually with cards, matrices, timelines, or side-by-side columns.
- Use hierarchy to separate scan layer from detail layer. Readers should get gist in under a minute.
- Prefer concrete implementation sequence over generic phases. Name dependencies and decision gates.
- Include diagrams only where they reduce explanation: flow, ownership, data movement, or timeline.
- Use callouts for critical risks, irreversible decisions, and assumptions.
- Include enough technical detail to make plan review useful, but avoid burying recommendation under exhaustive notes.
- When several paths are viable, make default choice obvious and explain why now.
- End with next action, owner if known, and what would invalidate plan.

## Useful primitives

- `.split` for recommendation plus details.
- `.grid` and `.panel` for options.
- `.timeline` for implementation sequence.
- `.status-*` and `.severity-*` for risk and confidence.
- SVG `.diagram` when dependencies or flows matter.
