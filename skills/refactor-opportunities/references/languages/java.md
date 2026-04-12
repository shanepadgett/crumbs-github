# Java Overlay

Use with generic lens criteria. Refine findings for Java repos.

## Hygiene

- Flag overly generic class names and package drift.
- Flag duplicated DTO, mapper, config, or utility patterns with weak value.
- Prefer modern local repo conventions over legacy boilerplate when already in
  active use nearby.
- Flag frameworks or annotation layers that hide simple control flow.

## Over-Engineering

- Flag interface-per-class patterns without multiple implementations or test
  value.
- Flag factory, builder, strategy, or adapter layers added for trivial flows.
- Flag framework-style module splits that increase change surface without clear
  product need.
- Flag enterprise patterns copied into local or low-scale features.

## Runtime

- Flag blocking work on request, UI, or main execution paths.
- Flag thread-pool misuse, unbounded executors, and async work with weak
  ownership.
- Flag resource leaks in streams, files, DB handles, and subscriptions.
- Flag null-sensitive logic, swallowed exceptions, and partial-write risks.
- Flag object churn or repeated parsing in hot paths.
