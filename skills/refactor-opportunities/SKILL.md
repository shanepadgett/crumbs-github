---
name: refactor-opportunities
description: "Repo-health review across hygiene, over-engineering, runtime lenses. Reconciles conflicts, emits ordered work units. Language-adaptive overlays."
---

# Refactor Opportunities

Target dir defaults to cwd.

## Init

Do not jump into full discovery.

Order:

1. Root topology scan
2. Target confirmation
3. Effort confirmation
4. Scoped language discovery
5. Setup + dispatch

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
- Orchestrator stays thin. Read only files needed to route work.
- Orchestrator does not read language overlays unless routing requires it.
- Root scan is cheap. No deep traversal before user confirms target.
- Detect repo shape before asking scope.
- If one target is obvious, propose it and ask for confirmation.
- If many targets exist, show candidates and ask user to choose.
- Effort controls fanout. Do not use fixed max fanout by default.

## 1. Root topology scan

Run deterministic root scan first.

```bash
ROOT_SCAN_DIR=.work/refactor-opportunities/root-scan
node ./scripts/root-topology-scan.mjs \
  . \
  "$ROOT_SCAN_DIR/root-topology.txt"
```

Read `root-topology.txt`. Infer shape:

- single-project root
- single obvious app/service dir
- multi-project repo
- monorepo with `apps/`, `packages/`, `services/`, similar roots

Do not read criteria or overlays yet.

## 2. Confirm target

Use root scan result to ask smart question.

- If one target is obvious, ask: review this target?
- If root files show main app at repo root, include root as target candidate.
- If several targets exist, show short candidate list.
- Ask user to pick one target or whole repo.

Target means actual review scope. Subagents stay inside it. Adjacent issues outside scope may be mentioned only if they materially affect findings inside scope.

## 3. Confirm effort

Ask user for effort after target confirmation.

- `low`: one subagent per active lens
- `medium`: one subagent per active criteria section for active lenses
- `high`: per-section subagents, verification subagents when volume warrants, extra partitioning for very large targets only if needed

Effort controls token spend and fanout.

## 4. Scoped language discovery

Run language detection only inside confirmed target.

Supported detection: TypeScript, JavaScript, Swift, Java, Kotlin, Go, Rust.

```bash
RUN_DIR=.work/refactor-opportunities/$(date -u +%Y-%m-%dT%H-%M-%SZ)
MANIFEST=$RUN_DIR/run-manifest.json
mkdir -p "$RUN_DIR"
TARGET_PATH="<confirmed-target>"
node ./scripts/detect-languages.mjs \
  "$TARGET_PATH" \
  "$RUN_DIR/detected-languages.json"
```

Read result. Use counts to pick active stacks:

- whole repo -> only stacks with meaningful counts
- subdir scope -> only stacks inside target
- one dominant stack -> prefer only that overlay
- mixed stack -> pass only overlays relevant to findings lane
- never send unrelated overlays

Counts help target summary and routing. They do not force overlays.

## 5. Setup

Write `run-manifest.json` with: `runId`, `target`, `mode`, detected languages, active overlays, active lens sections, paths (`findings`, `compiled`, `normalized`, `reconciled`, `plan`, `plans`).

```bash
node ./scripts/init-run.mjs "$MANIFEST"
```

## 6. Dispatch subagents

Subagent count depends on effort.

- `low`
  - `full`: 3 subagents, one per lens
  - single-lens modes: 1 subagent
- `medium`
  - one subagent per active criteria section
  - `full` 17 | `hygiene` 7 | `over-engineering` 5 | `runtime` 5
- `high`
  - same section fanout as `medium`
  - add verification subagents if needed
  - split extra only when target is large enough to justify it

Each subagent gets: target dir, manifest path, assigned lens criteria scope, matching language overlays, one output path, `references/output-schema.md`.

`low` effort lane shape:

- one subagent reads whole active lens criteria file
- one output file per lens
- use when repo is already healthy or user wants cheaper pass

`medium` and `high` lane shape:

- one subagent reads one assigned section from one active lens criteria file
- one output file per section

Prompt:

> Read your assigned lens criteria scope, `references/output-schema.md`, and
> only language overlays assigned to you. Do not read other language overlays.
> Do not read other lens criteria files. Investigate codebase in scope.
> Primary focus is assigned scope, but flag adjacent issues in same lens if you
> spot them. Use assigned language overlays to refine checks, not replace lens
> criteria. Write exactly one findings markdown file to assigned output path.
> File only. No extra report text.

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
| Go | none |
| Rust | none |

## 7. Validate raw findings

```bash
node ./scripts/validate-findings.mjs "$RUN_DIR/findings"
```

Re-dispatch only failed sections.

## 8. Compile per lens

```bash
node ./scripts/compile-lens-report.mjs "$RUN_DIR/findings/<lens>" "$RUN_DIR/compiled/<lens>.md" "<lens>"
```

## 9. Normalize and detect conflicts

```bash
node ./scripts/extract-issues.mjs "$RUN_DIR/normalized/issues.json" "$RUN_DIR/compiled"/*.md
node ./scripts/detect-conflicts.mjs "$RUN_DIR/normalized/issues.json" "$RUN_DIR/normalized/conflict-candidates.json"
```

## 10. Verify findings accuracy

Before reconciliation, orchestrator verifies findings against source code. For each finding:

- Cited file and symbol exist at described location
- Described behavior matches actual code (not guarded, already handled, or outdated)
- Evidence snippet is real, not fabricated

Triage by severity: verify all high findings, spot-check medium, sample low. Drop findings that fail verification — update compiled reports and re-run extract/detect scripts if any dropped.

If volume is high, dispatch verification subagents per lens. Each gets compiled report + source access, returns list of verified/dropped finding IDs with one-line reason per drop.

## 11. Reconcile

Orchestrator reads: compiled lens reports (post-verification), `normalized/issues.json`, `normalized/conflict-candidates.json`, `references/reconcile.md`, `references/output-schema.md`. Write `reconciled-findings.md` in strict schema. Use reconcile subagent only if volume too high for one pass.

## 12. Validate reconciled findings

```bash
node ./scripts/validate-findings.mjs "$RUN_DIR/reconciled-findings.md"
```

## 13. Scaffold and fill remediation plan

```bash
node ./scripts/scaffold-remediation.mjs "$RUN_DIR/remediation-plan.md"
```

Orchestrator fills plan: group into work units, order by deps then severity, cite source finding IDs, explain why units don't conflict, defer unresolved conflicts.

## 14. Split and index

```bash
node ./scripts/split-work-units.mjs "$RUN_DIR/remediation-plan.md" "$RUN_DIR/plans"
node ./scripts/index-work-units.mjs "$RUN_DIR/plans" "$RUN_DIR/plans/index.json"
```

## 15. Final summary

Report: target, effort, review mode, active lenses, active stacks, top merged findings, deferred conflicts, work-unit order, artifact paths.

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
