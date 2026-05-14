# Repo Scaffolding Extension Decisions

## Goal

Reach shared v1 design for a Pi extension that scaffolds repo setup deterministically: supported sources, UI flow, version-selection rules, write behavior, and initial scaffold scope. Stop when enough decisions exist to build first clean slice without guessing.

## Decisions

- Build Pi extension with slash command for repo scaffolding using built-in Pi UI menus.
- Generate deterministic repo setup across projects where Crumbs is available.
- Use templates to define scaffoldable items/configs and version lookup sources, not pinned default versions.
- Require user to choose versions from presented lists.
- Always write exact pinned versions. Never write `latest`, ranges, fuzzy versions, or mutable channel names.
- UI may show channel labels like `Latest stable (x.y.z)` or `Active LTS (x.y.z)`, but final output writes only exact resolved version.
- Do not provide manual version entry escape hatch.
- Lookup failure blocks affected item and reports clear registry/source error.
- v1 version sources:
  - mise registry/tools via `mise ls-remote`.
  - npm packages via npm registry metadata.
  - curated GitHub-backed mise tools via GitHub Releases API.
- GitHub support is curated template only, not arbitrary repo input.
- GitHub backend uses releases/tags, not branches.
- No GitHub CLI dependency.
- Do not install dependencies or run tool installs by default. Writing files/tasks is primary behavior; any install/run step needs explicit confirmation later if added.
- Use hybrid scaffold selection: choose one or more profiles, then toggle included scaffold items a la carte.
- Preview step shows concise file/action list with paths only, not full file contents.
- Never overwrite existing files silently.
- For existing unmanaged files, default to skip; replace only with explicit user choice.
- For known structured files like `package.json` and `mise.toml`, merge additive fields/tasks when safe and summarize path/action.
- Do not build complex three-way merge in v1.
- Tool only creates or overwrites/merges selected scaffold outputs. No future update tracking in v1.
- Do not add managed markers or sidecar scaffold state.
- If target file can be handled structurally, use structured merge/update instead of full replacement.
- Structured merge preserves unrelated content and prompts before overwriting selected existing keys.
- Do not include Prettier in v1.
- JS/TS quality stack choice is either Ox stack (`oxlint` + `oxfmt`) or Biome stack (`@biomejs/biome`), not both at same time.

## Open Questions

- Should Markdown linting be independent profile/item that can combine with either Ox or Biome?
