# TypeScript Overlay

Use with generic lens criteria. Refine findings for TypeScript repos.

## Hygiene

- Flag `any`, weakly typed boundaries, and type aliases that hide intent.
- Flag duplicated DTO, API, and schema types with drift risk.
- Flag generic utility types or mapped-type machinery that hurts readability.
- Flag inconsistent narrowing, error typing, and module boundaries.

## Over-Engineering

- Flag abstraction layers that exist mostly to satisfy types, not product need.
- Flag heavy generic frameworks, wrapper hooks, adapter layers, or type-level
  indirection with one real use.
- Flag config and plugin surfaces added for hypothetical futures.
- Flag file and pattern inflation around otherwise small features.

## Runtime

- Same JavaScript runtime checks apply.
- Also flag type assertions or unsafe casts that hide real runtime risk.
- Flag validation gaps at I/O boundaries where types claim more than runtime
  guarantees.
- Flag stale async state updates and UI churn in typed state layers.
