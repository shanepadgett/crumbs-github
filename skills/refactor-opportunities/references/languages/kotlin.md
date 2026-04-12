# Kotlin Overlay

Use with generic lens criteria. Refine findings for Kotlin repos.

## Hygiene

- Flag generic type names, package drift, and extension sprawl.
- Flag mixed patterns where modern Kotlin or repo-local conventions would be
  clearer.
- Flag UI state patterns that duplicate data or obscure ownership.

## Over-Engineering

- Flag interface-per-class patterns with one implementation.
- Flag extra use-case, repository, mapper, or wrapper layers with weak payoff.
- Flag sealed hierarchies, generic abstractions, or DSLs that exceed current
  need.
- Flag framework-heavy architecture for simple screens or services.

## Runtime

- Flag coroutine misuse: unstructured launches, wrong dispatcher, ignored
  cancellation, stale result overwrites.
- Flag blocking I/O on UI or default coroutine paths.
- Flag lifecycle leaks in flows, collectors, observers, scopes, and jobs.
- Flag null-handling gaps, exception swallowing, and partial persistence
  failures.
- Flag recomposition churn or repeated expensive work in UI-heavy paths.
