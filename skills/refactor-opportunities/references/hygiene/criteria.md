# Hygiene Review Criteria

Judge clarity, navigability, change cost relative to repo size and local conventions. Prefer findings that improve search, tracing, comprehension. Use language overlays for language-specific checks.

## 1. Naming & Searchability

- Unique names: grep types, functions, files. Flag names hitting too many files or generic names with weak domain signal.
- Consistent role naming: one convention per role. Flag mixed naming for same concept.
- Stringly constants: flag raw string literals used as keys, event names, routes, identifiers, status markers. Prefer typed constants.
- File-type alignment: one primary public thing per file. File name matches main type.

## 2. Reducing Indirection

- Single-implementation abstractions with no test seam value -> flag for inlining.
- Pass-through layers that mainly forward calls -> flag removal.
- Invisible dependency flow: hidden globals, ambient injection, magic lookup obscuring ownership.
- Definition sprawl: one type spread across many files without payoff.

## 3. Deduplication & Patterns

- Repeated UI/presentation patterns: same structure in 3+ places -> prefer one reusable form.
- Duplicate logic: same transforms, validation, mapping repeated across features.
- Inconsistent error handling: multiple user-facing error patterns without reason.
- Mixed data-flow: old and new state/async models coexisting without migration boundary.

## 4. Language Modernization

Calibrate to detected languages and local conventions.

- Older patterns kept by inertia when clearer modern forms exist locally.
- Obsolete async, state, collection, error patterns when newer forms reduce noise.
- Compatibility shims or transitional patterns no longer serving active targets.
- Use language overlays for exact checks.

## 5. UI / Framework Patterns

- Oversized render/component bodies -> split into subviews or helpers.
- Framework escape hatches erasing types, ownership, or update flow without reason.
- Outdated UI lifecycle/render patterns when newer local patterns are clearer.
- Rigid layout code fighting framework layout systems.
- Use language overlays for exact checks.

## 6. Bounded Features / Module Structure

- Cross-feature imports: features depend on shared infra, not each other (unless design intends it).
- Model ownership: shared models with no clear single owner.
- Feature deletability: removal should fail at clear integration points, not scattered refs.
- Circular dependencies in import/module graphs.

## 7. Agent Ergonomics

- `AGENTS.md`, `CLAUDE.md`: flag missing or stale docs in root and key subdirs.
- Feature structure consistency: flag naming/organization drift across features.
- Build complexity: flag config sprawl, generated glue, excess custom scripts.
- Dead code: `TODO`, `FIXME`, `HACK`, commented-out blocks, unused files, stale imports.
