# Over-Engineered Review Criteria

Apply all sections proportionally. Judge complexity in context of app scale,
team size, likely future change, and local repo conventions. Prefer concrete
maintenance cost over abstract design arguments. Do not flag simple, local
structure that is paying for itself.

This review is not hygiene review. Do not spend findings on naming
consistency, Swift modernization, general deduplication, or style cleanup
unless they directly reflect unnecessary complexity beyond problem solved.

Bias toward common AI-agent failure modes:

- one-use abstractions and wrappers
- speculative future-proofing
- extra files, helpers, and layers beyond task
- enterprise patterns copied into simple flows
- boilerplate that expands change surface without improving outcomes

## 1. One-Use Abstractions

Look for abstractions that exist mostly because they seem architectural rather
than because they solve a current need.

Checks:

- Protocols, wrappers, generic types with one real implementation or one call
  site
- Dependency injection layers that add ceremony without meaningful testing,
  swapping, or boundary value
- View models, coordinators, managers, or services introduced for tiny
  features that could stay local
- Type erasure or generic machinery that obscures intent in ordinary app flows
- Helper APIs more complex than code they replace or used once

Severity guidance:

- High: everyday development is slowed by unnecessary conceptual overhead
- Medium: indirection adds friction in important areas but can be untangled
  incrementally
- Low: localized abstraction likely not worth keeping long-term

## 2. Speculative Extensibility

Look for code built for hypothetical futures instead of present requirements.

Checks:

- Feature flags, plugin points, configuration surfaces, or fallback strategies
  with no active need
- Retry, caching, synchronization, or background-work frameworks added before
  usage justifies them
- Repository or service splits designed for multiple backends or data sources
  when only one exists
- Protocol-first designs justified by hypothetical future implementations
  rather than current pressure
- Defensive extensibility hooks that make routine code harder to read or change

Severity guidance:

- High: speculative architecture materially increases cost of ordinary feature
  work
- Medium: future-proofing adds noticeable complexity with unclear payoff
- Low: localized hooks that should be removed if they stay unused

## 3. Flow Fragmentation

Look for simple behavior split across too many files, helpers, or layers,
especially in ways AI agents often produce.

Checks:

- One simple action requiring multiple hops across wrappers, helpers, adapters,
  and thin services
- Extra files or types created for tiny pieces of logic that could live
  together clearly
- Pass-through methods or forwarding layers that mainly shuttle data between
  neighboring types
- Cleanup or refactor-shaped code that moved logic farther apart without
  making it clearer
- Control flow that is harder to trace than underlying behavior justifies

Severity guidance:

- High: common debugging or feature work requires tracing through needless
  layers
- Medium: flow is understandable but slower than it should be
- Low: local fragmentation that should be watched before it grows

## 4. Infrastructure Inflation

Look for system-building that exceeds app product needs.

Checks:

- Homegrown frameworks or platforms for problems solved by simpler app-level
  code
- New modules, packages, or dependency surfaces added without clear task or
  product need
- Configuration, plugin, or module systems that exceed current product needs
- Error, reporting, or analytics plumbing more complex than signals provided
- Background processing, sync, caching, or persistence subsystems built far
  ahead of proven need

Severity guidance:

- High: infrastructure meaningfully slows shipping, comprehension, or
  refactoring
- Medium: systems are overbuilt but not yet dominating codebase
- Low: early signs of framework-building without concrete demand

## 5. Boilerplate & Change Surface

Look for patterns that make routine feature work or fixes more expensive than
needed.

Checks:

- One small change requiring edits across too many files or layers
- Boilerplate-heavy patterns repeated for every feature with little unique
  value
- Strict architectural rituals that produce code volume more than clarity
- Scaffolding or conventions that are cumbersome for small features
- Test or mock setup complexity driven by architecture rather than behavior
- Generated-feeling helpers, wrappers, comments, or tests that mirror
  implementation more than behavior
- Repo-pattern mismatch where new code introduces extra ceremony not used by
  adjacent code

Severity guidance:

- High: normal iteration is substantially slowed by avoidable process burden
- Medium: repeated ceremony creates noticeable drag over time
- Low: local areas where simplification would improve pace
