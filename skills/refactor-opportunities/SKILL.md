---
name: refactor-opportunities
description: "Repo-health review across hygiene, over-engineering, runtime lenses. Reconciles conflicts, emits ordered work units. Language-adaptive overlays."
---

# Refactor Opportunities

Target dir defaults to cwd.

## Modes

- `full`: hygiene + over-engineering + runtime
- `hygiene`
- `over-engineering`
- `runtime`

## Rules

- Say `subagents`. Host decides parallel vs sequential.
- Agents do judgment. Scripts do shape.
- Discovery before dispatch.
- Subagents get only files for their lane.
- Subagents read one section of their lens criteria file (not isolated file). Reason: adjacent-criteria awareness.
- Lens criteria are language-agnostic. Language overlays in `references/languages/`.
- All output must match `references/output-schema.md`.
- No automatic code changes.
- Work units must not fight each other.

## 1. Discovery

```bash
RUN_DIR=.work/refactor-opportunities/$(date -u +%Y-%m-%dT%H-%M-%SZ)
MANIFEST=$RUN_DIR/run-manifest.json
mkdir -p "$RUN_DIR"
node .agents/skills/refactor-opportunities/scripts/detect-languages.mjs \
  . \
  "$RUN_DIR/detected-languages.json"
```

Read result. Pick active stacks:

- Whole repo -> all stacks with meaningful file counts
- Subdir/feature scope -> only stacks present in scope
- One dominant stack -> prefer only that overlay
- Never send unrelated overlays

## 2. Setup

Write `run-manifest.json` with: `runId`, `target`, `mode`, detected languages, active overlays, active lens sections, paths (`findings`, `compiled`, `normalized`, `reconciled`, `plan`, `plans`).

```bash
node .agents/skills/refactor-opportunities/scripts/init-run.mjs "$MANIFEST"
```

## 3. Dispatch subagents

One subagent per active criteria section. Counts: `full` 17 | `hygiene` 7 | `over-engineering` 5 | `runtime` 5.

Each subagent gets: target dir, manifest path, one lens criteria file, one section number, matching language overlays, one output path, `references/output-schema.md`.

Prompt:

> Read section N of your lens criteria file, `references/output-schema.md`,
> and only the language overlays assigned to you. Do not read other language
> overlays. Do not read other lens criteria files. Investigate codebase in
> scope. Primary focus is your section, but flag adjacent issues in same lens
> if you spot them. Use assigned language overlays to refine checks, not
> replace lens criteria. Write exactly one findings markdown file to assigned
> output path. File only. No extra report text.

Overlay rule: orchestrator picks overlays first, subagent receives explicit paths. No overlay match -> lens criteria only.

| Lens | Sections |
|---|---|
| hygiene | `references/hygiene/criteria.md` 1-7 |
| over-engineering | `references/over-engineering/criteria.md` 1-5 |
| runtime | `references/runtime/criteria.md` 1-5 |

| Stack | Overlay |
|---|---|
| Swift / SwiftUI | `references/languages/swift-swiftui.md` |
| Java | `references/languages/java.md` |
| Kotlin | `references/languages/kotlin.md` |
| JavaScript | `references/languages/javascript.md` |
| TypeScript | `references/languages/typescript.md` |

## 4. Validate raw findings

```bash
node .agents/skills/refactor-opportunities/scripts/validate-findings.mjs "$RUN_DIR/findings"
```

Re-dispatch only failed sections.

## 5. Compile per lens

```bash
node .agents/skills/refactor-opportunities/scripts/compile-lens-report.mjs "$RUN_DIR/findings/<lens>" "$RUN_DIR/compiled/<lens>.md" "<lens>"
```

## 6. Normalize and detect conflicts

```bash
node .agents/skills/refactor-opportunities/scripts/extract-issues.mjs "$RUN_DIR/normalized/issues.json" "$RUN_DIR/compiled"/*.md
node .agents/skills/refactor-opportunities/scripts/detect-conflicts.mjs "$RUN_DIR/normalized/issues.json" "$RUN_DIR/normalized/conflict-candidates.json"
```

## 7. Verify findings accuracy

Before reconciliation, orchestrator verifies findings against source code. For each finding:

- Cited file and symbol exist at described location
- Described behavior matches actual code (not guarded, already handled, or outdated)
- Evidence snippet is real, not fabricated

Triage by severity: verify all high findings, spot-check medium, sample low. Drop findings that fail verification — update compiled reports and re-run extract/detect scripts if any dropped.

If volume is high, dispatch verification subagents per lens. Each gets compiled report + source access, returns list of verified/dropped finding IDs with one-line reason per drop.

## 8. Reconcile

Orchestrator reads: compiled lens reports (post-verification), `normalized/issues.json`, `normalized/conflict-candidates.json`, `references/reconcile.md`, `references/output-schema.md`. Write `reconciled-findings.md` in strict schema. Use reconcile subagent only if volume too high for one pass.

## 9. Validate reconciled findings

```bash
node .agents/skills/refactor-opportunities/scripts/validate-findings.mjs "$RUN_DIR/reconciled-findings.md"
```

## 10. Scaffold and fill remediation plan

```bash
node .agents/skills/refactor-opportunities/scripts/scaffold-remediation.mjs "$RUN_DIR/remediation-plan.md"
```

Orchestrator fills plan: group into work units, order by deps then severity, cite source finding IDs, explain why units don't conflict, defer unresolved conflicts.

## 11. Split and index

```bash
node .agents/skills/refactor-opportunities/scripts/split-work-units.mjs "$RUN_DIR/remediation-plan.md" "$RUN_DIR/plans"
node .agents/skills/refactor-opportunities/scripts/index-work-units.mjs "$RUN_DIR/plans" "$RUN_DIR/plans/index.json"
```

## 12. Final summary

Report: review mode, active lenses, top merged findings, deferred conflicts, work-unit order, artifact paths.

## Ownership

| Step | Owner |
|---|---|
| setup, mode, dispatch, retries | orchestrator |
| section findings | subagents |
| validation, compile, parse, split, index | scripts |
| findings verification | orchestrator or verification subagents |
| conflict resolution | orchestrator or reconcile subagent |
| remediation plan and summary | orchestrator |

## Guardrails

- Runtime risk > cleanup or simplification
- Over-engineering > hygiene if cleanup adds abstraction or churn
- Hygiene > over-engineering if simplification harms clarity or searchability
- Scripts stay deterministic
- Agents stay within declared output paths
