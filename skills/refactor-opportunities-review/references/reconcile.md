# Reconcile Rules

Use after all section findings are compiled and normalized.

## Goals

- Merge duplicates.
- Catch conflicting advice.
- Build non-fighting work.
- Prefer net repo health over lens purity.

## Priority

1. runtime risk
2. over-engineering simplification pressure
3. hygiene clarity/searchability pressure

## Rules

- Runtime beats cleanup if cleanup adds crash, state, concurrency, lifecycle, or resilience risk.
- Over-engineering beats hygiene if hygiene fix adds abstraction, files, or ceremony with weak payoff.
- Hygiene beats over-engineering if simplification makes code harder to search, trace, or modify.
- Same problem + same remedy -> merge.
- Same problem + opposite remedy -> defer unless one rule above clearly wins.
- If two findings touch same file but different problems, keep separate.
- Prefer local simplification over new framework-level structure.
- Prefer deletion of weak abstractions over renaming weak abstractions.
- Prefer explicit ownership and isolation over clever indirection.

## Canonical merge hints

- Same `File` + same `Symbol`
- Same `File` + similar `Pattern`
- Similar `Suggested Direction`
- One finding says remove layer, another says rename or modernize same layer
- Runtime finding blocks simplification of same code path

## Deferral cases

- Large refactor would mix persistence-contract changes with structure changes
- Simplification would erase a needed seam but evidence is weak
- Hygiene and over-engineering both have valid points with no clear winner
- Runtime evidence is plausible but static evidence is too weak for a forced change

## Output rule

Every reconciled item must say why chosen action wins and why it will not fight adjacent work.
