# Hygiene Review Criteria

Apply all sections proportionally. Judge clarity, navigability, and change
cost in context of repo size, product shape, and local conventions. Prefer
findings that improve search, tracing, and comprehension. Use language overlays
for exact language or framework-specific checks.

## 1. Naming & Searchability

- Unique names: grep type, function, class, module, and file names. If name
  hits too many files, it is not greppable. Flag generic names with weak
  domain signal.
- Consistent role naming: pick one convention per role. Flag mixed naming for
  same concept.
- Stringly constants: grep raw string literals used as keys, event names,
  routes, identifiers, or status markers. Prefer named constants or typed
  wrappers when local patterns support it.
- File-type alignment: one primary public thing per file unless local repo
  pattern clearly differs. File name should match main type or module.

## 2. Reducing Indirection

- Single-implementation interfaces or abstractions: if exactly one real impl
  and no test seam value, flag for inlining.
- Pass-through layers: coordinators, routers, wrappers, adapters, services, or
  handlers that mainly forward calls. Flag removal.
- Invisible dependency flow: hidden globals, ambient injection, framework
  context, or magic lookup that obscures ownership. Flag when explicit wiring
  would be clearer.
- Definition sprawl: one type or module spread across many files without clear
  payoff.

## 3. Deduplication & Patterns

- Repeated UI or presentation patterns: same structure, same layout, same glue
  code in 3 or more places. Prefer one reusable form if local patterns support
  it.
- Duplicate logic structures: same transforms, validation, mapping, or control
  flow repeated across features.
- Inconsistent error handling: multiple user-facing error patterns without
  clear reason.
- Mixed data-flow patterns: old and new state or async models coexisting in one
  area without migration boundary.

## 4. Language Modernization

Calibrate checks to detected languages and local repo conventions.

- Flag older language or framework patterns kept only by inertia when clearer,
  standard modern forms exist locally.
- Flag obsolete async, state, collection, error, or visibility patterns if
  newer forms reduce noise and improve clarity.
- Flag compatibility shims or transitional patterns that no longer serve active
  targets.
- Use language overlays for exact modernization checks.

## 5. UI / Framework Patterns

- Flag oversized render or component bodies that should split into subviews,
  subcomponents, or helpers.
- Flag framework-specific escape hatches that erase types, ownership, or update
  flow without strong reason.
- Flag outdated UI lifecycle hooks or render patterns when newer repo-local
  patterns are clearer.
- Flag rigid layout or presentation code that fights framework layout systems.
- Use language overlays for exact framework checks.

## 6. Bounded Features / Module Structure

- Cross-feature imports: map feature-folder or module dependencies. Features
  should depend on shared infrastructure, not each other, unless local design
  clearly intends it.
- Model ownership: find shared models or contracts with no clear single owner.
- Feature deletability: removing a feature should produce failures at clear
  integration points, not scattered refs.
- Circular dependencies: trace import or module graphs for cycles.

## 7. Agent Ergonomics

- `AGENTS.md`, `CLAUDE.md`, or equivalent: check root and key subdirectories.
  Flag missing or stale docs.
- Consistent feature structure: compare directory layouts across features. Flag
  naming or organization drift.
- Build complexity: inspect package/build config, custom scripts, generated
  glue, or config sprawl. Prefer simpler build shape.
- Dead code: grep `TODO`, `FIXME`, `HACK`, commented-out blocks, unused files,
  and stale imports. Dead code wastes search budget.
