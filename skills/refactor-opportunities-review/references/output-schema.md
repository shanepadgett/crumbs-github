# Output Schema

All review files must match this schema. Scripts depend on it.

## 1. Section findings file

One file per section reviewer.

```markdown
# <Lens>: <Section>

## Findings

### <lens>-<section-slug>-<NNN>
- **Severity:** high | medium | low
- **File:** <path>:<line>
- **Symbol:** <type/function/property name or `none`>
- **Pattern:** <criteria check>
- **Finding:** <one line>
- **Evidence:** `<short snippet>`
- **Suggested Direction:** <one line>

## Summary
- High: <N>
- Medium: <N>
- Low: <N>
```

Rules:

- No prose between findings.
- If none, write `None.` under `## Findings`.
- Summary counts must match findings.
- One output file only.

## 2. Reconciled findings file

```markdown
# Reconciled Findings

## Findings

### <canonical-id>
- **Disposition:** merge | keep-separate | defer
- **Primary Lens:** hygiene | over-engineering | runtime | mixed
- **Source Findings:** <id1>, <id2>
- **Severity:** high | medium | low
- **Files:** <path1>, <path2>
- **Symbols:** <symbol1>, <symbol2>
- **Problem:** <one line>
- **Recommended Action:** <one line>
- **Tradeoffs:** <one line>
- **Why This Wins:** <one line>

## Summary
- Merged: <N>
- Kept Separate: <N>
- Deferred: <N>
```

## 3. Remediation plan

```markdown
# Refactor Opportunities — Remediation Plan

Generated: <timestamp>

## Work Units

### WU-001
- **Title:** <short title>
- **Priority:** high | medium | low
- **Depends On:** <WU-000> | none
- **Source Findings:** <canonical-id>, <canonical-id>
- **Primary Lens:** hygiene | over-engineering | runtime | mixed
- **Files:** <path1>, <path2>
- **Goal:** <one line>
- **Non-Goals:** <one line>
- **Risks:** <one line>
- **Why Not Conflicting:** <one line>

#### Steps
1. ...

#### Validation
- ...
```

## 4. Run manifest

```json
{
  "runId": "2026-04-12T10-00-00Z",
  "target": ".",
  "mode": "full",
  "detected": [
    { "stack": "swift-swiftui", "files": 120 }
  ],
  "activeOverlays": [
    "references/languages/swift-swiftui.md"
  ],
  "lenses": {
    "hygiene": ["1-naming", "2-indirection"],
    "over-engineering": ["1-one-use-abstractions"],
    "runtime": ["1-correctness"]
  },
  "paths": {
    "findings": ".work/.../findings",
    "compiled": ".work/.../compiled",
    "normalized": ".work/.../normalized",
    "reconciled": ".work/.../reconciled-findings.md",
    "plan": ".work/.../remediation-plan.md",
    "plans": ".work/.../plans"
  }
}
```
