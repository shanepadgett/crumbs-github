# Design and Prototype Artifacts

Use when artifact explores UI, interaction, animation, or design system behavior.

## Design guidance

- Make prototype feel like product, not moodboard. Use Arc Lite tokens and compact app layout.
- Show interactive state when it matters: hover, focus, selected, disabled, error, empty, loading.
- Prefer direct labels and functional UI over decorative copy.
- If comparing variants, make differences obvious and label tradeoff each variant makes.
- For interaction tuning, expose controls that affect the preview and provide copyable output values.
- Use strong color for action, selection, and state only. Do not make purple dominant unless explicitly brand-led.
- Keep spacing disciplined. Do not nest cards inside cards.
- Use native controls where possible; add JS only for interaction that proves idea.
- Make mobile behavior deliberate with existing responsive primitives.
- End with what the viewer should judge: clarity, density, motion feel, affordance, or workflow.

## Useful primitives

- `.panel`, `.toolbar`, `.cluster`, `.stack` for app-like UI.
- `.button`, `.field`, `.badge`, `.chip` for controls and state.
- `.split` for controls plus preview.
- Copy helper for exporting tuned params.
- `details` for variant notes without clutter.
