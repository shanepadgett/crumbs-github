# Grill-me Handoff

Use when current interview reaches decision that needs deeper analysis in new chat before original interview continues.

## Purpose

Create handoff document for fresh agent. Fresh agent should analyze unresolved decision, write informed answer back into same handoff file, then user brings file back to original grill-me session. Original session reads handoff result and updates decision record.

## File

- Copy `templates/handoff.md` to `.working/interviews/<name>/handoffs/handoff-<handoff-name>.md`.
- Use concise kebab-case `<handoff-name>` from unresolved decision or question.
- Create `.working/interviews/<name>/handoffs/` if needed.
- Replace template placeholders with current interview context.
- Tell user handoff path after writing.

## Include

- Original interview decision file path: `.working/interviews/<name>/decisions.md`. Fresh agent should read it for initial context, but must not edit it.
- Exact unresolved decision or question
- Goal for fresh chat
- Decision criteria
- Context needed to answer without replaying whole chat, including relevant files already read
- Viable options under consideration, with real tradeoffs
- Current recommendation, if any, and confidence
- Known constraints, evidence, code paths, or artifacts by path/URL
- Conflicts or uncertainty from decision file that fresh agent should resolve
- Requested output: informed answer written back into this handoff file, including rationale, explored evidence, and suggested decision-file updates for original session to apply

## Rules

- Do not duplicate content already captured in decision file, plans, ADRs, issues, diffs, or other artifacts. Reference paths/URLs instead.
- Do not update original decision file from fresh chat. Original grill-me session owns decision record reconciliation.
- Do not invent consensus.
- Keep bad/non-viable options out unless explaining why rejected.
- Separate facts from opinion.
- Tailor handoff to one decision. If multiple decisions need deeper work, create separate handoffs.
