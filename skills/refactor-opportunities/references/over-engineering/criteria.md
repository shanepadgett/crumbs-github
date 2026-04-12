# Over-Engineering Review Criteria

Judge complexity relative to app scale, team size, and local conventions. Prefer concrete maintenance cost over abstract design arguments. Don't flag simple structure that pays for itself.

Not hygiene review. Don't spend findings on naming, modernization, deduplication, or style unless they directly reflect unnecessary complexity.

Bias toward AI-agent failure modes: one-use abstractions, speculative future-proofing, excess files/helpers/layers, enterprise patterns in simple flows, boilerplate expanding change surface.

## 1. One-Use Abstractions

Abstractions that exist for architectural appearance, not current need.

- Protocols, wrappers, generics with one impl or one call site
- DI layers adding ceremony without testing/swapping/boundary value
- View models, coordinators, managers for tiny features that could stay local
- Type erasure or generic machinery obscuring intent in ordinary flows
- Helper APIs more complex than code they replace, or used once

Severity: high = slows daily dev | medium = friction in key areas, untangleable | low = localized, not worth keeping

## 2. Speculative Extensibility

Code built for hypothetical futures, not present needs.

- Feature flags, plugin points, config surfaces with no active need
- Retry, caching, sync frameworks added before usage justifies
- Repo/service splits for multiple backends when only one exists
- Protocol-first designs justified by hypothetical implementations
- Extensibility hooks making routine code harder to read

Severity: high = materially increases feature cost | medium = noticeable complexity, unclear payoff | low = localized, remove if unused

## 3. Flow Fragmentation

Simple behavior split across too many files/helpers/layers.

- One action requiring hops across wrappers, helpers, adapters, thin services
- Extra files/types for tiny logic that could live together
- Pass-through methods shuttling data between neighboring types
- Refactor-shaped code that moved logic apart without adding clarity
- Control flow harder to trace than behavior justifies

Severity: high = debugging requires needless layers | medium = understandable but slow | low = watch before it grows

## 4. Infrastructure Inflation

System-building exceeding app needs.

- Homegrown frameworks for problems solved by simpler app code
- New modules/packages/deps without clear task need
- Config, plugin, module systems exceeding product needs
- Error/reporting/analytics plumbing more complex than signals provided
- Background processing, sync, caching, persistence built ahead of need

Severity: high = slows shipping/comprehension | medium = overbuilt but not dominant | low = early framework-building signs

## 5. Boilerplate & Change Surface

Patterns making routine work more expensive than needed.

- One change requiring edits across too many files/layers
- Boilerplate repeated per feature with little unique value
- Architectural rituals producing volume over clarity
- Cumbersome scaffolding for small features
- Test/mock setup driven by architecture, not behavior
- Generated-feeling helpers/wrappers/tests mirroring impl over behavior
- New code introducing ceremony not used by adjacent code

Severity: high = iteration substantially slowed | medium = ceremony drags over time | low = local simplification would help
