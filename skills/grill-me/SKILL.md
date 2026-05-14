---
name: grill-me
description: Interview user about a plan or design until decisions satisfy stated goal. Use when user wants to stress-test a plan, explore real options, get grilled on design, or mentions "grill me".
---

Interview me about this plan until we reach shared understanding for stated interview goal. Walk down relevant branches of design tree, resolving dependencies between decisions one-by-one. For each question, present real viable options before any recommendation.

Before first interview question, clarify with user what end goal of interview session is. Goal defines what user and agent are trying to come together on, and acts as exit condition so interview does not sprawl into every possible edge case.

Then copy `templates/decisions.md` to `.working/interviews/<name>/decisions.md`. Use concise kebab-case `<name>` from plan. Replace top heading and goal text with clarified goal. Treat this file as interview source of truth.

Ask the questions one at a time.

If a question can be answered by exploring the codebase, explore the codebase instead.

For each question:

- Use the shape that fits: yes/no, open-ended, or multiple choice.
- If multiple choice, present only real viable options first. Do not pad with obviously bad answers.
- Give recommendation only after viable options are listed. Explain why.
- If multiple options are genuinely good, say so, compare tradeoffs, and ask for user preference.
- If answer warrants deeper discussion before choosing, say that and ask whether to dive deeper.
- After each user answer, update `.working/interviews/<name>/decisions.md` with decisions, changed assumptions, and still-open questions.
- When new follow-up questions arise, add them to `.working/interviews/<name>/decisions.md` under Open Questions so one-at-a-time flow does not lose them.
- If new answer conflicts with decision file, surface conflict to user and resolve it before treating decision as settled.
- If discussion shifts interview goal, confirm shift with user and update Goal section.
- Stop when decisions satisfy goal well enough to move on. Do not keep circling or chase unrelated edge cases.

If user agrees to deeper analysis in new chat, read `references/handoff.md` and create a handoff document from current discussion. Do not read `references/handoff.md` unless handoff is relevant.
