# Crumbs settings architecture

## Where settings live

- Global: `~/.pi/agent/crumbs.json`
- Project: `<projectRoot>/.pi/crumbs.json`

`projectRoot` = first parent containing `.pi/crumbs.json` or `.git` (fallback: current `cwd`).

## Precedence

`project` > `global` > extension defaults.

Project config is for repo-specific behavior.
Global config is for your personal defaults across repos.

## How settings are handled

- Crumbs-owned settings belong in crumbs config files.
- Extensions read effective settings using precedence above.
- Project settings override global when both define same key.

Do not store crumbs-owned settings in Pi settings files.

## Runtime note

Settings are cached after extension load.
Run `/reload` after editing crumbs config files.

## Troubleshooting

Use `/crumbs doctor` to validate crumbs settings files.
It reports malformed JSON and known-key type mismatches when present.
