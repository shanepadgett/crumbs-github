# JavaScript Overlay

Use with generic lens criteria. Refine findings for JavaScript repos.

## Hygiene

- Flag generic module names, barrel sprawl, and hidden imports.
- Flag duplicated state, util, and glue code across features.
- Flag inconsistent async patterns, error surfaces, and module boundaries.
- Flag framework-specific patterns that obscure ownership or update flow.

## Over-Engineering

- Flag abstraction layers added for tiny flows: services, factories, adapters,
  plugin points, or configuration surfaces.
- Flag over-splitting simple features into too many files or hooks/helpers.
- Flag generated-feeling wrappers, constants, and indirection with weak payoff.
- Flag build or runtime infrastructure that exceeds app needs.

## Runtime

- Flag event-loop blocking work, repeated parsing, and hot-path allocation.
- Flag promise chains or async flows with weak cancellation or stale updates.
- Flag leaked timers, listeners, sockets, observers, and subscriptions.
- Flag undefined/null assumptions, swallowed errors, and partial-write risks.
- Flag rerender churn or repeated derived-state work in UI-heavy apps.
