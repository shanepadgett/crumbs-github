---
name: refactor-opportunities-review
description: "Unified repo-health review. Runs hygiene, over-engineering, and runtime lenses, reconciles conflicts, and emits ordered work units. Adapts to detected languages with language-specific overlays."
---

# Refactor Opportunities Review

Target dir defaults to cwd.

## Modes

- `full`: hygiene + over-engineering + runtime
- `hygiene`
- `over-engineering`
- `runtime`

## Rules

- Use host-neutral language. Say `subagents`. Host may run them in parallel or
  sequentially.
- Agents do judgment. Scripts do shape.
- Orchestrator does discovery before dispatch.
- Subagents get only files relevant to their lane.
- Lens criteria live in one file per lens. Subagents read one section of that
  file, not one isolated file. Reason: preserve adjacent-criteria awareness.
- Lens criteria stay language-agnostic. Language-specific checks come from
  overlays in `references/languages/`.
- Every agent output must match `references/output-schema.md`.
- No automatic code changes.
- Build work units that do not fight each other.

## 1. Discovery

Top-level orchestrator must do discovery before dispatch.

Goals:

- detect active languages in target scope
- pick only matching language overlays
- avoid sending irrelevant overlays or criteria files to subagents
- keep prompts narrow and deterministic

Run:

```bash
RUN_DIR=.work/refactor-opportunities-review/$(date -u +%Y-%m-%dT%H-%M-%SZ)
MANIFEST=$RUN_DIR/run-manifest.json
mkdir -p "$RUN_DIR"
node .agents/skills/refactor-opportunities-review/scripts/detect-languages.mjs \
  . \
  "$RUN_DIR/detected-languages.json"
```

Read `detected-languages.json`. Decide active stacks for this run.

Rules:

- If reviewing whole repo, include all detected stacks with meaningful file
  counts.
- If reviewing subdir or feature scope, include only stacks present in scope.
- If one stack dominates target area, prefer only that stack's overlay.
- Do not send unused language overlays to subagents.
- Do not send overlays from unrelated stacks.

## 2. Setup

Create run dir and manifest.

```bash
mkdir -p "$RUN_DIR"
```

Write `run-manifest.json` with:

- `runId`
- `target`
- `mode`
- detected languages
- active language overlays for this run
- active lens sections
- paths for findings, compiled, normalized, reconciled, plan, plans

Then run:

```bash
node .agents/skills/refactor-opportunities-review/scripts/init-run.mjs "$MANIFEST"
```

## 3. Dispatch section-review subagents

Dispatch one subagent per active criteria section.

- `full` mode: 17 section subagents
- `hygiene`: 7
- `over-engineering`: 5
- `runtime`: 5

Each subagent gets:

- target dir
- manifest path
- one lens criteria file
- one section number
- only matching language overlays from `references/languages/`
- one output path
- `references/output-schema.md`

Prompt:

> Read section N of your lens criteria file, `references/output-schema.md`,
> and only the language overlays assigned to you. Do not read other language
> overlays. Do not read other lens criteria files. Investigate codebase in
> scope. Primary focus is your section, but flag adjacent issues in same lens
> if you spot them. Use assigned language overlays to refine checks, not
> replace lens criteria. Write exactly one findings markdown file to assigned
> output path. File only. No extra report text.

Dispatch rule:

- Orchestrator chooses overlay list first.
- Subagent receives explicit overlay paths.
- If no overlay matches, subagent uses lens criteria only.
- Mixed-language repo does not mean mixed-language prompt. Send only overlays
  relevant to target scope.

Criteria files:

| Lens | Sections |
|---|---|
| hygiene | `references/hygiene/criteria.md` sections 1-7 |
| over-engineering | `references/over-engineering/criteria.md` sections 1-5 |
| runtime | `references/runtime/criteria.md` sections 1-5 |

Language overlays:

| Stack | Overlay |
|---|---|
| Swift / SwiftUI | `references/languages/swift-swiftui.md` |
| Java | `references/languages/java.md` |
| Kotlin | `references/languages/kotlin.md` |
| JavaScript | `references/languages/javascript.md` |
| TypeScript | `references/languages/typescript.md` |

## 4. Validate raw findings

```bash
node .agents/skills/refactor-opportunities-review/scripts/validate-findings.mjs "$RUN_DIR/findings"
```

If any file fails, re-dispatch only failed section subagents.

## 5. Compile per lens

Run once per active lens:

```bash
node .agents/skills/refactor-opportunities-review/scripts/compile-lens-report.mjs "$RUN_DIR/findings/<lens>" "$RUN_DIR/compiled/<lens>.md" "<lens>"
```

## 6. Normalize and detect conflict candidates

```bash
node .agents/skills/refactor-opportunities-review/scripts/extract-issues.mjs "$RUN_DIR/normalized/issues.json" "$RUN_DIR/compiled"/*.md
node .agents/skills/refactor-opportunities-review/scripts/detect-conflicts.mjs "$RUN_DIR/normalized/issues.json" "$RUN_DIR/normalized/conflict-candidates.json"
```

## 7. Reconcile

Top-level orchestrator reads:

- active compiled lens reports
- `normalized/issues.json`
- `normalized/conflict-candidates.json`
- `references/reconcile.md`
- `references/output-schema.md`

Then write `reconciled-findings.md` in strict schema.

Use one reconcile subagent only if volume is too high for one pass.

## 8. Validate reconciled findings

```bash
node .agents/skills/refactor-opportunities-review/scripts/validate-findings.mjs "$RUN_DIR/reconciled-findings.md"
```

## 9. Scaffold and fill remediation plan

```bash
node .agents/skills/refactor-opportunities-review/scripts/scaffold-remediation.mjs "$RUN_DIR/remediation-plan.md"
```

Top-level orchestrator fills plan.

Requirements:

- group reconciled findings into work units
- order by dependencies first, then severity
- cite source finding IDs
- include why unit does not conflict with other units
- defer unresolved conflicts instead of forcing churn

## 10. Split and index work units

```bash
node .agents/skills/refactor-opportunities-review/scripts/split-work-units.mjs "$RUN_DIR/remediation-plan.md" "$RUN_DIR/plans"
node .agents/skills/refactor-opportunities-review/scripts/index-work-units.mjs "$RUN_DIR/plans" "$RUN_DIR/plans/index.json"
```

## 11. Final summary

Top-level orchestrator reports:

- review mode
- active lenses
- top merged findings
- deferred conflicts
- work-unit order
- artifact paths

## Ownership split

| Step | Owner |
|---|---|
| setup, mode, dispatch, retries | top-level orchestrator |
| section findings | section subagents |
| validation, compile, parse, split, index | scripts |
| conflict resolution | orchestrator or reconcile subagent |
| remediation plan and final summary | top-level orchestrator |

## Guardrails

- Runtime risk beats cleanup or simplification.
- Over-engineering beats hygiene if cleanup adds abstraction or churn.
- Hygiene beats over-engineering if simplification harms clarity or searchability.
- Script steps must stay deterministic.
- Agent steps must not invent filesystem shape outside declared outputs.
